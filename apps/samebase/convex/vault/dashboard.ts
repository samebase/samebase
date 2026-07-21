import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalQuery, type QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { mutation, query } from "../functions";
import { isConnectedVault, isSamebaseManagedVault, type ConnectedVault } from "./state";
import { readVaultDeletionEligibility } from "./deletion/eligibility";
import { isVaultDeletingOrDeleteFailed, readVaultDeletionState } from "./deletion/state";
import { hasBranchStagingChanges } from "./branches";
import { vVaultResourceLinksState } from "./dashboardModel";
import { canAccess } from "../../shared/accessModel";
import {
  getUserVaultsContract,
  type ProviderSetupSummary,
  type SourceSetupSummary,
  type UserVaultResult,
  type UserVaultsResult,
  type VaultDeletionSummary,
} from "./contracts/getUserVaults";

const { array, boolean, id, object, optional, string } = v;
type SourceSetupVault = Extract<
  Doc<"vaults">,
  { githubMode: "create_repository" | "connect_existing_repository" }
>;
type VaultProvisioningWriteLock = Doc<"workflow_vaultProvisioning_writeLocks">;
type ConvexProject = Doc<"vaultConvexProjects">;
type CloudflareWorker = Doc<"vaultCloudflareWorkers">;
const SOURCE_SETUP_ERROR_EVENT_SCAN_LIMIT = 20;

async function readLatestRunErrorMessage(
  ctx: Pick<QueryCtx, "db">,
  runId: Id<"workflow_vaultProvisioning_runs">,
): Promise<string | undefined> {
  const events = await ctx.db
    .query("workflow_vaultProvisioning_events")
    .withIndex("by_run_and_created_at", (q) => q.eq("runId", runId))
    .order("desc")
    .take(SOURCE_SETUP_ERROR_EVENT_SCAN_LIMIT);
  return events.find((event) => event.level === "error")?.message;
}

async function resolveSourceSetupSummary(
  ctx: Pick<QueryCtx, "db">,
  args: {
    hasUsableDefaultBranchTree: boolean;
    vault: SourceSetupVault;
  },
): Promise<SourceSetupSummary> {
  if (args.hasUsableDefaultBranchTree) {
    return { status: "ready" };
  }

  const run = await ctx.db.get(args.vault.runId);
  if (!run) {
    return {
      status: "failed",
      runId: args.vault.runId,
      step: "run_created",
      message: "Provisioning run not found.",
      updatedAt: getSourceSetupVaultFallbackUpdatedAt(args.vault),
    };
  }

  if (run.state === "failed") {
    const message =
      (await readLatestRunErrorMessage(ctx, args.vault.runId)) ??
      run.lastError ??
      `Provisioning failed during ${run.currentStep}.`;
    return {
      status: "failed",
      runId: args.vault.runId,
      step: run.currentStep,
      message,
      updatedAt: run.updatedAt,
    };
  }

  if (run.state === "queued" || run.state === "running") {
    return {
      status: "running",
      runId: args.vault.runId,
      step: run.currentStep,
      updatedAt: run.updatedAt,
    };
  }

  return { status: "not_applicable" };
}

function getSourceSetupVaultFallbackUpdatedAt(vault: SourceSetupVault): number {
  switch (vault.state) {
    case "connected":
      return vault.connectedAt;
    case "failed":
      return vault.failedAt;
    case "provisioning":
      return vault.startedAt;
    default:
      return vault satisfies never;
  }
}

async function readProviderRunSummary(
  ctx: Pick<QueryCtx, "db">,
  args: {
    provider: "convex" | "cloudflare";
    runId: Id<"workflow_vaultProvisioning_runs">;
    status: "running" | "failed";
    fallbackUpdatedAt: number;
  },
): Promise<Extract<ProviderSetupSummary, { status: "running" | "failed" }>> {
  const run = await ctx.db.get(args.runId);
  if (!run) {
    return {
      status: "failed",
      provider: args.provider,
      runId: args.runId,
      step: "run_created",
      message: "Provisioning run not found.",
      updatedAt: args.fallbackUpdatedAt,
    };
  }

  if (args.status === "running" && (run.state === "queued" || run.state === "running")) {
    return {
      status: "running",
      provider: args.provider,
      runId: args.runId,
      step: run.currentStep,
      updatedAt: run.updatedAt,
    };
  }

  const message = run.lastError ?? `Provisioning failed during ${run.currentStep}.`;
  return {
    status: "failed",
    provider: args.provider,
    runId: args.runId,
    step: run.currentStep,
    message,
    updatedAt: run.updatedAt,
  };
}

/**
 * The create workflow can sync the first tree before it acquires the provisioning
 * write lock; keep the setup log visible during that transition instead of
 * flashing empty UI.
 */
async function readRunningProviderRunSummary(
  ctx: Pick<QueryCtx, "db">,
  args: {
    provider: "convex" | "cloudflare";
    runId: Id<"workflow_vaultProvisioning_runs">;
  },
): Promise<Extract<ProviderSetupSummary, { status: "running" }> | null> {
  const run = await ctx.db.get(args.runId);
  if (!run || (run.state !== "queued" && run.state !== "running")) {
    return null;
  }

  return {
    status: "running",
    provider: args.provider,
    runId: args.runId,
    step: run.currentStep,
    updatedAt: run.updatedAt,
  };
}

async function readLatestDeletionEvent(
  ctx: Pick<QueryCtx, "db">,
  runId: Id<"workflow_vaultDeletion_runs">,
): Promise<Doc<"workflow_vaultDeletion_events"> | null> {
  return await ctx.db
    .query("workflow_vaultDeletion_events")
    .withIndex("by_run_and_created_at", (q) => q.eq("runId", runId))
    .order("desc")
    .first();
}

async function resolveVaultDeletionSummary(
  ctx: Pick<QueryCtx, "db">,
  vault: Doc<"vaults">,
): Promise<VaultDeletionSummary> {
  const deletion = readVaultDeletionState(vault);
  switch (deletion.state) {
    case "not_deleting": {
      const eligibility = await readVaultDeletionEligibility(ctx, vault);
      return {
        state: "not_deleting",
        deleteAction:
          eligibility.state === "eligible"
            ? { state: "available" }
            : {
                state: "disabled",
                reason: eligibility.reason,
              },
      };
    }
    case "deleting": {
      const [run, latestEvent] = await Promise.all([
        ctx.db.get(deletion.runId),
        readLatestDeletionEvent(ctx, deletion.runId),
      ]);
      return {
        state: "deleting",
        runId: deletion.runId,
        requestedAt: deletion.requestedAt,
        currentStep: run?.currentStep ?? "initialize_deletion",
        message: latestEvent?.message ?? "Deleting vault.",
        updatedAt: run?.updatedAt ?? latestEvent?.createdAt ?? deletion.requestedAt,
      };
    }
    case "delete_failed": {
      const [run, latestEvent] = await Promise.all([
        ctx.db.get(deletion.runId),
        readLatestDeletionEvent(ctx, deletion.runId),
      ]);
      const lastError = run?.state === "failed" ? run.lastError : "Vault deletion failed.";
      return {
        state: "delete_failed",
        runId: deletion.runId,
        failedAt: deletion.failedAt,
        currentStep: run?.currentStep ?? "initialize_deletion",
        message: latestEvent?.message ?? lastError,
        lastError,
        updatedAt: run?.updatedAt ?? latestEvent?.createdAt ?? deletion.failedAt,
      };
    }
    default: {
      deletion satisfies never;
      throw new Error("Unknown vault deletion state.");
    }
  }
}

async function readVaultProvisioningWriteLock(
  ctx: Pick<QueryCtx, "db">,
  vaultId: Id<"vaults">,
): Promise<VaultProvisioningWriteLock | null> {
  return await ctx.db
    .query("workflow_vaultProvisioning_writeLocks")
    .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
    .first();
}

async function resolveProviderSetupSummary(
  ctx: Pick<QueryCtx, "db">,
  vault: ConnectedVault,
  convexProjects: ConvexProject[],
  cloudflareWorkers: CloudflareWorker[],
): Promise<ProviderSetupSummary> {
  const writeLock = await readVaultProvisioningWriteLock(ctx, vault._id);

  if (convexProjects.length === 0) {
    if (writeLock?.state === "active" || writeLock?.state === "failed") {
      return await readProviderRunSummary(ctx, {
        provider: "convex",
        runId: writeLock.runId,
        status: writeLock.state === "failed" ? "failed" : "running",
        fallbackUpdatedAt: writeLock.updatedAt,
      });
    }
    const runningCreateRun = await readRunningProviderRunSummary(ctx, {
      provider: "convex",
      runId: vault.runId,
    });
    return runningCreateRun ?? { status: "not_applicable" };
  }
  if (cloudflareWorkers.length === 0) {
    if (writeLock?.state === "active" || writeLock?.state === "failed") {
      return await readProviderRunSummary(ctx, {
        provider: "cloudflare",
        runId: writeLock.runId,
        status: writeLock.state === "failed" ? "failed" : "running",
        fallbackUpdatedAt: writeLock.updatedAt,
      });
    }
    const runningCreateRun = await readRunningProviderRunSummary(ctx, {
      provider: "cloudflare",
      runId: vault.runId,
    });
    return runningCreateRun ?? { status: "not_applicable" };
  }
  if (writeLock?.state === "active") {
    return await readProviderRunSummary(ctx, {
      provider: "cloudflare",
      runId: writeLock.runId,
      status: "running",
      fallbackUpdatedAt: writeLock.updatedAt,
    });
  }

  return { status: "ready" };
}

function compareCloudflareWorkerSortOrder(left: CloudflareWorker, right: CloudflareWorker): number {
  return (
    left.workerName.localeCompare(right.workerName) ||
    left.accountId.localeCompare(right.accountId) ||
    left.workerTag.localeCompare(right.workerTag) ||
    left._id.localeCompare(right._id)
  );
}

function compareConvexProjectSortOrder(left: ConvexProject, right: ConvexProject): number {
  return (
    left.convexConfigPath.localeCompare(right.convexConfigPath) ||
    left.projectId.localeCompare(right.projectId) ||
    left.teamId.localeCompare(right.teamId) ||
    left._id.localeCompare(right._id)
  );
}

const vVaultBranchFilters = object({
  vaultId: id("vaults"),
  hiddenLabels: array(string()),
  includeDrafts: boolean(),
  includeNoLabel: optional(boolean()),
});

// MARK: Public

export const getUserVaultBranchFilters = query({
  access: "access_dashboard",
  args: {},
  returns: array(vVaultBranchFilters),
  handler: async (ctx) => {
    return (
      await ctx.db
        .query("ui_vaultBranches_filters")
        .withIndex("by_user", (q) => q.eq("userId", ctx.viewer.userId))
        .collect()
    ).map((vaultBranchFilter) => ({
      vaultId: vaultBranchFilter.vaultId,
      hiddenLabels: vaultBranchFilter.hiddenLabels,
      includeDrafts: vaultBranchFilter.includeDrafts,
      includeNoLabel: vaultBranchFilter.includeNoLabel !== false,
    }));
  },
});

export const getUserVaultResourceLinksState = query({
  access: "access_dashboard",
  args: {},
  returns: array(vVaultResourceLinksState),
  handler: async (ctx) => {
    const states = (
      await ctx.db
        .query("ui_vaultResourceLinks_settings")
        .withIndex("by_user", (q) => q.eq("userId", ctx.viewer.userId))
        .collect()
    ).map((state) => ({
      resourceLinksOpen: state.resourceLinksOpen,
      vaultId: state.vaultId,
    }));

    return states.sort((left, right) => left.vaultId.localeCompare(right.vaultId));
  },
});

export const setVaultResourceLinksOpen = mutation({
  access: "access_dashboard",
  args: vVaultResourceLinksState,
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = ctx.viewer.userId;
    const vault = await ctx.db.get(args.vaultId);
    if (!vault || vault.userId !== userId) {
      throw new Error("Vault not found");
    }
    if (isVaultDeletingOrDeleteFailed(vault)) {
      throw new Error("Vault deletion is in progress.");
    }

    const existing = await ctx.db
      .query("ui_vaultResourceLinks_settings")
      .withIndex("by_user_and_vault", (q) => q.eq("userId", userId).eq("vaultId", args.vaultId))
      .first();
    const nextState = {
      resourceLinksOpen: args.resourceLinksOpen,
      updatedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, nextState);
      return;
    }

    await ctx.db.insert("ui_vaultResourceLinks_settings", {
      userId,
      vaultId: args.vaultId,
      ...nextState,
    });
  },
});

export const setVaultBranchFilters = mutation({
  access: "access_dashboard",
  args: vVaultBranchFilters,
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = ctx.viewer.userId;
    const vault = await ctx.db.get(args.vaultId);
    if (!vault || vault.userId !== userId) {
      throw new Error("Vault not found");
    }
    if (isVaultDeletingOrDeleteFailed(vault)) {
      throw new Error("Vault deletion is in progress.");
    }

    const existing = await ctx.db
      .query("ui_vaultBranches_filters")
      .withIndex("by_user_and_vault", (q) => q.eq("userId", userId).eq("vaultId", args.vaultId))
      .first();
    const shouldPersist =
      args.hiddenLabels.length > 0 || args.includeDrafts === true || args.includeNoLabel === false;

    if (!shouldPersist) {
      if (existing) {
        await ctx.db.delete(existing._id);
      }
      return;
    }

    if (existing) {
      await ctx.db.patch(existing._id, {
        hiddenLabels: args.hiddenLabels,
        includeDrafts: args.includeDrafts,
        includeNoLabel: args.includeNoLabel !== false,
      });
    } else {
      await ctx.db.insert("ui_vaultBranches_filters", {
        userId,
        vaultId: args.vaultId,
        hiddenLabels: args.hiddenLabels,
        includeDrafts: args.includeDrafts,
        includeNoLabel: args.includeNoLabel !== false,
      });
    }
  },
});

function groupVaultRows<Row extends { vaultId: Id<"vaults"> }>(
  rows: Row[],
): Map<Id<"vaults">, Row[]> {
  const rowsByVault = new Map<Id<"vaults">, Row[]>();
  for (const row of rows) {
    const vaultRows = rowsByVault.get(row.vaultId);
    if (vaultRows) {
      vaultRows.push(row);
    } else {
      rowsByVault.set(row.vaultId, [row]);
    }
  }
  return rowsByVault;
}

async function readUserVaults(
  ctx: Pick<QueryCtx, "db">,
  userId: Id<"users">,
): Promise<UserVaultsResult> {
  const [vaults, userConvexProjects, userCloudflareWorkers] = await Promise.all([
    ctx.db
      .query("vaults")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect(),
    ctx.db
      .query("vaultConvexProjects")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect(),
    ctx.db
      .query("vaultCloudflareWorkers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect(),
  ]);
  const convexProjectsByVault = groupVaultRows(userConvexProjects);
  const cloudflareWorkersByVault = groupVaultRows(userCloudflareWorkers);
  const connectedVaults = vaults.filter(isConnectedVault);
  const initializingVaultResults: UserVaultResult[] = [];
  for (const vault of vaults) {
    if (vault.state !== "provisioning" && vault.state !== "failed") {
      continue;
    }
    const deletion = await resolveVaultDeletionSummary(ctx, vault);
    initializingVaultResults.push({
      _id: vault._id,
      _creationTime: vault._creationTime,
      ghRepoOwner: vault.owner,
      ghRepoName: vault.name,
      repositoryFullName: `${vault.owner}/${vault.name}`,
      commitSHA: undefined,
      fileCount: 0,
      lastEditTime: undefined,
      lastTreeRefreshAt: vault.lastTreeRefreshAt,
      treeRefreshStartedAt: vault.treeRefreshStartedAt,
      lastTreeRefreshFailedAt: vault.lastTreeRefreshFailedAt,
      treeRefreshFailureKind: vault.treeRefreshFailureKind,
      treeRefreshFailureMessage: vault.treeRefreshFailureMessage,
      treeRefreshCooldownUntil: vault.treeRefreshCooldownUntil,
      state: vault.state === "failed" ? "failed" : "copying_files",
      sourceSetup: await resolveSourceSetupSummary(ctx, {
        hasUsableDefaultBranchTree: false,
        vault,
      }),
      providerSetup: { status: "not_applicable" },
      deletion,
      isSamebaseManaged: vault.githubMode === "create_repository",
      hasConnectedGitHubRepository: false,
      hasConvexProvision: false,
      hasCloudflareProvision: false,
      canRemoveConvexProvision: false,
      canRemoveCloudflareProvision: false,
      cloudflareWorkers: [],
      convexProjects: [],
    });
  }

  const vaultResults: UserVaultResult[] = await Promise.all(
    connectedVaults.map(async (vault) => {
      const deletion = await resolveVaultDeletionSummary(ctx, vault);
      const convexProjects = (convexProjectsByVault.get(vault._id) ?? []).sort(
        compareConvexProjectSortOrder,
      );
      const cloudflareWorkers = (cloudflareWorkersByVault.get(vault._id) ?? []).sort(
        compareCloudflareWorkerSortOrder,
      );
      const hasConvexProvision = convexProjects.length > 0;
      const hasCloudflareProvision = cloudflareWorkers.length > 0;
      const canRemoveCloudflareProvision = cloudflareWorkers.some(
        (worker) => worker.origin === "provisioned",
      );
      const cloudflareWorkerSummaries = cloudflareWorkers.map((worker) => ({
        workerId: worker._id,
        accountId: worker.accountId,
        workerName: worker.workerName,
        workerTag: worker.workerTag,
      }));
      const convexProjectSummaries = convexProjects.map((project) => ({
        convexProjectId: project._id,
        teamId: project.teamId,
        projectId: project.projectId,
        convexConfigPath: project.convexConfigPath,
      }));
      if (deletion.state !== "not_deleting") {
        return {
          _id: vault._id,
          _creationTime: vault._creationTime,
          ghRepoOwner: vault.owner,
          ghRepoName: vault.name,
          repositoryFullName: `${vault.owner}/${vault.name}`,
          commitSHA: undefined,
          fileCount: 0,
          lastEditTime: undefined,
          lastTreeRefreshAt: vault.lastTreeRefreshAt,
          treeRefreshStartedAt: vault.treeRefreshStartedAt,
          lastTreeRefreshFailedAt: vault.lastTreeRefreshFailedAt,
          treeRefreshFailureKind: vault.treeRefreshFailureKind,
          treeRefreshFailureMessage: vault.treeRefreshFailureMessage,
          treeRefreshCooldownUntil: vault.treeRefreshCooldownUntil,
          state: deletion.state === "delete_failed" ? "failed" : "copying_files",
          sourceSetup: { status: "not_applicable" },
          providerSetup: { status: "not_applicable" },
          deletion,
          isSamebaseManaged: isSamebaseManagedVault(vault),
          hasConnectedGitHubRepository: true,
          hasConvexProvision,
          hasCloudflareProvision,
          canRemoveConvexProvision: false,
          canRemoveCloudflareProvision,
          cloudflareWorkers: cloudflareWorkerSummaries,
          convexProjects: convexProjectSummaries,
        };
      }

      const [stagingData, defaultBranchTree] = await Promise.all([
        ctx.db
          .query("vaultStagedFiles")
          .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
          .collect(),
        ctx.db
          .query("observations_vaultRepository_branchTrees")
          .withIndex("by_vault_and_branch", (q) =>
            q.eq("vaultId", vault._id).eq("branch", vault.defaultBranch),
          )
          .first(),
      ]);

      const fileCount = stagingData.filter(hasBranchStagingChanges).length;

      const lastEditTime =
        stagingData.length > 0 ? Math.max(...stagingData.map((s) => s.lastEditTime)) : undefined;

      const repositoryFullName = `${vault.owner}/${vault.name}`;
      const hasUsableDefaultBranchTree = Boolean(defaultBranchTree);
      const sourceSetup = await resolveSourceSetupSummary(ctx, {
        hasUsableDefaultBranchTree,
        vault,
      });
      const providerSetup = hasUsableDefaultBranchTree
        ? await resolveProviderSetupSummary(ctx, vault, convexProjects, cloudflareWorkers)
        : { status: "not_applicable" as const };
      const canRemoveConvexProvision = convexProjects.some(
        (project) => project.origin === "provisioned",
      );
      return {
        _id: vault._id,
        _creationTime: vault._creationTime,
        ghRepoOwner: vault.owner,
        ghRepoName: vault.name,
        repositoryFullName,
        commitSHA: defaultBranchTree?.commitSHA,
        fileCount,
        lastEditTime,
        lastTreeRefreshAt: vault.lastTreeRefreshAt,
        treeRefreshStartedAt: vault.treeRefreshStartedAt,
        lastTreeRefreshFailedAt: vault.lastTreeRefreshFailedAt,
        treeRefreshFailureKind: vault.treeRefreshFailureKind,
        treeRefreshFailureMessage: vault.treeRefreshFailureMessage,
        treeRefreshCooldownUntil: vault.treeRefreshCooldownUntil,
        state: hasUsableDefaultBranchTree ? "ready" : "copying_files",
        sourceSetup,
        providerSetup,
        deletion,
        isSamebaseManaged: isSamebaseManagedVault(vault),
        hasConnectedGitHubRepository: true,
        hasConvexProvision,
        hasCloudflareProvision,
        canRemoveConvexProvision,
        canRemoveCloudflareProvision,
        cloudflareWorkers: cloudflareWorkerSummaries,
        convexProjects: convexProjectSummaries,
      };
    }),
  );

  // Sort by last edit time if available, otherwise by creation time
  return [...vaultResults, ...initializingVaultResults].sort((a, b) => {
    const aTime = a.lastEditTime ?? a._creationTime;
    const bTime = b.lastEditTime ?? b._creationTime;
    return (
      bTime - aTime ||
      a.repositoryFullName.localeCompare(b.repositoryFullName) ||
      a._id.localeCompare(b._id)
    );
  });
}

export const getUserVaults = query({
  access: getUserVaultsContract.access,
  args: getUserVaultsContract.args,
  returns: getUserVaultsContract.returns,
  mcp: getUserVaultsContract.mcp,
  handler: async (ctx): Promise<UserVaultsResult> => {
    return await readUserVaults(ctx, ctx.viewer.userId);
  },
});

export const getUserVaultsForUser = internalQuery({
  args: {
    userId: id("users"),
  },
  returns: getUserVaultsContract.returns,
  handler: async (ctx, args): Promise<UserVaultsResult> => {
    const viewer = await ctx.runQuery(internal.functions.resolveViewerForUserId, {
      userId: args.userId,
    });
    if (viewer.user === null || !canAccess(getUserVaultsContract.access, viewer.accessKeys)) {
      throw new Error("Access denied");
    }

    return await readUserVaults(ctx, args.userId);
  },
});
