import { describe, expect, it } from "vite-plus/test";

import { internal } from "../../_generated/api";
import { makeConvexTest } from "../../test.setup";

async function seedFailedDeletionRun() {
  const t = makeConvexTest();
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      email: "vault-deletion-retry@example.invalid",
      isApproved: true,
    });
    const organizationId = await ctx.db.insert("organizations", {
      githubInstallationId: "1001",
      githubOwnerId: "101",
      githubOwnerType: "organization",
      githubOwnerLogin: "samebase",
      githubOwnerLoginNormalized: "samebase",
    });
    await ctx.db.insert("organizationMemberships", {
      organizationId,
      userId,
      role: "owner",
    });
    const vaultId = await ctx.db.insert("vaults", {
      organizationId,
      convexTeamId: "convex-team",
      cloudflareAccountId: "cloudflare-account",
      deletion: { state: "not_deleting" },
      state: "not_connected",
    });
    const failedRunId = await ctx.db.insert("workflow_vaultDeletion_runs", {
      state: "failed",
      organizationId,
      userId,
      vaultId,
      repositoryFullName: "samebase/example",
      createdAt: 1,
      updatedAt: 2,
      completedAt: 2,
      lastError: "GitHub App installation cannot access the vault repository.",
      attempt: { kind: "initial" },
      workflow: { state: "started", workflowId: "failed-deletion-workflow" },
      currentStep: "delete_github_repo",
      snapshot: {
        state: "retained_for_retry",
        plan: {
          target: {
            kind: "samebase_managed_repository",
            ghRepoId: "10001",
            owner: "samebase",
            name: "example",
            repositoryFullName: "samebase/example",
          },
          convex: {
            action: "delete_projects",
            projects: [{ teamId: "convex-team", projectId: "convex-project" }],
          },
          cloudflare: {
            action: "delete_workers",
            workers: [
              {
                accountId: "cloudflare-account",
                workerName: "example",
                workerTag: "cloudflare-worker",
              },
            ],
          },
          githubRepository: {
            action: "delete_repository",
            ghRepoId: "10001",
            owner: "samebase",
            name: "example",
          },
        },
      },
    });
    await ctx.db.patch(vaultId, {
      deletion: {
        state: "delete_failed",
        runId: failedRunId,
        failedAt: 2,
      },
    });

    return { failedRunId, userId, vaultId };
  });

  return { ids, t };
}

describe("vault deletion retries", () => {
  it("keeps the retained provider plan for a normal retry", async () => {
    const { ids, t } = await seedFailedDeletionRun();

    const result = await t.mutation(internal.vault.deletion.runs.createRetryRun, {
      userId: ids.userId,
      failedRunId: ids.failedRunId,
      mode: "same_plan",
    });
    const retryRun = await t.run(async (ctx) => await ctx.db.get(result.deletionRunId));
    if (!retryRun || retryRun.snapshot.state !== "retained_for_retry") {
      throw new Error("Deletion retry run did not retain its plan.");
    }

    expect(retryRun.snapshot.plan.convex.action).toBe("delete_projects");
    expect(retryRun.snapshot.plan.cloudflare.action).toBe("delete_workers");
    expect(retryRun.snapshot.plan.githubRepository.action).toBe("delete_repository");
  });

  it("keeps every upstream resource for an explicit Samebase-only retry", async () => {
    const { ids, t } = await seedFailedDeletionRun();

    const result = await t.mutation(internal.vault.deletion.runs.createRetryRun, {
      userId: ids.userId,
      failedRunId: ids.failedRunId,
      mode: "keep_upstream_resources",
    });
    const state = await t.run(async (ctx) => {
      const retryRun = await ctx.db.get(result.deletionRunId);
      const vault = await ctx.db.get(ids.vaultId);
      const event = await ctx.db
        .query("workflow_vaultDeletion_events")
        .withIndex("by_run_and_created_at", (query) => query.eq("runId", result.deletionRunId))
        .unique();
      return { event, retryRun, vault };
    });
    if (!state.retryRun || state.retryRun.snapshot.state !== "retained_for_retry") {
      throw new Error("Deletion retry run did not retain its plan.");
    }

    expect(state.retryRun.snapshot.plan.target).toEqual({
      kind: "samebase_managed_repository",
      ghRepoId: "10001",
      owner: "samebase",
      name: "example",
      repositoryFullName: "samebase/example",
    });
    expect(state.retryRun.snapshot.plan.convex).toEqual({
      action: "skip",
      reason: "not_requested",
    });
    expect(state.retryRun.snapshot.plan.cloudflare).toEqual({
      action: "skip",
      reason: "not_requested",
    });
    expect(state.retryRun.snapshot.plan.githubRepository).toEqual({
      action: "skip",
      reason: "not_requested",
    });
    expect(state.event?.message).toBe("Queued Samebase-only vault removal.");
    expect(state.vault?.deletion).toMatchObject({
      state: "deleting",
      runId: result.deletionRunId,
    });
  });

  it("does not create two retries from the same failed state", async () => {
    const { ids, t } = await seedFailedDeletionRun();

    await t.mutation(internal.vault.deletion.runs.createRetryRun, {
      userId: ids.userId,
      failedRunId: ids.failedRunId,
      mode: "keep_upstream_resources",
    });

    await expect(
      t.mutation(internal.vault.deletion.runs.createRetryRun, {
        userId: ids.userId,
        failedRunId: ids.failedRunId,
        mode: "keep_upstream_resources",
      }),
    ).rejects.toThrow("Vault is not waiting for deletion retry.");
  });
});
