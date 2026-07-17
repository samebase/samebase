import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalQuery, type QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { mutation, query } from "../functions";
import {
  isConnectedVault,
  isLiveConnectedVault,
  isSamebaseManagedVault,
  type ConnectedVault,
} from "./state";
import { readVaultDeletionEligibility } from "./deletion/eligibility";
import { isVaultDeletingOrDeleteFailed, readVaultDeletionState } from "./deletion/state";
import { hasBranchStagingChanges } from "./branches";
import { normalizeVaultRootDirectory } from "../../shared/vaultRootDirectory";
import { vVaultResourceLinksState } from "./resourceLinksStateModel";
import { canAccess } from "../../shared/accessModel";
import {
  getUserVaultsContract,
  type CloudflareWorkerGithubRepositoryConnection,
  type ProviderResourceUpstream,
  type ProviderSetupSummary,
  type SourceSetupSummary,
  type UserVaultResult,
  type UserVaultsResult,
  type VaultDeletionSummary,
  vProviderSetupSummary,
} from "./contracts/getUserVaults";
import { isVaultProviderUpstreamPresent, readVaultProviderUpstreamPresence } from "./model";

const { array, boolean, id, object, optional, string } = v;
type SourceSetupVault = Extract<
  Doc<"vaults">,
  { githubMode: "create_repository" | "connect_existing_repository" }
>;
type VaultDomain = Doc<"vaultDomains">;
type VaultInfrastructureOwnership = Doc<"vaultInfrastructureOwnership">;
type VaultApp = Doc<"vaultApps">;
type ConnectedConvexDeployment = Doc<"vaultConvexDeployments">;
type ConnectedCloudflareWorker = Doc<"vaultCloudflareWorkers">;
type WorkerDeploymentDependency = Doc<"vaultWorkerDeploymentDependencies">;
const SOURCE_SETUP_ERROR_EVENT_SCAN_LIMIT = 20;

function canRemoveConvexProvisionForDeployment(deployment: ConnectedConvexDeployment): boolean {
  return deployment.origin === "provisioned";
}

function resolveConvexDeploymentUpstream(
  deployment: ConnectedConvexDeployment,
): ProviderResourceUpstream {
  const upstream = readVaultProviderUpstreamPresence(deployment);
  if (upstream.state === "present") {
    return { state: "present" };
  }
  return {
    state: "missing_upstream",
    nextAction:
      deployment.origin === "provisioned"
        ? "retry_infrastructure_provisioning"
        : "connect_convex_deployment",
  };
}

function resolveCloudflareWorkerUpstream(
  worker: ConnectedCloudflareWorker,
): ProviderResourceUpstream {
  const upstream = readVaultProviderUpstreamPresence(worker);
  if (upstream.state === "present") {
    return { state: "present" };
  }
  return {
    state: "missing_upstream",
    nextAction:
      worker.origin === "provisioned"
        ? "retry_infrastructure_provisioning"
        : "connect_cloudflare_worker",
  };
}

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

/**
 * Managed runs only exist on Samebase-managed vaults (create workflow), where
 * the run retry action is available. A failed manual run repairs by re-running
 * the action that failed, so the remedy follows the run's own trigger. A
 * failed wire_builds run must not route to the attach action (specs 105/106,
 * rfcs/093).
 */
export function readProviderSetupFailedNextAction(args: {
  provider: "convex" | "cloudflare";
  source: "managed" | "manual";
  trigger?: Doc<"appProvisioningRuns">["trigger"];
}): Extract<ProviderSetupSummary, { status: "failed" }>["nextAction"] {
  if (args.source !== "manual") {
    return "retry_infrastructure_provisioning";
  }

  switch (args.trigger) {
    case "connect_convex_deployment":
    case "connect_cloudflare_worker":
    case "wire_builds":
    case "wire_convex_build_access":
    case "verify_infrastructure":
      return args.trigger;
    default:
      // Run row missing (fallback summaries): the connect flow is the safe
      // re-entry point for the provider.
      return args.provider === "convex" ? "connect_convex_deployment" : "connect_cloudflare_worker";
  }
}

async function readProviderRunSummary(
  ctx: Pick<QueryCtx, "db">,
  args: {
    provider: "convex" | "cloudflare";
    source: "managed" | "manual";
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
      source: args.source,
      runId: args.runId,
      step: "run_created",
      message: "Provisioning run not found.",
      updatedAt: args.fallbackUpdatedAt,
      nextAction: readProviderSetupFailedNextAction(args),
    };
  }

  if (args.status === "running" && (run.state === "queued" || run.state === "running")) {
    return {
      status: "running",
      provider: args.provider,
      source: args.source,
      runId: args.runId,
      step: run.currentStep,
      updatedAt: run.updatedAt,
    };
  }

  const message = run.lastError ?? `Provisioning failed during ${run.currentStep}.`;
  return {
    status: "failed",
    provider: args.provider,
    source: args.source,
    runId: args.runId,
    step: run.currentStep,
    message,
    updatedAt: run.updatedAt,
    nextAction: readProviderSetupFailedNextAction({ ...args, trigger: run.trigger }),
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
    source: "managed" | "manual";
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
    source: args.source,
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

async function readVaultInfrastructureOwnership(
  ctx: Pick<QueryCtx, "db">,
  vaultId: Id<"vaults">,
): Promise<VaultInfrastructureOwnership | null> {
  return await ctx.db
    .query("vaultInfrastructureOwnership")
    .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
    .first();
}

async function hasCreatedConvexProjectForVault(
  ctx: Pick<QueryCtx, "db">,
  vaultId: Id<"vaults">,
): Promise<boolean> {
  const runs = await ctx.db
    .query("appProvisioningRuns")
    .withIndex("by_vault_and_updated_at", (q) => q.eq("vaultId", vaultId))
    .collect();
  return runs.some(
    (run) => run.trigger === "connect_convex_deployment" && run.createdConvexProject,
  );
}

function readManualProviderFromRun(
  run: Doc<"appProvisioningRuns"> | null,
): "convex" | "cloudflare" | null {
  switch (run?.trigger) {
    case "connect_convex_deployment":
      return "convex";
    case "connect_cloudflare_worker":
    case "wire_builds":
    case "wire_convex_build_access":
    case "verify_infrastructure":
      return "cloudflare";
    default:
      return null;
  }
}

function resolveCloudflareWorkerGithubRepositoryConnection(
  worker: ConnectedCloudflareWorker,
): CloudflareWorkerGithubRepositoryConnection {
  return worker.builds.state === "connected"
    ? { state: "connected" }
    : { state: "not_connected", nextAction: "wire_builds" };
}

async function resolveProviderSetupSummary(
  ctx: Pick<QueryCtx, "db">,
  vault: ConnectedVault,
  convexDeployments: ConnectedConvexDeployment[],
  cloudflareWorkers: ConnectedCloudflareWorker[],
): Promise<ProviderSetupSummary> {
  const ownership = await readVaultInfrastructureOwnership(ctx, vault._id);
  const ownershipRun = ownership ? await ctx.db.get(ownership.runId) : null;
  const manualOwnershipProvider = readManualProviderFromRun(ownershipRun);
  if (
    ownership &&
    manualOwnershipProvider &&
    (ownership.state === "active" || ownership.state === "failed")
  ) {
    return await readProviderRunSummary(ctx, {
      provider: manualOwnershipProvider,
      source: "manual",
      runId: ownership.runId,
      status: ownership.state === "failed" ? "failed" : "running",
      fallbackUpdatedAt: ownership.updatedAt,
    });
  }

  if (convexDeployments.length === 0) {
    if (ownership?.state === "active" || ownership?.state === "failed") {
      return await readProviderRunSummary(ctx, {
        provider: "convex",
        source: "managed",
        runId: ownership.runId,
        status: ownership.state === "failed" ? "failed" : "running",
        fallbackUpdatedAt: ownership.updatedAt,
      });
    }
    const runningCreateRun = await readRunningProviderRunSummary(ctx, {
      provider: "convex",
      source: "managed",
      runId: vault.runId,
    });
    return runningCreateRun ?? { status: "not_applicable" };
  }
  if (cloudflareWorkers.length === 0) {
    if (ownership?.state === "active" || ownership?.state === "failed") {
      return await readProviderRunSummary(ctx, {
        provider: "cloudflare",
        source: "managed",
        runId: ownership.runId,
        status: ownership.state === "failed" ? "failed" : "running",
        fallbackUpdatedAt: ownership.updatedAt,
      });
    }
    const runningCreateRun = await readRunningProviderRunSummary(ctx, {
      provider: "cloudflare",
      source: "managed",
      runId: vault.runId,
    });
    return runningCreateRun ?? { status: "not_applicable" };
  }
  if (ownership?.state === "active") {
    return await readProviderRunSummary(ctx, {
      provider: "cloudflare",
      source: "managed",
      runId: ownership.runId,
      status: "running",
      fallbackUpdatedAt: ownership.updatedAt,
    });
  }

  return { status: "ready" };
}

function compareVaultDomainSortOrder(left: VaultDomain, right: VaultDomain): number {
  const leftKindOrder = left.kind === "main" ? 0 : 1;
  const rightKindOrder = right.kind === "main" ? 0 : 1;
  return (
    leftKindOrder - rightKindOrder ||
    left.branch.localeCompare(right.branch) ||
    left.url.localeCompare(right.url) ||
    left.source.localeCompare(right.source)
  );
}

function compareVaultAppSortOrder(left: VaultApp, right: VaultApp): number {
  const leftRootOrder = left.rootDirectory === "/" ? 0 : 1;
  const rightRootOrder = right.rootDirectory === "/" ? 0 : 1;
  return (
    leftRootOrder - rightRootOrder ||
    left.rootDirectory.localeCompare(right.rootDirectory) ||
    left._id.localeCompare(right._id)
  );
}

function compareCloudflareWorkerSortOrder(
  left: ConnectedCloudflareWorker,
  right: ConnectedCloudflareWorker,
): number {
  return (
    left.appId.localeCompare(right.appId) ||
    left.workerName.localeCompare(right.workerName) ||
    left.accountId.localeCompare(right.accountId) ||
    left._id.localeCompare(right._id)
  );
}

function compareConvexDeploymentSortOrder(
  left: ConnectedConvexDeployment,
  right: ConnectedConvexDeployment,
): number {
  return (
    left.appId.localeCompare(right.appId) ||
    left.projectSlug.localeCompare(right.projectSlug) ||
    left.projectId.localeCompare(right.projectId) ||
    left._id.localeCompare(right._id)
  );
}

function compareWorkerDeploymentDependencySortOrder(
  left: WorkerDeploymentDependency,
  right: WorkerDeploymentDependency,
): number {
  return (
    left.workerId.localeCompare(right.workerId) ||
    left.convexDeploymentId.localeCompare(right.convexDeploymentId) ||
    left._id.localeCompare(right._id)
  );
}

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

async function readConvexDeploymentsForVault(
  ctx: Pick<QueryCtx, "db">,
  vaultId: Id<"vaults">,
): Promise<ConnectedConvexDeployment[]> {
  const deployments = await ctx.db
    .query("vaultConvexDeployments")
    .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
    .collect();
  return deployments.sort(compareConvexDeploymentSortOrder);
}

async function readVaultAppsForVault(
  ctx: Pick<QueryCtx, "db">,
  vaultId: Id<"vaults">,
): Promise<VaultApp[]> {
  const apps = await ctx.db
    .query("vaultApps")
    .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
    .collect();
  return apps.sort(compareVaultAppSortOrder);
}

async function readCloudflareWorkersForVault(
  ctx: Pick<QueryCtx, "db">,
  vaultId: Id<"vaults">,
): Promise<ConnectedCloudflareWorker[]> {
  const workers = await ctx.db
    .query("vaultCloudflareWorkers")
    .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
    .collect();
  return workers.sort(compareCloudflareWorkerSortOrder);
}

const vVaultBranchFilters = object({
  vaultId: id("vaults"),
  hiddenLabels: array(string()),
  includeDrafts: boolean(),
  includeNoLabel: optional(boolean()),
});

/**
 * Dashboard URLs fail closed when provider metadata is partial. Trim before
 * checking presence and encode every segment before handing it to the browser.
 */
function buildCloudflareWorkerDashboardUrl(
  cloudflare: Pick<ConnectedCloudflareWorker, "accountId" | "workerName"> | null | undefined,
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
  if (!normalizedTeamSlug || !normalizedProjectSlug || !normalizedDeploymentName) {
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

// MARK: Public

export const getUserVaultBranchFilters = query({
  access: "access_dashboard",
  args: {},
  returns: array(vVaultBranchFilters),
  handler: async (ctx) => {
    return (
      await ctx.db
        .query("vaultBranchFilters")
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
        .query("vaultResourceLinksState")
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
      .query("vaultResourceLinksState")
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

    await ctx.db.insert("vaultResourceLinksState", {
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
      .query("vaultBranchFilters")
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
      await ctx.db.insert("vaultBranchFilters", {
        userId,
        vaultId: args.vaultId,
        hiddenLabels: args.hiddenLabels,
        includeDrafts: args.includeDrafts,
        includeNoLabel: args.includeNoLabel !== false,
      });
    }
  },
});

export const createVaultApp = mutation({
  access: "access_repo_connect",
  args: {
    vaultId: id("vaults"),
    rootDirectory: string(),
  },
  returns: id("vaultApps"),
  handler: async (ctx, args) => {
    const userId = ctx.viewer.userId;
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== userId) {
      throw new Error("Vault not found.");
    }

    const rootDirectory = normalizeVaultRootDirectory(args.rootDirectory);
    const existingApp = await ctx.db
      .query("vaultApps")
      .withIndex("by_vault_and_root_directory", (q) =>
        q.eq("vaultId", args.vaultId).eq("rootDirectory", rootDirectory),
      )
      .unique();
    if (existingApp) {
      throw new Error("Vault already has this root directory.");
    }

    return await ctx.db.insert("vaultApps", {
      vaultId: args.vaultId,
      userId,
      rootDirectory,
      createdAt: Date.now(),
    });
  },
});

export const listVaultRootDirectorySuggestions = query({
  access: "access_repo_connect",
  args: {
    vaultId: id("vaults"),
  },
  returns: array(string()),
  handler: async (ctx, args) => {
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== ctx.viewer.userId) {
      return [];
    }

    const defaultBranchTree = await ctx.db
      .query("vaultBranchTrees")
      .withIndex("by_vault_and_branch", (q) =>
        q.eq("vaultId", args.vaultId).eq("branch", vault.defaultBranch),
      )
      .first();
    if (!defaultBranchTree) {
      return [];
    }

    const existingRootDirectories = new Set(
      (await readVaultAppsForVault(ctx, args.vaultId)).map((app) => app.rootDirectory),
    );

    return defaultBranchTree.treeData.tree
      .filter((item) => item.type === "tree" && !existingRootDirectories.has(item.path))
      .map((item) => item.path)
      .sort((left, right) => left.localeCompare(right));
  },
});

// Get user's vaults with optional file staging stats
async function readUserVaults(
  ctx: Pick<QueryCtx, "db">,
  userId: Id<"users">,
): Promise<UserVaultsResult> {
  const [vaults, userApps, userConvexDeployments, userCloudflareWorkers, userDependencies] =
    await Promise.all([
      ctx.db
        .query("vaults")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .collect(),
      ctx.db
        .query("vaultApps")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
      ctx.db
        .query("vaultConvexDeployments")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
      ctx.db
        .query("vaultCloudflareWorkers")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
      ctx.db
        .query("vaultWorkerDeploymentDependencies")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
    ]);
  const appsByVault = groupVaultRows(userApps);
  const convexDeploymentsByVault = groupVaultRows(userConvexDeployments);
  const cloudflareWorkersByVault = groupVaultRows(userCloudflareWorkers);
  const dependenciesByVault = groupVaultRows(userDependencies);
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
      isSamebaseManaged: vault.githubMode === "create_repository",
      hasConnectedGitHubRepository: false,
      hasConvexProvision: false,
      hasCloudflareProvision: false,
      canRemoveConvexProvision: false,
      canRemoveCloudflareProvision: false,
      apps: [],
      cloudflareWorkers: [],
      convexDeployments: [],
      workerDeploymentDependencies: [],
    });
  }

  // Get staging stats for each vault
  const vaultResults: UserVaultResult[] = await Promise.all(
    connectedVaults.map(async (vault) => {
      const deletion = await resolveVaultDeletionSummary(ctx, vault);
      const apps = (appsByVault.get(vault._id) ?? []).sort(compareVaultAppSortOrder);
      const convexDeployments = (convexDeploymentsByVault.get(vault._id) ?? []).sort(
        compareConvexDeploymentSortOrder,
      );
      const cloudflareWorkers = (cloudflareWorkersByVault.get(vault._id) ?? []).sort(
        compareCloudflareWorkerSortOrder,
      );
      const workerDeploymentDependencies = (dependenciesByVault.get(vault._id) ?? []).sort(
        compareWorkerDeploymentDependencySortOrder,
      );
      const appIds = new Set(apps.map((app) => app._id));
      const workerIds = new Set(cloudflareWorkers.map((worker) => worker._id));
      const convexDeploymentIds = new Set(convexDeployments.map((deployment) => deployment._id));
      const convexDeploymentsById = new Map(
        convexDeployments.map((deployment) => [deployment._id, deployment]),
      );
      if (
        cloudflareWorkers.some((worker) => !appIds.has(worker.appId)) ||
        convexDeployments.some((deployment) => !appIds.has(deployment.appId)) ||
        workerDeploymentDependencies.some(
          (dependency) =>
            !workerIds.has(dependency.workerId) ||
            !convexDeploymentIds.has(dependency.convexDeploymentId),
        )
      ) {
        throw new Error("Vault provider resources have inconsistent ownership.");
      }
      const hasConvexProvision = convexDeployments.length > 0;
      const hasCloudflareProvision = cloudflareWorkers.length > 0;
      const convexDeploymentSummaries = convexDeployments.map((deployment) => ({
        convexDeploymentId: deployment._id,
        appId: deployment.appId,
        projectId: deployment.projectId,
        projectSlug: deployment.projectSlug,
        teamSlug: deployment.teamSlug,
        deploymentName: deployment.deploymentName,
        upstream: resolveConvexDeploymentUpstream(deployment),
        cloudUrl: deployment.cloudUrl,
        siteUrl: deployment.siteUrl,
        projectSettingsDashboardUrl: buildConvexProjectSettingsDashboardUrl({
          projectSlug: deployment.projectSlug,
          teamSlug: deployment.teamSlug,
        }),
        deploymentDashboardUrl: buildConvexDeploymentDashboardUrl({
          deploymentName: deployment.deploymentName,
          projectSlug: deployment.projectSlug,
          teamSlug: deployment.teamSlug,
        }),
      }));
      const canRemoveCloudflareProvision = cloudflareWorkers.some(
        (worker) => worker.origin === "provisioned",
      );
      const cloudflareWorkerSummaries = cloudflareWorkers.map((worker) => ({
        workerId: worker._id,
        appId: worker.appId,
        githubRepositoryConnection: resolveCloudflareWorkerGithubRepositoryConnection(worker),
        upstream: resolveCloudflareWorkerUpstream(worker),
        lastObservedAt: worker.lastObservedAt,
        workerName: worker.workerName,
        workersDevUrl: worker.workersDevUrl,
        projectDashboardUrl: buildCloudflareWorkerDashboardUrl(worker),
      }));
      const workerDeploymentDependencySummaries = workerDeploymentDependencies.map((dependency) => {
        const deployment = convexDeploymentsById.get(dependency.convexDeploymentId);
        if (!deployment) {
          throw new Error("Worker deployment dependency references a missing Convex deployment.");
        }

        return {
          dependencyId: dependency._id,
          workerId: dependency.workerId,
          convexDeploymentId: dependency.convexDeploymentId,
          wiring:
            dependency.wiring.state === "wired" && isVaultProviderUpstreamPresent(deployment)
              ? { state: "wired" as const }
              : {
                  state: "not_wired" as const,
                  nextAction: "wire_convex_build_access" as const,
                },
        };
      });
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
          apps: apps.map((app) => ({ appId: app._id, rootDirectory: app.rootDirectory })),
          cloudflareWorkers: cloudflareWorkerSummaries,
          convexDeployments: convexDeploymentSummaries,
          workerDeploymentDependencies: workerDeploymentDependencySummaries,
        };
      }

      const [stagingData, defaultBranchTree, hasCreatedConvexProject] = await Promise.all([
        ctx.db
          .query("fileStaging")
          .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
          .collect(),
        ctx.db
          .query("vaultBranchTrees")
          .withIndex("by_vault_and_branch", (q) =>
            q.eq("vaultId", vault._id).eq("branch", vault.defaultBranch),
          )
          .first(),
        hasCreatedConvexProjectForVault(ctx, vault._id),
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
        ? await resolveProviderSetupSummary(ctx, vault, convexDeployments, cloudflareWorkers)
        : { status: "not_applicable" as const };
      const canRemoveConvexProvision =
        hasCreatedConvexProject ||
        convexDeployments.some((deployment) => canRemoveConvexProvisionForDeployment(deployment));
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
        apps: apps.map((app) => ({ appId: app._id, rootDirectory: app.rootDirectory })),
        cloudflareWorkers: cloudflareWorkerSummaries,
        convexDeployments: convexDeploymentSummaries,
        workerDeploymentDependencies: workerDeploymentDependencySummaries,
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

export const getVaultInfrastructure = query({
  access: "access_dashboard",
  args: {
    vaultId: v.id("vaults"),
  },
  returns: v.union(
    v.object({
      providerSetup: vProviderSetupSummary,
      apps: v.array(
        v.object({
          appId: v.id("vaultApps"),
          rootDirectory: v.string(),
        }),
      ),
      convexDeployments: v.array(
        v.object({
          convexDeploymentId: v.id("vaultConvexDeployments"),
          appId: v.id("vaultApps"),
          projectId: v.string(),
          teamSlug: v.string(),
          projectSlug: v.string(),
          deploymentName: v.string(),
          cloudUrl: v.string(),
          siteUrl: v.string(),
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
            v.literal("cloudflare_workers_preview"),
          ),
          active: v.boolean(),
        }),
      ),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const vault = await ctx.db.get(args.vaultId);
    if (!vault || vault.userId !== ctx.viewer.userId) {
      return null;
    }
    if (!isLiveConnectedVault(vault)) {
      return null;
    }

    const [apps, convexDeployments, domains, cloudflareWorkers] = await Promise.all([
      readVaultAppsForVault(ctx, args.vaultId),
      readConvexDeploymentsForVault(ctx, args.vaultId),
      ctx.db
        .query("vaultDomains")
        .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
        .collect(),
      readCloudflareWorkersForVault(ctx, args.vaultId),
    ]);

    return {
      providerSetup: await resolveProviderSetupSummary(
        ctx,
        vault,
        convexDeployments,
        cloudflareWorkers,
      ),
      apps: apps.map((app) => ({ appId: app._id, rootDirectory: app.rootDirectory })),
      convexDeployments: convexDeployments.map((deployment) => ({
        convexDeploymentId: deployment._id,
        appId: deployment.appId,
        projectId: deployment.projectId,
        teamSlug: deployment.teamSlug,
        projectSlug: deployment.projectSlug,
        deploymentName: deployment.deploymentName,
        cloudUrl: deployment.cloudUrl,
        siteUrl: deployment.siteUrl,
      })),
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
