import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { api, internal } from "../_generated/api";
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

  it("does not delete a newly created project after its attachment loses a race", async () => {
    const { appId, asUser, t, userId, vaultId } = await createConvexConnectedVault();
    const existingAttachmentId = await t.run(async (ctx) => {
      const otherAppId = await ctx.db.insert("vaultApps", {
        vaultId,
        userId,
        rootDirectory: "apps/other",
        createdAt: 30,
      });
      return await ctx.db.insert("vaultConvexProjects", {
        vaultId,
        userId,
        appId: otherAppId,
        teamId: "1000",
        projectId: "1002",
        origin: "selected_existing",
        createdAt: 31,
      });
    });
    const requests: { method: string; url: string }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: Request) => {
        requests.push({ method: input.method, url: input.url });
        if (input.url.includes("/teams/1000/projects")) {
          return jsonResponse('{"items":[],"pagination":{"hasMore":false}}');
        }
        if (input.url.includes("/teams/1000/create_project")) {
          return jsonResponse('{"id":1002,"projectId":1002,"slug":"alpha"}');
        }
        if (input.method === "GET" && input.url.includes("/projects/1002")) {
          return jsonResponse(`{
            "createTime":1710000000000,
            "id":1002,
            "name":"alpha",
            "slug":"alpha",
            "teamId":1000,
            "teamSlug":"samebase-team"
          }`);
        }
        throw new Error(`Unexpected Convex request: ${input.method} ${input.url}`);
      }),
    );

    await expect(
      asUser.action(api.vault.convex.createProject, {
        vaultId,
        appId,
        projectName: "alpha",
      }),
    ).rejects.toThrow("Convex project is already attached.");
    expect(
      requests.some(
        (request) => request.method === "POST" && request.url.includes("/projects/1002/delete"),
      ),
    ).toBe(false);
    await expect(
      t.run(async (ctx) => await ctx.db.get(existingAttachmentId)),
    ).resolves.toMatchObject({ projectId: "1002" });
    await expect(t.run(async (ctx) => await ctx.db.get(appId))).resolves.toMatchObject({
      rootDirectory: "/",
    });
  });

  it("removes an attachment only after Convex confirms the project is missing", async () => {
    const { appId, asUser, t, userId, vaultId } = await createConvexConnectedVault();
    const convexProjectId = await t.mutation(internal.vault.convexMutations.attachProject, {
      vaultId,
      userId,
      appId,
      teamId: "1000",
      projectId: "1003",
      origin: "selected_existing",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: Request) => {
        if (input.url.includes("/projects/1003")) {
          return new Response("missing", { status: 404 });
        }
        throw new Error(`Unexpected Convex request: ${input.url}`);
      }),
    );

    await expect(
      asUser.action(api.vault.convex.removeMissingProject, { vaultId, convexProjectId }),
    ).resolves.toBeNull();
    await expect(t.run(async (ctx) => await ctx.db.get(convexProjectId))).resolves.toBeNull();
  });

  it("keeps an attachment when another Convex team is connected", async () => {
    const { appId, asUser, t, userId, vaultId } = await createConvexConnectedVault();
    const convexProjectId = await t.mutation(internal.vault.convexMutations.attachProject, {
      vaultId,
      userId,
      appId,
      teamId: "2000",
      projectId: "2003",
      origin: "selected_existing",
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      asUser.action(api.vault.convex.removeMissingProject, { vaultId, convexProjectId }),
    ).rejects.toThrow("Connect the Convex team that owns this project before removing it.");
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(t.run(async (ctx) => await ctx.db.get(convexProjectId))).resolves.toMatchObject({
      teamId: "2000",
      projectId: "2003",
    });
  });

  it("does not report a project as missing when another Convex team is connected", async () => {
    const { appId, asUser, t, userId, vaultId } = await createConvexConnectedVault();
    const convexProjectId = await t.mutation(internal.vault.convexMutations.attachProject, {
      vaultId,
      userId,
      appId,
      teamId: "2000",
      projectId: "2004",
      origin: "selected_existing",
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      asUser.action(api.vault.providerObservations.observeConvexProjects, { vaultId }),
    ).resolves.toMatchObject([
      {
        state: "failed",
        convexProjectId,
        reason: "connection_required",
      },
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stops a managed retry when the previous project create result is unknown", async () => {
    const { appId, t, userId, vaultId } = await createConvexConnectedVault();
    const runId = await t.run(async (ctx) => {
      const runId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
        userId,
        vaultId,
        repositoryFullName: "ada/demo",
        trigger: "retry",
        state: "running",
        currentStep: "attach_convex",
        createdAt: 30,
        updatedAt: 30,
      });
      await ctx.db.insert("workflow_vaultProvisioning_writeLocks", {
        vaultId,
        runId,
        state: "active",
        updatedAt: 30,
      });
      await ctx.db.insert("workflow_vaultProvisioning_plans", {
        vaultId,
        userId,
        appRoot: ".",
        convex: {
          state: "creating",
          projectName: "demo",
          teamId: "1000",
        },
        cloudflare: {
          state: "planned",
          accountId: "account-id",
          workerName: "demo",
          build: {
            rootDirectory: "/",
            buildCommand: "pnpm run build",
            deployCommand: "pnpm run deploy",
            previewDeployCommand: "pnpm run deploy:preview",
            pathIncludes: ["*"],
            pathExcludes: [],
          },
        },
        createdAt: 30,
        updatedAt: 30,
      });
      return runId;
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      t.action(internal.vault.convex.ensureConvexProjectConnection, {
        vaultId,
        runId,
        userId,
        target: { mode: "create_project", appId, projectName: "demo" },
      }),
    ).rejects.toThrow("previous Convex project create may have completed");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps an attachment when the project still exists", async () => {
    const { appId, asUser, t, userId, vaultId } = await createConvexConnectedVault();
    const convexProjectId = await t.mutation(internal.vault.convexMutations.attachProject, {
      vaultId,
      userId,
      appId,
      teamId: "1000",
      projectId: "1004",
      origin: "selected_existing",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: Request) => {
        if (input.url.includes("/projects/1004")) {
          return jsonResponse(`{
            "createTime":1710000000000,
            "id":1004,
            "name":"Still here",
            "slug":"still-here",
            "teamId":1000,
            "teamSlug":"samebase-team"
          }`);
        }
        throw new Error(`Unexpected Convex request: ${input.url}`);
      }),
    );

    await expect(
      asUser.action(api.vault.convex.removeMissingProject, { vaultId, convexProjectId }),
    ).rejects.toThrow("Convex project still exists.");
    await expect(t.run(async (ctx) => await ctx.db.get(convexProjectId))).resolves.toMatchObject({
      projectId: "1004",
    });
  });
});
