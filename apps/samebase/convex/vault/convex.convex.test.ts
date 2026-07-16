import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { api, internal } from "../_generated/api";
import { makeConvexTest } from "../test.setup";

const appRoot = ".";

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
      ghRepoNodeId: "R_123",
      owner: "ada",
      name: "demo",
      visibility: "private",
      defaultBranch: "main",
      connectedAt: 12,
    });
    await ctx.db.insert("vaultApps", {
      vaultId,
      userId,
      appRoot,
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

    return { runId, userId, vaultId };
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

        if (input.url.includes("/teams/1000/list_projects")) {
          return jsonResponse(`[
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
          ]`);
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
      ...ids,
      appRoot,
    });
    await expect(
      t.action(internal.vault.convex.ensureConvexDeploymentConnection, {
        ...ids,
        target: {
          mode: "connect_existing_project",
          appRoot,
          projectId: "1001",
        },
      }),
    ).resolves.toBeNull();

    const deployment = await t.run(
      async (ctx) =>
        await ctx.db
          .query("vaultConvexDeployments")
          .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
          .first(),
    );

    expect(deployment).toMatchObject({
      appRoot,
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
      ...ids,
      appRoot,
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
        ...ids,
        target: {
          mode: "connect_existing_project",
          appRoot,
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
      await ctx.db.insert("appProvisioningRuns", {
        userId: ids.userId,
        vaultId: ids.vaultId,
        repositoryFullName: "ada/demo",
        trigger: "connect_convex_deployment",
        createdConvexProject: {
          projectName: "alpha-project",
          projectId: "1001",
          projectSlug: "alpha-project",
        },
        state: "failed",
        currentStep: "attach_convex",
        lastError: "Convex attach failed.",
        createdAt: 20,
        updatedAt: 25,
        completedAt: 25,
      });
    });
    await t.mutation(internal.vault.convexMutations.claimConvexDeploymentConnection, {
      ...ids,
      appRoot,
    });

    await expect(
      t.action(internal.vault.convex.ensureConvexDeploymentConnection, {
        ...ids,
        target: {
          mode: "create_project",
          appRoot,
          projectName: "alpha-project",
        },
      }),
    ).resolves.toBeNull();

    const deployment = await t.run(
      async (ctx) =>
        await ctx.db
          .query("vaultConvexDeployments")
          .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
          .first(),
    );
    expect(deployment).toMatchObject({
      appRoot,
      projectId: "1001",
      projectSlug: "alpha-project",
      deploymentName: "alpha-prod",
      origin: "provisioned",
    });
    expect(requests.some((url) => url.includes("/create_project"))).toBe(false);
    expect(requests.some((url) => url.includes("/list_projects"))).toBe(false);
  });

  it("recreates a previously created Convex project after the upstream project was deleted", async () => {
    const requests: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: Request) => {
        requests.push(input.url);

        if (input.url.includes("/projects/1001")) {
          return new Response("project not found", { status: 404 });
        }

        if (input.url.includes("/teams/1000/list_projects")) {
          return jsonResponse("[]");
        }

        if (input.url.includes("/teams/1000/create_project")) {
          return jsonResponse(`{
            "id": 1002,
            "projectId": 1002,
            "slug": "alpha-project-recreated"
          }`);
        }

        if (input.url.includes("/projects/1002/deployment")) {
          return jsonResponse(`{
            "class": "s16",
            "createTime": 1710000000200,
            "deploymentType": "prod",
            "deploymentUrl": "https://alpha-recreated.convex.cloud",
            "id": 2002,
            "isDefault": true,
            "kind": "cloud",
            "name": "alpha-recreated-prod",
            "projectId": 1002,
            "reference": "prod",
            "region": "aws-us-east-1"
          }`);
        }

        if (input.url.includes("/projects/1002")) {
          return jsonResponse(`{
            "createTime": 1710000000000,
            "id": 1002,
            "name": "alpha-project",
            "slug": "alpha-project-recreated",
            "teamId": 1000,
            "teamSlug": "samebase-team"
          }`);
        }

        throw new Error(`Unexpected Convex request: ${input.url}`);
      }),
    );
    const { ids, t } = await createConvexConnectedVault();
    await t.run(async (ctx) => {
      await ctx.db.insert("appProvisioningRuns", {
        userId: ids.userId,
        vaultId: ids.vaultId,
        repositoryFullName: "ada/demo",
        trigger: "connect_convex_deployment",
        createdConvexProject: {
          projectName: "alpha-project",
          projectId: "1001",
          projectSlug: "alpha-project",
        },
        state: "failed",
        currentStep: "attach_convex",
        lastError: "Convex attach failed.",
        createdAt: 20,
        updatedAt: 25,
        completedAt: 25,
      });
    });
    await t.mutation(internal.vault.convexMutations.claimConvexDeploymentConnection, {
      ...ids,
      appRoot,
    });

    await expect(
      t.action(internal.vault.convex.ensureConvexDeploymentConnection, {
        ...ids,
        target: {
          mode: "create_project",
          appRoot,
          projectName: "alpha-project",
        },
      }),
    ).resolves.toBeNull();

    const deployment = await t.run(
      async (ctx) =>
        await ctx.db
          .query("vaultConvexDeployments")
          .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
          .first(),
    );
    expect(deployment).toMatchObject({
      appRoot,
      projectId: "1002",
      projectSlug: "alpha-project-recreated",
      deploymentName: "alpha-recreated-prod",
      origin: "provisioned",
    });
    expect(requests.some((url) => url.includes("/teams/1000/list_projects"))).toBe(true);
    expect(requests.some((url) => url.includes("/teams/1000/create_project"))).toBe(true);
  });
});
