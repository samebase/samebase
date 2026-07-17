import { describe, expect, it } from "vite-plus/test";

import { internal } from "./_generated/api";
import { makeConvexTest } from "./test.setup";

describe("app provisioning workflow composition", () => {
  it("reads the target app and explicit provider dependency state", async () => {
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
      await ctx.db.insert("vaultInfrastructureTargets", {
        vaultId,
        appId,
        convex: {
          projectName: "composed-app",
        },
        cloudflare: {
          accountId: "cloudflare-account",
          workerName: "composed-app",
        },
        createdAt: 30,
      });
      return { appId, userId, vaultId };
    });

    await expect(
      t.query(internal.appProvisioningWorkflow.readComposedInfrastructureState, {
        userId: ids.userId,
        vaultId: ids.vaultId,
      }),
    ).resolves.toEqual({
      appId: ids.appId,
      convex: {
        state: "not_attached",
        projectName: "composed-app",
      },
      cloudflare: {
        state: "not_attached",
        accountId: "cloudflare-account",
        workerName: "composed-app",
      },
    });

    const providerIds = await t.run(async (ctx) => {
      const convexDeploymentId = await ctx.db.insert("vaultConvexDeployments", {
        vaultId: ids.vaultId,
        userId: ids.userId,
        appId: ids.appId,
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
        origin: "provisioned",
        connectedAt: 40,
        lastObservedAt: 40,
      });
      const workerId = await ctx.db.insert("vaultCloudflareWorkers", {
        vaultId: ids.vaultId,
        userId: ids.userId,
        appId: ids.appId,
        accountId: "cloudflare-account",
        workerName: "composed-app",
        workerTag: "composed-worker-tag",
        workersDevUrl: "https://composed-app.ada.workers.dev",
        origin: "provisioned",
        builds: {
          state: "connected",
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
        connectedAt: 50,
        lastObservedAt: 50,
      });
      await ctx.db.insert("vaultWorkerDeploymentDependencies", {
        vaultId: ids.vaultId,
        userId: ids.userId,
        workerId,
        convexDeploymentId,
        wiring: {
          state: "wired",
          deployKeys: {
            production: {
              state: "created",
              name: "prod-key",
              deploymentName: "composed-app-prod",
            },
            preview: {
              state: "created",
              name: "preview-key",
              projectId: "convex-project",
            },
          },
        },
        createdAt: 50,
        updatedAt: 50,
      });
      return { convexDeploymentId, workerId };
    });

    await expect(
      t.query(internal.appProvisioningWorkflow.readComposedInfrastructureState, {
        userId: ids.userId,
        vaultId: ids.vaultId,
      }),
    ).resolves.toEqual({
      appId: ids.appId,
      convex: {
        state: "attached",
        projectName: "composed-app",
        deploymentId: providerIds.convexDeploymentId,
      },
      cloudflare: {
        state: "attached",
        accountId: "cloudflare-account",
        workerName: "composed-app",
        workerId: providerIds.workerId,
        convexBuildAccessWired: true,
        workersDevUrl: "https://composed-app.ada.workers.dev",
      },
    });

    await t.run(async (ctx) => {
      const convexDeployment = await ctx.db.get(providerIds.convexDeploymentId);
      if (!convexDeployment) {
        throw new Error("Expected Convex deployment.");
      }
      await ctx.db.patch(convexDeployment._id, {
        upstream: { state: "missing_upstream" },
      });
    });

    await expect(
      t.query(internal.appProvisioningWorkflow.readComposedInfrastructureState, {
        userId: ids.userId,
        vaultId: ids.vaultId,
      }),
    ).resolves.toEqual({
      appId: ids.appId,
      convex: {
        state: "not_attached",
        projectName: "composed-app",
      },
      cloudflare: {
        state: "attached",
        accountId: "cloudflare-account",
        workerName: "composed-app",
        workerId: providerIds.workerId,
        convexBuildAccessWired: false,
        workersDevUrl: "https://composed-app.ada.workers.dev",
      },
    });

    await t.run(async (ctx) => {
      const worker = await ctx.db.get(providerIds.workerId);
      if (!worker) {
        throw new Error("Expected Cloudflare Worker.");
      }
      await ctx.db.patch(worker._id, {
        upstream: { state: "missing_upstream" },
      });
    });

    await expect(
      t.query(internal.appProvisioningWorkflow.readComposedInfrastructureState, {
        userId: ids.userId,
        vaultId: ids.vaultId,
      }),
    ).resolves.toEqual({
      appId: ids.appId,
      convex: {
        state: "not_attached",
        projectName: "composed-app",
      },
      cloudflare: {
        state: "not_attached",
        accountId: "cloudflare-account",
        workerName: "composed-app",
      },
    });
  });
});
