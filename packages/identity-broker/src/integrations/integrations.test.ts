// The integrations part over HTTP, ported from the Convex broker's resources.test.ts: a client gets
// a user's Convex, Cloudflare or GitHub token through the broker, against fake providers at the
// providers' real endpoints. The broker is pass-through: the client holds the provider's tokens, and
// the broker keeps none. openid-client stands in for the client where the wire matters.
import { Schema } from "effect";
import * as client from "openid-client";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { createBroker, fakeUpstream, pkce } from "../core/testing/harness.ts";
import { LEASE_MS } from "../rules/clients.ts";
import {
  authorize,
  callback,
  cloudflare,
  connect,
  integrationsBroker,
  convex,
  convexToken,
  github,
  redeem,
  REDIRECT,
  refresh,
  revoke,
  tokenRequest,
  type IntegrationsBroker,
} from "./testing.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

const testClient = (h: IntegrationsBroker) => ({ ...h.client, redirectUri: REDIRECT });
const requests = (h: IntegrationsBroker) => h.memory.db.contents().connectionRequests;
/** Whether any row of any table of the broker holds `token`. */
const holds = (h: IntegrationsBroker, token: string) =>
  JSON.stringify(h.memory.db.contents()).includes(token);

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

/** A Cloudflare connection: the provider's refresh token, which the client now holds. */
const connectCloudflare = async (h: IntegrationsBroker) => {
  const response = await connect(h, testClient(h), cloudflare.resource);
  expect(response.status).toBe(200);
  return (await tokensOf(response)).refresh_token ?? "";
};

/** openid-client's fetch, through the broker. */
const brokerFetch =
  (h: IntegrationsBroker): client.CustomFetch =>
  async (url, options) =>
    h.fetchBroker(url, {
      method: options.method,
      headers: options.headers,
      ...(typeof options.body === "string" || options.body instanceof URLSearchParams
        ? { body: options.body }
        : {}),
    });

test("openid-client gets a Convex token through discovery, resource and PKCE", async () => {
  const h = await integrationsBroker();
  const config = await client.discovery(
    new URL(h.issuer),
    h.client.clientId,
    undefined,
    client.ClientSecretPost(h.client.clientSecret),
    { [client.customFetch]: brokerFetch(h) },
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
  // The broker's own PKCE to the provider, not the client's.
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
  expect(holds(h, convexToken.access_token)).toBe(false);
});

test("a GitHub App user token and GitHub's own refresh token go to the client, and the broker keeps neither", async () => {
  const h = await integrationsBroker();
  const { start } = await authorize(h, testClient(h), github.resource);
  const upstream = new URL(start.headers.get("location") ?? "");
  expect(upstream.searchParams.get("redirect_uri")).toBe(
    `${h.issuer}/integrations/github/callback`,
  );
  expect(upstream.searchParams.has("scope")).toBe(false);
  // The account picker, so a user can connect another account than the browser's.
  expect(upstream.searchParams.get("prompt")).toBe("select_account");
  const tokens = await tokensOf(await connect(h, testClient(h), github.resource));
  expect(tokens).toMatchObject({
    access_token: "ghu_16C7e42F292c6912E7710c838347Ae178B4a",
    refresh_token: "github-refresh-1",
  });
  expect(tokens).not.toHaveProperty("scope");
  expect(h.providers.isLive("github-refresh-1")).toBe(true);
  expect([
    holds(h, "ghu_16C7e42F292c6912E7710c838347Ae178B4a"),
    holds(h, "github-refresh-1"),
  ]).toEqual([false, false]);
});

test("a GitHub callback without its issuer is refused before the provider is called (RFC 9207)", async () => {
  const h = await integrationsBroker();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  const { start } = await authorize(h, testClient(h), github.resource);
  const { returned } = await callback(h, start);
  expect(returned.searchParams.get("error")).toBe("server_error");
  expect(returned.searchParams.get("state")).toBe("client-state");
  expect(returned.searchParams.get("iss")).toBe(h.issuer);
  expect(h.providers.calls).toEqual([]);
});

test("openid-client refreshes the provider's rotating token through the broker, and the broker keeps none", async () => {
  const h = await integrationsBroker();
  const initial = await connectCloudflare(h);
  const config = new client.Configuration(
    { issuer: h.issuer, token_endpoint: `${h.issuer}/token` },
    h.client.clientId,
    undefined,
    client.ClientSecretPost(h.client.clientSecret),
  );
  config[client.customFetch] = brokerFetch(h);
  const resource = { resource: cloudflare.resource };
  const first = await client.refreshTokenGrant(config, initial, resource);
  const second = await client.refreshTokenGrant(config, first.refresh_token ?? "", resource);
  expect([first.refresh_token, second.refresh_token]).toEqual([
    "cloudflare-refresh-2",
    "cloudflare-refresh-3",
  ]);
  expect(first.expires_in).toBe(3600);
  // The provider got the client's tokens, with the broker's client_secret_basic.
  const sent = h.providers.calls.map((call) => call.body.get("refresh_token"));
  expect(sent.slice(1)).toEqual([initial, "cloudflare-refresh-2"]);
  expect(h.providers.calls.every((call) => !call.body.has("client_secret"))).toBe(true);
  expect(new Set(h.providers.calls.map((call) => call.authorization))).toEqual(
    new Set([`Basic ${btoa("provider%2Dclient:provider%2Dsecret")}`]),
  );
  expect(
    [initial, "cloudflare-refresh-2", "cloudflare-refresh-3", second.access_token].map((token) =>
      holds(h, token),
    ),
  ).toEqual([false, false, false, false]);
});

test("GitHub's HTTP 200 refusal answers 400 invalid_grant; a provider failure answers 503", async () => {
  const h = await integrationsBroker();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  const token = (await tokensOf(await connect(h, testClient(h), github.resource))).refresh_token;
  const spent = await refresh(h, testClient(h), "github-refresh-0", github.resource);
  expect([spent.status, (await tokensOf(spent)).error]).toEqual([400, "invalid_grant"]);
  const failures = [
    () => Promise.reject(new TypeError("fetch failed")),
    () => Promise.resolve(new Response("Bad gateway", { status: 502 })),
  ];
  for (const failure of failures) {
    const stop = h.fetch.plan({
      match: (request) => request.url === github.server.token_endpoint,
      respond: failure,
    });
    const answer = await refresh(h, testClient(h), token ?? "", github.resource);
    stop();
    expect([answer.status, (await tokensOf(answer)).error]).toEqual([
      503,
      "temporarily_unavailable",
    ]);
  }
  expect(h.providers.isLive(token ?? "")).toBe(true);
});

test("a provider that does not answer in 30 s answers 503, never invalid_grant", async () => {
  const h = await integrationsBroker();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  const token = await connectCloudflare(h);
  const timeout = AbortSignal.timeout.bind(AbortSignal);
  const asked: number[] = [];
  vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
    asked.push(ms);
    return timeout(1);
  });
  h.fetch.plan({
    match: (request) => request.url === cloudflare.server.token_endpoint,
    respond: (request) =>
      new Promise((_resolve, reject) => {
        if (request.signal.aborted) {
          reject(request.signal.reason);
        }
        request.signal.addEventListener("abort", () => reject(request.signal.reason));
      }),
  });
  const late = await refresh(h, testClient(h), token, cloudflare.resource);
  expect([late.status, (await tokensOf(late)).error, asked]).toEqual([
    503,
    "temporarily_unavailable",
    [30_000],
  ]);
});

test("a stopped client, or one whose card does not offer the provider, cannot refresh", async () => {
  const h = await integrationsBroker();
  const token = await connectCloudflare(h);
  const calls = h.providers.calls.length;
  await h.editCard(h.client.clientId, (card) => ({ ...card, gates: ["test:gate"] }));
  await h.setStop("test:gate", true);
  const stopped = await refresh(h, testClient(h), token, cloudflare.resource);
  expect([stopped.status, (await tokensOf(stopped)).error]).toEqual([401, "invalid_client"]);
  await h.setStop("test:gate", false);
  await h.editCard(h.client.clientId, (card) => ({ ...card, connections: ["convex"] }));
  const withdrawn = await refresh(h, testClient(h), token, cloudflare.resource);
  expect([withdrawn.status, (await tokensOf(withdrawn)).error]).toEqual([400, "invalid_target"]);
  expect(h.providers.calls).toHaveLength(calls);
});

test("a refresh needs one configured resource and no scope, before the provider is called", async () => {
  const h = await integrationsBroker();
  const token = await connectCloudflare(h);
  const calls = h.providers.calls.length;
  const answers = [];
  for (const params of [
    { grant_type: "refresh_token", refresh_token: token },
    { grant_type: "refresh_token", refresh_token: token, resource: "https://other.example/" },
    {
      grant_type: "refresh_token",
      refresh_token: token,
      resource: cloudflare.resource,
      scope: "workers-scripts.read",
    },
  ]) {
    const response = await tokenRequest(h, testClient(h), params);
    answers.push([response.status, (await tokensOf(response)).error]);
  }
  expect(answers).toEqual([
    [400, "invalid_target"],
    [400, "invalid_target"],
    [400, "invalid_scope"],
  ]);
  expect(h.providers.calls).toHaveLength(calls);
});

test("RFC 7009: the broker forwards a Cloudflare revocation with its own client authentication", async () => {
  const h = await integrationsBroker();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  const token = await connectCloudflare(h);
  const calls = h.providers.calls.length;
  expect(
    (await revoke(h, { ...testClient(h), clientSecret: "wrong" }, token, cloudflare.resource))
      .status,
  ).toBe(401);
  const asJson = await h.fetchBroker(`${h.issuer}/revoke`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...h.client, token, resource: cloudflare.resource }),
  });
  expect(asJson.status).toBe(400);
  expect((await revoke(h, testClient(h), token, "https://other.example/")).status).toBe(400);
  expect(h.providers.calls).toHaveLength(calls);
  // A stopped client may still revoke: a revocation only takes access away.
  await h.editCard(h.client.clientId, (card) => ({ ...card, gates: ["test:gate"] }));
  await h.setStop("test:gate", true);
  const revoked = await revoke(h, testClient(h), token, cloudflare.resource);
  expect([revoked.status, await revoked.text()]).toEqual([200, ""]);
  const sent = h.providers.calls.at(-1);
  expect([sent?.url, sent?.body.get("token"), sent?.body.get("token_type_hint")]).toEqual([
    cloudflare.server.revocation_endpoint,
    token,
    "refresh_token",
  ]);
  expect(sent?.authorization).toBe(`Basic ${btoa("provider%2Dclient:provider%2Dsecret")}`);
  expect(h.providers.isLive(token)).toBe(false);
  const stop = h.fetch.plan({
    match: (request) => request.url === cloudflare.server.revocation_endpoint,
    respond: () => Promise.reject(new TypeError("fetch failed")),
  });
  const unavailable = await revoke(h, testClient(h), token, cloudflare.resource);
  stop();
  expect([unavailable.status, (await tokensOf(unavailable)).error]).toEqual([
    503,
    "temporarily_unavailable",
  ]);
});

test("a revocation at a provider with no revocation endpoint answers 200 and calls nothing", async () => {
  const h = await integrationsBroker();
  const token = (await tokensOf(await connect(h, testClient(h), github.resource))).refresh_token;
  const calls = h.providers.calls.length;
  const revoked = await revoke(h, testClient(h), token ?? "", github.resource);
  expect([revoked.status, await revoked.text()]).toEqual([200, ""]);
  expect(h.providers.calls).toHaveLength(calls);
});

test("a connection, a refresh, a refused refresh and a revocation each log one broker_event line", async () => {
  const h = await integrationsBroker();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
  const initial = await connectCloudflare(h);
  const renewed = await tokensOf(await refresh(h, testClient(h), initial, cloudflare.resource));
  const spent = await refresh(h, testClient(h), initial, cloudflare.resource);
  expect(spent.status).toBe(400);
  const revoked = await revoke(h, testClient(h), renewed.refresh_token ?? "", cloudflare.resource);
  expect(revoked.status).toBe(200);
  const { clientId, ref } = h.client;
  const line = (event: string, reason: string | null) => [
    `broker_event ${JSON.stringify({ event, clientId, ref, connector: "cloudflare", reason })}`,
  ];
  expect(log.mock.calls).toEqual([
    line("connection", null),
    line("refresh", null),
    line("refresh_refused", "invalid_grant"),
    line("revoke", null),
  ]);
  const secrets = [
    initial,
    renewed.refresh_token ?? "",
    renewed.access_token ?? "",
    h.client.clientSecret,
    REDIRECT,
  ];
  const logged = JSON.stringify(log.mock.calls);
  expect(secrets.filter((secret) => logged.includes(secret))).toEqual([]);
});

describe("/authorize refuses on a page, before any provider call", () => {
  test.each([
    ["an unknown resource", { resource: "https://attacker.example/api" }, 400],
    ["a scope for a resource with no scopes", { scope: "read" }, 400],
    ["a response_mode other than query", { response_mode: "form_post" }, 400],
  ])("%s", async (_name, extra, status) => {
    const h = await integrationsBroker();
    const { start } = await authorize(h, testClient(h), convex.resource, extra);
    expect([start.status, start.headers.get("location")]).toEqual([status, null]);
    expect(requests(h)).toEqual([]);
  });

  test("two resources (RFC 8707 section 2: the broker serves one per request)", async () => {
    const h = await integrationsBroker();
    const params = new URLSearchParams({
      client_id: h.client.clientId,
      redirect_uri: REDIRECT,
      response_type: "code",
      code_challenge: (await pkce()).challenge,
      code_challenge_method: "S256",
    });
    params.append("resource", convex.resource);
    params.append("resource", cloudflare.resource);
    const refused = await h.fetchBroker(`${h.issuer}/authorize?${params.toString()}`);
    expect([refused.status, refused.headers.get("location")]).toEqual([400, null]);
  });

  test("a provider that is not on the card, or a stopped card", async () => {
    const h = await integrationsBroker({ connections: ["convex"] });
    expect((await authorize(h, testClient(h), cloudflare.resource)).start.status).toBe(403);
    await h.editCard(h.client.clientId, (card) => ({ ...card, gates: ["test:gate"] }));
    await h.setStop("test:gate", true);
    expect((await authorize(h, testClient(h), convex.resource)).start.status).toBe(403);
    expect(requests(h)).toEqual([]);
  });
});

test("the provider gets the broker's scopes and offline_access, whatever the client asks", async () => {
  const h = await integrationsBroker();
  const { start } = await authorize(h, testClient(h), cloudflare.resource, { scope: "openid" });
  const upstream = new URL(start.headers.get("location") ?? "");
  expect(upstream.searchParams.get("scope")).toBe("workers-scripts.read offline_access");
  expect(upstream.searchParams.has("prompt")).toBe(false);
});

test("the callback needs the browser that started it, and cannot be replayed", async () => {
  const h = await integrationsBroker();
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
  const h = await integrationsBroker();
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

test("a replayed code is refused (RFC 6749 section 4.1.2)", async () => {
  const h = await integrationsBroker();
  const { start, verifier } = await authorize(h, testClient(h), cloudflare.resource);
  const code = (await callback(h, start)).returned.searchParams.get("code") ?? "";
  expect((await redeem(h, testClient(h), code, verifier)).status).toBe(200);
  const replay = await redeem(h, testClient(h), code, verifier);
  expect([replay.status, (await tokensOf(replay)).error]).toEqual([400, "invalid_grant"]);
});

test("a code expires after 60 s, and expires_in counts the time spent returning to the app", async () => {
  const h = await integrationsBroker();
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
  const h = await integrationsBroker();
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

test("connection use renews a temporary card: the code exchange and an admitted refresh", async () => {
  const h = await integrationsBroker();
  await h.editCard(h.client.clientId, (card) => ({ ...card, removeAt: h.clock.now() + 1_000 }));
  const removeAt = () => h.memory.db.contents().clients.map((card) => card.removeAt);
  const token = await connectCloudflare(h);
  expect(removeAt()).toEqual([h.clock.now() + LEASE_MS]);
  h.clock.advance(5_000);
  expect((await refresh(h, testClient(h), token, cloudflare.resource)).status).toBe(200);
  expect(removeAt()).toEqual([h.clock.now() + LEASE_MS]);
});

test("with the part mounted, a sign-in code still redeems at the core", async () => {
  const h = await integrationsBroker({ connectors: (fetch) => [fakeUpstream(fetch).connector] });
  const { verifier, challenge } = await pkce();
  const params = new URLSearchParams({
    client_id: h.client.clientId,
    redirect_uri: REDIRECT,
    response_type: "code",
    scope: "openid",
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  const start = await h.fetchBroker(`${h.issuer}/authorize?${params.toString()}`);
  const { returned } = await callback(h, start);
  const tokens = await tokensOf(
    await redeem(h, testClient(h), returned.searchParams.get("code") ?? "", verifier),
  );
  expect(tokens.id_token).toBeDefined();
});

test("a broker without the part mounts no integration route and offers no refresh grant", async () => {
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
    h.fetchBroker(`${h.issuer}/integrations/cloudflare/callback?state=s`),
  ]);
  expect(routes.map((response) => response.status)).toEqual([404, 404]);
});
