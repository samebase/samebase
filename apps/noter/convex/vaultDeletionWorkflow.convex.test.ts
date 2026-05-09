import { describe, expect, it } from "vite-plus/test";

import { api, internal } from "./_generated/api";
import { makeConvexTest } from "./test.setup";
import { VAULT_LOCAL_CLEANUP_BATCH_SIZE } from "./vaultDeletionCleanup";

describe("vault deletion workflow", () => {
  it("queues a durable run and gate before scheduled workflow work", async () => {
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
        repositoryFullName: "ada/delete-me",
        trigger: "create",
        state: "succeeded",
        currentStep: "finish",
        createdAt: 1,
        updatedAt: 2,
        completedAt: 3,
      });
      await ctx.db.replace(vaultId, {
        userId,
        deletion: { state: "not_deleting" },
        state: "connected",
        githubMode: "create_repository",
        runId,
        ghRepoId: "123",
        owner: "ada",
        name: "delete-me",
        defaultBranch: "main",
        visibility: "private",
        convex: { state: "not_configured" },
        cloudflare: { state: "not_configured" },
        connectedAt: 4,
      });
      await ctx.db.insert("vaultBranchTrees", {
        vaultId,
        branch: "main",
        treeSHA: "tree",
        treeData: {
          sha: "tree",
          truncated: false,
          tree: [],
        },
        lastTreeRefreshAt: 5,
      });

      return { userId, vaultId };
    });

    const asUser = t.withIdentity({
      subject: `${ids.userId}|test-session`,
      tokenIdentifier: `test:${ids.userId}`,
    });
    const { deletionRunId } = await asUser.action(
      api.vaultActions.deleteVault,
      {
        vaultId: ids.vaultId,
        removeCodespaces: false,
        removeGithubRepo: false,
        removeConvexProvision: false,
        removeCloudflareProvision: false,
      },
    );

    const queued = await t.run(async (ctx) => {
      return {
        run: await ctx.db.get(deletionRunId),
        vault: await ctx.db.get(ids.vaultId),
        events: await ctx.db
          .query("vaultDeletionEvents")
          .withIndex("by_run_and_created_at", (q) =>
            q.eq("runId", deletionRunId),
          )
          .collect(),
      };
    });

    expect(queued.vault?.deletion).toMatchObject({
      state: "deleting",
      runId: deletionRunId,
    });
    expect(queued.run).toMatchObject({
      state: "running",
      repositoryFullName: "ada/delete-me",
      snapshot: {
        state: "retained_for_retry",
        plan: {
          target: {
            kind: "noter_managed_repository",
            ghRepoId: "123",
          },
          githubRepository: {
            action: "skip",
            reason: "not_requested",
          },
        },
      },
    });
    expect(queued.events.map((event) => event.step)).toContain(
      "initialize_deletion",
    );

    expect(queued.vault).toMatchObject({ _id: ids.vaultId });
  });

  it("finishes local cleanup through workflow cleanup batches", async () => {
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
        repositoryFullName: "ada/delete-me",
        trigger: "create",
        state: "succeeded",
        currentStep: "finish",
        createdAt: 1,
        updatedAt: 2,
        completedAt: 3,
      });
      await ctx.db.replace(vaultId, {
        userId,
        deletion: { state: "not_deleting" },
        state: "connected",
        githubMode: "create_repository",
        runId,
        ghRepoId: "123",
        owner: "ada",
        name: "delete-me",
        defaultBranch: "main",
        visibility: "private",
        convex: { state: "not_configured" },
        cloudflare: { state: "not_configured" },
        connectedAt: 4,
      });
      for (
        let index = 0;
        index < VAULT_LOCAL_CLEANUP_BATCH_SIZE + 1;
        index += 1
      ) {
        await ctx.db.insert("vaultBranchTrees", {
          vaultId,
          branch: `branch-${index}`,
          treeSHA: `tree-${index}`,
          treeData: {
            sha: `tree-${index}`,
            truncated: false,
            tree: [],
          },
          lastTreeRefreshAt: 5 + index,
        });
      }

      return { userId, vaultId };
    });
    const { deletionRunId } = await t.mutation(
      internal.vaultDeletionRuns.createInitialRun,
      {
        userId: ids.userId,
        vaultId: ids.vaultId,
        options: {
          removeCodespaces: false,
          removeGithubRepo: false,
          removeConvexProvision: false,
          removeCloudflareProvision: false,
        },
      },
    );
    await t.mutation(internal.vaultDeletionRuns.markWorkflowStarted, {
      runId: deletionRunId,
      workflowId: "workflow-test",
    });
    await t.mutation(internal.vaultDeletionRuns.claimWorkflowRun, {
      runId: deletionRunId,
      vaultId: ids.vaultId,
      userId: ids.userId,
    });
    let sourceCleanupBatches = 0;
    for (const step of [
      "cleanup_editor_state",
      "cleanup_source_caches",
      "cleanup_runtime_state",
      "cleanup_access_state",
      "detach_agent_context",
      "cleanup_provisioning_history",
    ] as const) {
      await t.mutation(internal.vaultDeletionRuns.appendRunEvent, {
        runId: deletionRunId,
        step,
        level: "info",
        message: "Cleaning vault data.",
        state: "running",
      });

      let cleanupResult = await t.mutation(
        internal.vaultDeletionCleanup.cleanupVaultLocalDataStepBatch,
        {
          vaultId: ids.vaultId,
          userId: ids.userId,
          step,
        },
      );
      if (step === "cleanup_source_caches") {
        sourceCleanupBatches += 1;
      }

      for (; cleanupResult.state === "needs_more"; ) {
        cleanupResult = await t.mutation(
          internal.vaultDeletionCleanup.cleanupVaultLocalDataStepBatch,
          {
            vaultId: ids.vaultId,
            userId: ids.userId,
            step,
          },
        );
        if (step === "cleanup_source_caches") {
          sourceCleanupBatches += 1;
        }
      }
    }
    await t.mutation(internal.vaultDeletionRuns.appendRunEvent, {
      runId: deletionRunId,
      step: "delete_vault",
      level: "info",
      message: "Removing vault.",
      state: "running",
    });
    await t.mutation(internal.vaultDeletionCleanup.deleteVaultRow, {
      vaultId: ids.vaultId,
      userId: ids.userId,
    });
    await t.mutation(internal.vaultDeletionRuns.finishWorkflowRun, {
      runId: deletionRunId,
    });

    const completed = await t.run(async (ctx) => {
      return {
        run: await ctx.db.get(deletionRunId),
        vault: await ctx.db.get(ids.vaultId),
        branchTrees: await ctx.db
          .query("vaultBranchTrees")
          .withIndex("by_vault_and_branch", (q) => q.eq("vaultId", ids.vaultId))
          .collect(),
        events: await ctx.db
          .query("vaultDeletionEvents")
          .withIndex("by_run_and_created_at", (q) =>
            q.eq("runId", deletionRunId),
          )
          .collect(),
      };
    });

    expect(completed.vault).toBeNull();
    expect(completed.branchTrees).toHaveLength(0);
    expect(sourceCleanupBatches).toBeGreaterThan(1);
    expect(completed.run).toMatchObject({
      state: "succeeded",
      currentStep: "finish",
      snapshot: { state: "scrubbed_after_success" },
    });
    expect(completed.events.map((event) => event.step)).toEqual(
      expect.arrayContaining(["lock_vault", "delete_vault", "finish"]),
    );
  });

  it("rejects source provisioning before creating a deletion run", async () => {
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
        repositoryFullName: "ada/provisioning",
        trigger: "create",
        state: "running",
        currentStep: "create_github_repo",
        createdAt: 1,
        updatedAt: 2,
      });
      await ctx.db.replace(vaultId, {
        userId,
        deletion: { state: "not_deleting" },
        state: "provisioning",
        githubMode: "create_repository",
        runId,
        startedAt: 3,
        owner: "ada",
        name: "provisioning",
        visibility: "private",
      });

      return { userId, vaultId };
    });

    await expect(
      t.mutation(internal.vaultDeletionRuns.createInitialRun, {
        userId: ids.userId,
        vaultId: ids.vaultId,
        options: {
          removeCodespaces: false,
          removeGithubRepo: false,
          removeConvexProvision: false,
          removeCloudflareProvision: false,
        },
      }),
    ).rejects.toThrow("source setup is still running");

    const snapshot = await t.run(async (ctx) => {
      const vault = await ctx.db.get(ids.vaultId);
      const runs = await ctx.db
        .query("vaultDeletionRuns")
        .withIndex("by_vault_and_updated_at", (q) =>
          q.eq("vaultId", ids.vaultId),
        )
        .collect();
      return { runs, vault };
    });
    expect(snapshot.vault?.deletion).toEqual({ state: "not_deleting" });
    expect(snapshot.runs).toHaveLength(0);
  });

  it("rejects GitHub repository deletion for existing-repository vaults", async () => {
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
        repositoryFullName: "ada/existing",
        trigger: "connect_existing_repository",
        state: "succeeded",
        currentStep: "finish",
        createdAt: 1,
        updatedAt: 2,
        completedAt: 3,
      });
      await ctx.db.replace(vaultId, {
        userId,
        deletion: { state: "not_deleting" },
        state: "connected",
        githubMode: "connect_existing_repository",
        runId,
        ghRepoId: "456",
        owner: "ada",
        name: "existing",
        defaultBranch: "main",
        visibility: "private",
        convex: { state: "not_configured" },
        cloudflare: { state: "not_configured" },
        connectedAt: 4,
      });

      return { userId, vaultId };
    });

    await expect(
      t.mutation(internal.vaultDeletionRuns.createInitialRun, {
        userId: ids.userId,
        vaultId: ids.vaultId,
        options: {
          removeCodespaces: false,
          removeGithubRepo: true,
          removeConvexProvision: false,
          removeCloudflareProvision: false,
        },
      }),
    ).rejects.toThrow("cannot remove the GitHub repository");
  });

  it("requires GitHub before accepting Codespaces cleanup", async () => {
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
        repositoryFullName: "ada/codespaces",
        trigger: "create",
        state: "succeeded",
        currentStep: "finish",
        createdAt: 1,
        updatedAt: 2,
        completedAt: 3,
      });
      await ctx.db.replace(vaultId, {
        userId,
        deletion: { state: "not_deleting" },
        state: "connected",
        githubMode: "create_repository",
        runId,
        ghRepoId: "789",
        owner: "ada",
        name: "codespaces",
        defaultBranch: "main",
        visibility: "private",
        convex: { state: "not_configured" },
        cloudflare: { state: "not_configured" },
        connectedAt: 4,
      });

      return { userId, vaultId };
    });

    await expect(
      t.mutation(internal.vaultDeletionRuns.createInitialRun, {
        userId: ids.userId,
        vaultId: ids.vaultId,
        options: {
          removeCodespaces: true,
          removeGithubRepo: false,
          removeConvexProvision: false,
          removeCloudflareProvision: false,
        },
      }),
    ).rejects.toThrow("GitHub is not connected.");

    const snapshot = await t.run(async (ctx) => {
      const vault = await ctx.db.get(ids.vaultId);
      const runs = await ctx.db
        .query("vaultDeletionRuns")
        .withIndex("by_vault_and_updated_at", (q) =>
          q.eq("vaultId", ids.vaultId),
        )
        .collect();
      return { runs, vault };
    });
    expect(snapshot.vault?.deletion).toEqual({ state: "not_deleting" });
    expect(snapshot.runs).toHaveLength(0);
  });

  it("retries a failed retained snapshot with a new run", async () => {
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
      const setupRunId = await ctx.db.insert("appProvisioningRuns", {
        userId,
        vaultId,
        repositoryFullName: "ada/retry-me",
        trigger: "create",
        state: "succeeded",
        currentStep: "finish",
        createdAt: 1,
        updatedAt: 2,
        completedAt: 3,
      });
      await ctx.db.replace(vaultId, {
        userId,
        deletion: { state: "not_deleting" },
        state: "connected",
        githubMode: "create_repository",
        runId: setupRunId,
        ghRepoId: "789",
        owner: "ada",
        name: "retry-me",
        defaultBranch: "main",
        visibility: "private",
        convex: { state: "not_configured" },
        cloudflare: { state: "not_configured" },
        connectedAt: 4,
      });

      return { userId, vaultId };
    });
    const initial = await t.mutation(
      internal.vaultDeletionRuns.createInitialRun,
      {
        userId: ids.userId,
        vaultId: ids.vaultId,
        options: {
          removeCodespaces: false,
          removeGithubRepo: false,
          removeConvexProvision: false,
          removeCloudflareProvision: false,
        },
      },
    );
    await t.mutation(internal.vaultDeletionRuns.markWorkflowFailed, {
      runId: initial.deletionRunId,
      message: "Provider cleanup failed.",
    });

    const asUser = t.withIdentity({
      subject: `${ids.userId}|test-session`,
      tokenIdentifier: `test:${ids.userId}`,
    });
    const retry = await asUser.action(api.vaultActions.retryDeleteVault, {
      runId: initial.deletionRunId,
    });

    const snapshot = await t.run(async (ctx) => {
      return {
        failedRun: await ctx.db.get(initial.deletionRunId),
        retryRun: await ctx.db.get(retry.deletionRunId),
        vault: await ctx.db.get(ids.vaultId),
      };
    });

    expect(snapshot.failedRun).toMatchObject({
      state: "failed",
      snapshot: { state: "retained_for_retry" },
    });
    expect(snapshot.retryRun).toMatchObject({
      state: "running",
      attempt: {
        kind: "retry",
        retryOf: initial.deletionRunId,
      },
      snapshot: { state: "retained_for_retry" },
    });
    expect(snapshot.vault?.deletion).toMatchObject({
      state: "deleting",
      runId: retry.deletionRunId,
    });
  });

  it("rejects a retry when retained provider connections are missing", async () => {
    const t = makeConvexTest();
    const ids = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "Ada",
        email: "ada@example.com",
        isApproved: true,
      });
      const githubConnectionId = await ctx.db.insert("providerConnections", {
        kind: "github",
        userId,
        auth: {
          method: "api_key",
          credential: "test-github-api-key",
        },
        username: "ada",
        createdAt: 1,
        updatedAt: 2,
      });
      const vaultId = await ctx.db.insert("vaults", {
        userId,
        deletion: { state: "not_deleting" },
        state: "not_connected",
      });
      const setupRunId = await ctx.db.insert("appProvisioningRuns", {
        userId,
        vaultId,
        repositoryFullName: "ada/retry-missing-provider",
        trigger: "create",
        state: "succeeded",
        currentStep: "finish",
        createdAt: 3,
        updatedAt: 4,
        completedAt: 5,
      });
      await ctx.db.replace(vaultId, {
        userId,
        deletion: { state: "not_deleting" },
        state: "connected",
        githubMode: "create_repository",
        runId: setupRunId,
        ghRepoId: "789",
        owner: "ada",
        name: "retry-missing-provider",
        defaultBranch: "main",
        visibility: "private",
        convex: { state: "not_configured" },
        cloudflare: { state: "not_configured" },
        connectedAt: 6,
      });

      return { githubConnectionId, userId, vaultId };
    });
    const initial = await t.mutation(
      internal.vaultDeletionRuns.createInitialRun,
      {
        userId: ids.userId,
        vaultId: ids.vaultId,
        options: {
          removeCodespaces: false,
          removeGithubRepo: true,
          removeConvexProvision: false,
          removeCloudflareProvision: false,
        },
      },
    );
    await t.mutation(internal.vaultDeletionRuns.markWorkflowFailed, {
      runId: initial.deletionRunId,
      message: "Provider cleanup failed.",
    });
    await t.run(async (ctx) => {
      await ctx.db.delete(ids.githubConnectionId);
    });

    await expect(
      t.mutation(internal.vaultDeletionRuns.createRetryRun, {
        userId: ids.userId,
        failedRunId: initial.deletionRunId,
      }),
    ).rejects.toThrow("GitHub is not connected.");

    const snapshot = await t.run(async (ctx) => {
      const vault = await ctx.db.get(ids.vaultId);
      const runs = await ctx.db
        .query("vaultDeletionRuns")
        .withIndex("by_vault_and_updated_at", (q) =>
          q.eq("vaultId", ids.vaultId),
        )
        .collect();
      return { runs, vault };
    });
    expect(snapshot.vault?.deletion).toMatchObject({
      state: "delete_failed",
      runId: initial.deletionRunId,
    });
    expect(snapshot.runs).toHaveLength(1);
  });
});
