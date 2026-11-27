// The rules of draft-ietf-oauth-client-id-metadata-document-03 that need no policy of a server:
// read a client ID, fetch its document, check the document. It knows nothing of the broker.
// docs/cimd.md maps each requirement of the draft to the function and the test that cover it.
import { Clock, Duration, Effect, Option, Result, Schema, SchemaIssue } from "effect";

/** One sentence for each reason why the reader does not give a client ID, a document or a record. */
export const refusalDescriptions = {
  client_id_not_uri: "The client ID is not an absolute URI of RFC 3986.",
  client_id_not_https: "The client ID does not use the https scheme.",
  client_id_no_host: "The client ID has no host.",
  client_id_userinfo: "The client ID has a userinfo component.",
  client_id_root_path: "The client ID has no path other than /.",
  client_id_dot_segment: "The client ID has a single-dot or double-dot path segment.",
  client_id_fragment: "The client ID has a fragment component.",
  client_id_not_canonical:
    "The client ID is not written as the URL parser writes it, so the fetched address would differ.",
  special_use_address:
    "The host of the client ID is a special-use address or a localhost name, which is never fetched.",
  unreachable: "The document could not be fetched: the host gave no answer.",
  timeout: "The document could not be fetched in 5 seconds.",
  unavailable_status: "The host answered 429 or 5xx: the document may be there later.",
  redirect: "The host answered with a redirect, which is never followed.",
  unexpected_status: "The host answered with a status that is not 200.",
  too_large: "The document is larger than 5 KB.",
  not_json: "The document is not UTF-8 JSON.",
  not_object: "The document is not a JSON object.",
  invalid_member: "A member of the document does not have the type of its definition.",
  client_id_mismatch: "The client_id of the document is not the client ID that was fetched.",
  client_secret_not_allowed:
    "The document has a client_secret or a client_secret_expires_at member.",
  shared_secret_method: "The document declares an authentication method that uses a shared secret.",
  auth_methods_empty: "The document's token_endpoint_auth_methods_supported is an empty list.",
  auth_method_not_in_list:
    "The document's token_endpoint_auth_method is not in its token_endpoint_auth_methods_supported.",
  jwks_and_jwks_uri: "The document has both jwks and jwks_uri.",
  private_key_material: "The document's jwks holds private or symmetric key material.",
  software_statement_not_supported:
    "The document has a software_statement, which this reader does not validate.",
  invalid_redirect_uri: "A redirect URI is not an absolute URI, or it has a fragment.",
} as const;

export type RefusalCode = keyof typeof refusalDescriptions;

/** What `fetch` of the platform does with one request. The broker gives its `Fetch` service's. */
export type FetchFunction = (request: Request) => Promise<Response>;

/** The limit of draft section 10.11. */
export const MAX_DOCUMENT_BYTES = 5 * 1024;
const FETCH_TIMEOUT = Duration.seconds(5);
const DEFAULT_FRESHNESS_SECONDS = 60 * 60;
const MAX_FRESHNESS_SECONDS = 24 * 60 * 60;
const MAX_RETRY_AFTER_SECONDS = 24 * 60 * 60;

const refuse = (code: RefusalCode, member?: string) => ({ _tag: "Refused", code, member }) as const;

// Every character that RFC 3986 permits in a URI, with each `%` followed by two hex digits.
const URI_CHARACTERS = /^(?:[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=]|%[0-9A-Fa-f]{2})*$/;
// RFC 3986 appendix B, with a scheme required: scheme, authority, path, query, fragment.
const URI_PARTS = /^([A-Za-z][A-Za-z0-9+.-]*):(?:\/\/([^/?#]*))?([^?#]*)(?:\?([^#]*))?(#.*)?$/;
const DOT_SEGMENT = /^(?:\.|%2e){1,2}$/i;

/**
 * The client ID of draft section 3, read on the raw text before a URL parser can change it. `id` is
 * the raw text and the client's identity: ids compare by string equality, with no normalization.
 * `hostname` (lower case) and `origin` are for a server's policy. A query and a port are permitted by
 * the draft and reported, so a policy can refuse them.
 */
// oxlint-disable-next-line complexity -- one branch per rule of draft section 3, in its order.
export function parseClientId(raw: string) {
  const parts = URI_CHARACTERS.test(raw) ? URI_PARTS.exec(raw) : null;
  if (parts === null) {
    return refuse("client_id_not_uri");
  }
  const [, scheme = "", authority, path = "", query, fragment] = parts;
  if (scheme.toLowerCase() !== "https") {
    return refuse("client_id_not_https");
  }
  if (authority === undefined || authority === "") {
    return refuse("client_id_no_host");
  }
  // An empty userinfo (`https://@host/`) is a userinfo component too.
  if (authority.includes("@")) {
    return refuse("client_id_userinfo");
  }
  if (fragment !== undefined) {
    return refuse("client_id_fragment");
  }
  if (path === "" || path === "/") {
    return refuse("client_id_root_path");
  }
  if (path.split("/").some((segment) => DOT_SEGMENT.test(segment))) {
    return refuse("client_id_dot_segment");
  }
  // RFC 3986 permits `[` and `]` only around an IP literal host.
  if (/[[\]]/.test(path + (query ?? ""))) {
    return refuse("client_id_not_uri");
  }

  const [, host = "", port] = /^(\[[^\]]*\]|[^:]*)(?::(.*))?$/.exec(authority) ?? [];
  const url = URL.parse(raw);
  if (url === null || url.hostname === "") {
    return refuse("client_id_not_uri");
  }
  // The parser lowercases the scheme and the host and drops the port 443: the request stays the
  // same. Any other change (an IPv4 shorthand, a decoded host, an encoded query character, an
  // empty port) means that the address fetched is not the address named.
  const expected = `https://${host.toLowerCase()}${port === undefined || port === "443" ? "" : `:${port}`}${path}${query === undefined ? "" : `?${query}`}`;
  if (url.href !== expected) {
    return refuse("client_id_not_canonical");
  }

  return {
    _tag: "ClientId",
    id: raw,
    hostname: url.hostname,
    origin: url.origin,
    hasQuery: query !== undefined,
    hasExplicitPort: port !== undefined,
  } as const;
}

export type ClientId = Extract<ReturnType<typeof parseClientId>, { _tag: "ClientId" }>;

/** Digits as a number of seconds; a number too large to read is the largest safe integer. */
const delta = (digits: string) => Math.min(Number(digits), Number.MAX_SAFE_INTEGER);

/**
 * The time (epoch milliseconds) until which an answer is fresh, from its `Cache-Control` and `Age`
 * (RFC 9111): `no-store` and `no-cache` give `now`; `max-age` less the age, at most 24 hours; no
 * directive gives 1 hour. A `max-age` that is not a number gives `now`, as RFC 9111 section 4.2.1
 * permits for a value that cannot be read. `Expires` is not read (draft section 6.2).
 */
export function freshUntil(headers: Headers, now: number) {
  const directives = (headers.get("cache-control") ?? "")
    .split(",")
    .map((directive) => directive.trim().toLowerCase())
    .filter((directive) => directive !== "");
  if (directives.some((d) => d === "no-store" || d === "no-cache" || d.startsWith("no-cache="))) {
    return now;
  }
  const maxAge = directives.find((d) => d.startsWith("max-age="))?.slice("max-age=".length);
  if (maxAge === undefined) {
    return now + DEFAULT_FRESHNESS_SECONDS * 1000;
  }
  const seconds = /^"?(\d+)"?$/.exec(maxAge)?.[1];
  const age = /^\d+$/.test(headers.get("age") ?? "") ? delta(headers.get("age") ?? "") : 0;
  return seconds === undefined
    ? now
    : now + Math.max(0, Math.min(delta(seconds) - age, MAX_FRESHNESS_SECONDS)) * 1000;
}

// The IPv4 blocks of the IANA special-purpose registry (RFC 6890 and its updates), and multicast.
const SPECIAL_IPV4: ReadonlyArray<readonly [string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.31.196.0", 24],
  ["192.52.193.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["192.175.48.0", 24],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

const ipv4Number = (address: string) =>
  address.split(".").reduce((value, octet) => value * 256 + Number(octet), 0);

/** The 16-bit groups of an IPv6 address as the URL parser writes it: hex groups, at most one `::`. */
function ipv6Groups(address: string) {
  const [head = "", tail] = address.split("::");
  const left = head === "" ? [] : head.split(":");
  const right = tail === undefined || tail === "" ? [] : tail.split(":");
  const missing = tail === undefined ? 0 : Math.max(0, 8 - left.length - right.length);
  const zeros = Array<string>(missing).fill("0");
  return [...left, ...zeros, ...right].map((group) => Number.parseInt(group, 16));
}

/**
 * A host (as the URL parser writes it) that draft section 10.7 never lets a server fetch, when the
 * host itself shows it: a special-use IP address, or a localhost name (RFC 6761). What a DNS name
 * resolves to is the platform's part.
 */
function isSpecialUseHost(written: string) {
  // A name with one dot at the end is the same name (RFC 1034 section 3.1).
  const host = written.endsWith(".") ? written.slice(0, -1) : written;
  if (host === "localhost" || host.endsWith(".localhost")) {
    return true;
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    const address = ipv4Number(host);
    return SPECIAL_IPV4.some(([block, bits]) => {
      const size = 2 ** (32 - bits);
      return Math.floor(address / size) === Math.floor(ipv4Number(block) / size);
    });
  }
  if (host.startsWith("[")) {
    const [first = 0, second = 0] = ipv6Groups(host.slice(1, -1));
    // Only global unicast (2000::/3) is public, less 2001::/23, 2001:db8::/32, 2002::/16 and
    // 3fff::/20 of the special-purpose registry.
    return (
      (first & 0xe000) !== 0x2000 ||
      (first === 0x2001 && (second < 0x200 || second === 0x0db8)) ||
      first === 0x2002 ||
      (first === 0x3fff && second < 0x1000)
    );
  }
  return false;
}

/** The body as bytes, or null when it is larger than `MAX_DOCUMENT_BYTES`. It reads no further. */
async function readLimited(body: ReadableStream<Uint8Array> | null) {
  if (body === null) {
    return new Uint8Array();
  }
  const reader = body.getReader();
  const bytes = new Uint8Array(MAX_DOCUMENT_BYTES);
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      return bytes.subarray(0, size);
    }
    if (size + value.byteLength > MAX_DOCUMENT_BYTES) {
      await reader.cancel();
      return null;
    }
    bytes.set(value, size);
    size += value.byteLength;
  }
}

/** One GET of the id with only an Accept header (draft sections 6 and 11.1), and its body if 200. */
async function get(fetch: FetchFunction, id: string, signal: AbortSignal) {
  const response = await fetch(
    new Request(id, { headers: { Accept: "application/json" }, redirect: "manual", signal }),
  );
  if (
    response.redirected ||
    response.status !== 200 ||
    Number(response.headers.get("content-length")) > MAX_DOCUMENT_BYTES
  ) {
    await response.body?.cancel();
    return { response, body: null };
  }
  return { response, body: await readLimited(response.body) };
}

/** Seconds from `Retry-After` (RFC 9110 section 10.2.3), at most 24 hours: delay-seconds or a date. */
function retryAfter(headers: Headers, now: number) {
  const value = headers.get("retry-after");
  if (value === null) {
    return undefined;
  }
  if (/^\d+$/.test(value)) {
    return Math.min(Number(value), MAX_RETRY_AFTER_SECONDS);
  }
  const date = Date.parse(value);
  return Number.isNaN(date)
    ? undefined
    : Math.max(0, Math.min(Math.ceil((date - now) / 1000), MAX_RETRY_AFTER_SECONDS));
}

const decodeJson = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Unknown));
const isJsonObject = Schema.is(Schema.Record(Schema.String, Schema.Unknown));
// A byte order mark is dropped, as RFC 8259 section 8.1 permits.
const utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false });

/**
 * One fetch of the document at `clientId.id` (draft section 6): no redirect followed, 5 seconds for
 * the whole request with its body, at most 5 KB read. `fetch` is the platform's: the request carries
 * `redirect: "manual"`, and an answer that a fetch reached by a redirect anyway is refused, so a
 * platform that ignores it must be given a function that does not follow. The result is a
 * `Document` (a JSON object, and the time until which it is fresh), a
 * `Transient` failure (draft section 6.1: the trust of a cached document stays), or a `Terminal`
 * one. Nothing of a failed answer is kept.
 */
export const fetchDocument = Effect.fnUntraced(function* (
  clientId: ClientId,
  fetch: FetchFunction,
) {
  if (isSpecialUseHost(clientId.hostname)) {
    return { _tag: "Terminal", code: "special_use_address", status: undefined } as const;
  }

  const answer = yield* Effect.tryPromise((signal) => get(fetch, clientId.id, signal)).pipe(
    Effect.timeoutOption(FETCH_TIMEOUT),
    Effect.result,
  );
  const now = yield* Clock.currentTimeMillis;
  if (Result.isFailure(answer)) {
    return {
      _tag: "Transient",
      code: "unreachable",
      status: undefined,
      retryAfter: undefined,
    } as const;
  }
  if (Option.isNone(answer.success)) {
    return {
      _tag: "Transient",
      code: "timeout",
      status: undefined,
      retryAfter: undefined,
    } as const;
  }

  const { response, body } = answer.success.value;
  const status = response.status;
  // A fetch function that followed a redirect anyway.
  if (response.redirected) {
    return { _tag: "Terminal", code: "redirect", status } as const;
  }
  if (status === 429 || status >= 500) {
    return {
      _tag: "Transient",
      code: "unavailable_status",
      status,
      retryAfter: retryAfter(response.headers, now),
    } as const;
  }
  if (status !== 200) {
    return {
      _tag: "Terminal",
      code: status >= 300 && status < 400 ? "redirect" : "unexpected_status",
      status,
    } as const;
  }
  if (body === null) {
    return { _tag: "Terminal", code: "too_large", status } as const;
  }
  let text;
  try {
    text = utf8.decode(body);
  } catch {
    return { _tag: "Terminal", code: "not_json", status } as const;
  }
  const json = decodeJson(text);
  if (Option.isNone(json)) {
    return { _tag: "Terminal", code: "not_json", status } as const;
  }
  if (!isJsonObject(json.value)) {
    return { _tag: "Terminal", code: "not_object", status } as const;
  }
  return {
    _tag: "Document",
    json: json.value,
    freshUntil: freshUntil(response.headers, now),
  } as const;
});

export type FetchResult = Effect.Success<ReturnType<typeof fetchDocument>>;

/** A JWK (RFC 7517): `kty` is required; every other member is kept as written. */
const Jwk = Schema.StructWithRest(Schema.Struct({ kty: Schema.String }), [
  Schema.Record(Schema.String, Schema.Unknown),
]);

/**
 * The members of a document that the reader reads, with their types of RFC 7591 section 2 and
 * OpenID Connect RP Metadata Choices. Other members are ignored. The three of `Schema.Unknown` are
 * refused when present, whatever their value.
 */
const Document = Schema.Struct({
  client_id: Schema.String,
  redirect_uris: Schema.optionalKey(Schema.Array(Schema.String)),
  token_endpoint_auth_method: Schema.optionalKey(Schema.String),
  token_endpoint_auth_methods_supported: Schema.optionalKey(Schema.Array(Schema.String)),
  grant_types: Schema.optionalKey(Schema.Array(Schema.String)),
  response_types: Schema.optionalKey(Schema.Array(Schema.String)),
  jwks: Schema.optionalKey(Schema.Struct({ keys: Schema.Array(Jwk) })),
  jwks_uri: Schema.optionalKey(Schema.String),
  client_name: Schema.optionalKey(Schema.String),
  client_uri: Schema.optionalKey(Schema.String),
  logo_uri: Schema.optionalKey(Schema.String),
  policy_uri: Schema.optionalKey(Schema.String),
  tos_uri: Schema.optionalKey(Schema.String),
  client_secret: Schema.optionalKey(Schema.Unknown),
  client_secret_expires_at: Schema.optionalKey(Schema.Unknown),
  software_statement: Schema.optionalKey(Schema.Unknown),
});

const decodeDocument = Schema.decodeUnknownResult(Document);
const formatIssue = SchemaIssue.makeFormatterStandardSchemaV1();

/** The methods of the IANA registry that use a shared symmetric secret (draft section 4.1). */
const SHARED_SECRET_METHODS = new Set([
  "client_secret_post",
  "client_secret_basic",
  "client_secret_jwt",
]);

/** The private members of every key type of the IANA JWK registry; `k` is a symmetric key. */
const PRIVATE_JWK_MEMBERS = ["d", "p", "q", "dp", "dq", "qi", "oth", "k", "priv"];

/**
 * `https`: an https URI on a DNS name. `loopback`: http or https on 127.0.0.0/8, `[::1]` or a
 * localhost name, where draft section 4.2 lets the port vary. `other`: any other scheme or host.
 */
function redirectKind(uri: string) {
  const url = /^https?:/i.test(uri) ? URL.parse(uri) : null;
  if (url === null) {
    return "other";
  }
  const host = url.hostname;
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "[::1]" ||
    /^127\.\d+\.\d+\.\d+$/.test(host)
  ) {
    return "loopback";
  }
  return url.protocol === "https:" && !host.startsWith("[") && !/^\d+\.\d+\.\d+\.\d+$/.test(host)
    ? "https"
    : "other";
}

/**
 * The rules of draft sections 4 to 6 that need no policy, on a fetched JSON value. The record keeps
 * all that the document declares, so a server takes the part that it supports: every declared
 * authentication method (`none` when neither member is present, draft section 5), the keys or
 * the key address (never fetched here), the grant and response types (the defaults of RFC 7591
 * section 2 when absent), each redirect URI as written with its kind, and the members that the
 * client asserts about itself, which nothing has verified.
 */
// oxlint-disable-next-line complexity -- one branch per rule of draft sections 4 to 6.
export function checkDocument(id: string, json: unknown) {
  if (!isJsonObject(json)) {
    return refuse("not_object");
  }
  const decoded = decodeDocument(json);
  if (Result.isFailure(decoded)) {
    const member = formatIssue(decoded.failure.issue).issues[0]?.path?.[0];
    return refuse("invalid_member", typeof member === "string" ? member : undefined);
  }
  const document = decoded.success;

  if (document.client_id !== id) {
    return refuse("client_id_mismatch");
  }
  if (document.client_secret !== undefined || document.client_secret_expires_at !== undefined) {
    return refuse("client_secret_not_allowed");
  }
  if (document.software_statement !== undefined) {
    return refuse("software_statement_not_supported");
  }

  const plural = document.token_endpoint_auth_methods_supported;
  const singular = document.token_endpoint_auth_method;
  const declared = singular === undefined ? (plural ?? []) : [...(plural ?? []), singular];
  if (declared.some((method) => SHARED_SECRET_METHODS.has(method))) {
    return refuse("shared_secret_method");
  }
  if (plural?.length === 0) {
    return refuse("auth_methods_empty");
  }
  if (plural !== undefined && singular !== undefined && !plural.includes(singular)) {
    return refuse("auth_method_not_in_list");
  }

  if (document.jwks !== undefined && document.jwks_uri !== undefined) {
    return refuse("jwks_and_jwks_uri");
  }
  if (
    document.jwks?.keys.some(
      (key) => key.kty === "oct" || PRIVATE_JWK_MEMBERS.some((name) => key[name] !== undefined),
    )
  ) {
    return refuse("private_key_material");
  }

  const redirectUris = document.redirect_uris ?? [];
  if (
    redirectUris.some(
      (uri) => uri.includes("#") || !URI_CHARACTERS.test(uri) || !URI_PARTS.test(uri),
    )
  ) {
    return refuse("invalid_redirect_uri");
  }

  return {
    _tag: "Checked",
    id,
    redirectUris: redirectUris.map((uri) => ({ uri, kind: redirectKind(uri) })),
    authMethods: plural ?? [singular ?? "none"],
    keys:
      document.jwks !== undefined
        ? ({ kind: "jwks", jwks: document.jwks } as const)
        : document.jwks_uri !== undefined
          ? ({ kind: "jwks_uri", uri: document.jwks_uri } as const)
          : undefined,
    grantTypes: document.grant_types ?? ["authorization_code"],
    responseTypes: document.response_types ?? ["code"],
    selfAsserted: {
      clientName: document.client_name,
      clientUri: document.client_uri,
      logoUri: document.logo_uri,
      policyUri: document.policy_uri,
      tosUri: document.tos_uri,
    },
  } as const;
}

export type CheckedDocument = Extract<ReturnType<typeof checkDocument>, { _tag: "Checked" }>;
