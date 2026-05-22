import { describe, expect, it } from "vite-plus/test";

import { internal } from "../_generated/api";
import { makeConvexTest } from "../test.setup";

async function createAttachableVaultWithOwnership(args: { ownershipState: "active" | "failed" }) {
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
    const runState = args.ownershipState === "active" ? "running" : "failed";
    const runId = await ctx.db.insert("appProvisioningRuns", {
      userId,
      vaultId,
      repositoryFullName: "ada/manual-cloudflare",
      trigger: "retry",
      state: runState,
      currentStep: "ensure_cloudflare",
      createdAt: 10,
      updatedAt: 20,
      ...(runState === "failed" ? { lastError: "Cloudflare provisioning failed." } : {}),
    });
    await ctx.db.replace(vaultId, {
      userId,
      deletion: { state: "not_deleting" },
      state: "connected",
      githubMode: "create_repository",
      runId,
      ghRepoId: "123",
      owner: "ada",
      name: "manual-cloudflare",
      visibility: "private",
      defaultBranch: "main",
      connectedAt: 12,
      convex: {
        state: "connected",
        projectId: "convex-project",
        projectSlug: "manual-cloudflare",
        deploymentName: "manual-cloudflare-prod",
        connectedAt: 14,
      },
      cloudflare: { state: "not_configured" },
    });
    await ctx.db.insert("vaultInfrastructureOwnership", {
      vaultId,
      runId,
      provisioningVersion: 2,
      state: args.ownershipState,
      updatedAt: 20,
    });

    return { userId, vaultId };
  });

  return { ids, t };
}

describe("vault Cloudflare attachment mutations", () => {
  it("rejects manual attachment while infrastructure ownership is active", async () => {
    const { ids, t } = await createAttachableVaultWithOwnership({
      ownershipState: "active",
    });

    await expect(
      t.query(internal.vault.cloudflareMutations.requireAttachableVault, ids),
    ).rejects.toThrow("Cloudflare provisioning is already running.");
    await expect(
      t.mutation(internal.vault.cloudflareMutations.attachWorker, {
        ...ids,
        accountId: "cloudflare-account",
        workerName: "manual-cloudflare-worker",
        workerTag: "manual-cloudflare-worker-tag",
        origin: "selected_existing",
      }),
    ).rejects.toThrow("Cloudflare provisioning is already running.");
  });

  it("allows manual recovery after failed infrastructure ownership", async () => {
    const { ids, t } = await createAttachableVaultWithOwnership({
      ownershipState: "failed",
    });

    await expect(
      t.query(internal.vault.cloudflareMutations.requireAttachableVault, ids),
    ).resolves.toBeNull();
    await expect(
      t.mutation(internal.vault.cloudflareMutations.attachWorker, {
        ...ids,
        accountId: "cloudflare-account",
        workerName: "manual-cloudflare-worker",
        workerTag: "manual-cloudflare-worker-tag",
        origin: "selected_existing",
      }),
    ).resolves.toBeNull();

    const vault = await t.run(async (ctx) => await ctx.db.get(ids.vaultId));

    expect(vault).toMatchObject({
      cloudflare: {
        state: "connected",
        accountId: "cloudflare-account",
        workerName: "manual-cloudflare-worker",
        workerTag: "manual-cloudflare-worker-tag",
        origin: "selected_existing",
      },
    });
  });
});
