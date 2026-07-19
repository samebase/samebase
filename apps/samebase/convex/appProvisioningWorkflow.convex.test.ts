import { describe, expect, it } from "vite-plus/test";

import { internal } from "./_generated/api";
import { makeConvexTest } from "./test.setup";

async function createComposedVault() {
  const t = makeConvexTest();
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: "Ada",
      email: "ada@example.com",
      isApproved: true,
    });
    const vaultId = await ctx.db.insert("vaults", {
      userId,
      deletion: { state: "not_deleting" },
      state: "not_connected",
    });
    const runId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
      userId,
      vaultId,
      repositoryFullName: "ada/composed-app",
      trigger: "create",
      state: "running",
      currentStep: "sync_tree",
      createdAt: 10,
      updatedAt: 20,
    });
    await ctx.db.replace(vaultId, {
      userId,
      deletion: { state: "not_deleting" },
      state: "connected",
      githubMode: "create_repository",
      runId,
      ghRepoId: "123",
      owner: "ada",
      name: "composed-app",
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
    await ctx.db.insert("workflow_vaultProvisioning_plans", {
      vaultId,
      appRoot: ".",
      convex: {
        state: "planned",
        projectName: "composed-app",
      },
      cloudflare: {
        state: "planned",
        accountId: "cloudflare-account",
        workerName: "composed-app",
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
    return { appId, runId, userId, vaultId };
  });
  return { ids, t };
}

describe("app provisioning workflow composition", () => {
  it("maps the legacy root plan to the repository-root app and reads attachments", async () => {
    const { ids, t } = await createComposedVault();

    await expect(
      t.query(internal.appProvisioningWorkflow.readComposedInfrastructureState, {
        userId: ids.userId,
        vaultId: ids.vaultId,
      }),
    ).resolves.toEqual({
      appId: ids.appId,
      appRoot: ".",
      convex: {
        projectName: "composed-app",
        attached: false,
      },
      cloudflare: {
        accountId: "cloudflare-account",
        workerName: "composed-app",
        attached: false,
      },
    });

    await t.run(async (ctx) => {
      await ctx.db.insert("vaultConvexProjects", {
        vaultId: ids.vaultId,
        userId: ids.userId,
        appId: ids.appId,
        teamId: "convex-team",
        projectId: "convex-project",
        origin: "provisioned",
        createdAt: 40,
      });
      await ctx.db.insert("vaultCloudflareWorkers", {
        vaultId: ids.vaultId,
        userId: ids.userId,
        appId: ids.appId,
        accountId: "cloudflare-account",
        workerName: "composed-app",
        workerTag: "composed-worker-tag",
        origin: "provisioned",
        createdAt: 50,
      });
    });

    await expect(
      t.query(internal.appProvisioningWorkflow.readComposedInfrastructureState, {
        userId: ids.userId,
        vaultId: ids.vaultId,
      }),
    ).resolves.toMatchObject({
      convex: { attached: true },
      cloudflare: { attached: true },
    });
  });

  it("never takes an active provisioning lock from another run", async () => {
    const { ids, t } = await createComposedVault();
    const retryRunId = await t.run(async (ctx) => {
      await ctx.db.insert("workflow_vaultProvisioning_writeLocks", {
        vaultId: ids.vaultId,
        runId: ids.runId,
        state: "active",
        updatedAt: 0,
      });
      return await ctx.db.insert("workflow_vaultProvisioning_runs", {
        userId: ids.userId,
        vaultId: ids.vaultId,
        repositoryFullName: "ada/composed-app",
        trigger: "retry",
        state: "running",
        currentStep: "claim_infra",
        createdAt: 100,
        updatedAt: 100,
      });
    });

    await expect(
      t.mutation(internal.appProvisioningWorkflow.claimComposedInfrastructureProvisioning, {
        userId: ids.userId,
        vaultId: ids.vaultId,
        runId: retryRunId,
      }),
    ).resolves.toEqual({ claimed: false });

    await expect(
      t.run(async (ctx) =>
        await ctx.db
          .query("workflow_vaultProvisioning_writeLocks")
          .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
          .unique(),
      ),
    ).resolves.toMatchObject({ runId: ids.runId, state: "active" });
  });
});
