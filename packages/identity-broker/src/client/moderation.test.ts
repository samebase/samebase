/// <reference types="vite-plus/client" />
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { api } from "../component/_generated/api.js";
import type { Harness } from "./harness.test.helper.js";
import {
  APP_HASH,
  createClient,
  createDevelopmentClient,
  createHub,
  createInitialAccessToken,
  MODERATION_KEY,
  moderationRequest,
  OWNER_ID,
  postHubClient,
  PRODUCTION_CALLBACK,
  readOwnRecord,
  registerAtBroker,
  REPOSITORY_ID,
  setBlock,
  stubProviders,
} from "./hub.test.helper.js";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const DAY_MS = 24 * 60 * 60 * 1_000;

/** One registration event of a client `cl_<index>` at each time of `at`. */
async function insertRegistrationEvents(h: Harness, at: number[]) {
  await h.t.run(async (ctx) => {
    for (const [index, time] of at.entries()) {
      await ctx.db.insert("events", {
        kind: "registration",
        clientId: `cl_${index}`,
        githubRepositoryDatabaseId: REPOSITORY_ID,
        githubOwnerId: OWNER_ID,
        at: time,
      });
    }
  });
}

/**
 * `count` preview clients `cl_<index>` at the broker, each with its registration event, as
 * `/hub-clients` writes them. 30 clients to an app and 10 apps to a tenant, the broker's caps.
 */
async function insertClients(h: Harness, count: number) {
  for (let index = 0; index < count; index += 1) {
    const tenantId = `gh-${Math.floor(index / 300) + 1}`;
    await registerAtBroker(h, {
      tenantId,
      appId: `${tenantId}-app-${Math.floor(index / 30)}-preview`,
      deploymentType: "preview",
      clientId: `cl_${index}`,
      clientName: `pr-${index}`,
      now: index,
    });
  }
  await insertRegistrationEvents(
    h,
    Array.from({ length: count }, (_, index) => index),
  );
}

async function readTenant(h: Harness, tenantId: string) {
  const apps = await h.t.query(api.apps.list, {});
  return apps.find((app) => app.tenantId === tenantId);
}

const ENDPOINTS = [
  ["GET", "/moderation/counts"],
  ["GET", "/moderation/blocks"],
  ["POST", "/moderation/blocks"],
  ["GET", "/moderation/clients"],
  ["GET", `/moderation/clients?repository=${REPOSITORY_ID}`],
  ["DELETE", "/moderation/clients/cl_any"],
] as const;

describe("the moderation key", () => {
  it.each(ENDPOINTS)(
    "%s %s refuses a request without the key or with another",
    async (method, path) => {
      const h = await createHub();

      for (const key of [null, "", "wrong-key", `${MODERATION_KEY}x`]) {
        const response = await moderationRequest(h, path, {
          method,
          key,
          ...(method === "POST" ? { body: {} } : {}),
        });
        expect(response.status).toBe(401);
      }
    },
  );

  it.each(["", "   "])("refuses every request while the key is %j", async (value) => {
    const h = await createHub();
    vi.stubEnv("HUB_MODERATION_KEY", value);

    for (const [method, path] of ENDPOINTS) {
      const response = await moderationRequest(h, path, {
        method,
        key: value,
        ...(method === "POST" ? { body: {} } : {}),
      });
      expect(response.status).toBe(401);
    }
  });

  it("refuses every request while the key is unset", async () => {
    const h = await createHub();
    vi.stubEnv("HUB_MODERATION_KEY", undefined);

    const response = await moderationRequest(h, "/moderation/counts", { key: "undefined" });

    expect(response.status).toBe(401);
  });

  it("cannot create a client, here or at the broker's registration endpoint", async () => {
    const h = await createHub();
    stubProviders();

    const hubClient = await postHubClient(h, MODERATION_KEY);
    const register = await moderationRequest(h, "/register", {
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
    expect(await h.t.query(api.apps.list, {})).toEqual([]);
  });
});

describe("the registrations", () => {
  it("counts the last day and the last week", async () => {
    const h = await createHub();
    const now = Date.now();
    await insertRegistrationEvents(h, [now - 1_000, now - 2 * DAY_MS, now - 8 * DAY_MS]);

    const response = await moderationRequest(h, "/moderation/counts");

    expect(await response.json()).toEqual({
      day: { count: 1, atLeast: false },
      week: { count: 2, atLeast: false },
    });
  });

  it("reads a fixed number of rows and says that the count is at least that", async () => {
    const h = await createHub();
    const now = Date.now();
    await insertRegistrationEvents(
      h,
      Array.from({ length: 1_001 }, (_, index) => now - index),
    );

    const response = await moderationRequest(h, "/moderation/counts");

    expect(await response.json()).toEqual({
      day: { count: 1_000, atLeast: true },
      week: { count: 1_000, atLeast: true },
    });
  });

  it("no answer holds a client secret or a registration token", async () => {
    const h = await createHub();
    const client = await createClient(h);
    await setBlock(h, { action: "block", kind: "owner", githubId: "999" });

    const answers = await Promise.all(
      ["/moderation/counts", "/moderation/blocks", "/moderation/clients"].map(
        async (path) => await (await moderationRequest(h, path)).text(),
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
    const h = await createHub();
    const client = await createClient(h);

    const blocked = await setBlock(h, {
      action: "block",
      kind: "repository",
      githubId: REPOSITORY_ID,
    });
    expect(await blocked.json()).toEqual({ changed: true });
    expect(await readOwnRecord(h, client)).toBe(403);
    expect(await readTenant(h, "gh-74")).toMatchObject({ suspended: true });

    const unblocked = await setBlock(h, {
      action: "unblock",
      kind: "repository",
      githubId: REPOSITORY_ID,
      reason: "Fixed",
    });
    expect(await unblocked.json()).toEqual({ changed: true });
    expect(await readOwnRecord(h, client)).toBe(200);

    const list = await moderationRequest(h, "/moderation/blocks");
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
    const h = await createHub();
    await setBlock(h, { action: "block", kind: "owner", githubId: OWNER_ID });
    await setBlock(h, { action: "block", kind: "repository", githubId: "75" });

    const list: { blocks: unknown[] } = await (
      await moderationRequest(h, "/moderation/blocks")
    ).json();

    expect(list.blocks).toEqual([
      expect.objectContaining({ kind: "repository", githubId: "75" }),
      expect.objectContaining({ kind: "owner", githubId: OWNER_ID, reason: "Phishing page" }),
    ]);
  });

  it("changes nothing when the block is already in place, or already gone", async () => {
    const h = await createHub();
    await setBlock(h, { action: "block", kind: "owner", githubId: OWNER_ID });

    const again = await setBlock(h, { action: "block", kind: "owner", githubId: OWNER_ID });
    const gone = await setBlock(h, { action: "unblock", kind: "repository", githubId: "75" });

    expect(await again.json()).toEqual({ changed: false });
    expect(await gone.json()).toEqual({ changed: false });
    const list: { events: unknown[] } = await (
      await moderationRequest(h, "/moderation/blocks")
    ).json();
    expect(list.events).toHaveLength(1);
  });

  it.each([
    ["no reason", { reason: " " }],
    ["no admin", { adminEmail: "" }],
    ["a name for an id", { githubId: "octo-org" }],
    ["another kind", { kind: "app" }],
    ["another action", { action: "suspend" }],
  ])("refuses %s", async (_, change) => {
    const h = await createHub();

    const response = await moderationRequest(h, "/moderation/blocks", {
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
    expect(await h.t.run(async (ctx) => await ctx.db.query("blocks").collect())).toEqual([]);
  });
});

describe("the clients", () => {
  it("lists every client at the broker newest first with who made it and its enrollment, and no secret", async () => {
    vi.useFakeTimers({ now: 1_800_000_000_000, toFake: ["Date"] });
    const h = await createHub();
    const first = await createClient(h, { repository_id: "81", repository: "octo-org/own" });
    vi.setSystemTime(1_800_000_001_000);
    const second = await createClient(h);
    vi.setSystemTime(1_800_000_002_000);
    await readOwnRecord(h, second);

    const response = await moderationRequest(h, "/moderation/clients");
    const text = await response.text();

    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(JSON.parse(text)).toEqual({
      clients: [
        {
          clientId: second.client_id,
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
          connectors: ["fake"],
        },
        {
          clientId: first.client_id,
          appId: `gh-81-${APP_HASH}`,
          clientName: "prod",
          deploymentType: "production",
          redirectUri: PRODUCTION_CALLBACK,
          createdAt: 1_800_000_000_000,
          renewedAt: 1_800_000_000_000,
          lastSignInAt: null,
          removeAt: null,
          registeredBy: {
            kind: "github",
            githubRepository: "octo-org/own",
            githubRepositoryDatabaseId: "81",
            githubOwnerId: OWNER_ID,
            githubActorLogin: "octocat",
            app: "my-app",
          },
          connectors: ["fake"],
        },
      ],
      limitReached: false,
    });
    for (const client of [first, second]) {
      expect(text).not.toContain(client.client_secret);
      expect(text).not.toContain(client.registration_access_token);
    }
  });

  it("fails when a client's app is not of a repository", async () => {
    const h = await createHub();
    await insertClients(h, 1);
    await h.t.run(async (ctx) => {
      for (const row of await ctx.db.query("apps").collect()) {
        await ctx.db.patch("apps", row._id, { tenantId: "team-1" });
      }
    });

    await expect(h.t.query(api.moderation.clientList, {})).rejects.toThrow(
      "The client cl_0 is not of a repository's app",
    );
  });

  it("names a development client with its repository and the token's issue time", async () => {
    vi.useFakeTimers({ now: 1_800_000_000_000, toFake: ["Date"] });
    const h = await createHub();
    const token = await createInitialAccessToken(h);
    vi.setSystemTime(1_800_000_001_000);
    const development = await createDevelopmentClient(h, token);

    const list: { clients: { clientId: string; registeredBy: unknown }[] } = await (
      await moderationRequest(h, "/moderation/clients")
    ).json();

    expect(list.clients.find((client) => client.clientId === development.client_id)).toMatchObject({
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
    const h = await createHub();
    await insertClients(h, 501);

    const list: { clients: { clientId: string }[]; limitReached: boolean } = await (
      await moderationRequest(h, "/moderation/clients")
    ).json();

    expect(list.clients).toHaveLength(500);
    expect(list.clients[0]?.clientId).toBe("cl_500");
    expect(list.clients.at(-1)?.clientId).toBe("cl_1");
    expect(list.limitReached).toBe(true);
  });
});

describe("the clients of given repositories", () => {
  async function repositoryClientIds(h: Harness, ...repositories: string[]) {
    const query = repositories.map((repository) => `repository=${repository}`).join("&");
    const list: { clients: { clientId: string }[] } = await (
      await moderationRequest(h, `/moderation/clients?${query}`)
    ).json();
    return list.clients.map((client) => client.clientId);
  }

  it("lists only that repository's clients, newest first, of every app and stage", async () => {
    vi.useFakeTimers({ now: 1_800_000_000_000, toFake: ["Date"] });
    const h = await createHub();
    const production = await createClient(h);
    vi.setSystemTime(1_800_000_001_000);
    const development = await createDevelopmentClient(h, production.initial_access_token ?? "");
    vi.setSystemTime(1_800_000_002_000);
    await createClient(h, { repository_id: "81", repository: "octo-org/other" });

    expect(await repositoryClientIds(h, REPOSITORY_ID)).toEqual([
      development.client_id,
      production.client_id,
    ]);
    expect(await repositoryClientIds(h, "999")).toEqual([]);
  });

  it("lists the clients of several repositories in one request, newest first, each once", async () => {
    vi.useFakeTimers({ now: 1_800_000_000_000, toFake: ["Date"] });
    const h = await createHub();
    const first = await createClient(h);
    vi.setSystemTime(1_800_000_001_000);
    const second = await createClient(h, { repository_id: "81", repository: "octo-org/other" });
    vi.setSystemTime(1_800_000_002_000);
    await createClient(h, { repository_id: "82", repository: "octo-org/third" });

    expect(await repositoryClientIds(h, REPOSITORY_ID, "81", REPOSITORY_ID)).toEqual([
      second.client_id,
      first.client_id,
    ]);
  });

  it.each(["", "0", "abc", "74x"])("refuses the repository %j", async (repository) => {
    const h = await createHub();
    const response = await moderationRequest(h, `/moderation/clients?repository=${repository}`);
    expect(response.status).toBe(400);
  });

  it("refuses more than 100 repositories in one request", async () => {
    const h = await createHub();
    const query = Array.from({ length: 101 }, (_, index) => `repository=${index + 1}`).join("&");
    const response = await moderationRequest(h, `/moderation/clients?${query}`);
    expect(response.status).toBe(400);
  });

  it("deletes one client, which then neither signs in nor renews, and a second delete changes nothing", async () => {
    const h = await createHub();
    const client = await createClient(h);

    const deleted = await moderationRequest(h, `/moderation/clients/${client.client_id}`, {
      method: "DELETE",
    });
    expect(await deleted.json()).toEqual({ changed: true });
    expect(await repositoryClientIds(h, REPOSITORY_ID)).toEqual([]);
    expect(await readOwnRecord(h, client)).toBe(401);

    const again = await moderationRequest(h, `/moderation/clients/${client.client_id}`, {
      method: "DELETE",
    });
    expect(await again.json()).toEqual({ changed: false });
  });

  it("refuses a delete without exactly one client id, and deletes nothing", async () => {
    const h = await createHub();
    const client = await createClient(h);

    for (const path of [
      "/moderation/clients/not-a-client",
      `/moderation/clients/cl_other/${client.client_id}`,
      `/moderation/clients/${client.client_id}/`,
    ]) {
      const response = await moderationRequest(h, path, { method: "DELETE" });
      expect(response.status).toBe(400);
    }
    expect(await repositoryClientIds(h, REPOSITORY_ID)).toEqual([client.client_id]);
  });
});
