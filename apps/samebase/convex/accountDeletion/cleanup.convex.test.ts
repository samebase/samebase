import { describe, expect, it } from "vite-plus/test";

import { internal } from "../_generated/api";
import { makeConvexTest } from "../test.setup";
import { cleanupAccountLocalDataBatchForUser } from "./cleanup";

async function seedUser(t: ReturnType<typeof makeConvexTest>, email: string) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("users", { email, isApproved: true });
  });
}

async function runCleanup(
  t: ReturnType<typeof makeConvexTest>,
  userId: Awaited<ReturnType<typeof seedUser>>,
) {
  return await t.run(async (ctx) => {
    return await cleanupAccountLocalDataBatchForUser(ctx, { userId });
  });
}

describe("account-local deletion cleanup", () => {
  it("rejects workflow calls for scrubbed deletion receipts", async () => {
    const t = makeConvexTest();
    const runId = await t.run(async (ctx) => {
      return await ctx.db.insert("accountDeletionRuns", {
        identity: { state: "scrubbed" },
        state: "succeeded",
        currentStep: "finish",
        requestedAt: 1,
        updatedAt: 2,
        retryCount: 0,
        completedAt: 2,
        outcomes: {
          billing: { state: "not_applicable" },
          providerRevocation: { state: "not_applicable" },
          completionEmail: { state: "sent" },
        },
      });
    });

    await expect(
      t.mutation(internal.accountDeletion.cleanup.cleanupAccountLocalDataBatch, {
        runId,
        workflowId: "stale-workflow",
      }),
    ).rejects.toThrow("Account deletion workflow is not running.");
  });

  it("blocks while separately-authorized vault deletion is active", async () => {
    const t = makeConvexTest();
    const userId = await seedUser(t, "owner@example.com");
    const runId = await t.run(async (ctx) => {
      const vaultId = await ctx.db.insert("vaults", {
        userId,
        state: "not_connected",
        deletion: { state: "not_deleting" },
      });
      return await ctx.db.insert("vaultDeletionRuns", {
        userId,
        vaultId,
        repositoryFullName: "owner/repository",
        attempt: { kind: "initial" },
        state: "queued",
        workflow: { state: "not_started" },
        currentStep: "initialize_deletion",
        snapshot: {
          state: "retained_for_retry",
          plan: {
            target: {
              kind: "failed_repository_setup",
              githubMode: "connect_existing_repository",
              owner: "owner",
              name: "repository",
              repositoryFullName: "owner/repository",
            },
            codespaces: { action: "skip", reason: "not_requested" },
            convex: { action: "skip", reason: "not_requested" },
            cloudflare: { action: "skip", reason: "not_requested" },
            githubRepository: { action: "skip", reason: "not_requested" },
          },
        },
        createdAt: 1,
        updatedAt: 1,
      });
    });

    await expect(runCleanup(t, userId)).resolves.toEqual({
      state: "blocked",
      blocker: "active_vault_deletion",
      runId,
    });
  });

  it("does not delete rows while app provisioning can still write provider state", async () => {
    const t = makeConvexTest();
    const userId = await seedUser(t, "owner@example.com");
    const runId = await t.run(async (ctx) => {
      const vaultId = await ctx.db.insert("vaults", {
        userId,
        state: "not_connected",
        deletion: { state: "not_deleting" },
      });
      return await ctx.db.insert("appProvisioningRuns", {
        userId,
        vaultId,
        repositoryFullName: "owner/repository",
        trigger: "create",
        state: "running",
        currentStep: "claim_infra",
        createdAt: 1,
        updatedAt: 1,
      });
    });

    await expect(runCleanup(t, userId)).resolves.toEqual({
      state: "blocked",
      blocker: "active_app_provisioning",
      runId,
    });
  });

  it("deletes staged storage before its vault and proceeds in bounded batches", async () => {
    const t = makeConvexTest();
    const userId = await seedUser(t, "owner@example.com");
    const { storageId, vaultId } = await t.run(async (ctx) => {
      const vaultId = await ctx.db.insert("vaults", {
        userId,
        state: "not_connected",
        deletion: { state: "not_deleting" },
      });
      const storageId = await ctx.storage.store(new Blob(["private draft"]));
      await ctx.db.insert("fileStaging", {
        ownerId: userId,
        vaultId,
        fileDeleted: false,
        kind: "binary",
        filePath: "private.txt",
        initialFilePath: "private.txt",
        content: "",
        initialContent: "",
        storageId,
        parentCommitSha: null,
        lastEditTime: 1,
        lastEditUserId: userId,
        branch: "main",
        version: 1,
      });
      for (let index = 0; index < 30; index += 1) {
        await ctx.db.insert("connectedMachines", {
          userId,
          machineId: `machine-${index}`,
          displayName: `Machine ${index}`,
          hostname: `host-${index}`,
          os: "linux",
          status: "offline",
          lastSeenAt: 1,
          connectorVersion: "test",
          capabilities: ["presence"],
          allowedRoots: [],
        });
      }
      return { storageId, vaultId };
    });

    const first = await runCleanup(t, userId);
    expect(first).toEqual({ state: "needs_more", target: "vaults", rowsChanged: 1 });
    await t.run(async (ctx) => {
      expect(await ctx.db.get(vaultId)).not.toBeNull();
      expect(await ctx.storage.get(storageId)).toBeNull();
    });

    let result = first;
    for (let attempt = 0; attempt < 10 && result.state !== "done"; attempt += 1) {
      result = await runCleanup(t, userId);
    }
    expect(result).toEqual({ state: "done" });
    await t.run(async (ctx) => {
      expect(await ctx.db.get(vaultId)).toBeNull();
      expect(await ctx.db.query("connectedMachines").collect()).toEqual([]);
    });
  });

  it("removes MCP credentials before grants", async () => {
    const t = makeConvexTest();
    const userId = await seedUser(t, "owner@example.com");
    await t.run(async (ctx) => {
      await ctx.db.insert("mcpGrants", {
        grantId: "grant-1",
        userId,
        clientId: "client-1",
        resource: "https://samebase.com/mcp",
        scope: "mcp",
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("mcpAccessTokens", {
        tokenHash: "token-hash",
        grantId: "grant-1",
        clientId: "client-1",
        userId,
        resource: "https://samebase.com/mcp",
        scope: "mcp",
        createdAt: 1,
        expiresAt: 2,
      });
    });

    await expect(runCleanup(t, userId)).resolves.toEqual({
      state: "needs_more",
      target: "mcpAccessTokens",
      rowsChanged: 1,
    });
    await expect(runCleanup(t, userId)).resolves.toEqual({
      state: "needs_more",
      target: "mcpGrants",
      rowsChanged: 1,
    });
  });
});
