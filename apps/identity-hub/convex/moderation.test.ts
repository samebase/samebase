import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { components, internal } from "./_generated/api";
import {
  APP_HASH,
  createClient,
  createDevelopmentClient,
  createInitialAccessToken,
  makeConvexTest,
  MODERATION_KEY,
  moderationRequest,
  OWNER_ID,
  postHubClient,
  PRODUCTION_CALLBACK,
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

/** A registration row of a GitHub Actions run. */
const registrationRow = (index: number, registeredAt: number) => ({
  clientId: `cl_${index}`,
  githubRepositoryDatabaseId: REPOSITORY_ID,
  githubOwnerId: OWNER_ID,
  githubRepository: "octo-org/octo-repo",
  proof: {
    kind: "github" as const,
    githubActorId: "12",
    githubActorLogin: "octocat",
    commitSha: "example-sha",
  },
  stage: "prod",
  app: "my-app",
  redirectUri: "https://ideal-dolphin-15.convex.site/auth/hub/callback",
  registeredAt,
});

async function insertRows(t: ConvexTest, rows: ReturnType<typeof registrationRow>[]) {
  await t.run(async (ctx) => {
    for (const row of rows) {
      await ctx.db.insert("registrations", row);
    }
  });
}

async function readTenant(t: ConvexTest, tenantId: string) {
  const apps = await t.query(components.identityBroker.apps.list, {});
  return apps.find((app) => app.tenantId === tenantId);
}

const ENDPOINTS = [
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
  it("counts the last day and the last week", async () => {
    const t = makeConvexTest();
    const now = Date.now();
    await insertRows(t, [
      registrationRow(1, now - 1_000),
      registrationRow(2, now - 2 * DAY_MS),
      registrationRow(3, now - 8 * DAY_MS),
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
    await insertRows(
      t,
      Array.from({ length: 1_001 }, (_, index) => registrationRow(index, now - index)),
    );

    const response = await moderationRequest(t, "/moderation/counts");

    expect(await response.json()).toEqual({
      day: { count: 1_000, atLeast: true },
      week: { count: 1_000, atLeast: true },
    });
  });

  it("no answer holds a client secret or a registration token", async () => {
    const t = makeConvexTest();
    const client = await createClient(t);
    await setBlock(t, { action: "block", kind: "owner", githubId: "999" });

    const answers = await Promise.all(
      ["/moderation/counts", "/moderation/blocks", "/moderation/clients"].map(
        async (path) => await (await moderationRequest(t, path)).text(),
      ),
    );

    expect(answers[2]).toContain(client.client_id);
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
  it("lists every client at the broker newest first with who made it, and no secret", async () => {
    vi.useFakeTimers({ now: 1_800_000_000_000, toFake: ["Date"] });
    const t = makeConvexTest();
    // A client of an app that is gone.
    await t.mutation(components.identityBroker.clients.create, {
      clientId: "cl_orphan",
      appId: "gh-75-gone",
      secretHash: "hash",
      tokenEndpointAuthMethod: "client_secret_post",
      redirectUri: "https://gone.example/auth/hub/callback",
      deploymentType: "production",
      clientName: "prod",
      softwareVersion: "abc123",
      createdAt: 1_799_999_999_000,
      expires: false,
    });
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
    vi.setSystemTime(1_800_000_003_000);
    const preview = await t.mutation(internal.identityBroker.registerClient, {
      appId: "samebase",
      redirectUri: "https://happy-otter-123.convex.site/auth/hub/callback",
      deploymentType: "preview",
      clientName: "pr-12",
      softwareVersion: "abc123",
      tokenEndpointAuthMethod: "client_secret_post",
      expires: true,
    });

    const response = await moderationRequest(t, "/moderation/clients");
    const text = await response.text();

    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(JSON.parse(text)).toEqual({
      clients: [
        {
          clientId: preview.clientId,
          appId: "samebase",
          clientName: "pr-12",
          deploymentType: "preview",
          redirectUri: "https://happy-otter-123.convex.site/auth/hub/callback",
          createdAt: 1_800_000_003_000,
          renewedAt: null,
          lastSignInAt: null,
          removeAt: 1_800_000_003_000 + 14 * 24 * 60 * 60 * 1_000,
          registeredBy: { kind: "team" },
        },
        {
          clientId: thirdParty.client_id,
          appId: `gh-${REPOSITORY_ID}-${APP_HASH}`,
          clientName: "prod",
          deploymentType: "production",
          redirectUri: PRODUCTION_CALLBACK,
          createdAt: 1_800_000_001_000,
          renewedAt: 1_800_000_002_000,
          lastSignInAt: null,
          removeAt: null,
          registeredBy: {
            kind: "github",
            githubRepository: "octo-org/octo-repo",
            githubRepositoryDatabaseId: REPOSITORY_ID,
            githubOwnerId: OWNER_ID,
            githubActorLogin: "octocat",
            app: "my-app",
          },
        },
        {
          clientId: own.clientId,
          appId: "samebase",
          clientName: "prod",
          deploymentType: "production",
          redirectUri: "https://samebase.com/auth/hub/callback",
          createdAt: 1_800_000_000_000,
          renewedAt: null,
          lastSignInAt: null,
          removeAt: null,
          registeredBy: { kind: "team" },
        },
        {
          clientId: "cl_orphan",
          appId: "gh-75-gone",
          clientName: "prod",
          deploymentType: "production",
          redirectUri: "https://gone.example/auth/hub/callback",
          createdAt: 1_799_999_999_000,
          renewedAt: null,
          lastSignInAt: null,
          removeAt: null,
          registeredBy: { kind: "unknown" },
        },
      ],
      limitReached: false,
    });
    expect(text).not.toContain(own.clientSecret);
    expect(text).not.toContain(preview.clientSecret);
  });

  it("names a laptop's client with its repository and the token's issue time", async () => {
    vi.useFakeTimers({ now: 1_800_000_000_000, toFake: ["Date"] });
    const t = makeConvexTest();
    const token = await createInitialAccessToken(t);
    vi.setSystemTime(1_800_000_001_000);
    const laptop = await createDevelopmentClient(t, token);

    const list: { clients: { clientId: string; registeredBy: unknown }[] } = await (
      await moderationRequest(t, "/moderation/clients")
    ).json();

    expect(list.clients.find((client) => client.clientId === laptop.client_id)).toMatchObject({
      registeredBy: {
        kind: "initial_access_token",
        githubRepository: "octo-org/octo-repo",
        githubRepositoryDatabaseId: REPOSITORY_ID,
        githubOwnerId: OWNER_ID,
        app: "my-app",
        issuedAt: 1_800_000_000_000,
      },
    });
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
        expires: false,
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
