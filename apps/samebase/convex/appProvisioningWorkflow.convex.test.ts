import { describe, expect, it } from "vite-plus/test";

import { internal } from "./_generated/api";
import { makeConvexTest } from "./test.setup";

describe("app provisioning workflow composition", () => {
  it("reads the target app root and attached provider block state", async () => {
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
      const runId = await ctx.db.insert("appProvisioningRuns", {
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
        ghRepoNodeId: "R_123",
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
      await ctx.db.insert("vaultInfrastructureTargets", {
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
        teamSlug: "ada-team",
        projectSlug: "composed-app",
        deploymentName: "composed-app-prod",
        deploymentType: "prod",
        cloudUrl: "https://composed-app-prod.convex.cloud",
        siteUrl: "https://composed-app-prod.convex.site",
        previewDeployment: {
          state: "ready",
          deploymentName: "composed-app-dev",
          cloudUrl: "https://composed-app-dev.convex.cloud",
        },
        deployKeys: {
          production: { state: "created", id: "prod-key" },
          preview: { state: "created", id: "preview-key" },
        },
        origin: "provisioned",
        connectedAt: 40,
        lastObservedAt: 40,
      });
      await ctx.db.insert("vaultCloudflareWorkers", {
        vaultId: ids.vaultId,
        userId: ids.userId,
        appRoot: ".",
        accountId: "cloudflare-account",
        workerName: "composed-app",
        workerTag: "composed-worker-tag",
        workersDevUrl: "https://composed-app.ada.workers.dev",
        origin: "provisioned",
        deployment: {
          builds: {
            state: "connected",
            rootDirectory: "/",
            buildCommand: "pnpm run build",
            deployCommand: "pnpm run deploy",
            previewDeployCommand: "pnpm run deploy:preview",
            pathIncludes: ["*"],
            pathExcludes: [],
            production: {
              triggerUuid: "production-trigger",
              buildTokenUuid: "build-token",
            },
            preview: {
              triggerUuid: "preview-trigger",
              buildTokenUuid: "build-token",
            },
          },
          convexBuildAccess: { state: "wired" },
        },
        connectedAt: 50,
        lastObservedAt: 50,
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
        buildsConnected: true,
        convexBuildAccessWired: true,
        workersDevUrl: "https://composed-app.ada.workers.dev",
      },
    });

    await t.run(async (ctx) => {
      const convexDeployment = await ctx.db
        .query("vaultConvexDeployments")
        .withIndex("by_vault_and_appRoot", (q) => q.eq("vaultId", ids.vaultId).eq("appRoot", "."))
        .first();
      if (!convexDeployment) {
        throw new Error("Expected Convex deployment.");
      }
      await ctx.db.patch(convexDeployment._id, {
        upstream: { state: "missing_upstream" },
      });
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
        attached: true,
        buildsConnected: true,
        convexBuildAccessWired: false,
        workersDevUrl: "https://composed-app.ada.workers.dev",
      },
    });

    await t.run(async (ctx) => {
      const worker = await ctx.db
        .query("vaultCloudflareWorkers")
        .withIndex("by_vault_and_appRoot", (q) => q.eq("vaultId", ids.vaultId).eq("appRoot", "."))
        .first();
      if (!worker) {
        throw new Error("Expected Cloudflare Worker.");
      }
      await ctx.db.patch(worker._id, {
        upstream: { state: "missing_upstream" },
      });
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
  });
});
