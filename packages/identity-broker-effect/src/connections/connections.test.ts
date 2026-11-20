// The connections part over HTTP, ported from the Convex broker's resources.test.ts: a client gets
// a user's Convex, Cloudflare or GitHub token through the hub, against fake providers at the
// providers' real token endpoints. openid-client stands in for the client where the wire matters.
import { Schema } from "effect";
import * as client from "openid-client";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { fakeUpstream, pkce } from "../core/testing/harness.ts";
import { LEASE_MS } from "../rules/clients.ts";
import { GRANT_IDLE_MS } from "./rules.ts";
import {
  authorize,
  callback,
  cloudflare,
  connect,
  connectionsHub,
  convex,
  convexToken,
  github,
  redeem,
  REDIRECT,
  refresh,
  revoke,
  type ConnectionsHub,
} from "./testing.ts";
import { createBroker } from "../core/testing/harness.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

const testClient = (h: ConnectionsHub) => ({ ...h.client, redirectUri: REDIRECT });
const grants = (h: ConnectionsHub) => h.memory.db.contents().connectionGrants;
const requests = (h: ConnectionsHub) => h.memory.db.contents().connectionRequests;

const opt = Schema.optionalKey;
/** The members of a token answer or an OAuth error that the tests read. */
const Answer = Schema.Struct({
  access_token: opt(Schema.String),
  refresh_token: opt(Schema.String),
  id_token: opt(Schema.String),
  scope: opt(Schema.String),
  expires_in: opt(Schema.Number),
  error: opt(Schema.String),
});
const tokensOf = async (response: Response) =>
  Schema.decodeUnknownSync(Answer)(await response.json());

/** A Cloudflare connection: its grant's hub refresh token. */
const connectCloudflare = async (h: ConnectionsHub) => {
  const response = await connect(h, testClient(h), cloudflare.resource);
  expect(response.status).toBe(200);
  return (await tokensOf(response)).refresh_token ?? "";
};

/** openid-client's fetch, through the hub. */
const hubFetch =
  (h: ConnectionsHub): client.CustomFetch =>
  async (url, options) =>
    h.fetchBroker(url, {
      method: options.method,
      headers: options.headers,
      ...(typeof options.body === "string" || options.body instanceof URLSearchParams
        ? { body: options.body }
        : {}),
    });

test("openid-client gets a Convex token through discovery, resource and PKCE", async () => {
  const h = await connectionsHub();
  const config = await client.discovery(
    new URL(h.issuer),
    h.client.clientId,
    undefined,
    client.ClientSecretPost(h.client.clientSecret),
    { [client.customFetch]: hubFetch(h) },
  );
  expect(config.serverMetadata().grant_types_supported).toEqual([
    "authorization_code",
    "refresh_token",
  ]);
  expect(config.serverMetadata().revocation_endpoint).toBe(`${h.issuer}/revoke`);
  const verifier = client.randomPKCECodeVerifier();
  const state = client.randomState();
  const url = client.buildAuthorizationUrl(config, {
    redirect_uri: REDIRECT,
    resource: convex.resource,
    state,
    code_challenge: await client.calculatePKCECodeChallenge(verifier),
    code_challenge_method: "S256",
  });
  const start = await h.fetchBroker(url);
  const upstream = new URL(start.headers.get("location") ?? "");
  expect(upstream.origin + upstream.pathname).toBe(convex.server.authorization_endpoint);
  expect(upstream.searchParams.has("scope")).toBe(false);
  // The hub's own PKCE to the provider, not the client's.
  expect(upstream.searchParams.get("code_challenge")).not.toBe(
    url.searchParams.get("code_challenge"),
  );
  const { returned } = await callback(h, start);
  expect(returned.searchParams.get("iss")).toBe(h.issuer);
  const tokens = await client.authorizationCodeGrant(config, returned, {
    pkceCodeVerifier: verifier,
    expectedState: state,
    idTokenExpected: false,
  });
  expect(tokens.access_token).toBe(convexToken.access_token);
  expect([tokens.refresh_token, tokens.expires_in, tokens.scope, tokens.id_token]).toEqual([
    undefined,
    undefined,
    undefined,
    undefined,
  ]);
  expect(h.providers.calls.map((call) => call.body.get("client_secret"))).toEqual([
    "provider-secret",
  ]);
  // Convex has no refresh grant: the hub keeps nothing after the exchange.
  expect([requests(h), grants(h)]).toEqual([[], []]);
});

test("a GitHub App user token goes through the hub with no scope, behind the hub's refresh token", async () => {
  const h = await connectionsHub();
  const { start } = await authorize(h, testClient(h), github.resource);
  const upstream = new URL(start.headers.get("location") ?? "");
  expect(upstream.searchParams.get("redirect_uri")).toBe(`${h.issuer}/connections/github/callback`);
  expect(upstream.searchParams.has("scope")).toBe(false);
  // The account picker, so a user can connect another account than the browser's.
  expect(upstream.searchParams.get("prompt")).toBe("select_account");
  const response = await connect(h, testClient(h), github.resource);
  const tokens = await tokensOf(response);
  expect(tokens).toMatchObject({ access_token: "ghu_16C7e42F292c6912E7710c838347Ae178B4a" });
  expect(tokens).not.toHaveProperty("scope");
  expect(tokens.refresh_token).toBeDefined();
  expect(grants(h).map((grant) => grant.upstreamRefreshToken)).not.toContain(tokens.refresh_token);
});

test("a GitHub callback without its issuer is refused before the provider is called (RFC 9207)", async () => {
  const h = await connectionsHub();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  const { start } = await authorize(h, testClient(h), github.resource);
  const { returned } = await callback(h, start);
  expect(returned.searchParams.get("error")).toBe("server_error");
  expect(returned.searchParams.get("state")).toBe("client-state");
  expect(returned.searchParams.get("iss")).toBe(h.issuer);
  expect(h.providers.calls).toEqual([]);
});

test("only the provider's invalid_grant ends a grant; GitHub's HTTP 200 refusal counts as one", async () => {
  const h = await connectionsHub();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  const initial = await tokensOf(await connect(h, testClient(h), github.resource));
  const token = initial.refresh_token ?? "";
  h.providers.holdRefreshes(async (held) => held.unavailable());
  const outage = await refresh(h, testClient(h), token);
  expect([outage.status, (await tokensOf(outage)).error]).toEqual([503, "temporarily_unavailable"]);
  expect(grants(h)).toHaveLength(1);
  h.providers.holdRefreshes(async (held) => held.refuse());
  const refused = await refresh(h, testClient(h), token);
  expect([refused.status, (await tokensOf(refused)).error]).toEqual([400, "invalid_grant"]);
  expect(grants(h)).toEqual([]);
});

test("openid-client refreshes with a stable hub token while the hub keeps the provider's rotation", async () => {
  const h = await connectionsHub();
  const hubToken = await connectCloudflare(h);
  const config = new client.Configuration(
    { issuer: h.issuer, token_endpoint: `${h.issuer}/token` },
    h.client.clientId,
    undefined,
    client.ClientSecretPost(h.client.clientSecret),
  );
  config[client.customFetch] = hubFetch(h);
  const first = await client.refreshTokenGrant(config, hubToken);
  const second = await client.refreshTokenGrant(config, hubToken);
  expect([first.refresh_token, second.refresh_token]).toEqual([hubToken, hubToken]);
  expect(first.expires_in).toBe(3600);
  // Each refresh sent the provider's newest token, with client_secret_basic.
  const sent = h.providers.calls.map((call) => call.body.get("refresh_token"));
  expect(sent.slice(1)).toEqual(["cloudflare-refresh-1", "cloudflare-refresh-2"]);
  expect(h.providers.calls.every((call) => !call.body.has("client_secret"))).toBe(true);
  expect(new Set(h.providers.calls.map((call) => call.authorization))).toEqual(
    new Set([`Basic ${btoa("provider%2Dclient:provider%2Dsecret")}`]),
  );
  expect(grants(h).map((grant) => h.providers.isLive(grant.upstreamRefreshToken))).toEqual([true]);
});

test("RFC 7009: only the owner revokes, and an unknown or another client's token answers 200", async () => {
  const h = await connectionsHub();
  const token = await connectCloudflare(h);
  const other = await h.registerClient({ appName: "Other", redirectUri: REDIRECT });
  const otherClient = { ...other, redirectUri: REDIRECT };
  expect((await revoke(h, { ...testClient(h), clientSecret: "wrong" }, token)).status).toBe(401);
  const asJson = await h.fetchBroker(`${h.issuer}/revoke`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...h.client, token }),
  });
  expect(asJson.status).toBe(400);
  expect((await revoke(h, otherClient, token)).status).toBe(200);
  expect(grants(h)).toHaveLength(1);
  for (const each of [token, token, "unknown-token"]) {
    const revoked = await revoke(h, testClient(h), each);
    expect([revoked.status, await revoked.text()]).toEqual([200, ""]);
  }
  expect(grants(h)).toEqual([]);
});

describe("/authorize refuses on a page, before any provider call", () => {
  test.each([
    ["an unknown resource", { resource: "https://attacker.example/api" }, 400],
    ["a scope for a resource with no scopes", { scope: "read" }, 400],
    ["a response_mode other than query", { response_mode: "form_post" }, 400],
  ])("%s", async (_name, extra, status) => {
    const h = await connectionsHub();
    const { start } = await authorize(h, testClient(h), convex.resource, extra);
    expect([start.status, start.headers.get("location")]).toEqual([status, null]);
    expect(requests(h)).toEqual([]);
  });

  test("two resources (RFC 8707 section 2: the hub serves one per request)", async () => {
    const h = await connectionsHub();
    const params = new URLSearchParams({
      client_id: h.client.clientId,
      redirect_uri: REDIRECT,
      response_type: "code",
      code_challenge: (await pkce()).challenge,
      code_challenge_method: "S256",
    });
    params.append("resource", convex.resource);
    params.append("resource", cloudflare.resource);
    const refused = await h.fetchBroker(`${h.issuer}/authorize?${params}`);
    expect([refused.status, refused.headers.get("location")]).toEqual([400, null]);
  });

  test("a provider that is not on the card, or a stopped card", async () => {
    const h = await connectionsHub({ connections: ["convex"] });
    expect((await authorize(h, testClient(h), cloudflare.resource)).start.status).toBe(403);
    await h.editCard(h.client.clientId, (card) => ({ ...card, gates: ["test:gate"] }));
    await h.setStop("test:gate", true);
    expect((await authorize(h, testClient(h), convex.resource)).start.status).toBe(403);
    expect(requests(h)).toEqual([]);
  });
});

test("the provider gets the hub's scopes and offline_access, whatever the client asks", async () => {
  const h = await connectionsHub();
  const { start } = await authorize(h, testClient(h), cloudflare.resource, { scope: "openid" });
  const upstream = new URL(start.headers.get("location") ?? "");
  expect(upstream.searchParams.get("scope")).toBe("workers-scripts.read offline_access");
  expect(upstream.searchParams.has("prompt")).toBe(false);
});

test("the callback needs the browser that started it, and cannot be replayed", async () => {
  const h = await connectionsHub();
  const { start } = await authorize(h, testClient(h), convex.resource);
  const upstream = new URL(start.headers.get("location") ?? "");
  const url = new URL(upstream.searchParams.get("redirect_uri") ?? "");
  url.searchParams.set("code", "upstream-code");
  url.searchParams.set("state", upstream.searchParams.get("state") ?? "");
  expect((await h.fetchBroker(url)).status).toBe(400);
  expect(h.providers.calls).toEqual([]);
  expect((await callback(h, start)).back.status).toBe(302);
  expect((await callback(h, start)).back.status).toBe(400);
  expect(h.providers.calls).toHaveLength(1);
});

test("a code exchange checks resource, return address, client and PKCE without spending the code", async () => {
  const h = await connectionsHub();
  const { start, verifier } = await authorize(h, testClient(h), cloudflare.resource);
  const code = (await callback(h, start)).returned.searchParams.get("code") ?? "";
  const answers = [];
  for (const [extra, wrongVerifier] of [
    [{ resource: convex.resource }, false],
    [{ redirect_uri: "https://other.example/cb" }, false],
    [{ client_secret: "wrong" }, false],
    [{}, true],
  ] as const) {
    const response = await redeem(
      h,
      testClient(h),
      code,
      wrongVerifier ? "x".repeat(43) : verifier,
      extra,
    );
    answers.push([response.status, (await tokensOf(response)).error]);
  }
  expect(answers).toEqual([
    [400, "invalid_target"],
    [400, "invalid_grant"],
    [401, "invalid_client"],
    [400, "invalid_grant"],
  ]);
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: h.client.clientId,
    client_secret: h.client.clientSecret,
    code,
    code_verifier: verifier,
    redirect_uri: REDIRECT,
  });
  body.append("resource", cloudflare.resource);
  body.append("resource", convex.resource);
  const twice = await h.fetchBroker(`${h.issuer}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  expect([twice.status, (await tokensOf(twice)).error]).toEqual([400, "invalid_target"]);
  // An empty resource counts as omitted (RFC 6749 section 3.2).
  expect((await redeem(h, testClient(h), code, verifier, { resource: "" })).status).toBe(200);
});

test("a replayed code is refused and deletes the grant it issued (RFC 6749 section 4.1.2)", async () => {
  const h = await connectionsHub();
  const { start, verifier } = await authorize(h, testClient(h), cloudflare.resource);
  const code = (await callback(h, start)).returned.searchParams.get("code") ?? "";
  const first = await tokensOf(await redeem(h, testClient(h), code, verifier));
  expect(grants(h)).toHaveLength(1);
  const replay = await redeem(h, testClient(h), code, verifier);
  expect([replay.status, (await tokensOf(replay)).error]).toEqual([400, "invalid_grant"]);
  expect(grants(h)).toEqual([]);
  expect((await refresh(h, testClient(h), first.refresh_token ?? "")).status).toBe(400);
});

test("a code expires after 60 s, and expires_in counts the time spent returning to the app", async () => {
  const h = await connectionsHub();
  const { start, verifier } = await authorize(h, testClient(h), cloudflare.resource);
  const code = (await callback(h, start)).returned.searchParams.get("code") ?? "";
  h.clock.advance(20_000);
  expect(await tokensOf(await redeem(h, testClient(h), code, verifier))).toMatchObject({
    expires_in: 3580,
  });
  const late = await authorize(h, testClient(h), cloudflare.resource);
  const lateCode = (await callback(h, late.start)).returned.searchParams.get("code") ?? "";
  h.clock.advance(60_001);
  expect((await redeem(h, testClient(h), lateCode, late.verifier)).status).toBe(400);
});

test("a stop that lands while the provider answers sends the user back with no code", async () => {
  const h = await connectionsHub();
  await h.editCard(h.client.clientId, (card) => ({ ...card, gates: ["test:gate"] }));
  const { start } = await authorize(h, testClient(h), cloudflare.resource);
  const stopping = h.fetch.plan({
    match: (request) => request.url === cloudflare.server.token_endpoint,
    respond: async () => {
      await h.setStop("test:gate", true);
      return Response.json({ access_token: "a", token_type: "Bearer" });
    },
  });
  const { returned } = await callback(h, start);
  stopping();
  expect(returned.origin + returned.pathname).toBe(REDIRECT);
  expect(returned.searchParams.get("error")).toBe("access_denied");
  expect(returned.searchParams.get("state")).toBe("client-state");
  expect(returned.searchParams.has("code")).toBe(false);
  expect(requests(h)).toEqual([]);
});

test("a stop during a refresh keeps the provider's rotation, answers 401, and an unstop restores the grant", async () => {
  const h = await connectionsHub();
  await h.editCard(h.client.clientId, (card) => ({ ...card, gates: ["test:gate"] }));
  const token = await connectCloudflare(h);
  h.providers.holdRefreshes(async (held) => {
    await h.setStop("test:gate", true);
    return held.answer;
  });
  const refused = await refresh(h, testClient(h), token);
  expect([refused.status, (await tokensOf(refused)).error]).toEqual([401, "invalid_client"]);
  expect(
    grants(h).map((grant) => [
      h.providers.isLive(grant.upstreamRefreshToken),
      grant.refreshStartedAt,
    ]),
  ).toEqual([[true, undefined]]);
  // The hub holds the provider's newest token, so the grant works again once the stop goes.
  h.providers.holdRefreshes(undefined);
  await h.setStop("test:gate", false);
  expect((await refresh(h, testClient(h), token)).status).toBe(200);
});

test("a refresh that asks for a scope, or names two resources, is refused before the provider", async () => {
  const h = await connectionsHub();
  const token = await connectCloudflare(h);
  const calls = h.providers.calls.length;
  const scoped = await refresh(h, testClient(h), token, { scope: "workers-scripts.read" });
  expect([scoped.status, (await tokensOf(scoped)).error]).toEqual([400, "invalid_scope"]);
  const other = await refresh(h, testClient(h), token, { resource: convex.resource });
  expect([other.status, (await tokensOf(other)).error]).toEqual([400, "invalid_target"]);
  expect(h.providers.calls).toHaveLength(calls);
  // Without a resource, or an empty one, the grant's resource is used.
  expect((await refresh(h, testClient(h), token, { resource: "" })).status).toBe(200);
});

test("connection use renews a temporary card: the code exchange and an admitted refresh", async () => {
  const h = await connectionsHub();
  await h.editCard(h.client.clientId, (card) => ({ ...card, removeAt: h.clock.now() + 1_000 }));
  const removeAt = () => h.memory.db.contents().clients.map((card) => card.removeAt);
  const token = await connectCloudflare(h);
  expect(removeAt()).toEqual([h.clock.now() + LEASE_MS]);
  h.clock.advance(5_000);
  expect((await refresh(h, testClient(h), token)).status).toBe(200);
  expect(removeAt()).toEqual([h.clock.now() + LEASE_MS]);
});

test("cleanup deletes idle grants, and the grants of the cards that the core's batch deletes", async () => {
  const h = await connectionsHub();
  await connectCloudflare(h);
  const temporary = await h.registerClient({
    appName: "Preview",
    redirectUri: REDIRECT,
    connections: ["cloudflare"],
    removeAt: h.clock.now(),
  });
  await connect(h, { ...temporary, redirectUri: REDIRECT }, cloudflare.resource);
  await h.editCard(temporary.clientId, (card) => ({ ...card, removeAt: h.clock.now() + 1_000 }));
  expect(grants(h)).toHaveLength(2);
  h.clock.advance(2_000);
  const now = h.clock.now();
  expect(h.memory.run("connections.cleanup", { now })).toMatchObject({ connectionGrants: 1 });
  expect(h.memory.run("lifecycle.cleanup", { now, signInRetentionMs: 0 })).toMatchObject({
    clients: 1,
  });
  expect(grants(h).map((grant) => grant.clientId)).toEqual([h.client.clientId]);
  expect(h.memory.run("connections.cleanup", { now: now + GRANT_IDLE_MS + 1 })).toMatchObject({
    connectionGrants: 1,
  });
  expect(grants(h)).toEqual([]);
});

test("with the part mounted, a sign-in code still redeems at the core", async () => {
  const h = await connectionsHub({ connectors: (fetch) => [fakeUpstream(fetch).connector] });
  const { verifier, challenge } = await pkce();
  const params = new URLSearchParams({
    client_id: h.client.clientId,
    redirect_uri: REDIRECT,
    response_type: "code",
    scope: "openid",
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  const start = await h.fetchBroker(`${h.issuer}/authorize?${params}`);
  const { returned } = await callback(h, start);
  const tokens = await tokensOf(
    await redeem(h, testClient(h), returned.searchParams.get("code") ?? "", verifier),
  );
  expect(tokens.id_token).toBeDefined();
});

test("a hub without the part mounts no connection route and offers no refresh grant", async () => {
  const h = await createBroker();
  const metadata = Schema.decodeUnknownSync(
    Schema.Struct({
      grant_types_supported: Schema.Array(Schema.String),
      revocation_endpoint: opt(Schema.String),
    }),
  )(await (await h.fetchBroker(`${h.issuer}/.well-known/openid-configuration`)).json());
  expect(metadata.grant_types_supported).toEqual(["authorization_code"]);
  expect(metadata.revocation_endpoint).toBeUndefined();
  const routes = await Promise.all([
    h.fetchBroker(`${h.issuer}/revoke`, { method: "POST" }),
    h.fetchBroker(`${h.issuer}/connections/cloudflare/callback?state=s`),
  ]);
  expect(routes.map((response) => response.status)).toEqual([404, 404]);
});
