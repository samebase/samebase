// What every registration layer shares of RFC 7591 (`POST /register`) and RFC 7592 (the client
// configuration endpoint `/register/<client>`): the request body, the new client's credentials, the
// answers, and the target of a management request. A layer adds its proof and its card.
import { Effect, Schema } from "effect";
import { SIGNING_ALGORITHM } from "../core/keys.ts";
import {
  LOOPBACK_HOSTS,
  parseRedirectUri,
  readBearerToken,
  type TokenEndpointAuthMethod,
} from "../core/protocol.ts";
import { invalidToken, json, noToken } from "../core/responses.ts";
import { randomToken, sha256HexEffect } from "../core/subject.ts";

/** The return addresses of one client: a handler per flow of the app, with room to spare. */
const MAX_REDIRECT_URIS = 8;
/** Stored on every client row. A commit hash or a version fits many times. */
const MAX_SOFTWARE_VERSION_LENGTH = 256;
/** The app's name is stored on every client. */
export const MAX_APP_LENGTH = 64;

// Each schema below accepts unknown members: a client and a host send more than these name. They
// narrow the value that was read (`Schema.is`), so the members that they do not name stay on it.

/**
 * The client metadata of a registration request that a broker reads (RFC 7591 section 2), but
 * `redirect_uris`, which has its own error. Any other member is ignored, as that section requires,
 * but the ones in `UNSUPPORTED_MEMBERS`. A layer reads the members that it needs: one body serves
 * every layer.
 */
const RequestBody = Schema.Struct({
  /** The app's name. Absent: `app`. The same for each deployment of the app. */
  software_id: Schema.optionalKey(Schema.String),
  /** Absent: `unknown`. */
  software_version: Schema.optionalKey(Schema.String),
  /** The deployment's name, such as its stage. */
  client_name: Schema.optionalKey(Schema.String),
  /** The broker's own member: the kind of deployment, which a layer may hold to its own rule. */
  deployment_type: Schema.optionalKey(Schema.Literals(["production", "preview", "development"])),
  /**
   * The enrollment, the broker's own member: at least one connector name. Duplicates collapse. Absent:
   * every connector that this registration may enroll in.
   */
  connectors: Schema.optionalKey(Schema.Array(Schema.String)),
  /** Absent: `client_secret_basic`, the default of RFC 7591 section 2. */
  token_endpoint_auth_method: Schema.optionalKey(
    Schema.Literals(["client_secret_post", "client_secret_basic"]),
  ),
  /** The broker answers its own values: a client asks for nothing here that the broker does not have. */
  grant_types: Schema.optionalKey(
    Schema.Array(Schema.Literals(["authorization_code", "refresh_token"])),
  ),
  response_types: Schema.optionalKey(Schema.Array(Schema.Literal("code"))),
  // The one value of each that the broker has (OpenID Connect Registration section 2).
  application_type: Schema.optionalKey(Schema.Literal("web")),
  subject_type: Schema.optionalKey(Schema.Literal("public")),
  id_token_signed_response_alg: Schema.optionalKey(Schema.Literal("RS256")),
});

/** The return addresses: one to `MAX_REDIRECT_URIS`. Duplicates collapse; the order does not matter. */
const RedirectUris = Schema.Struct({ redirect_uris: Schema.Array(Schema.String) });

/**
 * Members of OpenID Connect Registration that the broker cannot honor, so a request with one is refused
 * rather than given a client that ignores it. Any member with `_encrypted_response_` or
 * `_encryption_` in its name is one too.
 */
const UNSUPPORTED_MEMBERS = new Set([
  "sector_identifier_uri",
  "userinfo_signed_response_alg",
  "request_object_signing_alg",
]);

/** A registration error of RFC 7591 section 3.2.2. `reason` and `allowed` are the broker's own members. */
export function invalid(
  error: "invalid_redirect_uri" | "invalid_client_metadata",
  description: string,
  more: { reason?: string; allowed?: readonly string[] } = {},
): Response {
  return json({ error, error_description: description, ...more }, 400);
}

/** The connectors are not ones this registration may enroll in, with the names that are. */
export const invalidConnectors = (allowed: readonly string[]) =>
  invalid(
    "invalid_client_metadata",
    "The connectors are not ones that this registration may enroll in.",
    { reason: "invalid_connectors", allowed },
  );

/**
 * The answer to a good token whose holder may not do this (RFC 6750 section 3.1). `reason` is the
 * broker's own member: the rule that refused the request.
 */
export const insufficientScope = (description: string, more: { reason?: string } = {}) =>
  json({ error: "insufficient_scope", error_description: description, ...more }, 403, {
    "WWW-Authenticate": 'Bearer error="insufficient_scope"',
  });

/**
 * The return address, if `parseRedirectUri` takes it, with no fragment and no user info, and either
 * https on a DNS name or http on a loopback host. An IP address or `localhost` over https is never
 * one. Any port and any path.
 */
function readRedirectUri(value: string) {
  // An empty fragment parses to an empty hash, which parseRedirectUri allows.
  const url = value.includes("#") ? null : parseRedirectUri(value);
  if (url === null || url.username !== "" || url.password !== "") {
    return null;
  }
  if (url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname)) {
    return { url, loopback: true };
  }
  // The URL parser lowercases the host and writes an IPv4 address in dotted decimal, so a DNS name
  // is the one form whose last label starts with a letter.
  return url.protocol === "https:" &&
    /^(?:[a-z0-9-]+\.)+[a-z][a-z0-9-]*$/.test(url.hostname) &&
    !url.hostname.endsWith(".localhost")
    ? { url, loopback: false }
    : null;
}

const isRequestBody = Schema.is(RequestBody);
const isRedirectUris = Schema.is(RedirectUris);

/**
 * The client metadata of a registration's body, or the answer that refuses it. `redirectUris` are
 * sorted and unique, each parsed, with `origins` the distinct origins of the https ones and
 * `loopback` when any is a loopback address. A layer checks the rest against its proof.
 */
export const readClientMetadata = Effect.fnUntraced(function* (request: Request) {
  const body: unknown = yield* Effect.promise(() => request.json().catch(() => null));
  if (!isRequestBody(body)) {
    return invalid(
      "invalid_client_metadata",
      "The body is not a JSON object of valid client metadata.",
    );
  }
  if (
    Object.keys(body).some(
      (name) =>
        UNSUPPORTED_MEMBERS.has(name) ||
        name.includes("_encrypted_response_") ||
        name.includes("_encryption_"),
    )
  ) {
    return invalid(
      "invalid_client_metadata",
      "The broker supports only web clients with public subjects and RS256, without encryption.",
    );
  }
  const softwareVersion = body.software_version ?? "unknown";
  if (softwareVersion.length === 0 || softwareVersion.length > MAX_SOFTWARE_VERSION_LENGTH) {
    return invalid("invalid_client_metadata", "software_version is 1 to 256 characters.");
  }
  if (!isRedirectUris(body)) {
    return invalid("invalid_redirect_uri", "redirect_uris is a list of 1 to 8 URIs.");
  }
  const redirectUris = [...new Set(body.redirect_uris)].sort();
  if (redirectUris.length === 0 || redirectUris.length > MAX_REDIRECT_URIS) {
    return invalid("invalid_redirect_uri", "redirect_uris is a list of 1 to 8 URIs.");
  }
  const parsed = redirectUris.map(readRedirectUri).filter((redirect) => redirect !== null);
  if (parsed.length !== redirectUris.length) {
    return invalid(
      "invalid_redirect_uri",
      "A redirect URI is https on a DNS name, or http on a loopback host for a development client, with no fragment, no user info, and no authorization response parameter in its query.",
    );
  }
  return {
    softwareId: body.software_id ?? "app",
    softwareVersion,
    clientName: body.client_name,
    deploymentType: body.deployment_type,
    connectors: body.connectors,
    tokenEndpointAuthMethod: body.token_endpoint_auth_method ?? ("client_secret_basic" as const),
    redirectUris,
    origins: [...new Set(parsed.filter((r) => !r.loopback).map((r) => r.url.origin))],
    loopback: parsed.some((redirect) => redirect.loopback),
  };
});

/**
 * The client information response (RFC 7591 section 3.2.1), without what only the first holds.
 * `software_id` names the app, the same for every deployment of it; `client_name` names the
 * deployment. `grant_types` is the broker's own, as discovery's `grant_types_supported`: this package
 * configures no API resource, so a client gets no refresh token (design section 9 item 1).
 * `connectors` is the enrollment, the broker's own field.
 */
export function clientInformation(args: {
  issuer: string;
  clientId: string;
  createdAt: number;
  redirectUris: readonly string[];
  clientName: string;
  softwareId: string;
  softwareVersion: string;
  tokenEndpointAuthMethod: TokenEndpointAuthMethod;
  connectors: readonly string[];
}) {
  return {
    client_id: args.clientId,
    client_id_issued_at: Math.floor(args.createdAt / 1000),
    client_secret_expires_at: 0,
    registration_client_uri: `${args.issuer}/register/${args.clientId}`,
    redirect_uris: args.redirectUris,
    client_name: args.clientName,
    software_id: args.softwareId,
    software_version: args.softwareVersion,
    token_endpoint_auth_method: args.tokenEndpointAuthMethod,
    grant_types: ["authorization_code"],
    response_types: ["code"],
    application_type: "web",
    subject_type: "public",
    id_token_signed_response_alg: SIGNING_ALGORITHM,
    connectors: args.connectors,
  };
}

/**
 * The credentials of a new client. The secret and the registration access token go to the caller
 * once; the store keeps only their hashes.
 */
export const newClientCredentials = Effect.gen(function* () {
  const clientId = `cl_${yield* randomToken(16)}`;
  const clientSecret = yield* randomToken(32);
  const registrationAccessToken = yield* randomToken(32);
  return {
    clientId,
    clientSecret,
    registrationAccessToken,
    secretHash: yield* sha256HexEffect(clientSecret),
    registrationTokenHash: yield* sha256HexEffect(registrationAccessToken),
  };
});

/**
 * The body of a 201 answer (RFC 7591 section 3.2.1): the client's registered metadata, its secret,
 * and its RFC 7592 token, which go to nothing else. `issuer` and `terms` (when the broker has terms) are the broker's own members.
 */
export function newClient(
  broker: { readonly issuer: string; readonly terms: string | undefined },
  credentials: Effect.Success<typeof newClientCredentials>,
  client: Omit<Parameters<typeof clientInformation>[0], "issuer" | "clientId">,
) {
  return {
    ...clientInformation({ ...client, issuer: broker.issuer, clientId: credentials.clientId }),
    client_secret: credentials.clientSecret,
    registration_access_token: credentials.registrationAccessToken,
    issuer: broker.issuer,
    ...(broker.terms === undefined ? {} : { terms: broker.terms }),
  };
}

/**
 * The client id and the token of a request to the client configuration endpoint, or the refusal:
 * `noToken` without a Bearer token, as at `POST /register`, and `invalid_token` without a client
 * id. The client id is the final segment of the path, as it is. The token is the client's own
 * registration access token, compared by its hash with the one on that client's card only.
 */
export const managementRequest = Effect.fnUntraced(function* (request: Request) {
  const token = readBearerToken(request.headers.get("authorization"));
  if (token === null) {
    return noToken("register");
  }
  const clientId = new URL(request.url).pathname.split("/").at(-1) ?? "";
  if (clientId === "") {
    return invalidToken();
  }
  return { clientId, token, registrationTokenHash: yield* sha256HexEffect(token) };
});

/**
 * The answer to an RFC 7592 read. The broker stores only the hash of the registration access token, so
 * the read echoes the token that the request presented (RFC 7592 section 3). It never has the
 * client's secret.
 */
export const readAnswer = (
  information: Parameters<typeof clientInformation>[0],
  registrationAccessToken: string,
) =>
  json({
    ...clientInformation(information),
    registration_access_token: registrationAccessToken,
  });

/** `PUT <prefix>/register/<client>`: a client cannot update itself (RFC 7592 section 2.2). */
export const updateClient = (_request: Request) =>
  Effect.succeed(new Response(null, { status: 405, headers: { Allow: "GET, DELETE" } }));
