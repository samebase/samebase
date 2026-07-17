import { describe, expect, it } from "vite-plus/test";

import { internal } from "./_generated/api";
import { makeConvexTest } from "./test.setup";

async function createConnectedVault() {
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
      repositoryFullName: "ada/monorepo",
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
      name: "monorepo",
      visibility: "private",
      defaultBranch: "main",
      connectedAt: 20,
    });
    const appId = await ctx.db.insert("vaultApps", {
      vaultId,
      userId,
      rootDirectory: "/",
      createdAt: 20,
    });
    return { appId, userId, vaultId };
  });
  return { ids, t };
}

describe("infra read app targeting", () => {
  it("fails closed when the recorded Convex deployment is missing upstream", async () => {
    const { ids, t } = await createConnectedVault();
    await t.run(async (ctx) => {
      await ctx.db.insert("vaultConvexDeployments", {
        vaultId: ids.vaultId,
        userId: ids.userId,
        appId: ids.appId,
        projectId: "deleted-project",
        teamSlug: "ada-team",
        projectSlug: "deleted-project",
        deploymentName: "deleted-prod",
        deploymentType: "prod",
        cloudUrl: "https://deleted.convex.cloud",
        siteUrl: "https://deleted.convex.site",
        previewDeployment: { state: "not_ensured" },
        origin: "selected_existing",
        upstream: { state: "missing_upstream" },
        connectedAt: 30,
        lastObservedAt: 30,
      });
    });

    await expect(
      t.action(internal.infraRead.getConvexDeploymentStatus, {
        vaultId: ids.vaultId,
      }),
    ).rejects.toThrow("Convex deployment is missing upstream");
  });

  it("fails closed when the recorded Worker is missing upstream", async () => {
    const { ids, t } = await createConnectedVault();
    await t.run(async (ctx) => {
      await ctx.db.insert("vaultCloudflareWorkers", {
        vaultId: ids.vaultId,
        userId: ids.userId,
        appId: ids.appId,
        accountId: "cloudflare-account",
        workerName: "deleted-worker",
        workerTag: "deleted-worker-tag",
        origin: "selected_existing",
        upstream: { state: "missing_upstream" },
        builds: { state: "not_connected" },
        connectedAt: 30,
        lastObservedAt: 30,
      });
    });

    await expect(
      t.action(internal.infraRead.getCloudflareWorkerStatus, {
        vaultId: ids.vaultId,
      }),
    ).rejects.toThrow("Cloudflare Worker is missing upstream");
  });

  it("fails closed when multiple Convex deployments are connected", async () => {
    const { ids, t } = await createConnectedVault();
    await t.run(async (ctx) => {
      for (const rootDirectory of ["apps/api", "apps/web"]) {
        const appId = await ctx.db.insert("vaultApps", {
          vaultId: ids.vaultId,
          userId: ids.userId,
          rootDirectory,
          createdAt: 30,
        });
        await ctx.db.insert("vaultConvexDeployments", {
          vaultId: ids.vaultId,
          userId: ids.userId,
          appId,
          projectId: `${rootDirectory}-project`,
          teamSlug: "ada-team",
          projectSlug: rootDirectory.replace("/", "-"),
          deploymentName: `${rootDirectory.replace("/", "-")}-prod`,
          deploymentType: "prod",
          cloudUrl: `https://${rootDirectory.replace("/", "-")}.convex.cloud`,
          siteUrl: `https://${rootDirectory.replace("/", "-")}.convex.site`,
          previewDeployment: { state: "not_ensured" },
          origin: "selected_existing",
          connectedAt: 30,
          lastObservedAt: 30,
        });
      }
    });

    await expect(
      t.action(internal.infraRead.getConvexDeploymentStatus, {
        vaultId: ids.vaultId,
      }),
    ).rejects.toThrow(
      "Production read is ambiguous because multiple Convex deployments are connected.",
    );
  });

  it("fails closed when multiple Cloudflare Workers are connected", async () => {
    const { ids, t } = await createConnectedVault();
    await t.run(async (ctx) => {
      for (const rootDirectory of ["apps/api", "apps/web"]) {
        const appId = await ctx.db.insert("vaultApps", {
          vaultId: ids.vaultId,
          userId: ids.userId,
          rootDirectory,
          createdAt: 30,
        });
        await ctx.db.insert("vaultCloudflareWorkers", {
          vaultId: ids.vaultId,
          userId: ids.userId,
          appId,
          accountId: "cloudflare-account",
          workerName: rootDirectory.replace("/", "-"),
          workerTag: `${rootDirectory.replace("/", "-")}-tag`,
          workersDevUrl: `https://${rootDirectory.replace("/", "-")}.nicu.workers.dev`,
          origin: "selected_existing",
          builds: { state: "not_connected" },
          connectedAt: 30,
          lastObservedAt: 30,
        });
      }
    });

    await expect(
      t.action(internal.infraRead.getCloudflareWorkerStatus, {
        vaultId: ids.vaultId,
      }),
    ).rejects.toThrow(
      "Production read is ambiguous because multiple Cloudflare Workers are connected.",
    );
  });
});
