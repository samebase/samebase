// The reader against draft-ietf-oauth-client-id-metadata-document-03. Each test names the section
// and the requirement that it proves; docs/cimd.md lists them. Cases also come from the suites of
// node-oidc-provider (test/client_id_metadata_document) and Cloudflare's workers-oauth-provider
// (tests/oauth-cimd.test.ts).
import { Effect, Fiber } from "effect";
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
const ID = "https://app.example.com/oauth-client.json";

function clientId(raw: string): ClientId {
  const parsed = parseClientId(raw);
  if (parsed._tag !== "ClientId") {
    throw new Error(`${raw} is refused: ${parsed.code}`);
  }
  return parsed;
}

/** Runs `effect` on a test clock that reads `T`. */
const run = <A>(effect: Effect.Effect<A>) =>
  Effect.runPromise(
    TestClock.setTime(T).pipe(Effect.andThen(effect), Effect.provide(TestClock.layer())),
  );

/** A fetch that answers `response` and keeps each request. */
function answering(response: () => Response) {
  const requests: Request[] = [];
  const fetch: FetchFunction = (request) => {
    requests.push(request);
    return Promise.resolve(response());
  };
  return { fetch, requests };
}

const fetchWith = (response: () => Response, id = ID) =>
  run(fetchDocument(clientId(id), answering(response).fetch));

const jsonResponse = (body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers });

describe("parseClientId: draft section 3", () => {
  test("a valid id gives the raw text as the identity, with its hostname and origin", () => {
    expect(parseClientId(ID)).toEqual({
      _tag: "ClientId",
      id: ID,
      hostname: "app.example.com",
      origin: "https://app.example.com",
      hasQuery: false,
      hasExplicitPort: false,
    });
  });

  test("MAY contain a port: it is accepted and reported", () => {
    expect(parseClientId("https://example.com:8443/client")).toMatchObject({
      _tag: "ClientId",
      origin: "https://example.com:8443",
      hasExplicitPort: true,
    });
  });

  test("SHOULD NOT contain a query: it is accepted and reported for a policy", () => {
    expect(parseClientId("https://example.com/client?id=123")).toMatchObject({
      _tag: "ClientId",
      id: "https://example.com/client?id=123",
      hasQuery: true,
    });
    expect(parseClientId("https://example.com/client?")).toMatchObject({ hasQuery: true });
  });

  test("MUST NOT normalize: the default port and a case difference stay in the identity", () => {
    expect(parseClientId("https://example.com:443/client")).toMatchObject({
      _tag: "ClientId",
      id: "https://example.com:443/client",
      origin: "https://example.com",
      hasExplicitPort: true,
    });
    expect(parseClientId("HTTPS://Example.COM/client")).toMatchObject({
      _tag: "ClientId",
      id: "HTTPS://Example.COM/client",
      hostname: "example.com",
    });
  });

  test.each([
    ["http://example.com/client", "client_id_not_https"],
    ["ftp://example.com/client", "client_id_not_https"],
  ])("MUST use the https scheme: %s", (raw, code) => {
    expect(parseClientId(raw)).toMatchObject({ _tag: "Refused", code });
  });

  test.each([
    "https://user@example.com/client",
    "https://@example.com/client",
    "https://user:pass@example.com/client",
    "https://:@example.com/client",
  ])("MUST NOT contain a userinfo component, an empty one too: %s", (raw) => {
    expect(parseClientId(raw)).toMatchObject({ _tag: "Refused", code: "client_id_userinfo" });
  });

  test.each([
    "https://example.com",
    "https://example.com/",
    "https://example.com?foo=bar",
    "https://example.com/?foo=bar",
  ])("MUST contain a path component other than /: %s", (raw) => {
    expect(parseClientId(raw)).toMatchObject({ _tag: "Refused", code: "client_id_root_path" });
  });

  test.each([
    "https://example.com/./client",
    "https://example.com/../client",
    "https://example.com/a/../client",
    "https://example.com/client/.",
    "https://example.com/%2e/client",
    "https://example.com/%2E/client",
    "https://example.com/%2e%2e/client",
    "https://example.com/.%2e/client",
    "https://example.com/%2e./client",
    "https://example.com/client/%2e",
    "https://example.com/client/%2e%2e",
  ])("MUST NOT contain single-dot or double-dot path segments, encoded too: %s", (raw) => {
    expect(parseClientId(raw)).toMatchObject({ _tag: "Refused", code: "client_id_dot_segment" });
  });

  test("a segment that only looks like an encoded dot is a normal segment", () => {
    expect(parseClientId("https://example.com/%252e/client")).toMatchObject({ _tag: "ClientId" });
    expect(parseClientId("https://example.com/.well-known/client")).toMatchObject({
      _tag: "ClientId",
    });
  });

  test.each([
    "https://example.com/client#frag",
    "https://example.com/client#",
    "https://example.com/client?#",
  ])("MUST NOT contain a fragment component, an empty one too: %s", (raw) => {
    expect(parseClientId(raw)).toMatchObject({ _tag: "Refused", code: "client_id_fragment" });
  });

  test.each([
    ["not-a-url", "client_id_not_uri"],
    [" https://example.com/client", "client_id_not_uri"],
    ["https://example.com/client ", "client_id_not_uri"],
    ["https://example.com/\tclient", "client_id_not_uri"],
    ["https://example.com/\nclient", "client_id_not_uri"],
    ["https://example.com\\client", "client_id_not_uri"],
    ["https:\\\\example.com\\client", "client_id_not_uri"],
    ["https://bücher.example/client", "client_id_not_uri"],
    ["https://example.com/%zz", "client_id_not_uri"],
    ["https://example.com/[x]", "client_id_not_uri"],
    ["https:example.com/client", "client_id_no_host"],
    ["https:/example.com/client", "client_id_no_host"],
    ["https:///client", "client_id_no_host"],
  ])(
    "a text that is not an https URI with a host is refused before a parser repairs it: %j",
    (raw, code) => {
      expect(parseClientId(raw)).toMatchObject({ _tag: "Refused", code });
    },
  );

  test.each([
    "https://127.1/client",
    "https://ex%61mple.com/client",
    "https://example.com:/client",
    "https://example.com:0443/client",
    "https://example.com/client?name='a'",
  ])("the fetched address must be the named address: %s is refused", (raw) => {
    expect(parseClientId(raw)).toMatchObject({
      _tag: "Refused",
      code: "client_id_not_canonical",
    });
  });
});

describe("fetchDocument: draft sections 6, 6.1, 10.7, 10.11 and 11.1", () => {
  test("one GET of the id itself, with only Accept: application/json, and no redirect followed", async () => {
    const { fetch, requests } = answering(() => jsonResponse({ client_id: ID }));
    const result = await run(fetchDocument(clientId(ID), fetch));

    expect(result).toEqual({
      _tag: "Document",
      json: { client_id: ID },
      freshUntil: T + 3_600_000,
    });
    expect(requests).toHaveLength(1);
    const [request] = requests;
    expect(request?.method).toBe("GET");
    expect(request?.url).toBe(ID);
    expect(request?.redirect).toBe("manual");
    expect([...(request?.headers.entries() ?? [])]).toEqual([["accept", "application/json"]]);
  });

  test("MUST NOT follow redirects: a 3xx answer is a terminal failure", async () => {
    const result = await fetchWith(
      () =>
        new Response(null, { status: 302, headers: { Location: "https://elsewhere.example/c" } }),
    );
    expect(result).toEqual({ _tag: "Terminal", code: "redirect", status: 302 });
  });

  test.each([201, 203, 204, 401, 403, 404, 410])(
    "MUST treat every status other than 200 as an error: %i is terminal",
    async (status) => {
      const result = await fetchWith(() => new Response(null, { status }));
      expect(result).toEqual({ _tag: "Terminal", code: "unexpected_status", status });
    },
  );

  test("429 and 5xx are transient, with Retry-After in seconds", async () => {
    expect(
      await fetchWith(() => new Response(null, { status: 429, headers: { "Retry-After": "120" } })),
    ).toEqual({ _tag: "Transient", code: "unavailable_status", status: 429, retryAfter: 120 });
    expect(
      await fetchWith(
        () =>
          new Response(null, {
            status: 503,
            headers: { "Retry-After": new Date(T + 30_000).toUTCString() },
          }),
      ),
    ).toEqual({ _tag: "Transient", code: "unavailable_status", status: 503, retryAfter: 30 });
    expect(await fetchWith(() => new Response(null, { status: 500 }))).toEqual({
      _tag: "Transient",
      code: "unavailable_status",
      status: 500,
      retryAfter: undefined,
    });
  });

  test("no answer is a transient failure", async () => {
    const result = await run(
      fetchDocument(clientId(ID), () => Promise.reject(new TypeError("fetch failed"))),
    );
    expect(result).toEqual({
      _tag: "Transient",
      code: "unreachable",
      status: undefined,
      retryAfter: undefined,
    });
  });

  test("a body that fails in transit is a transient failure", async () => {
    const broken = new ReadableStream<Uint8Array>({
      pull: (controller) => controller.error(new TypeError("connection reset")),
    });
    expect(await fetchWith(() => new Response(broken))).toMatchObject({
      _tag: "Transient",
      code: "unreachable",
    });
  });

  test("5 seconds for the request: a host that does not answer is a transient time-out, and the request is aborted", async () => {
    let signal: AbortSignal | undefined;
    const fetch: FetchFunction = (request) => {
      signal = request.signal;
      return new Promise(() => {});
    };
    const result = await run(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(fetchDocument(clientId(ID), fetch));
        yield* Effect.yieldNow;
        yield* TestClock.adjust("4999 millis");
        expect(fiber.pollUnsafe()).toBeUndefined();
        yield* TestClock.adjust("1 millis");
        return yield* Fiber.join(fiber);
      }),
    );
    expect(result).toMatchObject({ _tag: "Transient", code: "timeout" });
    expect(signal?.aborted).toBe(true);
  });

  test("5 seconds include the body: a body that never ends is a transient time-out", async () => {
    const stalled = new ReadableStream<Uint8Array>({
      start: (controller) => controller.enqueue(new TextEncoder().encode('{"client_id":')),
    });
    const result = await run(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(
          fetchDocument(clientId(ID), answering(() => new Response(stalled)).fetch),
        );
        yield* Effect.yieldNow;
        yield* TestClock.adjust("5 seconds");
        return yield* Fiber.join(fiber);
      }),
    );
    expect(result).toMatchObject({ _tag: "Transient", code: "timeout" });
  });

  test("SHOULD limit the read to 5 KB: a document of exactly 5 KB is read", async () => {
    const body = JSON.stringify({ client_id: ID }).padEnd(MAX_DOCUMENT_BYTES, " ");
    const result = await fetchWith(() => new Response(body));
    expect(result).toMatchObject({ _tag: "Document", json: { client_id: ID } });
  });

  test("SHOULD limit the read to 5 KB: one byte more is terminal, and nothing more is read", async () => {
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
      pull: (controller) => {
        pulls += 1;
        controller.enqueue(new Uint8Array(1024).fill(0x20));
      },
    });
    const result = await fetchWith(() => new Response(body));
    expect(result).toEqual({ _tag: "Terminal", code: "too_large", status: 200 });
    expect(pulls).toBeLessThanOrEqual(7);
  });

  test("a Content-Length over 5 KB is terminal before the body is read", async () => {
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
      pull: (controller) => {
        pulls += 1;
        controller.enqueue(new Uint8Array(10));
      },
    });
    const result = await fetchWith(
      () => new Response(body, { headers: { "Content-Length": String(MAX_DOCUMENT_BYTES + 1) } }),
    );
    expect(result).toEqual({ _tag: "Terminal", code: "too_large", status: 200 });
    expect(pulls).toBeLessThanOrEqual(1);
  });

  test.each([
    ["not JSON", () => new Response("not valid json {{{"), "not_json"],
    ["invalid UTF-8", () => new Response(new Uint8Array([0xff])), "not_json"],
    ["an empty body", () => new Response(null), "not_json"],
    ["a JSON array", () => new Response("[]"), "not_object"],
    ["a JSON string", () => new Response('"x"'), "not_object"],
    ["JSON null", () => new Response("null"), "not_object"],
  ])("a malformed document is terminal (section 6.1): %s", async (_name, response, code) => {
    expect(await fetchWith(response)).toEqual({ _tag: "Terminal", code, status: 200 });
  });

  test.each([
    "https://localhost/client",
    "https://app.localhost/client",
    "https://127.0.0.1/client",
    "https://10.0.0.1/client",
    "https://172.16.5.4/client",
    "https://192.168.1.1/client",
    "https://169.254.169.254/latest/meta-data",
    "https://100.64.0.1/client",
    "https://0.0.0.0/client",
    "https://224.0.0.1/client",
    "https://255.255.255.255/client",
    "https://[::1]/client",
    "https://[::]/client",
    "https://[::ffff:7f00:1]/client",
    "https://[fd00::1]/client",
    "https://[fe80::1]/client",
    "https://[2001:db8::1]/client",
    "https://[64:ff9b::a00:1]/client",
  ])("MUST NOT fetch a special-use address: %s is never requested", async (id) => {
    const { fetch, requests } = answering(() => jsonResponse({ client_id: id }));
    expect(await run(fetchDocument(clientId(id), fetch))).toEqual({
      _tag: "Terminal",
      code: "special_use_address",
      status: undefined,
    });
    expect(requests).toHaveLength(0);
  });

  test.each(["https://93.184.215.14/client", "https://[2606:4700::1111]/client"])(
    "a public IP address is fetched: the reader leaves it to policy (%s)",
    async (id) => {
      expect(await fetchWith(() => jsonResponse({ client_id: id }), id)).toMatchObject({
        _tag: "Document",
      });
    },
  );
});

describe("freshUntil: draft section 6.2", () => {
  const fresh = (headers: Record<string, string>) => freshUntil(new Headers(headers), T);

  test("SHOULD respect cache headers: max-age is used as given, less the Age of the answer", () => {
    expect(fresh({ "Cache-Control": "public, max-age=600" })).toBe(T + 600_000);
    expect(fresh({ "Cache-Control": "MAX-AGE=60" })).toBe(T + 60_000);
    expect(fresh({ "Cache-Control": "max-age=600", Age: "100" })).toBe(T + 500_000);
    expect(fresh({ "Cache-Control": "max-age=60", Age: "100" })).toBe(T);
  });

  test("no-store and no-cache give no freshness: the next use reads again", () => {
    expect(fresh({ "Cache-Control": "no-store" })).toBe(T);
    expect(fresh({ "Cache-Control": "max-age=600, no-cache" })).toBe(T);
    expect(fresh({ "Cache-Control": 'no-cache="set-cookie"' })).toBe(T);
  });

  test("SHOULD enforce a maximum effective cache duration: 24 hours", () => {
    expect(fresh({ "Cache-Control": "max-age=31536000" })).toBe(T + 86_400_000);
  });

  test("SHOULD enforce a minimum when none is indicated: 1 hour; Expires need not be honored", () => {
    expect(fresh({})).toBe(T + 3_600_000);
    expect(fresh({ Expires: new Date(T + 86_400_000).toUTCString() })).toBe(T + 3_600_000);
  });

  test("a max-age that cannot be read is stale", () => {
    expect(fresh({ "Cache-Control": "max-age=soon" })).toBe(T);
  });

  test("the fetched document carries the freshness of its answer", async () => {
    expect(
      await fetchWith(() => jsonResponse({ client_id: ID }, { "Cache-Control": "max-age=300" })),
    ).toMatchObject({ _tag: "Document", freshUntil: T + 300_000 });
  });
});

/** The document of design section 2: a public client of one host. */
const document = {
  client_id: ID,
  client_name: "My app",
  redirect_uris: ["https://app.example.com/auth/callback"],
  token_endpoint_auth_methods_supported: ["none"],
};

describe("checkDocument: draft sections 4 to 6", () => {
  test("a valid document gives the checked record", () => {
    expect(checkDocument(ID, document)).toEqual({
      _tag: "Checked",
      id: ID,
      redirectUris: [{ uri: "https://app.example.com/auth/callback", kind: "https" }],
      authMethods: ["none"],
      keys: undefined,
      grantTypes: ["authorization_code"],
      responseTypes: ["code"],
      selfAsserted: {
        clientName: "My app",
        clientUri: undefined,
        logoUri: undefined,
        policyUri: undefined,
        tosUri: undefined,
      },
    });
  });

  test("section 4: the document is a JSON object", () => {
    expect(checkDocument(ID, [document])).toMatchObject({ code: "not_object" });
    expect(checkDocument(ID, null)).toMatchObject({ code: "not_object" });
  });

  test("section 4: MUST contain a client_id property", () => {
    const { client_id: _, ...withoutId } = document;
    expect(checkDocument(ID, withoutId)).toEqual({
      _tag: "Refused",
      code: "invalid_member",
      member: "client_id",
    });
  });

  test.each([
    "https://app.example.com:443/oauth-client.json",
    "https://APP.example.com/oauth-client.json",
    "https://app.example.com/oauth-client.json/",
    "https://app.example.com/oauth-client.json?",
    "https://other.example.com/oauth-client.json",
  ])("section 4: client_id MUST match the fetched URL by simple string comparison: %s", (other) => {
    expect(checkDocument(ID, { ...document, client_id: other })).toMatchObject({
      code: "client_id_mismatch",
    });
  });

  test("a __proto__ member of the JSON text supplies no client_id", () => {
    const json: unknown = JSON.parse(`{"__proto__": {"client_id": "${ID}"}}`);
    expect(checkDocument(ID, json)).toMatchObject({ code: "invalid_member", member: "client_id" });
  });

  test.each([
    ["client_secret", "secret"],
    ["client_secret", null],
    ["client_secret_expires_at", 0],
  ])("section 4.1: %s MUST NOT be used (value %j)", (member, value) => {
    expect(checkDocument(ID, { ...document, [member]: value })).toMatchObject({
      code: "client_secret_not_allowed",
    });
  });

  test.each(["client_secret_post", "client_secret_basic", "client_secret_jwt"])(
    "section 4.1: no shared-secret method in either authentication member: %s",
    (method) => {
      expect(
        checkDocument(ID, { ...document, token_endpoint_auth_methods_supported: ["none", method] }),
      ).toMatchObject({ code: "shared_secret_method" });
      const { token_endpoint_auth_methods_supported: _, ...singular } = document;
      expect(checkDocument(ID, { ...singular, token_endpoint_auth_method: method })).toMatchObject({
        code: "shared_secret_method",
      });
    },
  );

  const rsaPublic = { kty: "RSA", kid: "1", n: "public-modulus", e: "AQAB" };

  test("section 4.1: public keys in jwks are permitted and reported", () => {
    expect(checkDocument(ID, { ...document, jwks: { keys: [rsaPublic] } })).toMatchObject({
      _tag: "Checked",
      keys: { kind: "jwks", jwks: { keys: [rsaPublic] } },
    });
  });

  test.each([
    { ...rsaPublic, d: "private-exponent" },
    { kty: "EC", crv: "P-256", x: "x", y: "y", d: "private" },
    { kty: "OKP", crv: "Ed25519", x: "x", d: "private" },
    { kty: "oct", k: "c2VjcmV0" },
    { ...rsaPublic, p: "p", q: "q" },
  ])("section 4.1: private key material MUST NOT be included: %j", (key) => {
    expect(checkDocument(ID, { ...document, jwks: { keys: [key] } })).toMatchObject({
      code: "private_key_material",
    });
  });

  test("section 4.1: jwks and jwks_uri MUST NOT both be present", () => {
    expect(
      checkDocument(ID, {
        ...document,
        jwks: { keys: [rsaPublic] },
        jwks_uri: "https://app.example.com/jwks.json",
      }),
    ).toMatchObject({ code: "jwks_and_jwks_uri" });
  });

  test("section 4.1: a key without kty is not a JWK", () => {
    expect(checkDocument(ID, { ...document, jwks: { keys: [{ n: "x" }] } })).toMatchObject({
      code: "invalid_member",
      member: "jwks",
    });
  });

  test("section 4.3: a software_statement is refused, since the reader does not validate one", () => {
    expect(checkDocument(ID, { ...document, software_statement: "eyJ..." })).toMatchObject({
      code: "software_statement_not_supported",
    });
  });

  test("section 4.2: redirect URIs are kept exactly as written, each with its kind", () => {
    const redirectUris = [
      "https://Client.example.com:443/cb?x=1",
      "http://127.0.0.1/callback",
      "http://127.0.0.1:3000/cb",
      "http://[::1]:8080/cb",
      "http://LOCALHOST/cased",
      "https://localhost:8443/cb",
      "com.example.app:/oauth/callback",
      "http://client.example.com/insecure",
      "https://192.0.2.1/cb",
      "https://[2001:db8::1]/cb",
      "javascript:alert(1)",
    ];
    const checked = checkDocument(ID, { ...document, redirect_uris: redirectUris });
    expect(checked).toMatchObject({
      _tag: "Checked",
      redirectUris: [
        { uri: redirectUris[0], kind: "https" },
        { uri: redirectUris[1], kind: "loopback" },
        { uri: redirectUris[2], kind: "loopback" },
        { uri: redirectUris[3], kind: "loopback" },
        { uri: redirectUris[4], kind: "loopback" },
        { uri: redirectUris[5], kind: "loopback" },
        { uri: redirectUris[6], kind: "other" },
        { uri: redirectUris[7], kind: "other" },
        { uri: redirectUris[8], kind: "other" },
        { uri: redirectUris[9], kind: "other" },
        { uri: redirectUris[10], kind: "other" },
      ],
    });
  });

  test("section 4.2: no redirect_uris is an empty list, for grant types that use none", () => {
    const { redirect_uris: _, ...withoutRedirects } = document;
    expect(
      checkDocument(ID, { ...withoutRedirects, grant_types: ["client_credentials"] }),
    ).toMatchObject({ _tag: "Checked", redirectUris: [], grantTypes: ["client_credentials"] });
  });

  test.each([
    [["not a uri"], "invalid_redirect_uri"],
    [["/relative/callback"], "invalid_redirect_uri"],
    [["https://app.example.com/cb#"], "invalid_redirect_uri"],
    [["https://app.example.com/cb#x"], "invalid_redirect_uri"],
    ["https://app.example.com/cb", "invalid_member"],
    [[42], "invalid_member"],
  ])("section 4.2 (RFC 6749 section 3.1.2): redirect_uris %j is refused", (redirectUris, code) => {
    expect(checkDocument(ID, { ...document, redirect_uris: redirectUris })).toMatchObject({
      code,
    });
  });

  test("section 4.4: client_uri may be on any origin", () => {
    expect(
      checkDocument(ID, { ...document, client_uri: "https://www.example.org/about" }),
    ).toMatchObject({
      _tag: "Checked",
      selfAsserted: { clientUri: "https://www.example.org/about" },
    });
  });

  test("section 10.10: the display members are reported as asserted by the client", () => {
    expect(
      checkDocument(ID, {
        ...document,
        logo_uri: "https://app.example.com/logo.png",
        policy_uri: "https://app.example.com/privacy",
        tos_uri: "https://app.example.com/terms",
      }),
    ).toMatchObject({
      selfAsserted: {
        clientName: "My app",
        logoUri: "https://app.example.com/logo.png",
        policyUri: "https://app.example.com/privacy",
        tosUri: "https://app.example.com/terms",
      },
    });
    expect(checkDocument(ID, { ...document, client_name: 5 })).toMatchObject({
      code: "invalid_member",
      member: "client_name",
    });
  });

  test("section 5: with neither member, the method is none, not the client_secret_basic default of RFC 7591", () => {
    const { token_endpoint_auth_methods_supported: _, ...neither } = document;
    expect(checkDocument(ID, neither)).toMatchObject({ _tag: "Checked", authMethods: ["none"] });
  });

  test("section 5: the singular member alone is read", () => {
    const { token_endpoint_auth_methods_supported: _, ...singular } = document;
    expect(
      checkDocument(ID, {
        ...singular,
        token_endpoint_auth_method: "private_key_jwt",
        jwks_uri: "https://app.example.com/jwks.json",
      }),
    ).toMatchObject({ _tag: "Checked", authMethods: ["private_key_jwt"] });
  });

  test("section 5: MUST recognise token_endpoint_auth_methods_supported, and report every value", () => {
    expect(
      checkDocument(ID, {
        ...document,
        token_endpoint_auth_methods_supported: ["unsupported", "none", "private_key_jwt"],
        jwks_uri: "https://app.example.com/jwks.json",
      }),
    ).toMatchObject({ _tag: "Checked", authMethods: ["unsupported", "none", "private_key_jwt"] });
  });

  test("section 5: with both members, the singular value MUST be in the plural list", () => {
    expect(
      checkDocument(ID, {
        ...document,
        token_endpoint_auth_method: "none",
        token_endpoint_auth_methods_supported: ["private_key_jwt"],
        jwks_uri: "https://app.example.com/jwks.json",
      }),
    ).toMatchObject({ code: "auth_method_not_in_list" });
  });

  test.each([
    [[], "auth_methods_empty"],
    ["none", "invalid_member"],
    [[null], "invalid_member"],
  ])("section 5: token_endpoint_auth_methods_supported %j declares no method", (methods, code) => {
    expect(
      checkDocument(ID, { ...document, token_endpoint_auth_methods_supported: methods }),
    ).toMatchObject({ code });
  });

  test("section 5.1, first example: private_key_jwt with jwks_uri is a confidential client", () => {
    const { token_endpoint_auth_methods_supported: _, ...base } = document;
    expect(
      checkDocument(ID, {
        ...base,
        token_endpoint_auth_methods_supported: ["private_key_jwt"],
        jwks_uri: "https://client.example.com/jwks.json",
      }),
    ).toMatchObject({
      _tag: "Checked",
      authMethods: ["private_key_jwt"],
      keys: { kind: "jwks_uri", uri: "https://client.example.com/jwks.json" },
    });
  });

  test("section 5.1, second example: none and private_key_jwt, usable as a public client", () => {
    expect(
      checkDocument(ID, {
        ...document,
        token_endpoint_auth_methods_supported: ["none", "private_key_jwt"],
        jwks_uri: "https://client.example.com/jwks.json",
      }),
    ).toMatchObject({
      _tag: "Checked",
      authMethods: ["none", "private_key_jwt"],
      keys: { kind: "jwks_uri", uri: "https://client.example.com/jwks.json" },
    });
  });

  test("section 6: grant_types and response_types are reported as declared, for a server to intersect", () => {
    expect(
      checkDocument(ID, {
        ...document,
        grant_types: ["authorization_code", "urn:example:unsupported-grant"],
        response_types: ["id_token"],
      }),
    ).toMatchObject({
      _tag: "Checked",
      grantTypes: ["authorization_code", "urn:example:unsupported-grant"],
      responseTypes: ["id_token"],
    });
    expect(checkDocument(ID, { ...document, grant_types: "authorization_code" })).toMatchObject({
      code: "invalid_member",
      member: "grant_types",
    });
  });
});

// Documents of real clients that other servers refused (cimd-implementations-2026-11-26.md,
// "Interoperability differences").
describe("checkDocument: real documents", () => {
  test("ChatGPT: both members, the plural one with none and a key method", () => {
    // Frozen from the live document in workers-oauth-provider's tests (verified 2026-08-07).
    const id = "https://chatgpt.com/oauth/IbUR3zxyNQ16/client.json";
    expect(
      checkDocument(id, {
        client_id: id,
        client_uri: "https://chatgpt.com/",
        client_name: "ChatGPT",
        logo_uri: "https://persistent.oaistatic.com/sonic/misc/openai-logo.png",
        redirect_uris: ["https://chatgpt.com/connector/oauth/IbUR3zxyNQ16"],
        token_endpoint_auth_method: "private_key_jwt",
        token_endpoint_auth_methods_supported: ["none", "private_key_jwt"],
        token_endpoint_auth_signing_alg: "RS256",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        jwks_uri: "https://chatgpt.com/oauth/jwks.json",
      }),
    ).toMatchObject({
      _tag: "Checked",
      authMethods: ["none", "private_key_jwt"],
      keys: { kind: "jwks_uri", uri: "https://chatgpt.com/oauth/jwks.json" },
      grantTypes: ["authorization_code", "refresh_token"],
      redirectUris: [{ uri: "https://chatgpt.com/connector/oauth/IbUR3zxyNQ16", kind: "https" }],
    });
  });

  test("Claude: grant types that a server may not support", () => {
    // The shape in workers-oauth-provider's tests ("Claude.ai-style CIMD metadata").
    const id = "https://claude.ai/oauth/mcp-oauth-client-metadata";
    expect(
      checkDocument(id, {
        client_id: id,
        client_name: "Claude",
        client_uri: "https://claude.ai",
        redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
        token_endpoint_auth_method: "none",
        grant_types: [
          "authorization_code",
          "refresh_token",
          "urn:ietf:params:oauth:grant-type:jwt-bearer",
        ],
        response_types: ["code"],
      }),
    ).toMatchObject({
      _tag: "Checked",
      authMethods: ["none"],
      grantTypes: [
        "authorization_code",
        "refresh_token",
        "urn:ietf:params:oauth:grant-type:jwt-bearer",
      ],
    });
  });

  test("Claude Code: only loopback redirect URIs, with no port", () => {
    // The redirect URIs of Claude Code's published document, as Logto's tests hold them
    // (packages/core/src/oidc/cimd/redirect-uri.test.ts).
    const id = "https://claude.ai/oauth/claude-code-client-metadata";
    expect(
      checkDocument(id, {
        client_id: id,
        client_name: "Claude Code",
        redirect_uris: ["http://localhost/callback", "http://127.0.0.1/callback"],
        token_endpoint_auth_method: "none",
      }),
    ).toMatchObject({
      _tag: "Checked",
      redirectUris: [
        { uri: "http://localhost/callback", kind: "loopback" },
        { uri: "http://127.0.0.1/callback", kind: "loopback" },
      ],
    });
  });
});
