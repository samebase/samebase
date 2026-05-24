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
      teamSlug: "noter-team",
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
      teamSlug: "noter-team",
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
      convex: { state: "not_configured" },
      cloudflare: { state: "not_configured" },
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

  it("lists every paginated cloud production deployment for the connected team", async () => {
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
              "teamSlug": "noter-team"
            },
            {
              "createTime": 1710000000001,
              "id": 1002,
              "name": "Beta Project",
              "slug": "beta",
              "teamId": 1000,
              "teamSlug": "noter-team"
            }
          ]`);
        }

        if (input.url.includes("/teams/1000/list_deployments") && !input.url.includes("cursor=")) {
          return jsonResponse(`{
            "items": [
              {
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
              },
              {
                "class": "s16",
                "createTime": 1710000000200,
                "deploymentType": "prod",
                "deploymentUrl": "https://alpha-alt-prod.convex.cloud",
                "id": 2002,
                "isDefault": false,
                "kind": "cloud",
                "name": "alpha-alt-prod",
                "projectId": 1001,
                "reference": "production-alt",
                "region": "aws-us-east-1"
              },
              {
                "class": "s16",
                "createTime": 1710000000300,
                "deploymentType": "dev",
                "deploymentUrl": "https://alpha-dev.convex.cloud",
                "id": 2003,
                "isDefault": false,
                "kind": "cloud",
                "name": "alpha-dev",
                "projectId": 1001,
                "reference": "dev",
                "region": "aws-us-east-1"
              }
            ],
            "pagination": {
              "hasMore": true,
              "nextCursor": "cursor-two"
            }
          }`);
        }

        if (input.url.includes("/teams/1000/list_deployments") && input.url.includes("cursor=")) {
          return jsonResponse(`{
            "items": [
              {
                "class": "s16",
                "createTime": 1710000000400,
                "deploymentType": "prod",
                "deploymentUrl": "https://beta-prod.convex.cloud",
                "id": 2004,
                "isDefault": true,
                "kind": "cloud",
                "name": "beta-prod",
                "projectId": 1002,
                "reference": "prod",
                "region": "aws-us-east-1"
              }
            ],
            "pagination": {
              "hasMore": false,
              "nextCursor": null
            }
          }`);
        }

        throw new Error(`Unexpected Convex request: ${input.url}`);
      }),
    );

    const asUser = await createConvexConnectedUser();

    await expect(asUser.action(api.vault.convex.listProductionDeployments)).resolves.toEqual([
      {
        projectId: "1001",
        projectName: "Alpha Project",
        projectSlug: "alpha",
        teamSlug: "noter-team",
        deploymentName: "alpha-alt-prod",
        cloudUrl: "https://alpha-alt-prod.convex.cloud",
        siteUrl: "https://alpha-alt-prod.convex.site",
      },
      {
        projectId: "1001",
        projectName: "Alpha Project",
        projectSlug: "alpha",
        teamSlug: "noter-team",
        deploymentName: "alpha-prod",
        cloudUrl: "https://alpha-prod.convex.cloud",
        siteUrl: "https://alpha-prod.convex.site",
      },
      {
        projectId: "1002",
        projectName: "Beta Project",
        projectSlug: "beta",
        teamSlug: "noter-team",
        deploymentName: "beta-prod",
        cloudUrl: "https://beta-prod.convex.cloud",
        siteUrl: "https://beta-prod.convex.site",
      },
    ]);
    expect(requests.filter((url) => url.includes("/list_deployments"))).toHaveLength(2);
  });

  it("connects a selected non-default cloud production deployment", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: Request) => {
        if (input.url.includes("/projects/1001")) {
          return jsonResponse(`{
            "createTime": 1710000000000,
            "id": 1001,
            "name": "Alpha Project",
            "slug": "alpha",
            "teamId": 1000,
            "teamSlug": "noter-team"
          }`);
        }

        if (input.url.includes("/deployments/alpha-alt-prod")) {
          return jsonResponse(`{
            "class": "s16",
            "createTime": 1710000000200,
            "deploymentType": "prod",
            "deploymentUrl": "https://alpha-alt-prod.convex.cloud",
            "id": 2002,
            "isDefault": false,
            "kind": "cloud",
            "name": "alpha-alt-prod",
            "projectId": 1001,
            "reference": "production-alt",
            "region": "aws-us-east-1"
          }`);
        }

        throw new Error(`Unexpected Convex request: ${input.url}`);
      }),
    );
    const { ids, t } = await createConvexConnectedVault();

    await t.mutation(internal.vault.convexMutations.claimConvexDeploymentConnection, ids);
    await expect(
      t.action(internal.vault.convex.ensureConvexDeploymentConnection, {
        ...ids,
        target: {
          mode: "connect_existing_deployment",
          projectId: "1001",
          deploymentName: "alpha-alt-prod",
        },
      }),
    ).resolves.toBeNull();

    const result = await t.run(async (ctx) => {
      const [vault, infrastructure] = await Promise.all([
        ctx.db.get(ids.vaultId),
        ctx.db
          .query("vaultInfrastructure")
          .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
          .first(),
      ]);
      return { infrastructure, vault };
    });

    expect(result.vault).toMatchObject({
      convex: {
        state: "connected",
        projectId: "1001",
        projectSlug: "alpha",
        deploymentName: "alpha-alt-prod",
        origin: "selected_existing",
      },
    });
    expect(result.infrastructure).toMatchObject({
      convexProjectId: "1001",
      convexTeamSlug: "noter-team",
      convexProjectSlug: "alpha",
      convexDeploymentName: "alpha-alt-prod",
      convexDeploymentType: "prod",
      convexCloudUrl: "https://alpha-alt-prod.convex.cloud",
      convexSiteUrl: "https://alpha-alt-prod.convex.site",
    });
  });

  it("treats a superseded attach as canceled instead of failed", async () => {
    const { ids, t } = await createConvexConnectedVault();
    await t.mutation(internal.vault.convexMutations.claimConvexDeploymentConnection, ids);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: Request) => {
        if (input.url.includes("/projects/1001")) {
          return jsonResponse(`{
            "createTime": 1710000000000,
            "id": 1001,
            "name": "Alpha Project",
            "slug": "alpha",
            "teamId": 1000,
            "teamSlug": "noter-team"
          }`);
        }

        if (input.url.includes("/deployments/alpha-prod")) {
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

        throw new Error(`Unexpected Convex request: ${input.url}`);
      }),
    );

    await expect(
      t.action(internal.vault.convex.ensureConvexDeploymentConnection, {
        ...ids,
        target: {
          mode: "connect_existing_deployment",
          projectId: "1001",
          deploymentName: "alpha-prod",
        },
      }),
    ).resolves.toBeNull();

    const result = await t.run(async (ctx) => {
      const [run, vault] = await Promise.all([ctx.db.get(ids.runId), ctx.db.get(ids.vaultId)]);
      const infrastructure = await ctx.db
        .query("vaultInfrastructure")
        .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
        .first();
      return { infrastructure, run, vault };
    });

    expect(result.run).toMatchObject({
      state: "canceled",
      currentStep: "claim_infra",
    });
    expect(result.vault).toMatchObject({
      convex: { state: "provisioning" },
    });
    expect(result.infrastructure).toBeNull();
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
            "teamSlug": "noter-team"
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
        currentStep: "ensure_convex",
        lastError: "Convex attach failed.",
        createdAt: 20,
        updatedAt: 25,
        completedAt: 25,
      });
    });
    await t.mutation(internal.vault.convexMutations.claimConvexDeploymentConnection, ids);

    await expect(
      t.action(internal.vault.convex.ensureConvexDeploymentConnection, {
        ...ids,
        target: {
          mode: "create_project",
          projectName: "alpha-project",
        },
      }),
    ).resolves.toBeNull();

    const vault = await t.run(async (ctx) => await ctx.db.get(ids.vaultId));
    expect(vault).toMatchObject({
      convex: {
        state: "connected",
        projectId: "1001",
        projectSlug: "alpha-project",
        deploymentName: "alpha-prod",
        origin: "provisioned",
      },
    });
    expect(requests.some((url) => url.includes("/create_project"))).toBe(false);
    expect(requests.some((url) => url.includes("/list_projects"))).toBe(false);
  });
});
