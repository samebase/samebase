import { describe, expect, it } from "vite-plus/test";

import { internal } from "./_generated/api";
import { makeConvexTest } from "./test.setup";

type RetryBlocker = "none" | "queued_run" | "active_managed_lock" | "manual_write" | "deletion";

async function createRetryFixture(blocker: RetryBlocker) {
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
    const completedRunId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
      userId,
      vaultId,
      repositoryFullName: "ada/retry-guard",
      trigger: "create",
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
      githubMode: "create_repository",
      runId: completedRunId,
      ghRepoId: "github-repository",
      owner: "ada",
      name: "retry-guard",
      visibility: "private",
      defaultBranch: "main",
      connectedAt: 3,
    });

    switch (blocker) {
      case "none":
        break;
      case "queued_run":
        await ctx.db.insert("workflow_vaultProvisioning_runs", {
          userId,
          vaultId,
          repositoryFullName: "ada/retry-guard",
          trigger: "retry",
          state: "queued",
          currentStep: "run_created",
          createdAt: 10,
          updatedAt: 10,
        });
        break;
      case "active_managed_lock":
        await ctx.db.insert("workflow_vaultProvisioning_writeLocks", {
          vaultId,
          owner: { kind: "managed_run", runId: completedRunId },
          state: "active",
          lastWriteAt: {},
          updatedAt: 10,
        });
        break;
      case "manual_write":
        await ctx.db.insert("workflow_vaultProvisioning_writeLocks", {
          vaultId,
          owner: {
            kind: "manual_provider_write",
            actionId: "manual-action",
            target: {
              action: "create_convex_project",
              state: "requested",
              projectName: "manual-project",
              codeLocation: {
                kind: "config",
                convexConfigPath: "convex.json",
                blobSha: "convex-config-blob",
              },
            },
            expiresAt: 20,
          },
          state: "active",
          lastWriteAt: {},
          updatedAt: 10,
        });
        break;
      case "deletion": {
        const deletionRunId = await ctx.db.insert("workflow_vaultDeletion_runs", {
          state: "queued",
          userId,
          vaultId,
          repositoryFullName: "ada/retry-guard",
          createdAt: 10,
          updatedAt: 10,
          attempt: { kind: "initial" },
          workflow: { state: "not_started" },
          currentStep: "initialize_deletion",
          snapshot: {
            state: "retained_for_retry",
            plan: {
              target: {
                kind: "samebase_managed_repository",
                ghRepoId: "github-repository",
                owner: "ada",
                name: "retry-guard",
                repositoryFullName: "ada/retry-guard",
              },
              convex: { action: "skip", reason: "not_requested" },
              cloudflare: { action: "skip", reason: "not_requested" },
              githubRepository: { action: "skip", reason: "not_requested" },
            },
          },
        });
        await ctx.db.patch(vaultId, {
          deletion: {
            state: "deleting",
            runId: deletionRunId,
            requestedAt: 10,
          },
        });
        break;
      }
      default:
        blocker satisfies never;
    }

    return { userId, vaultId };
  });

  return { ids, t };
}

describe("app provisioning retry admission", () => {
  it.each([
    ["a queued managed run", "queued_run"],
    ["an active managed lock", "active_managed_lock"],
    ["an active manual write", "manual_write"],
    ["vault deletion", "deletion"],
  ] as const)("rejects retry while %s is active", async (_label, blocker) => {
    const { ids, t } = await createRetryFixture(blocker);

    await expect(
      t.mutation(internal.appProvisioningRuns.createForVault, {
        userId: ids.userId,
        vaultId: ids.vaultId,
        trigger: "retry",
      }),
    ).rejects.toThrow("Another vault infrastructure operation is active.");
  });

  it("admits only one of two simultaneous retries", async () => {
    const { ids, t } = await createRetryFixture("none");
    const args = {
      userId: ids.userId,
      vaultId: ids.vaultId,
      trigger: "retry" as const,
    };

    const results = await Promise.allSettled([
      t.mutation(internal.appProvisioningRuns.createForVault, args),
      t.mutation(internal.appProvisioningRuns.createForVault, args),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual(["fulfilled", "rejected"]);
    await expect(
      t.run(async (ctx) =>
        ctx.db
          .query("workflow_vaultProvisioning_runs")
          .withIndex("by_vault_and_state", (q) =>
            q.eq("vaultId", ids.vaultId).eq("state", "queued"),
          )
          .collect(),
      ),
    ).resolves.toHaveLength(1);
  });

  it("admits only one of a retry and vault deletion", async () => {
    const { ids, t } = await createRetryFixture("none");

    const results = await Promise.allSettled([
      t.mutation(internal.appProvisioningRuns.createForVault, {
        userId: ids.userId,
        vaultId: ids.vaultId,
        trigger: "retry",
      }),
      t.mutation(internal.vault.deletion.runs.createInitialRun, {
        userId: ids.userId,
        vaultId: ids.vaultId,
        options: {
          removeGithubRepo: false,
          removeConvexProvision: false,
          removeCloudflareProvision: false,
        },
      }),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual(["fulfilled", "rejected"]);
    const state = await t.run(async (ctx) => {
      const vault = await ctx.db.get(ids.vaultId);
      const queuedRuns = await ctx.db
        .query("workflow_vaultProvisioning_runs")
        .withIndex("by_vault_and_state", (q) => q.eq("vaultId", ids.vaultId).eq("state", "queued"))
        .collect();
      return { deletion: vault?.deletion, queuedRunCount: queuedRuns.length };
    });
    if (state.deletion?.state === "deleting") {
      expect(state.queuedRunCount).toBe(0);
    } else {
      expect(state.deletion).toEqual({ state: "not_deleting" });
      expect(state.queuedRunCount).toBe(1);
    }
  });
});
