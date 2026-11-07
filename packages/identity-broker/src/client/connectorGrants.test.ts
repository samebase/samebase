/// <reference types="vite-plus/client" />
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { api } from "../component/_generated/api.js";
import {
  createHarness,
  fakeUpstream,
  pkce,
  sha256Hex,
  txnCookie,
  type Harness,
} from "./harness.test.helper.js";
import {
  APP_HASH,
  createHub,
  hubRegistration,
  jsonResponse,
  MODERATION_KEY,
  moderationRequest,
  OWNER_ID,
  postHubClient,
  pullRequestClaims,
  REPOSITORY_ID,
  signToken,
  skipSignInPage,
  stubProviders,
  testPolicy,
  type NewClient,
} from "./hub.test.helper.js";
import type { PolicyFunction } from "./policy.js";

// The connector grants (RFC 137 decision 10): the hub's administrator adds a connector to what the
// policy gives one broker app, at `/moderation/connector-grants`. The test hub's policy gives the
// operator's repository both connectors and every other repository `fake` alone, so `other` is the
// private connector that only a grant opens.

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const OPERATOR_REPOSITORY = "81";

const hubPolicy: PolicyFunction = (registration) =>
  testPolicy({
    connectors: registration.repositoryId === OPERATOR_REPOSITORY ? ["fake", "other"] : ["fake"],
  });

const PRODUCTION_APP = `gh-${REPOSITORY_ID}-${APP_HASH}`;
const PREVIEW_APP = `${PRODUCTION_APP}-preview`;

/** `POST /hub-clients` for a run of the repository of `claims`, enrolled in `connectors`. */
async function register(
  h: Harness,
  connectors: string[],
  claims: Record<string, string> = {},
): Promise<Response> {
  const repository = claims["repository_id"] ?? REPOSITORY_ID;
  stubProviders(() => jsonResponse({ repository }));
  return await postHubClient(h, await signToken(claims), { connectors });
}

async function registered(
  h: Harness,
  connectors: string[],
  claims: Record<string, string> = {},
): Promise<NewClient> {
  const response = await register(h, connectors, claims);
  expect(response.status).toBe(201);
  return await response.json();
}

async function changeGrant(
  h: Harness,
  body: { appId?: string; connector?: string; expectedOwnerId?: string; grant: boolean },
) {
  return await moderationRequest(h, "/moderation/connector-grants", {
    method: "POST",
    body: {
      appId: body.appId ?? PRODUCTION_APP,
      connector: body.connector ?? "other",
      expectedOwnerId: body.expectedOwnerId ?? OWNER_ID,
      grant: body.grant,
      reason: "A trusted team",
      adminEmail: "nicu@samebase.com",
    },
  });
}

/**
 * `/authorize` for the client with `connector` named and the page skipped for every app, so a
 * usable connector goes straight to the provider: `provider`, else the refusal's status.
 */
async function signIn(h: Harness, client: NewClient, connector: string) {
  fakeUpstream();
  const { challenge, verifier } = await pkce();
  const url = new URL(`${h.issuer}/authorize`);
  url.search = new URLSearchParams({
    client_id: client.client_id,
    redirect_uri: client.redirect_uri,
    response_type: "code",
    scope: "openid email profile",
    state: "client-state",
    code_challenge: challenge,
    code_challenge_method: "S256",
    connector,
  }).toString();
  const response = await h.fetchBroker(url);
  const location = response.headers.get("location");
  const went =
    response.status === 302 &&
    location !== null &&
    new URL(location).origin === "https://upstream.test"
      ? "provider"
      : `status ${response.status}`;
  return { response, went, verifier };
}

/** The provider's answer to a sign-in that went to it: the broker's redirect to the app. */
async function finish(h: Harness, response: Response) {
  const upstream = new URL(response.headers.get("location") ?? "");
  const callback = new URL(upstream.searchParams.get("redirect_uri") ?? "");
  callback.searchParams.set("code", "upstream-code");
  callback.searchParams.set("state", upstream.searchParams.get("state") ?? "");
  const back = await h.fetchBroker(callback, { headers: txnCookie(response) });
  expect(back.status).toBe(302);
  return new URL(back.headers.get("location") ?? "");
}

/** The grant events, as `[action, app, connector, owner, admin]`. */
async function grantEvents(h: Harness) {
  return await h.t.run(async (ctx) =>
    (await ctx.db.query("events").collect()).flatMap((event) =>
      event.kind === "connector_grant_change"
        ? [[event.action, event.appId, event.connector, event.ownerId, event.adminEmail]]
        : [],
    ),
  );
}

describe("the connector grants", () => {
  it("leave every app with what the policy gives, the operator with every connector", async () => {
    const h = await createHub({ policy: hubPolicy });

    const refused = await register(h, ["fake", "other"]);
    expect(refused.status).toBe(400);
    expect(await refused.json()).toEqual({ error: "invalid_connectors", allowed: ["fake"] });
    await registered(h, ["fake", "other"], {
      repository_id: OPERATOR_REPOSITORY,
      repository: "octo-org/operator",
    });
    const state = await moderationRequest(h, "/moderation/connector-grants");
    expect(state.headers.get("Cache-Control")).toBe("no-store");
    expect(await state.json()).toEqual({ connectors: ["fake", "other"], grants: [] });
  });

  it("add a connector to one app's clients, not to its preview app or other apps", async () => {
    const h = await createHub({ policy: hubPolicy });
    await skipSignInPage(h);
    const before = await registered(h, ["fake"]);

    expect(await (await changeGrant(h, { grant: true })).json()).toEqual({ changed: true });

    const after = await registered(h, ["fake", "other"]);
    expect((await signIn(h, after, "other")).went).toBe("provider");
    // A client enrolled before keeps its enrollment: the grant opens nothing it did not enroll in.
    expect((await signIn(h, before, "other")).went).toBe("status 400");
    const preview = await register(h, ["fake", "other"], pullRequestClaims);
    expect(preview.status).toBe(400);
    const other = await register(h, ["fake", "other"], {
      repository_id: "82",
      repository: "octo-org/other",
    });
    expect(other.status).toBe(400);
    expect(await (await moderationRequest(h, "/moderation/connector-grants")).json()).toEqual({
      connectors: ["fake", "other"],
      grants: [
        {
          appId: PRODUCTION_APP,
          connector: "other",
          ownerId: OWNER_ID,
          active: true,
          reason: "A trusted team",
          repository: "octo-org/octo-repo",
          app: "my-app",
          production: true,
        },
      ],
    });
  });

  it("let a preview app's grant cover its development clients", async () => {
    const h = await createHub({ policy: hubPolicy });
    const production = await registered(h, ["fake"]);
    await registered(h, ["fake"], pullRequestClaims);
    await changeGrant(h, { appId: PREVIEW_APP, grant: true });

    const token = production.initial_access_token ?? "";
    stubProviders();
    const development = await h.fetchBroker(`${h.issuer}/hub-clients`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        app: "my-app",
        redirectUri: "http://127.0.0.1:3211/auth/hub/callback",
        softwareVersion: "dev-1",
        connectors: ["fake", "other"],
      }),
    });
    expect(development.status).toBe(201);
  });

  it("bind a grant to the recorded owner through transfers", async () => {
    vi.useFakeTimers({ now: 1_800_000_000_000, toFake: ["Date"] });
    const h = await createHub({ policy: hubPolicy });
    await skipSignInPage(h);
    await registered(h, ["fake"]);
    await changeGrant(h, { grant: true });
    const ownersClient = await registered(h, ["fake", "other"]);
    expect((await signIn(h, ownersClient, "other")).went).toBe("provider");

    // The repository moves to owner 66, which the hub learns at its next registration.
    vi.setSystemTime(1_800_000_001_000);
    const refused = await register(h, ["fake", "other"], { repository_owner_id: "66" });
    expect(refused.status).toBe(400);
    expect(await refused.json()).toEqual({ error: "invalid_connectors", allowed: ["fake"] });
    await registered(h, ["fake"], { repository_owner_id: "66" });
    expect((await signIn(h, ownersClient, "other")).went).toBe("status 403");
    const kept: { grants: Array<{ ownerId: string; active: boolean }> } = await (
      await moderationRequest(h, "/moderation/connector-grants")
    ).json();
    expect(kept.grants).toMatchObject([{ ownerId: OWNER_ID, active: false }]);
    // A grant from a view of the old owner is refused; the admin sees the new one and reloads.
    const stale = await changeGrant(h, { grant: true });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toEqual({ error: "owner_changed" });

    // The repository comes back to owner 65: the grant counts again.
    vi.setSystemTime(1_800_000_002_000);
    await registered(h, ["fake"]);
    expect((await signIn(h, ownersClient, "other")).went).toBe("provider");
  });

  it("never let an old client of another owner use a grant bound to the recorded owner", async () => {
    vi.useFakeTimers({ now: 1_800_000_000_000, toFake: ["Date"] });
    const h = await createHub({ policy: hubPolicy });
    await skipSignInPage(h);
    await registered(h, ["fake"]);

    // The repository moves to owner 66, which gets the grant and a client enrolled in `other`.
    vi.setSystemTime(1_800_000_001_000);
    await registered(h, ["fake"], { repository_owner_id: "66" });
    await changeGrant(h, { expectedOwnerId: "66", grant: true });
    const sixtySixsClient = await registered(h, ["fake", "other"], { repository_owner_id: "66" });
    expect((await signIn(h, sixtySixsClient, "other")).went).toBe("provider");

    // It comes back to owner 65, and the admin binds the grant to 65.
    vi.setSystemTime(1_800_000_002_000);
    await registered(h, ["fake"]);
    expect(await (await changeGrant(h, { grant: true })).json()).toEqual({ changed: true });

    // 66's client is enrolled in `other`, and the grant is active, but it is not 66's.
    expect((await signIn(h, sixtySixsClient, "other")).went).toBe("status 403");
    const sixtyFivesClient = await registered(h, ["fake", "other"]);
    expect((await signIn(h, sixtyFivesClient, "other")).went).toBe("provider");
  });

  it("refuse a revoke from a stale view, an unknown app, an unknown connector, and a malformed change", async () => {
    vi.useFakeTimers({ now: 1_800_000_000_000, toFake: ["Date"] });
    const h = await createHub({ policy: hubPolicy });
    await registered(h, ["fake"]);
    await changeGrant(h, { grant: true });
    vi.setSystemTime(1_800_000_001_000);
    await registered(h, ["fake"], { repository_owner_id: "66" });
    await changeGrant(h, { expectedOwnerId: "66", grant: true });

    // A page that still shows owner 65's row cannot revoke 66's.
    const stale = await changeGrant(h, { grant: false });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toEqual({ error: "owner_changed" });
    expect(await (await changeGrant(h, { expectedOwnerId: "66", grant: false })).json()).toEqual({
      changed: true,
    });

    for (const grant of [true, false]) {
      const unknownApp = await changeGrant(h, { appId: "gh-99-app", grant });
      expect(unknownApp.status).toBe(404);
      expect(await unknownApp.json()).toEqual({ error: "unknown_app" });
    }
    const unknownConnector = await changeGrant(h, { connector: "okta", grant: true });
    expect(unknownConnector.status).toBe(400);
    expect(await unknownConnector.json()).toEqual({ error: "unknown_connector" });
    const malformed = await moderationRequest(h, "/moderation/connector-grants", {
      method: "POST",
      body: { appId: PRODUCTION_APP, connector: "other", grant: true, reason: "" },
    });
    expect(malformed.status).toBe(400);
  });

  it("write one event per change, and none for a change already in place", async () => {
    const h = await createHub({ policy: hubPolicy });
    await registered(h, ["fake"]);

    expect(await (await changeGrant(h, { grant: true })).json()).toEqual({ changed: true });
    expect(await (await changeGrant(h, { grant: true })).json()).toEqual({ changed: false });
    expect(await (await changeGrant(h, { grant: false })).json()).toEqual({ changed: true });
    expect(await (await changeGrant(h, { grant: false })).json()).toEqual({ changed: false });

    expect(await grantEvents(h)).toEqual([
      ["grant", PRODUCTION_APP, "other", OWNER_ID, "nicu@samebase.com"],
      ["revoke", PRODUCTION_APP, "other", OWNER_ID, "nicu@samebase.com"],
    ]);
  });

  it("stop a sign-in at the provider's answer when the grant goes during it", async () => {
    const h = await createHub({ policy: hubPolicy });
    await skipSignInPage(h);
    await registered(h, ["fake"]);
    await changeGrant(h, { grant: true });
    const client = await registered(h, ["fake", "other"]);
    const { response, went } = await signIn(h, client, "other");
    expect(went).toBe("provider");

    await changeGrant(h, { grant: false });
    const back = await finish(h, response);

    expect(back.origin + back.pathname).toBe(client.redirect_uri);
    expect(back.searchParams.get("code")).toBeNull();
    expect(back.searchParams.get("error")).toEqual(expect.any(String));
  });

  it("refuse the code exchange when the grant goes after the code", async () => {
    const h = await createHub({ policy: hubPolicy });
    await skipSignInPage(h);
    await registered(h, ["fake"]);
    await changeGrant(h, { grant: true });
    const client = await registered(h, ["fake", "other"]);
    const { response, verifier } = await signIn(h, client, "other");
    const back = await finish(h, response);
    const code = back.searchParams.get("code") ?? "";
    expect(code).not.toBe("");

    await changeGrant(h, { grant: false });
    const exchanged = await h.fetchBroker(`${h.issuer}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        code_verifier: verifier,
        client_id: client.client_id,
        client_secret: client.client_secret,
      }).toString(),
    });
    expect(exchanged.status).toBe(400);
    expect(await exchanged.json()).toMatchObject({ error: "invalid_grant" });
  });

  it("refuse the exchange of a code once its connector leaves the hub's configuration", async () => {
    const h = await createHub({ policy: hubPolicy });
    await skipSignInPage(h);
    await registered(h, ["fake"]);
    await changeGrant(h, { grant: true });
    const client = await registered(h, ["fake", "other"]);
    const { response, verifier } = await signIn(h, client, "other");
    const code = (await finish(h, response)).searchParams.get("code") ?? "";

    // The hub's configuration drops `other`: the grant row stays, and the policy may still list it.
    for (const policyConnectors of [["fake"], ["fake", "other"]]) {
      const exchanged = await h.t.mutation(api.authRequests.exchangeCode, {
        clientId: client.client_id,
        clientSecretHash: await sha256Hex(client.client_secret),
        tokenEndpointAuthMethod: "client_secret_post",
        codeHash: await sha256Hex(code),
        codeVerifier: verifier,
        refreshTokenHash: await sha256Hex("refresh"),
        policy: {
          ownerId: OWNER_ID,
          paused: false,
          connectors: policyConnectors,
          resources: [],
          configured: ["fake"],
        },
        now: Date.now(),
      });
      expect(exchanged).toMatchObject({ ok: false, error: "invalid_grant" });
    }
  });

  it("report no connector as usable once it leaves the hub's configuration", async () => {
    // A hub that configures `fake` alone, whose policy still lists `other`.
    vi.stubEnv("HUB_MODERATION_KEY", MODERATION_KEY);
    const h = await createHarness({
      connectors: [fakeUpstream().connector],
      registration: hubRegistration(() => testPolicy({ connectors: ["fake", "other"] })),
    });
    await registered(h, ["fake"]);
    // A client enrolled in `other` and a grant of it, kept from before `other` left.
    await h.t.run(async (ctx) => {
      const client = await ctx.db.query("clients").unique();
      if (client === null) throw new Error("No client");
      await ctx.db.patch("clients", client._id, { connectors: ["fake", "other"] });
      await ctx.db.insert("connectorGrants", {
        appId: client.appId,
        connector: "other",
        ownerId: OWNER_ID,
        reason: "From before",
      });
    });

    const list: { clients: Array<{ usableConnectors: string[]; grantedConnectors: string[] }> } =
      await (await moderationRequest(h, "/moderation/clients")).json();
    expect(list.clients).toMatchObject([
      { policyConnectors: ["fake"], usableConnectors: ["fake"], grantedConnectors: [] },
    ]);
  });

  it("store and offer only what the grants allow when the request is created", async () => {
    const h = await createHub({ policy: hubPolicy });
    await registered(h, ["fake"]);
    await changeGrant(h, { grant: true });
    const client = await registered(h, ["fake", "other"]);
    // The caller read the grant; it was revoked before the request was created.
    await changeGrant(h, { grant: false });
    const create = async (requestId: string, connectors: string[]) =>
      await h.t.mutation(api.authRequests.create, {
        tenantId: `gh-${REPOSITORY_ID}`,
        requestId,
        appId: PRODUCTION_APP,
        clientId: client.client_id,
        redirectUri: client.redirect_uri,
        scope: "openid",
        codeChallenge: "c",
        connectors,
        policy: {
          ownerId: OWNER_ID,
          paused: false,
          connectors: ["fake"],
          resources: [],
          configured: ["fake", "other"],
        },
        freshLogin: false,
        txnCookieHash: "cookie-hash",
        createdAt: Date.now(),
        expiresAt: Date.now() + 600_000,
      });

    expect(await create("r1", ["fake", "other"])).toEqual({ ok: true, connectors: ["fake"] });
    expect(await h.t.query(api.authRequests.get, { requestId: "r1" })).toMatchObject({
      connectors: ["fake"],
    });
    expect(await create("r2", ["other"])).toEqual({ ok: false, error: "off" });
    expect(await h.t.query(api.authRequests.get, { requestId: "r2" })).toBeNull();
  });

  it("skip no sign-in page: a grant and an exemption are separate", async () => {
    const h = await createHub({ policy: hubPolicy });
    await registered(h, ["fake"]);
    await changeGrant(h, { grant: true });
    const client = await registered(h, ["fake", "other"]);

    expect((await signIn(h, client, "other")).went).toBe("status 200");
  });

  it("tell the admin page each client's usable and granted connectors", async () => {
    const h = await createHub({ policy: hubPolicy });
    await registered(h, ["fake"]);
    await changeGrant(h, { grant: true });
    await registered(h, ["fake", "other"]);
    await changeGrant(h, { grant: false });

    const list: {
      clients: Array<{
        connectors: string[];
        policyConnectors: string[];
        usableConnectors: string[];
        grantedConnectors: string[];
      }>;
    } = await (await moderationRequest(h, "/moderation/clients")).json();
    expect(list.clients.map((client) => [client.connectors, client.usableConnectors])).toEqual([
      [["fake", "other"], ["fake"]],
      [["fake"], ["fake"]],
    ]);
    await changeGrant(h, { grant: true });
    const granted: typeof list = await (await moderationRequest(h, "/moderation/clients")).json();
    expect(granted.clients[0]).toMatchObject({
      policyConnectors: ["fake"],
      usableConnectors: ["fake", "other"],
      grantedConnectors: ["other"],
    });
  });
});
