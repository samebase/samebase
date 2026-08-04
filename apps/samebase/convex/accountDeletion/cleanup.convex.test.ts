import { describe, expect, it } from "vite-plus/test";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { makeConvexTest } from "../test.setup";
import { TREE_REFRESH_STALE_LOCK_MS } from "../../shared/treeRefresh";
import { deleteVaultLocalDataBatchForOrganization } from "../vault/deletion/cleanup";
import { cleanupAccountLocalDataBatchForUser } from "./cleanup";
import { INITIAL_ACCOUNT_DELETION_DATA_PROGRESS } from "./model";

async function seedUser(
  t: ReturnType<typeof makeConvexTest>,
  email: string,
  organizationId?: Id<"organizations">,
) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { email, isApproved: true });
    const resolvedOrganizationId = organizationId ?? (await ctx.db.insert("organizations", {}));
    await ctx.db.insert("organizationMemberships", {
      organizationId: resolvedOrganizationId,
      userId,
    });
    if (organizationId === undefined) {
      await ctx.db.insert("organizationBillingAccounts", {
        organizationId: resolvedOrganizationId,
        plan: "free",
        status: "inactive",
      });
    }
    return userId;
  });
}

async function readOrganizationId(t: ReturnType<typeof makeConvexTest>, userId: Id<"users">) {
  return await t.run(async (ctx) => {
    const membership = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_user", (query) => query.eq("userId", userId))
      .unique();
    if (membership === null) {
      throw new Error("Expected organization membership.");
    }
    return membership.organizationId;
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

async function deleteVault(
  t: ReturnType<typeof makeConvexTest>,
  userId: Awaited<ReturnType<typeof seedUser>>,
  vaultId: Awaited<ReturnType<typeof seedVault>>,
) {
  const organizationId = await readOrganizationId(t, userId);
  const args = { organizationId, vaultId };
  let result = await t.run(async (ctx) => {
    return await deleteVaultLocalDataBatchForOrganization(ctx, args);
  });
  while (result.state === "needs_more") {
    result = await t.run(async (ctx) => {
      return await deleteVaultLocalDataBatchForOrganization(ctx, args);
    });
  }
  expect(result).toEqual({ state: "deleted" });
}

async function seedVault(
  t: ReturnType<typeof makeConvexTest>,
  userId: Awaited<ReturnType<typeof seedUser>>,
) {
  const organizationId = await readOrganizationId(t, userId);
  return await t.run(async (ctx) => {
    return await ctx.db.insert("vaults", {
      organizationId,
      state: "not_connected",
      deletion: { state: "not_deleting" },
    });
  });
}

async function seedConnectedVaultWithRefresh(
  t: ReturnType<typeof makeConvexTest>,
  userId: Awaited<ReturnType<typeof seedUser>>,
  startedAt: number,
) {
  const organizationId = await readOrganizationId(t, userId);
  return await t.run(async (ctx) => {
    const githubProviderConnectionId = await ctx.db.insert("providerConnections", {
      kind: "github",
      state: "connected",
      organizationId,
      connectedByUserId: userId,
      accountId: `github-${userId}`,
      auth: { method: "api_key", credential: "github-token" },
      createdAt: 1,
      updatedAt: 1,
    });
    const vaultId = await ctx.db.insert("vaults", {
      organizationId,
      state: "not_connected",
      deletion: { state: "not_deleting" },
    });
    const provisioningRunId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
      requestedByUserId: userId,
      vaultId,
      repositoryFullName: "owner/repository",
      trigger: "create",
      state: "succeeded",
      currentStep: "finish",
      createdAt: 1,
      updatedAt: 2,
      completedAt: 3,
    });
    await ctx.db.replace(vaultId, {
      organizationId,
      state: "connected",
      githubProviderConnectionId,
      githubMode: "create_repository",
      deletion: { state: "not_deleting" },
      treeRefreshLock: { requestedByUserId: userId, startedAt },
      runId: provisioningRunId,
      ghRepoId: `repository-${vaultId}`,
      defaultBranch: "main",
      connectedAt: 4,
      owner: "owner",
      name: `repository-${vaultId}`,
      visibility: "private",
    });
    return vaultId;
  });
}

async function seedRunningDeletion(
  t: ReturnType<typeof makeConvexTest>,
  userId: Awaited<ReturnType<typeof seedUser>>,
) {
  return await t.run(async (ctx) => {
    const sessionId = await ctx.db.insert("authSessions", {
      userId,
      expirationTime: Date.now() + 60_000,
    });
    return await ctx.db.insert("workflow_accountDeletion_runs", {
      identity: { state: "active", userId, email: "owner@example.com" },
      completionCapability: "progress-test",
      state: "running",
      workflow: { state: "started", workflowId: "workflow-1", attempt: 1 },
      currentStep: "delete_samebase_data",
      requestedAt: 1,
      updatedAt: 1,
      initiatingSessionId: sessionId,
      retryCount: 0,
      outcomes: {
        billing: { state: "not_applicable" },
        providerRevocation: { state: "not_started" },
        completionEmail: { state: "not_started" },
      },
      dataDeletion: INITIAL_ACCOUNT_DELETION_DATA_PROGRESS,
    });
  });
}

describe("account-local deletion cleanup", () => {
  it("persists exact vault cleanup phases and completed-vault counts", async () => {
    const t = makeConvexTest();
    const userId = await seedUser(t, "owner@example.com");
    const firstVaultId = await seedVault(t, userId);
    await seedVault(t, userId);
    const runId = await seedRunningDeletion(t, userId);
    await t.run(async (ctx) => {
      await ctx.db.insert("vaultStagedFiles", {
        vaultId: firstVaultId,
        fileDeleted: false,
        kind: "text",
        filePath: "draft.txt",
        initialFilePath: "draft.txt",
        content: "draft",
        initialContent: "",
        parentCommitSha: null,
        lastEditTime: 1,
        lastEditUserId: userId,
        branch: "main",
        version: 1,
      });
    });

    const workflowArgs = { runId, workflowId: "workflow-1" };
    await t.mutation(internal.accountDeletion.cleanup.startVaultDataDeletion, workflowArgs);
    await expect(
      t.mutation(internal.accountDeletion.cleanup.cleanupVaultDataDeletionBatch, workflowArgs),
    ).resolves.toBe(false);
    await t.run(async (ctx) => {
      const run = await ctx.db.get(runId);
      if (run === null || run.state !== "running") {
        throw new Error("Expected a running deletion run.");
      }
      expect(run.dataDeletion.vaultsAndStagedChanges).toMatchObject({
        state: "in_progress",
        deletedVaultCount: 0,
        currentVaultPhase: "staged_changes",
      });
    });

    await expect(
      t.mutation(internal.accountDeletion.cleanup.cleanupVaultDataDeletionBatch, workflowArgs),
    ).resolves.toBe(false);
    await t.run(async (ctx) => {
      const run = await ctx.db.get(runId);
      if (run === null || run.state !== "running") {
        throw new Error("Expected a running deletion run.");
      }
      expect(run.dataDeletion.vaultsAndStagedChanges).toMatchObject({
        state: "in_progress",
        deletedVaultCount: 1,
        currentVaultPhase: "vault_data",
      });
    });

    let done = false;
    for (let attempt = 0; attempt < 10 && !done; attempt += 1) {
      done = await t.mutation(
        internal.accountDeletion.cleanup.cleanupVaultDataDeletionBatch,
        workflowArgs,
      );
    }
    expect(done).toBe(true);
    await t.run(async (ctx) => {
      const run = await ctx.db.get(runId);
      if (run === null || run.state !== "running") {
        throw new Error("Expected a running deletion run.");
      }
      expect(run.dataDeletion.vaultsAndStagedChanges).toMatchObject({
        state: "completed",
        deletedVaultCount: 2,
        currentVaultPhase: null,
      });
    });
  });

  it("keeps completed data groups completed when a workflow retries", async () => {
    const t = makeConvexTest();
    const userId = await seedUser(t, "owner@example.com");
    const runId = await seedRunningDeletion(t, userId);
    await t.run(async (ctx) => {
      await ctx.db.insert("ui_user_settings", {
        userId,
        providersPanelOpen: false,
        pricingBillingCycle: "monthly",
      });
    });
    const args = {
      runId,
      workflowId: "workflow-1",
      group: "preferences" as const,
    };

    await expect(
      t.mutation(internal.accountDeletion.cleanup.cleanupDataDeletionGroupBatch, args),
    ).resolves.toBe(false);
    await expect(
      t.mutation(internal.accountDeletion.cleanup.cleanupDataDeletionGroupBatch, args),
    ).resolves.toBe(true);
    const completed = await t.run(async (ctx) => {
      const run = await ctx.db.get(runId);
      if (run === null || run.state !== "running") {
        throw new Error("Expected a running deletion run.");
      }
      return run.dataDeletion;
    });

    await expect(
      t.mutation(internal.accountDeletion.cleanup.cleanupDataDeletionGroupBatch, args),
    ).resolves.toBe(true);
    await t.run(async (ctx) => {
      const run = await ctx.db.get(runId);
      if (run === null || run.state !== "running") {
        throw new Error("Expected a running deletion run.");
      }
      expect(run.dataDeletion).toEqual(completed);
    });
  });

  it("deletes vault lifecycle events before runs on the organization cleanup path", async () => {
    const t = makeConvexTest();
    const userId = await seedUser(t, "owner@example.com");
    const vaultId = await seedVault(t, userId);
    const lifecycle = await t.run(async (ctx) => {
      const plan = {
        target: {
          kind: "failed_repository_setup" as const,
          githubMode: "connect_existing_repository" as const,
          owner: "owner",
          name: "repository",
          repositoryFullName: "owner/repository",
        },
        convex: { action: "skip" as const, reason: "not_requested" as const },
        cloudflare: { action: "skip" as const, reason: "not_requested" as const },
        githubRepository: { action: "skip" as const, reason: "not_requested" as const },
      };

      const lifecycleRunId = await ctx.db.insert("workflow_vaultDeletion_runs", {
        requestedByUserId: userId,
        vaultId,
        repositoryFullName: "owner/deleting",
        attempt: { kind: "initial" },
        state: "failed",
        workflow: { state: "not_started" },
        currentStep: "initialize_deletion",
        snapshot: { state: "retained_for_retry", plan },
        lastError: "Deletion failed.",
        createdAt: 100,
        updatedAt: 100,
        completedAt: 100,
      });
      const lifecycleEventId = await ctx.db.insert("workflow_vaultDeletion_events", {
        vaultId,
        repositoryFullName: "owner/deleting",
        runId: lifecycleRunId,
        step: "initialize_deletion",
        level: "error",
        message: "Deletion failed.",
        createdAt: 100,
      });
      return { lifecycleEventId, lifecycleRunId };
    });

    await expect(runCleanup(t, userId)).resolves.toEqual({
      state: "needs_more",
      target: "vaults",
      rowsChanged: 1,
    });
    await expect(t.run(async (ctx) => ctx.db.get(lifecycle.lifecycleEventId))).resolves.toBeNull();
    await expect(
      t.run(async (ctx) => ctx.db.get(lifecycle.lifecycleRunId)),
    ).resolves.not.toBeNull();
    await expect(t.run(async (ctx) => ctx.db.get(vaultId))).resolves.not.toBeNull();

    await expect(runCleanup(t, userId)).resolves.toEqual({
      state: "needs_more",
      target: "vaults",
      rowsChanged: 1,
    });
    await expect(t.run(async (ctx) => ctx.db.get(lifecycle.lifecycleRunId))).resolves.toBeNull();
    await expect(t.run(async (ctx) => ctx.db.get(vaultId))).resolves.not.toBeNull();

    await expect(runCleanup(t, userId)).resolves.toEqual({
      state: "needs_more",
      target: "vaults",
      rowsChanged: 1,
    });
    await expect(t.run(async (ctx) => ctx.db.get(vaultId))).resolves.toBeNull();
    await expect(runCleanup(t, userId)).resolves.toEqual({ state: "done" });
  });

  it("completes one vault beyond the former 96-batch cleanup budget", async () => {
    const t = makeConvexTest();
    const userId = await seedUser(t, "large-vault@example.com");
    const runId = await seedRunningDeletion(t, userId);
    const vaultId = await seedVault(t, userId);
    const organizationId = await readOrganizationId(t, userId);
    const rowCount = 50 * 96 + 1;

    for (let start = 0; start < rowCount; start += 500) {
      await t.run(async (ctx) => {
        for (let index = start; index < Math.min(start + 500, rowCount); index += 1) {
          await ctx.db.insert("ui_vaultFileTree_folderExpansions", {
            userId,
            vaultId,
            folderPath: `folder-${index}`,
            isExpanded: true,
          });
        }
      });
    }

    const args = { runId, workflowId: "workflow-1" };

    await t.mutation(internal.accountDeletion.cleanup.startVaultDataDeletion, args);
    await expect(
      t.action(internal.accountDeletion.cleanupActions.cleanupVaultData, args),
    ).resolves.toBeNull();

    await t.run(async (ctx) => {
      const vaults = await ctx.db
        .query("vaults")
        .withIndex("by_organization", (query) => query.eq("organizationId", organizationId))
        .collect();
      const folderState = await ctx.db
        .query("ui_vaultFileTree_folderExpansions")
        .withIndex("by_vault", (query) => query.eq("vaultId", vaultId))
        .collect();
      const run = await ctx.db.get(runId);

      expect(vaults).toHaveLength(0);
      expect(folderState).toHaveLength(0);
      if (run === null || run.state !== "running") {
        throw new Error("Expected a running deletion run.");
      }
      expect(run.dataDeletion.vaultsAndStagedChanges).toMatchObject({
        state: "completed",
        deletedVaultCount: 1,
      });
    });
  });

  it("blocks sole-member organization work", async () => {
    const t = makeConvexTest();
    const userId = await seedUser(t, "owner@example.com");
    const organizationId = await readOrganizationId(t, userId);
    const runId = await t.run(async (ctx) => {
      const vaultId = await ctx.db.insert("vaults", {
        organizationId,
        state: "not_connected",
        deletion: { state: "not_deleting" },
      });
      return await ctx.db.insert("workflow_vaultDeletion_runs", {
        requestedByUserId: userId,
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

  it("does not wait for a remaining member's work in a shared organization", async () => {
    const t = makeConvexTest();
    const deletingUserId = await seedUser(t, "deleting@example.com");
    const organizationId = await readOrganizationId(t, deletingUserId);
    const remainingUserId = await seedUser(t, "remaining@example.com", organizationId);
    const accountDeletionRunId = await seedRunningDeletion(t, deletingUserId);
    const activeRunId = await t.run(async (ctx) => {
      const vaultId = await ctx.db.insert("vaults", {
        organizationId,
        state: "not_connected",
        deletion: { state: "not_deleting" },
      });
      return await ctx.db.insert("workflow_vaultProvisioning_runs", {
        requestedByUserId: remainingUserId,
        vaultId,
        repositoryFullName: "remaining/repository",
        trigger: "create",
        state: "running",
        currentStep: "claim_infra",
        createdAt: 1,
        updatedAt: 1,
      });
    });
    const remainingRefreshVaultId = await seedConnectedVaultWithRefresh(
      t,
      remainingUserId,
      Date.now(),
    );
    const remainingProviderWriteId = await t.run(async (ctx) => {
      return await ctx.db.insert("workflow_vaultProvisioning_writeLocks", {
        vaultId: remainingRefreshVaultId,
        owner: {
          kind: "manual_provider_write",
          requestedByUserId: remainingUserId,
          actionId: "remaining-provider-write",
          action: "create_convex_project",
          expiresAt: Date.now() + 60_000,
        },
        state: "active",
        lastWriteAt: {},
        updatedAt: Date.now(),
      });
    });

    await expect(
      t.mutation(internal.accountDeletion.cleanup.inspectQuiescence, {
        runId: accountDeletionRunId,
        workflowId: "workflow-1",
      }),
    ).resolves.toEqual({ state: "done" });
    await expect(runCleanup(t, deletingUserId)).resolves.toEqual({ state: "done" });
    await expect(t.run(async (ctx) => await ctx.db.get(activeRunId))).resolves.not.toBeNull();
    await expect(
      t.run(async (ctx) => await ctx.db.get(remainingRefreshVaultId)),
    ).resolves.not.toBeNull();
    await expect(
      t.run(async (ctx) => await ctx.db.get(remainingProviderWriteId)),
    ).resolves.not.toBeNull();
  });

  it("waits for the deleting member's provider and repository work in a shared organization", async () => {
    const t = makeConvexTest();
    const deletingUserId = await seedUser(t, "deleting@example.com");
    const organizationId = await readOrganizationId(t, deletingUserId);
    await seedUser(t, "remaining@example.com", organizationId);
    const accountDeletionRunId = await seedRunningDeletion(t, deletingUserId);
    const vaultId = await seedConnectedVaultWithRefresh(t, deletingUserId, Date.now());
    const providerWriteId = await t.run(async (ctx) => {
      return await ctx.db.insert("workflow_vaultProvisioning_writeLocks", {
        vaultId,
        owner: {
          kind: "manual_provider_write",
          requestedByUserId: deletingUserId,
          actionId: "deleting-provider-write",
          action: "create_convex_project",
          expiresAt: Date.now() + 60_000,
        },
        state: "active",
        lastWriteAt: {},
        updatedAt: Date.now(),
      });
    });
    const workflowArgs = { runId: accountDeletionRunId, workflowId: "workflow-1" };

    await expect(
      t.mutation(internal.accountDeletion.cleanup.inspectQuiescence, workflowArgs),
    ).resolves.toEqual({ state: "waiting", blocker: "active_provider_change" });
    await expect(runCleanup(t, deletingUserId)).resolves.toEqual({
      state: "blocked",
      blocker: "active_provider_change",
      vaultId,
    });

    await t.run(async (ctx) => {
      await ctx.db.delete(providerWriteId);
    });

    await expect(
      t.mutation(internal.accountDeletion.cleanup.inspectQuiescence, workflowArgs),
    ).resolves.toEqual({ state: "waiting", blocker: "active_repository_refresh" });
    await expect(runCleanup(t, deletingUserId)).resolves.toEqual({
      state: "blocked",
      blocker: "active_repository_refresh",
      vaultId,
    });
  });

  it("ignores an expired provider write for the deleting member", async () => {
    const t = makeConvexTest();
    const deletingUserId = await seedUser(t, "deleting@example.com");
    const organizationId = await readOrganizationId(t, deletingUserId);
    await seedUser(t, "remaining@example.com", organizationId);
    const accountDeletionRunId = await seedRunningDeletion(t, deletingUserId);
    const vaultId = await seedVault(t, deletingUserId);
    await t.run(async (ctx) => {
      await ctx.db.insert("workflow_vaultProvisioning_writeLocks", {
        vaultId,
        owner: {
          kind: "manual_provider_write",
          requestedByUserId: deletingUserId,
          actionId: "expired-provider-write",
          action: "create_convex_project",
          expiresAt: Date.now() - 1,
        },
        state: "active",
        lastWriteAt: {},
        updatedAt: Date.now(),
      });
    });
    const workflowArgs = { runId: accountDeletionRunId, workflowId: "workflow-1" };

    await expect(
      t.mutation(internal.accountDeletion.cleanup.inspectQuiescence, workflowArgs),
    ).resolves.toEqual({ state: "done" });
    await expect(runCleanup(t, deletingUserId)).resolves.toEqual({ state: "done" });
  });

  it("preserves all organization resources when another member remains", async () => {
    const t = makeConvexTest();
    const deletingUserId = await seedUser(t, "deleting@example.com");
    const organizationId = await readOrganizationId(t, deletingUserId);
    await seedUser(t, "remaining@example.com", organizationId);
    const resources = await t.run(async (ctx) => {
      const deletingVaultId = await ctx.db.insert("vaults", {
        organizationId,
        state: "not_connected",
        deletion: { state: "not_deleting" },
      });
      const remainingVaultId = await ctx.db.insert("vaults", {
        organizationId,
        state: "not_connected",
        deletion: { state: "not_deleting" },
      });
      return { deletingVaultId, organizationId, remainingVaultId };
    });

    let result = await runCleanup(t, deletingUserId);
    for (let attempt = 0; attempt < 10 && result.state !== "done"; attempt += 1) {
      result = await runCleanup(t, deletingUserId);
    }
    expect(result).toEqual({ state: "done" });
    await expect(
      t.run(async (ctx) => ({
        deletingVault: await ctx.db.get(resources.deletingVaultId),
        organization: await ctx.db.get(resources.organizationId),
        remainingVault: await ctx.db.get(resources.remainingVaultId),
      })),
    ).resolves.toMatchObject({
      deletingVault: expect.any(Object),
      organization: expect.any(Object),
      remainingVault: expect.any(Object),
    });
  });

  it("deletes only the departing member's vault UI state in a shared organization", async () => {
    const t = makeConvexTest();
    const deletingUserId = await seedUser(t, "deleting@example.com");
    const organizationId = await readOrganizationId(t, deletingUserId);
    const remainingUserId = await seedUser(t, "remaining@example.com", organizationId);
    const { convexProjectId, vaultId } = await t.run(async (ctx) => {
      const convexProviderConnectionId = await ctx.db.insert("providerConnections", {
        kind: "convex",
        state: "connected",
        organizationId,
        connectedByUserId: deletingUserId,
        auth: { method: "api_key", credential: "convex-token" },
        teamId: "team",
        createdAt: 1,
        updatedAt: 1,
      });
      const vaultId = await ctx.db.insert("vaults", {
        organizationId,
        state: "not_connected",
        deletion: { state: "not_deleting" },
      });
      const convexProjectId = await ctx.db.insert("vaultConvexProjects", {
        vaultId,
        organizationId,
        providerConnectionId: convexProviderConnectionId,
        teamId: "team",
        projectId: "project",
        convexConfigPath: "convex/convex.json",
        origin: "selected_existing",
      });
      const deletingFolderId = await ctx.db.insert("ui_vaultFolders", {
        userId: deletingUserId,
        name: "Deleting",
        nameKey: "deleting",
        position: 0,
        collapsed: false,
      });
      const remainingFolderId = await ctx.db.insert("ui_vaultFolders", {
        userId: remainingUserId,
        name: "Remaining",
        nameKey: "remaining",
        position: 0,
        collapsed: false,
      });

      for (const [userId, folderId] of [
        [deletingUserId, deletingFolderId],
        [remainingUserId, remainingFolderId],
      ] as const) {
        await ctx.db.insert("ui_vaultPullRequests_filters", {
          userId,
          vaultId,
          hiddenLabels: [],
          includeDrafts: true,
          includeNoLabel: true,
        });
        await ctx.db.insert("ui_vaultResourceLinks_settings", {
          userId,
          vaultId,
          updatedAt: 1,
          resourceLinksOpen: true,
        });
        await ctx.db.insert("ui_vaultFolderAssignments", { userId, vaultId, folderId });
        await ctx.db.insert("ui_vaultFileTree_folderExpansions", {
          userId,
          vaultId,
          folderPath: "src",
          isExpanded: true,
        });
        await ctx.db.insert("ui_vaultConvexSchemaGraph_nodeLayouts", {
          userId,
          vaultId,
          convexProjectId,
          nodeId: "table:users",
          x: 0,
          y: 0,
          updatedAt: 1,
        });
      }

      return { convexProjectId, vaultId };
    });

    let result = await runCleanup(t, deletingUserId);
    for (let attempt = 0; attempt < 10 && result.state !== "done"; attempt += 1) {
      result = await runCleanup(t, deletingUserId);
    }
    expect(result).toEqual({ state: "done" });

    const state = await t.run(async (ctx) => {
      async function readPersonalRowCounts(userId: Id<"users">) {
        const [
          pullRequestFilters,
          resourceSettings,
          assignments,
          expansions,
          graphLayouts,
          folders,
        ] = await Promise.all([
          ctx.db
            .query("ui_vaultPullRequests_filters")
            .withIndex("by_user", (query) => query.eq("userId", userId))
            .collect(),
          ctx.db
            .query("ui_vaultResourceLinks_settings")
            .withIndex("by_user", (query) => query.eq("userId", userId))
            .collect(),
          ctx.db
            .query("ui_vaultFolderAssignments")
            .withIndex("by_user", (query) => query.eq("userId", userId))
            .collect(),
          ctx.db
            .query("ui_vaultFileTree_folderExpansions")
            .withIndex("by_user", (query) => query.eq("userId", userId))
            .collect(),
          ctx.db
            .query("ui_vaultConvexSchemaGraph_nodeLayouts")
            .withIndex("by_user", (query) => query.eq("userId", userId))
            .collect(),
          ctx.db
            .query("ui_vaultFolders")
            .withIndex("by_userId_and_position", (query) => query.eq("userId", userId))
            .collect(),
        ]);
        return {
          pullRequestFilters: pullRequestFilters.length,
          resourceSettings: resourceSettings.length,
          assignments: assignments.length,
          expansions: expansions.length,
          graphLayouts: graphLayouts.length,
          folders: folders.length,
        };
      }

      return {
        deleting: await readPersonalRowCounts(deletingUserId),
        remaining: await readPersonalRowCounts(remainingUserId),
        vault: await ctx.db.get(vaultId),
        convexProject: await ctx.db.get(convexProjectId),
      };
    });

    expect(state.deleting).toEqual({
      pullRequestFilters: 0,
      resourceSettings: 0,
      assignments: 0,
      expansions: 0,
      graphLayouts: 0,
      folders: 0,
    });
    expect(state.remaining).toEqual({
      pullRequestFilters: 1,
      resourceSettings: 1,
      assignments: 1,
      expansions: 1,
      graphLayouts: 1,
      folders: 1,
    });
    expect(state.vault).not.toBeNull();
    expect(state.convexProject).not.toBeNull();
  });

  it("does not delete rows while app provisioning can still write provider state", async () => {
    const t = makeConvexTest();
    const userId = await seedUser(t, "owner@example.com");
    const organizationId = await readOrganizationId(t, userId);
    const runId = await t.run(async (ctx) => {
      const vaultId = await ctx.db.insert("vaults", {
        organizationId,
        state: "not_connected",
        deletion: { state: "not_deleting" },
      });
      return await ctx.db.insert("workflow_vaultProvisioning_runs", {
        requestedByUserId: userId,
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

  it("blocks active repository refresh before quiescence and destructive batches", async () => {
    const t = makeConvexTest();
    const userId = await seedUser(t, "owner@example.com");
    const runId = await seedRunningDeletion(t, userId);
    const vaultId = await seedConnectedVaultWithRefresh(t, userId, Date.now());
    const branchTreeId = await t.run(async (ctx) => {
      return await ctx.db.insert("observations_vaultRepository_branchTrees", {
        vaultId,
        branch: "main",
        commitSHA: "commit",
        treeData: { sha: "tree", truncated: false, tree: [] },
        lastTreeRefreshAt: 1,
      });
    });
    const workflowArgs = { runId, workflowId: "workflow-1" };

    await expect(
      t.mutation(internal.accountDeletion.cleanup.inspectQuiescence, workflowArgs),
    ).resolves.toEqual({ state: "waiting", blocker: "active_repository_refresh" });
    await expect(runCleanup(t, userId)).resolves.toEqual({
      state: "blocked",
      blocker: "active_repository_refresh",
      vaultId,
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(vaultId, { treeRefreshLock: undefined });
    });
    await t.mutation(internal.accountDeletion.cleanup.startVaultDataDeletion, workflowArgs);
    await t.run(async (ctx) => {
      await ctx.db.patch(vaultId, {
        treeRefreshLock: { requestedByUserId: userId, startedAt: Date.now() },
      });
    });

    await expect(
      t.mutation(internal.accountDeletion.cleanup.cleanupVaultDataDeletionBatch, workflowArgs),
    ).rejects.toThrow("Account deletion cleanup is blocked by active work.");
    await expect(t.run(async (ctx) => await ctx.db.get(branchTreeId))).resolves.not.toBeNull();
  });

  it("does not block cleanup for a stale repository refresh lock", async () => {
    const t = makeConvexTest();
    const userId = await seedUser(t, "owner@example.com");
    const runId = await seedRunningDeletion(t, userId);
    const vaultId = await seedConnectedVaultWithRefresh(
      t,
      userId,
      Date.now() - TREE_REFRESH_STALE_LOCK_MS - 1,
    );
    const workflowArgs = { runId, workflowId: "workflow-1" };

    await expect(
      t.mutation(internal.accountDeletion.cleanup.inspectQuiescence, workflowArgs),
    ).resolves.toEqual({ state: "done" });
    await t.mutation(internal.accountDeletion.cleanup.startVaultDataDeletion, workflowArgs);

    let done = false;
    for (let attempt = 0; attempt < 10 && !done; attempt += 1) {
      done = await t.mutation(
        internal.accountDeletion.cleanup.cleanupVaultDataDeletionBatch,
        workflowArgs,
      );
    }

    expect(done).toBe(true);
    await expect(t.run(async (ctx) => await ctx.db.get(vaultId))).resolves.toBeNull();
  });

  it("rechecks active work before every detailed deletion batch", async () => {
    const t = makeConvexTest();
    const userId = await seedUser(t, "owner@example.com");
    const runId = await seedRunningDeletion(t, userId);
    const organizationId = await readOrganizationId(t, userId);
    const settingsId = await t.run(async (ctx) => {
      const vaultId = await ctx.db.insert("vaults", {
        organizationId,
        state: "not_connected",
        deletion: { state: "not_deleting" },
      });
      await ctx.db.insert("workflow_vaultProvisioning_runs", {
        requestedByUserId: userId,
        vaultId,
        repositoryFullName: "owner/repository",
        trigger: "create",
        state: "running",
        currentStep: "claim_infra",
        createdAt: 1,
        updatedAt: 1,
      });
      return await ctx.db.insert("ui_user_settings", {
        userId,
        providersPanelOpen: false,
        pricingBillingCycle: "monthly",
      });
    });

    await expect(
      t.mutation(internal.accountDeletion.cleanup.cleanupDataDeletionGroupBatch, {
        runId,
        workflowId: "workflow-1",
        group: "preferences",
      }),
    ).rejects.toThrow("Account deletion cleanup is blocked by active work.");
    await expect(t.run(async (ctx) => await ctx.db.get(settingsId))).resolves.not.toBeNull();
  });

  it("deletes staged storage before its vault and proceeds in bounded batches", async () => {
    const t = makeConvexTest();
    const userId = await seedUser(t, "owner@example.com");
    const organizationId = await readOrganizationId(t, userId);
    const { storageId, vaultId } = await t.run(async (ctx) => {
      const vaultId = await ctx.db.insert("vaults", {
        organizationId,
        state: "not_connected",
        deletion: { state: "not_deleting" },
      });
      const storageId = await ctx.storage.store(new Blob(["private draft"]));
      await ctx.db.insert("vaultStagedFiles", {
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
        await ctx.db.insert("ui_user_settings", {
          userId,
          providersPanelOpen: index % 2 === 0,
          pricingBillingCycle: "monthly",
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
      expect(await ctx.db.query("ui_user_settings").collect()).toEqual([]);
    });
  });

  for (const [deletedReference, survivingReference] of [
    ["staging", "staging"],
    ["staging", "blob"],
    ["blob", "staging"],
    ["blob", "blob"],
  ] as const) {
    it(`retains shared storage across ${deletedReference} and ${survivingReference} references`, async () => {
      const t = makeConvexTest();
      const deletingUserId = await seedUser(t, "deleting@example.com");
      const survivingUserId = await seedUser(t, "surviving@example.com");
      const deletingVaultId = await seedVault(t, deletingUserId);
      const survivingVaultId = await seedVault(t, survivingUserId);
      const storageId = await t.run(async (ctx) => {
        const storageId = await ctx.storage.store(new Blob(["shared storage"]));
        if (deletedReference === "staging") {
          await ctx.db.insert("vaultStagedFiles", {
            vaultId: deletingVaultId,
            fileDeleted: false,
            kind: "binary",
            filePath: "deleting.bin",
            initialFilePath: "deleting.bin",
            content: "",
            initialContent: "",
            storageId,
            parentCommitSha: null,
            lastEditTime: 1,
            lastEditUserId: deletingUserId,
            branch: "main",
            version: 1,
          });
          await ctx.db.insert("vaultStagedFiles", {
            vaultId: deletingVaultId,
            fileDeleted: false,
            kind: "binary",
            filePath: "deleting-copy.bin",
            initialFilePath: "deleting-copy.bin",
            content: "",
            initialContent: "",
            storageId,
            parentCommitSha: null,
            lastEditTime: 1,
            lastEditUserId: deletingUserId,
            branch: "main",
            version: 1,
          });
        } else {
          await ctx.db.insert("observations_vaultFiles_blobs", {
            vaultId: deletingVaultId,
            sha: "deleting-sha",
            size: 14,
            storageId,
          });
          await ctx.db.insert("observations_vaultFiles_blobs", {
            vaultId: deletingVaultId,
            sha: "deleting-copy-sha",
            size: 14,
            storageId,
          });
        }

        if (survivingReference === "staging") {
          await ctx.db.insert("vaultStagedFiles", {
            vaultId: survivingVaultId,
            fileDeleted: false,
            kind: "binary",
            filePath: "surviving.bin",
            initialFilePath: "surviving.bin",
            content: "",
            initialContent: "",
            storageId,
            parentCommitSha: null,
            lastEditTime: 1,
            lastEditUserId: survivingUserId,
            branch: "main",
            version: 1,
          });
        } else {
          await ctx.db.insert("observations_vaultFiles_blobs", {
            vaultId: survivingVaultId,
            sha: "surviving-sha",
            size: 14,
            storageId,
          });
        }
        return storageId;
      });

      await deleteVault(t, deletingUserId, deletingVaultId);
      await t.run(async (ctx) => {
        expect(await ctx.db.system.get("_storage", storageId)).not.toBeNull();
      });

      await deleteVault(t, survivingUserId, survivingVaultId);
      await t.run(async (ctx) => {
        expect(await ctx.db.system.get("_storage", storageId)).toBeNull();
      });
    });
  }

  it("removes MCP credentials before grants", async () => {
    const t = makeConvexTest();
    const userId = await seedUser(t, "owner@example.com");
    const organizationId = await readOrganizationId(t, userId);
    await t.run(async (ctx) => {
      await ctx.db.insert("mcpGrants", {
        grantId: "grant-1",
        userId,
        organizationId,
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
