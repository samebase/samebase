/// <reference types="vite-plus/client" />
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { fakeUpstream, pkce, txnCookie, type Harness } from "./harness.test.helper.js";
import {
  APP_HASH,
  createClient,
  createDevelopmentClient,
  createHub,
  createInitialAccessToken,
  moderationRequest,
  OWNER_ID,
  postHubClient,
  pullRequestClaims,
  REPOSITORY_ID,
  setBlock,
  signToken,
  stubProviders,
  testPolicy,
  type NewClient,
} from "./hub.test.helper.js";
import type { PolicyFunction } from "./policy.js";

// The exemptions from the sign-in page (RFC 137 decision 5, as amended): the hub's administrator
// sets them at `/moderation/sign-in-page`, and the broker applies them itself. In hub mode the page
// shows for every client by default, so each skip below comes from an exemption.

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const hubPolicy: PolicyFunction = () => testPolicy();

const PRODUCTION_APP = `gh-${REPOSITORY_ID}-${APP_HASH}`;
const PREVIEW_APP = `${PRODUCTION_APP}-preview`;

async function changeSignInPage(
  h: Harness,
  body: {
    target: { scope: "every_app" } | { scope: "app"; appId: string; expectedOwnerId: string };
    skip: boolean;
  },
) {
  return await moderationRequest(h, "/moderation/sign-in-page", {
    method: "POST",
    body: { ...body, reason: "Trusted team", adminEmail: "nicu@samebase.com" },
  });
}

const everyApp = (h: Harness, skip: boolean) =>
  changeSignInPage(h, { target: { scope: "every_app" }, skip });

const oneApp = (h: Harness, skip: boolean, appId = PRODUCTION_APP, expectedOwnerId = OWNER_ID) =>
  changeSignInPage(h, { target: { scope: "app", appId, expectedOwnerId }, skip });

/**
 * `/authorize` for the client with the one connector named, as an app's button sends it:
 * `provider` when it goes straight to the provider, `page` when the hub shows its page.
 */
async function signIn(h: Harness, client: NewClient) {
  // `createClient` stubs fetch for GitHub and the verification file; the provider comes back.
  fakeUpstream();
  const { challenge } = await pkce();
  const url = new URL(`${h.issuer}/authorize`);
  url.search = new URLSearchParams({
    client_id: client.client_id,
    redirect_uri: client.redirect_uri,
    response_type: "code",
    scope: "openid email profile",
    state: "client-state",
    code_challenge: challenge,
    code_challenge_method: "S256",
    connector: "fake",
  }).toString();
  const response = await h.fetchBroker(url);
  const location = response.headers.get("location");
  const went =
    response.status === 302 &&
    location !== null &&
    new URL(location).origin === "https://upstream.test"
      ? "provider"
      : response.status === 200
        ? "page"
        : `status ${response.status}`;
  return { response, went };
}

/** A preview client of the repository, from a pull request's run. */
async function createPreviewClient(h: Harness): Promise<NewClient> {
  stubProviders();
  const response = await postHubClient(h, await signToken(pullRequestClaims));
  expect(response.status).toBe(201);
  return await response.json();
}

async function signInPageEvents(h: Harness) {
  return await h.t.run(async (ctx) =>
    (await ctx.db.query("events").collect()).filter(
      (event) => event.kind === "sign_in_page_change",
    ),
  );
}

describe("the exemptions from the sign-in page", () => {
  it("change nothing while the table is empty", async () => {
    const h = await createHub({ policy: hubPolicy });
    const client = await createClient(h);

    expect((await signIn(h, client)).went).toBe("page");
    const state = await moderationRequest(h, "/moderation/sign-in-page");
    expect(state.headers.get("Cache-Control")).toBe("no-store");
    expect(await state.json()).toEqual({ everyApp: null, apps: [] });
  });

  it("skip the page for one app's clients, not for its preview app or other apps", async () => {
    const h = await createHub({ policy: hubPolicy });
    const production = await createClient(h);
    const preview = await createPreviewClient(h);
    const other = await createClient(h, { repository_id: "81", repository: "octo-org/other" });

    expect(await (await oneApp(h, true)).json()).toEqual({ changed: true });

    expect((await signIn(h, production)).went).toBe("provider");
    expect((await signIn(h, preview)).went).toBe("page");
    expect((await signIn(h, other)).went).toBe("page");
    expect(await (await moderationRequest(h, "/moderation/sign-in-page")).json()).toEqual({
      everyApp: null,
      apps: [
        {
          appId: PRODUCTION_APP,
          ownerId: OWNER_ID,
          active: true,
          reason: "Trusted team",
          repository: "octo-org/octo-repo",
          app: "my-app",
          production: true,
        },
      ],
    });
  });

  it("skip the page for every app, new ones included, until the switch is off", async () => {
    const h = await createHub({ policy: hubPolicy });
    const before = await createClient(h);
    await everyApp(h, true);
    const after = await createClient(h, { repository_id: "81", repository: "octo-org/other" });

    expect((await signIn(h, before)).went).toBe("provider");
    expect((await signIn(h, after)).went).toBe("provider");
    await everyApp(h, false);
    expect((await signIn(h, before)).went).toBe("page");
  });

  it("bind one app's row to its recorded owner through transfers", async () => {
    vi.useFakeTimers({ now: 1_800_000_000_000, toFake: ["Date"] });
    const h = await createHub({ policy: hubPolicy });
    const ownersClient = await createClient(h);
    await oneApp(h, true);
    expect((await signIn(h, ownersClient)).went).toBe("provider");

    // The repository moves to owner 66, which the hub learns at its next registration.
    vi.setSystemTime(1_800_000_001_000);
    const newOwnersClient = await createClient(h, { repository_owner_id: "66" });
    expect((await signIn(h, ownersClient)).went).toBe("page");
    expect((await signIn(h, newOwnersClient)).went).toBe("page");
    // The kept row says it covers no client now.
    const kept: { apps: Array<{ ownerId: string; active: boolean }> } = await (
      await moderationRequest(h, "/moderation/sign-in-page")
    ).json();
    expect(kept.apps).toMatchObject([{ ownerId: OWNER_ID, active: false }]);
    // A row set from a view of the old owner is refused; the admin sees the new one and reloads.
    const stale = await oneApp(h, true);
    expect(stale.status).toBe(409);
    expect(await stale.json()).toEqual({ error: "owner_changed" });

    // The repository comes back to owner 65: the row counts again, not for 66's old client.
    vi.setSystemTime(1_800_000_002_000);
    await createClient(h);
    expect((await signIn(h, ownersClient)).went).toBe("provider");
    expect((await signIn(h, newOwnersClient)).went).toBe("page");
  });

  it("bind a row to the new owner when the admin sets it again after a transfer", async () => {
    vi.useFakeTimers({ now: 1_800_000_000_000, toFake: ["Date"] });
    const h = await createHub({ policy: hubPolicy });
    await createClient(h);
    await oneApp(h, true);
    vi.setSystemTime(1_800_000_001_000);
    const newOwnersClient = await createClient(h, { repository_owner_id: "66" });

    expect(await (await oneApp(h, true, PRODUCTION_APP, "66")).json()).toEqual({ changed: true });
    expect((await signIn(h, newOwnersClient)).went).toBe("provider");
    expect((await signInPageEvents(h)).map((event) => event.target)).toEqual([
      { scope: "app", appId: PRODUCTION_APP, ownerId: OWNER_ID },
      { scope: "app", appId: PRODUCTION_APP, ownerId: "66" },
    ]);
  });

  it("refuse a removal from a stale view, and remove a row that no longer counts", async () => {
    vi.useFakeTimers({ now: 1_800_000_000_000, toFake: ["Date"] });
    const h = await createHub({ policy: hubPolicy });
    await createClient(h);
    await oneApp(h, true);
    vi.setSystemTime(1_800_000_001_000);
    const newOwnersClient = await createClient(h, { repository_owner_id: "66" });
    // A second admin binds the row to the new owner while the first admin's page still shows 65.
    await oneApp(h, true, PRODUCTION_APP, "66");

    const stale = await oneApp(h, false);
    expect(stale.status).toBe(409);
    expect(await stale.json()).toEqual({ error: "owner_changed" });
    expect((await signIn(h, newOwnersClient)).went).toBe("provider");

    // The repository moves on to owner 67: the row, bound to 66, no longer counts, and its own
    // owner still removes it.
    vi.setSystemTime(1_800_000_002_000);
    await createClient(h, { repository_owner_id: "67" });
    expect(await (await oneApp(h, false, PRODUCTION_APP, "66")).json()).toEqual({ changed: true });
    expect(await (await moderationRequest(h, "/moderation/sign-in-page")).json()).toEqual({
      everyApp: null,
      apps: [],
    });
  });

  it("refuse an app the hub does not have, and a malformed change", async () => {
    const h = await createHub({ policy: hubPolicy });

    const unknown = await oneApp(h, true, "gh-99-unknown");
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toEqual({ error: "unknown_app" });
    for (const body of [
      { target: { scope: "every_app" }, skip: true, reason: " ", adminEmail: "nicu@samebase.com" },
      {
        target: { scope: "app", appId: PRODUCTION_APP, expectedOwnerId: "owner" },
        skip: true,
        reason: "x",
        adminEmail: "a@b.c",
      },
      { target: { scope: "repository" }, skip: true, reason: "x", adminEmail: "a@b.c" },
    ]) {
      const response = await moderationRequest(h, "/moderation/sign-in-page", {
        method: "POST",
        body,
      });
      expect(response.status).toBe(400);
    }
    expect(await signInPageEvents(h)).toEqual([]);
  });

  it("write one event per change, and none for a change already in place", async () => {
    const h = await createHub({ policy: hubPolicy });
    await createClient(h);

    expect(await (await everyApp(h, true)).json()).toEqual({ changed: true });
    expect(await (await everyApp(h, true)).json()).toEqual({ changed: false });
    expect(await (await oneApp(h, true)).json()).toEqual({ changed: true });
    expect(await (await oneApp(h, true)).json()).toEqual({ changed: false });
    expect(await (await oneApp(h, false)).json()).toEqual({ changed: true });
    expect(await (await oneApp(h, false)).json()).toEqual({ changed: false });
    expect(await (await everyApp(h, false)).json()).toEqual({ changed: true });

    expect(
      (await signInPageEvents(h)).map(({ action, target, reason, adminEmail }) => ({
        action,
        target,
        reason,
        adminEmail,
      })),
    ).toEqual([
      {
        action: "skip",
        target: { scope: "every_app" },
        reason: "Trusted team",
        adminEmail: "nicu@samebase.com",
      },
      {
        action: "skip",
        target: { scope: "app", appId: PRODUCTION_APP, ownerId: OWNER_ID },
        reason: "Trusted team",
        adminEmail: "nicu@samebase.com",
      },
      {
        action: "show",
        target: { scope: "app", appId: PRODUCTION_APP, ownerId: OWNER_ID },
        reason: "Trusted team",
        adminEmail: "nicu@samebase.com",
      },
      {
        action: "show",
        target: { scope: "every_app" },
        reason: "Trusted team",
        adminEmail: "nicu@samebase.com",
      },
    ]);
    // The registration counts read registration events only.
    const counts: { day: { count: number } } = await (
      await moderationRequest(h, "/moderation/counts")
    ).json();
    expect(counts.day.count).toBe(1);
  });

  it("let a sign-in that passed /authorize finish after the row goes", async () => {
    const h = await createHub({ policy: hubPolicy });
    const client = await createClient(h);
    await oneApp(h, true);
    const { response, went } = await signIn(h, client);
    expect(went).toBe("provider");

    await oneApp(h, false);
    const upstream = new URL(response.headers.get("location") ?? "");
    const callback = new URL(upstream.searchParams.get("redirect_uri") ?? "");
    callback.searchParams.set("code", "upstream-code");
    callback.searchParams.set("state", upstream.searchParams.get("state") ?? "");
    const back = await h.fetchBroker(callback, { headers: txnCookie(response) });

    expect(back.status).toBe(302);
    const location = new URL(back.headers.get("location") ?? "");
    expect(location.origin + location.pathname).toBe(client.redirect_uri);
    expect(location.searchParams.get("code")).toEqual(expect.any(String));
    expect((await signIn(h, client)).went).toBe("page");
  });

  it("lose to a block and to the pause", async () => {
    const h = await createHub({ policy: hubPolicy });
    const client = await createClient(h);
    await everyApp(h, true);

    await setBlock(h, { action: "block", kind: "repository", githubId: REPOSITORY_ID });
    expect((await signIn(h, client)).went).toBe("status 403");
    await setBlock(h, { action: "unblock", kind: "repository", githubId: REPOSITORY_ID });
    vi.stubEnv("APPS_PAUSED", "true");
    expect((await signIn(h, client)).went).toBe("status 503");
    vi.stubEnv("APPS_PAUSED", "false");
    expect((await signIn(h, client)).went).toBe("provider");
  });

  it("show the page by default for every hub client, whatever its policy decides", async () => {
    // The policy decides connectors, resources, and the pause; it has no say in the page.
    const h = await createHub({
      policy: (registration) =>
        testPolicy({ resources: registration.repositoryId === "82" ? ["cloudflare"] : [] }),
    });
    const client = await createClient(h);
    const own = await createClient(h, { repository_id: "82", repository: "octo-org/own" });

    expect((await signIn(h, client)).went).toBe("page");
    expect((await signIn(h, own)).went).toBe("page");
    await oneApp(h, true);
    expect((await signIn(h, client)).went).toBe("provider");
    expect((await signIn(h, own)).went).toBe("page");
  });

  it("apply to a development client of the exempt preview app", async () => {
    const h = await createHub({ policy: hubPolicy });
    await createClient(h);
    // A production registration replaces the app's initial access token: the newest one counts.
    const token = await createInitialAccessToken(h);
    stubProviders();
    const development = await createDevelopmentClient(h, token);

    expect((await signIn(h, development)).went).toBe("page");
    expect(await (await oneApp(h, true, PREVIEW_APP)).json()).toEqual({ changed: true });
    expect((await signIn(h, development)).went).toBe("provider");
  });

  it("tell the admin page what decides each client's page", async () => {
    const h = await createHub({ policy: hubPolicy });
    await createClient(h);
    await createClient(h, { repository_id: "81", repository: "octo-org/other" });
    await oneApp(h, true);

    const pages = async () => {
      const list: { clients: Array<{ appId: string; signInPage: string; ownerId: string }> } =
        await (await moderationRequest(h, "/moderation/clients")).json();
      return Object.fromEntries(
        list.clients.map((client) => [client.appId.split("-")[1], client.signInPage]),
      );
    };
    expect(await pages()).toEqual({ [REPOSITORY_ID]: "this_app", "81": "shown" });
    await everyApp(h, true);
    expect(await pages()).toEqual({ [REPOSITORY_ID]: "every_app", "81": "every_app" });
  });
});
