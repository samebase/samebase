/// <reference types="vite-plus/client" />
import { decodeJwt } from "jose";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { api } from "../component/_generated/api.js";
import { LEASE_MS, MAX_APPS_PER_TENANT, MAX_CLIENTS_PER_APP } from "../component/registration.js";
import type { Connector } from "./connectors/types.js";
import {
  createHarness,
  fakeOidcUpstream,
  fakeUpstream,
  pkce,
  sha256Hex,
  txnCookie,
  type Harness,
} from "./harness.test.helper.js";

const TOKEN = "initial-access-token";
const REDIRECT_URI = "https://app-1.convex.site/auth/hub/callback";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** A hub with an open connector, and a reserved one that apps from /register use. */
async function hub(options: { paused?: () => boolean } = {}) {
  const { connector } = fakeUpstream();
  const reserved: Connector = { ...connector, name: "fake-apps", reserved: true };
  const h = await createHarness({
    connectors: [connector, reserved],
    registration: {
      initialAccessToken: () => TOKEN,
      connector: "fake-apps",
      ...(options.paused === undefined ? {} : { paused: options.paused }),
    },
  });
  return h;
}

const metadata = (overrides: Record<string, unknown> = {}) => ({
  redirect_uris: [REDIRECT_URI],
  client_name: "production",
  software_id: "gh-1-app",
  software_version: "abc123",
  tenant_id: "gh-1",
  deployment_type: "production",
  token_endpoint_auth_method: "client_secret_post",
  ...overrides,
});

async function postRegister(h: Harness, body: unknown, token: string | null = TOKEN) {
  return await h.fetchBroker(`${h.issuer}/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token === null ? {} : { Authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify(body),
  });
}

async function register(h: Harness, overrides: Record<string, unknown> = {}) {
  const response = await postRegister(h, metadata(overrides));
  expect(response.status).toBe(201);
  const client: {
    client_id: string;
    client_secret: string;
    registration_access_token: string;
    registration_client_uri: string;
  } = await response.json();
  return client;
}

/** The administrator's switch. */
async function suspend(h: Harness, tenantId: string, suspended: boolean) {
  await h.t.mutation(api.registration.setSuspended, { tenantId, suspended, now: Date.now() });
}

/** What the service that registers tenants sends when a tenant leaves or comes back. */
async function setConnection(h: Harness, tenantId: string, connected: boolean, revision: number) {
  const response = await h.fetchBroker(`${h.issuer}/tenant-connection`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ tenant_id: tenantId, connected, revision }),
  });
  expect(response.status).toBe(204);
}

function authorizeUrl(
  h: Harness,
  clientId: string,
  challenge: string,
  extra: Record<string, string> = {},
) {
  const url = new URL(`${h.issuer}/authorize`);
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: "openid email profile",
    state: "client-state",
    nonce: "client-nonce",
    code_challenge: challenge,
    code_challenge_method: "S256",
    ...extra,
  }).toString();
  return url;
}

/** Follows the upstream redirect back into the broker, and answers with the client's code. */
async function finishUpstream(h: Harness, start: Response) {
  const upstream = new URL(start.headers.get("location") ?? "");
  const callback = new URL(upstream.searchParams.get("redirect_uri") ?? "");
  callback.searchParams.set("code", "upstream-code");
  callback.searchParams.set("state", upstream.searchParams.get("state") ?? "");
  const response = await h.fetchBroker(callback, { headers: txnCookie(start) });
  return new URL(response.headers.get("location") ?? "").searchParams.get("code") ?? "";
}

async function redeem(
  h: Harness,
  args: { code: string; clientId: string; clientSecret: string; verifier: string },
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
    }).toString(),
  });
}

async function signIn(h: Harness, client: { client_id: string; client_secret: string }) {
  const { verifier, challenge } = await pkce();
  const start = await h.fetchBroker(authorizeUrl(h, client.client_id, challenge));
  const code = await finishUpstream(h, start);
  return await redeem(h, {
    code,
    clientId: client.client_id,
    clientSecret: client.client_secret,
    verifier,
  });
}

async function readClient(h: Harness, clientId: string) {
  return await h.t.query(api.clients.get, { clientId });
}

const configuration = (
  client: { registration_client_uri: string },
  token: string,
  method: string,
) => ({
  url: client.registration_client_uri,
  init: { method, headers: { Authorization: `Bearer ${token}` } },
});

describe("RFC 7591 registration", () => {
  test("the metadata names the endpoint only when a host offers it", async () => {
    const h = await hub();
    const document = await h.fetchBroker(`${h.issuer}/.well-known/openid-configuration`);
    expect(await document.json()).toMatchObject({ registration_endpoint: `${h.issuer}/register` });
    const plain = await createHarness({ connectors: [fakeUpstream().connector] });
    const none = await plain.fetchBroker(`${plain.issuer}/.well-known/openid-configuration`);
    expect(await none.json()).not.toHaveProperty("registration_endpoint");
    expect((await postRegister(plain, metadata())).status).toBe(404);
  });

  test("the initial access token opens it, and an unset token opens nothing", async () => {
    const h = await hub();
    const missing = await postRegister(h, metadata(), null);
    expect(missing.status).toBe(401);
    expect(missing.headers.get("www-authenticate")).toContain("invalid_token");
    expect((await postRegister(h, metadata(), "wrong")).status).toBe(401);
    const unset = await createHarness({
      connectors: [fakeUpstream().connector],
      registration: { initialAccessToken: () => undefined, connector: "fake" },
    });
    expect((await postRegister(unset, metadata(), "")).status).toBe(401);
    expect((await postRegister(unset, metadata(), "undefined")).status).toBe(401);
  });

  test("it answers with the fields of the RFC and keeps only hashes", async () => {
    const h = await hub();
    const response = await postRegister(h, metadata());
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body: Record<string, unknown> = await response.json();
    expect(body).toMatchObject({
      client_secret_expires_at: 0,
      redirect_uris: [REDIRECT_URI],
      grant_types: ["authorization_code"],
      response_types: ["code"],
      software_id: "gh-1-app",
    });
    expect(typeof body["client_id_issued_at"]).toBe("number");
    const clientId = String(body["client_id"]);
    expect(body["registration_client_uri"]).toBe(`${h.issuer}/register/${clientId}`);
    const row = await readClient(h, clientId);
    expect(row?.secretHash).toBe(await sha256Hex(String(body["client_secret"])));
    expect(row?.registrationTokenHash).toBe(
      await sha256Hex(String(body["registration_access_token"])),
    );
  });

  test.each([
    ["no redirect URI", { redirect_uris: [] }, "invalid_redirect_uri"],
    ["two redirect URIs", { redirect_uris: [REDIRECT_URI, REDIRECT_URI] }, "invalid_redirect_uri"],
    ["a plain http URI", { redirect_uris: ["http://example.com/cb"] }, "invalid_redirect_uri"],
    ["no app", { software_id: "" }, "invalid_client_metadata"],
    ["no tenant", { tenant_id: undefined }, "invalid_client_metadata"],
    ["a development client", { deployment_type: "development" }, "invalid_client_metadata"],
    ["another grant", { grant_types: ["implicit"] }, "invalid_client_metadata"],
    ["another auth method", { token_endpoint_auth_method: "none" }, "invalid_client_metadata"],
  ])("it refuses %s", async (_name, overrides, error) => {
    const h = await hub();
    const response = await postRegister(h, metadata(overrides));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error });
  });

  test("an app is third-party with its one connector, and a lost client just gets a new one", async () => {
    const h = await hub();
    const first = await register(h);
    const second = await register(h);
    expect(await h.t.query(api.apps.get, { appId: "gh-1-app" })).toMatchObject({
      firstParty: false,
      connector: "fake-apps",
      tenantId: "gh-1",
    });
    // Both stay valid: the hub never changes or retires a secret.
    expect(first.client_id).not.toBe(second.client_id);
    expect((await signIn(h, first)).status).toBe(200);
    expect((await signIn(h, second)).status).toBe(200);
  });

  test("it cannot reach an app of the host or of another tenant", async () => {
    const h = await hub();
    await h.t.mutation(api.apps.create, {
      appId: "samebase-com",
      name: "Samebase",
      firstParty: true,
      createdAt: 1,
    });
    await register(h, { software_id: "gh-1-app" });
    for (const overrides of [
      { software_id: "samebase-com" },
      { software_id: "gh-1-app", tenant_id: "gh-2" },
    ]) {
      const response = await postRegister(h, metadata(overrides));
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ error: "access_denied" });
    }
  });

  test("a paused hub refuses registration and sign-in, but not the host's own apps", async () => {
    let paused = false;
    const h = await hub({ paused: () => paused });
    const client = await register(h);
    const own = await h.registerClient({
      appName: "Own",
      firstParty: true,
      redirectUri: REDIRECT_URI,
    });
    paused = true;
    expect((await postRegister(h, metadata())).status).toBe(403);
    const { challenge } = await pkce();
    expect((await h.fetchBroker(authorizeUrl(h, client.client_id, challenge))).status).toBe(503);
    const ownStart = await h.fetchBroker(
      authorizeUrl(h, own.clientId, challenge, { connector: "fake" }),
    );
    expect(ownStart.status).toBe(302);
  });
});

describe("the one connector of an app from /register", () => {
  test("the app goes straight to it, whatever the URL says, and gets no first-party claim", async () => {
    const h = await hub();
    const client = await register(h);
    const { verifier, challenge } = await pkce();
    const start = await h.fetchBroker(
      authorizeUrl(h, client.client_id, challenge, { connector: "fake" }),
    );
    expect(start.status).toBe(302);
    const upstream = new URL(start.headers.get("location") ?? "");
    expect(upstream.searchParams.get("redirect_uri")).toBe(
      `${h.issuer}/connectors/fake-apps/callback`,
    );
    const code = await finishUpstream(h, start);
    const tokens: { id_token: string } = await (
      await redeem(h, {
        code,
        clientId: client.client_id,
        clientSecret: client.client_secret,
        verifier,
      })
    ).json();
    const claims = decodeJwt(tokens.id_token);
    expect(claims["connector"]).toBe("fake-apps");
    expect(claims).not.toHaveProperty("connector_account_id");
  });

  test("/continue cannot move a request to another connector, also after it started", async () => {
    const h = await hub();
    const client = await register(h);
    const { challenge } = await pkce();
    const start = await h.fetchBroker(authorizeUrl(h, client.client_id, challenge));
    const cookie = txnCookie(start);
    const requestId = cookie.Cookie.split("=")[0]?.replace("__Host-broker_txn_", "") ?? "";
    const moved = await h.fetchBroker(`${h.issuer}/continue?request=${requestId}&connector=fake`, {
      headers: cookie,
    });
    expect(moved.status).toBe(404);
  });

  test("the hub's other apps never see a reserved connector", async () => {
    const h = await hub();
    const own = await h.registerClient({
      appName: "Own",
      firstParty: true,
      redirectUri: REDIRECT_URI,
    });
    const other = await h.registerClient({
      appName: "Other",
      firstParty: false,
      redirectUri: REDIRECT_URI,
    });
    const { challenge } = await pkce();
    const page = await h.fetchBroker(authorizeUrl(h, other.clientId, challenge));
    const html = await page.text();
    expect(html).toContain('connector=fake"');
    expect(html).not.toContain("fake-apps");
    const cookie = txnCookie(page);
    const requestId = cookie.Cookie.split("=")[0]?.replace("__Host-broker_txn_", "") ?? "";
    const forced = await h.fetchBroker(
      `${h.issuer}/continue?request=${requestId}&connector=fake-apps`,
      { headers: cookie },
    );
    expect(forced.status).toBe(404);
    // A first-party app that names it falls back to its one open connector.
    const named = await h.fetchBroker(
      authorizeUrl(h, own.clientId, challenge, { connector: "fake-apps" }),
    );
    expect(new URL(named.headers.get("location") ?? "").searchParams.get("redirect_uri")).toBe(
      `${h.issuer}/connectors/fake/callback`,
    );
  });

  test("redemption refuses a code that came through another connector", async () => {
    const h = await hub();
    const client = await register(h);
    const { verifier, challenge } = await pkce();
    await h.t.mutation(api.authRequests.create, {
      requestId: "r1",
      appId: "gh-1-app",
      clientId: client.client_id,
      redirectUri: REDIRECT_URI,
      scope: "openid",
      codeChallenge: challenge,
      freshLogin: false,
      txnCookieHash: "x",
      createdAt: Date.now(),
      expiresAt: Date.now() + 60_000,
    });
    await h.t.mutation(api.authRequests.startUpstream, {
      requestId: "r1",
      connector: "fake",
      upstreamStateHash: "state",
      upstreamCodeVerifier: "v",
      now: Date.now(),
    });
    await h.t.mutation(api.authRequests.claimUpstream, {
      upstreamStateHash: "state",
      connector: "fake",
      txnCookieHashes: ["x"],
      now: Date.now(),
    });
    await h.t.mutation(api.authRequests.complete, {
      requestId: "r1",
      identity: { connector: "fake", upstreamId: "1" },
      authTime: Date.now(),
      codeHash: await sha256Hex("the-code"),
      codeExpiresAt: Date.now() + 60_000,
      now: Date.now(),
    });
    const response = await redeem(h, {
      code: "the-code",
      clientId: client.client_id,
      clientSecret: client.client_secret,
      verifier,
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid_grant" });
  });

  test("selectAccount sends prompt=select_account upstream", async () => {
    const { connector } = await fakeOidcUpstream();
    const h = await createHarness({
      connectors: [{ ...connector, name: "idp-apps", reserved: true, selectAccount: true }],
      registration: { initialAccessToken: () => TOKEN, connector: "idp-apps" },
    });
    const client = await register(h);
    const { challenge } = await pkce();
    const start = await h.fetchBroker(authorizeUrl(h, client.client_id, challenge));
    expect(new URL(start.headers.get("location") ?? "").searchParams.get("prompt")).toBe(
      "select_account",
    );
  });
});

describe("a refusal before sign-in (RFC 9700 section 4.11.2)", () => {
  test.each([
    ["prompt=none", { prompt: "none" }],
    ["a bad scope", { scope: "email" }],
    ["a fresh login that the connector cannot do", { prompt: "login" }],
  ])("%s gets a page at the hub, not a redirect to the app", async (_name, extra) => {
    const h = await hub();
    const client = await register(h);
    const { challenge } = await pkce();
    const response = await h.fetchBroker(authorizeUrl(h, client.client_id, challenge, extra));
    expect(response.status).toBe(400);
    expect(response.headers.get("location")).toBeNull();
  });

  test("the host's own app still gets the redirect", async () => {
    const h = await hub();
    const own = await h.registerClient({
      appName: "Own",
      firstParty: true,
      redirectUri: REDIRECT_URI,
    });
    const { challenge } = await pkce();
    const response = await h.fetchBroker(
      authorizeUrl(h, own.clientId, challenge, { prompt: "none" }),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain("error=login_required");
  });
});

describe("the salt of an app from /register", () => {
  test("two apps of one person get unrelated subjects, and the first-party salt is not used", async () => {
    const h = await hub();
    const first = await register(h, { software_id: "gh-1-a" });
    const second = await register(h, { software_id: "gh-1-b" });
    const subject = async (client: { client_id: string; client_secret: string }) => {
      const tokens: { id_token: string } = await (await signIn(h, client)).json();
      return decodeJwt(tokens.id_token).sub;
    };
    const a = await subject(first);
    expect(a).toBe(await subject(first));
    expect(a).not.toBe(await subject(second));
  });
});

describe("RFC 7592 client management", () => {
  test("a read answers without the secret, and only with the client's own token", async () => {
    const h = await hub();
    const client = await register(h);
    const other = await register(h);
    const own = configuration(client, client.registration_access_token, "GET");
    const response = await h.fetchBroker(own.url, own.init);
    expect(response.status).toBe(200);
    const body: Record<string, unknown> = await response.json();
    expect(body).toMatchObject({ client_id: client.client_id, redirect_uris: [REDIRECT_URI] });
    expect(body).not.toHaveProperty("client_secret");
    const wrong = configuration(client, other.registration_access_token, "GET");
    expect((await h.fetchBroker(wrong.url, wrong.init)).status).toBe(401);
    const bare = await h.fetchBroker(client.registration_client_uri);
    expect(bare.status).toBe(401);
  });

  test("a read renews a preview client and never dates a production client", async () => {
    vi.useFakeTimers({ now: 1_000_000_000_000 });
    const h = await hub();
    const preview = await register(h, { software_id: "gh-1-app-p", deployment_type: "preview" });
    const production = await register(h);
    expect((await readClient(h, preview.client_id))?.removeAt).toBe(Date.now() + LEASE_MS);
    vi.setSystemTime(Date.now() + LEASE_MS / 2);
    for (const client of [preview, production]) {
      const read = configuration(client, client.registration_access_token, "GET");
      await h.fetchBroker(read.url, read.init);
    }
    expect((await readClient(h, preview.client_id))?.removeAt).toBe(Date.now() + LEASE_MS);
    expect((await readClient(h, production.client_id))?.removeAt).toBeUndefined();
  });

  test("a sign-in moves the date in the redemption", async () => {
    vi.useFakeTimers({ now: 1_000_000_000_000, toFake: ["Date"] });
    const h = await hub();
    const client = await register(h, { software_id: "gh-1-app-p", deployment_type: "preview" });
    vi.setSystemTime(Date.now() + LEASE_MS / 2);
    expect((await signIn(h, client)).status).toBe(200);
    expect((await readClient(h, client.client_id))?.removeAt).toBe(Date.now() + LEASE_MS);
  });

  test("a production client cannot delete itself", async () => {
    const h = await hub();
    const client = await register(h);
    const own = configuration(client, client.registration_access_token, "DELETE");
    const response = await h.fetchBroker(own.url, own.init);
    expect(response.status).toBe(403);
    expect(await readClient(h, client.client_id)).not.toBeNull();
  });

  test("a delete removes only the client that asks, and a gone client answers 401", async () => {
    const h = await hub();
    const preview = { software_id: "gh-1-p", deployment_type: "preview" };
    const client = await register(h, preview);
    const other = await register(h, preview);
    const forged = configuration(client, other.registration_access_token, "DELETE");
    expect((await h.fetchBroker(forged.url, forged.init)).status).toBe(401);
    const own = configuration(client, client.registration_access_token, "DELETE");
    expect((await h.fetchBroker(own.url, own.init)).status).toBe(204);
    expect(await readClient(h, client.client_id)).toBeNull();
    expect((await h.fetchBroker(own.url, own.init)).status).toBe(401);
    const read = configuration(client, client.registration_access_token, "GET");
    expect((await h.fetchBroker(read.url, read.init)).status).toBe(401);
  });
});

describe("what a redemption does at once", () => {
  test("it marks the client as used, so a cap cannot take a client that just signed someone in", async () => {
    const h = await hub();
    const client = await register(h);
    expect((await readClient(h, client.client_id))?.lastSignInAt).toBeUndefined();
    // The audit row plays no part: the redemption alone sets the mark.
    const { verifier, challenge } = await pkce();
    const start = await h.fetchBroker(authorizeUrl(h, client.client_id, challenge));
    const code = await finishUpstream(h, start);
    await h.t.mutation(api.authRequests.exchangeCode, {
      clientId: client.client_id,
      clientSecretHash: await sha256Hex(client.client_secret),
      tokenEndpointAuthMethod: "client_secret_post",
      codeHash: await sha256Hex(code),
      codeVerifier: verifier,
      now: Date.now(),
    });
    expect((await readClient(h, client.client_id))?.lastSignInAt).toBeDefined();
  });

  test("a pause stops a sign-in that already started, and not the host's own apps", async () => {
    let paused = false;
    const h = await hub({ paused: () => paused });
    const client = await register(h);
    const { verifier, challenge } = await pkce();
    const start = await h.fetchBroker(authorizeUrl(h, client.client_id, challenge));
    const code = await finishUpstream(h, start);
    paused = true;
    const response = await redeem(h, {
      code,
      clientId: client.client_id,
      clientSecret: client.client_secret,
      verifier,
    });
    expect(response.status).toBe(401);
    const own = await h.registerClient({
      appName: "Own",
      firstParty: true,
      redirectUri: REDIRECT_URI,
    });
    const ownPkce = await pkce();
    const ownStart = await h.fetchBroker(
      authorizeUrl(h, own.clientId, ownPkce.challenge, { connector: "fake" }),
    );
    const ownCode = await finishUpstream(h, ownStart);
    const ownResponse = await redeem(h, {
      code: ownCode,
      clientId: own.clientId,
      clientSecret: own.clientSecret,
      verifier: ownPkce.verifier,
    });
    expect(ownResponse.status).toBe(200);
  });
});

describe("caps and cleanup", () => {
  test("a preview app over its cap loses the client renewed longest ago", async () => {
    vi.useFakeTimers({ now: 1_000_000_000_000 });
    const h = await hub();
    const first = await register(h, { software_id: "gh-1-p", deployment_type: "preview" });
    vi.advanceTimersByTime(1000);
    const second = await register(h, { software_id: "gh-1-p", deployment_type: "preview" });
    for (let index = 2; index < MAX_CLIENTS_PER_APP; index += 1) {
      vi.advanceTimersByTime(1000);
      await register(h, { software_id: "gh-1-p", deployment_type: "preview" });
    }
    vi.advanceTimersByTime(1000);
    // A deploy of the oldest client keeps it, so the next oldest goes.
    const read = configuration(first, first.registration_access_token, "GET");
    await h.fetchBroker(read.url, read.init);
    vi.advanceTimersByTime(1000);
    await register(h, { software_id: "gh-1-p", deployment_type: "preview" });
    expect(await readClient(h, second.client_id)).toBeNull();
    expect(await readClient(h, first.client_id)).not.toBeNull();
    const rows = await h.t.query(api.clients.listByApp, { appId: "gh-1-p" });
    expect(rows).toHaveLength(MAX_CLIENTS_PER_APP);
  });

  test("a production app keeps every client that signed someone in, and refuses at the cap", async () => {
    const h = await hub();
    const used = await register(h);
    expect((await signIn(h, used)).status).toBe(200);
    for (let index = 1; index < MAX_CLIENTS_PER_APP; index += 1) {
      await register(h);
    }
    await register(h);
    expect(await readClient(h, used.client_id)).not.toBeNull();
    const rows = await h.t.query(api.clients.listByApp, { appId: "gh-1-app" });
    expect(rows).toHaveLength(MAX_CLIENTS_PER_APP);
    for (const row of rows) {
      await h.t.run(async (ctx) => {
        const stored = await ctx.db
          .query("clients")
          .withIndex("by_client_id", (q) => q.eq("clientId", row.clientId))
          .unique();
        if (stored !== null) {
          await ctx.db.patch("clients", stored._id, { lastSignInAt: 1 });
        }
      });
    }
    const refused = await postRegister(h, metadata());
    expect(refused.status).toBe(403);
    expect(await refused.json()).toMatchObject({ error: "access_denied" });
  });

  test("a tenant has a limit on apps", async () => {
    const h = await hub();
    for (let index = 0; index < MAX_APPS_PER_TENANT; index += 1) {
      await register(h, { software_id: `gh-1-${index}` });
    }
    expect((await postRegister(h, metadata({ software_id: "gh-1-one-more" }))).status).toBe(403);
    await register(h, { software_id: "gh-1-0" });
  });

  test("cleanup deletes clients past their date and never touches a production client", async () => {
    vi.useFakeTimers({ now: 1_000_000_000_000 });
    const h = await hub();
    const preview = await register(h, { software_id: "gh-1-p", deployment_type: "preview" });
    const production = await register(h);
    const now = Date.now() + LEASE_MS + 1;
    const counts = await h.t.mutation(api.lifecycle.cleanup, { now, signInRetentionMs: 1 });
    expect(counts.expiredClients).toBe(1);
    expect(await readClient(h, preview.client_id)).toBeNull();
    expect(await readClient(h, production.client_id)).not.toBeNull();
  });
});

describe("suspension", () => {
  test("it stops sign-in, registration, and renewal, and turning it off restores them", async () => {
    const h = await hub();
    const client = await register(h);
    await suspend(h, "gh-1", true);
    const { challenge } = await pkce();
    const stopped = await h.fetchBroker(authorizeUrl(h, client.client_id, challenge));
    expect(stopped.status).toBe(403);
    expect(stopped.headers.get("location")).toBeNull();
    expect((await postRegister(h, metadata())).status).toBe(403);
    const read = configuration(client, client.registration_access_token, "GET");
    expect((await h.fetchBroker(read.url, read.init)).status).toBe(403);
    await suspend(h, "gh-1", false);
    expect((await signIn(h, client)).status).toBe(200);
  });

  test("it covers a new app of the tenant, and leaves other tenants alone", async () => {
    const h = await hub();
    await suspend(h, "gh-1", true);
    expect((await postRegister(h, metadata({ software_id: "gh-1-new" }))).status).toBe(403);
    const other = await register(h, { software_id: "gh-2-app", tenant_id: "gh-2" });
    expect((await signIn(h, other)).status).toBe(200);
  });

  test("a suspension that commits before the redemption refuses the code", async () => {
    const h = await hub();
    const client = await register(h);
    const { verifier, challenge } = await pkce();
    const start = await h.fetchBroker(authorizeUrl(h, client.client_id, challenge));
    const code = await finishUpstream(h, start);
    await suspend(h, "gh-1", true);
    const response = await redeem(h, {
      code,
      clientId: client.client_id,
      clientSecret: client.client_secret,
      verifier,
    });
    expect(response.status).toBe(401);
  });

  test("the connection endpoint needs the initial access token", async () => {
    const h = await hub();
    const response = await h.fetchBroker(`${h.issuer}/tenant-connection`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenant_id: "gh-1", connected: false, revision: 1 }),
    });
    expect(response.status).toBe(401);
  });

  test("a tenant that leaves stops, and one that comes back works again", async () => {
    const h = await hub();
    const client = await register(h);
    await setConnection(h, "gh-1", false, 1);
    const { challenge } = await pkce();
    expect((await h.fetchBroker(authorizeUrl(h, client.client_id, challenge))).status).toBe(403);
    await setConnection(h, "gh-1", true, 2);
    expect((await signIn(h, client)).status).toBe(200);
  });

  test("coming back does not clear the administrator's suspension", async () => {
    const h = await hub();
    const client = await register(h);
    await suspend(h, "gh-1", true);
    await setConnection(h, "gh-1", false, 1);
    await setConnection(h, "gh-1", true, 2);
    const { challenge } = await pkce();
    expect((await h.fetchBroker(authorizeUrl(h, client.client_id, challenge))).status).toBe(403);
    await suspend(h, "gh-1", false);
    expect((await signIn(h, client)).status).toBe(200);
  });

  test("an older request that arrives late changes nothing, in either direction", async () => {
    const h = await hub();
    const client = await register(h);
    await setConnection(h, "gh-1", false, 20);
    await setConnection(h, "gh-1", true, 10);
    const { challenge } = await pkce();
    expect((await h.fetchBroker(authorizeUrl(h, client.client_id, challenge))).status).toBe(403);
    await setConnection(h, "gh-1", true, 30);
    await setConnection(h, "gh-1", false, 25);
    expect((await signIn(h, client)).status).toBe(200);
  });
});

describe("the budget of a tenant", () => {
  test("a flood at one tenant writes no row and leaves others and the host's own apps alone", async () => {
    const h = await hub();
    const flooded = await register(h);
    const other = await register(h, { software_id: "gh-2-app", tenant_id: "gh-2" });
    const own = await h.registerClient({
      appName: "Own",
      firstParty: true,
      redirectUri: REDIRECT_URI,
    });
    const { challenge } = await pkce();
    const statuses: number[] = [];
    for (let index = 0; index < 400; index += 1) {
      const response = await h.fetchBroker(authorizeUrl(h, flooded.client_id, challenge));
      statuses.push(response.status);
    }
    const started = statuses.filter((status) => status === 302).length;
    expect(statuses.filter((status) => status === 429).length).toBe(400 - started);
    // The bucket holds 240 and refills while the test runs. Only a started sign-in writes a row.
    expect(started).toBeLessThan(300);
    const rows = await h.t.run(
      async (ctx) => (await ctx.db.query("authRequests").collect()).length,
    );
    expect(rows).toBe(started);
    expect((await h.fetchBroker(authorizeUrl(h, other.client_id, challenge))).status).toBe(302);
    const ownStart = await h.fetchBroker(
      authorizeUrl(h, own.clientId, challenge, { connector: "fake" }),
    );
    expect(ownStart.status).toBe(302);
  });
});
