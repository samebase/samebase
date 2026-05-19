import { v, type Infer } from "convex/values";
import { mutation, query, type QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { getUserId } from "../common";
import { vAppProvisioningRunStep, vPullRequestLabel } from "../schema";
import { vTreeRefreshFailureKind } from "./model";
import {
  isConnectedVault,
  isLiveConnectedVault,
  isNoterManagedVault,
  type NoterManagedConnectedVault,
} from "./state";
import { vVaultDeletionStep } from "./deletion/model";
import { readVaultDeletionEligibility } from "./deletion/eligibility";
import {
  isVaultDeletingOrDeleteFailed,
  readVaultDeletionState,
} from "./deletion/state";
import {
  compareRemoteBranchSortOrder,
  hasBranchStagingChanges,
} from "./branches";

const nullValidator = v.null();
const { array, boolean, id, literal, number, object, optional, string, union } =
  v;
const cloudflarePreviewMetadataFields = {
  cloudflareBranchPreviewUrl: optional(string()),
  cloudflarePreviewPullRequestNumber: optional(number()),
  cloudflarePreviewUrl: optional(string()),
  cloudflarePreviewCommitSha: optional(string()),
  cloudflarePreviewStatus: optional(string()),
  cloudflarePreviewLogsUrl: optional(string()),
  cloudflarePreviewCommentCreatedAt: optional(number()),
} as const;
const treeRefreshFailureFields = {
  lastTreeRefreshFailedAt: optional(number()),
  treeRefreshFailureKind: optional(vTreeRefreshFailureKind),
  treeRefreshFailureMessage: optional(string()),
  treeRefreshCooldownUntil: optional(number()),
} as const;
const sourceSetupSummary = union(
  object({
    status: literal("not_applicable"),
  }),
  object({
    status: literal("ready"),
  }),
  object({
    status: literal("running"),
    runId: id("appProvisioningRuns"),
    step: vAppProvisioningRunStep,
    updatedAt: number(),
  }),
  object({
    status: literal("failed"),
    runId: id("appProvisioningRuns"),
    step: vAppProvisioningRunStep,
    message: string(),
    updatedAt: number(),
  }),
);
const providerSetupProvider = union(literal("convex"), literal("cloudflare"));
const providerSetupSummary = union(
  object({
    status: literal("not_applicable"),
  }),
  object({
    status: literal("ready"),
  }),
  object({
    status: literal("running"),
    provider: providerSetupProvider,
    runId: id("appProvisioningRuns"),
    step: vAppProvisioningRunStep,
    updatedAt: number(),
  }),
  object({
    status: literal("failed"),
    provider: providerSetupProvider,
    runId: id("appProvisioningRuns"),
    step: vAppProvisioningRunStep,
    message: string(),
    updatedAt: number(),
  }),
);
const vaultDeletionSummary = union(
  object({
    state: literal("not_deleting"),
    deleteAction: union(
      object({
        state: literal("available"),
      }),
      object({
        state: literal("disabled"),
        reason: string(),
      }),
    ),
  }),
  object({
    state: literal("deleting"),
    runId: id("vaultDeletionRuns"),
    requestedAt: number(),
    currentStep: vVaultDeletionStep,
    message: string(),
    updatedAt: number(),
  }),
  object({
    state: literal("delete_failed"),
    runId: id("vaultDeletionRuns"),
    failedAt: number(),
    currentStep: vVaultDeletionStep,
    message: string(),
    lastError: string(),
    updatedAt: number(),
  }),
);

type SourceSetupSummary = Infer<typeof sourceSetupSummary>;
type ProviderSetupSummary = Infer<typeof providerSetupSummary>;
type VaultDeletionSummary = Infer<typeof vaultDeletionSummary>;
type SourceSetupVault = Extract<
  Doc<"vaults">,
  { githubMode: "create_repository" | "connect_existing_repository" }
>;
type VaultDomain = Doc<"vaultDomains">;
type VaultInfrastructureOwnership = Doc<"vaultInfrastructureOwnership">;
type ConnectedCloudflareState = Extract<
  NoterManagedConnectedVault["cloudflare"],
  { state: "connected" }
>;
const SOURCE_SETUP_ERROR_EVENT_SCAN_LIMIT = 20;

async function readLatestRunErrorMessage(
  ctx: Pick<QueryCtx, "db">,
  runId: Id<"appProvisioningRuns">,
): Promise<string | undefined> {
  const events = await ctx.db
    .query("appProvisioningEvents")
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
    runId: Id<"appProvisioningRuns">;
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

  if (
    args.status === "running" &&
    (run.state === "queued" || run.state === "running")
  ) {
    return {
      status: "running",
      provider: args.provider,
      runId: args.runId,
      step: run.currentStep,
      updatedAt: run.updatedAt,
    };
  }

  const message =
    (await readLatestRunErrorMessage(ctx, args.runId)) ??
    run.lastError ??
    `Provisioning failed during ${run.currentStep}.`;
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
 * The create workflow can sync the first tree before infra ownership is claimed;
 * keep the setup log visible during that handoff instead of flashing empty UI.
 */
async function readRunningProviderRunSummary(
  ctx: Pick<QueryCtx, "db">,
  args: {
    provider: "convex" | "cloudflare";
    runId: Id<"appProvisioningRuns">;
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
  runId: Id<"vaultDeletionRuns">,
): Promise<Doc<"vaultDeletionEvents"> | null> {
  return await ctx.db
    .query("vaultDeletionEvents")
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
        updatedAt:
          run?.updatedAt ?? latestEvent?.createdAt ?? deletion.requestedAt,
      };
    }
    case "delete_failed": {
      const [run, latestEvent] = await Promise.all([
        ctx.db.get(deletion.runId),
        readLatestDeletionEvent(ctx, deletion.runId),
      ]);
      const lastError =
        run?.state === "failed" ? run.lastError : "Vault deletion failed.";
      return {
        state: "delete_failed",
        runId: deletion.runId,
        failedAt: deletion.failedAt,
        currentStep: run?.currentStep ?? "initialize_deletion",
        message: latestEvent?.message ?? lastError,
        lastError,
        updatedAt:
          run?.updatedAt ?? latestEvent?.createdAt ?? deletion.failedAt,
      };
    }
    default: {
      deletion satisfies never;
      throw new Error("Unknown vault deletion state.");
    }
  }
}

async function readActiveVaultInfrastructureOwnership(
  ctx: Pick<QueryCtx, "db">,
  vaultId: Id<"vaults">,
): Promise<VaultInfrastructureOwnership | null> {
  const ownership = await ctx.db
    .query("vaultInfrastructureOwnership")
    .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
    .first();
  if (!ownership) {
    return null;
  }
  if (ownership.state !== "active") {
    return null;
  }
  return ownership;
}

async function resolveProviderSetupSummary(
  ctx: Pick<QueryCtx, "db">,
  vault: NoterManagedConnectedVault,
): Promise<ProviderSetupSummary> {
  const cloudflare = vault.cloudflare;
  if (vault.convex.state === "failed") {
    return await readProviderRunSummary(ctx, {
      provider: "convex",
      runId: vault.convex.runId,
      status: "failed",
      fallbackUpdatedAt: vault.convex.failedAt,
    });
  }
  if (cloudflare.state === "failed") {
    return await readProviderRunSummary(ctx, {
      provider: "cloudflare",
      runId: cloudflare.runId,
      status: "failed",
      fallbackUpdatedAt: cloudflare.failedAt,
    });
  }
  if (vault.convex.state === "provisioning") {
    return await readProviderRunSummary(ctx, {
      provider: "convex",
      runId: vault.convex.runId,
      status: "running",
      fallbackUpdatedAt: vault.convex.startedAt,
    });
  }
  if (cloudflare.state === "provisioning") {
    return await readProviderRunSummary(ctx, {
      provider: "cloudflare",
      runId: cloudflare.runId,
      status: "running",
      fallbackUpdatedAt: cloudflare.startedAt,
    });
  }
  if (vault.convex.state === "connected" && cloudflare.state === "connected") {
    return { status: "ready" };
  }

  const activeOwnership = await readActiveVaultInfrastructureOwnership(
    ctx,
    vault._id,
  );
  if (vault.convex.state === "not_configured") {
    if (activeOwnership) {
      return await readProviderRunSummary(ctx, {
        provider: "convex",
        runId: activeOwnership.runId,
        status: "running",
        fallbackUpdatedAt: activeOwnership.updatedAt,
      });
    }
    const runningCreateRun = await readRunningProviderRunSummary(ctx, {
      provider: "convex",
      runId: vault.runId,
    });
    return runningCreateRun ?? { status: "not_applicable" };
  }
  if (cloudflare.state === "not_configured") {
    if (activeOwnership) {
      return await readProviderRunSummary(ctx, {
        provider: "cloudflare",
        runId: activeOwnership.runId,
        status: "running",
        fallbackUpdatedAt: activeOwnership.updatedAt,
      });
    }
    const runningCreateRun = await readRunningProviderRunSummary(ctx, {
      provider: "cloudflare",
      runId: vault.runId,
    });
    return runningCreateRun ?? { status: "not_applicable" };
  }

  return { status: "not_applicable" };
}

function compareVaultDomainSortOrder(
  left: VaultDomain,
  right: VaultDomain,
): number {
  const leftKindOrder = left.kind === "main" ? 0 : 1;
  const rightKindOrder = right.kind === "main" ? 0 : 1;
  return (
    leftKindOrder - rightKindOrder ||
    left.branch.localeCompare(right.branch) ||
    left.url.localeCompare(right.url) ||
    left.source.localeCompare(right.source)
  );
}

const vaultBranchFiltersValidator = object({
  vaultId: id("vaults"),
  hiddenLabels: array(string()),
  includeDrafts: boolean(),
  includeNoLabel: optional(boolean()),
  branchesExpanded: optional(boolean()),
});
type VaultBranchFilters = Infer<typeof vaultBranchFiltersValidator>;

/**
 * Dashboard URLs fail closed when provider metadata is partial. Trim before
 * checking presence and encode every segment before handing it to the browser.
 */
function buildCloudflareWorkerDashboardUrl(
  cloudflare:
    | Pick<ConnectedCloudflareState, "accountId" | "workerName">
    | null
    | undefined,
): string | undefined {
  if (!cloudflare) {
    return undefined;
  }

  const accountId = cloudflare.accountId.trim();
  const workerName = cloudflare.workerName.trim();
  if (accountId.length === 0 || workerName.length === 0) {
    return undefined;
  }

  return `https://dash.cloudflare.com/?to=/${encodeURIComponent(accountId)}/workers/services/view/${encodeURIComponent(workerName)}/production/deployments`;
}

/**
 * Convex dashboard URLs are only useful with real team/project/deploy slugs.
 * Return nothing for blank metadata so the dashboard never renders fake links.
 */
export function buildConvexDeploymentDashboardUrl(args: {
  deploymentName: string | undefined;
  projectSlug: string | undefined;
  teamSlug: string | undefined;
}): string | undefined {
  const normalizedTeamSlug = args.teamSlug?.trim();
  const normalizedProjectSlug = args.projectSlug?.trim();
  const normalizedDeploymentName = args.deploymentName?.trim();
  if (
    !normalizedTeamSlug ||
    !normalizedProjectSlug ||
    !normalizedDeploymentName
  ) {
    return undefined;
  }

  return `https://dashboard.convex.dev/t/${encodeURIComponent(normalizedTeamSlug)}/${encodeURIComponent(normalizedProjectSlug)}/${encodeURIComponent(normalizedDeploymentName)}`;
}

/**
 * Project settings use the project scope, not a deployment scope. Keep the link
 * hidden until both dashboard slugs are known.
 */
export function buildConvexProjectSettingsDashboardUrl(args: {
  projectSlug: string | undefined;
  teamSlug: string | undefined;
}): string | undefined {
  const normalizedTeamSlug = args.teamSlug?.trim();
  const normalizedProjectSlug = args.projectSlug?.trim();
  if (!normalizedTeamSlug || !normalizedProjectSlug) {
    return undefined;
  }

  return `https://dashboard.convex.dev/t/${encodeURIComponent(normalizedTeamSlug)}/${encodeURIComponent(normalizedProjectSlug)}/settings`;
}

function encodeConvexDashboardPath(value: string): string {
  return value.split("/").map(encodeURIComponent).join("/");
}

/**
 * Preview deployment dashboards are branch-scoped. Preserve branch slash
 * separators while still encoding each path segment.
 */
export function buildConvexPreviewDeploymentDashboardUrl(args: {
  branchName: string | undefined;
  projectSlug: string | undefined;
  teamSlug: string | undefined;
}): string | undefined {
  const normalizedTeamSlug = args.teamSlug?.trim();
  const normalizedProjectSlug = args.projectSlug?.trim();
  const normalizedBranchName = args.branchName?.trim();
  if (!normalizedTeamSlug || !normalizedProjectSlug || !normalizedBranchName) {
    return undefined;
  }

  return `https://dashboard.convex.dev/t/${encodeURIComponent(normalizedTeamSlug)}/${encodeURIComponent(normalizedProjectSlug)}/preview/${encodeConvexDashboardPath(normalizedBranchName)}`;
}

// MARK: Public

export const getUserVaultBranchFilters = query({
  args: {},
  returns: array(vaultBranchFiltersValidator),
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    return (
      await ctx.db
        .query("vaultBranchFilters")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect()
    ).map((vaultBranchFilter) => ({
      vaultId: vaultBranchFilter.vaultId,
      hiddenLabels: vaultBranchFilter.hiddenLabels,
      includeDrafts: vaultBranchFilter.includeDrafts,
      includeNoLabel: vaultBranchFilter.includeNoLabel !== false,
      branchesExpanded: vaultBranchFilter.branchesExpanded === true,
    }));
  },
});

export const setVaultBranchFilters = mutation({
  args: vaultBranchFiltersValidator,
  returns: nullValidator,
  handler: async (ctx, args: VaultBranchFilters) => {
    const userId = await getUserId(ctx);
    const vault = await ctx.db.get(args.vaultId);
    if (!vault || vault.userId !== userId) {
      throw new Error("Vault not found");
    }
    if (isVaultDeletingOrDeleteFailed(vault)) {
      throw new Error("Vault deletion is in progress.");
    }

    const existing = await ctx.db
      .query("vaultBranchFilters")
      .withIndex("by_user_and_vault", (q) =>
        q.eq("userId", userId).eq("vaultId", args.vaultId),
      )
      .first();
    const shouldPersist =
      args.hiddenLabels.length > 0 ||
      args.includeDrafts === true ||
      args.includeNoLabel === false ||
      args.branchesExpanded === true;

    if (!shouldPersist) {
      if (existing) {
        await ctx.db.delete(existing._id);
      }
      return null;
    }

    if (existing) {
      await ctx.db.patch(existing._id, {
        hiddenLabels: args.hiddenLabels,
        includeDrafts: args.includeDrafts,
        includeNoLabel: args.includeNoLabel !== false,
        branchesExpanded: args.branchesExpanded === true,
      });
    } else {
      await ctx.db.insert("vaultBranchFilters", {
        userId,
        vaultId: args.vaultId,
        hiddenLabels: args.hiddenLabels,
        includeDrafts: args.includeDrafts,
        includeNoLabel: args.includeNoLabel !== false,
        branchesExpanded: args.branchesExpanded === true,
      });
    }

    return null;
  },
});

const getUserVaultsResult = array(
  object({
    _id: id("vaults"),
    _creationTime: number(),
    ghRepoOwner: string(),
    ghRepoName: string(),
    repositoryFullName: string(),
    commitSHA: optional(string()),
    fileCount: number(),
    lastEditTime: optional(number()),
    lastTreeRefreshAt: optional(number()),
    treeRefreshStartedAt: optional(number()),
    ...treeRefreshFailureFields,
    state: union(literal("copying_files"), literal("ready"), literal("failed")),
    sourceSetup: sourceSetupSummary,
    providerSetup: providerSetupSummary,
    deletion: vaultDeletionSummary,
    isNoterManaged: boolean(),
    hasConnectedGitHubRepository: boolean(),
    hasConvexProvision: boolean(),
    hasCloudflareProvision: boolean(),
    remoteBranches: array(
      object({
        name: string(),
        headCommitSha: string(),
        lastCommitAt: optional(number()),
        aheadBy: optional(number()),
        behindBy: optional(number()),
        pullRequestUrl: optional(string()),
        pullRequestNumber: optional(number()),
        pullRequestLabels: optional(array(vPullRequestLabel)),
        pullRequestTitle: optional(string()),
        pullRequestIsDraft: optional(boolean()),
        isDefault: boolean(),
        isProtected: boolean(),
        remoteState: union(literal("active"), literal("deleted_upstream")),
        lastSyncedAt: number(),
        ...cloudflarePreviewMetadataFields,
        convexPreviewDeploymentDashboardUrl: optional(string()),
      }),
    ),
    cloudflareProductionUrl: optional(string()),
    cloudflareWorkerName: optional(string()),
    cloudflareProjectDashboardUrl: optional(string()),
    convexProjectSlug: optional(string()),
    convexProjectSettingsDashboardUrl: optional(string()),
    convexDeploymentDashboardUrl: optional(string()),
  }),
);

type UserVaultResult = Infer<typeof getUserVaultsResult>[number];

// Get user's vaults with optional file staging stats
export const getUserVaults = query({
  args: {},
  returns: getUserVaultsResult,
  handler: async (ctx, _args) => {
    const userId = await getUserId(ctx);

    // Get user's vaults
    const vaults = await ctx.db
      .query("vaults")
      .filter((q) => q.eq(q.field("userId"), userId))
      .collect();
    const convexConnection = await ctx.db
      .query("providerConnections")
      .withIndex("by_user_kind", (q) =>
        q.eq("userId", userId).eq("kind", "convex"),
      )
      .first();
    const convexTeamDashboardSlug =
      convexConnection?.kind === "convex"
        ? convexConnection.teamSlug
        : undefined;

    // Pre-GitHub vaults render as non-ready cards; repo-backed controls stay
    // gated until a connected vault has branch data.
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
        isNoterManaged: vault.githubMode === "create_repository",
        hasConnectedGitHubRepository: false,
        hasConvexProvision: false,
        hasCloudflareProvision: false,
        remoteBranches: [],
        cloudflareProductionUrl: undefined,
        cloudflareWorkerName: undefined,
        cloudflareProjectDashboardUrl: undefined,
        convexProjectSlug: undefined,
        convexProjectSettingsDashboardUrl: undefined,
        convexDeploymentDashboardUrl: undefined,
      });
    }

    // Get staging stats for each vault
    const vaultResults: UserVaultResult[] = await Promise.all(
      connectedVaults.map(async (vault) => {
        const deletion = await resolveVaultDeletionSummary(ctx, vault);
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
            state:
              deletion.state === "delete_failed" ? "failed" : "copying_files",
            sourceSetup: { status: "not_applicable" },
            providerSetup: { status: "not_applicable" },
            deletion,
            isNoterManaged: isNoterManagedVault(vault),
            hasConnectedGitHubRepository: true,
            hasConvexProvision: vault.convex.state === "connected",
            hasCloudflareProvision: vault.cloudflare.state === "connected",
            remoteBranches: [],
            cloudflareProductionUrl: undefined,
            cloudflareWorkerName: undefined,
            cloudflareProjectDashboardUrl: undefined,
            convexProjectSlug: undefined,
            convexProjectSettingsDashboardUrl: undefined,
            convexDeploymentDashboardUrl: undefined,
          };
        }

        const [stagingData, remoteBranches, defaultBranchTree] =
          await Promise.all([
            ctx.db
              .query("fileStaging")
              .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
              .collect(),
            ctx.db
              .query("vaultRemoteBranches")
              .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
              .collect(),
            ctx.db
              .query("vaultBranchTrees")
              .withIndex("by_vault_and_branch", (q) =>
                q.eq("vaultId", vault._id).eq("branch", vault.defaultBranch),
              )
              .first(),
          ]);

        const fileCount = stagingData.filter(hasBranchStagingChanges).length;

        const lastEditTime =
          stagingData.length > 0
            ? Math.max(...stagingData.map((s) => s.lastEditTime))
            : undefined;

        const repositoryFullName = `${vault.owner}/${vault.name}`;
        const hasUsableDefaultBranchTree = Boolean(defaultBranchTree);
        const sourceSetup = await resolveSourceSetupSummary(ctx, {
          hasUsableDefaultBranchTree,
          vault,
        });
        const providerSetup =
          isNoterManagedVault(vault) && hasUsableDefaultBranchTree
            ? await resolveProviderSetupSummary(ctx, vault)
            : { status: "not_applicable" as const };
        const hasConvexProvision = vault.convex.state === "connected";
        const cloudflare = vault.cloudflare;
        const hasCloudflareProvision = cloudflare.state === "connected";
        const convexProjectSlug =
          vault.convex.state === "connected"
            ? vault.convex.projectSlug
            : undefined;
        const convexDeploymentName =
          vault.convex.state === "connected"
            ? vault.convex.deploymentName
            : undefined;
        const connectedCloudflare =
          cloudflare.state === "connected" ? cloudflare : null;

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
          isNoterManaged: isNoterManagedVault(vault),
          hasConnectedGitHubRepository: true,
          hasConvexProvision,
          hasCloudflareProvision,
          remoteBranches: remoteBranches
            .sort(compareRemoteBranchSortOrder)
            .map((branch) => ({
              name: branch.name,
              headCommitSha: branch.headCommitSha,
              lastCommitAt: branch.lastCommitAt,
              aheadBy: branch.aheadBy,
              behindBy: branch.behindBy,
              pullRequestUrl: branch.pullRequestUrl,
              pullRequestNumber: branch.pullRequestNumber,
              pullRequestLabels: branch.pullRequestLabels,
              pullRequestTitle: branch.pullRequestTitle,
              pullRequestIsDraft: branch.pullRequestIsDraft,
              isDefault: branch.isDefault,
              isProtected: branch.isProtected,
              remoteState: branch.remoteState,
              lastSyncedAt: branch.lastSyncedAt,
              cloudflareBranchPreviewUrl: branch.cloudflareBranchPreviewUrl,
              cloudflarePreviewPullRequestNumber:
                branch.cloudflarePreviewPullRequestNumber,
              cloudflarePreviewUrl: branch.cloudflarePreviewUrl,
              cloudflarePreviewCommitSha: branch.cloudflarePreviewCommitSha,
              cloudflarePreviewStatus: branch.cloudflarePreviewStatus,
              cloudflarePreviewLogsUrl: branch.cloudflarePreviewLogsUrl,
              cloudflarePreviewCommentCreatedAt:
                branch.cloudflarePreviewCommentCreatedAt,
              convexPreviewDeploymentDashboardUrl:
                !branch.isDefault &&
                branch.remoteState === "active" &&
                typeof branch.cloudflareBranchPreviewUrl === "string" &&
                branch.pullRequestNumber ===
                  branch.cloudflarePreviewPullRequestNumber
                  ? buildConvexPreviewDeploymentDashboardUrl({
                      branchName: branch.name,
                      projectSlug: convexProjectSlug,
                      teamSlug: convexTeamDashboardSlug,
                    })
                  : undefined,
            })),
          cloudflareProductionUrl: connectedCloudflare?.productionUrl,
          cloudflareWorkerName: connectedCloudflare?.workerName,
          cloudflareProjectDashboardUrl:
            buildCloudflareWorkerDashboardUrl(connectedCloudflare),
          convexProjectSlug,
          convexProjectSettingsDashboardUrl:
            buildConvexProjectSettingsDashboardUrl({
              projectSlug: convexProjectSlug,
              teamSlug: convexTeamDashboardSlug,
            }),
          convexDeploymentDashboardUrl: buildConvexDeploymentDashboardUrl({
            deploymentName: convexDeploymentName,
            projectSlug: convexProjectSlug,
            teamSlug: convexTeamDashboardSlug,
          }),
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
  },
});

export const getVaultInfrastructure = query({
  args: {
    vaultId: v.id("vaults"),
  },
  returns: v.union(
    v.object({
      providerSetup: providerSetupSummary,
      infrastructure: v.optional(
        v.object({
          convexProjectId: v.optional(v.string()),
          convexProjectSlug: v.optional(v.string()),
          convexDeploymentName: v.optional(v.string()),
          convexCloudUrl: v.optional(v.string()),
          convexSiteUrl: v.optional(v.string()),
        }),
      ),
      domains: v.array(
        v.object({
          branch: v.string(),
          kind: v.union(v.literal("main"), v.literal("branch_preview")),
          url: v.string(),
          source: v.union(
            v.literal("cloudflare_workers_default"),
            v.literal("cloudflare_workers_custom"),
          ),
          active: v.boolean(),
        }),
      ),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const vault = await ctx.db.get(args.vaultId);
    if (!vault || vault.userId !== userId) {
      return null;
    }
    if (!isLiveConnectedVault(vault)) {
      return null;
    }

    const infrastructure = await ctx.db
      .query("vaultInfrastructure")
      .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
      .first();

    const domains = await ctx.db
      .query("vaultDomains")
      .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
      .collect();

    return {
      providerSetup: isNoterManagedVault(vault)
        ? await resolveProviderSetupSummary(ctx, vault)
        : { status: "not_applicable" as const },
      infrastructure: infrastructure
        ? {
            convexProjectId: infrastructure.convexProjectId,
            convexProjectSlug: infrastructure.convexProjectSlug,
            convexDeploymentName: infrastructure.convexDeploymentName,
            convexCloudUrl: infrastructure.convexCloudUrl,
            convexSiteUrl: infrastructure.convexSiteUrl,
          }
        : undefined,
      domains: [...domains].sort(compareVaultDomainSortOrder).map((domain) => ({
        branch: domain.branch,
        kind: domain.kind,
        url: domain.url,
        source: domain.source,
        active: domain.active,
      })),
    };
  },
});
