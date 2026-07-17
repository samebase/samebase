import { describe, expect, it } from "vite-plus/test";

import { internal } from "./_generated/api";
import { makeConvexTest } from "./test.setup";

async function createExistingRepositoryRun(args: {
  connected: boolean;
  currentStep: "connect_github" | "sync_tree";
}) {
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
      repositoryFullName: "ada/refresh-me",
      trigger: "connect_existing_repository",
      state: "running",
      currentStep: args.currentStep,
      createdAt: 1,
      updatedAt: 2,
    });
    if (args.connected) {
      await ctx.db.replace(vaultId, {
        userId,
        deletion: { state: "not_deleting" },
        state: "connected",
        githubMode: "connect_existing_repository",
        runId,
        ghRepoId: "123",
        owner: "ada",
        name: "refresh-me",
        defaultBranch: "main",
        visibility: "private",
        connectedAt: 3,
      });
    }
    return { runId, userId, vaultId };
  });

  return { ids, t };
}

describe("app provisioning runs", () => {
  it("completes an existing repository after its default tree sync", async () => {
    const { ids, t } = await createExistingRepositoryRun({
      connected: true,
      currentStep: "sync_tree",
    });

    await expect(
      t.mutation(internal.appProvisioningRuns.completeExistingRepositoryConnection, ids),
    ).resolves.toBeNull();

    await expect(t.run(async (ctx) => await ctx.db.get(ids.runId))).resolves.toMatchObject({
      state: "succeeded",
      currentStep: "finish",
    });
    await expect(
      t.run(async (ctx) =>
        ctx.db
          .query("appProvisioningEvents")
          .withIndex("by_run_and_created_at", (q) => q.eq("runId", ids.runId))
          .collect(),
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        step: "finish",
        level: "info",
        message: "Connected existing repository.",
      }),
    ]);
    await expect(
      t.run(async (ctx) => await ctx.db.query("repositoryRefreshRequests").collect()),
    ).resolves.toEqual([]);
  });

  it("rejects completion before the finish boundary", async () => {
    const { ids, t } = await createExistingRepositoryRun({
      connected: true,
      currentStep: "connect_github",
    });

    await expect(
      t.mutation(internal.appProvisioningRuns.completeExistingRepositoryConnection, ids),
    ).rejects.toThrow("Existing repository workflow has not reached the finish boundary.");
  });

  it("rejects completion before the vault is connected", async () => {
    const { ids, t } = await createExistingRepositoryRun({
      connected: false,
      currentStep: "sync_tree",
    });

    await expect(
      t.mutation(internal.appProvisioningRuns.completeExistingRepositoryConnection, ids),
    ).rejects.toThrow("Existing repository vault is not connected.");
  });
});
