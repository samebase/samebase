/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, it } from "vite-plus/test";

import { internal } from "./_generated/api";
import { makeConvexTest } from "./test.setup";
import schema from "./schema";

const modules = import.meta.glob([
  "./**/*.ts",
  "./_generated/*.js",
  "!./**/*.test.ts",
  "!./**/*.convex.test.ts",
  "!./**/*.generated.ts",
  "!./test.setup.ts",
]);

type RetryBlocker = "none" | "active_managed_lock" | "manual_write" | "deletion";

async function createRetryFixture(blocker: RetryBlocker, t = makeConvexTest()) {
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: "Ada",
      email: "ada@example.com",
      isApproved: true,
    });
    const organizationId = await ctx.db.insert("organizations", {
      githubInstallationId: "retry-guard-installation",
      githubOwnerId: "retry-guard-owner",
      githubOwnerLogin: "ada",
      githubOwnerLoginNormalized: "ada",
      githubOwnerType: "user",
    });
    await ctx.db.insert("organizationMemberships", { organizationId, userId, role: "owner" });
    const vaultId = await ctx.db.insert("vaults", {
      organizationId,
      deletion: { state: "not_deleting" },
      state: "not_connected",
    });
    const failedRunId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
      userId,
      vaultId,
      repositoryFullName: "ada/retry-guard",
      trigger: "create",
      state: "failed",
      currentStep: "attach_convex",
      lastError: "Convex setup failed.",
      createdAt: 1,
      updatedAt: 2,
      completedAt: 2,
    });
    await ctx.db.replace(vaultId, {
      organizationId,
      deletion: { state: "not_deleting" },
      state: "connected",
      githubMode: "create_repository",
      runId: failedRunId,
      ghRepoId: "github-repository",
      owner: "ada",
      name: "retry-guard",
      visibility: "private",
      defaultBranch: "main",
      connectedAt: 3,
    });

    switch (blocker) {
      case "none":
        await ctx.db.insert("workflow_vaultProvisioning_writeLocks", {
          vaultId,
          owner: { kind: "managed_run", runId: failedRunId },
          state: "failed",
          lastWriteAt: {},
          updatedAt: 10,
        });
        break;
      case "active_managed_lock":
        await ctx.db.insert("workflow_vaultProvisioning_writeLocks", {
          vaultId,
          owner: { kind: "managed_run", runId: failedRunId },
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
            action: "create_convex_project",
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
          organizationId,
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

    return { failedRunId, userId, vaultId };
  });

  return { ids, t };
}

describe("app provisioning retry admission", () => {
  it.each([
    [
      "an active managed lock",
      "active_managed_lock",
      "Another vault infrastructure operation is active.",
    ],
    ["an active manual write", "manual_write", "Another vault infrastructure operation is active."],
    ["vault deletion", "deletion", "Vault deletion is in progress."],
  ] as const)("rejects retry while %s is active", async (_label, blocker, message) => {
    const { ids, t } = await createRetryFixture(blocker);

    await expect(
      t.mutation(internal.appProvisioningRuns.createRetryForVault, {
        userId: ids.userId,
        vaultId: ids.vaultId,
      }),
    ).rejects.toThrow(message);
  });

  it("admits only one of two simultaneous retries", async () => {
    const { ids, t } = await createRetryFixture("none");
    const args = {
      userId: ids.userId,
      vaultId: ids.vaultId,
    };

    const results = await Promise.allSettled([
      t.mutation(internal.appProvisioningRuns.createRetryForVault, args),
      t.mutation(internal.appProvisioningRuns.createRetryForVault, args),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual(["fulfilled", "rejected"]);
    const admitted = await t.run(async (ctx) => {
      const queuedRuns = await ctx.db
        .query("workflow_vaultProvisioning_runs")
        .withIndex("by_vault_and_state", (q) => q.eq("vaultId", ids.vaultId).eq("state", "queued"))
        .collect();
      const writeLock = await ctx.db
        .query("workflow_vaultProvisioning_writeLocks")
        .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
        .unique();
      return { queuedRuns, writeLock };
    });
    expect(admitted.queuedRuns).toHaveLength(1);
    expect(admitted.queuedRuns[0]).toMatchObject({
      workflowId: expect.any(String),
    });
    expect(admitted.writeLock).toMatchObject({
      owner: { kind: "managed_run", runId: admitted.queuedRuns[0]?._id },
      state: "active",
    });
  });

  it("rolls back retry admission when Workflow start fails", async () => {
    const { ids, t } = await createRetryFixture("none", convexTest(schema, modules));

    await expect(
      t.mutation(internal.appProvisioningRuns.createRetryForVault, {
        userId: ids.userId,
        vaultId: ids.vaultId,
      }),
    ).rejects.toThrow();

    await expect(
      t.run(async (ctx) => {
        const runs = await ctx.db
          .query("workflow_vaultProvisioning_runs")
          .withIndex("by_vault_and_updated_at", (q) => q.eq("vaultId", ids.vaultId))
          .collect();
        const lock = await ctx.db
          .query("workflow_vaultProvisioning_writeLocks")
          .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
          .unique();
        return { runs, lock };
      }),
    ).resolves.toMatchObject({
      runs: [{ _id: ids.failedRunId, state: "failed" }],
      lock: {
        owner: { kind: "managed_run", runId: ids.failedRunId },
        state: "failed",
      },
    });
  });

  it("rejects retry after successful managed setup", async () => {
    const { ids, t } = await createRetryFixture("none");
    await t.run(async (ctx) => {
      const write = await ctx.db
        .query("workflow_vaultProvisioning_writeLocks")
        .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
        .unique();
      if (!write || write.owner.kind !== "managed_run") {
        throw new Error("Expected managed provider write.");
      }
      await Promise.all([
        ctx.db.patch(write.owner.runId, {
          state: "succeeded",
          currentStep: "finish",
          lastError: undefined,
        }),
        ctx.db.patch(write._id, {
          state: "succeeded",
        }),
      ]);
    });

    await expect(
      t.mutation(internal.appProvisioningRuns.createRetryForVault, {
        userId: ids.userId,
        vaultId: ids.vaultId,
      }),
    ).rejects.toThrow("Infrastructure retry is available only after managed setup fails.");
  });

  it("rejects retry after a manual action supersedes failed managed setup", async () => {
    const { ids, t } = await createRetryFixture("none");
    await t.mutation(internal.vault.infrastructureOperation.claimManualProviderWrite, {
      vaultId: ids.vaultId,
      userId: ids.userId,
      actionId: "manual-repair",
      action: "create_convex_project",
    });
    await t.mutation(internal.vault.infrastructureOperation.finishManualProviderWriteResult, {
      vaultId: ids.vaultId,
      actionId: "manual-repair",
      result: "succeeded",
    });

    await expect(
      t.mutation(internal.appProvisioningRuns.createRetryForVault, {
        userId: ids.userId,
        vaultId: ids.vaultId,
      }),
    ).rejects.toThrow("Infrastructure retry is available only after managed setup fails.");
  });

  it("rejects provider retry after source setup fails", async () => {
    const { ids, t } = await createRetryFixture("none");
    await t.run(async (ctx) => {
      const write = await ctx.db
        .query("workflow_vaultProvisioning_writeLocks")
        .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
        .unique();
      if (!write || write.owner.kind !== "managed_run") {
        throw new Error("Expected managed provider write.");
      }
      await ctx.db.patch(write.owner.runId, {
        currentStep: "sync_tree",
        lastError: "Source setup failed.",
      });
    });

    await expect(
      t.mutation(internal.appProvisioningRuns.createRetryForVault, {
        userId: ids.userId,
        vaultId: ids.vaultId,
      }),
    ).rejects.toThrow("Infrastructure retry is available only after provider setup fails.");
  });

  it("admits only one of a retry and vault deletion", async () => {
    const { ids, t } = await createRetryFixture("none");

    const results = await Promise.allSettled([
      t.mutation(internal.appProvisioningRuns.createRetryForVault, {
        userId: ids.userId,
        vaultId: ids.vaultId,
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
