import { describe, expect, it } from "vite-plus/test";

import { internal } from "./_generated/api";
import { makeConvexTest } from "./test.setup";

describe("app provisioning workflow composition", () => {
  it("reads the planned app root and attached provider block state", async () => {
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
      await ctx.db.insert("vaultApps", {
        vaultId,
        userId,
        appRoot: ".",
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
      return { userId, vaultId };
    });

    await expect(
      t.query(internal.appProvisioningWorkflow.readComposedInfrastructureState, ids),
    ).resolves.toEqual({
      appRoot: ".",
      convex: {
        projectName: "composed-app",
        attached: false,
      },
      cloudflare: {
        accountId: "cloudflare-account",
        workerName: "composed-app",
        attached: false,
        buildsConnected: false,
        convexBuildAccessWired: false,
        workersDevUrl: null,
      },
    });

    await t.run(async (ctx) => {
      await ctx.db.insert("vaultConvexDeployments", {
        vaultId: ids.vaultId,
        userId: ids.userId,
        appRoot: ".",
        projectId: "convex-project",
        deploymentName: "composed-app-prod",
        origin: "provisioned",
        connectedAt: 40,
      });
      await ctx.db.insert("vaultCloudflareWorkers", {
        vaultId: ids.vaultId,
        userId: ids.userId,
        appRoot: ".",
        accountId: "cloudflare-account",
        workerName: "composed-app",
        workerTag: "composed-worker-tag",
        origin: "provisioned",
        connectedAt: 50,
      });
    });

    await expect(
      t.query(internal.appProvisioningWorkflow.readComposedInfrastructureState, ids),
    ).resolves.toEqual({
      appRoot: ".",
      convex: {
        projectName: "composed-app",
        attached: true,
      },
      cloudflare: {
        accountId: "cloudflare-account",
        workerName: "composed-app",
        attached: true,
        buildsConnected: false,
        convexBuildAccessWired: false,
        workersDevUrl: null,
      },
    });
  });
});
