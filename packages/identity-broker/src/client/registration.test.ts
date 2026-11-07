/// <reference types="vite-plus/client" />
import { decodeJwt } from "jose";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { api } from "../component/_generated/api.js";
import { LEASE_MS, MAX_APPS_PER_TENANT, MAX_CLIENTS_PER_APP } from "../component/registration.js";
import {
  createHarness,
  fakeOidcUpstream,
  pkce,
  sha256Hex,
  txnCookie,
  type Harness,
} from "./harness.test.helper.js";
import { hubConnectors, hubRegistration, testPolicy } from "./hub.test.helper.js";
import type { Policy, PolicyFunction } from "./policy.js";

const REDIRECT_URI = "https://app-1.convex.site/auth/hub/callback";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/**
 * A hub with the two connectors of the fake provider and `policy`, which asks for no consent
 * unless a test says otherwise, so a client enrolled in one connector goes straight to it.
 */
async function hub(policy: PolicyFunction = () => testPolicy({ consent: false })) {
  return await createHarness({
    connectors: hubConnectors(),
    registration: hubRegistration(policy),
  });
}

/**
 * A client that the host creates in its own mutation with `newClientCredentials`, as the hub's
 * `POST /hub-clients` does, in the shape of an RFC 7591 answer. The tenant `gh-1` of owner 65,
 * unless `args` say otherwise; `ownerId: null` names no owner.
 */
async function registerHere(
  h: Harness,
  args: {
    tenantId?: string;
    ownerId?: string | null;
    appId?: string;
    app?: string;
    deploymentType?: "production" | "preview" | "development";
    connectors?: string[];
  } = {},
) {
  const credentials = await h.broker.newClientCredentials();
  const ownerId = args.ownerId === undefined ? "65" : args.ownerId;
  const result = await h.t.mutation(api.registration.register, {
    tenantId: args.tenantId ?? "gh-1",
    ...(ownerId === null ? {} : { ownerId }),
    appId: args.appId ?? "gh-1-app",
    connectors: args.connectors ?? ["fake"],
    deploymentType: args.deploymentType ?? "preview",
    clientId: credentials.clientId,
    secretHash: credentials.secretHash,
    registrationTokenHash: credentials.registrationTokenHash,
    tokenEndpointAuthMethod: "client_secret_post",
    redirectUri: REDIRECT_URI,
    clientName: "pr-1",
    softwareVersion: "abc123",
    app: args.app ?? "app",
    registeredBy: {
      kind: "github",
      githubRepository: "octo-org/octo-repo",
      githubOwnerId: ownerId ?? "65",
      githubActorId: "12",
      githubActorLogin: "octocat",
      commitSha: "abc123",
    },
    now: Date.now(),
  });
  return {
    result,
    client: {
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      registration_access_token: credentials.registrationAccessToken,
      registration_client_uri: credentials.registrationClientUri,
    },
  };
}

/** A production client of `gh-1-app` unless `args` says otherwise, which must register. */
async function register(h: Harness, args: Parameters<typeof registerHere>[1] = {}) {
  const { result, client } = await registerHere(h, { deploymentType: "production", ...args });
  expect(result).toEqual({ ok: true });
  return client;
}

async function setBlock(h: Harness, kind: "repository" | "owner", githubId: string, on: boolean) {
  await h.t.mutation(api.moderation.setBlock, {
    action: on ? "block" : "unblock",
    kind,
    githubId,
    reason: "Phishing page",
    adminEmail: "admin@example.com",
  });
}

/** Block repository on the tenant `gh-<id>`, or its unblock. */
async function switchConnection(h: Harness, tenantId: string, connected: boolean) {
  await setBlock(h, "repository", tenantId.replace(/^gh-/, ""), !connected);
}

async function blockOwner(h: Harness, ownerId: string, blocked: boolean) {
  await setBlock(h, "owner", ownerId, blocked);
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

/** The `/continue` link of `connector` on a sign-in page, or undefined when the page lacks it. */
function continueLink(h: Harness, html: string, connector: string) {
  const href = html.match(new RegExp(`class="button" href="([^"]*connector=${connector})"`))?.[1];
  return href === undefined ? undefined : `${h.issuer}${href.replace(/&amp;/g, "&")}`;
}

/**
 * Ends a sign-in at the fake provider. A sign-in page is answered with its first Continue, in the
 * browser that got it, as a user does.
 */
async function finishUpstream(h: Harness, start: Response) {
  const cookie = txnCookie(start);
  const continueHref =
    start.status === 200
      ? (await start.text()).match(/class="button" href="([^"]*connector=[^"]*)"/)?.[1]
      : undefined;
  const redirected =
    continueHref === undefined
      ? start
      : await h.fetchBroker(`${h.issuer}${continueHref.replace(/&amp;/g, "&")}`, {
          headers: cookie,
        });
  const upstream = new URL(redirected.headers.get("location") ?? "");
  const callback = new URL(upstream.searchParams.get("redirect_uri") ?? "");
  callback.searchParams.set("code", "upstream-code");
  callback.searchParams.set("state", upstream.searchParams.get("state") ?? "");
  const response = await h.fetchBroker(callback, { headers: cookie });
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

async function signIn(
  h: Harness,
  client: { client_id: string; client_secret: string },
  extra: Record<string, string> = {},
) {
  const { verifier, challenge } = await pkce();
  const start = await h.fetchBroker(authorizeUrl(h, client.client_id, challenge, extra));
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

describe("registration", () => {
  test("the host registers in its own mutation: no /register endpoint, and discovery names none", async () => {
    const h = await hub();
    const created = await h.fetchBroker(`${h.issuer}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(created.status).toBe(404);
    expect((await h.fetchBroker(`${h.issuer}/tenant-connection`, { method: "POST" })).status).toBe(
      404,
    );
    const document = await h.fetchBroker(`${h.issuer}/.well-known/openid-configuration`);
    expect(await document.json()).not.toHaveProperty("registration_endpoint");
  });

  test("an app holds its clients, each with its enrollment, and a lost client just gets a new one", async () => {
    const h = await hub();
    const first = await register(h);
    const second = await register(h, { connectors: ["other", "fake"] });
    expect(await h.t.query(api.apps.get, { appId: "gh-1-app" })).toMatchObject({
      tenantId: "gh-1",
      suspended: false,
    });
    expect((await readClient(h, first.client_id))?.connectors).toEqual(["fake"]);
    expect((await readClient(h, second.client_id))?.connectors).toEqual(["fake", "other"]);
    // Both stay valid: the hub never changes or retires a secret.
    expect(first.client_id).not.toBe(second.client_id);
    expect((await signIn(h, first)).status).toBe(200);
    expect((await signIn(h, second, { connector: "other" })).status).toBe(200);
  });

  test("a registration enrolls in at least one connector", async () => {
    const h = await hub();
    await expect(registerHere(h, { connectors: [] })).rejects.toThrow(
      "A client enrolls in at least one connector",
    );
    expect(await h.t.query(api.apps.list, {})).toEqual([]);
  });

  test("it cannot reach an app of another tenant", async () => {
    const h = await hub();
    await register(h, { appId: "gh-9-own", tenantId: "gh-9" });
    await register(h);
    for (const args of [{ appId: "gh-9-own" }, { appId: "gh-1-app", tenantId: "gh-2" }]) {
      expect((await registerHere(h, args)).result).toEqual({ ok: false, error: "app_taken" });
    }
  });

  test("a pause refuses the sign-in of the clients it names, and leaves the others alone", async () => {
    let paused = false;
    const h = await hub((registration) =>
      testPolicy({ consent: false, paused: paused && registration.app !== "own" }),
    );
    const client = await register(h);
    const own = await register(h, { appId: "gh-1-own", app: "own" });
    paused = true;
    const { challenge } = await pkce();
    const stopped = await h.fetchBroker(authorizeUrl(h, client.client_id, challenge));
    expect(stopped.status).toBe(503);
    expect(stopped.headers.get("location")).toBeNull();
    expect((await h.fetchBroker(authorizeUrl(h, own.client_id, challenge))).status).toBe(302);
  });
});

describe("the connectors of a client", () => {
  test("a client enrolled in one goes straight to it, and a URL that names another is refused", async () => {
    const h = await hub();
    const client = await register(h);
    const { verifier, challenge } = await pkce();
    const start = await h.fetchBroker(
      authorizeUrl(h, client.client_id, challenge, { connector: "fake" }),
    );
    expect(start.status).toBe(302);
    const upstream = new URL(start.headers.get("location") ?? "");
    expect(upstream.searchParams.get("redirect_uri")).toBe(`${h.issuer}/connectors/fake/callback`);
    const code = await finishUpstream(h, start);
    const tokens: { id_token: string } = await (
      await redeem(h, {
        code,
        clientId: client.client_id,
        clientSecret: client.client_secret,
        verifier,
      })
    ).json();
    expect(decodeJwt(tokens.id_token)["connector"]).toBe("fake");

    const other = await h.fetchBroker(
      authorizeUrl(h, client.client_id, challenge, { connector: "other" }),
    );
    expect(other.status).toBe(400);
    expect(await other.text()).toContain("not enrolled in the connector &quot;other&quot;");
  });

  test("/continue cannot move a request to another connector, also after it started", async () => {
    const h = await hub(() => testPolicy());
    const client = await register(h, { connectors: ["fake", "other"] });
    const { challenge } = await pkce();
    const start = await h.fetchBroker(
      authorizeUrl(h, client.client_id, challenge, { connector: "fake" }),
    );
    const cookie = txnCookie(start);
    const html = await start.text();
    expect(continueLink(h, html, "fake")).toBeDefined();
    expect(continueLink(h, html, "other")).toBeUndefined();
    const requestId = cookie.Cookie.split("=")[0]?.replace("__Host-broker_txn_", "") ?? "";
    const moved = await h.fetchBroker(`${h.issuer}/continue?request=${requestId}&connector=other`, {
      headers: cookie,
    });
    expect(moved.status).toBe(404);
    const started = await h.fetchBroker(continueLink(h, html, "fake") ?? "", { headers: cookie });
    expect(started.status).toBe(302);
    const again = await h.fetchBroker(`${h.issuer}/continue?request=${requestId}&connector=other`, {
      headers: cookie,
    });
    expect(again.status).toBe(404);
  });

  test("the page offers the enrollment intersected with the policy, and none left is off", async () => {
    let connectors = ["fake", "other"];
    const h = await hub(() => testPolicy({ connectors }));
    const client = await register(h, { connectors: ["fake", "other"] });
    const { challenge } = await pkce();
    const bothPage = await h.fetchBroker(authorizeUrl(h, client.client_id, challenge));
    const both = await bothPage.text();
    expect(continueLink(h, both, "fake")).toBeDefined();
    expect(continueLink(h, both, "other")).toBeDefined();

    connectors = ["fake"];
    const html = await (await h.fetchBroker(authorizeUrl(h, client.client_id, challenge))).text();
    expect(continueLink(h, html, "fake")).toBeDefined();
    expect(continueLink(h, html, "other")).toBeUndefined();
    // Enrolled, named, and no longer allowed: nothing is offered.
    const off = await h.fetchBroker(
      authorizeUrl(h, client.client_id, challenge, { connector: "other" }),
    );
    expect(off.status).toBe(403);
    expect(await off.text()).toContain("Sign-in for this app is turned off.");
    // The page offered `other` before the policy shrank: its link is checked again at /continue,
    // and the user continued, so the refusal goes to the app.
    const late = await h.fetchBroker(continueLink(h, both, "other") ?? "", {
      headers: txnCookie(bothPage),
    });
    expect(late.status).toBe(302);
    const location = new URL(late.headers.get("location") ?? "");
    expect(location.origin + location.pathname).toBe(REDIRECT_URI);
    expect(location.searchParams.get("error")).toBe("access_denied");
    expect(location.searchParams.get("state")).toBe("client-state");
  });

  test("a connector withdrawn after the callback refuses the code, and one withdrawn before it refuses the callback", async () => {
    let connectors = ["fake", "other"];
    const h = await hub(() => testPolicy({ consent: false, connectors }));
    const client = await register(h, { connectors: ["fake", "other"] });
    const { verifier, challenge } = await pkce();
    const start = await h.fetchBroker(
      authorizeUrl(h, client.client_id, challenge, { connector: "other" }),
    );
    const code = await finishUpstream(h, start);
    connectors = ["fake"];
    const response = await redeem(h, {
      code,
      clientId: client.client_id,
      clientSecret: client.client_secret,
      verifier,
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid_grant" });

    connectors = ["fake", "other"];
    const second = await h.fetchBroker(
      authorizeUrl(h, client.client_id, challenge, { connector: "other" }),
    );
    const upstream = new URL(second.headers.get("location") ?? "");
    const callback = new URL(upstream.searchParams.get("redirect_uri") ?? "");
    callback.searchParams.set("code", "upstream-code");
    callback.searchParams.set("state", upstream.searchParams.get("state") ?? "");
    connectors = ["fake"];
    // The user continued, so the refusal goes to the app, and the request is gone.
    const cookie = txnCookie(second);
    const back = await h.fetchBroker(callback, { headers: cookie });
    const location = new URL(back.headers.get("location") ?? "");
    expect(location.origin + location.pathname).toBe(REDIRECT_URI);
    expect(location.searchParams.get("error")).toBe("access_denied");
    const requestId = cookie.Cookie.split("=")[0]?.replace("__Host-broker_txn_", "") ?? "";
    expect(await h.t.query(api.authRequests.get, { requestId })).toBeNull();
  });

  test("selectAccount sends prompt=select_account upstream", async () => {
    const { connector } = await fakeOidcUpstream();
    const h = await createHarness({
      connectors: [{ ...connector, selectAccount: true }],
      registration: hubRegistration(() => testPolicy({ consent: false, connectors: ["idp"] })),
    });
    const client = await register(h, { connectors: ["idp"] });
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

  test("after the user continued from the page, a refusal goes back to the app", async () => {
    const h = await hub(() => testPolicy());
    const client = await register(h);
    const { challenge } = await pkce();
    const page = await h.fetchBroker(
      authorizeUrl(h, client.client_id, challenge, { prompt: "login" }),
    );
    expect(page.status).toBe(200);
    const link = continueLink(h, await page.text(), "fake") ?? "";
    const response = await h.fetchBroker(link, { headers: txnCookie(page) });
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.origin + location.pathname).toBe(REDIRECT_URI);
    expect(location.searchParams.get("error")).toBe("login_required");
    expect(location.searchParams.get("state")).toBe("client-state");
  });
});

describe("the policy", () => {
  test("a throwing or malformed policy refuses every use with 503 and writes nothing", async () => {
    let policy: () => Policy = () => testPolicy({ consent: false });
    const h = await hub(() => policy());
    const client = await register(h);
    const { verifier, challenge } = await pkce();
    const start = await h.fetchBroker(authorizeUrl(h, client.client_id, challenge));
    const code = await finishUpstream(h, start);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const broken: Array<() => Policy> = [
      () => {
        throw new Error("no env");
      },
      // @ts-expect-error The policy answers a wrong shape on purpose.
      () => ({ connectors: ["fake"], consent: false, paused: false }),
    ];
    for (const answer of broken) {
      policy = answer;
      const refused = await h.fetchBroker(authorizeUrl(h, client.client_id, challenge));
      expect(refused.status).toBe(503);
      expect(refused.headers.get("location")).toBeNull();
      const redeemed = await redeem(h, {
        code,
        clientId: client.client_id,
        clientSecret: client.client_secret,
        verifier,
      });
      expect(redeemed.status).toBe(503);
      expect(await redeemed.json()).toMatchObject({ error: "temporarily_unavailable" });
    }
    // The code is still there: the policy's failure consumed nothing.
    policy = () => testPolicy({ consent: false });
    expect(
      (
        await redeem(h, {
          code,
          clientId: client.client_id,
          clientSecret: client.client_secret,
          verifier,
        })
      ).status,
    ).toBe(200);
  });

  test("a policy that fails, or a client that is gone, while the user is at the provider answers the app", async () => {
    let policy: () => Policy = () => testPolicy({ consent: false });
    const h = await hub(() => policy());
    const client = await register(h);
    const { challenge } = await pkce();
    const callbackOf = async () => {
      const start = await h.fetchBroker(authorizeUrl(h, client.client_id, challenge));
      const upstream = new URL(start.headers.get("location") ?? "");
      const callback = new URL(upstream.searchParams.get("redirect_uri") ?? "");
      callback.searchParams.set("code", "upstream-code");
      callback.searchParams.set("state", upstream.searchParams.get("state") ?? "");
      return { callback, cookie: txnCookie(start) };
    };
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const first = await callbackOf();
    policy = () => {
      throw new Error("no env");
    };
    // Another browser learns nothing; the bound one goes back to the app, and the request waits.
    expect((await h.fetchBroker(first.callback)).status).toBe(400);
    const failed = await h.fetchBroker(first.callback, { headers: first.cookie });
    const failedAt = new URL(failed.headers.get("location") ?? "");
    expect(failedAt.origin + failedAt.pathname).toBe(REDIRECT_URI);
    expect(failedAt.searchParams.get("error")).toBe("temporarily_unavailable");
    policy = () => testPolicy({ consent: false });
    const back = await h.fetchBroker(first.callback, { headers: first.cookie });
    expect(new URL(back.headers.get("location") ?? "").searchParams.has("code")).toBe(true);

    const second = await callbackOf();
    await h.t.mutation(api.clients.remove, { clientId: client.client_id });
    const gone = await h.fetchBroker(second.callback, { headers: second.cookie });
    const goneAt = new URL(gone.headers.get("location") ?? "");
    expect(goneAt.origin + goneAt.pathname).toBe(REDIRECT_URI);
    expect(goneAt.searchParams.get("error")).toBe("server_error");
    // The second request is gone; the first waits, completed, for its code's redemption.
    const rows = await h.t.run(async (ctx) => await ctx.db.query("authRequests").collect());
    expect(rows.map((row) => row.status)).toEqual(["completed"]);
  });

  test("a client that is not a repository's gets no decision in hub mode", async () => {
    const h = await hub();
    const { client } = await registerHere(h, { tenantId: "team-1", appId: "team-1-app" });
    const { challenge } = await pkce();
    expect((await h.fetchBroker(authorizeUrl(h, client.client_id, challenge))).status).toBe(503);
    const noOwner = await registerHere(h, { tenantId: "gh-5", appId: "gh-5-app", ownerId: null });
    expect((await h.fetchBroker(authorizeUrl(h, noOwner.client.client_id, challenge))).status).toBe(
      503,
    );
  });

  test("the policy sees the client's facts as its rows hold them", async () => {
    const seen: unknown[] = [];
    const h = await hub((registration) => {
      seen.push(registration);
      return testPolicy({ consent: false });
    });
    const client = await register(h, { deploymentType: "production" });
    expect((await signIn(h, client)).status).toBe(200);
    // /authorize, the callback before its claim and after the provider answered, and the
    // redemption each decided on the same facts.
    expect(seen).toHaveLength(4);
    expect(seen[0]).toEqual({
      repositoryId: "1",
      repository: "octo-org/octo-repo",
      ownerId: "65",
      app: "app",
      deploymentType: "production",
      redirectUri: REDIRECT_URI,
      proof: "github-actions",
    });
    expect(seen[1]).toEqual(seen[0]);
    expect(seen[2]).toEqual(seen[0]);
    expect(seen[3]).toEqual(seen[0]);
  });
});

describe("the subject", () => {
  test("every app of one person gets the provider's own id, through either connector", async () => {
    const h = await hub();
    const first = await register(h, { appId: "gh-1-a" });
    const second = await register(h, { appId: "gh-1-b", connectors: ["other"] });
    const subject = async (client: { client_id: string; client_secret: string }) => {
      const tokens: { id_token: string } = await (await signIn(h, client)).json();
      return decodeJwt(tokens.id_token).sub;
    };
    // `other` is a second connector of the provider `fake`: one account, one subject.
    expect(await subject(first)).toBe("fake:42");
    expect(await subject(second)).toBe("fake:42");
  });
});

describe("RFC 7592 client management", () => {
  test("a read answers without the secret, and only with the client's own token", async () => {
    const h = await hub();
    const client = await register(h);
    const other = await register(h);
    expect(client.registration_client_uri).toBe(`${h.issuer}/register/${client.client_id}`);
    const own = configuration(client, client.registration_access_token, "GET");
    const response = await h.fetchBroker(own.url, own.init);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body: Record<string, unknown> = await response.json();
    expect(body).toMatchObject({
      client_id: client.client_id,
      client_secret_expires_at: 0,
      redirect_uris: [REDIRECT_URI],
      grant_types: ["authorization_code"],
      response_types: ["code"],
      software_id: "gh-1-app",
      connectors: ["fake"],
    });
    expect(body).not.toHaveProperty("client_secret");
    // The component keeps only the hashes of the secret and the token.
    const row = await readClient(h, client.client_id);
    expect(row?.secretHash).toBe(await sha256Hex(client.client_secret));
    expect(row?.registrationTokenHash).toBe(await sha256Hex(client.registration_access_token));
    const wrong = configuration(client, other.registration_access_token, "GET");
    expect((await h.fetchBroker(wrong.url, wrong.init)).status).toBe(401);
    const bare = await h.fetchBroker(client.registration_client_uri);
    expect(bare.status).toBe(401);
  });

  test("a read renews a preview client and never dates a production client, paused or not", async () => {
    vi.useFakeTimers({ now: 1_000_000_000_000 });
    const h = await hub(() => testPolicy({ paused: true }));
    const preview = await register(h, { appId: "gh-1-app-p", deploymentType: "preview" });
    const production = await register(h);
    expect((await readClient(h, preview.client_id))?.removeAt).toBe(Date.now() + LEASE_MS);
    vi.setSystemTime(Date.now() + LEASE_MS / 2);
    for (const client of [preview, production]) {
      const read = configuration(client, client.registration_access_token, "GET");
      expect((await h.fetchBroker(read.url, read.init)).status).toBe(200);
    }
    expect(await readClient(h, preview.client_id)).toMatchObject({
      renewedAt: Date.now(),
      removeAt: Date.now() + LEASE_MS,
    });
    expect((await readClient(h, production.client_id))?.removeAt).toBeUndefined();
  });

  test("a hub's consent page names the hub, and links its privacy notice and terms", async () => {
    const h = await hub(() => testPolicy());
    const client = await register(h, { appId: "gh-1-app-p", deploymentType: "preview" });
    const { challenge } = await pkce();
    const page = await h.fetchBroker(authorizeUrl(h, client.client_id, challenge));
    const html = await page.text();
    expect(html).toContain("Samebase has not reviewed this app.");
    expect(html).toContain(
      '<a href="https://samebase.com/privacy" target="_blank" rel="noopener noreferrer">Privacy</a>',
    );
    expect(html).toContain(
      '<a href="https://samebase.com/terms" target="_blank" rel="noopener noreferrer">Terms</a>',
    );
  });

  test("a sign-in moves the date in the redemption", async () => {
    vi.useFakeTimers({ now: 1_000_000_000_000, toFake: ["Date"] });
    const h = await hub();
    const client = await register(h, { appId: "gh-1-app-p", deploymentType: "preview" });
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

  test("a delete removes only the client that asks, also while paused, and a gone client answers 401", async () => {
    const h = await hub(() => testPolicy({ paused: true }));
    const preview = { appId: "gh-1-p", deploymentType: "preview" } as const;
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
      refreshTokenHash: "unused-for-identity",
      clientId: client.client_id,
      clientSecretHash: await sha256Hex(client.client_secret),
      tokenEndpointAuthMethod: "client_secret_post",
      codeHash: await sha256Hex(code),
      codeVerifier: verifier,
      policy: { ownerId: "65", paused: false, connectors: ["fake"], resources: [] },
      now: Date.now(),
    });
    expect((await readClient(h, client.client_id))?.lastSignInAt).toBeDefined();
  });

  test("a pause stops a sign-in that already started, and not a client the policy exempts", async () => {
    let paused = false;
    const h = await hub((registration) =>
      testPolicy({ consent: false, paused: paused && registration.app !== "own" }),
    );
    const client = await register(h);
    const own = await register(h, { appId: "gh-1-own", app: "own" });
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
    expect(await response.json()).toMatchObject({ error: "invalid_client" });
    expect((await signIn(h, own)).status).toBe(200);
  });

  test("a pause that lands while the user is at the provider sends the user back refused", async () => {
    let paused = false;
    const h = await hub(() => testPolicy({ consent: false, paused }));
    const client = await register(h);
    const { challenge } = await pkce();
    const start = await h.fetchBroker(authorizeUrl(h, client.client_id, challenge));
    const upstream = new URL(start.headers.get("location") ?? "");
    const callback = new URL(upstream.searchParams.get("redirect_uri") ?? "");
    callback.searchParams.set("code", "upstream-code");
    callback.searchParams.set("state", upstream.searchParams.get("state") ?? "");
    paused = true;
    const back = await h.fetchBroker(callback, { headers: txnCookie(start) });
    const location = new URL(back.headers.get("location") ?? "");
    expect(location.origin + location.pathname).toBe(REDIRECT_URI);
    expect(location.searchParams.get("error")).toBe("temporarily_unavailable");
    expect(location.searchParams.has("code")).toBe(false);
  });
});

describe("caps and cleanup", () => {
  test("a preview app over its cap loses the client renewed longest ago", async () => {
    vi.useFakeTimers({ now: 1_000_000_000_000 });
    const h = await hub();
    const preview = { appId: "gh-1-p", deploymentType: "preview" } as const;
    const first = await register(h, preview);
    vi.advanceTimersByTime(1000);
    const second = await register(h, preview);
    for (let index = 2; index < MAX_CLIENTS_PER_APP; index += 1) {
      vi.advanceTimersByTime(1000);
      await register(h, preview);
    }
    vi.advanceTimersByTime(1000);
    // A deploy of the oldest client keeps it, so the next oldest goes.
    const read = configuration(first, first.registration_access_token, "GET");
    await h.fetchBroker(read.url, read.init);
    vi.advanceTimersByTime(1000);
    await register(h, preview);
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
    expect((await registerHere(h, { deploymentType: "production" })).result).toEqual({
      ok: false,
      error: "too_many_clients",
    });
  });

  test("a tenant has a limit on apps", async () => {
    const h = await hub();
    for (let index = 0; index < MAX_APPS_PER_TENANT; index += 1) {
      await register(h, { appId: `gh-1-${index}` });
    }
    expect((await registerHere(h, { appId: "gh-1-one-more" })).result).toEqual({
      ok: false,
      error: "too_many_apps",
    });
    await register(h, { appId: "gh-1-0" });
  });

  test("cleanup deletes clients past their date and never touches a production client", async () => {
    vi.useFakeTimers({ now: 1_000_000_000_000 });
    const h = await hub();
    const preview = await register(h, { appId: "gh-1-p", deploymentType: "preview" });
    const production = await register(h);
    const now = Date.now() + LEASE_MS + 1;
    const counts = await h.t.mutation(api.lifecycle.cleanup, { now, signInRetentionMs: 1 });
    expect(counts.expiredClients).toBe(1);
    expect(await readClient(h, preview.client_id)).toBeNull();
    expect(await readClient(h, production.client_id)).not.toBeNull();
  });
});

describe("the tenant switch", () => {
  test("it stops sign-in, registration, and renewal, and turning it off restores them", async () => {
    const h = await hub();
    const client = await register(h);
    await switchConnection(h, "gh-1", false);
    const { challenge } = await pkce();
    const stopped = await h.fetchBroker(authorizeUrl(h, client.client_id, challenge));
    expect(stopped.status).toBe(403);
    expect(stopped.headers.get("location")).toBeNull();
    expect((await registerHere(h)).result).toEqual({ ok: false, error: "suspended" });
    const read = configuration(client, client.registration_access_token, "GET");
    expect((await h.fetchBroker(read.url, read.init)).status).toBe(403);
    await switchConnection(h, "gh-1", true);
    expect((await signIn(h, client)).status).toBe(200);
  });

  test("it covers a new app of the tenant, and leaves other tenants alone", async () => {
    const h = await hub();
    await switchConnection(h, "gh-1", false);
    expect((await registerHere(h, { appId: "gh-1-new" })).result).toEqual({
      ok: false,
      error: "suspended",
    });
    const other = await register(h, { appId: "gh-2-app", tenantId: "gh-2" });
    expect((await signIn(h, other)).status).toBe(200);
  });

  test("a switch that commits before the redemption refuses the code", async () => {
    const h = await hub();
    const client = await register(h);
    const { verifier, challenge } = await pkce();
    const start = await h.fetchBroker(authorizeUrl(h, client.client_id, challenge));
    const code = await finishUpstream(h, start);
    await switchConnection(h, "gh-1", false);
    const response = await redeem(h, {
      code,
      clientId: client.client_id,
      clientSecret: client.client_secret,
      verifier,
    });
    expect(response.status).toBe(401);
  });

  test("a block is stronger than the policy: a client the policy allows still stops", async () => {
    const h = await hub();
    const { client } = await registerHere(h, { ownerId: "65" });
    /** The status of the token request, or of `/authorize` when it sends the browser nowhere. */
    const signInHere = async () => {
      const { verifier, challenge } = await pkce();
      const start = await h.fetchBroker(authorizeUrl(h, client.client_id, challenge));
      if (start.headers.get("location") === null) return start.status;
      const response = await redeem(h, {
        code: await finishUpstream(h, start),
        clientId: client.client_id,
        clientSecret: client.client_secret,
        verifier,
      });
      return response.status;
    };
    expect(await signInHere()).toBe(200);
    await switchConnection(h, "gh-1", false);
    expect(await signInHere()).toBe(403);
    await switchConnection(h, "gh-1", true);
    await blockOwner(h, "65", true);
    expect(await signInHere()).toBe(403);
    await blockOwner(h, "65", false);
    expect(await signInHere()).toBe(200);
  });
});

describe("the owner switch", () => {
  test("it stops registration, renewal, sign-in, and redemption of every tenant of the owner", async () => {
    const h = await hub();
    const { client: first } = await registerHere(h, { ownerId: "65" });
    const { client: second } = await registerHere(h, {
      tenantId: "gh-2",
      appId: "gh-2-app",
      ownerId: "65",
    });
    const { client: other } = await registerHere(h, {
      tenantId: "gh-3",
      appId: "gh-3-app",
      ownerId: "66",
    });
    const { verifier, challenge } = await pkce();
    const started = await h.fetchBroker(authorizeUrl(h, first.client_id, challenge));
    const code = await finishUpstream(h, started);

    await blockOwner(h, "65", true);

    expect((await registerHere(h, { ownerId: "65" })).result).toEqual({
      ok: false,
      error: "suspended",
    });
    for (const client of [first, second]) {
      const read = configuration(client, client.registration_access_token, "GET");
      expect((await h.fetchBroker(read.url, read.init)).status).toBe(403);
      const stopped = await h.fetchBroker(authorizeUrl(h, client.client_id, challenge));
      expect(stopped.status).toBe(403);
      expect(stopped.headers.get("location")).toBeNull();
    }
    const redeemed = await redeem(h, {
      code,
      clientId: first.client_id,
      clientSecret: first.client_secret,
      verifier,
    });
    expect(redeemed.status).toBe(401);
    expect((await signIn(h, other)).status).toBe(200);

    await blockOwner(h, "65", false);
    expect((await signIn(h, first)).status).toBe(200);
    expect((await signIn(h, second)).status).toBe(200);
  });

  test("it leaves the tenant switch as it is, and it stays after an unblock", async () => {
    const h = await hub();
    const { client } = await registerHere(h, { ownerId: "65" });
    await switchConnection(h, "gh-1", false);
    await blockOwner(h, "65", true);
    await blockOwner(h, "65", false);
    const { challenge } = await pkce();
    expect((await h.fetchBroker(authorizeUrl(h, client.client_id, challenge))).status).toBe(403);
    await switchConnection(h, "gh-1", true);
    expect((await signIn(h, client)).status).toBe(200);
  });

  test("a new client under another owner records that owner, as after a transfer", async () => {
    const h = await hub();
    const { client } = await registerHere(h, { ownerId: "65" });
    await blockOwner(h, "65", true);
    const moved = await registerHere(h, { ownerId: "66" });
    expect(moved.result).toEqual({ ok: true });
    expect((await signIn(h, client)).status).toBe(200);
    expect((await signIn(h, moved.client)).status).toBe(200);
    await blockOwner(h, "66", true);
    expect((await registerHere(h, { ownerId: "65" })).result).toEqual({
      ok: false,
      error: "suspended",
    });
  });

  test("a registration without an owner keeps the recorded one", async () => {
    const h = await hub();
    await registerHere(h, { ownerId: "65" });
    await register(h, { ownerId: null });
    await blockOwner(h, "65", true);
    expect((await registerHere(h, { ownerId: null })).result).toEqual({
      ok: false,
      error: "suspended",
    });
  });

  test("the tenant switch holds for a tenant that has no client yet", async () => {
    const h = await hub();
    await switchConnection(h, "gh-1", false);
    expect((await registerHere(h)).result).toEqual({ ok: false, error: "suspended" });
  });
});

describe("a development client", () => {
  test("it gets a removal date, renews it, and cleanup deletes it after the date", async () => {
    vi.useFakeTimers({ now: 1_000_000_000_000 });
    const h = await hub();
    const { result, client } = await registerHere(h, { deploymentType: "development" });
    expect(result).toEqual({ ok: true });
    expect((await readClient(h, client.client_id))?.removeAt).toBe(Date.now() + LEASE_MS);

    vi.advanceTimersByTime(1_000);
    const read = configuration(client, client.registration_access_token, "GET");
    expect((await h.fetchBroker(read.url, read.init)).status).toBe(200);
    expect((await readClient(h, client.client_id))?.removeAt).toBe(Date.now() + LEASE_MS);

    const counts = await h.t.mutation(api.lifecycle.cleanup, {
      now: Date.now() + LEASE_MS + 1,
      signInRetentionMs: 1,
    });
    expect(counts.expiredClients).toBe(1);
    expect(await readClient(h, client.client_id)).toBeNull();
  });

  test("at the cap it evicts the row renewed longest ago, also one that signed someone in", async () => {
    vi.useFakeTimers({ now: 1_000_000_000_000 });
    const h = await hub();
    const { client: oldest } = await registerHere(h, { deploymentType: "development" });
    expect((await signIn(h, oldest)).status).toBe(200);
    for (let index = 1; index < MAX_CLIENTS_PER_APP; index += 1) {
      vi.advanceTimersByTime(1_000);
      await registerHere(h, { deploymentType: index % 2 === 0 ? "preview" : "development" });
    }

    vi.advanceTimersByTime(1_000);
    const { result } = await registerHere(h, { deploymentType: "development" });
    expect(result).toEqual({ ok: true });
    expect(await readClient(h, oldest.client_id)).toBeNull();
    expect(await h.t.query(api.clients.listByApp, { appId: "gh-1-app" })).toHaveLength(
      MAX_CLIENTS_PER_APP,
    );
  });

  test("a renewal of a blocked tenant's client answers 403", async () => {
    const h = await hub();
    const { client } = await registerHere(h, { deploymentType: "development" });
    await switchConnection(h, "gh-1", false);
    const read = configuration(client, client.registration_access_token, "GET");
    expect((await h.fetchBroker(read.url, read.init)).status).toBe(403);
  });
});

describe("the budget of a tenant", () => {
  test("a flood at one tenant writes no row and leaves other tenants alone", async () => {
    const h = await hub();
    const flooded = await register(h);
    const other = await register(h, { appId: "gh-2-app", tenantId: "gh-2" });
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
  });
});
