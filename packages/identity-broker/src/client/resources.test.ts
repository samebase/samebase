import * as client from "openid-client";
import { afterEach, expect, test, vi } from "vite-plus/test";
import { api } from "../component/_generated/api.js";
import { google } from "./connectors/google.js";
import { createHarness, ISSUER, pkce, txnCookie, type Harness } from "./harness.test.helper.js";
import { cloudflareConnection, convexConnection } from "./resourceProviders.js";

const REDIRECT = "https://preview.example.com/oauth/hub/callback";
const credentials = { clientId: () => "provider-client", clientSecret: () => "provider-secret" };
const convex = convexConnection(credentials);
const cloudflare = cloudflareConnection(credentials);
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

async function setup(firstParty = true) {
  const h = await createHarness({
    connectors: [google(credentials)],
    resources: [convex, cloudflare],
  });
  const registered = await h.registerClient({
    appName: "Resource app",
    firstParty,
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

async function complete(h: Harness, start: Response) {
  const upstream = new URL(start.headers.get("location") ?? "");
  const callback = new URL(upstream.searchParams.get("redirect_uri") ?? "");
  callback.searchParams.set("code", "upstream-code");
  callback.searchParams.set("state", upstream.searchParams.get("state") ?? "");
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
    firstParty: true,
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

test("authorization refuses an unknown resource before contacting a provider", async () => {
  const args = await setup();
  const { start } = await authorize(args, "https://attacker.example/api");
  expect(new URL(start.headers.get("location") ?? "").searchParams.get("error")).toBe(
    "invalid_target",
  );
  expect(args.tokenCalls).toHaveLength(0);
});

test("the provider gets its configured scope, whatever the client requests", async () => {
  const args = await setup();
  const { start } = await authorize(args, cloudflare.resource, { scope: "openid" });
  const upstream = new URL(start.headers.get("location") ?? "");
  expect(upstream.searchParams.get("scope")).toBe(cloudflare.scopes.join(" "));
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

test("a third-party app cannot obtain an API grant", async () => {
  const args = await setup(false);
  expect((await authorize(args)).start.status).toBe(403);
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
