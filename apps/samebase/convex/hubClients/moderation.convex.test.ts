import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { api } from "../_generated/api";
import { insertTestOrganizationBillingAccount, makeConvexTest } from "../test.setup";

type ConvexTest = ReturnType<typeof makeConvexTest>;

const HUB_ISSUER = "https://hub.example.test";
const MODERATION_KEY = "moderation-key";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const jsonResponse = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const counts = { day: { count: 1, atLeast: false }, week: { count: 1_000, atLeast: true } };

const blockList = {
  blocks: [
    {
      kind: "owner",
      githubId: "65",
      reason: "Phishing page",
      adminEmail: "nicu@samebase.com",
      createdAt: 1_800_000_000_000,
    },
  ],
  events: [
    {
      action: "block",
      kind: "owner",
      githubId: "65",
      reason: "Phishing page",
      adminEmail: "nicu@samebase.com",
      createdAt: 1_800_000_000_000,
    },
  ],
};

const clientList = {
  clients: [
    {
      clientId: "cl_preview",
      appId: "gh-81-4c9a75cca717efb68c856f26ba825073-preview",
      clientName: "pr-12",
      deploymentType: "preview",
      redirectUri: "https://happy-otter-123.convex.site/auth/hub/callback",
      createdAt: 1_800_000_002_000,
      renewedAt: 1_800_000_002_000,
      lastSignInAt: null,
      removeAt: 1_801_209_602_000,
      registeredBy: {
        kind: "github",
        githubRepository: "octo-org/own",
        githubRepositoryDatabaseId: "81",
        githubOwnerId: "65",
        githubActorLogin: "octocat",
        app: "my-app",
      },
    },
    {
      clientId: "cl_test",
      appId: "gh-74-4c9a75cca717efb68c856f26ba825073",
      clientName: "prod",
      deploymentType: "production",
      redirectUri: "https://ideal-dolphin-15.convex.site/auth/hub/callback",
      createdAt: 1_800_000_000_000,
      renewedAt: 1_800_000_001_000,
      lastSignInAt: null,
      removeAt: null,
      registeredBy: {
        kind: "github",
        githubRepository: "octo-org/octo-repo",
        githubRepositoryDatabaseId: "74",
        githubOwnerId: "65",
        githubActorLogin: "octocat",
        app: "my-app",
      },
    },
    {
      clientId: "cl_laptop",
      appId: "gh-74-4c9a75cca717efb68c856f26ba825073-preview",
      clientName: "development",
      deploymentType: "development",
      redirectUri: "http://127.0.0.1:3211/auth/hub/callback",
      createdAt: 1_799_999_999_000,
      renewedAt: 1_799_999_999_000,
      lastSignInAt: null,
      removeAt: 1_801_209_599_000,
      registeredBy: {
        kind: "initial_access_token",
        githubRepository: "octo-org/octo-repo",
        githubRepositoryDatabaseId: "74",
        githubOwnerId: "65",
        app: "my-app",
        issuedAt: 1_799_000_000_000,
      },
    },
  ],
  limitReached: false,
};

/** The hub's moderation endpoints, as packages/identity-broker/src/client/moderation.ts answers them. */
function stubHub(answer?: () => Response) {
  const requests: { url: string; method: string; authorization: string | null; body: unknown }[] =
    [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      const text = await request.text();
      requests.push({
        url: request.url,
        method: request.method,
        authorization: request.headers.get("Authorization"),
        body: text === "" ? undefined : JSON.parse(text),
      });
      if (answer !== undefined) {
        return answer();
      }
      const { pathname } = new URL(request.url);
      switch (pathname) {
        case "/moderation/counts":
          return jsonResponse(counts);
        case "/moderation/blocks":
          return jsonResponse(request.method === "GET" ? blockList : { changed: true });
        case "/moderation/clients":
          return jsonResponse(
            new URL(request.url).searchParams.has("repository")
              ? { clients: clientList.clients }
              : clientList,
          );
        default:
          return request.method === "DELETE" && pathname.startsWith("/moderation/clients/")
            ? jsonResponse({ changed: true })
            : new Response("Not Found", { status: 404 });
      }
    }),
  );
  return requests;
}

async function viewerWith(t: ConvexTest, email: string) {
  const userId = await t.run(
    async (ctx) =>
      await ctx.db.insert("users", {
        state: "active",
        email,
        isApproved: true,
        termsVersion: "2026-08-12",
        termsAcceptedAt: 1,
      }),
  );
  return t.withIdentity({ subject: userId, tokenIdentifier: `test:${userId}` });
}

function turnModerationOn() {
  vi.stubEnv("HUB_ISSUER", HUB_ISSUER);
  vi.stubEnv("HUB_MODERATION_KEY", MODERATION_KEY);
}

describe("hub client moderation", () => {
  it.each(["anonymous", "member"] as const)(
    "refuses %s for every function, and calls no hub",
    async (role) => {
      const t = makeConvexTest();
      turnModerationOn();
      const requests = stubHub();
      const viewer = role === "anonymous" ? t : await viewerWith(t, "member@example.test");

      await expect(viewer.action(api.hubClients.moderation.readOverview, {})).rejects.toThrow(
        "Access denied",
      );
      await expect(
        viewer.action(api.hubClients.moderation.changeBlock, {
          action: "block",
          kind: "owner",
          githubId: "65",
          reason: "Phishing page",
        }),
      ).rejects.toThrow("Access denied");
      expect(requests).toEqual([]);
    },
  );

  it("says that moderation is off without the key, and calls no hub", async () => {
    const t = makeConvexTest();
    vi.stubEnv("HUB_ISSUER", HUB_ISSUER);
    vi.stubEnv("HUB_MODERATION_KEY", " ");
    const requests = stubHub();
    const admin = await viewerWith(t, "nicu@samebase.com");

    expect(await admin.action(api.hubClients.moderation.readOverview, {})).toEqual({
      status: "off",
    });
    expect(
      await admin.action(api.hubClients.moderation.changeBlock, {
        action: "block",
        kind: "owner",
        githubId: "65",
        reason: "Phishing page",
      }),
    ).toEqual({ status: "off" });
    expect(requests).toEqual([]);
  });

  it("reads the counts, the blocks, and the clients at the hub with the key", async () => {
    const t = makeConvexTest();
    turnModerationOn();
    const requests = stubHub();
    const admin = await viewerWith(t, "nicu@samebase.com");

    const overview = await admin.action(api.hubClients.moderation.readOverview, {});

    expect(overview).toEqual({ status: "on", counts, blockList, clientList });
    expect(requests).toEqual([
      {
        url: `${HUB_ISSUER}/moderation/counts`,
        method: "GET",
        authorization: `Bearer ${MODERATION_KEY}`,
        body: undefined,
      },
      {
        url: `${HUB_ISSUER}/moderation/blocks`,
        method: "GET",
        authorization: `Bearer ${MODERATION_KEY}`,
        body: undefined,
      },
      {
        url: `${HUB_ISSUER}/moderation/clients`,
        method: "GET",
        authorization: `Bearer ${MODERATION_KEY}`,
        body: undefined,
      },
    ]);
  });

  it("sets a block in the name of the signed-in admin", async () => {
    const t = makeConvexTest();
    turnModerationOn();
    const requests = stubHub();
    const admin = await viewerWith(t, "nicu@samebase.com");

    const result = await admin.action(api.hubClients.moderation.changeBlock, {
      action: "unblock",
      kind: "repository",
      githubId: "74",
      reason: "Fixed",
    });

    expect(result).toEqual({ status: "on", changed: true });
    expect(requests).toEqual([
      {
        url: `${HUB_ISSUER}/moderation/blocks`,
        method: "POST",
        authorization: `Bearer ${MODERATION_KEY}`,
        body: {
          action: "unblock",
          kind: "repository",
          githubId: "74",
          reason: "Fixed",
          adminEmail: "nicu@samebase.com",
        },
      },
    ]);
  });

  it.each([
    ["a refusal", () => jsonResponse({ error: "invalid_request" }, 400)],
    ["a wrong key", () => jsonResponse({ error: "invalid_token" }, 401)],
    ["an answer of another shape", () => jsonResponse({ day: 1 })],
  ])("fails on %s from the hub", async (_, answer) => {
    const t = makeConvexTest();
    turnModerationOn();
    stubHub(answer);
    const admin = await viewerWith(t, "nicu@samebase.com");

    await expect(admin.action(api.hubClients.moderation.readOverview, {})).rejects.toThrow(
      "The identity hub answered",
    );
  });
});

/** A member of an organization with one connected repository, GitHub id 74, and an outsider. */
async function repositoryWithMember(t: ConvexTest) {
  const ids = await t.run(async (ctx) => {
    const user = async (email: string) =>
      await ctx.db.insert("users", {
        state: "active",
        email,
        isApproved: true,
        termsVersion: "2026-08-12",
        termsAcceptedAt: 1,
      });
    const memberId = await user("ada@example.test");
    const outsiderId = await user("eve@example.test");
    const organizationId = await ctx.db.insert("organizations", {
      githubInstallationId: "installation-1",
      githubOwnerId: "65",
      githubOwnerLogin: "octo-org",
      githubOwnerLoginNormalized: "octo-org",
      githubOwnerType: "organization",
    });
    await ctx.db.insert("organizationMemberships", {
      organizationId,
      userId: memberId,
      role: "owner",
    });
    await insertTestOrganizationBillingAccount(ctx.db, organizationId);
    const repositoryId = await ctx.db.insert("repositories", {
      organizationId,
      convexTeamId: "convex-team",
      cloudflareAccountId: "cloudflare-account",
      deletion: { state: "not_deleting" },
      createdAt: 1,
      state: "not_connected",
    });
    const runId = await ctx.db.insert("workflow_repositoryProvisioning_runs", {
      organizationId,
      userId: memberId,
      repositoryId,
      githubRepositoryFullName: "octo-org/octo-repo",
      trigger: "create",
      state: "succeeded",
      currentStep: "finish",
      createdAt: 1,
      updatedAt: 2,
      completedAt: 3,
    });
    await ctx.db.replace(repositoryId, {
      organizationId,
      convexTeamId: "convex-team",
      cloudflareAccountId: "cloudflare-account",
      deletion: { state: "not_deleting" },
      createdAt: 1,
      state: "connected",
      githubMode: "create_repository",
      runId,
      githubRepositoryDatabaseId: "74",
      githubRepositoryName: "octo-repo",
      defaultBranch: "main",
      visibility: "private",
      connectedAt: 4,
    });
    return { memberId, outsiderId, repositoryId };
  });
  const viewer = (userId: string) =>
    t.withIdentity({ subject: userId, tokenIdentifier: `test:${userId}` });
  return {
    member: viewer(ids.memberId),
    outsider: viewer(ids.outsiderId),
    repositoryId: ids.repositoryId,
  };
}

describe("a repository's hub clients", () => {
  it("lists them for a member of the repository's organization, by the repository's GitHub id", async () => {
    const t = makeConvexTest();
    turnModerationOn();
    const requests = stubHub();
    const { member, repositoryId } = await repositoryWithMember(t);

    const result = await member.action(api.hubClients.moderation.readClientsOfRepository, {
      repositoryId,
    });

    expect(result).toEqual({ status: "on", clients: clientList.clients });
    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      `GET ${HUB_ISSUER}/moderation/clients?repository=74`,
    ]);
  });

  it("refuses a user outside the organization, and calls no hub", async () => {
    const t = makeConvexTest();
    turnModerationOn();
    const requests = stubHub();
    const { outsider, repositoryId } = await repositoryWithMember(t);

    await expect(
      outsider.action(api.hubClients.moderation.readClientsOfRepository, { repositoryId }),
    ).rejects.toThrow("Repository not found");
    await expect(
      outsider.action(api.hubClients.moderation.deleteClientOfRepository, {
        repositoryId,
        clientId: "cl_test",
      }),
    ).rejects.toThrow("Repository not found");
    expect(requests).toEqual([]);
  });

  it("deletes a client of the repository", async () => {
    const t = makeConvexTest();
    turnModerationOn();
    const requests = stubHub();
    const { member, repositoryId } = await repositoryWithMember(t);

    const result = await member.action(api.hubClients.moderation.deleteClientOfRepository, {
      repositoryId,
      clientId: "cl_test",
    });

    expect(result).toEqual({ status: "on", changed: true });
    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      `GET ${HUB_ISSUER}/moderation/clients?repository=74`,
      `DELETE ${HUB_ISSUER}/moderation/clients/cl_test`,
    ]);
  });

  it("deletes nothing for a client that is not in the repository's list", async () => {
    const t = makeConvexTest();
    turnModerationOn();
    const requests = stubHub();
    const { member, repositoryId } = await repositoryWithMember(t);

    const result = await member.action(api.hubClients.moderation.deleteClientOfRepository, {
      repositoryId,
      clientId: "cl_of_another_repository",
    });

    expect(result).toEqual({ status: "on", changed: false });
    expect(requests.map((request) => request.method)).toEqual(["GET"]);
  });

  it("says that moderation is off without the key, and calls no hub", async () => {
    const t = makeConvexTest();
    vi.stubEnv("HUB_ISSUER", HUB_ISSUER);
    vi.stubEnv("HUB_MODERATION_KEY", " ");
    const requests = stubHub();
    const { member, repositoryId } = await repositoryWithMember(t);

    expect(
      await member.action(api.hubClients.moderation.readClientsOfRepository, { repositoryId }),
    ).toEqual({ status: "off" });
    expect(requests).toEqual([]);
  });
});
