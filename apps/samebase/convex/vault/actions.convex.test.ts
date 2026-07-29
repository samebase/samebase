import { describe, expect, it } from "vite-plus/test";

import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { makeConvexTest } from "../test.setup";

type ConvexTest = ReturnType<typeof makeConvexTest>;

async function createRecoveryFixture() {
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
      repositoryFullName: "ada/provider-recovery",
      trigger: "connect_existing_repository",
      state: "succeeded",
      currentStep: "finish",
      createdAt: 1,
      updatedAt: 2,
      completedAt: 2,
    });
    await ctx.db.replace(vaultId, {
      userId,
      deletion: { state: "not_deleting" },
      state: "connected",
      githubMode: "connect_existing_repository",
      runId,
      ghRepoId: "123",
      owner: "ada",
      name: "provider-recovery",
      visibility: "private",
      defaultBranch: "main",
      connectedAt: 2,
    });
    await ctx.db.insert("workflow_vaultProvisioning_writeLocks", {
      vaultId,
      owner: {
        kind: "manual_provider_write",
        actionId: "manual-action",
        target: {
          action: "create_convex_project",
          state: "requested",
          projectName: "provider-recovery",
          codeLocation: {
            kind: "config",
            convexConfigPath: "convex.json",
            blobSha: "config-blob",
          },
        },
        expiresAt: Date.now() - 1,
      },
      state: "recovery_required",
      lastWriteAt: {},
      updatedAt: Date.now(),
    });
    return { userId, vaultId };
  });

  return {
    asUser: t.withIdentity({
      subject: `${ids.userId}|test-session`,
      tokenIdentifier: `test:${ids.userId}`,
    }),
    ids,
    t,
  };
}

async function readProviderWriteState(
  t: ConvexTest,
  vaultId: Id<"vaults">,
): Promise<string | null> {
  return await t.run(async (ctx) => {
    const write = await ctx.db
      .query("workflow_vaultProvisioning_writeLocks")
      .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
      .unique();
    return write?.state ?? null;
  });
}

describe("provider write recovery action", () => {
  it("returns the provider error to browser and MCP callers", async () => {
    const { asUser, ids, t } = await createRecoveryFixture();

    await expect(
      asUser.action(api.vault.actions.retryProviderWriteRecovery, {
        vaultId: ids.vaultId,
      }),
    ).rejects.toThrow(/connection is required/);
    await expect(readProviderWriteState(t, ids.vaultId)).resolves.toBe("recovery_required");

    const mcpResult = await t.action(internal.toolRuntime.runtime.retryProviderWriteRecoveryTool, {
      userId: ids.userId,
      grantedScopes: ["access_provider_connections"],
      vaultId: ids.vaultId,
    });
    expect(mcpResult).toMatchObject({
      status: "error",
      text: expect.stringMatching(/connection is required/),
    });
    await expect(readProviderWriteState(t, ids.vaultId)).resolves.toBe("recovery_required");
  });
});
