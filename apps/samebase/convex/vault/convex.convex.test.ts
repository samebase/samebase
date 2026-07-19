import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { api } from "../_generated/api";
import { makeConvexTest } from "../test.setup";

function jsonResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

async function createConvexConnectedUser() {
  const t = makeConvexTest();
  const userId = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: "Ada",
      email: "nicu@samebase.com",
      isApproved: true,
    });
    await ctx.db.insert("providerConnections", {
      kind: "convex",
      userId,
      auth: {
        method: "oauth",
        credential: "test-convex-token",
      },
      teamId: "1000",
      teamSlug: "samebase-team",
      createdAt: 1,
      updatedAt: 2,
    });
    return userId;
  });

  return {
    asUser: t.withIdentity({
      subject: `${userId}|test-session`,
      tokenIdentifier: `test:${userId}`,
    }),
    t,
    userId,
  };
}

async function createConvexConnectedVault() {
  const { asUser, t, userId } = await createConvexConnectedUser();
  const { appId, vaultId } = await t.run(async (ctx) => {
    const vaultId = await ctx.db.insert("vaults", {
      userId,
      deletion: { state: "not_deleting" },
      state: "not_connected",
    });
    const runId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
      userId,
      vaultId,
      repositoryFullName: "ada/demo",
      trigger: "connect_existing_repository",
      state: "succeeded",
      currentStep: "finish",
      createdAt: 10,
      updatedAt: 20,
      completedAt: 20,
    });
    await ctx.db.replace(vaultId, {
      userId,
      deletion: { state: "not_deleting" },
      state: "connected",
      githubMode: "connect_existing_repository",
      runId,
      ghRepoId: "123",
      owner: "ada",
      name: "demo",
      visibility: "private",
      defaultBranch: "main",
      connectedAt: 20,
    });
    const appId = await ctx.db.insert("vaultApps", {
      vaultId,
      userId,
      rootDirectory: "/",
      createdAt: 25,
    });
    return { appId, vaultId };
  });

  return { appId, asUser, t, userId, vaultId };
}

describe("vault Convex project operations", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("lists every project for the connected team", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: Request) => {
        if (input.url.includes("/teams/1000/projects")) {
          return jsonResponse(`{
            "items": [
              {"createTime":1710000000001,"id":1002,"name":"Beta Project","slug":"beta","teamId":1000,"teamSlug":"samebase-team"},
              {"createTime":1710000000000,"id":1001,"name":"Alpha Project","slug":"alpha","teamId":1000,"teamSlug":"samebase-team"}
            ],
            "pagination": {"hasMore":false}
          }`);
        }
        throw new Error(`Unexpected Convex request: ${input.url}`);
      }),
    );

    const { asUser } = await createConvexConnectedUser();

    await expect(asUser.action(api.vault.convex.listProjects)).resolves.toEqual([
      {
        projectId: "1001",
        projectName: "Alpha Project",
        projectSlug: "alpha",
        teamSlug: "samebase-team",
      },
      {
        projectId: "1002",
        projectName: "Beta Project",
        projectSlug: "beta",
        teamSlug: "samebase-team",
      },
    ]);
  });

  it("attaches an existing project without copying deployment state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: Request) => {
        if (input.url.includes("/projects/1001")) {
          return jsonResponse(`{
            "createTime":1710000000000,
            "id":1001,
            "name":"Alpha Project",
            "slug":"alpha",
            "teamId":1000,
            "teamSlug":"samebase-team"
          }`);
        }
        throw new Error(`Unexpected Convex request: ${input.url}`);
      }),
    );
    const { appId, asUser, t, vaultId } = await createConvexConnectedVault();

    await expect(
      asUser.action(api.vault.convex.connectExistingProject, {
        vaultId,
        appId,
        projectId: "1001",
      }),
    ).resolves.toBeNull();

    const project = await t.run(async (ctx) =>
      ctx.db
        .query("vaultConvexProjects")
        .withIndex("by_app", (q) => q.eq("appId", appId))
        .unique(),
    );
    expect(project).toMatchObject({
      appId,
      teamId: "1000",
      projectId: "1001",
      origin: "selected_existing",
    });
  });

  it("creates and records a project as provisioned", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: Request) => {
        if (input.url.includes("/teams/1000/projects")) {
          return jsonResponse('{"items":[],"pagination":{"hasMore":false}}');
        }
        if (input.url.includes("/teams/1000/create_project")) {
          return jsonResponse('{"id":1002,"projectId":1002,"slug":"alpha"}');
        }
        if (input.url.includes("/projects/1002")) {
          return jsonResponse(`{
            "createTime":1710000000000,
            "id":1002,
            "name":"alpha",
            "slug":"alpha",
            "teamId":1000,
            "teamSlug":"samebase-team"
          }`);
        }
        throw new Error(`Unexpected Convex request: ${input.url}`);
      }),
    );
    const { appId, asUser, t, vaultId } = await createConvexConnectedVault();

    await expect(
      asUser.action(api.vault.convex.createProject, {
        vaultId,
        appId,
        projectName: "alpha",
      }),
    ).resolves.toBeNull();

    const project = await t.run(async (ctx) =>
      ctx.db
        .query("vaultConvexProjects")
        .withIndex("by_app", (q) => q.eq("appId", appId))
        .unique(),
    );
    expect(project).toMatchObject({
      appId,
      teamId: "1000",
      projectId: "1002",
      origin: "provisioned",
    });
  });
});
