import * as client from "openid-client";
import { afterEach, expect, test, vi } from "vite-plus/test";
import { api } from "../component/_generated/api.js";
import { google } from "./connectors/google.js";
import { createHarness, ISSUER, pkce, txnCookie, type Harness } from "./harness.test.helper.js";
import { hubRegistration, testPolicy } from "./hub.test.helper.js";
import { deferred } from "./model.test.helper.js";
import type { Policy, PolicyFunction } from "./policy.js";
import { cloudflareConnection, convexConnection, githubConnection } from "./resourceProviders.js";

const REDIRECT = "https://preview.example.com/oauth/hub/callback";
const credentials = { clientId: () => "provider-client", clientSecret: () => "provider-secret" };
const convex = convexConnection(credentials);
const cloudflare = cloudflareConnection(credentials);
const github = githubConnection(credentials);
// GitHub's documented response: https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens
const githubToken = {
  access_token: "ghu_16C7e42F292c6912E7710c838347Ae178B4a",
  expires_in: 28800,
  refresh_token: "ghr_1B4a2e77838347a7E420ce178F2E7c6912E169246c34E1ccbF66C46812d16D5B1A9Dc86A1498",
  refresh_token_expires_in: 15897600,
  scope: "",
  token_type: "bearer",
};
// GitHub's answers to a wrong refresh token and a wrong code, recorded on 2026-11-02. Both are HTTP 200.
const errorUri =
  "https://docs.github.com/apps/managing-oauth-apps/troubleshooting-oauth-app-access-token-request-errors/#bad-verification-code";
const githubBadRefreshToken = {
  error: "bad_refresh_token",
  error_description: "The refresh token passed is incorrect or expired.",
  error_uri: errorUri,
};
const githubBadCode = {
  error: "bad_verification_code",
  error_description: "The code passed is incorrect or expired.",
  error_uri: errorUri,
};
// Convex's documented response: https://docs.convex.dev/platform-apis/oauth-applications#step-3-exchange-the-authorization-code-for-a-project-token
const convexToken = { access_token: "team:my-team|AAAAAA==", token_type: "bearer" };
// RFC 6749 section 5.1's token response. This tests the OAuth contract, not a claim of live Cloudflare authorization.
const oauthToken = {
  access_token: "2YotnFZFEjr1zCsicMWpAA",
  token_type: "example",
  expires_in: 3600,
  refresh_token: "tGzv3JOkF0XG5Qx2TlKWIA",
  example_parameter: "example_value",
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/**
 * A broker with the three providers. Without `policy` it has no hub mode, so every client may
 * authorize every resource; with one, the hub's policy decides, read at each request.
 */
async function setup(policy?: PolicyFunction) {
  const h = await createHarness({
    connectors: [google(credentials)],
    resources: [convex, cloudflare, github],
    ...(policy === undefined ? {} : { registration: hubRegistration(policy) }),
  });
  const registered = await h.registerClient({
    appName: "Resource app",
    redirectUri: REDIRECT,
  });
  const tokenCalls: URLSearchParams[] = [];
  const tokenHeaders: Headers[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      const body = new URLSearchParams(await request.text());
      tokenCalls.push(body);
      tokenHeaders.push(request.headers);
      if (request.url === convex.server.token_endpoint) return Response.json(convexToken);
      if (request.url === github.server.token_endpoint) return Response.json(githubToken);
      if (request.url === cloudflare.server.token_endpoint) {
        return Response.json({
          ...oauthToken,
          token_type: "Bearer",
          ...(body.get("grant_type") === "refresh_token"
            ? { refresh_token: "rotated-provider-token" }
            : {}),
        });
      }
      throw new Error("Unexpected provider request");
    }),
  );
  return { h, registered, tokenCalls, tokenHeaders };
}

async function authorize(
  args: Awaited<ReturnType<typeof setup>>,
  resource = convex.resource,
  extra: Record<string, string> = {},
) {
  const proof = await pkce();
  const params = new URLSearchParams({
    client_id: args.registered.clientId,
    redirect_uri: REDIRECT,
    response_type: "code",
    resource,
    state: "preview-state",
    code_challenge: proof.challenge,
    code_challenge_method: "S256",
    ...extra,
  });
  const start = await args.h.fetchBroker(`${ISSUER}/authorize?${params}`);
  return { start, proof };
}

async function complete(h: Harness, start: Response, extra: Record<string, string> = {}) {
  const upstream = new URL(start.headers.get("location") ?? "");
  const callback = new URL(upstream.searchParams.get("redirect_uri") ?? "");
  callback.searchParams.set("code", "upstream-code");
  callback.searchParams.set("state", upstream.searchParams.get("state") ?? "");
  for (const [name, value] of Object.entries(extra)) callback.searchParams.set(name, value);
  const back = await h.fetchBroker(callback, { headers: txnCookie(start) });
  return { back, callback, url: new URL(back.headers.get("location") ?? "") };
}

async function redeem(
  args: Awaited<ReturnType<typeof setup>>,
  code: string,
  verifier: string,
  extra: Record<string, string> = {},
) {
  return await args.h.fetchBroker(`${ISSUER}/token`, {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: args.registered.clientId,
      client_secret: args.registered.clientSecret,
      code,
      code_verifier: verifier,
      redirect_uri: REDIRECT,
      ...extra,
    }),
  });
}

test("openid-client obtains a Convex API token through standard discovery and authorization code with resource and PKCE", async () => {
  const args = await setup();
  const brokerFetch: client.CustomFetch = async (url, options) =>
    args.h.fetchBroker(url, {
      method: options.method,
      headers: options.headers,
      ...(typeof options.body === "string" || options.body instanceof URLSearchParams
        ? { body: options.body }
        : {}),
    });
  const config = await client.discovery(
    new URL(ISSUER),
    args.registered.clientId,
    undefined,
    client.ClientSecretPost(args.registered.clientSecret),
    { [client.customFetch]: brokerFetch },
  );
  expect(config.serverMetadata().grant_types_supported).toContain("refresh_token");
  expect(config.serverMetadata().revocation_endpoint).toBe(`${ISSUER}/revoke`);
  const verifier = client.randomPKCECodeVerifier();
  const state = client.randomState();
  const url = client.buildAuthorizationUrl(config, {
    redirect_uri: REDIRECT,
    resource: convex.resource,
    state,
    code_challenge: await client.calculatePKCECodeChallenge(verifier),
    code_challenge_method: "S256",
  });
  const start = await args.h.fetchBroker(url);
  const upstream = new URL(start.headers.get("location") ?? "");
  expect(upstream.origin + upstream.pathname).toBe(convex.server.authorization_endpoint);
  expect(upstream.searchParams.has("scope")).toBe(false);
  expect(upstream.searchParams.get("code_challenge")).not.toBe(
    url.searchParams.get("code_challenge"),
  );
  const finished = await complete(args.h, start);
  expect(finished.url.searchParams.get("iss")).toBe(ISSUER);
  const tokens = await client.authorizationCodeGrant(config, finished.url, {
    pkceCodeVerifier: verifier,
    expectedState: state,
    idTokenExpected: false,
  });
  expect(tokens.access_token).toBe(convexToken.access_token);
  expect(tokens.id_token).toBeUndefined();
  expect(tokens.refresh_token).toBeUndefined();
  expect(tokens.expires_in).toBeUndefined();
  expect(tokens.scope).toBeUndefined();
  expect(args.tokenCalls[0]?.get("client_secret")).toBe("provider-secret");
  expect(
    await args.h.t.run(async (ctx) => await ctx.db.query("resourceRequests").collect()),
  ).toHaveLength(0);
});

async function connectGitHub(args: Awaited<ReturnType<typeof setup>>) {
  const { start, proof } = await authorize(args, github.resource);
  const finished = await complete(args.h, start, { iss: github.server.issuer });
  return await redeem(args, finished.url.searchParams.get("code") ?? "", proof.verifier);
}

function refreshToken(args: Awaited<ReturnType<typeof setup>>, refresh_token: string) {
  return args.h.fetchBroker(`${ISSUER}/token`, {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: args.registered.clientId,
      client_secret: args.registered.clientSecret,
      refresh_token,
    }),
  });
}

test("a GitHub App user token goes through the hub with no scope", async () => {
  const args = await setup();
  const { start } = await authorize(args, github.resource);
  const upstream = new URL(start.headers.get("location") ?? "");
  expect(upstream.origin + upstream.pathname).toBe(github.server.authorization_endpoint);
  expect(upstream.searchParams.get("redirect_uri")).toBe(`${ISSUER}/connections/github/callback`);
  expect(upstream.searchParams.has("scope")).toBe(false);
  // GitHub shows its account picker, so a user can connect another account than the browser's.
  expect(upstream.searchParams.get("prompt")).toBe("select_account");

  const response = await connectGitHub(args);
  const tokens: Record<string, unknown> = await response.json();
  expect(tokens).toMatchObject({ access_token: githubToken.access_token, token_type: "Bearer" });
  expect(tokens).not.toHaveProperty("scope");
  expect(tokens["refresh_token"]).not.toBe(githubToken.refresh_token);
  expect(args.tokenCalls.at(-1)?.get("client_secret")).toBe("provider-secret");
});

test("GitHub's refusal of a refresh token ends the grant", async () => {
  const args = await setup();
  const initial: { refresh_token: string } = await (await connectGitHub(args)).json();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(githubBadRefreshToken)),
  );

  const refused = await refreshToken(args, initial.refresh_token);

  expect(refused.status).toBe(400);
  expect(await refused.json()).toMatchObject({ error: "invalid_grant" });
  expect(
    await args.h.t.run(async (ctx) => await ctx.db.query("refreshGrants").collect()),
  ).toHaveLength(0);
});

test("a GitHub outage on refresh keeps the grant", async () => {
  const args = await setup();
  const initial: { refresh_token: string } = await (await connectGitHub(args)).json();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(null, { status: 503 })),
  );

  expect((await refreshToken(args, initial.refresh_token)).status).toBe(503);
  expect(
    await args.h.t.run(async (ctx) => await ctx.db.query("refreshGrants").collect()),
  ).toHaveLength(1);
});

test("a GitHub code error reaches the client as a failed authorization", async () => {
  const args = await setup();
  const { start } = await authorize(args, github.resource);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(githubBadCode)),
  );

  const finished = await complete(args.h, start, { iss: github.server.issuer });

  expect(finished.url.searchParams.get("error")).toBe("server_error");
  expect(finished.url.searchParams.has("code")).toBe(false);
});

test("a GitHub callback with no issuer is refused", async () => {
  const args = await setup();
  const { start } = await authorize(args, github.resource);

  const finished = await complete(args.h, start);

  expect(finished.url.searchParams.get("error")).toBe("server_error");
  expect(args.tokenCalls).toHaveLength(0);
});

test("a provider's narrower scope reaches the client", async () => {
  const args = await setup();
  const scope = "workers-scripts.read";
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ ...oauthToken, token_type: "Bearer", scope })),
  );
  const { start, proof } = await authorize(args, cloudflare.resource);
  const finished = await complete(args.h, start);
  const response = await redeem(args, finished.url.searchParams.get("code") ?? "", proof.verifier);
  expect(await response.json()).toMatchObject({ scope });
});

test("a provider outage keeps the grant, and only a provider rejection ends it", async () => {
  const args = await setup();
  const { start, proof } = await authorize(args, cloudflare.resource);
  const finished = await complete(args.h, start);
  const response = await redeem(args, finished.url.searchParams.get("code") ?? "", proof.verifier);
  const initial: { refresh_token: string } = await response.json();
  const refresh = () =>
    args.h.fetchBroker(`${ISSUER}/token`, {
      method: "POST",
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: args.registered.clientId,
        client_secret: args.registered.clientSecret,
        refresh_token: initial.refresh_token,
      }),
    });
  const grants = () => args.h.t.run(async (ctx) => await ctx.db.query("refreshGrants").collect());

  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(null, { status: 503 })),
  );
  const outage = await refresh();
  expect(outage.status).toBe(503);
  expect(await outage.json()).toMatchObject({ error: "temporarily_unavailable" });
  expect(await grants()).toHaveLength(1);

  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ ...oauthToken, token_type: "Bearer" })),
  );
  expect((await refresh()).status).toBe(200);

  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ error: "invalid_grant" }, { status: 400 })),
  );
  expect(await (await refresh()).json()).toMatchObject({ error: "invalid_grant" });
  expect(await grants()).toHaveLength(0);
});

test("RFC 7009 revocation authenticates the owner and keeps unknown or another client's token private", async () => {
  const args = await setup();
  const { start, proof } = await authorize(args, cloudflare.resource);
  const finished = await complete(args.h, start);
  const response = await redeem(args, finished.url.searchParams.get("code") ?? "", proof.verifier);
  const initial: { refresh_token: string } = await response.json();
  const other = await args.h.registerClient({
    appName: "Other app",
    redirectUri: REDIRECT,
  });
  const revoke = (clientId: string, secret: string, token: string) =>
    args.h.fetchBroker(`${ISSUER}/revoke`, {
      method: "POST",
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: secret,
        token,
        token_type_hint: "refresh_token",
      }),
    });
  expect((await revoke(args.registered.clientId, "wrong", initial.refresh_token)).status).toBe(401);
  expect((await revoke(other.clientId, other.clientSecret, initial.refresh_token)).status).toBe(
    200,
  );
  expect(
    await args.h.t.run(async (ctx) => await ctx.db.query("refreshGrants").collect()),
  ).toHaveLength(1);
  for (const token of [initial.refresh_token, initial.refresh_token, "unknown-token"]) {
    const revoked = await revoke(args.registered.clientId, args.registered.clientSecret, token);
    expect(revoked.status).toBe(200);
    expect(await revoked.text()).toBe("");
  }
  expect(
    await args.h.t.run(async (ctx) => await ctx.db.query("refreshGrants").collect()),
  ).toHaveLength(0);
});

test("authorization refuses an unknown resource on a page, before contacting a provider", async () => {
  const args = await setup();
  const { start } = await authorize(args, "https://attacker.example/api");
  expect(start.status).toBe(400);
  expect(start.headers.get("location")).toBeNull();
  expect(await start.text()).toContain("Request one configured API resource.");
  expect(args.tokenCalls).toHaveLength(0);
});

test("a resource with no scopes refuses a requested scope on a page", async () => {
  const args = await setup();
  const { start } = await authorize(args, convex.resource, { scope: "read" });
  expect(start.status).toBe(400);
  expect(await start.text()).toContain("This API resource has no scopes.");
});

test("a refresh leaves out a scope the provider left out", async () => {
  const args = await setup();
  const { start, proof } = await authorize(args, cloudflare.resource);
  const finished = await complete(args.h, start);
  const response = await redeem(args, finished.url.searchParams.get("code") ?? "", proof.verifier);
  const initial: { refresh_token: string; scope: string } = await response.json();
  expect(initial.scope).toBe(cloudflare.scopes.join(" "));
  const refreshed = await args.h.fetchBroker(`${ISSUER}/token`, {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: args.registered.clientId,
      client_secret: args.registered.clientSecret,
      refresh_token: initial.refresh_token,
    }),
  });
  expect(await refreshed.json()).not.toHaveProperty("scope");
});

test("the provider gets its configured scope, whatever the client requests", async () => {
  const args = await setup();
  const { start } = await authorize(args, cloudflare.resource, { scope: "openid" });
  const upstream = new URL(start.headers.get("location") ?? "");
  expect(upstream.searchParams.get("scope")).toBe(cloudflare.scopes.join(" "));
  expect(upstream.searchParams.has("prompt")).toBe(false);
});

test.each([
  { endpoint: "token", parameter: "refresh_token", extra: { grant_type: "refresh_token" } },
  { endpoint: "revoke", parameter: "token", extra: {} },
])(
  "$endpoint rejects repeated parameters before using a grant",
  async ({ endpoint, parameter, extra }) => {
    const args = await setup();
    const { start, proof } = await authorize(args, cloudflare.resource);
    const finished = await complete(args.h, start);
    const response = await redeem(
      args,
      finished.url.searchParams.get("code") ?? "",
      proof.verifier,
    );
    const initial: { refresh_token: string } = await response.json();
    const body = new URLSearchParams({
      client_id: args.registered.clientId,
      client_secret: args.registered.clientSecret,
      ...extra,
    });
    body.append(parameter, initial.refresh_token);
    body.append(parameter, "another-token");
    const rejected = await args.h.fetchBroker(`${ISSUER}/${endpoint}`, { method: "POST", body });
    expect(rejected.status).toBe(400);
    expect(await rejected.json()).toMatchObject({ error: "invalid_request" });
    expect(args.tokenCalls).toHaveLength(1);
    expect(
      await args.h.t.run(async (ctx) => await ctx.db.query("refreshGrants").collect()),
    ).toHaveLength(1);
  },
);

test("a client gets the resources its policy names, at authorization and at the code", async () => {
  let resources = ["convex"];
  const args = await setup(() => testPolicy({ resources }));
  expect((await authorize(args, cloudflare.resource)).start.status).toBe(403);
  expect(args.tokenCalls).toHaveLength(0);
  const { start, proof } = await authorize(args, convex.resource);
  expect(start.status).toBe(302);
  const finished = await complete(args.h, start);
  const code = finished.url.searchParams.get("code") ?? "";
  // The resource is withdrawn between the callback and the redemption.
  resources = [];
  const refused = await redeem(args, code, proof.verifier);
  expect(refused.status).toBe(400);
  expect(await refused.json()).toMatchObject({ error: "invalid_target" });
});

test("an exemption from the sign-in page grants no API resource", async () => {
  const args = await setup(() => testPolicy({ resources: [] }));
  await args.h.t.run(async (ctx) => {
    await ctx.db.insert("signInPageExemptions", {
      target: { scope: "every_app" },
      reason: "Launch week",
    });
  });
  const { start } = await authorize(args, cloudflare.resource);
  expect(start.status).toBe(403);
  expect(start.headers.get("location")).toBeNull();
  expect(args.tokenCalls).toHaveLength(0);
});

test("a connector grant gives no API resource", async () => {
  const args = await setup(() => testPolicy({ resources: [] }));
  await args.h.t.run(async (ctx) => {
    const client = await ctx.db.query("clients").unique();
    const app = await ctx.db.query("apps").unique();
    if (client === null || app === null) throw new Error("No client");
    await ctx.db.insert("connectorGrants", {
      tenantId: app.tenantId,
      connector: "cloudflare",
      ownerId: client.registeredBy.githubOwnerId,
      reason: "A grant names a sign-in connector, never a resource",
    });
  });
  const { start } = await authorize(args, cloudflare.resource);
  expect(start.status).toBe(403);
  expect(start.headers.get("location")).toBeNull();
  expect(args.tokenCalls).toHaveLength(0);
});

test("a paused or failed policy refuses API authorization and refresh before the provider", async () => {
  let policy: () => Policy = () => testPolicy({ resources: ["cloudflare"] });
  const args = await setup(() => policy());
  const { start, proof } = await authorize(args, cloudflare.resource);
  const finished = await complete(args.h, start);
  const response = await redeem(args, finished.url.searchParams.get("code") ?? "", proof.verifier);
  const initial: { refresh_token: string } = await response.json();
  const calls = args.tokenCalls.length;

  policy = () => testPolicy({ resources: ["cloudflare"], paused: true });
  expect((await authorize(args, cloudflare.resource)).start.status).toBe(503);
  const paused = await refreshToken(args, initial.refresh_token);
  expect(paused.status).toBe(401);
  expect(await paused.json()).toMatchObject({ error: "invalid_client" });

  policy = () => {
    throw new Error("no env");
  };
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  expect((await authorize(args, cloudflare.resource)).start.status).toBe(503);
  const failed = await refreshToken(args, initial.refresh_token);
  expect(failed.status).toBe(503);
  expect(await failed.json()).toMatchObject({ error: "temporarily_unavailable" });
  expect(args.tokenCalls).toHaveLength(calls);
  expect(
    await args.h.t.run(async (ctx) => await ctx.db.query("resourceRequests").collect()),
  ).toHaveLength(0);
});

test("a release read that fails keeps the rotation and answers 401, and the next refresh uses it", async () => {
  const args = await setup();
  const { start, proof } = await authorize(args, cloudflare.resource);
  const finished = await complete(args.h, start);
  const response = await redeem(args, finished.url.searchParams.get("code") ?? "", proof.verifier);
  const initial: { refresh_token: string } = await response.json();
  const reached = deferred<true>();
  const release = deferred<undefined>();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const body = new URLSearchParams(await new Request(input, init).text());
      args.tokenCalls.push(body);
      reached.settle(true);
      await release.promise;
      return Response.json({
        ...oauthToken,
        token_type: "Bearer",
        refresh_token: `rotated-${body.get("refresh_token") ?? ""}`,
      });
    }),
  );
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  const pending = refreshToken(args, initial.refresh_token);
  await reached.promise;
  // The read of the client fails after the provider rotated the token.
  args.h.failReads((name) => name === "clients:withApp");
  release.settle(undefined);
  const refused = await pending;
  expect(refused.status).toBe(401);
  expect(await refused.json()).toMatchObject({ error: "invalid_client" });
  const grants = await args.h.t.run(async (ctx) => await ctx.db.query("refreshGrants").collect());
  expect(grants.map((grant) => grant.upstreamRefreshToken)).toEqual([
    `rotated-${oauthToken.refresh_token}`,
  ]);
  args.h.failReads(null);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      args.tokenCalls.push(new URLSearchParams(await new Request(input, init).text()));
      return Response.json({ ...oauthToken, token_type: "Bearer" });
    }),
  );
  expect((await refreshToken(args, initial.refresh_token)).status).toBe(200);
  expect(args.tokenCalls.at(-1)?.get("refresh_token")).toBe(`rotated-${oauthToken.refresh_token}`);
});

test("a bound browser that comes back late, or after the resource was withdrawn, goes back to the app", async () => {
  let resources = ["cloudflare"];
  const args = await setup(() => testPolicy({ resources }));
  vi.useFakeTimers({ toFake: ["Date"] });
  const late = await authorize(args, cloudflare.resource);
  vi.setSystemTime(Date.now() + 600_001);
  const expired = await complete(args.h, late.start);
  expect(expired.back.status).toBe(302);
  expect(expired.url.origin + expired.url.pathname).toBe(REDIRECT);
  expect(expired.url.searchParams.get("error")).toBe("access_denied");
  expect(expired.url.searchParams.get("state")).toBe("preview-state");
  expect(args.tokenCalls).toHaveLength(0);

  const { start } = await authorize(args, cloudflare.resource);
  // The provider answers; the resource is withdrawn before the hub completes the authorization.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      resources = [];
      return Response.json({ ...oauthToken, token_type: "Bearer" });
    }),
  );
  const withdrawn = await complete(args.h, start);
  expect(withdrawn.url.origin + withdrawn.url.pathname).toBe(REDIRECT);
  expect(withdrawn.url.searchParams.get("error")).toBe("access_denied");
  expect(withdrawn.url.searchParams.has("code")).toBe(false);
  expect(
    await args.h.t.run(async (ctx) => await ctx.db.query("resourceRequests").collect()),
  ).toEqual([]);
});

test("a read that fails after the provider answered sends the user back and abandons the authorization", async () => {
  const args = await setup();
  const { start } = await authorize(args, cloudflare.resource);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  // The claim needs no client read; the read after the provider fails.
  args.h.failReads((name) => name === "clients:withApp");

  const finished = await complete(args.h, start);

  args.h.failReads(null);
  expect(args.tokenCalls).toHaveLength(1);
  expect(finished.back.status).toBe(302);
  expect(finished.url.origin + finished.url.pathname).toBe(REDIRECT);
  expect(finished.url.searchParams.get("error")).toBe("temporarily_unavailable");
  expect(finished.url.searchParams.get("state")).toBe("preview-state");
  expect(
    await args.h.t.run(async (ctx) => await ctx.db.query("resourceRequests").collect()),
  ).toEqual([]);
});

test("a pause that lands while the provider answers sends the user back as temporarily unavailable", async () => {
  let paused = false;
  const args = await setup(() => testPolicy({ resources: ["cloudflare"], paused }));
  const { start } = await authorize(args, cloudflare.resource);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      paused = true;
      return Response.json({ ...oauthToken, token_type: "Bearer" });
    }),
  );

  const finished = await complete(args.h, start);

  expect(finished.url.origin + finished.url.pathname).toBe(REDIRECT);
  expect(finished.url.searchParams.get("error")).toBe("temporarily_unavailable");
  expect(finished.url.searchParams.has("code")).toBe(false);
  expect(
    await args.h.t.run(async (ctx) => await ctx.db.query("resourceRequests").collect()),
  ).toEqual([]);
});

test("a resource withdrawn while the provider answers keeps the rotation and answers 401", async () => {
  let resources = ["cloudflare"];
  const args = await setup(() => testPolicy({ resources }));
  const { start, proof } = await authorize(args, cloudflare.resource);
  const finished = await complete(args.h, start);
  const response = await redeem(args, finished.url.searchParams.get("code") ?? "", proof.verifier);
  const initial: { refresh_token: string } = await response.json();
  // The provider's answer waits until the test releases it.
  const reached = deferred<true>();
  const release = deferred<undefined>();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      reached.settle(true);
      await release.promise;
      return Response.json({
        ...oauthToken,
        token_type: "Bearer",
        refresh_token: "rotated-provider-token",
      });
    }),
  );
  const pending = refreshToken(args, initial.refresh_token);
  await reached.promise;
  resources = [];
  release.settle(undefined);
  const refused = await pending;
  expect(refused.status).toBe(401);
  expect(await refused.json()).toMatchObject({ error: "invalid_client" });
  const grants = await args.h.t.run(async (ctx) => await ctx.db.query("refreshGrants").collect());
  expect(grants.map((grant) => grant.upstreamRefreshToken)).toEqual(["rotated-provider-token"]);
  expect(grants[0]?.refreshStartedAt).toBeUndefined();
  // The client can still revoke the grant it may no longer refresh.
  const revoked = await args.h.fetchBroker(`${ISSUER}/revoke`, {
    method: "POST",
    body: new URLSearchParams({
      client_id: args.registered.clientId,
      client_secret: args.registered.clientSecret,
      token: initial.refresh_token,
    }),
  });
  expect(revoked.status).toBe(200);
  expect(
    await args.h.t.run(async (ctx) => await ctx.db.query("refreshGrants").collect()),
  ).toHaveLength(0);
});

test("resource callback requires the initiating browser and cannot be replayed", async () => {
  const args = await setup();
  const { start } = await authorize(args);
  const upstream = new URL(start.headers.get("location") ?? "");
  const callback = new URL(upstream.searchParams.get("redirect_uri") ?? "");
  callback.searchParams.set("code", "upstream-code");
  callback.searchParams.set("state", upstream.searchParams.get("state") ?? "");
  expect((await args.h.fetchBroker(callback)).status).toBe(400);
  expect(args.tokenCalls).toHaveLength(0);
  expect((await complete(args.h, start)).back.status).toBe(302);
  expect((await args.h.fetchBroker(callback, { headers: txnCookie(start) })).status).toBe(400);
  expect(args.tokenCalls).toHaveLength(1);
});

test("code redemption checks resource, redirect, client and PKCE without consuming a valid code", async () => {
  const args = await setup();
  const { start, proof } = await authorize(args);
  const finished = await complete(args.h, start);
  const code = finished.url.searchParams.get("code") ?? "";
  for (const extra of [
    { resource: cloudflare.resource },
    { redirect_uri: "https://other.example/cb" },
    { client_secret: "wrong" },
  ]) {
    const response = await redeem(args, code, proof.verifier, extra);
    expect(response.status).toBeGreaterThanOrEqual(400);
  }
  expect((await redeem(args, code, "x".repeat(43))).status).toBe(400);
  expect((await redeem(args, code, proof.verifier)).status).toBe(200);
  expect((await redeem(args, code, proof.verifier)).status).toBe(400);
});

test("code expiry is enforced and access-token lifetime accounts for time spent returning to the app", async () => {
  const args = await setup();
  vi.useFakeTimers({ toFake: ["Date"] });
  const { start, proof } = await authorize(args, cloudflare.resource);
  const finished = await complete(args.h, start);
  vi.setSystemTime(Date.now() + 20_000);
  const response = await redeem(args, finished.url.searchParams.get("code") ?? "", proof.verifier);
  expect(await response.json()).toMatchObject({ expires_in: 3580 });
  const second = await authorize(args);
  const secondFinished = await complete(args.h, second.start);
  vi.setSystemTime(Date.now() + 60_001);
  expect(
    (await redeem(args, secondFinished.url.searchParams.get("code") ?? "", second.proof.verifier))
      .status,
  ).toBe(400);
});

test("openid-client refreshes with a stable broker token while the hub retains provider rotation", async () => {
  const args = await setup();
  const { start, proof } = await authorize(args, cloudflare.resource);
  const finished = await complete(args.h, start);
  const response = await redeem(args, finished.url.searchParams.get("code") ?? "", proof.verifier);
  const initial: { refresh_token: string } = await response.json();
  expect(initial.refresh_token).not.toBe(oauthToken.refresh_token);
  const config = new client.Configuration(
    { issuer: ISSUER, token_endpoint: `${ISSUER}/token` },
    args.registered.clientId,
    undefined,
    client.ClientSecretPost(args.registered.clientSecret),
  );
  config[client.customFetch] = async (url, options) =>
    args.h.fetchBroker(url, {
      method: options.method,
      headers: options.headers,
      ...(typeof options.body === "string" || options.body instanceof URLSearchParams
        ? { body: options.body }
        : {}),
    });
  const first = await client.refreshTokenGrant(config, initial.refresh_token);
  const second = await client.refreshTokenGrant(config, initial.refresh_token);
  expect(first.refresh_token).toBe(initial.refresh_token);
  expect(second.refresh_token).toBe(initial.refresh_token);
  expect(args.tokenCalls[1]?.get("refresh_token")).toBe(oauthToken.refresh_token);
  expect(args.tokenCalls[2]?.get("refresh_token")).toBe("rotated-provider-token");
  expect(args.tokenHeaders.map((headers) => headers.get("authorization"))).toEqual([
    `Basic ${btoa("provider%2Dclient:provider%2Dsecret")}`,
    `Basic ${btoa("provider%2Dclient:provider%2Dsecret")}`,
    `Basic ${btoa("provider%2Dclient:provider%2Dsecret")}`,
  ]);
  expect(args.tokenCalls.every((body) => !body.has("client_secret"))).toBe(true);
  await args.h.t.mutation(api.clients.remove, { clientId: args.registered.clientId });
  await expect(client.refreshTokenGrant(config, initial.refresh_token)).rejects.toThrow();
  expect(
    await args.h.t.run(async (ctx) => await ctx.db.query("refreshGrants").collect()),
  ).toHaveLength(0);
});

// A rule that mutation testing (StrykerJS) found no test for: a check that reads one resource of
// several would hand out the first resource's token.
test("refuses a code exchange that names two resources, without spending the code", async () => {
  const args = await setup();
  const { start, proof } = await authorize(args, convex.resource);
  const finished = await complete(args.h, start);
  const code = finished.url.searchParams.get("code") ?? "";
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: args.registered.clientId,
    client_secret: args.registered.clientSecret,
    code,
    code_verifier: proof.verifier,
    redirect_uri: REDIRECT,
  });
  body.append("resource", convex.resource);
  body.append("resource", cloudflare.resource);

  const refused = await args.h.fetchBroker(`${ISSUER}/token`, { method: "POST", body });
  expect(refused.status).toBe(400);
  expect(await refused.json()).toMatchObject({ error: "invalid_target" });
  expect((await redeem(args, code, proof.verifier, { resource: convex.resource })).status).toBe(
    200,
  );
});
