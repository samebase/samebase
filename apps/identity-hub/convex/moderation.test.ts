import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { components, internal } from "./_generated/api";
import {
  APP_HASH,
  createClient,
  makeConvexTest,
  MODERATION_KEY,
  moderationRequest,
  OWNER_ID,
  postHubClient,
  readOwnRecord,
  REPOSITORY_ID,
  setBlock,
  stubProviders,
  type ConvexTest,
} from "./test.setup";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const DAY_MS = 24 * 60 * 60 * 1_000;

/** A row as samebase.com's `hubClientRegistrations` holds it, with its time as `registeredAt`. */
const importedRow = (index: number, registeredAt: number) => ({
  clientId: `cl_imported_${index}`,
  githubRepositoryDatabaseId: REPOSITORY_ID,
  githubOwnerId: OWNER_ID,
  githubRepository: "octo-org/octo-repo",
  githubActorId: "12",
  githubActorLogin: "octocat",
  commitSha: "example-sha",
  stage: "prod",
  app: "my-app",
  redirectUri: "https://ideal-dolphin-15.convex.site/auth/hub/callback",
  registeredAt,
});

async function importRows(t: ConvexTest, rows: ReturnType<typeof importedRow>[]) {
  return await t.mutation(internal.moderation.importRegistrations, { rows });
}

async function readTenant(t: ConvexTest, tenantId: string) {
  const apps = await t.query(components.identityBroker.apps.list, {});
  return apps.find((app) => app.tenantId === tenantId);
}

const ENDPOINTS = [
  ["GET", "/moderation/registrations"],
  ["GET", "/moderation/counts"],
  ["GET", "/moderation/blocks"],
  ["POST", "/moderation/blocks"],
  ["GET", "/moderation/clients"],
] as const;

describe("the moderation key", () => {
  it.each(ENDPOINTS)(
    "%s %s refuses a request without the key or with another",
    async (method, path) => {
      const t = makeConvexTest();

      for (const key of [null, "", "wrong-key", `${MODERATION_KEY}x`]) {
        const response = await moderationRequest(t, path, {
          method,
          key,
          ...(method === "POST" ? { body: {} } : {}),
        });
        expect(response.status).toBe(401);
      }
    },
  );

  it.each(["", "   "])("refuses every request while the key is %j", async (value) => {
    const t = makeConvexTest();
    vi.stubEnv("HUB_MODERATION_KEY", value);

    for (const [method, path] of ENDPOINTS) {
      const response = await moderationRequest(t, path, {
        method,
        key: value,
        ...(method === "POST" ? { body: {} } : {}),
      });
      expect(response.status).toBe(401);
    }
  });

  it("refuses every request while the key is unset", async () => {
    const t = makeConvexTest();
    vi.stubEnv("HUB_MODERATION_KEY", undefined);

    const response = await moderationRequest(t, "/moderation/counts", { key: "undefined" });

    expect(response.status).toBe(401);
  });

  it("cannot create a client, here or at the broker's registration endpoint", async () => {
    const t = makeConvexTest();
    stubProviders();

    const hubClient = await postHubClient(t, MODERATION_KEY);
    const register = await moderationRequest(t, "/register", {
      method: "POST",
      body: {
        redirect_uris: ["https://ideal-dolphin-15.convex.site/auth/hub/callback"],
        client_name: "prod",
        software_id: "gh-74-app",
        software_version: "abc123",
        tenant_id: "gh-74",
        deployment_type: "production",
        token_endpoint_auth_method: "client_secret_post",
      },
    });

    expect(hubClient.status).toBe(401);
    expect(register.status).toBe(404);
    expect(await t.query(components.identityBroker.apps.list, {})).toEqual([]);
  });
});

describe("the registrations", () => {
  it("lists them newest first, a page at a time", async () => {
    const t = makeConvexTest();
    const now = Date.now();
    await importRows(
      t,
      Array.from({ length: 55 }, (_, index) => importedRow(index, now - index * 1_000)),
    );

    const first = await moderationRequest(t, "/moderation/registrations");
    const firstPage: { page: { clientId: string }[]; isDone: boolean; continueCursor: string } =
      await first.json();
    const second = await moderationRequest(
      t,
      `/moderation/registrations?cursor=${encodeURIComponent(firstPage.continueCursor)}`,
    );
    const secondPage: { page: { clientId: string }[]; isDone: boolean } = await second.json();

    expect(first.headers.get("Cache-Control")).toBe("no-store");
    expect(firstPage.page).toHaveLength(50);
    expect(firstPage.page[0]).toEqual(importedRow(0, now));
    expect(firstPage.isDone).toBe(false);
    expect(secondPage.page.map((row) => row.clientId)).toEqual([
      "cl_imported_50",
      "cl_imported_51",
      "cl_imported_52",
      "cl_imported_53",
      "cl_imported_54",
    ]);
    expect(secondPage.isDone).toBe(true);
  });

  it("counts the last day and the last week", async () => {
    const t = makeConvexTest();
    const now = Date.now();
    await importRows(t, [
      importedRow(1, now - 1_000),
      importedRow(2, now - 2 * DAY_MS),
      importedRow(3, now - 8 * DAY_MS),
    ]);

    const response = await moderationRequest(t, "/moderation/counts");

    expect(await response.json()).toEqual({
      day: { count: 1, atLeast: false },
      week: { count: 2, atLeast: false },
    });
  });

  it("reads a fixed number of rows and says that the count is at least that", async () => {
    const t = makeConvexTest();
    const now = Date.now();
    await importRows(
      t,
      Array.from({ length: 1_001 }, (_, index) => importedRow(index, now - index)),
    );

    const response = await moderationRequest(t, "/moderation/counts");

    expect(await response.json()).toEqual({
      day: { count: 1_000, atLeast: true },
      week: { count: 1_000, atLeast: true },
    });
  });

  it("imports samebase.com's rows with their times, once", async () => {
    const t = makeConvexTest();
    const rows = [importedRow(1, 1_700_000_000_000), importedRow(2, 1_700_000_001_000)];

    expect(await importRows(t, rows)).toEqual({ inserted: 2, skipped: 0 });
    expect(await importRows(t, [...rows, importedRow(3, 1_700_000_002_000)])).toEqual({
      inserted: 1,
      skipped: 2,
    });

    const stored = await t.run(
      async (ctx) => await ctx.db.query("registrations").withIndex("by_registered_at").collect(),
    );
    expect(stored.map(({ clientId, registeredAt }) => ({ clientId, registeredAt }))).toEqual([
      { clientId: "cl_imported_1", registeredAt: 1_700_000_000_000 },
      { clientId: "cl_imported_2", registeredAt: 1_700_000_001_000 },
      { clientId: "cl_imported_3", registeredAt: 1_700_000_002_000 },
    ]);
  });

  it("records the owner of the newest imported row on a tenant without one", async () => {
    const t = makeConvexTest();
    const register = (tenantId: string) =>
      t.mutation(components.identityBroker.registration.register, {
        tenantId,
        appId: `${tenantId}-app`,
        connector: "google-apps",
        deploymentType: "production",
        clientId: `cl_${tenantId}`,
        secretHash: "hash",
        registrationTokenHash: "hash",
        tokenEndpointAuthMethod: "client_secret_post",
        redirectUri: "https://ideal-dolphin-15.convex.site/auth/hub/callback",
        clientName: "prod",
        softwareVersion: "abc123",
        now: Date.now(),
      });
    // Registered through samebase.com's /register, which names no owner.
    await register("gh-74");

    await importRows(t, [
      { ...importedRow(1, 1_000), githubOwnerId: "64" },
      { ...importedRow(2, 3_000), githubOwnerId: OWNER_ID },
      { ...importedRow(3, 2_000), githubOwnerId: "63" },
    ]);
    await setBlock(t, { action: "block", kind: "owner", githubId: OWNER_ID });

    expect(await readTenant(t, "gh-74")).toMatchObject({ suspended: true });
  });

  it("no answer holds a client secret or a registration token", async () => {
    const t = makeConvexTest();
    const client = await createClient(t);
    await setBlock(t, { action: "block", kind: "owner", githubId: "999" });

    const answers = await Promise.all(
      [
        "/moderation/registrations",
        "/moderation/counts",
        "/moderation/blocks",
        "/moderation/clients",
      ].map(async (path) => await (await moderationRequest(t, path)).text()),
    );

    expect(answers[0]).toContain(client.client_id);
    expect(answers[3]).toContain(client.client_id);
    for (const answer of answers) {
      expect(answer).not.toContain(client.client_secret);
      expect(answer).not.toContain(client.registration_access_token);
    }
  });
});

describe("the blocks", () => {
  it("blocks and unblocks a repository at the broker, and keeps every event", async () => {
    const t = makeConvexTest();
    const client = await createClient(t);

    const blocked = await setBlock(t, {
      action: "block",
      kind: "repository",
      githubId: REPOSITORY_ID,
    });
    expect(await blocked.json()).toEqual({ changed: true });
    expect(await readOwnRecord(t, client)).toBe(403);
    expect(await readTenant(t, "gh-74")).toMatchObject({ suspended: true });

    const unblocked = await setBlock(t, {
      action: "unblock",
      kind: "repository",
      githubId: REPOSITORY_ID,
      reason: "Fixed",
    });
    expect(await unblocked.json()).toEqual({ changed: true });
    expect(await readOwnRecord(t, client)).toBe(200);

    const list = await moderationRequest(t, "/moderation/blocks");
    expect(await list.json()).toEqual({
      blocks: [],
      events: [
        {
          action: "unblock",
          kind: "repository",
          githubId: REPOSITORY_ID,
          reason: "Fixed",
          adminEmail: "nicu@samebase.com",
          createdAt: expect.any(Number),
        },
        {
          action: "block",
          kind: "repository",
          githubId: REPOSITORY_ID,
          reason: "Phishing page",
          adminEmail: "nicu@samebase.com",
          createdAt: expect.any(Number),
        },
      ],
    });
  });

  it("lists the blocks that hold, newest first", async () => {
    const t = makeConvexTest();
    await setBlock(t, { action: "block", kind: "owner", githubId: OWNER_ID });
    await setBlock(t, { action: "block", kind: "repository", githubId: "75" });

    const list: { blocks: unknown[] } = await (
      await moderationRequest(t, "/moderation/blocks")
    ).json();

    expect(list.blocks).toEqual([
      expect.objectContaining({ kind: "repository", githubId: "75" }),
      expect.objectContaining({ kind: "owner", githubId: OWNER_ID, reason: "Phishing page" }),
    ]);
  });

  it("changes nothing when the block is already in place, or already gone", async () => {
    const t = makeConvexTest();
    await setBlock(t, { action: "block", kind: "owner", githubId: OWNER_ID });

    const again = await setBlock(t, { action: "block", kind: "owner", githubId: OWNER_ID });
    const gone = await setBlock(t, { action: "unblock", kind: "repository", githubId: "75" });

    expect(await again.json()).toEqual({ changed: false });
    expect(await gone.json()).toEqual({ changed: false });
    const list: { events: unknown[] } = await (
      await moderationRequest(t, "/moderation/blocks")
    ).json();
    expect(list.events).toHaveLength(1);
  });

  it("never touches the operator's suspension", async () => {
    const t = makeConvexTest();
    const client = await createClient(t);
    await t.mutation(components.identityBroker.registration.setSuspended, {
      tenantId: "gh-74",
      suspended: true,
      now: Date.now(),
    });

    for (const kind of ["repository", "owner"] as const) {
      const githubId = kind === "repository" ? REPOSITORY_ID : OWNER_ID;
      await setBlock(t, { action: "block", kind, githubId });
      await setBlock(t, { action: "unblock", kind, githubId });
    }

    expect(await readOwnRecord(t, client)).toBe(403);
    await t.mutation(components.identityBroker.registration.setSuspended, {
      tenantId: "gh-74",
      suspended: false,
      now: Date.now(),
    });
    expect(await readOwnRecord(t, client)).toBe(200);
  });

  it.each([
    ["no reason", { reason: " " }],
    ["no admin", { adminEmail: "" }],
    ["a name for an id", { githubId: "octo-org" }],
    ["another kind", { kind: "app" }],
    ["another action", { action: "suspend" }],
  ])("refuses %s", async (_, change) => {
    const t = makeConvexTest();

    const response = await moderationRequest(t, "/moderation/blocks", {
      method: "POST",
      body: {
        action: "block",
        kind: "owner",
        githubId: OWNER_ID,
        reason: "Phishing page",
        adminEmail: "nicu@samebase.com",
        ...change,
      },
    });

    expect(response.status).toBe(400);
    expect(await t.run(async (ctx) => await ctx.db.query("blocks").collect())).toEqual([]);
  });
});

describe("the clients", () => {
  it("lists every client at the broker newest first, the team's own included, with no secret", async () => {
    vi.useFakeTimers({ now: 1_800_000_000_000, toFake: ["Date"] });
    const t = makeConvexTest();
    const own = await t.mutation(internal.identityBroker.registerClient, {
      appId: "samebase",
      redirectUri: "https://samebase.com/auth/hub/callback",
      deploymentType: "production",
      clientName: "prod",
      softwareVersion: "abc123",
      tokenEndpointAuthMethod: "client_secret_post",
    });
    vi.setSystemTime(1_800_000_001_000);
    const thirdParty = await createClient(t);
    vi.setSystemTime(1_800_000_002_000);
    await readOwnRecord(t, thirdParty);

    const response = await moderationRequest(t, "/moderation/clients");
    const text = await response.text();

    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(JSON.parse(text)).toEqual({
      clients: [
        {
          clientId: thirdParty.client_id,
          appId: `gh-${REPOSITORY_ID}-${APP_HASH}`,
          clientName: "prod",
          deploymentType: "production",
          redirectHost: "ideal-dolphin-15.convex.site",
          createdAt: 1_800_000_001_000,
          renewedAt: 1_800_000_002_000,
          lastSignInAt: null,
        },
        {
          clientId: own.clientId,
          appId: "samebase",
          clientName: "prod",
          deploymentType: "production",
          redirectHost: "samebase.com",
          createdAt: 1_800_000_000_000,
          renewedAt: null,
          lastSignInAt: null,
        },
      ],
      limitReached: false,
    });
    expect(text).not.toContain(own.clientSecret);
  });

  it("lists the newest 500 and says that it reached the limit", async () => {
    const t = makeConvexTest();
    for (let index = 0; index < 501; index += 1) {
      await t.mutation(components.identityBroker.clients.create, {
        clientId: `cl_${index}`,
        appId: "samebase",
        secretHash: "hash",
        tokenEndpointAuthMethod: "client_secret_post",
        redirectUri: "https://samebase.com/auth/hub/callback",
        deploymentType: "preview",
        clientName: `pr-${index}`,
        softwareVersion: "abc123",
        createdAt: index,
      });
    }

    const list: { clients: { clientId: string }[]; limitReached: boolean } = await (
      await moderationRequest(t, "/moderation/clients")
    ).json();

    expect(list.clients).toHaveLength(500);
    expect(list.clients[0]?.clientId).toBe("cl_500");
    expect(list.clients.at(-1)?.clientId).toBe("cl_1");
    expect(list.limitReached).toBe(true);
  });
});

describe("switching tenants back on", () => {
  /** samebase.com's tenant switch, which it sent when a repository left Samebase. */
  async function switchOff(t: ConvexTest, githubId: string) {
    await t.mutation(components.identityBroker.registration.setConnection, {
      tenantId: `gh-${githubId}`,
      connected: false,
      revision: 1,
    });
  }

  it("switches on each tenant unless its repository is blocked, and keeps the other switches", async () => {
    const t = makeConvexTest();
    const left = await createClient(t);
    const blocked = await createClient(t, { repository_id: "75", repository: "octo-org/two" });
    const suspended = await createClient(t, { repository_id: "76", repository: "octo-org/three" });
    const ownerBlocked = await createClient(t, {
      repository_id: "77",
      repository_owner_id: "66",
      repository: "someone/else",
    });
    for (const githubId of [REPOSITORY_ID, "75", "76", "77"]) {
      await switchOff(t, githubId);
    }
    await setBlock(t, { action: "block", kind: "repository", githubId: "75" });
    await setBlock(t, { action: "block", kind: "owner", githubId: "66" });
    await t.mutation(components.identityBroker.registration.setSuspended, {
      tenantId: "gh-76",
      suspended: true,
      now: Date.now(),
    });

    const result = await t.mutation(internal.moderation.reconnectTenants, {
      githubRepositoryDatabaseIds: [REPOSITORY_ID, "75", "76", "77"],
    });

    expect(result).toEqual({ reconnected: [REPOSITORY_ID, "76", "77"], blocked: ["75"] });
    expect(await readOwnRecord(t, left)).toBe(200);
    expect(await readOwnRecord(t, blocked)).toBe(403);
    expect(await readOwnRecord(t, suspended)).toBe(403);
    expect(await readOwnRecord(t, ownerBlocked)).toBe(403);
  });

  it("refuses an id that is not a GitHub repository id, and switches nothing on", async () => {
    const t = makeConvexTest();
    const client = await createClient(t);
    await switchOff(t, REPOSITORY_ID);

    await expect(
      t.mutation(internal.moderation.reconnectTenants, {
        githubRepositoryDatabaseIds: [REPOSITORY_ID, "gh-75"],
      }),
    ).rejects.toThrow('"gh-75" is not a GitHub repository id.');
    expect(await readOwnRecord(t, client)).toBe(403);
  });
});
