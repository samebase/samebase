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
    const runId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
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
    return { userId, vaultId };
  });
  return { ids, t };
}

describe("infra read app-root targeting", () => {
  it("requires a Convex deployment attachment", async () => {
    const { ids, t } = await createConnectedVault();

    await expect(
      t.action(internal.infraRead.getConvexDeploymentStatus, {
        vaultId: ids.vaultId,
      }),
    ).rejects.toThrow("Infrastructure not found");
  });

  it("requires a Cloudflare Worker attachment", async () => {
    const { ids, t } = await createConnectedVault();

    await expect(
      t.action(internal.infraRead.getCloudflareWorkerStatus, {
        vaultId: ids.vaultId,
      }),
    ).rejects.toThrow("Infrastructure not found");
  });

  it("fails closed when multiple Convex deployments are connected", async () => {
    const { ids, t } = await createConnectedVault();
    await t.run(async (ctx) => {
      for (const appRoot of ["apps/api", "apps/web"]) {
        await ctx.db.insert("vaultConvexDeployments", {
          vaultId: ids.vaultId,
          userId: ids.userId,
          appRoot,
          projectId: `${appRoot}-project`,
          deploymentName: `${appRoot.replace("/", "-")}-prod`,
          origin: "selected_existing",
          connectedAt: 30,
        });
      }
    });

    await expect(
      t.action(internal.infraRead.getConvexDeploymentStatus, {
        vaultId: ids.vaultId,
      }),
    ).rejects.toThrow("Multiple Convex deployments are connected.");
  });

  it("fails closed when multiple Cloudflare Workers are connected", async () => {
    const { ids, t } = await createConnectedVault();
    await t.run(async (ctx) => {
      for (const appRoot of ["apps/api", "apps/web"]) {
        await ctx.db.insert("vaultCloudflareWorkers", {
          vaultId: ids.vaultId,
          userId: ids.userId,
          appRoot,
          accountId: "cloudflare-account",
          workerName: appRoot.replace("/", "-"),
          workerTag: `${appRoot.replace("/", "-")}-tag`,
          origin: "selected_existing",
          connectedAt: 30,
        });
      }
    });

    await expect(
      t.action(internal.infraRead.getCloudflareWorkerStatus, {
        vaultId: ids.vaultId,
      }),
    ).rejects.toThrow("Multiple Cloudflare Workers are connected.");
  });
});
