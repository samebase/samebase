// The sign-in endpoints through `handle`, on the memory Store, with cards that the tests write as a
// layer does. Ported from src/client/broker.test.ts of 0.34.0. Not ported: the
// admin functions (deleteClient, deleteApp, cleanup; design section 9 item 4) and the component's
// cleanup batches (rules tests).
import { Effect, Redacted, Schema } from "effect";
import { decodeJwt } from "jose";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { first } from "../store/Tx.ts";
import type { Connector } from "./connectors/types.ts";
import type { SignInPageFacts } from "./html.ts";
import { readConnector } from "../hosts/settings.ts";
import { google } from "./connectors/index.ts";
import type { Route } from "./router.ts";
import { HubConfig, type HubConfigInput } from "./services.ts";
import { sha256Hex } from "./subject.ts";
import {
  createBroker,
  fakeOidcUpstream,
  fakeUpstream,
  hubLogLine,
  pkce,
  stubFetch,
  TEST_SERVICE,
  txnCookie,
  type Broker,
} from "./testing/harness.ts";

const REDIRECT_URI = "https://app.test/oauth/hub/callback";

// The JSON answers, decoded: a body of another shape fails the test.
const Tokens = Schema.Struct({
  access_token: Schema.String,
  token_type: Schema.String,
  expires_in: Schema.Number,
  id_token: Schema.String,
  scope: Schema.String,
});
const tokensOf = async (response: Response) =>
  Schema.decodeUnknownSync(Tokens)(await response.json());
const OAuthError = Schema.Struct({ error: Schema.String, error_description: Schema.String });
const errorOf = async (response: Response) =>
  Schema.decodeUnknownSync(OAuthError)(await response.json());
const JsonObject = Schema.Record(Schema.String, Schema.Unknown);
const objectOf = async (response: Response) =>
  Schema.decodeUnknownSync(JsonObject)(await response.json());

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** The broker with the fake OAuth provider; `more` adds connectors made from its connector. */
async function fakeBroker(
  options: {
    userId?: string;
    issuer?: string;
    routes?: ReadonlyArray<Route>;
    connectors?: (fake: Connector) => Connector[];
  } = {},
) {
  const fetch = stubFetch();
  const { connector } = fakeUpstream(fetch, {
    ...(options.userId === undefined ? {} : { userId: options.userId }),
  });
  const h = await createBroker({
    fetch,
    config: {
      connectors: options.connectors?.(connector) ?? [connector],
      ...(options.issuer === undefined ? {} : { issuer: options.issuer }),
      service: { ...TEST_SERVICE, name: "Samebase" },
    },
    ...(options.routes === undefined ? {} : { registration: { routes: options.routes } }),
  });
  return { ...h, connector };
}

function authorizeUrl(
  h: Broker,
  args: { clientId: string; challenge: string; extra?: Record<string, string> },
) {
  const url = new URL(`${h.issuer}/authorize`);
  url.search = new URLSearchParams({
    client_id: args.clientId,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: "openid email profile",
    state: "client-state",
    nonce: "client-nonce",
    code_challenge: args.challenge,
    code_challenge_method: "S256",
    ...args.extra,
  }).toString();
  return url;
}

/** Runs the fake provider's half: follows the upstream redirect back into the broker callback. */
async function completeUpstream(h: Broker, authorizeResponse: Response) {
  expect(authorizeResponse.status).toBe(302);
  const upstream = new URL(authorizeResponse.headers.get("location") ?? "");
  expect(upstream.origin).toBe("https://upstream.test");
  expect(upstream.searchParams.get("code_challenge_method")).toBe("S256");
  const state = upstream.searchParams.get("state") ?? "";
  const callback = new URL(upstream.searchParams.get("redirect_uri") ?? "");
  callback.searchParams.set("code", "upstream-code");
  callback.searchParams.set("state", state);
  return await h.fetchBroker(callback, { headers: txnCookie(authorizeResponse) });
}

async function exchange(
  h: Broker,
  args: {
    code: string;
    clientId: string;
    clientSecret: string;
    verifier: string;
    redirectUri?: string;
  },
) {
  return await h.fetchBroker(`${h.issuer}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: args.code,
      code_verifier: args.verifier,
      client_id: args.clientId,
      client_secret: args.clientSecret,
      redirect_uri: args.redirectUri ?? REDIRECT_URI,
    }).toString(),
  });
}

const codeOf = (response: Response) =>
  new URL(response.headers.get("location") ?? "").searchParams.get("code") ?? "";

/** The id_token and the `/userinfo` answer of one completed sign-in with `scope`. */
async function signedInClaims(h: Broker, clientId: string, clientSecret: string, scope: string) {
  const { verifier, challenge } = await pkce();
  const back = await completeUpstream(
    h,
    await h.fetchBroker(authorizeUrl(h, { clientId, challenge, extra: { scope } })),
  );
  const response = await exchange(h, { code: codeOf(back), clientId, clientSecret, verifier });
  expect(response.status).toBe(200);
  const tokens = await tokensOf(response);
  const userinfo = await h.fetchBroker(`${h.issuer}/userinfo`, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  expect(userinfo.status).toBe(200);
  return [decodeJwt(tokens.id_token), await objectOf(userinfo)];
}

describe("configuration", () => {
  /** `HubConfig.make` run to its end: a refused configuration throws its `HubConfigError`. */
  const makeHubConfig = (input: HubConfigInput) => Effect.runSync(HubConfig.make(input));

  test("the issuer is https, or http on a loopback host", () => {
    const { connector } = fakeUpstream(stubFetch());
    const config = { connectors: [connector], service: TEST_SERVICE };
    expect(() => makeHubConfig({ ...config, issuer: "http://auth.test" })).toThrow("must be https");
    expect(() => makeHubConfig({ ...config, issuer: "http://127.0.0.1:3211" })).not.toThrow();
  });

  test("a provider is [a-z0-9-]+, and its connectors share one issuer", () => {
    const { connector } = fakeUpstream(stubFetch());
    const config = { issuer: "https://auth.test", service: TEST_SERVICE };
    expect(() =>
      makeHubConfig({ ...config, connectors: [{ ...connector, provider: "fake:x" }] }),
    ).toThrow("has a provider that is not [a-z0-9-]+");
    const second = { ...connector, name: "other" };
    expect(() => makeHubConfig({ ...config, connectors: [connector, second] })).not.toThrow();
    expect(() =>
      makeHubConfig({
        ...config,
        connectors: [connector, { ...second, issuer: "https://other.test" }],
      }),
    ).toThrow('The connectors of provider "fake" have two issuers');
  });
});

describe("metadata", () => {
  test("both discovery documents and the JWKS", async () => {
    const h = await fakeBroker();
    for (const path of [
      "/.well-known/openid-configuration",
      "/.well-known/oauth-authorization-server",
    ]) {
      const response = await h.fetchBroker(`${h.issuer}${path}`);
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("public, max-age=300");
      const metadata = await objectOf(response);
      expect(metadata).toMatchObject({
        issuer: h.issuer,
        jwks_uri: `${h.issuer}/.well-known/jwks.json`,
        subject_types_supported: ["public"],
        code_challenge_methods_supported: ["S256"],
        authorization_response_iss_parameter_supported: true,
        claims_supported: expect.arrayContaining(["connector"]),
        connectors_supported: ["fake"],
        // No API resources (design section 9 item 1).
        scopes_supported: ["openid", "email", "profile"],
        grant_types_supported: ["authorization_code"],
        op_tos_uri: "https://hub.example.com/terms",
      });
      expect(metadata).not.toHaveProperty("revocation_endpoint");
      expect(metadata).not.toHaveProperty("registration_endpoint");
    }
    const jwks = await objectOf(await h.fetchBroker(`${h.issuer}/.well-known/jwks.json`));
    expect(jwks["keys"]).toEqual([expect.not.objectContaining({ d: expect.anything() })]);
  });

  test("a layer's mounted POST /register is the registration endpoint of discovery", async () => {
    const h = await fakeBroker({
      routes: [
        {
          method: "POST",
          path: "/register",
          match: "exact",
          template: "/register",
          handler: () => Effect.succeed(new Response(null, { status: 204 })),
        },
      ],
    });
    const metadata = await objectOf(
      await h.fetchBroker(`${h.issuer}/.well-known/openid-configuration`),
    );
    expect(metadata).toMatchObject({ registration_endpoint: `${h.issuer}/register` });
    expect((await h.fetchBroker(`${h.issuer}/register`, { method: "POST" })).status).toBe(204);
  });

  test("HEAD answers as GET with no body, as Convex's HTTP router does", async () => {
    const h = await fakeBroker();
    const response = await h.fetchBroker(`${h.issuer}/.well-known/openid-configuration`, {
      method: "HEAD",
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(await response.text()).toBe("");
  });

  test("a path issuer serves the RFC 8414 location with the path after the segment", async () => {
    const h = await fakeBroker({ issuer: "https://samebase.test/identity" });
    expect(
      (await h.fetchBroker("https://samebase.test/identity/.well-known/openid-configuration"))
        .status,
    ).toBe(200);
    expect(
      (await h.fetchBroker("https://samebase.test/.well-known/oauth-authorization-server/identity"))
        .status,
    ).toBe(200);
    expect(
      (await h.fetchBroker("https://samebase.test/.well-known/openid-configuration")).status,
    ).toBe(404);
  });
});

/** Deletes a card, as its layer's removal does. */
function deleteCard(h: Broker, clientId: string) {
  h.memory.withTx((tx) =>
    Effect.gen(function* () {
      const row = yield* first(tx, "clients", "by_client_id", [clientId]);
      if (row !== undefined) yield* tx.delete("clients", row.id);
    }),
  );
}

describe("clients", () => {
  test("a deleted client cannot sign in", async () => {
    const h = await fakeBroker();
    const { clientId } = await h.registerClient({ appName: "My app", redirectUri: REDIRECT_URI });
    deleteCard(h, clientId);
    const { challenge } = await pkce();
    expect((await h.fetchBroker(authorizeUrl(h, { clientId, challenge }))).status).toBe(400);
  });

  test("/userinfo refuses the access token of a deleted client", async () => {
    const h = await fakeBroker();
    const { clientId, clientSecret } = await h.registerClient({
      appName: "My app",
      redirectUri: REDIRECT_URI,
      gates: ["test:gate"],
    });
    const { verifier, challenge } = await pkce();
    const back = await completeUpstream(
      h,
      await h.fetchBroker(authorizeUrl(h, { clientId, challenge })),
    );
    const tokens = await exchange(h, { code: codeOf(back), clientId, clientSecret, verifier });
    expect(tokens.status).toBe(200);
    const { access_token } = await tokensOf(tokens);
    const userinfo = async () =>
      await h.fetchBroker(`${h.issuer}/userinfo`, {
        headers: { Authorization: `Bearer ${access_token}` },
      });
    expect((await userinfo()).status).toBe(200);
    // A stop leaves the tokens already issued usable until they expire.
    await h.setStop("test:gate", true);
    expect((await userinfo()).status).toBe(200);
    deleteCard(h, clientId);
    const deleted = await userinfo();
    expect(deleted.status).toBe(401);
    expect(deleted.headers.get("www-authenticate")).toBe('Bearer error="invalid_token"');
    expect(await deleted.json()).toMatchObject({ error: "invalid_token" });
  });

  test("a stop on one of the card's gates turns sign-in off at once, and its removal turns it on", async () => {
    const h = await fakeBroker();
    const { clientId, clientSecret, ref } = await h.registerClient({
      appName: "My app",
      redirectUri: REDIRECT_URI,
      gates: ["test:repository", "test:owner"],
    });
    const { verifier, challenge } = await pkce();
    const back = await completeUpstream(
      h,
      await h.fetchBroker(authorizeUrl(h, { clientId, challenge })),
    );
    await h.setStop("test:owner", true);
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);

    // Nobody has continued from a page: the refusal is a page of the hub, not a redirect.
    const authorized = await h.fetchBroker(authorizeUrl(h, { clientId, challenge }));
    expect(authorized.status).toBe(403);
    expect(authorized.headers.get("location")).toBeNull();
    expect(await authorized.text()).toContain("Sign-in for this app is turned off.");
    // The log line names the client and the card's reference, never a return address.
    expect(log.mock.calls).toEqual([
      [
        `hub_event ${JSON.stringify({ event: "sign_in_refused", clientId, ref, connector: null, reason: "stopped" })}`,
      ],
    ]);

    const tokens = await exchange(h, { code: codeOf(back), clientId, clientSecret, verifier });
    expect(tokens.status).toBe(401);
    expect((await errorOf(tokens)).error).toBe("invalid_client");

    await h.setStop("test:owner", false);
    const again = await pkce();
    const retried = await completeUpstream(
      h,
      await h.fetchBroker(authorizeUrl(h, { clientId, challenge: again.challenge })),
    );
    const signedIn = await exchange(h, {
      code: codeOf(retried),
      clientId,
      clientSecret,
      verifier: again.verifier,
    });
    expect(signedIn.status).toBe(200);
  });

  test("a return address taken off the card while the user is at the provider gets the hub's page, not a redirect", async () => {
    const h = await fakeBroker();
    const { clientId } = await h.registerClient({
      appName: "My app",
      redirectUri: REDIRECT_URI,
      otherRedirectUris: ["https://app.example.com/other"],
    });
    const { challenge } = await pkce();
    const authorized = await h.fetchBroker(authorizeUrl(h, { clientId, challenge }));
    await h.editCard(clientId, (card) => ({
      ...card,
      redirectUris: ["https://app.example.com/other"],
    }));
    const back = await completeUpstream(h, authorized);
    expect(back.status).toBe(400);
    expect(back.headers.get("location")).toBeNull();
    expect(await back.text()).toContain("Sign-in for this app is no longer available.");
  });
});

describe("authorization code flow with an OAuth connector", () => {
  test("a card with one connector and no page goes straight upstream and back with a code", async () => {
    const h = await fakeBroker();
    const { ref, clientId, clientSecret } = await h.registerClient({
      appName: "My app",
      redirectUri: REDIRECT_URI,
    });
    const { verifier, challenge } = await pkce();

    const started = await h.fetchBroker(authorizeUrl(h, { clientId, challenge }));
    // One connector and no consent skips the page, not the binding to the browser that started it.
    expect(started.headers.get("set-cookie")).toMatch(
      /^__Host-broker_txn_[^=]+=[^;]+; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=600$/,
    );
    expect(started.headers.get("cache-control")).toBe("no-store");
    const back = await completeUpstream(h, started);
    expect(back.status).toBe(302);
    // Sending the browser back to the client deletes the cookie.
    expect(back.headers.get("set-cookie")).toMatch(/Max-Age=0$/);
    const location = new URL(back.headers.get("location") ?? "");
    expect(location.origin + location.pathname).toBe(REDIRECT_URI);
    expect(location.searchParams.get("state")).toBe("client-state");
    expect(location.searchParams.get("iss")).toBe(h.issuer);
    const code = location.searchParams.get("code") ?? "";
    expect(code.length).toBeGreaterThan(20);

    const tokens = await exchange(h, { code, clientId, clientSecret, verifier });
    expect(tokens.status).toBe(200);
    expect(tokens.headers.get("cache-control")).toBe("no-store");
    expect(tokens.headers.get("pragma")).toBe("no-cache");
    const body = await tokensOf(tokens);
    expect(body.token_type).toBe("Bearer");
    expect(body.expires_in).toBe(300);
    expect(body.scope).toBe("openid email profile");
    const claims = decodeJwt(body.id_token);
    expect(claims.iss).toBe(h.issuer);
    expect(claims.aud).toBe(clientId);
    expect(claims.nonce).toBe("client-nonce");
    expect(claims["email"]).toBe("octo@example.com");
    expect(claims["email_verified"]).toBe(true);
    expect(claims["connector"]).toBe("fake");
    // The request asked for no fresh login, so the token names no login time.
    expect(claims.auth_time).toBeUndefined();

    const userinfo = await h.fetchBroker(`${h.issuer}/userinfo`, {
      headers: { Authorization: `Bearer ${body.access_token}` },
    });
    expect(userinfo.status).toBe(200);
    expect(await userinfo.json()).toMatchObject({ sub: claims.sub, connector: "fake" });

    const signIns = h.memory.db.contents().signIns;
    expect(signIns).toHaveLength(1);
    expect(signIns[0]).toMatchObject({ ref, clientId, connector: "fake", sub: claims.sub });
    expect(signIns[0]).not.toHaveProperty("email");

    // The subject is public: the provider's own id, so another app of the same user gets the same.
    expect(claims.sub).toBe("fake:42");
    const other = await h.registerClient({ appName: "Other", redirectUri: REDIRECT_URI });
    const otherPkce = await pkce();
    const otherBack = await completeUpstream(
      h,
      await h.fetchBroker(
        authorizeUrl(h, { clientId: other.clientId, challenge: otherPkce.challenge }),
      ),
    );
    const otherTokens = await tokensOf(
      await exchange(h, {
        code: codeOf(otherBack),
        clientId: other.clientId,
        clientSecret: other.clientSecret,
        verifier: otherPkce.verifier,
      }),
    );
    expect(decodeJwt(otherTokens.id_token)).toMatchObject({ sub: claims.sub });
    expect(h.fetch.unexpected).toEqual([]);
  });

  test("a code is single use, bound to the client and the verifier; replay revokes it", async () => {
    const h = await fakeBroker();
    const { clientId, clientSecret } = await h.registerClient({
      appName: "My app",
      redirectUri: REDIRECT_URI,
    });
    const other = await h.registerClient({ appName: "Other", redirectUri: REDIRECT_URI });
    const { verifier, challenge } = await pkce();
    const back = await completeUpstream(
      h,
      await h.fetchBroker(authorizeUrl(h, { clientId, challenge })),
    );
    const code = codeOf(back);

    const wrongVerifier = await exchange(h, {
      code,
      clientId,
      clientSecret,
      verifier: `${verifier.slice(0, -1)}${verifier.endsWith("x") ? "y" : "x"}`,
    });
    expect(wrongVerifier.status).toBe(400);
    expect(await wrongVerifier.json()).toEqual({
      error: "invalid_grant",
      error_description: "code_verifier does not match code_challenge.",
    });

    const wrongClient = await exchange(h, {
      code,
      clientId: other.clientId,
      clientSecret: other.clientSecret,
      verifier,
    });
    expect(await errorOf(wrongClient)).toEqual({
      error: "invalid_grant",
      error_description: "The authorization code belongs to another client.",
    });

    const wrongSecret = await exchange(h, { code, clientId, clientSecret: "nope", verifier });
    expect(wrongSecret.status).toBe(401);
    expect(wrongSecret.headers.get("www-authenticate")).toBe('Basic realm="token"');

    const wrongRedirect = await exchange(h, {
      code,
      clientId,
      clientSecret,
      verifier,
      redirectUri: "https://app.test/other",
    });
    expect(await errorOf(wrongRedirect)).toEqual({
      error: "invalid_grant",
      error_description: "redirect_uri does not match the authorization request.",
    });

    expect((await exchange(h, { code, clientId, clientSecret, verifier })).status).toBe(200);
    const replay = await exchange(h, { code, clientId, clientSecret, verifier });
    expect(replay.status).toBe(400);
    expect((await errorOf(replay)).error_description).toBe(
      "The authorization code was already used.",
    );
    // The replay removed the marker: the next attempt finds no code.
    const after = await exchange(h, { code, clientId, clientSecret, verifier });
    expect((await errorOf(after)).error_description).toBe("The authorization code is unknown.");
  });

  test("a code expires 60 seconds after the callback", async () => {
    const h = await fakeBroker();
    const { clientId, clientSecret } = await h.registerClient({
      appName: "My app",
      redirectUri: REDIRECT_URI,
    });
    const { verifier, challenge } = await pkce();
    const back = await completeUpstream(
      h,
      await h.fetchBroker(authorizeUrl(h, { clientId, challenge })),
    );
    h.clock.advance(60_000);
    const late = await exchange(h, { code: codeOf(back), clientId, clientSecret, verifier });
    expect(await late.json()).toEqual({
      error: "invalid_grant",
      error_description: "The authorization code expired.",
    });
  });

  test("a client with two addresses signs in on either, and a code is bound to the one it named", async () => {
    const h = await fakeBroker();
    const connections = "https://app.test/auth/hub/callback";
    const { clientId, clientSecret } = await h.registerClient({
      appName: "My app",
      redirectUri: REDIRECT_URI,
      otherRedirectUris: [connections],
    });
    const { verifier, challenge } = await pkce();
    const back = await completeUpstream(
      h,
      await h.fetchBroker(
        authorizeUrl(h, { clientId, challenge, extra: { redirect_uri: connections } }),
      ),
    );
    const location = new URL(back.headers.get("location") ?? "");
    expect(location.origin + location.pathname).toBe(connections);
    const code = location.searchParams.get("code") ?? "";
    // RFC 6749 section 4.1.3: the exchange names the same address, not another listed one.
    const otherListed = await exchange(h, { code, clientId, clientSecret, verifier });
    expect(await otherListed.json()).toMatchObject({ error: "invalid_grant" });
    const same = await exchange(h, {
      code,
      clientId,
      clientSecret,
      verifier,
      redirectUri: connections,
    });
    expect(same.status).toBe(200);
    const unlisted = await h.fetchBroker(
      authorizeUrl(h, {
        clientId,
        challenge,
        extra: { redirect_uri: "https://app.test/third/callback" },
      }),
    );
    expect(unlisted.status).toBe(400);
    expect(unlisted.headers.get("location")).toBeNull();
  });

  test("the query of a redirect URI is retained, and one with a response parameter is refused (RFC 6749 section 3.1.2)", async () => {
    const h = await fakeBroker();
    const kept = `${REDIRECT_URI}?keep=1`;
    const taken = `${REDIRECT_URI}?iss=x&keep=1`;
    const { clientId } = await h.registerClient({
      appName: "My app",
      redirectUri: kept,
      otherRedirectUris: [taken],
    });
    const { challenge } = await pkce();
    const back = await completeUpstream(
      h,
      await h.fetchBroker(authorizeUrl(h, { clientId, challenge, extra: { redirect_uri: kept } })),
    );
    const location = new URL(back.headers.get("location") ?? "");
    expect(location.searchParams.get("keep")).toBe("1");
    expect(location.searchParams.get("code")).toBeTruthy();
    const refused = await h.fetchBroker(
      authorizeUrl(h, { clientId, challenge, extra: { redirect_uri: taken } }),
    );
    expect(refused.status).toBe(400);
    expect(refused.headers.get("location")).toBeNull();
  });

  test("every refusal before the user continued is a page of the hub, never a redirect", async () => {
    const h = await fakeBroker();
    const { clientId } = await h.registerClient({ appName: "My app", redirectUri: REDIRECT_URI });
    const { challenge } = await pkce();

    const unknownClient = await h.fetchBroker(
      authorizeUrl(h, { clientId: "cl_unknown", challenge }),
    );
    expect(unknownClient.status).toBe(400);
    expect(unknownClient.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(await unknownClient.text()).toContain(
      "The client_id is not registered with this provider.",
    );

    const otherRedirect = authorizeUrl(h, { clientId, challenge });
    otherRedirect.searchParams.set("redirect_uri", "https://evil.example/cb");
    const badRedirect = await h.fetchBroker(otherRedirect);
    expect(badRedirect.status).toBe(400);
    expect(badRedirect.headers.get("location")).toBeNull();

    for (const [name, value] of [
      ["redirect_uri", "https://evil.example/cb"],
      ["client_id", "cl_other"],
      ["state", "other-state"],
    ] as const) {
      const repeated = authorizeUrl(h, { clientId, challenge });
      repeated.searchParams.append(name, value);
      const response = await h.fetchBroker(repeated);
      expect(response.status).toBe(400);
      expect(response.headers.get("location")).toBeNull();
      expect(response.headers.get("content-type")).toMatch(/text\/html/);
      expect(await response.text()).toContain("A parameter is repeated.");
    }

    const refusedWith = async (extra: Record<string, string>, description: string) => {
      const refused = await h.fetchBroker(authorizeUrl(h, { clientId, challenge, extra }));
      expect(refused.status).toBe(400);
      expect(refused.headers.get("location")).toBeNull();
      expect(refused.headers.get("content-type")).toMatch(/text\/html/);
      expect(await refused.text()).toContain(description);
    };
    await refusedWith({ scope: "email" }, "scope must include openid.");
    await refusedWith({ prompt: "none" }, "This provider has no session to reuse.");
    await refusedWith({ request: "x" }, "Request Objects are not supported.");
    await refusedWith({ request_uri: "x" }, "request_uri is not supported.");
    await refusedWith({ response_mode: "form_post" }, "response_mode must be query.");
    await refusedWith({ code_challenge_method: "plain" }, "code_challenge_method must be S256.");
    await refusedWith({ max_age: "-1" }, "max_age must be a non-negative integer.");
    await refusedWith({ connector: "nope" }, "This client cannot use the connector");
    for (const extra of [{ prompt: "login" }, { max_age: "300" }]) {
      await refusedWith(
        extra,
        "This sign-in method cannot reauthenticate the user, which prompt=login or max_age asked for.",
      );
    }
    // A refused request stores nothing and spends no budget.
    expect(h.memory.db.contents().authRequests).toEqual([]);
    expect(h.memory.db.contents().signInBudgets).toEqual([]);
  });

  test("a POST to /authorize must be a form", async () => {
    const h = await fakeBroker();
    const response = await h.fetchBroker(`${h.issuer}/authorize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(response.status).toBe(415);
    expect(await response.json()).toEqual({
      error: "invalid_request",
      error_description: "A POST must be application/x-www-form-urlencoded.",
    });
    const { clientId } = await h.registerClient({ appName: "My app", redirectUri: REDIRECT_URI });
    const { challenge } = await pkce();
    const form = await h.fetchBroker(`${h.issuer}/authorize`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
      body: authorizeUrl(h, { clientId, challenge }).searchParams.toString(),
    });
    expect(form.status).toBe(302);
  });

  test("Google documents no prompt=login, so a fresh login through it is refused", async () => {
    const h = await createBroker({
      config: {
        connectors: [
          Effect.runSync(
            readConnector(
              google({
                clientId: Effect.succeed(Redacted.make("google-client")),
                clientSecret: Effect.succeed(Redacted.make("s")),
                selectAccount: false,
              }),
            ),
          ),
        ],
      },
    });
    const { clientId } = await h.registerClient({ appName: "My app", redirectUri: REDIRECT_URI });
    for (const extra of [{ prompt: "login" }, { max_age: "0" }]) {
      const { challenge } = await pkce();
      const response = await h.fetchBroker(authorizeUrl(h, { clientId, challenge, extra }));
      expect(response.status).toBe(400);
      expect(await response.text()).toContain(
        "This sign-in method cannot reauthenticate the user, which prompt=login or max_age asked for.",
      );
    }
    expect(h.fetch.requests).toEqual([]);
  });

  /**
   * One sign-in through the fake OIDC provider. `authTime` gets the second the request was created
   * in and returns the `auth_time` the provider signs (`undefined`: none).
   */
  async function oidcSignIn(
    h: Broker,
    idp: Awaited<ReturnType<typeof fakeOidcUpstream>>,
    args: {
      clientId: string;
      extra: Record<string, string>;
      authTime: (createdSecond: number) => number | undefined;
    },
  ) {
    const { challenge, verifier } = await pkce();
    const started = await h.fetchBroker(
      authorizeUrl(h, { clientId: args.clientId, challenge, extra: args.extra }),
    );
    const upstream = new URL(started.headers.get("location") ?? "");
    expect(upstream.origin).toBe("https://server.example.com");
    const state = upstream.searchParams.get("state") ?? "";
    const stateHash = await sha256Hex(state);
    const stored = h.memory.db
      .contents()
      .authRequests.find(
        (request) => request.status === "upstream" && request.upstreamStateHash === stateHash,
      );
    if (stored === undefined) {
      throw new Error("/authorize stored no request for the upstream state");
    }
    const createdSecond = Math.floor(stored.createdAt / 1000);
    idp.nextIdToken({
      nonce: upstream.searchParams.get("nonce") ?? "",
      authTime: args.authTime(createdSecond),
    });
    const callback = new URL(upstream.searchParams.get("redirect_uri") ?? "");
    callback.searchParams.set("code", "upstream-code");
    callback.searchParams.set("state", state);
    const back = await h.fetchBroker(callback, { headers: txnCookie(started) });
    expect(back.status).toBe(302);
    return {
      prompt: upstream.searchParams.get("prompt"),
      maxAge: upstream.searchParams.get("max_age"),
      location: new URL(back.headers.get("location") ?? ""),
      verifier,
      requestId: stored.requestId,
      createdSecond,
    };
  }

  async function oidcBroker() {
    const fetch = stubFetch();
    const idp = await fakeOidcUpstream(fetch);
    const h = await createBroker({ fetch, config: { connectors: [idp.connector] } });
    return { h, idp };
  }

  test("a fresh login completes only with an upstream auth_time inside the request, give or take 60 seconds", async () => {
    // Every clock stands still: the provider's tokens, the hub's and the Store's.
    vi.useFakeTimers({ now: 1_800_000_000_500, toFake: ["Date"] });
    const { h, idp } = await oidcBroker();
    h.clock.set(1_800_000_000_500);
    const { clientId, clientSecret } = await h.registerClient({
      appName: "My app",
      redirectUri: REDIRECT_URI,
    });
    const accepted = new Map([
      [-61, false],
      [-60, true],
      [-1, true],
      [0, true],
      [60, true],
      [61, false],
    ]);
    for (const extra of [{ prompt: "login" }, { max_age: "300" }]) {
      for (const offset of [undefined, ...accepted.keys()]) {
        const signIn = await oidcSignIn(h, idp, {
          clientId,
          extra,
          authTime: (created) => (offset === undefined ? undefined : created + offset),
        });
        expect(signIn.createdSecond).toBe(1_800_000_000);
        expect(signIn.prompt).toBe("login");
        expect(signIn.maxAge).toBe("0");
        if (offset === undefined || !accepted.get(offset)) {
          expect(signIn.location.origin + signIn.location.pathname).toBe(REDIRECT_URI);
          expect(signIn.location.searchParams.get("error")).toBe("login_required");
          expect(signIn.location.searchParams.get("error_description")).toBe(
            "The provider did not confirm a new login, which prompt=login or max_age asked for.",
          );
          expect(signIn.location.searchParams.get("code")).toBeNull();
          // The request is abandoned: nothing is left to finish.
          expect(h.memory.run("authRequests.get", { requestId: signIn.requestId })).toBeNull();
          continue;
        }
        const code = signIn.location.searchParams.get("code") ?? "";
        expect(code).not.toBe("");
        const tokens = await exchange(h, {
          code,
          clientId,
          clientSecret,
          verifier: signIn.verifier,
        });
        expect(tokens.status).toBe(200);
        const idToken = decodeJwt((await tokensOf(tokens)).id_token);
        expect(idToken.auth_time).toBe(signIn.createdSecond + offset);
      }
    }
  });

  test("without a fresh login, the id_token has no auth_time, upstream auth_time or not", async () => {
    const { h, idp } = await oidcBroker();
    const { clientId, clientSecret } = await h.registerClient({
      appName: "My app",
      redirectUri: REDIRECT_URI,
    });
    for (const offset of [undefined, -3600]) {
      const signIn = await oidcSignIn(h, idp, {
        clientId,
        extra: {},
        authTime: (created) => (offset === undefined ? undefined : created + offset),
      });
      expect(signIn.prompt).toBeNull();
      expect(signIn.maxAge).toBeNull();
      const code = signIn.location.searchParams.get("code") ?? "";
      expect(code).not.toBe("");
      const tokens = await exchange(h, { code, clientId, clientSecret, verifier: signIn.verifier });
      expect(tokens.status).toBe(200);
      const idToken = decodeJwt((await tokensOf(tokens)).id_token);
      // Neither the callback's time nor the upstream's hour-old value: the hub cannot know it.
      expect(idToken.auth_time).toBeUndefined();
      expect(idToken.sub).toBe("idp:24400320");
    }
  });

  test("a callback in another browser is refused and stays claimable", async () => {
    const h = await fakeBroker();
    const { clientId } = await h.registerClient({ appName: "My app", redirectUri: REDIRECT_URI });
    const { challenge } = await pkce();
    const started = await h.fetchBroker(authorizeUrl(h, { clientId, challenge }));
    const upstreamUrl = new URL(started.headers.get("location") ?? "");
    const callback = new URL(upstreamUrl.searchParams.get("redirect_uri") ?? "");
    callback.searchParams.set("code", "upstream-code");
    callback.searchParams.set("state", upstreamUrl.searchParams.get("state") ?? "");
    const refused = await h.fetchBroker(callback);
    expect(refused.status).toBe(400);
    expect(await refused.text()).toContain("did not start in this browser");
    const back = await h.fetchBroker(callback, { headers: txnCookie(started) });
    expect(new URL(back.headers.get("location") ?? "").searchParams.has("code")).toBe(true);
  });

  test("an id_token_hint for one user never ends in a code for another", async () => {
    const h = await fakeBroker({ userId: "1" });
    const { clientId, clientSecret } = await h.registerClient({
      appName: "My app",
      redirectUri: REDIRECT_URI,
    });
    const first = await pkce();
    const back = await completeUpstream(
      h,
      await h.fetchBroker(authorizeUrl(h, { clientId, challenge: first.challenge })),
    );
    const tokens = await exchange(h, {
      code: codeOf(back),
      clientId,
      clientSecret,
      verifier: first.verifier,
    });
    const { id_token } = await tokensOf(tokens);
    expect(decodeJwt(id_token).sub).toBe("fake:1");
    fakeUpstream(h.fetch, { userId: "2" });
    const { challenge } = await pkce();
    const hinted = await h.fetchBroker(
      authorizeUrl(h, { clientId, challenge, extra: { id_token_hint: id_token } }),
    );
    expect(hinted.status).toBe(400);
    expect(hinted.headers.get("location")).toBeNull();
    expect(await hinted.text()).toContain("id_token_hint is not supported.");
  });

  test("an upstream id that makes a sub longer than 255 ASCII characters gets no code", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (const [userId, accepted] of [
      ["1".repeat(250), true],
      ["1".repeat(251), false],
      ["é", false],
    ] as const) {
      const h = await fakeBroker({ userId });
      const { clientId } = await h.registerClient({
        appName: "My app",
        redirectUri: REDIRECT_URI,
      });
      const { challenge } = await pkce();
      const back = await completeUpstream(
        h,
        await h.fetchBroker(authorizeUrl(h, { clientId, challenge })),
      );
      const location = new URL(back.headers.get("location") ?? "");
      expect(location.searchParams.has("code")).toBe(accepted);
      expect(location.searchParams.get("error")).toBe(accepted ? null : "server_error");
    }
  });

  test("a parameter sent without a value counts as omitted", async () => {
    const h = await fakeBroker({
      connectors: (fake) => [fake, { ...fake, name: "other", label: "Other" }],
    });
    const { clientId } = await h.registerClient({ appName: "My app", redirectUri: REDIRECT_URI });
    const { challenge } = await pkce();
    const page = await h.fetchBroker(
      authorizeUrl(h, { clientId, challenge, extra: { connector: "  " } }),
    );
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("Continue with Other");
    const started = await h.fetchBroker(
      authorizeUrl(h, {
        clientId,
        challenge,
        extra: { max_age: "", state: "", connector: "fake" },
      }),
    );
    const location = new URL((await completeUpstream(h, started)).headers.get("location") ?? "");
    expect(location.searchParams.has("code")).toBe(true);
    expect(location.searchParams.has("state")).toBe(false);
  });

  test("a replayed or unknown upstream state is refused, a denied upstream goes back as access_denied", async () => {
    const h = await fakeBroker();
    const { clientId } = await h.registerClient({ appName: "My app", redirectUri: REDIRECT_URI });
    const { challenge } = await pkce();
    const started = await h.fetchBroker(authorizeUrl(h, { clientId, challenge }));
    const upstreamUrl = new URL(started.headers.get("location") ?? "");
    const callback = new URL(upstreamUrl.searchParams.get("redirect_uri") ?? "");
    callback.searchParams.set("state", upstreamUrl.searchParams.get("state") ?? "");
    const browser = { headers: txnCookie(started) };
    const denied = new URL(callback);
    denied.searchParams.set("error", "access_denied");
    const deniedResponse = await h.fetchBroker(denied, browser);
    expect(deniedResponse.status).toBe(302);
    const deniedAt = new URL(deniedResponse.headers.get("location") ?? "");
    expect(deniedAt.searchParams.get("error")).toBe("access_denied");
    expect(deniedAt.searchParams.get("error_description")).toBe(
      "The provider sign-in was declined.",
    );
    callback.searchParams.set("code", "upstream-code");
    const replay = await h.fetchBroker(callback, browser);
    expect(replay.status).toBe(400);
    expect(await replay.text()).toContain("This sign-in link is invalid or was already used.");
    const unknown = new URL(callback);
    unknown.searchParams.set("state", "nope");
    expect((await h.fetchBroker(unknown, browser)).status).toBe(400);
    const stateless = new URL(callback);
    stateless.searchParams.delete("state");
    const noState = await h.fetchBroker(stateless, browser);
    expect(noState.status).toBe(400);
    expect(await noState.text()).toContain("The provider sent no state.");
  });

  test("a state started for one connector does not finish through another's callback", async () => {
    const h = await fakeBroker({
      connectors: (fake) => [fake, { ...fake, name: "other", label: "Other" }],
    });
    const { clientId } = await h.registerClient({ appName: "My app", redirectUri: REDIRECT_URI });
    const { challenge } = await pkce();
    const started = await h.fetchBroker(
      authorizeUrl(h, { clientId, challenge, extra: { connector: "fake" } }),
    );
    const upstreamUrl = new URL(started.headers.get("location") ?? "");
    const crossed = new URL(`${h.issuer}/connectors/other/callback`);
    crossed.searchParams.set("code", "upstream-code");
    crossed.searchParams.set("state", upstreamUrl.searchParams.get("state") ?? "");
    expect((await h.fetchBroker(crossed, { headers: txnCookie(started) })).status).toBe(400);
    const back = await completeUpstream(h, started);
    expect(codeOf(back)).toBeTruthy();
  });

  test("provider errors are logged by class name and answered with a fixed description", async () => {
    const h = await fakeBroker();
    const { clientId } = await h.registerClient({ appName: "My app", redirectUri: REDIRECT_URI });
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const callback = async (params: Record<string, string>) => {
      const { challenge } = await pkce();
      const started = await h.fetchBroker(authorizeUrl(h, { clientId, challenge }));
      const upstreamUrl = new URL(started.headers.get("location") ?? "");
      const url = new URL(upstreamUrl.searchParams.get("redirect_uri") ?? "");
      url.searchParams.set("state", upstreamUrl.searchParams.get("state") ?? "");
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
      const back = await h.fetchBroker(url, { headers: txnCookie(started) });
      const location = new URL(back.headers.get("location") ?? "");
      return {
        error: location.searchParams.get("error"),
        description: location.searchParams.get("error_description"),
      };
    };
    expect(await callback({ code: "refused-code" })).toEqual({
      error: "server_error",
      description: "The provider sign-in failed.",
    });
    expect(logged).toHaveBeenCalledTimes(1);
    expect(logged.mock.calls[0]).toEqual([expect.stringMatching(/^Connector "fake" failed: \w+$/)]);
    expect(
      await callback({ error: "temporarily_unavailable", error_description: "Upstream detail" }),
    ).toEqual({
      error: "temporarily_unavailable",
      description: "The provider is temporarily unavailable.",
    });
    expect(
      await callback({ error: "invalid_scope", error_description: "Upstream detail" }),
    ).toEqual({ error: "server_error", description: "The provider sign-in failed." });
  });

  test("a client authenticates by the method it registered, and by one method only", async () => {
    const h = await fakeBroker();
    const posting = await h.registerClient({ appName: "My app", redirectUri: REDIRECT_URI });
    const { clientId, clientSecret } = await h.registerClient({
      appName: "My app",
      redirectUri: REDIRECT_URI,
      tokenEndpointAuthMethod: "client_secret_basic",
    });
    const basic = (id: string, secret: string) => `Basic ${btoa(`${id}:${secret}`)}`;
    const { verifier, challenge } = await pkce();
    const back = await completeUpstream(
      h,
      await h.fetchBroker(authorizeUrl(h, { clientId, challenge })),
    );
    const code = codeOf(back);
    const redeem = (headers: Record<string, string>, credentials: Record<string, string>) =>
      h.fetchBroker(`${h.issuer}/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", ...headers },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          code_verifier: verifier,
          redirect_uri: REDIRECT_URI,
          ...credentials,
        }).toString(),
      });
    const both = await redeem(
      { Authorization: basic(clientId, clientSecret) },
      { client_id: clientId, client_secret: clientSecret },
    );
    expect(both.status).toBe(400);
    expect(await errorOf(both)).toEqual({
      error: "invalid_request",
      error_description: "Use one client authentication method, not two.",
    });
    for (const authorization of [
      basic(clientId, "wrong"),
      `Basic ${btoa("a:%E0%A4%A")}`,
      basic(posting.clientId, posting.clientSecret),
    ]) {
      const response = await redeem({ Authorization: authorization }, {});
      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toBe('Basic realm="token"');
      expect((await errorOf(response)).error).toBe("invalid_client");
    }
    const inBody = await redeem({}, { client_id: clientId, client_secret: clientSecret });
    expect(inBody.status).toBe(401);
    expect(inBody.headers.get("www-authenticate")).toBe('Basic realm="token"');
    expect((await redeem({ Authorization: basic(clientId, clientSecret) }, {})).status).toBe(200);
  });

  test("claims and the granted scope follow the requested scopes", async () => {
    const h = await fakeBroker();
    const { clientId, clientSecret } = await h.registerClient({
      appName: "My app",
      redirectUri: REDIRECT_URI,
    });
    for (const [scope, granted, claimed] of [
      ["openid", "openid", []],
      ["openid email offline_access", "openid email", ["email", "email_verified"]],
      ["profile openid", "openid profile", ["name"]],
    ] as const) {
      const { verifier, challenge } = await pkce();
      const back = await completeUpstream(
        h,
        await h.fetchBroker(authorizeUrl(h, { clientId, challenge, extra: { scope } })),
      );
      const tokens = await tokensOf(
        await exchange(h, { code: codeOf(back), clientId, clientSecret, verifier }),
      );
      expect(tokens.scope).toBe(granted);
      const userinfo = await objectOf(
        await h.fetchBroker(`${h.issuer}/userinfo`, {
          method: "POST",
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        }),
      );
      for (const claims of [decodeJwt(tokens.id_token), userinfo]) {
        expect(
          Object.keys(claims).filter((name) =>
            ["email", "email_verified", "name", "picture"].includes(name),
          ),
        ).toEqual(claimed);
        expect(claims).toMatchObject({ sub: "fake:42", connector: "fake" });
      }
    }
  });

  test("a card with `confirm` shows the page before the connector", async () => {
    const h = await fakeBroker();
    const { clientId } = await h.registerClient({
      appName: "Stranger",
      redirectUri: REDIRECT_URI,
      confirm: true,
    });
    const { challenge } = await pkce();
    const page = await h.fetchBroker(authorizeUrl(h, { clientId, challenge }));
    expect(page.status).toBe(200);
    const setCookie = page.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(
      /^__Host-broker_txn_[\w-]{32}=[\w-]{43}; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=600$/,
    );
    const cookie = setCookie.split(";")[0] ?? "";
    const html = await page.text();
    expect(html).toContain("<title>Sign in to app.test</title>");
    expect(html).not.toContain('class="sub"');
    expect(html).toContain(
      "The app gets your name, picture, and email address. Samebase has not reviewed this app.",
    );
    expect(html).toContain("Continue with Fake");
    // The host, the button, the privacy notice, the terms, and the attribution.
    expect(html.match(/<a /g)).toHaveLength(5);
    expect(html.match(/target="_blank"/g)).toHaveLength(4);
    expect(html).toContain('<a href="https://hub.example.com/privacy"');
    expect(html).toContain('<a href="https://hub.example.com/terms"');
    expect(html).not.toContain("<script");
    expect(html).not.toContain(REDIRECT_URI);
    expect(html).not.toContain("Stranger");
    const href = html.match(/href="([^"]*connector=fake)"/)?.[1]?.replace(/&amp;/g, "&") ?? "";
    const requestId = new URL(`${h.issuer}${href}`).searchParams.get("request") ?? "";
    expect(cookie.startsWith(`__Host-broker_txn_${requestId}=`)).toBe(true);
    const openidOnly = await h.fetchBroker(
      authorizeUrl(h, { clientId, challenge, extra: { scope: "openid" } }),
    );
    expect(await openidOnly.text()).toContain("The app gets only an id for your account.");
  });

  test("the page names the host of the validated return address, with its port", async () => {
    const h = await fakeBroker();
    const { challenge } = await pkce();
    const redirectUri = "https://pr-12.stranger.test/auth/hub/callback";
    const loopback = "http://localhost:5173/auth/hub/callback";
    const { clientId } = await h.registerClient({
      appName: "Stranger",
      redirectUri,
      otherRedirectUris: [loopback],
      confirm: true,
    });
    const html = await (
      await h.fetchBroker(
        authorizeUrl(h, { clientId, challenge, extra: { redirect_uri: redirectUri } }),
      )
    ).text();
    expect(html).toContain(
      '<h1>Sign in to<br><a class="host" href="https://pr-12.stranger.test" target="_blank" rel="noopener noreferrer"><span class="label">pr-12.</span><wbr><span class="label">stranger.</span><wbr><span class="label">test</span></a></h1>',
    );
    const local = await (
      await h.fetchBroker(
        authorizeUrl(h, { clientId, challenge, extra: { redirect_uri: loopback } }),
      )
    ).text();
    expect(local).toContain("<title>Sign in to localhost:5173</title>");
  });

  test("a card without `confirm`: one connector goes straight on and several get the picker", async () => {
    const h = await fakeBroker({
      connectors: (fake) => [fake, { ...fake, name: "other", label: "Other" }],
    });
    const one = await h.registerClient({
      appName: "One",
      redirectUri: REDIRECT_URI,
      connectors: ["fake"],
    });
    const two = await h.registerClient({ appName: "Two", redirectUri: REDIRECT_URI });
    const { challenge } = await pkce();
    const direct = await h.fetchBroker(authorizeUrl(h, { clientId: one.clientId, challenge }));
    expect(direct.status).toBe(302);
    expect(new URL(direct.headers.get("location") ?? "").origin).toBe("https://upstream.test");
    const picker = await h.fetchBroker(authorizeUrl(h, { clientId: two.clientId, challenge }));
    expect(picker.status).toBe(200);
    const html = await picker.text();
    expect(html).toContain("Continue with Fake");
    expect(html).toContain("Continue with Other");
    expect(html).not.toContain('class="sub"');
    expect(html).not.toContain("has not reviewed");
    const named = await h.fetchBroker(
      authorizeUrl(h, { clientId: two.clientId, challenge, extra: { connector: "other" } }),
    );
    expect(new URL(named.headers.get("location") ?? "").searchParams.get("redirect_uri")).toBe(
      `${h.issuer}/connectors/other/callback`,
    );
    const outside = await h.fetchBroker(
      authorizeUrl(h, { clientId: one.clientId, challenge, extra: { connector: "fake other" } }),
    );
    expect(outside.status).toBe(400);
    expect(await outside.text()).toContain(
      "This client cannot use the connector &quot;other&quot;",
    );
  });

  test("a card with only a connector that is not configured gets no sign-in", async () => {
    const h = await fakeBroker();
    vi.spyOn(console, "info").mockImplementation(() => {});
    const { clientId } = await h.registerClient({
      appName: "Stranger",
      redirectUri: REDIRECT_URI,
      connectors: ["gone"],
    });
    const { challenge } = await pkce();
    const page = await h.fetchBroker(authorizeUrl(h, { clientId, challenge }));
    expect(page.status).toBe(403);
    const html = await page.text();
    expect(html).toContain("Sign-in for this app is turned off.");
    expect(html).not.toContain("Continue with");
  });

  const twoConnectors = (issuer?: string) =>
    fakeBroker({
      connectors: (fake) => [fake, { ...fake, name: "other", label: "Other" }],
      ...(issuer === undefined ? {} : { issuer }),
    });

  test("the picker's links work only in the browser that saw the picker", async () => {
    const h = await twoConnectors();
    const { clientId } = await h.registerClient({ appName: "Stranger", redirectUri: REDIRECT_URI });
    const { challenge } = await pkce();
    const page = await h.fetchBroker(authorizeUrl(h, { clientId, challenge }));
    const cookie = (page.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
    const html = await page.text();
    const choose = `${h.issuer}${html.match(/href="([^"]*connector=fake)"/)?.[1]?.replace(/&amp;/g, "&") ?? ""}`;
    const requestId = new URL(choose).searchParams.get("request") ?? "";
    for (const headers of [
      {},
      { Cookie: `__Host-broker_txn_${requestId}=forged` },
      { Cookie: `__Host-broker_txn_other=${cookie.split("=")[1] ?? ""}` },
    ]) {
      const refused = await h.fetchBroker(choose, { headers });
      expect(refused.status).toBe(400);
      expect(await refused.text()).toContain("This sign-in did not start in this browser.");
    }
    expect(h.memory.run("authRequests.get", { requestId })?.status).toBe("pending");
    const chosen = await h.fetchBroker(choose, { headers: { Cookie: `theme=dark; ${cookie}` } });
    expect(chosen.status).toBe(302);
    expect(new URL(chosen.headers.get("location") ?? "").origin).toBe("https://upstream.test");
    // An edited link names a connector outside the request's set: a page, no redirect.
    const edited = await h.fetchBroker(choose.replace("connector=fake", "connector=nope"), {
      headers: { Cookie: cookie },
    });
    expect(edited.status).toBe(404);
    expect(await edited.text()).toContain("That sign-in method is not offered here.");
    const unknown = await h.fetchBroker(`${h.issuer}/continue?request=nope&connector=fake`);
    expect(unknown.status).toBe(404);
    expect(await unknown.text()).toContain("This sign-in is unknown or finished.");
  });

  test("a path issuer scopes the picker cookie to its path", async () => {
    const h = await twoConnectors("https://samebase.test/identity");
    const { clientId } = await h.registerClient({ appName: "Stranger", redirectUri: REDIRECT_URI });
    const { challenge } = await pkce();
    const page = await h.fetchBroker(authorizeUrl(h, { clientId, challenge }));
    expect(page.headers.get("set-cookie")).toMatch(
      /^broker_txn_[\w-]{32}=[\w-]{43}; Path=\/identity; HttpOnly; Secure; SameSite=Lax; Max-Age=600$/,
    );
    expect(await page.text()).toContain('href="/identity/continue?request=');
  });

  test("two sign-ins in one browser keep their own cookies", async () => {
    const h = await twoConnectors();
    const { clientId } = await h.registerClient({ appName: "Stranger", redirectUri: REDIRECT_URI });
    const chooser = async () => {
      const { challenge } = await pkce();
      const page = await h.fetchBroker(authorizeUrl(h, { clientId, challenge }));
      const cookie = (page.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
      const href = (await page.text()).match(/href="([^"]*connector=fake)"/)?.[1] ?? "";
      return { cookie, choose: `${h.issuer}${href.replace(/&amp;/g, "&")}` };
    };
    const first = await chooser();
    const second = await chooser();
    expect(first.cookie.split("=")[0]).not.toBe(second.cookie.split("=")[0]);
    const jar = { Cookie: `${first.cookie}; ${second.cookie}` };
    for (const { choose } of [first, second]) {
      const chosen = await h.fetchBroker(choose, { headers: jar });
      expect(chosen.status).toBe(302);
    }
  });

  test("a picker request's callback without the cookie is refused and stays claimable", async () => {
    const h = await twoConnectors();
    const { clientId, clientSecret } = await h.registerClient({
      appName: "Stranger",
      redirectUri: REDIRECT_URI,
    });
    const { verifier, challenge } = await pkce();
    const page = await h.fetchBroker(authorizeUrl(h, { clientId, challenge }));
    const cookie = (page.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
    const choose = (await page.text()).match(/href="([^"]*connector=fake)"/)?.[1] ?? "";
    const chooseUrl = `${h.issuer}${choose.replace(/&amp;/g, "&")}`;
    const requestId = new URL(chooseUrl).searchParams.get("request") ?? "";
    const started = await h.fetchBroker(chooseUrl, { headers: { Cookie: cookie } });
    const upstreamUrl = new URL(started.headers.get("location") ?? "");
    const callback = new URL(upstreamUrl.searchParams.get("redirect_uri") ?? "");
    callback.searchParams.set("code", "upstream-code");
    callback.searchParams.set("state", upstreamUrl.searchParams.get("state") ?? "");
    for (const headers of [{}, { Cookie: `__Host-broker_txn_${requestId}=forged` }]) {
      const refused = await h.fetchBroker(callback, { headers });
      expect(refused.status).toBe(400);
      expect(refused.headers.get("location")).toBeNull();
      expect(h.memory.run("authRequests.get", { requestId })?.status).toBe("upstream");
    }
    const back = await h.fetchBroker(callback, { headers: { Cookie: cookie } });
    expect(back.status).toBe(302);
    expect(back.headers.get("set-cookie")).toBe(
      `__Host-broker_txn_${requestId}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
    );
    // The request finished: its link now answers 409.
    const again = await h.fetchBroker(chooseUrl, { headers: { Cookie: cookie } });
    expect(again.status).toBe(409);
    expect(
      (await exchange(h, { code: codeOf(back), clientId, clientSecret, verifier })).status,
    ).toBe(200);
  });

  test("every page refuses to be framed", async () => {
    const h = await twoConnectors();
    const { clientId } = await h.registerClient({ appName: "Stranger", redirectUri: REDIRECT_URI });
    const { challenge } = await pkce();
    for (const response of [
      await h.fetchBroker(authorizeUrl(h, { clientId, challenge })),
      await h.fetchBroker(authorizeUrl(h, { clientId: "cl_unknown", challenge })),
    ]) {
      expect(response.headers.get("content-security-policy")).toBe("frame-ancestors 'none'");
      expect(response.headers.get("x-frame-options")).toBe("DENY");
      expect(response.headers.get("referrer-policy")).toBe("no-referrer");
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
  });

  test("a hub's own page gets the facts, and the hub answers it with its own headers", async () => {
    const fetch = stubFetch();
    const { connector } = fakeUpstream(fetch);
    const facts: SignInPageFacts[] = [];
    const h = await createBroker({
      fetch,
      config: { connectors: [connector] },
      signInPage: (pageFacts) => {
        facts.push(pageFacts);
        return `<!doctype html><title>Own</title>${pageFacts.connectors.map((c) => `<a href="${c.href}">${c.label}</a>`).join("")}`;
      },
    });
    const { clientId } = await h.registerClient({
      appName: "Own",
      redirectUri: REDIRECT_URI,
      confirm: true,
    });
    const { challenge } = await pkce();
    const response = await h.fetchBroker(authorizeUrl(h, { clientId, challenge }));
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html.startsWith("<!doctype html><title>Own</title><a href=")).toBe(true);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(response.headers.get("content-security-policy")).toBe("frame-ancestors 'none'");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("set-cookie")).toMatch(/^__Host-broker_txn_/);
    // Exactly these facts: no state, nonce, secret, identity or app name.
    expect(facts).toEqual([
      {
        host: "app.test",
        origin: "https://app.test",
        connectors: [
          {
            label: connector.label,
            provider: connector.provider,
            href: expect.stringMatching(/^\/continue\?request=[^&]+&connector=fake$/),
          },
        ],
        scopes: ["openid", "email", "profile"],
        hub: { name: TEST_SERVICE.name, privacy: TEST_SERVICE.privacy, terms: TEST_SERVICE.terms },
      },
    ]);
    // An error page stays the hub's own.
    const unknown = await h.fetchBroker(authorizeUrl(h, { clientId: "cl_unknown", challenge }));
    expect(await unknown.text()).toContain("Unknown client");
  });
});

describe("handler rules at their edges", () => {
  test("only the __Host- transaction cookie carries a sign-in, at /continue and at the callback", async () => {
    // Two connectors with one label: the page is a picker, and both links read "Fake".
    const h = await fakeBroker({ connectors: (fake) => [fake, { ...fake, name: "other" }] });
    const { clientId, clientSecret } = await h.registerClient({
      appName: "My app",
      redirectUri: REDIRECT_URI,
    });
    const { verifier, challenge } = await pkce();
    const page = await h.fetchBroker(authorizeUrl(h, { clientId, challenge }));
    expect(page.status).toBe(200);
    const hostCookie = txnCookie(page);
    const plantedCookie = { Cookie: hostCookie.Cookie.replace("__Host-", "planted") };
    const requestId = hostCookie.Cookie.split("=")[0]?.replace("__Host-broker_txn_", "") ?? "";
    const link = `${h.issuer}/continue?request=${requestId}&connector=fake`;
    const plantedContinue = await h.fetchBroker(link, { headers: plantedCookie });
    expect(plantedContinue.status).toBe(400);
    expect(plantedContinue.headers.get("location")).toBeNull();
    const started = await h.fetchBroker(link, { headers: hostCookie });
    expect(started.status).toBe(302);
    const provider = new URL(started.headers.get("location") ?? "");
    const callback = new URL(provider.searchParams.get("redirect_uri") ?? "");
    callback.searchParams.set("state", provider.searchParams.get("state") ?? "");
    callback.searchParams.set("code", "upstream-code");
    const plantedCallback = await h.fetchBroker(callback, { headers: plantedCookie });
    expect(plantedCallback.status).toBe(400);
    expect(plantedCallback.headers.get("location")).toBeNull();
    expect(h.fetch.requests.filter((request) => request.method === "POST")).toHaveLength(0);
    const back = await h.fetchBroker(callback, { headers: hostCookie });
    expect(back.status).toBe(302);
    expect(
      (await exchange(h, { code: codeOf(back), clientId, clientSecret, verifier })).status,
    ).toBe(200);
  });

  test.each(["false", "absent"] as const)(
    "never upgrades an email whose verification is %s to verified",
    async (verification) => {
      const h = await fakeBroker({
        connectors: (fake) => [
          {
            ...fake,
            identity: async (accessToken, fetch) => {
              const { emailVerified: _dropped, ...identity } =
                fake.kind === "oauth"
                  ? await fake.identity(accessToken, fetch)
                  : { upstreamId: "", emailVerified: undefined };
              return verification === "false" ? { ...identity, emailVerified: false } : identity;
            },
          },
        ],
      });
      const { clientId, clientSecret } = await h.registerClient({
        appName: "My app",
        redirectUri: REDIRECT_URI,
      });
      for (const claims of await signedInClaims(h, clientId, clientSecret, "openid email")) {
        expect(claims["email"]).toBe("octo@example.com");
        expect(claims["email_verified"]).toBe(false);
      }
    },
  );

  test("releases the picture only with the profile scope", async () => {
    const picture = "https://github.com/images/error/octocat_happy.gif";
    const h = await fakeBroker({
      connectors: (fake) => [
        {
          ...fake,
          identity: async (accessToken, fetch) => ({
            ...(fake.kind === "oauth"
              ? await fake.identity(accessToken, fetch)
              : { upstreamId: "" }),
            picture,
          }),
        },
      ],
    });
    const { clientId, clientSecret } = await h.registerClient({
      appName: "My app",
      redirectUri: REDIRECT_URI,
    });
    for (const scope of ["openid", "openid email", "openid profile"]) {
      for (const claims of await signedInClaims(h, clientId, clientSecret, scope)) {
        if (scope.includes("profile")) {
          expect(claims["picture"]).toBe(picture);
        } else {
          expect(claims).not.toHaveProperty("picture");
        }
      }
    }
  });

  test("sends no one to the provider when a stop lands while the hub reads its discovery", async () => {
    const providerIssuer = "https://stop-during-discovery.test";
    const fetch = stubFetch();
    const { connector } = fakeUpstream(fetch);
    const h = await createBroker({
      fetch,
      config: { connectors: [{ ...connector, issuer: providerIssuer }] },
    });
    const { clientId } = await h.registerClient({
      appName: "My app",
      redirectUri: REDIRECT_URI,
      gates: ["test:repository"],
    });
    const { challenge } = await pkce();
    fetch.plan({
      match: (request) =>
        request.url === `${providerIssuer}/.well-known/oauth-authorization-server`,
      respond: () => {
        h.memory.withTx((tx) => tx.insert("stops", { key: "test:repository", at: h.clock.now() }));
        return Response.json({
          issuer: providerIssuer,
          authorization_endpoint: `${providerIssuer}/authorize`,
          token_endpoint: `${providerIssuer}/token`,
          response_types_supported: ["code"],
        });
      },
    });
    const response = await h.fetchBroker(authorizeUrl(h, { clientId, challenge }));
    expect(response.status).toBe(400);
    expect(response.headers.get("location")).toBeNull();
    expect(await response.text()).toContain("no longer available");
    expect(
      h.memory.db.contents().authRequests.every((request) => request.status === "pending"),
    ).toBe(true);
  });

  test("exchanges a code only from a form body", async () => {
    const h = await fakeBroker();
    const { clientId, clientSecret } = await h.registerClient({
      appName: "My app",
      redirectUri: REDIRECT_URI,
    });
    const { verifier, challenge } = await pkce();
    const back = await completeUpstream(
      h,
      await h.fetchBroker(authorizeUrl(h, { clientId, challenge })),
    );
    const code = codeOf(back);
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      code,
      code_verifier: verifier,
      redirect_uri: REDIRECT_URI,
    }).toString();
    for (const contentType of ["text/plain", "application/json"]) {
      const response = await h.fetchBroker(`${h.issuer}/token`, {
        method: "POST",
        headers: { "Content-Type": contentType },
        body,
      });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: "invalid_request",
        error_description: "The body must be application/x-www-form-urlencoded.",
      });
    }
    expect((await exchange(h, { code, clientId, clientSecret, verifier })).status).toBe(200);
  });

  test("answers invalid_request for a missing or empty grant_type, and unsupported_grant_type for an unknown one", async () => {
    const h = await fakeBroker();
    const { clientId, clientSecret } = await h.registerClient({
      appName: "My app",
      redirectUri: REDIRECT_URI,
    });
    for (const [grantType, error] of [
      [undefined, "invalid_request"],
      ["", "invalid_request"],
      ["password", "unsupported_grant_type"],
      // No resource provider: a refresh grant is an unknown grant (design section 9 item 1).
      ["refresh_token", "unsupported_grant_type"],
    ] as const) {
      const response = await h.fetchBroker(`${h.issuer}/token`, {
        method: "POST",
        body: new URLSearchParams({
          ...(grantType === undefined ? {} : { grant_type: grantType }),
          client_id: clientId,
          client_secret: clientSecret,
        }),
      });
      expect(response.status).toBe(400);
      const body = await errorOf(response);
      expect(body.error).toBe(error);
      expect(body.error_description).toMatch(/^[\x20\x21\x23-\x5B\x5D-\x7E]+$/);
    }
  });

  test("a resource parameter is refused: no API resource is configured", async () => {
    const h = await fakeBroker();
    const { clientId, clientSecret } = await h.registerClient({
      appName: "My app",
      redirectUri: REDIRECT_URI,
    });
    const { verifier, challenge } = await pkce();
    const page = await h.fetchBroker(
      authorizeUrl(h, { clientId, challenge, extra: { resource: "https://api.convex.dev" } }),
    );
    expect(page.status).toBe(400);
    expect(await page.text()).toContain("Request one configured API resource.");
    const back = await completeUpstream(
      h,
      await h.fetchBroker(authorizeUrl(h, { clientId, challenge })),
    );
    const redeem = (resources: string[]) =>
      h.fetchBroker(`${h.issuer}/token`, {
        method: "POST",
        body: new URLSearchParams([
          ["grant_type", "authorization_code"],
          ["code", codeOf(back)],
          ["code_verifier", verifier],
          ["redirect_uri", REDIRECT_URI],
          ["client_id", clientId],
          ["client_secret", clientSecret],
          ...resources.map((resource): [string, string] => ["resource", resource]),
        ]),
      });
    expect(await (await redeem(["https://a.test", "https://b.test"])).json()).toEqual({
      error: "invalid_target",
      error_description: "Request one API resource.",
    });
    expect(await (await redeem(["https://a.test"])).json()).toEqual({
      error: "invalid_target",
      error_description: "This authorization did not grant an API resource.",
    });
  });

  test("answers 401 at /userinfo: the realm challenge with no Bearer header, invalid_token for a bad one (RFC 6750 section 3)", async () => {
    const h = await fakeBroker();
    const form = { "Content-Type": "application/x-www-form-urlencoded" };
    for (const [url, init] of [
      [`${h.issuer}/userinfo`, {}],
      [`${h.issuer}/userinfo?access_token=x`, {}],
      [`${h.issuer}/userinfo`, { method: "POST", headers: form, body: "access_token=x" }],
    ] as const) {
      const response = await h.fetchBroker(url, init);
      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toBe('Bearer realm="userinfo"');
      expect(await response.text()).toBe("");
    }
    for (const method of ["GET", "POST"]) {
      const response = await h.fetchBroker(`${h.issuer}/userinfo`, {
        method,
        headers: { Authorization: "Bearer invalid" },
      });
      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toBe('Bearer error="invalid_token"');
      expect(await response.json()).toEqual({
        error: "invalid_token",
        error_description: "The token is invalid.",
      });
    }
  });

  test("a missing key set is a server error with no detail", async () => {
    const h = await fakeBroker();
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    h.keys.set(undefined);
    const response = await h.fetchBroker(`${h.issuer}/.well-known/jwks.json`);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "server_error" });
    expect(logged.mock.calls.map(([line]) => hubLogLine(line))).toEqual([
      {
        message: "hub_error",
        level: "ERROR",
        annotations: { route: "/.well-known/jwks.json", category: "defect" },
        spans: {},
      },
    ]);
  });

  test("an unknown path or method answers 404", async () => {
    const h = await fakeBroker();
    expect((await h.fetchBroker(`${h.issuer}/nope`)).status).toBe(404);
    expect((await h.fetchBroker(`${h.issuer}/token`)).status).toBe(404);
    // Without a layer's routes there is no registration endpoint.
    expect((await h.fetchBroker(`${h.issuer}/register`, { method: "POST" })).status).toBe(404);
  });
});
