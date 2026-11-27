// Properties of the reader over generated input, each stated from draft-ietf-oauth-client-id-
// metadata-document-03 or the README. No expected value comes from the reader itself.
import fc from "fast-check";
import { Effect, Exit } from "effect";
import { TestClock } from "effect/testing";
import { describe, expect, test } from "vite-plus/test";
import {
  checkDocument,
  fetchDocument,
  freshUntil,
  MAX_DOCUMENT_BYTES,
  parseClientId,
  type ClientId,
  type FetchFunction,
} from "./reader.ts";

const T = 1_700_000_000_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const RUNS = { numRuns: 400, seed: 3_1003 };

/** The five parts of a URI text, by the regular expression of RFC 3986 appendix B. */
function uriParts(raw: string) {
  const [, scheme, authority, path = "", query, fragment] =
    /^(?:([^:/?#]+):)?(?:\/\/([^/?#]*))?([^?#]*)(?:\?([^#]*))?(?:#(.*))?$/.exec(raw) ?? [];
  return { scheme, authority, path, query, fragment };
}

/** A path segment after percent-decoding of the dot only, as RFC 3986 section 2.3 permits. */
const decodedDots = (segment: string) => segment.replace(/%2e/gi, ".");

// Client ids built from parts, near and far from valid ones.
const label = fc.stringMatching(/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,6}[a-zA-Z0-9])?$/);
const idHost = fc.oneof(
  { weight: 5, arbitrary: fc.array(label, { minLength: 1, maxLength: 3 }).map((l) => l.join(".")) },
  {
    weight: 2,
    arbitrary: fc.constantFrom(
      "127.0.0.1",
      "127.1",
      "10.0.0.1",
      "192.168.1.1",
      "1.2.3.4",
      "0x7f.1",
      "ex%61mple.com",
      "localhost",
      "a.localhost",
      "[::1]",
      "[2001:db8::1]",
      "[2606:4700::1]",
      "[::ffff:127.0.0.1]",
      "EXAMPLE.com",
      "example.com.",
      "xn--bcher-kva.example",
      "bücher.example",
      "",
      "a_b.example",
      "a b.example",
    ),
  },
);
/** Mostly `usual`, sometimes one of `odd`. */
const mostly = <A>(usual: fc.Arbitrary<A>, ...odd: ReadonlyArray<A>) =>
  fc.oneof({ weight: 14, arbitrary: usual }, { weight: 1, arbitrary: fc.constantFrom(...odd) });
const segment = mostly(
  fc.stringMatching(/^[A-Za-z0-9._~-]{0,6}$/),
  ".",
  "..",
  "%2e",
  "%2E%2e",
  ".%2e",
  "a b",
  "%",
  "%zz",
  "é",
  "\\",
  "[x]",
  "'",
  "%41",
  ";",
  "@",
  ":",
  "|",
  "^",
);
const builtId = fc
  .tuple(
    mostly(fc.constant("https"), "HTTPS", "HtTpS", "http", "ftp"),
    mostly(fc.constant("://"), ":/", ":", ":///"),
    mostly(fc.constant(""), "@", "user@", "u:p@"),
    idHost,
    mostly(fc.constant(""), ":443", ":8443", ":", ":0443", ":65536", ":x"),
    mostly(
      fc.array(segment, { minLength: 1, maxLength: 4 }).map((s) => `/${s.join("/")}`),
      "",
      "/",
    ),
    fc.option(
      mostly(fc.stringMatching(/^[A-Za-z0-9=&._~-]{0,8}$/), "'", "%", "%zz", "[x]", "a b", "^"),
      { nil: undefined, freq: 3 },
    ),
    mostly(fc.constant(""), "#", "#x"),
  )
  .map(
    ([scheme, separator, userinfo, host, port, path, query, fragment]) =>
      `${scheme}${separator}${userinfo}${host}${port}${path}${query === undefined ? "" : `?${query}`}${fragment}`,
  );
const anyId = fc.oneof(
  { weight: 6, arbitrary: builtId },
  { weight: 1, arbitrary: fc.string() },
  { weight: 1, arbitrary: fc.string({ unit: "binary" }) },
  { weight: 2, arbitrary: fc.webUrl({ withQueryParameters: true, withFragments: true }) },
);

describe("parseClientId: draft section 3", () => {
  test("never throws; an accepted text is an https URI with a host, no user info, no fragment, a path other than / with no dot segment, and a fetch of it requests the host, path and query that it names", () => {
    fc.assert(
      fc.property(anyId, (raw) => {
        const parsed = parseClientId(raw);
        if (parsed._tag !== "ClientId") {
          return;
        }
        const { scheme, authority, path, query, fragment } = uriParts(raw);
        expect(parsed.id).toBe(raw);
        expect(scheme?.toLowerCase()).toBe("https");
        expect(authority).toBeTruthy();
        expect(authority).not.toContain("@");
        expect(fragment).toBeUndefined();
        expect(raw).not.toContain("#");
        expect(path).not.toBe("");
        expect(path).not.toBe("/");
        expect(path.split("/").map(decodedDots)).not.toContain(".");
        expect(path.split("/").map(decodedDots)).not.toContain("..");

        const fetched = new URL(new Request(raw).url);
        const [, host = "", port] = /^(\[[^\]]*\]|[^:]*)(?::(.*))?$/.exec(authority ?? "") ?? [];
        expect(fetched.protocol).toBe("https:");
        expect(fetched.username).toBe("");
        expect(fetched.password).toBe("");
        expect(fetched.hash).toBe("");
        expect(fetched.hostname).toBe(host.toLowerCase());
        expect(fetched.port).toBe(port === undefined || port === "443" ? "" : port);
        expect(fetched.pathname).toBe(path);
        expect(
          new Request(raw).url.endsWith(`${path}${query === undefined ? "" : `?${query}`}`),
        ).toBe(true);
        expect(parsed.hostname).toBe(fetched.hostname);
        expect(parsed.origin).toBe(fetched.origin);
      }),
      RUNS,
    );
  });
});

const VALID_IDS = [
  "https://app.example.com/oauth-client.json",
  "https://Example.com:443/c",
  "https://example.com:8443/c?x=1",
];
const SHARED_SECRET_METHODS = ["client_secret_post", "client_secret_basic", "client_secret_jwt"];
/** The private members of the JWK key types of RFC 7518 section 6, and `oct` keys. */
const PRIVATE_JWK_MEMBERS = ["d", "p", "q", "dp", "dq", "qi", "oth", "k"];

/** Members of a valid document, each present or absent. */
const validMembers = (id: string) =>
  fc
    .record(
      {
        redirect_uris: fc.array(
          fc.constantFrom(
            "https://app.example.com/cb",
            "http://127.0.0.1/cb",
            "com.example.app:/cb",
            "https:app.example.com/cb",
            "https://other.example/cb?code=1",
          ),
          { maxLength: 4 },
        ),
        token_endpoint_auth_method: fc.constantFrom("none", "private_key_jwt"),
        token_endpoint_auth_methods_supported: fc.subarray(
          ["none", "private_key_jwt", "tls_client_auth"],
          {
            minLength: 1,
          },
        ),
        grant_types: fc.subarray(["authorization_code", "refresh_token", "client_credentials"]),
        response_types: fc.subarray(["code", "token"]),
        client_name: fc.string(),
      },
      { requiredKeys: [] },
    )
    .chain((members) =>
      fc
        .oneof(
          fc.constant({}),
          fc.record({
            jwks: fc.record({
              keys: fc.array(
                fc.record({ kty: fc.constantFrom("RSA", "EC"), n: fc.constant("AQAB") }),
                {
                  maxLength: 2,
                },
              ),
            }),
          }),
          fc.constant({ jwks_uri: "https://app.example.com/jwks.json" }),
        )
        .map((keys) => ({ client_id: id, ...members, ...keys })),
    );

/** Changes that each break one rule, or look as if they do. */
const faults = (id: string) =>
  fc.constantFrom<Record<string, fc.JsonValue>>(
    { client_id: `${id}/` },
    { client_id: id.toUpperCase() },
    { client_id: ` ${id}` },
    { client_id: 1 },
    { client_id: null },
    { redirect_uris: ["https://app.example.com/cb#x"] },
    { redirect_uris: ["https://app.example.com/cb#"] },
    { redirect_uris: ["not a uri"] },
    { redirect_uris: "https://app.example.com/cb" },
    { token_endpoint_auth_method: "client_secret_basic" },
    { token_endpoint_auth_method: "client_secret_jwt" },
    { token_endpoint_auth_method: 3 },
    { token_endpoint_auth_methods_supported: ["none", "client_secret_post"] },
    { token_endpoint_auth_methods_supported: [] },
    { token_endpoint_auth_methods_supported: "none" },
    { token_endpoint_auth_methods_supported: [""] },
    { jwks: { keys: [{ kty: "RSA", n: "AQAB", d: "secret" }] } },
    { jwks: { keys: [{ kty: "oct", k: "secret" }] } },
    { jwks: { keys: [{ kty: "EC", x: "a", y: "b", d: "secret" }] } },
    { jwks: { keys: [{ kty: "RSA", p: "a", q: "b", dp: "c", dq: "d", qi: "e" }] } },
    { jwks: {} },
    { jwks: { keys: [{ n: "AQAB" }] } },
    { jwks_uri: "https://app.example.com/jwks.json", jwks: { keys: [] } },
    { client_secret: "s" },
    { client_secret: null },
    { client_secret: "" },
    { client_secret_expires_at: 0 },
    { software_statement: "eyJ.x.y" },
    { client_name: 5 },
  );

/** A document near a valid one: a valid one, with up to two faults and a few members of no meaning. */
const nearDocument = (id: string) =>
  fc
    .tuple(
      validMembers(id),
      fc.oneof(
        { weight: 2, arbitrary: fc.constant([]) },
        { weight: 3, arbitrary: fc.array(faults(id), { minLength: 1, maxLength: 2 }) },
      ),
      fc.dictionary(fc.string({ maxLength: 6 }), fc.jsonValue({ maxDepth: 2 }), { maxKeys: 2 }),
    )
    .map(([valid, broken, extra]) =>
      broken.reduce<Record<string, unknown>>((doc, fault) => ({ ...doc, ...fault }), {
        ...extra,
        ...valid,
      }),
    );

/** The member `name` of a JSON value, when it is an object that has it as its own member. */
function member(json: unknown, name: string): unknown {
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    return undefined;
  }
  return Object.entries(json).find(([key]) => key === name)?.[1];
}
const has = (json: unknown, name: string) => member(json, name) !== undefined;
const items = (value: unknown): ReadonlyArray<unknown> => (Array.isArray(value) ? value : []);
const strings = (value: unknown) => items(value).filter((item) => typeof item === "string");

describe("checkDocument: draft sections 4, 4.1 and 5", () => {
  test("never throws; an accepted document has client_id equal to the id, no client secret, no software_statement, no shared-secret method, not both jwks and jwks_uri, no private key, and redirect URIs as written with no fragment", () => {
    const input = fc.constantFrom(...VALID_IDS).chain((id) =>
      fc.tuple(
        fc.constant(id),
        fc.oneof(
          { weight: 6, arbitrary: nearDocument(id) },
          { weight: 2, arbitrary: fc.jsonValue() },
          {
            weight: 1,
            arbitrary: fc.constant<unknown>(JSON.parse(`{"__proto__":{"client_id":"${id}"}}`)),
          },
        ),
      ),
    );
    fc.assert(
      fc.property(input, ([id, json]) => {
        const checked = checkDocument(id, json);
        if (checked._tag !== "Checked") {
          return;
        }
        expect(member(json, "client_id")).toBe(id);
        expect(checked.id).toBe(id);
        for (const name of ["client_secret", "client_secret_expires_at", "software_statement"]) {
          expect(has(json, name)).toBe(false);
        }
        const plural = member(json, "token_endpoint_auth_methods_supported");
        const singular = member(json, "token_endpoint_auth_method");
        for (const method of [...checked.authMethods, ...strings(plural), String(singular)]) {
          expect(SHARED_SECRET_METHODS).not.toContain(method);
        }
        if (plural !== undefined && singular !== undefined) {
          expect(strings(plural)).toContain(singular);
        }
        if (plural === undefined && singular === undefined) {
          expect(checked.authMethods).toEqual(["none"]);
        }
        expect(has(json, "jwks") && has(json, "jwks_uri")).toBe(false);
        for (const key of items(member(member(json, "jwks"), "keys"))) {
          expect(member(key, "kty")).not.toBe("oct");
          for (const name of PRIVATE_JWK_MEMBERS) {
            expect(has(key, name)).toBe(false);
          }
        }
        const declared = strings(member(json, "redirect_uris"));
        for (const { uri } of checked.redirectUris) {
          expect(declared).toContain(uri);
          expect(uri).not.toContain("#");
        }
      }),
      RUNS,
    );
  });
});

/** Runs `effect` on a test clock that reads `T`, to its exit. */
const runExit = <A>(effect: Effect.Effect<A>) =>
  Effect.runPromiseExit(
    TestClock.setTime(T).pipe(Effect.andThen(effect), Effect.provide(TestClock.layer())),
  );

function accepted(raw: string): ClientId {
  const parsed = parseClientId(raw);
  if (parsed._tag !== "ClientId") {
    throw new Error(`${raw} is refused: ${parsed.code}`);
  }
  return parsed;
}

/** Ids that the reader accepts, each marked when its host is a literal special-use address (RFC 6890, RFC 6761). */
const FETCHED_IDS = [
  { raw: "https://app.example.com/oauth-client.json", special: false },
  { raw: "https://Example.com:443/c", special: false },
  { raw: "https://example.com:8443/c?x=1", special: false },
  { raw: "https://[2606:4700::1]/c", special: false },
  { raw: "https://1.2.3.4/c", special: false },
  { raw: "https://127.0.0.1/c", special: true },
  { raw: "https://localhost/c", special: true },
  { raw: "https://a.LOCALHOST/c", special: true },
  { raw: "https://localhost./c", special: true },
  { raw: "https://sub.localhost./c", special: true },
  { raw: "https://10.1.2.3/c", special: true },
  { raw: "https://172.16.0.1/c", special: true },
  { raw: "https://192.168.0.1/c", special: true },
  { raw: "https://169.254.169.254/latest", special: true },
  { raw: "https://100.64.0.1/c", special: true },
  { raw: "https://0.0.0.0/c", special: true },
  { raw: "https://[::1]/c", special: true },
  { raw: "https://[fe80::1]/c", special: true },
  { raw: "https://[fc00::1]/c", special: true },
  { raw: "https://[::ffff:7f00:1]/c", special: true },
].map(({ raw, special }) => ({ id: accepted(raw), special }));
const fetchedId = fc.oneof(
  { weight: 4, arbitrary: fc.constantFrom(...FETCHED_IDS.filter(({ special }) => !special)) },
  { weight: 1, arbitrary: fc.constantFrom(...FETCHED_IDS.filter(({ special }) => special)) },
);

const NULL_BODY_STATUSES = [204, 205, 304];
const encoder = new TextEncoder();
const objectText = (members: Record<string, fc.JsonValue>, pad: number, bom: boolean) =>
  encoder.encode(`${bom ? "﻿" : ""}${JSON.stringify({ ...members, pad: "x".repeat(pad) })}`);
const members = fc.dictionary(fc.string({ maxLength: 5 }), fc.jsonValue({ maxDepth: 2 }), {
  maxKeys: 4,
});
const body = fc
  .oneof(
    { weight: 3, arbitrary: fc.tuple(members, fc.nat({ max: 6000 }), fc.boolean()) },
    {
      weight: 2,
      arbitrary: fc.tuple(
        fc.constant({}),
        fc.integer({ min: MAX_DOCUMENT_BYTES - 40, max: MAX_DOCUMENT_BYTES + 10 }),
        fc.boolean(),
      ),
    },
  )
  .map(([object, pad, bom]) => objectText(object, pad, bom));
const anyBody = fc.oneof(
  { weight: 4, arbitrary: body },
  { weight: 2, arbitrary: fc.jsonValue().map((value) => encoder.encode(JSON.stringify(value))) },
  { weight: 2, arbitrary: fc.uint8Array({ maxLength: 6000 }) },
  { weight: 1, arbitrary: fc.constant(null) },
);
/** A number too large to read: from 310 digits, `Number` gives Infinity. */
const longDigits = fc
  .tuple(
    fc.constantFrom(..."123456789"),
    fc.string({ unit: fc.constantFrom(..."0123456789"), minLength: 309, maxLength: 400 }),
  )
  .map(([head, tail]) => head + tail);
const headerValue = fc.oneof(
  fc.nat({ max: 99_999 }).map(String),
  fc.constantFrom("no-store", "max-age=60", "max-age=99999999", "-1", "abc", ""),
  fc.stringMatching(/^[ -~]{0,16}$/),
);
const headerList = fc.array(
  fc.tuple(
    fc.constantFrom(
      "content-length",
      "cache-control",
      "age",
      "retry-after",
      "content-type",
      "expires",
    ),
    headerValue,
  ),
  { maxLength: 4 },
);
/** What the fetch function does: reject, throw, or answer with a body read in chunks. */
type Answer =
  | { readonly kind: "reject" }
  | { readonly kind: "throw" }
  | {
      readonly kind: "response";
      readonly status: number;
      readonly headers: ReadonlyArray<readonly [string, string]>;
      readonly body: Uint8Array | null;
      readonly chunks: ReadonlyArray<number>;
      readonly failAtEnd: boolean;
    };
const answer: fc.Arbitrary<Answer> = fc.oneof(
  { weight: 1, arbitrary: fc.constantFrom<Answer>({ kind: "reject" }, { kind: "throw" }) },
  {
    weight: 12,
    arbitrary: fc.record({
      kind: fc.constant("response" as const),
      status: fc.oneof(
        { weight: 6, arbitrary: fc.constant(200) },
        {
          weight: 3,
          arbitrary: fc.constantFrom(
            201,
            204,
            206,
            301,
            302,
            303,
            304,
            307,
            308,
            400,
            404,
            410,
            429,
            500,
            503,
          ),
        },
        { weight: 1, arbitrary: fc.integer({ min: 200, max: 599 }) },
      ),
      headers: headerList,
      body: anyBody,
      chunks: fc.array(fc.integer({ min: 1, max: 3000 }), { minLength: 1, maxLength: 5 }),
      failAtEnd: fc.oneof(
        { weight: 4, arbitrary: fc.constant(false) },
        { weight: 1, arbitrary: fc.constant(true) },
      ),
    }),
  },
);

/** A body that gives `bytes` in chunks of the given sizes, one chunk at each read, and counts what is read. */
function streamOf(bytes: Uint8Array, sizes: ReadonlyArray<number>, failAtEnd: boolean) {
  const read = { bytes: 0, lastChunk: 0 };
  let offset = 0;
  let index = 0;
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        if (offset >= bytes.byteLength) {
          if (failAtEnd) {
            controller.error(new Error("connection reset"));
          } else {
            controller.close();
          }
          return;
        }
        const chunk = bytes.slice(offset, offset + (sizes[index % sizes.length] ?? 1));
        index += 1;
        offset += chunk.byteLength;
        read.bytes += chunk.byteLength;
        read.lastChunk = chunk.byteLength;
        controller.enqueue(chunk);
      },
    },
    { highWaterMark: 0 },
  );
  return { stream, read };
}

/** A fetch that gives `answer` and keeps each request and what was read of the body. */
function answering(answer: Answer, redirected = false) {
  const requests: Request[] = [];
  let counted: ReturnType<typeof streamOf> | undefined;
  const fetch: FetchFunction = (request) => {
    requests.push(request);
    if (answer.kind === "throw") {
      throw new Error("no route to host");
    }
    if (answer.kind === "reject") {
      return Promise.reject(new Error("no route to host"));
    }
    const headers = new Headers();
    for (const [name, value] of answer.headers) {
      headers.append(name, value);
    }
    const nullBody = answer.body === null || NULL_BODY_STATUSES.includes(answer.status);
    counted =
      answer.body === null ? undefined : streamOf(answer.body, answer.chunks, answer.failAtEnd);
    const response = new Response(nullBody ? null : (counted?.stream ?? null), {
      status: answer.status,
      headers,
    });
    if (redirected) {
      // What a platform fetch that followed a redirect gives: the last answer, marked.
      Object.defineProperty(response, "redirected", { value: true });
    }
    return Promise.resolve(response);
  };
  return { fetch, requests, read: () => counted?.read ?? { bytes: 0, lastChunk: 0 } };
}

/** The JSON value of `bytes` as RFC 8259 reads UTF-8 text (a byte order mark may be ignored), or undefined. */
function jsonOf(bytes: Uint8Array): { value: unknown } | undefined {
  try {
    const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    return { value };
  } catch {
    return undefined;
  }
}
const isJsonObject = (value: unknown) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

describe("fetchDocument: draft sections 6, 6.2, 10.7 and 10.11", () => {
  test("never throws or dies; one GET of the id with Accept: application/json and no redirect followed, never one to a literal special-use address; a Document only for a 200 answer of at most MAX_DOCUMENT_BYTES that is a JSON object, fresh from now for at most 24 hours; it reads at most one chunk past the limit", async () => {
    await fc.assert(
      fc.asyncProperty(fetchedId, answer, async ({ id, special }, given) => {
        const { fetch, requests, read } = answering(given);
        const exit = await runExit(fetchDocument(id, fetch));
        if (!Exit.isSuccess(exit)) {
          expect.fail(`fetchDocument failed: ${String(exit.cause)}`);
        }
        const result = exit.value;
        if (special) {
          expect(requests).toEqual([]);
          expect(result._tag).toBe("Terminal");
          return;
        }
        expect(requests).toHaveLength(1);
        const [request] = requests;
        expect(request?.method).toBe("GET");
        expect(request?.url).toBe(new URL(id.id).href);
        expect(request?.redirect).toBe("manual");
        expect(request?.headers.get("accept")).toBe("application/json");

        expect(read().bytes).toBeLessThanOrEqual(MAX_DOCUMENT_BYTES + read().lastChunk);
        if (result._tag !== "Document") {
          return;
        }
        expect(given.kind).toBe("response");
        if (given.kind !== "response" || given.body === null) {
          return expect.fail("a Document from no body");
        }
        expect(given.status).toBe(200);
        expect(given.failAtEnd).toBe(false);
        expect(given.body.byteLength).toBeLessThanOrEqual(MAX_DOCUMENT_BYTES);
        const json = jsonOf(given.body);
        expect(json !== undefined && isJsonObject(json.value)).toBe(true);
        expect(result.json).toEqual(json?.value);
        expect(result.freshUntil).toBeGreaterThanOrEqual(T);
        expect(result.freshUntil).toBeLessThanOrEqual(T + DAY_MS);
      }),
      { numRuns: 300, seed: 6_1011 },
    );
  });

  test("MUST NOT follow redirects: an answer that a platform fetch reached by a redirect never gives a Document", async () => {
    const redirectedAnswer = members.map((object): Answer => ({
      kind: "response",
      status: 200,
      headers: [],
      body: encoder.encode(JSON.stringify(object)),
      chunks: [MAX_DOCUMENT_BYTES],
      failAtEnd: false,
    }));
    const id = accepted("https://app.example.com/oauth-client.json");
    await fc.assert(
      fc.asyncProperty(redirectedAnswer, async (given) => {
        const exit = await runExit(fetchDocument(id, answering(given, true).fetch));
        expect(Exit.isSuccess(exit) && exit.value).toMatchObject({
          _tag: "Terminal",
          code: "redirect",
        });
      }),
      { numRuns: 20, seed: 6_1012 },
    );
  });

  test("Retry-After of a 429 or 5xx answer gives a whole number of seconds from 0 to 86,400, or nothing", async () => {
    const retryAfterValue = fc.oneof(
      fc.nat({ max: 200_000 }).map(String),
      fc.bigInt({ min: 0n, max: 10n ** 30n }).map(String),
      longDigits,
      fc
        .integer({ min: -DAY_MS * 400, max: DAY_MS * 3_000_000 })
        .map((offset) => new Date(T + offset).toUTCString()),
      fc.stringMatching(/^[ -~]{0,16}$/),
    );
    const id = accepted("https://app.example.com/oauth-client.json");
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(429, 500, 503), retryAfterValue, async (status, value) => {
        const given: Answer = {
          kind: "response",
          status,
          headers: [["retry-after", value]],
          body: null,
          chunks: [1],
          failAtEnd: false,
        };
        const exit = await runExit(fetchDocument(id, answering(given).fetch));
        if (!Exit.isSuccess(exit) || exit.value._tag !== "Transient") {
          return expect.fail("a 429 or 5xx answer is not Transient");
        }
        const seconds = exit.value.retryAfter;
        if (seconds !== undefined) {
          expect(Number.isInteger(seconds)).toBe(true);
          expect(seconds).toBeGreaterThanOrEqual(0);
          expect(seconds).toBeLessThanOrEqual(86_400);
        }
      }),
      RUNS,
    );
  });
});

const directive = fc.oneof(
  fc.constantFrom(
    "no-store",
    "no-cache",
    'no-cache="set-cookie"',
    "public",
    "private",
    "must-revalidate",
    "max-age",
    "max-age=",
    "s-maxage=10",
    "immutable",
    "stale-while-revalidate=60",
  ),
  fc.nat().map((n) => `max-age=${n}`),
  fc.bigInt({ min: 0n, max: 10n ** 30n }).map((n) => `max-age=${n}`),
  fc.nat().map((n) => `max-age="${n}"`),
  fc.integer({ min: -100, max: -1 }).map((n) => `max-age=${n}`),
  fc.nat().map((n) => `MAX-AGE=${n}`),
  fc.stringMatching(/^[ -~]{0,12}$/),
  longDigits.map((digits) => `max-age=${digits}`),
);
const cacheControl = fc
  .tuple(fc.array(directive, { maxLength: 4 }), fc.constantFrom(",", ", ", " ,"))
  .map(([directives, separator]) => directives.join(separator));
const otherHeaders = fc.record(
  {
    age: fc.oneof(
      fc.nat({ max: 200_000 }).map(String),
      fc.stringMatching(/^[ -~]{0,6}$/),
      longDigits,
    ),
    expires: fc.constantFrom(new Date(T + DAY_MS * 3).toUTCString(), "0", "never"),
    "content-type": fc.constantFrom("application/json", "text/html"),
  },
  { requiredKeys: [] },
);
const now = fc.integer({ min: 0, max: 2 ** 45 });
const headersOf = (record: Record<string, string>) => new Headers(Object.entries(record));

describe("freshUntil: draft section 6.2 and the README", () => {
  test("for any header text, an answer is fresh from now for at most 24 hours", () => {
    fc.assert(
      fc.property(
        now,
        cacheControl,
        otherHeaders,
        fc.boolean(),
        (at, control, other, withControl) => {
          const until = freshUntil(
            headersOf(withControl ? { ...other, "cache-control": control } : other),
            at,
          );
          expect(until).toBeGreaterThanOrEqual(at);
          expect(until).toBeLessThanOrEqual(at + DAY_MS);
        },
      ),
      RUNS,
    );
  });

  test("with no Cache-Control, an answer is fresh for 1 hour, whatever its other headers", () => {
    fc.assert(
      fc.property(now, otherHeaders, (at, other) => {
        expect(freshUntil(headersOf(other), at)).toBe(at + HOUR_MS);
      }),
      RUNS,
    );
  });

  test("with Cache-Control: max-age=N alone, an answer is fresh for N seconds less its Age (RFC 9111 section 4.2), at most 24 hours", () => {
    fc.assert(
      fc.property(
        now,
        fc.oneof(fc.nat({ max: 200_000 }).map(BigInt), fc.bigInt({ min: 0n, max: 10n ** 30n })),
        fc.option(fc.nat({ max: 200_000 }), { nil: undefined }),
        (at, maxAge, age) => {
          const headers = headersOf(
            age === undefined
              ? { "cache-control": `max-age=${maxAge}` }
              : { "cache-control": `max-age=${maxAge}`, age: String(age) },
          );
          const left = maxAge - BigInt(age ?? 0);
          const seconds = left < 0n ? 0n : left > 86_400n ? 86_400n : left;
          expect(freshUntil(headers, at)).toBe(at + Number(seconds) * 1000);
        },
      ),
      RUNS,
    );
  });
});
