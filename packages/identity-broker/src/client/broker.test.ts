/// <reference types="vite-plus/client" />
import { decodeJwt } from "jose";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { api } from "../component/_generated/api.js";
import { google } from "./connectors/google.js";
import { defineIdentityBroker } from "./index.js";
import { testClientRecord } from "./registeredBy.test.helper.js";
import {
  component,
  createHarness,
  fakeOidcUpstream,
  fakeUpstream,
  ISSUER,
  pkce,
  sha256Hex,
  txnCookie,
  type Harness,
} from "./harness.test.helper.js";
import { hubRegistration, testPolicy } from "./hub.test.helper.js";

const REDIRECT_URI = "https://app.test/oauth/hub/callback";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function authorizeUrl(
  h: Harness,
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
async function completeUpstream(h: Harness, authorizeResponse: Response) {
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
  h: Harness,
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
      ...(args.redirectUri === undefined ? {} : { redirect_uri: args.redirectUri }),
    }).toString(),
  });
}

describe("issuer", () => {
  test("is https, or http on a loopback host", () => {
    const config = { component, keys: () => undefined, connectors: [fakeUpstream().connector] };
    expect(() => defineIdentityBroker({ ...config, issuer: "http://auth.test" })).toThrow(
      "must be https",
    );
    expect(() =>
      defineIdentityBroker({ ...config, issuer: "http://127.0.0.1:3211" }),
    ).not.toThrow();
  });
});

describe("connectors", () => {
  test("a provider is [a-z0-9-]+, and its connectors share one issuer", () => {
    const { connector } = fakeUpstream();
    const config = { component, keys: () => undefined, issuer: ISSUER };
    expect(() =>
      defineIdentityBroker({ ...config, connectors: [{ ...connector, provider: "fake:x" }] }),
    ).toThrow("has a provider that is not [a-z0-9-]+");
    const second = { ...connector, name: "other" };
    expect(() =>
      defineIdentityBroker({ ...config, connectors: [connector, second] }),
    ).not.toThrow();
    expect(() =>
      defineIdentityBroker({
        ...config,
        connectors: [connector, { ...second, issuer: "https://other.test" }],
      }),
    ).toThrow('The connectors of provider "fake" have two issuers');
  });
});

describe("metadata", () => {
  test("both discovery documents and the JWKS", async () => {
    const h = await createHarness({ connectors: [fakeUpstream().connector] });
    for (const path of [
      "/.well-known/openid-configuration",
      "/.well-known/oauth-authorization-server",
    ]) {
      const response = await h.fetchBroker(`${ISSUER}${path}`);
      expect(response.status).toBe(200);
      const metadata = await response.json();
      expect(metadata.issuer).toBe(ISSUER);
      expect(metadata.jwks_uri).toBe(`${ISSUER}/.well-known/jwks.json`);
      expect(metadata.subject_types_supported).toEqual(["public"]);
      expect(metadata.code_challenge_methods_supported).toEqual(["S256"]);
      expect(metadata.authorization_response_iss_parameter_supported).toBe(true);
      expect(metadata.claims_supported).toContain("connector");
      expect(metadata.claims_supported).not.toContain("connector_account_id");
      expect(metadata.connectors_supported).toEqual(["fake"]);
      expect(metadata.registration_endpoint).toBeUndefined();
    }
    const jwks = await (await h.fetchBroker(`${ISSUER}/.well-known/jwks.json`)).json();
    expect(jwks.keys).toHaveLength(1);
    expect(jwks.keys[0].d).toBeUndefined();
  });

  test("a path issuer serves the RFC 8414 location with the path after the segment", async () => {
    const h = await createHarness({
      connectors: [fakeUpstream().connector],
      issuer: "https://samebase.test/identity",
    });
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

describe("clients", () => {
  test("a deleted client cannot sign in", async () => {
    const h = await createHarness({ connectors: [fakeUpstream().connector] });
    const { clientId } = await h.registerClient({ appName: "Bristol", redirectUri: REDIRECT_URI });
    await h.t.mutation(api.clients.remove, { clientId });
    const { challenge } = await pkce();
    expect((await h.fetchBroker(authorizeUrl(h, { clientId, challenge }))).status).toBe(400);
  });
});

describe("app deletion", () => {
  test("with the app row gone, its clients are refused before their rows are", async () => {
    const h = await createHarness({ connectors: [fakeUpstream().connector] });
    const { appId, clientId, clientSecret } = await h.registerClient({
      appName: "Bristol",
      redirectUri: REDIRECT_URI,
    });
    const { verifier, challenge } = await pkce();
    const back = await completeUpstream(
      h,
      await h.fetchBroker(authorizeUrl(h, { clientId, challenge })),
    );
    const code = new URL(back.headers.get("location") ?? "").searchParams.get("code") ?? "";
    // What deleteApp leaves after its first transaction for an app with more than 200 clients: the
    // app row is gone, and the client waits for a later batch.
    await h.t.run(async (ctx) => {
      const app = await ctx.db
        .query("apps")
        .withIndex("by_app_id", (q) => q.eq("appId", appId))
        .unique();
      if (app !== null) await ctx.db.delete("apps", app._id);
    });
    expect(await h.t.query(api.clients.get, { clientId })).not.toBeNull();

    // Nobody has continued from a page: the refusal is a page of the hub, not a redirect.
    const authorized = await h.fetchBroker(authorizeUrl(h, { clientId, challenge }));
    expect(authorized.status).toBe(400);
    expect(authorized.headers.get("location")).toBeNull();
    expect(await authorized.text()).toContain("The client's app is gone.");

    const tokens = await exchange(h, { code, clientId, clientSecret, verifier });
    expect(tokens.status).toBe(401);
    expect((await tokens.json()).error).toBe("invalid_client");
  });
});

describe("authorization code flow with an OAuth connector", () => {
  test("a client enrolled in one connector goes straight upstream and back with a code", async () => {
    const upstream = fakeUpstream();
    const h = await createHarness({ connectors: [upstream.connector] });
    const { appId, clientId, clientSecret } = await h.registerClient({
      appName: "Bristol",
      redirectUri: REDIRECT_URI,
    });
    const { verifier, challenge } = await pkce();

    const started = await h.fetchBroker(authorizeUrl(h, { clientId, challenge }));
    // One connector and no consent skips the page, not the binding to the browser that started it.
    expect(started.headers.get("set-cookie")).toMatch(
      /^__Host-broker_txn_[^=]+=[^;]+; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=600$/,
    );
    const back = await completeUpstream(h, started);
    expect(back.status).toBe(302);
    // Sending the browser back to the client deletes the cookie.
    expect(back.headers.get("set-cookie")).toMatch(/Max-Age=0$/);
    const location = new URL(back.headers.get("location") ?? "");
    expect(location.origin + location.pathname).toBe(REDIRECT_URI);
    expect(location.searchParams.get("state")).toBe("client-state");
    expect(location.searchParams.get("iss")).toBe(ISSUER);
    const code = location.searchParams.get("code") ?? "";
    expect(code.length).toBeGreaterThan(20);

    const tokens = await exchange(h, {
      code,
      clientId,
      clientSecret,
      verifier,
      redirectUri: REDIRECT_URI,
    });
    expect(tokens.status).toBe(200);
    const body = await tokens.json();
    expect(body.token_type).toBe("Bearer");
    expect(body.scope).toBe("openid email profile");
    const claims = decodeJwt(body.id_token);
    expect(claims.iss).toBe(ISSUER);
    expect(claims.aud).toBe(clientId);
    expect(claims.nonce).toBe("client-nonce");
    expect(claims["email"]).toBe("octo@example.com");
    expect(claims["email_verified"]).toBe(true);
    expect(claims["connector"]).toBe("fake");
    expect(typeof claims.auth_time).toBe("number");

    const userinfo = await h.fetchBroker(`${ISSUER}/userinfo`, {
      headers: { Authorization: `Bearer ${body.access_token}` },
    });
    expect(userinfo.status).toBe(200);
    expect(await userinfo.json()).toMatchObject({ sub: claims.sub, connector: "fake" });

    const signIns = await h.t.run(async (ctx) => await ctx.db.query("signIns").collect());
    expect(signIns).toHaveLength(1);
    expect(signIns[0]).toMatchObject({ appId, clientId, connector: "fake", sub: claims.sub });
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
    const otherCode =
      new URL(otherBack.headers.get("location") ?? "").searchParams.get("code") ?? "";
    const otherTokens = await (
      await exchange(h, {
        code: otherCode,
        clientId: other.clientId,
        clientSecret: other.clientSecret,
        verifier: otherPkce.verifier,
      })
    ).json();
    expect(decodeJwt(otherTokens.id_token)).toMatchObject({ sub: claims.sub });
  });

  test("a code is single use, bound to the client and the verifier; replay revokes it", async () => {
    const upstream = fakeUpstream();
    const h = await createHarness({ connectors: [upstream.connector] });
    const { clientId, clientSecret } = await h.registerClient({
      appName: "Bristol",
      redirectUri: REDIRECT_URI,
    });
    const other = await h.registerClient({ appName: "Other", redirectUri: REDIRECT_URI });
    const { verifier, challenge } = await pkce();
    const back = await completeUpstream(
      h,
      await h.fetchBroker(authorizeUrl(h, { clientId, challenge })),
    );
    const code = new URL(back.headers.get("location") ?? "").searchParams.get("code") ?? "";

    const wrongVerifier = await exchange(h, {
      code,
      clientId,
      clientSecret,
      verifier: `${verifier.slice(0, -1)}x`,
    });
    expect(wrongVerifier.status).toBe(400);
    expect((await wrongVerifier.json()).error).toBe("invalid_grant");

    const wrongClient = await exchange(h, {
      code,
      clientId: other.clientId,
      clientSecret: other.clientSecret,
      verifier,
    });
    expect((await wrongClient.json()).error).toBe("invalid_grant");

    const wrongSecret = await exchange(h, { code, clientId, clientSecret: "nope", verifier });
    expect(wrongSecret.status).toBe(401);

    const wrongRedirect = await exchange(h, {
      code,
      clientId,
      clientSecret,
      verifier,
      redirectUri: "https://app.test/other",
    });
    expect((await wrongRedirect.json()).error).toBe("invalid_grant");

    expect((await exchange(h, { code, clientId, clientSecret, verifier })).status).toBe(200);
    const replay = await exchange(h, { code, clientId, clientSecret, verifier });
    expect(replay.status).toBe(400);
    expect((await replay.json()).error_description).toMatch(/already used/);
  });

  test("every refusal before the user continued is a page of the hub, never a redirect", async () => {
    const h = await createHarness({ connectors: [fakeUpstream().connector] });
    const { clientId } = await h.registerClient({ appName: "Bristol", redirectUri: REDIRECT_URI });
    const { challenge } = await pkce();

    const unknownClient = await h.fetchBroker(
      authorizeUrl(h, { clientId: "cl_unknown", challenge }),
    );
    expect(unknownClient.status).toBe(400);
    expect(unknownClient.headers.get("content-type")).toMatch(/text\/html/);

    const otherRedirect = authorizeUrl(h, { clientId, challenge });
    otherRedirect.searchParams.set("redirect_uri", "https://evil.example/cb");
    const badRedirect = await h.fetchBroker(otherRedirect);
    expect(badRedirect.status).toBe(400);
    expect(badRedirect.headers.get("location")).toBeNull();

    // A repeated parameter of any name is a local page: an ambiguous target is never redirected to.
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

    // Once the client is known too: the user has not accepted the return address (RFC 9700
    // section 4.11.2), so a refusal is a page, with the description the redirect would have carried.
    const refusedWith = async (extra: Record<string, string>, description: string) => {
      const refused = await h.fetchBroker(authorizeUrl(h, { clientId, challenge, extra }));
      expect(refused.status).toBe(400);
      expect(refused.headers.get("location")).toBeNull();
      expect(refused.headers.get("content-type")).toMatch(/text\/html/);
      expect(await refused.text()).toContain(description);
    };
    await refusedWith({ scope: "email" }, "scope must include &quot;openid&quot;.");
    await refusedWith({ prompt: "none" }, "This provider has no session to reuse.");
    // An OAuth connector cannot force a fresh login, whether prompt=login or max_age asked for it.
    for (const extra of [{ prompt: "login" }, { max_age: "300" }]) {
      await refusedWith(
        extra,
        "Fake cannot reauthenticate the user, which prompt=login or max_age asked for.",
      );
    }
    // A refused request stores nothing and spends no budget.
    expect(await h.t.run(async (ctx) => await ctx.db.query("authRequests").collect())).toEqual([]);
  });

  test("Google documents no prompt=login, so a fresh login through it is refused", async () => {
    const h = await createHarness({
      connectors: [google({ clientId: () => "google-client", clientSecret: () => "s" })],
    });
    const { clientId } = await h.registerClient({ appName: "Bristol", redirectUri: REDIRECT_URI });
    for (const extra of [{ prompt: "login" }, { max_age: "0" }]) {
      const { challenge } = await pkce();
      const response = await h.fetchBroker(authorizeUrl(h, { clientId, challenge, extra }));
      expect(response.status).toBe(400);
      expect(await response.text()).toContain(
        "Google cannot reauthenticate the user, which prompt=login or max_age asked for.",
      );
    }
  });

  /**
   * One sign-in through the fake OIDC provider. `authTime` gets the second the request was created
   * in and returns the `auth_time` the provider signs (`undefined`: none).
   */
  async function oidcSignIn(
    h: Harness,
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
    const stored = await h.t.run(
      async (ctx) =>
        await ctx.db
          .query("authRequests")
          .withIndex("by_upstream_state_hash", (q) => q.eq("upstreamStateHash", stateHash))
          .unique(),
    );
    if (stored === null) {
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

  test("a fresh login completes only with an upstream auth_time inside the request, give or take 60 seconds", async () => {
    // The clock stands still, so the request is created and its callback runs in one second.
    vi.useFakeTimers({ now: 1_800_000_000_500, toFake: ["Date"] });
    const idp = await fakeOidcUpstream();
    const h = await createHarness({ connectors: [idp.connector] });
    const { clientId, clientSecret } = await h.registerClient({
      appName: "Bristol",
      redirectUri: REDIRECT_URI,
    });
    // Both ways to ask for a fresh login, against an upstream auth_time that is missing, or this
    // many seconds from the request's second: past each edge of the 60-second skew, on it, inside.
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
            "IdP did not confirm a new login, which prompt=login or max_age asked for.",
          );
          expect(signIn.location.searchParams.get("code")).toBeNull();
          // The request is abandoned: nothing is left to finish.
          expect(await h.t.query(api.authRequests.get, { requestId: signIn.requestId })).toBeNull();
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
        const idToken = decodeJwt((await tokens.json()).id_token);
        expect(idToken.auth_time).toBe(signIn.createdSecond + offset);
      }
    }
  });

  test("without a fresh login, the sign-in completes at the hub's time, upstream auth_time or not", async () => {
    const idp = await fakeOidcUpstream();
    const h = await createHarness({ connectors: [idp.connector] });
    const { clientId, clientSecret } = await h.registerClient({
      appName: "Bristol",
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
      const idToken = decodeJwt((await tokens.json()).id_token);
      // The callback's time, never the upstream's hour-old value.
      expect(idToken.auth_time).toBeGreaterThanOrEqual(signIn.createdSecond);
      // The upstream id_token's `sub`, behind the provider.
      expect(idToken.sub).toBe("idp:24400320");
    }
  });

  test("a callback in another browser is refused and stays claimable", async () => {
    const upstream = fakeUpstream();
    const h = await createHarness({ connectors: [upstream.connector] });
    const { clientId } = await h.registerClient({ appName: "Bristol", redirectUri: REDIRECT_URI });
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

  test("a Request Object is refused, not ignored", async () => {
    const h = await createHarness({ connectors: [fakeUpstream().connector] });
    const { clientId } = await h.registerClient({ appName: "Bristol", redirectUri: REDIRECT_URI });
    const { challenge } = await pkce();
    for (const [parameter, description] of [
      ["request", "Request Objects are not supported."],
      ["request_uri", "request_uri is not supported."],
    ] as const) {
      const refused = await h.fetchBroker(
        authorizeUrl(h, { clientId, challenge, extra: { [parameter]: "x" } }),
      );
      expect(refused.status).toBe(400);
      expect(refused.headers.get("location")).toBeNull();
      expect(await refused.text()).toContain(description);
    }
  });

  test("a parameter sent without a value counts as omitted", async () => {
    const upstream = fakeUpstream();
    const other = { ...upstream.connector, name: "other", label: "Other" };
    const h = await createHarness({ connectors: [upstream.connector, other] });
    const { clientId } = await h.registerClient({ appName: "Bristol", redirectUri: REDIRECT_URI });
    const { challenge } = await pkce();
    // An empty connector offers every connector: the page. An empty max_age is no freshness
    // request, which this connector would have to refuse.
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
    const upstream = fakeUpstream();
    const h = await createHarness({ connectors: [upstream.connector] });
    const { clientId } = await h.registerClient({ appName: "Bristol", redirectUri: REDIRECT_URI });
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
    expect(new URL(deniedResponse.headers.get("location") ?? "").searchParams.get("error")).toBe(
      "access_denied",
    );

    // The claim consumed the request: the same state cannot be used again.
    callback.searchParams.set("code", "upstream-code");
    const replay = await h.fetchBroker(callback, browser);
    expect(replay.status).toBe(400);
    const unknown = new URL(callback);
    unknown.searchParams.set("state", "nope");
    expect((await h.fetchBroker(unknown, browser)).status).toBe(400);
  });

  test("a state started for one connector does not finish through another's callback", async () => {
    const upstream = fakeUpstream();
    const other = { ...upstream.connector, name: "other", label: "Other" };
    const h = await createHarness({ connectors: [upstream.connector, other] });
    const { clientId } = await h.registerClient({ appName: "Bristol", redirectUri: REDIRECT_URI });
    const { challenge } = await pkce();
    const started = await h.fetchBroker(
      authorizeUrl(h, { clientId, challenge, extra: { connector: "fake" } }),
    );
    const upstreamUrl = new URL(started.headers.get("location") ?? "");
    const crossed = new URL(`${ISSUER}/connectors/other/callback`);
    crossed.searchParams.set("code", "upstream-code");
    crossed.searchParams.set("state", upstreamUrl.searchParams.get("state") ?? "");
    expect((await h.fetchBroker(crossed)).status).toBe(400);
    // The request is still waiting for its own connector.
    const back = await completeUpstream(h, started);
    expect(new URL(back.headers.get("location") ?? "").searchParams.get("code")).toBeTruthy();
  });

  test("provider errors are logged by class name and answered with a fixed description", async () => {
    const h = await createHarness({ connectors: [fakeUpstream().connector] });
    const { clientId } = await h.registerClient({ appName: "Bristol", redirectUri: REDIRECT_URI });
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
    // The provider refuses the code; its token response body travels in the thrown error.
    expect(await callback({ code: "refused-code" })).toEqual({
      error: "server_error",
      description: "Fake sign-in failed.",
    });
    expect(logged).toHaveBeenCalledTimes(1);
    expect(logged.mock.calls[0]).toEqual([expect.stringMatching(/^Connector "fake" failed: \w+$/)]);
    expect(
      await callback({ error: "temporarily_unavailable", error_description: "Upstream detail" }),
    ).toEqual({
      error: "temporarily_unavailable",
      description: "Fake is temporarily unavailable.",
    });
    expect(
      await callback({ error: "invalid_scope", error_description: "Upstream detail" }),
    ).toEqual({ error: "server_error", description: "Fake sign-in failed." });
  });

  test("a client authenticates by the method it registered, and by one method only", async () => {
    const h = await createHarness({ connectors: [fakeUpstream().connector] });
    const posting = await h.registerClient({ appName: "Bristol", redirectUri: REDIRECT_URI });
    const { clientId, clientSecret } = await h.registerClient({
      appName: "Bristol",
      redirectUri: REDIRECT_URI,
      deploymentType: "preview",
      tokenEndpointAuthMethod: "client_secret_basic",
    });
    const basic = (id: string, secret: string) => `Basic ${btoa(`${id}:${secret}`)}`;
    const { verifier, challenge } = await pkce();
    const back = await completeUpstream(
      h,
      await h.fetchBroker(authorizeUrl(h, { clientId, challenge })),
    );
    const code = new URL(back.headers.get("location") ?? "").searchParams.get("code") ?? "";
    const redeem = (headers: Record<string, string>, credentials: Record<string, string>) =>
      h.fetchBroker(`${ISSUER}/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", ...headers },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          code_verifier: verifier,
          ...credentials,
        }).toString(),
      });

    // RFC 6749 section 2.3.1: one method per request. The right Basic header with the right body
    // credentials is refused, though the header alone succeeds below.
    const both = await redeem(
      { Authorization: basic(clientId, clientSecret) },
      { client_id: clientId, client_secret: clientSecret },
    );
    expect(both.status).toBe(400);
    expect((await both.json()).error).toBe("invalid_request");
    // A wrong or malformed header, or the header of a client registered for the body, is a 401
    // with a Basic challenge.
    for (const authorization of [
      basic(clientId, "wrong"),
      `Basic ${btoa("a:%E0%A4%A")}`,
      basic(posting.clientId, posting.clientSecret),
    ]) {
      const response = await redeem({ Authorization: authorization }, {});
      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toBe('Basic realm="token"');
      expect((await response.json()).error).toBe("invalid_client");
    }
    // The Basic client's credentials in the body are not its method: a 401 without a challenge.
    const inBody = await redeem({}, { client_id: clientId, client_secret: clientSecret });
    expect(inBody.status).toBe(401);
    // A 401 always carries a challenge, also for a client that sent its secret in the body.
    expect(inBody.headers.get("www-authenticate")).toBe('Basic realm="token"');
    // None of the refusals consumed the code; the registered method alone redeems it.
    expect((await redeem({ Authorization: basic(clientId, clientSecret) }, {})).status).toBe(200);
  });

  test("claims and the granted scope follow the requested scopes", async () => {
    const h = await createHarness({ connectors: [fakeUpstream().connector] });
    const { clientId, clientSecret } = await h.registerClient({
      appName: "Bristol",
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
      const code = new URL(back.headers.get("location") ?? "").searchParams.get("code") ?? "";
      const tokens = await (await exchange(h, { code, clientId, clientSecret, verifier })).json();
      expect(tokens.scope).toBe(granted);
      const userinfo = await (
        await h.fetchBroker(`${ISSUER}/userinfo`, {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        })
      ).json();
      for (const claims of [decodeJwt(tokens.id_token), userinfo]) {
        expect(
          Object.keys(claims).filter((name) =>
            ["email", "email_verified", "name", "picture"].includes(name),
          ),
        ).toEqual(claimed);
        // Not scoped claims: present with `openid` alone.
        expect(claims).toMatchObject({ sub: "fake:42", connector: "fake" });
        expect(Object.keys(claims)).not.toContain("connector_account_id");
      }
    }
  });

  test("a hub whose policy asks for consent shows the page before the connector", async () => {
    const h = await createHarness({
      connectors: [fakeUpstream().connector],
      registration: hubRegistration(),
    });
    const { clientId } = await h.registerClient({ appName: "Stranger", redirectUri: REDIRECT_URI });
    const { challenge } = await pkce();
    const page = await h.fetchBroker(authorizeUrl(h, { clientId, challenge }));
    expect(page.status).toBe(200);
    const setCookie = page.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(
      /^__Host-broker_txn_[\w-]{32}=[\w-]{43}; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=600$/,
    );
    const cookie = setCookie.split(";")[0] ?? "";
    const html = await page.text();
    // What the hub checked, not what the app says of itself (RFC 7591 section 5).
    expect(html).toContain("<title>Sign in to app.test</title>");
    const repository =
      '<a href="https://github.com/octo-org/octo-repo" target="_blank" rel="noopener noreferrer">octo-org/octo-repo</a>';
    expect(html).toContain(`<p class="sub">Development server of ${repository}</p>`);
    expect(html).toContain(
      "The app gets your name, picture, and email address. Samebase has not reviewed this app.",
    );
    expect(html).toContain("Continue with Fake");
    // Continue, and in new tabs the host, the repository, the privacy notice, the terms, and the
    // attribution; no script. Nothing sends the user to the host by itself, and a stranger's link
    // may have chosen it (RFC 9700 section 4.11.2).
    expect(html.match(/<a /g)).toHaveLength(6);
    expect(html.match(/target="_blank"/g)).toHaveLength(5);
    expect(html).not.toContain("<script");
    expect(html).not.toContain(REDIRECT_URI);
    expect(html).not.toContain("Stranger");
    const href = html.match(/href="([^"]*connector=fake)"/)?.[1]?.replace(/&amp;/g, "&") ?? "";
    const requestId = new URL(`${ISSUER}${href}`).searchParams.get("request") ?? "";
    expect(cookie.startsWith(`__Host-broker_txn_${requestId}=`)).toBe(true);
    // The consent names only what the requested scopes release.
    const openidOnly = await h.fetchBroker(
      authorizeUrl(h, { clientId, challenge, extra: { scope: "openid" } }),
    );
    expect(await openidOnly.text()).toContain("The app gets only an id for your account.");
  });

  test("the consent names the deploy: a preview's stage, production, or this computer", async () => {
    const h = await createHarness({
      connectors: [fakeUpstream().connector],
      registration: hubRegistration(),
    });
    const { challenge } = await pkce();
    const redirectUri = "https://pr-12.stranger.test/auth/hub/callback";
    const preview = await h.registerClient({
      appName: "Stranger",
      redirectUri,
      deploymentType: "preview",
    });
    const html = await (
      await h.fetchBroker(
        authorizeUrl(h, {
          clientId: preview.clientId,
          challenge,
          extra: { redirect_uri: redirectUri },
        }),
      )
    ).text();
    expect(html).toContain('<p class="sub">Preview dev of <a href="https://github.com/octo-org');
    // The host breaks only after a dot, never at the hyphen of `pr-12`.
    expect(html).toContain(
      '<h1>Sign in to<br><a class="host" href="https://pr-12.stranger.test" target="_blank" rel="noopener noreferrer"><span class="label">pr-12.</span><wbr><span class="label">stranger.</span><wbr><span class="label">test</span></a></h1>',
    );

    // Production asks too (RFC 137, decision 1 after the review).
    const production = await h.registerClient({
      appName: "Stranger",
      redirectUri: REDIRECT_URI,
      deploymentType: "production",
    });
    const asked = await h.fetchBroker(
      authorizeUrl(h, { clientId: production.clientId, challenge }),
    );
    expect(asked.status).toBe(200);
    expect(await asked.text()).toContain(
      '<p class="sub">Production of <a href="https://github.com/octo-org/octo-repo"',
    );

    const loopback = "http://localhost:5173/auth/hub/callback";
    const development = await h.registerClient({ appName: "Stranger", redirectUri: loopback });
    const local = await (
      await h.fetchBroker(
        authorizeUrl(h, {
          clientId: development.clientId,
          challenge,
          extra: { redirect_uri: loopback },
        }),
      )
    ).text();
    expect(local).toContain("<title>Sign in to localhost:5173</title>");
    expect(local).toContain("octo-org/octo-repo</a> on this computer</p>");
  });

  test("without consent, one offered connector goes straight on and several get the picker", async () => {
    const upstream = fakeUpstream();
    const other = { ...upstream.connector, name: "other", label: "Other" };
    const h = await createHarness({
      connectors: [upstream.connector, other],
      registration: hubRegistration(() => testPolicy({ consent: false })),
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
    expect(html).toContain("<title>Sign in to app.test</title>");
    expect(html).toContain("Continue with Fake");
    expect(html).toContain("Continue with Other");
    expect(html).not.toContain('class="sub"');
    expect(html).not.toContain("has not reviewed");

    // The app's own page picked: no picker. Several names: the picker offers those.
    const named = await h.fetchBroker(
      authorizeUrl(h, { clientId: two.clientId, challenge, extra: { connector: "other" } }),
    );
    expect(new URL(named.headers.get("location") ?? "").searchParams.get("redirect_uri")).toBe(
      `${ISSUER}/connectors/other/callback`,
    );
    const both = await h.fetchBroker(
      authorizeUrl(h, { clientId: two.clientId, challenge, extra: { connector: "other fake" } }),
    );
    expect(await both.text()).toContain("Continue with Other");
    // A name outside the enrollment is a request error, on a page.
    const outside = await h.fetchBroker(
      authorizeUrl(h, { clientId: one.clientId, challenge, extra: { connector: "fake other" } }),
    );
    expect(outside.status).toBe(400);
    expect(await outside.text()).toContain("not enrolled in the connector &quot;other&quot;");
  });

  test("a client enrolled only in a connector that is not configured gets no sign-in", async () => {
    const h = await createHarness({ connectors: [fakeUpstream().connector] });
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

  /** A broker with two connectors of the fake provider: a client enrolled in both gets the picker. */
  async function twoConnectors(issuer?: string) {
    const upstream = fakeUpstream();
    const other = { ...upstream.connector, name: "other", label: "Other" };
    return await createHarness({
      connectors: [upstream.connector, other],
      ...(issuer === undefined ? {} : { issuer }),
    });
  }

  test("the picker's links work only in the browser that saw the picker", async () => {
    const h = await twoConnectors();
    const { clientId } = await h.registerClient({ appName: "Stranger", redirectUri: REDIRECT_URI });
    const { challenge } = await pkce();
    const page = await h.fetchBroker(authorizeUrl(h, { clientId, challenge }));
    const cookie = (page.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
    const html = await page.text();
    const link = (pattern: RegExp) =>
      `${ISSUER}${html.match(pattern)?.[1]?.replace(/&amp;/g, "&") ?? ""}`;
    const choose = link(/href="([^"]*connector=fake)"/);
    const requestId = new URL(choose).searchParams.get("request") ?? "";
    for (const headers of [
      {},
      { Cookie: `__Host-broker_txn_${requestId}=forged` },
      // The right value under another request's name is not this request's cookie.
      { Cookie: `__Host-broker_txn_other=${cookie.split("=")[1] ?? ""}` },
    ]) {
      expect((await h.fetchBroker(choose, { headers })).status).toBe(400);
    }
    expect((await h.t.query(api.authRequests.get, { requestId }))?.status).toBe("pending");
    const chosen = await h.fetchBroker(choose, { headers: { Cookie: `theme=dark; ${cookie}` } });
    expect(chosen.status).toBe(302);
    expect(new URL(chosen.headers.get("location") ?? "").origin).toBe("https://upstream.test");
  });

  test("a path issuer scopes the picker cookie to its path", async () => {
    const h = await twoConnectors("https://samebase.test/identity");
    const { clientId } = await h.registerClient({ appName: "Stranger", redirectUri: REDIRECT_URI });
    const { challenge } = await pkce();
    const page = await h.fetchBroker(authorizeUrl(h, { clientId, challenge }));
    expect(page.headers.get("set-cookie")).toMatch(
      /^broker_txn_[\w-]{32}=[\w-]{43}; Path=\/identity; HttpOnly; Secure; SameSite=Lax; Max-Age=600$/,
    );
  });

  test("two sign-ins in one browser keep their own cookies", async () => {
    const h = await twoConnectors();
    const { clientId } = await h.registerClient({ appName: "Stranger", redirectUri: REDIRECT_URI });
    const chooser = async () => {
      const { challenge } = await pkce();
      const page = await h.fetchBroker(authorizeUrl(h, { clientId, challenge }));
      const cookie = (page.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
      const href = (await page.text()).match(/href="([^"]*connector=fake)"/)?.[1] ?? "";
      return { cookie, choose: `${ISSUER}${href.replace(/&amp;/g, "&")}` };
    };
    const first = await chooser();
    const second = await chooser();
    expect(first.cookie.split("=")[0]).not.toBe(second.cookie.split("=")[0]);
    const jar = { Cookie: `${first.cookie}; ${second.cookie}` };
    for (const { choose } of [first, second]) {
      const chosen = await h.fetchBroker(choose, { headers: jar });
      expect(chosen.status).toBe(302);
      expect(new URL(chosen.headers.get("location") ?? "").origin).toBe("https://upstream.test");
    }
  });

  test("a picker request's callback without the cookie is refused and stays claimable", async () => {
    const h = await twoConnectors();
    const { clientId, clientSecret } = await h.registerClient({
      appName: "Stranger",
      redirectUri: REDIRECT_URI,
    });
    const { verifier, challenge } = await pkce();
    // A client can fetch the picker and continue it itself, then send a user the upstream URL.
    const page = await h.fetchBroker(authorizeUrl(h, { clientId, challenge }));
    const cookie = (page.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
    const choose = (await page.text()).match(/href="([^"]*connector=fake)"/)?.[1] ?? "";
    const chooseUrl = `${ISSUER}${choose.replace(/&amp;/g, "&")}`;
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
      expect((await h.t.query(api.authRequests.get, { requestId }))?.status).toBe("upstream");
    }

    // The browser that saw the picker finishes the sign-in, and the cookie is deleted.
    const back = await h.fetchBroker(callback, { headers: { Cookie: cookie } });
    expect(back.status).toBe(302);
    expect(back.headers.get("set-cookie")).toBe(
      `__Host-broker_txn_${requestId}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
    );
    const code = new URL(back.headers.get("location") ?? "").searchParams.get("code") ?? "";
    expect((await exchange(h, { code, clientId, clientSecret, verifier })).status).toBe(200);
  });

  test("a sign-in from the picker gets the public sub", async () => {
    const h = await twoConnectors();
    const { clientId, clientSecret } = await h.registerClient({
      appName: "Stranger",
      redirectUri: REDIRECT_URI,
    });
    const { verifier, challenge } = await pkce();
    const page = await h.fetchBroker(
      authorizeUrl(h, { clientId, challenge, extra: { scope: "openid" } }),
    );
    const cookie = (page.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
    const choose = (await page.text()).match(/href="([^"]*connector=fake)"/)?.[1] ?? "";
    const started = await h.fetchBroker(`${ISSUER}${choose.replace(/&amp;/g, "&")}`, {
      headers: { Cookie: cookie },
    });
    const upstreamUrl = new URL(started.headers.get("location") ?? "");
    const callback = new URL(upstreamUrl.searchParams.get("redirect_uri") ?? "");
    callback.searchParams.set("code", "upstream-code");
    callback.searchParams.set("state", upstreamUrl.searchParams.get("state") ?? "");
    const back = await h.fetchBroker(callback, { headers: { Cookie: cookie } });
    const code = new URL(back.headers.get("location") ?? "").searchParams.get("code") ?? "";
    const tokens = await (await exchange(h, { code, clientId, clientSecret, verifier })).json();
    const userinfo = await (
      await h.fetchBroker(`${ISSUER}/userinfo`, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      })
    ).json();
    // The consent promised a stable id: the public sub.
    for (const claims of [decodeJwt(tokens.id_token), userinfo]) {
      expect(claims).toMatchObject({ sub: "fake:42", connector: "fake" });
      expect(Object.keys(claims)).not.toContain("email");
    }
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
    }
  });
});

describe("cleanup", () => {
  /** App "a" of the repository `gh-1`. */
  const insertApp = async (h: Harness, now: number) =>
    await h.t.run(async (ctx) => {
      await ctx.db.insert("apps", { appId: "a", name: "A", tenantId: "gh-1", createdAt: now });
    });
  /** A client of app "a" without a removal date, last renewed when it was created. */
  const insertClient = async (
    h: Harness,
    args: { clientId: string; deploymentType: "production" | "preview"; createdAt: number },
  ) =>
    await h.t.run(async (ctx) => {
      await ctx.db.insert("clients", {
        clientId: args.clientId,
        appId: "a",
        secretHash: "h",
        registrationTokenHash: "r",
        tokenEndpointAuthMethod: "client_secret_post",
        redirectUri: REDIRECT_URI,
        deploymentType: args.deploymentType,
        clientName: "c",
        softwareVersion: "v",
        createdAt: args.createdAt,
        renewedAt: args.createdAt,
        ...testClientRecord,
      });
    });

  test("drops expired requests and codes and old audit rows; idle preview clients only when asked", async () => {
    const h = await createHarness({ connectors: [fakeUpstream().connector] });
    const now = Date.now();
    await insertApp(h, now);
    for (const [clientId, deploymentType, createdAt] of [
      ["preview-old", "preview", now - 40 * 86_400_000],
      ["preview-new", "preview", now],
      ["prod-old", "production", now - 400 * 86_400_000],
    ] as const) {
      await insertClient(h, { clientId, deploymentType, createdAt });
    }
    await h.t.mutation(api.authRequests.create, {
      tenantId: "gh-1",
      requestId: "r-old",
      appId: "a",
      clientId: "prod-old",
      redirectUri: REDIRECT_URI,
      scope: "openid",
      codeChallenge: "c",
      connectors: ["fake"],
      freshLogin: false,
      txnCookieHash: "h",
      createdAt: now - 3_600_000,
      expiresAt: now - 1,
    });
    await h.t.mutation(api.signIns.record, {
      appId: "a",
      clientId: "prod-old",
      connector: "fake",
      sub: "s",
      at: now - 100 * 86_400_000,
    });
    const clientIds = async () =>
      (await h.t.query(api.clients.listByApp, { appId: "a" })).map((c) => c.clientId).sort();
    // Without previewClientMaxAgeMs, no client goes, however idle.
    expect(
      await h.t.mutation(api.lifecycle.cleanup, { now, signInRetentionMs: 90 * 86_400_000 }),
    ).toEqual({
      authRequests: 1,
      authorizationCodes: 0,
      previewClients: 0,
      expiredClients: 0,
      signIns: 1,
      resourceRequests: 0,
      refreshGrants: 0,
    });
    expect(await clientIds()).toEqual(["preview-new", "preview-old", "prod-old"]);
    // With it, the preview client idle longer goes; the production client stays.
    expect(
      await h.t.mutation(api.lifecycle.cleanup, {
        now,
        previewClientMaxAgeMs: 30 * 86_400_000,
        signInRetentionMs: 90 * 86_400_000,
      }),
    ).toEqual({
      authRequests: 0,
      authorizationCodes: 0,
      previewClients: 1,
      expiredClients: 0,
      signIns: 0,
      resourceRequests: 0,
      refreshGrants: 0,
    });
    expect(await clientIds()).toEqual(["preview-new", "prod-old"]);
  });

  test("the host's cleanup deletes idle preview clients only with previewClientIdleDays", async () => {
    for (const previewClientIdleDays of [undefined, 30, 50]) {
      const h = await createHarness({
        connectors: [fakeUpstream().connector],
        ...(previewClientIdleDays === undefined ? {} : { previewClientIdleDays }),
      });
      const now = Date.now();
      await insertApp(h, now);
      await insertClient(h, {
        clientId: "preview-40-days",
        deploymentType: "preview",
        createdAt: now - 40 * 86_400_000,
      });
      const { cleanup } = h.broker.admin();
      // @ts-expect-error internalMutationGeneric keeps the function as _handler; RegisteredMutation does not declare it. Its handler only calls ctx.runMutation, which an action ctx has.
      const counts = await h.t.action(async (ctx) => await cleanup._handler(ctx, {}));
      expect(counts).toMatchObject({ previewClients: previewClientIdleDays === 30 ? 1 : 0 });
    }
  });

  test("previewClientIdleDays must be a positive number of days", () => {
    for (const previewClientIdleDays of [0, -1, Number.NaN]) {
      expect(() =>
        defineIdentityBroker({
          component,
          issuer: ISSUER,
          keys: () => undefined,
          connectors: [fakeUpstream().connector],
          previewClientIdleDays,
        }),
      ).toThrow("previewClientIdleDays must be a positive number of days");
    }
  });

  test("one call drains a table that holds more than one batch", async () => {
    const h = await createHarness({ connectors: [fakeUpstream().connector] });
    vi.useFakeTimers();
    const now = Date.now();
    await h.t.run(async (ctx) => {
      const row = { appId: "a", clientId: "c", connector: "fake" };
      for (let index = 0; index < 450; index++) {
        await ctx.db.insert("signIns", { ...row, sub: `old-${index}`, at: now - 91 * 86_400_000 });
      }
      await ctx.db.insert("signIns", { ...row, sub: "recent", at: now });
    });
    const counts = await h.t.mutation(api.lifecycle.cleanup, {
      now,
      previewClientMaxAgeMs: 30 * 86_400_000,
      signInRetentionMs: 90 * 86_400_000,
    });
    expect(counts.signIns).toBe(200);
    await h.t.finishAllScheduledFunctions(vi.runAllTimers);
    const left = await h.t.run(async (ctx) => await ctx.db.query("signIns").collect());
    expect(left.map((row) => row.sub)).toEqual(["recent"]);
  });

  test("one call drains more expired requests than the 51 batches 0.4.0 stopped after", async () => {
    const h = await createHarness({ connectors: [fakeUpstream().connector] });
    vi.useFakeTimers();
    const now = Date.now();
    const request = {
      status: "pending",
      appId: "a",
      clientId: "c",
      redirectUri: REDIRECT_URI,
      scope: "openid",
      codeChallenge: "c",
      freshLogin: false,
      txnCookieHash: "h",
      createdAt: now - 600_000,
    } as const;
    await h.t.run(async (ctx) => {
      // 0.4.0 ran the first batch and at most 50 continuations, 200 rows each.
      for (let row = 0; row < 51 * 200 + 1; row++) {
        await ctx.db.insert("authRequests", {
          ...request,
          connectors: ["fake"],
          requestId: `r-${row}`,
          expiresAt: now - 1,
        });
      }
      await ctx.db.insert("authRequests", {
        ...request,
        connectors: ["fake"],
        requestId: "live",
        expiresAt: now + 1,
      });
    });
    await h.t.mutation(api.lifecycle.cleanup, { now, signInRetentionMs: 90 * 86_400_000 });
    await h.t.finishAllScheduledFunctions(vi.runAllTimers);
    const left = await h.t.run(async (ctx) => await ctx.db.query("authRequests").collect());
    expect(left.map((row) => row.requestId)).toEqual(["live"]);
  });
});
