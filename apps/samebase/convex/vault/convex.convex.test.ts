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

  return t.withIdentity({
    subject: `${userId}|test-session`,
    tokenIdentifier: `test:${userId}`,
  });
}

async function createConvexConnectedVault() {
  const t = makeConvexTest();
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: "Ada",
      email: "ada@example.com",
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
    const vaultId = await ctx.db.insert("vaults", {
      userId,
      deletion: { state: "not_deleting" },
      state: "not_connected",
    });
    const sourceRunId = await ctx.db.insert("appProvisioningRuns", {
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
      runId: sourceRunId,
      ghRepoId: "123",
      owner: "ada",
      name: "demo",
      visibility: "private",
      defaultBranch: "main",
      connectedAt: 12,
    });
    const appId = await ctx.db.insert("vaultApps", {
      vaultId,
      userId,
      rootDirectory: "/",
      createdAt: 25,
    });
    const runId = await ctx.db.insert("appProvisioningRuns", {
      userId,
      vaultId,
      repositoryFullName: "ada/demo",
      trigger: "connect_convex_deployment",
      state: "queued",
      currentStep: "run_created",
      createdAt: 30,
      updatedAt: 30,
    });

    return { appId, runId, userId, vaultId };
  });

  return { ids, t };
}

describe("vault Convex deployment connection actions", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("lists every project for the connected team", async () => {
    const requests: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: Request) => {
        requests.push(input.url);

        if (input.url.includes("/teams/1000/projects")) {
          return jsonResponse(`{
            "items": [
              {
                "createTime": 1710000000000,
                "id": 1001,
                "name": "Alpha Project",
                "slug": "alpha",
                "teamId": 1000,
                "teamSlug": "samebase-team"
              },
              {
                "createTime": 1710000000001,
                "id": 1002,
                "name": "Beta Project",
                "slug": "beta",
                "teamId": 1000,
                "teamSlug": "samebase-team"
              },
              {
                "createTime": 1710000000002,
                "id": 1003,
                "name": "Samebase",
                "slug": "samebase",
                "teamId": 1000,
                "teamSlug": "samebase-team"
              }
            ],
            "pagination": { "hasMore": false }
          }`);
        }

        throw new Error(`Unexpected Convex request: ${input.url}`);
      }),
    );

    const asUser = await createConvexConnectedUser();

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
      {
        projectId: "1003",
        projectName: "Samebase",
        projectSlug: "samebase",
        teamSlug: "samebase-team",
      },
    ]);
    expect(requests.filter((url) => url.includes("/list_deployments"))).toHaveLength(0);
  });

  it("connects a selected project default production deployment", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: Request) => {
        if (input.url.includes("/projects/1001/deployment")) {
          return jsonResponse(`{
            "class": "s16",
            "createTime": 1710000000200,
            "deploymentType": "prod",
            "deploymentUrl": "https://alpha-prod.convex.cloud",
            "id": 2002,
            "isDefault": true,
            "kind": "cloud",
            "name": "alpha-prod",
            "projectId": 1001,
            "reference": "prod",
            "region": "aws-us-east-1"
          }`);
        }

        if (input.url.includes("/projects/1001")) {
          return jsonResponse(`{
            "createTime": 1710000000000,
            "id": 1001,
            "name": "Alpha Project",
            "slug": "alpha",
            "teamId": 1000,
            "teamSlug": "samebase-team"
          }`);
        }

        throw new Error(`Unexpected Convex request: ${input.url}`);
      }),
    );
    const { ids, t } = await createConvexConnectedVault();

    await t.mutation(internal.vault.convexMutations.claimConvexDeploymentConnection, {
      vaultId: ids.vaultId,
      runId: ids.runId,
      userId: ids.userId,
      target: {
        mode: "connect_existing_project",
        appId: ids.appId,
        teamId: "1000",
        projectId: "1001",
      },
    });
    await expect(
      t.action(internal.vault.convex.ensureConvexDeploymentConnection, {
        runId: ids.runId,
        userId: ids.userId,
        vaultId: ids.vaultId,
        target: {
          mode: "connect_existing_project",
          appId: ids.appId,
          teamId: "1000",
          projectId: "1001",
        },
      }),
    ).resolves.toEqual(expect.any(String));

    const deployment = await t.run(
      async (ctx) =>
        await ctx.db
          .query("vaultConvexDeployments")
          .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
          .first(),
    );

    expect(deployment).toMatchObject({
      appId: ids.appId,
      projectId: "1001",
      teamSlug: "samebase-team",
      projectSlug: "alpha",
      deploymentName: "alpha-prod",
      deploymentType: "prod",
      cloudUrl: "https://alpha-prod.convex.cloud",
      siteUrl: "https://alpha-prod.convex.site",
      origin: "selected_existing",
    });
  });

  it("treats a superseded attach as canceled instead of failed", async () => {
    const { ids, t } = await createConvexConnectedVault();
    await t.mutation(internal.vault.convexMutations.claimConvexDeploymentConnection, {
      vaultId: ids.vaultId,
      runId: ids.runId,
      userId: ids.userId,
      target: {
        mode: "connect_existing_project",
        appId: ids.appId,
        teamId: "1000",
        projectId: "1001",
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: Request) => {
        if (input.url.includes("/projects/1001/deployment")) {
          await t.run(async (ctx) => {
            const ownership = await ctx.db
              .query("vaultInfrastructureOwnership")
              .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
              .first();
            if (!ownership) {
              throw new Error("Expected active ownership row.");
            }
            await ctx.db.patch(ownership._id, {
              state: "failed",
              updatedAt: 50,
            });
          });
          return jsonResponse(`{
            "class": "s16",
            "createTime": 1710000000100,
            "deploymentType": "prod",
            "deploymentUrl": "https://alpha-prod.convex.cloud",
            "id": 2001,
            "isDefault": true,
            "kind": "cloud",
            "name": "alpha-prod",
            "projectId": 1001,
            "reference": "prod",
            "region": "aws-us-east-1"
          }`);
        }

        if (input.url.includes("/projects/1001")) {
          return jsonResponse(`{
            "createTime": 1710000000000,
            "id": 1001,
            "name": "Alpha Project",
            "slug": "alpha",
            "teamId": 1000,
            "teamSlug": "samebase-team"
          }`);
        }

        throw new Error(`Unexpected Convex request: ${input.url}`);
      }),
    );

    await expect(
      t.action(internal.vault.convex.ensureConvexDeploymentConnection, {
        runId: ids.runId,
        userId: ids.userId,
        vaultId: ids.vaultId,
        target: {
          mode: "connect_existing_project",
          appId: ids.appId,
          teamId: "1000",
          projectId: "1001",
        },
      }),
    ).resolves.toBeNull();

    const result = await t.run(async (ctx) => {
      const run = await ctx.db.get(ids.runId);
      const deployment = await ctx.db
        .query("vaultConvexDeployments")
        .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
        .first();
      return { deployment, run };
    });

    expect(result.run).toMatchObject({
      state: "canceled",
      currentStep: "claim_infra",
    });
    expect(result.deployment).toBeNull();
  });

  it("rejects provider writes when the connected team changes after claim", async () => {
    const { ids, t } = await createConvexConnectedVault();
    const target = {
      mode: "create_project" as const,
      appId: ids.appId,
      teamId: "1000",
      projectName: "alpha-project",
    };
    await expect(
      t.mutation(internal.vault.convexMutations.claimConvexDeploymentConnection, {
        vaultId: ids.vaultId,
        runId: ids.runId,
        userId: ids.userId,
        target,
      }),
    ).resolves.toEqual({ claimed: true });
    await t.run(async (ctx) => {
      const connection = await ctx.db
        .query("providerConnections")
        .withIndex("by_user_kind", (q) => q.eq("userId", ids.userId).eq("kind", "convex"))
        .unique();
      if (connection?.kind !== "convex") {
        throw new Error("Expected Convex connection.");
      }
      await ctx.db.patch(connection._id, { teamId: "2000" });
    });
    const fetch = vi.fn(async () => new Response(null, { status: 500 }));
    vi.stubGlobal("fetch", fetch);

    await expect(
      t.action(internal.vault.convex.ensureConvexDeploymentConnection, {
        vaultId: ids.vaultId,
        runId: ids.runId,
        userId: ids.userId,
        target,
      }),
    ).rejects.toThrow("Convex connection no longer matches the selected team.");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not read a selected project after its captured team changes", async () => {
    const { ids, t } = await createConvexConnectedVault();
    const target = {
      mode: "connect_existing_project" as const,
      appId: ids.appId,
      teamId: "1000",
      projectId: "1001",
    };
    await t.mutation(internal.vault.convexMutations.claimConvexDeploymentConnection, {
      vaultId: ids.vaultId,
      runId: ids.runId,
      userId: ids.userId,
      target,
    });
    await t.run(async (ctx) => {
      const connection = await ctx.db
        .query("providerConnections")
        .withIndex("by_user_kind", (q) => q.eq("userId", ids.userId).eq("kind", "convex"))
        .unique();
      if (connection?.kind !== "convex") {
        throw new Error("Expected Convex connection.");
      }
      await ctx.db.patch(connection._id, { teamId: "2000" });
    });
    const fetch = vi.fn(async () => new Response(null, { status: 500 }));
    vi.stubGlobal("fetch", fetch);

    await expect(
      t.action(internal.vault.convex.ensureConvexDeploymentConnection, {
        vaultId: ids.vaultId,
        runId: ids.runId,
        userId: ids.userId,
        target,
      }),
    ).rejects.toThrow("Convex connection no longer matches the selected team.");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reuses a previously created Convex project when retrying project creation", async () => {
    const requests: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: Request) => {
        requests.push(input.url);

        if (input.url.includes("/projects/1001/deployment")) {
          return jsonResponse(`{
            "class": "s16",
            "createTime": 1710000000100,
            "deploymentType": "prod",
            "deploymentUrl": "https://alpha-prod.convex.cloud",
            "id": 2001,
            "isDefault": true,
            "kind": "cloud",
            "name": "alpha-prod",
            "projectId": 1001,
            "reference": "prod",
            "region": "aws-us-east-1"
          }`);
        }

        if (input.url.includes("/projects/1001")) {
          return jsonResponse(`{
            "createTime": 1710000000000,
            "id": 1001,
            "name": "alpha-project",
            "slug": "alpha-project",
            "teamId": 1000,
            "teamSlug": "samebase-team"
          }`);
        }

        throw new Error(`Unexpected Convex request: ${input.url}`);
      }),
    );
    const { ids, t } = await createConvexConnectedVault();
    await t.run(async (ctx) => {
      const previousRunId = await ctx.db.insert("appProvisioningRuns", {
        userId: ids.userId,
        vaultId: ids.vaultId,
        repositoryFullName: "ada/demo",
        trigger: "connect_convex_deployment",
        state: "failed",
        currentStep: "attach_convex",
        lastError: "Convex attach failed.",
        createdAt: 20,
        updatedAt: 25,
        completedAt: 25,
      });
      await ctx.db.insert("vaultConvexProjectCreationClaims", {
        vaultId: ids.vaultId,
        userId: ids.userId,
        appId: ids.appId,
        runId: previousRunId,
        teamId: "1000",
        projectName: "alpha-project",
        lifecycle: {
          state: "created",
          projectId: "1001",
        },
        createdAt: 20,
        updatedAt: 25,
      });
    });
    await t.mutation(internal.vault.convexMutations.claimConvexDeploymentConnection, {
      vaultId: ids.vaultId,
      runId: ids.runId,
      userId: ids.userId,
      target: {
        mode: "create_project",
        appId: ids.appId,
        teamId: "1000",
        projectName: "alpha-project",
      },
    });

    await expect(
      t.action(internal.vault.convex.ensureConvexDeploymentConnection, {
        runId: ids.runId,
        userId: ids.userId,
        vaultId: ids.vaultId,
        target: {
          mode: "create_project",
          appId: ids.appId,
          teamId: "1000",
          projectName: "alpha-project",
        },
      }),
    ).resolves.toEqual(expect.any(String));

    const deployment = await t.run(
      async (ctx) =>
        await ctx.db
          .query("vaultConvexDeployments")
          .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
          .first(),
    );
    expect(deployment).toMatchObject({
      appId: ids.appId,
      projectId: "1001",
      projectSlug: "alpha-project",
      deploymentName: "alpha-prod",
      origin: "provisioned",
    });
    expect(requests.some((url) => url.includes("/create_project"))).toBe(false);
    expect(requests.some((url) => url.includes("/teams/1000/projects"))).toBe(false);
  });

  it("recovers a same-name project as selected existing when the confirmed id disappeared", async () => {
    const requests: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: Request) => {
        requests.push(input.url);

        if (input.url.includes("/projects/1001")) {
          return new Response("project not found", { status: 404 });
        }

        if (input.url.includes("/teams/1000/projects")) {
          return jsonResponse(`{
            "items": [
              {
                "createTime": 1710000000001,
                "id": 1002,
                "name": "alpha-project",
                "slug": "replacement-alpha",
                "teamId": 1000,
                "teamSlug": "samebase-team"
              }
            ],
            "pagination": { "hasMore": false }
          }`);
        }

        if (input.url.includes("/projects/1002/deployment")) {
          return jsonResponse(`{
            "class": "s16",
            "createTime": 1710000000200,
            "deploymentType": "prod",
            "deploymentUrl": "https://replacement-alpha-prod.convex.cloud",
            "id": 2002,
            "isDefault": true,
            "kind": "cloud",
            "name": "replacement-alpha-prod",
            "projectId": 1002,
            "reference": "prod",
            "region": "aws-us-east-1"
          }`);
        }

        throw new Error(`Unexpected Convex request: ${input.url}`);
      }),
    );
    const { ids, t } = await createConvexConnectedVault();
    await t.run(async (ctx) => {
      const previousRunId = await ctx.db.insert("appProvisioningRuns", {
        userId: ids.userId,
        vaultId: ids.vaultId,
        repositoryFullName: "ada/demo",
        trigger: "connect_convex_deployment",
        state: "failed",
        currentStep: "attach_convex",
        lastError: "Convex attach failed.",
        createdAt: 20,
        updatedAt: 25,
        completedAt: 25,
      });
      await ctx.db.insert("vaultConvexProjectCreationClaims", {
        vaultId: ids.vaultId,
        userId: ids.userId,
        appId: ids.appId,
        runId: previousRunId,
        teamId: "1000",
        projectName: "alpha-project",
        lifecycle: {
          state: "created",
          projectId: "1001",
        },
        createdAt: 20,
        updatedAt: 25,
      });
    });
    await t.mutation(internal.vault.convexMutations.claimConvexDeploymentConnection, {
      vaultId: ids.vaultId,
      runId: ids.runId,
      userId: ids.userId,
      target: {
        mode: "create_project",
        appId: ids.appId,
        teamId: "1000",
        projectName: "alpha-project",
      },
    });

    await expect(
      t.action(internal.vault.convex.ensureConvexDeploymentConnection, {
        runId: ids.runId,
        userId: ids.userId,
        vaultId: ids.vaultId,
        target: {
          mode: "create_project",
          appId: ids.appId,
          teamId: "1000",
          projectName: "alpha-project",
        },
      }),
    ).resolves.toEqual(expect.any(String));

    const deployment = await t.run(
      async (ctx) =>
        await ctx.db
          .query("vaultConvexDeployments")
          .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
          .first(),
    );
    expect(deployment).toMatchObject({
      projectId: "1002",
      projectSlug: "replacement-alpha",
      origin: "selected_existing",
    });
    expect(requests.some((url) => url.includes("/teams/1000/projects"))).toBe(true);
    expect(requests.some((url) => url.includes("/teams/1000/create_project"))).toBe(false);
    await expect(
      t.run(
        async (ctx) =>
          await ctx.db
            .query("vaultConvexProjectCreationClaims")
            .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
            .first(),
      ),
    ).resolves.toBeNull();
  });
});
