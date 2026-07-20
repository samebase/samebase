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
  it("fails closed when multiple Convex projects are attached", async () => {
    const { ids, t } = await createConnectedVault();
    await t.run(async (ctx) => {
      for (const rootDirectory of ["apps/api", "apps/web"]) {
        const appId = await ctx.db.insert("vaultApps", {
          vaultId: ids.vaultId,
          userId: ids.userId,
          rootDirectory,
          createdAt: 30,
        });
        await ctx.db.insert("vaultConvexProjects", {
          vaultId: ids.vaultId,
          userId: ids.userId,
          appId,
          teamId: "team-id",
          projectId: `${rootDirectory}-project`,
          origin: "selected_existing",
          createdAt: 30,
        });
      }
    });

    await expect(
      t.action(internal.infraRead.getConvexDeploymentStatus, {
        vaultId: ids.vaultId,
      }),
    ).rejects.toThrow("Multiple Convex projects are attached.");
  });

  it("fails closed when multiple Cloudflare Workers are attached", async () => {
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
          origin: "selected_existing",
          createdAt: 30,
        });
      }
    });

    await expect(
      t.action(internal.infraRead.getCloudflareWorkerStatus, {
        vaultId: ids.vaultId,
      }),
    ).rejects.toThrow("Multiple Cloudflare Workers are attached.");
  });
});
