/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, it } from "vite-plus/test";

import { internal } from "./_generated/api";
import { insertTestOrganizationBillingAccount, makeConvexTest } from "./test.setup";
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
      state: "active",
      name: "Ada",
      email: "ada@example.com",
      isApproved: true,
      termsVersion: "2026-08-12",
      termsAcceptedAt: 1,
    });
    const organizationId = await ctx.db.insert("organizations", {
      githubInstallationId: "retry-guard-installation",
      githubOwnerId: "retry-guard-owner",
      githubOwnerLogin: "ada",
      githubOwnerLoginNormalized: "ada",
      githubOwnerType: "user",
    });
    await insertTestOrganizationBillingAccount(ctx.db, organizationId);
    await ctx.db.insert("organizationMemberships", { organizationId, userId, role: "owner" });
    const repositoryId = await ctx.db.insert("repositories", {
      organizationId,
      convexTeamId: "convex-team",
      cloudflareAccountId: "cloudflare-account",
      deletion: { state: "not_deleting" },
      createdAt: 1,
      state: "not_connected",
    });
    const failedRunId = await ctx.db.insert("workflow_repositoryProvisioning_runs", {
      organizationId,
      userId,
      repositoryId,
      githubRepositoryFullName: "ada/retry-guard",
      trigger: "create",
      state: "failed",
      currentStep: "attach_convex",
      lastError: "Convex setup failed.",
      createdAt: 1,
      updatedAt: 2,
      completedAt: 2,
    });
    await ctx.db.replace(repositoryId, {
      organizationId,
      convexTeamId: "convex-team",
      cloudflareAccountId: "cloudflare-account",
      deletion: { state: "not_deleting" },
      createdAt: 1,
      state: "connected",
      githubMode: "create_repository",
      runId: failedRunId,
      githubRepositoryDatabaseId: "github-repository",
      githubRepositoryName: "retry-guard",
      visibility: "private",
      defaultBranch: "main",
      connectedAt: 3,
    });

    switch (blocker) {
      case "none":
        await ctx.db.insert("workflow_repositoryProvisioning_writeLocks", {
          repositoryId,
          owner: { kind: "managed_run", runId: failedRunId },
          state: "failed",
          lastWriteAt: {},
          updatedAt: 10,
        });
        break;
      case "active_managed_lock":
        await ctx.db.insert("workflow_repositoryProvisioning_writeLocks", {
          repositoryId,
          owner: { kind: "managed_run", runId: failedRunId },
          state: "active",
          lastWriteAt: {},
          updatedAt: 10,
        });
        break;
      case "manual_write":
        await ctx.db.insert("workflow_repositoryProvisioning_writeLocks", {
          repositoryId,
          owner: {
            kind: "manual_provider_write",
            userId,
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
        const deletionRunId = await ctx.db.insert("workflow_repositoryDeletion_runs", {
          state: "queued",
          organizationId,
          userId,
          repositoryId,
          githubRepositoryFullName: "ada/retry-guard",
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
                githubRepositoryDatabaseId: "github-repository",
                githubOwnerLogin: "ada",
                githubRepositoryName: "retry-guard",
                githubRepositoryFullName: "ada/retry-guard",
              },
              convex: { action: "skip", reason: "not_requested" },
              cloudflare: { action: "skip", reason: "not_requested" },
              githubRepository: { action: "skip", reason: "not_requested" },
            },
          },
        });
        await ctx.db.patch(repositoryId, {
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

    return { failedRunId, organizationId, userId, repositoryId };
  });

  return { ids, t };
}

describe("app provisioning retry admission", () => {
  it.each([
    [
      "an active managed lock",
      "active_managed_lock",
      "Another repository infrastructure operation is active.",
    ],
    [
      "an active manual write",
      "manual_write",
      "Another repository infrastructure operation is active.",
    ],
    ["repository deletion", "deletion", "Repository deletion is in progress."],
  ] as const)("rejects retry while %s is active", async (_label, blocker, message) => {
    const { ids, t } = await createRetryFixture(blocker);

    await expect(
      t.mutation(internal.repositoryProvisioningRuns.createRetryForRepository, {
        userId: ids.userId,
        repositoryId: ids.repositoryId,
      }),
    ).rejects.toThrow(message);
  });

  it("admits only one of two simultaneous retries", async () => {
    const { ids, t } = await createRetryFixture("none");
    const args = {
      userId: ids.userId,
      repositoryId: ids.repositoryId,
    };

    const results = await Promise.allSettled([
      t.mutation(internal.repositoryProvisioningRuns.createRetryForRepository, args),
      t.mutation(internal.repositoryProvisioningRuns.createRetryForRepository, args),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual(["fulfilled", "rejected"]);
    const admitted = await t.run(async (ctx) => {
      const queuedRuns = await ctx.db
        .query("workflow_repositoryProvisioning_runs")
        .withIndex("by_repository_and_state", (q) =>
          q.eq("repositoryId", ids.repositoryId).eq("state", "queued"),
        )
        .collect();
      const writeLock = await ctx.db
        .query("workflow_repositoryProvisioning_writeLocks")
        .withIndex("by_repository", (q) => q.eq("repositoryId", ids.repositoryId))
        .unique();
      return { queuedRuns, writeLock };
    });
    expect(admitted.queuedRuns).toHaveLength(1);
    expect(admitted.queuedRuns[0]).toMatchObject({
      organizationId: ids.organizationId,
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
      t.mutation(internal.repositoryProvisioningRuns.createRetryForRepository, {
        userId: ids.userId,
        repositoryId: ids.repositoryId,
      }),
    ).rejects.toThrow();

    await expect(
      t.run(async (ctx) => {
        const runs = await ctx.db
          .query("workflow_repositoryProvisioning_runs")
          .withIndex("by_repository_and_updated_at", (q) => q.eq("repositoryId", ids.repositoryId))
          .collect();
        const lock = await ctx.db
          .query("workflow_repositoryProvisioning_writeLocks")
          .withIndex("by_repository", (q) => q.eq("repositoryId", ids.repositoryId))
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
        .query("workflow_repositoryProvisioning_writeLocks")
        .withIndex("by_repository", (q) => q.eq("repositoryId", ids.repositoryId))
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
      t.mutation(internal.repositoryProvisioningRuns.createRetryForRepository, {
        userId: ids.userId,
        repositoryId: ids.repositoryId,
      }),
    ).rejects.toThrow("Infrastructure retry is available only after managed setup fails.");
  });

  it("rejects retry after a manual action supersedes failed managed setup", async () => {
    const { ids, t } = await createRetryFixture("none");
    await t.mutation(internal.repository.infrastructureOperation.claimManualProviderWrite, {
      repositoryId: ids.repositoryId,
      userId: ids.userId,
      actionId: "manual-repair",
      action: "create_convex_project",
    });
    await t.mutation(internal.repository.infrastructureOperation.finishManualProviderWriteResult, {
      repositoryId: ids.repositoryId,
      actionId: "manual-repair",
      result: "succeeded",
    });

    await expect(
      t.mutation(internal.repositoryProvisioningRuns.createRetryForRepository, {
        userId: ids.userId,
        repositoryId: ids.repositoryId,
      }),
    ).rejects.toThrow("Infrastructure retry is available only after managed setup fails.");
  });

  it("rejects provider retry after source setup fails", async () => {
    const { ids, t } = await createRetryFixture("none");
    await t.run(async (ctx) => {
      const write = await ctx.db
        .query("workflow_repositoryProvisioning_writeLocks")
        .withIndex("by_repository", (q) => q.eq("repositoryId", ids.repositoryId))
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
      t.mutation(internal.repositoryProvisioningRuns.createRetryForRepository, {
        userId: ids.userId,
        repositoryId: ids.repositoryId,
      }),
    ).rejects.toThrow("Infrastructure retry is available only after provider setup fails.");
  });

  it("admits only one of a retry and repository deletion", async () => {
    const { ids, t } = await createRetryFixture("none");

    const results = await Promise.allSettled([
      t.mutation(internal.repositoryProvisioningRuns.createRetryForRepository, {
        userId: ids.userId,
        repositoryId: ids.repositoryId,
      }),
      t.mutation(internal.repository.deletion.runs.createInitialRun, {
        userId: ids.userId,
        repositoryId: ids.repositoryId,
        options: {
          removeGithubRepo: false,
          removeConvexProvision: false,
          removeCloudflareProvision: false,
        },
      }),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual(["fulfilled", "rejected"]);
    const state = await t.run(async (ctx) => {
      const repository = await ctx.db.get(ids.repositoryId);
      const queuedRuns = await ctx.db
        .query("workflow_repositoryProvisioning_runs")
        .withIndex("by_repository_and_state", (q) =>
          q.eq("repositoryId", ids.repositoryId).eq("state", "queued"),
        )
        .collect();
      if (
        repository === null ||
        repository.state === "migration_placeholder" ||
        repository.state === "migration_tombstone"
      ) {
        throw new Error("Repository fixture is missing.");
      }
      return { deletion: repository.deletion, queuedRunCount: queuedRuns.length };
    });
    if (state.deletion.state === "deleting") {
      expect(state.queuedRunCount).toBe(0);
    } else {
      expect(state.deletion).toEqual({ state: "not_deleting" });
      expect(state.queuedRunCount).toBe(1);
    }
  });
});
