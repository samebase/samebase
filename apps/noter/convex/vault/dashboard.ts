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
  type ConnectedVault,
} from "./state";
import { vVaultDeletionStep } from "./deletion/model";
import { readVaultDeletionEligibility } from "./deletion/eligibility";
import { isVaultDeletingOrDeleteFailed, readVaultDeletionState } from "./deletion/state";
import { compareRemoteBranchSortOrder, hasBranchStagingChanges } from "./branches";
import { normalizeVaultAppRoot, ROOT_VAULT_APP_ROOT } from "../../shared/vaultAppRoot";
import { vVaultResourceLinksState, type VaultResourceLinksState } from "./resourceLinksStateModel";

const nullValidator = v.null();
const { array, boolean, id, literal, number, object, optional, string, union } = v;
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
type VaultApp = Doc<"vaultApps">;
type ConnectedConvexDeployment = Doc<"vaultConvexDeployments">;
type ConnectedCloudflareWorker = Doc<"vaultCloudflareWorkers">;
const SOURCE_SETUP_ERROR_EVENT_SCAN_LIMIT = 20;

function canRemoveConvexProvisionForDeployment(deployment: ConnectedConvexDeployment): boolean {
  return deployment.origin === "provisioned";
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

  if (args.status === "running" && (run.state === "queued" || run.state === "running")) {
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
      return "cloudflare";
    default:
      return null;
  }
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
      runId: ownership.runId,
      status: ownership.state === "failed" ? "failed" : "running",
      fallbackUpdatedAt: ownership.updatedAt,
    });
  }

  if (convexDeployments.length === 0) {
    if (ownership?.state === "active" || ownership?.state === "failed") {
      return await readProviderRunSummary(ctx, {
        provider: "convex",
        runId: ownership.runId,
        status: ownership.state === "failed" ? "failed" : "running",
        fallbackUpdatedAt: ownership.updatedAt,
      });
    }
    const runningCreateRun = await readRunningProviderRunSummary(ctx, {
      provider: "convex",
      runId: vault.runId,
    });
    return runningCreateRun ?? { status: "not_applicable" };
  }
  if (cloudflareWorkers.length === 0) {
    if (ownership?.state === "active" || ownership?.state === "failed") {
      return await readProviderRunSummary(ctx, {
        provider: "cloudflare",
        runId: ownership.runId,
        status: ownership.state === "failed" ? "failed" : "running",
        fallbackUpdatedAt: ownership.updatedAt,
      });
    }
    const runningCreateRun = await readRunningProviderRunSummary(ctx, {
      provider: "cloudflare",
      runId: vault.runId,
    });
    return runningCreateRun ?? { status: "not_applicable" };
  }
  if (ownership?.state === "active") {
    return await readProviderRunSummary(ctx, {
      provider: "cloudflare",
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
  const leftRootOrder = left.appRoot === "." ? 0 : 1;
  const rightRootOrder = right.appRoot === "." ? 0 : 1;
  return (
    leftRootOrder - rightRootOrder ||
    left.appRoot.localeCompare(right.appRoot) ||
    left._id.localeCompare(right._id)
  );
}

function compareCloudflareWorkerSortOrder(
  left: ConnectedCloudflareWorker,
  right: ConnectedCloudflareWorker,
): number {
  const leftRootOrder = left.appRoot === "." ? 0 : 1;
  const rightRootOrder = right.appRoot === "." ? 0 : 1;
  return (
    leftRootOrder - rightRootOrder ||
    left.appRoot.localeCompare(right.appRoot) ||
    left.workerName.localeCompare(right.workerName) ||
    left.accountId.localeCompare(right.accountId)
  );
}

function compareConvexDeploymentSortOrder(
  left: ConnectedConvexDeployment,
  right: ConnectedConvexDeployment,
): number {
  const leftRootOrder = left.appRoot === "." ? 0 : 1;
  const rightRootOrder = right.appRoot === "." ? 0 : 1;
  return (
    leftRootOrder - rightRootOrder ||
    left.appRoot.localeCompare(right.appRoot) ||
    left.projectSlug.localeCompare(right.projectSlug) ||
    left.projectId.localeCompare(right.projectId)
  );
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

export const getUserVaultResourceLinksState = query({
  args: {},
  returns: array(vVaultResourceLinksState),
  handler: async (ctx): Promise<VaultResourceLinksState[]> => {
    const userId = await getUserId(ctx);
    const states = (
      await ctx.db
        .query("vaultResourceLinksState")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect()
    ).map((state) => ({
      resourceLinksOpen: state.resourceLinksOpen,
      vaultId: state.vaultId,
    }));

    return states.sort((left, right) => left.vaultId.localeCompare(right.vaultId));
  },
});

export const setVaultResourceLinksOpen = mutation({
  args: vVaultResourceLinksState,
  returns: nullValidator,
  handler: async (ctx, args: VaultResourceLinksState) => {
    const userId = await getUserId(ctx);
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
      return null;
    }

    await ctx.db.insert("vaultResourceLinksState", {
      userId,
      vaultId: args.vaultId,
      ...nextState,
    });
    return null;
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
      .withIndex("by_user_and_vault", (q) => q.eq("userId", userId).eq("vaultId", args.vaultId))
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

export const createVaultAppRoot = mutation({
  args: {
    vaultId: id("vaults"),
    appRoot: string(),
  },
  returns: nullValidator,
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== userId) {
      throw new Error("Vault not found.");
    }

    const appRoot = normalizeVaultAppRoot(args.appRoot);
    const apps = await ctx.db
      .query("vaultApps")
      .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
      .collect();
    const existingApp = apps.find((app) => app.appRoot === appRoot);
    const rootApp = apps.find((app) => app.appRoot === ROOT_VAULT_APP_ROOT);
    const hasFolderApp = apps.some((app) => app.appRoot !== ROOT_VAULT_APP_ROOT);
    if (appRoot === ROOT_VAULT_APP_ROOT && hasFolderApp) {
      throw new Error("Monorepo vaults cannot add the repository root as an app.");
    }
    if (existingApp) {
      throw new Error("Vault already has this app root.");
    }

    if (appRoot !== ROOT_VAULT_APP_ROOT && rootApp) {
      const [rootConvexDeployment, rootCloudflareWorker, infrastructureOwnership] =
        await Promise.all([
          ctx.db
            .query("vaultConvexDeployments")
            .withIndex("by_vault_and_appRoot", (q) =>
              q.eq("vaultId", args.vaultId).eq("appRoot", ROOT_VAULT_APP_ROOT),
            )
            .first(),
          ctx.db
            .query("vaultCloudflareWorkers")
            .withIndex("by_vault_and_appRoot", (q) =>
              q.eq("vaultId", args.vaultId).eq("appRoot", ROOT_VAULT_APP_ROOT),
            )
            .first(),
          readVaultInfrastructureOwnership(ctx, args.vaultId),
        ]);
      if (infrastructureOwnership?.state === "active") {
        throw new Error("Wait for provider setup before converting this vault to a monorepo.");
      }
      if (rootConvexDeployment || rootCloudflareWorker) {
        throw new Error("Disconnect root providers before converting this vault to a monorepo.");
      }
      await ctx.db.delete(rootApp._id);
    }

    await ctx.db.insert("vaultApps", {
      vaultId: args.vaultId,
      userId,
      appRoot,
      createdAt: Date.now(),
    });

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
    canRemoveConvexProvision: boolean(),
    canRemoveCloudflareProvision: boolean(),
    appRoots: array(
      object({
        appRoot: string(),
      }),
    ),
    cloudflareWorkers: array(
      object({
        appRoot: string(),
        workerName: string(),
        workersDevUrl: optional(string()),
        projectDashboardUrl: optional(string()),
      }),
    ),
    convexDeployments: array(
      object({
        appRoot: string(),
        projectId: string(),
        projectSlug: string(),
        teamSlug: string(),
        deploymentName: string(),
        cloudUrl: string(),
        siteUrl: string(),
        projectSettingsDashboardUrl: optional(string()),
        deploymentDashboardUrl: optional(string()),
      }),
    ),
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
        canRemoveConvexProvision: false,
        canRemoveCloudflareProvision: false,
        appRoots: [],
        cloudflareWorkers: [],
        convexDeployments: [],
        remoteBranches: [],
      });
    }

    // Get staging stats for each vault
    const vaultResults: UserVaultResult[] = await Promise.all(
      connectedVaults.map(async (vault) => {
        const deletion = await resolveVaultDeletionSummary(ctx, vault);
        const appRoots = await readVaultAppsForVault(ctx, vault._id);
        const convexDeployments = await readConvexDeploymentsForVault(ctx, vault._id);
        const cloudflareWorkers = await readCloudflareWorkersForVault(ctx, vault._id);
        const hasConvexProvision = convexDeployments.length > 0;
        const hasCloudflareProvision = cloudflareWorkers.length > 0;
        const convexDeploymentSummaries = convexDeployments.map((deployment) => ({
          appRoot: deployment.appRoot,
          projectId: deployment.projectId,
          projectSlug: deployment.projectSlug,
          teamSlug: deployment.teamSlug,
          deploymentName: deployment.deploymentName,
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
          appRoot: worker.appRoot,
          workerName: worker.workerName,
          workersDevUrl: worker.workersDevUrl,
          projectDashboardUrl: buildCloudflareWorkerDashboardUrl(worker),
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
            isNoterManaged: isNoterManagedVault(vault),
            hasConnectedGitHubRepository: true,
            hasConvexProvision,
            hasCloudflareProvision,
            canRemoveConvexProvision: false,
            canRemoveCloudflareProvision,
            appRoots: appRoots.map((app) => ({ appRoot: app.appRoot })),
            cloudflareWorkers: cloudflareWorkerSummaries,
            convexDeployments: convexDeploymentSummaries,
            remoteBranches: [],
          };
        }

        const [stagingData, remoteBranches, defaultBranchTree, hasCreatedConvexProject] =
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
        const previewConvexDeployment =
          convexDeployments.length === 1 ? convexDeployments[0] : undefined;

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
          canRemoveConvexProvision,
          canRemoveCloudflareProvision,
          appRoots: appRoots.map((app) => ({ appRoot: app.appRoot })),
          cloudflareWorkers: cloudflareWorkerSummaries,
          convexDeployments: convexDeploymentSummaries,
          remoteBranches: remoteBranches.sort(compareRemoteBranchSortOrder).map((branch) => ({
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
            cloudflarePreviewPullRequestNumber: branch.cloudflarePreviewPullRequestNumber,
            cloudflarePreviewUrl: branch.cloudflarePreviewUrl,
            cloudflarePreviewCommitSha: branch.cloudflarePreviewCommitSha,
            cloudflarePreviewStatus: branch.cloudflarePreviewStatus,
            cloudflarePreviewLogsUrl: branch.cloudflarePreviewLogsUrl,
            cloudflarePreviewCommentCreatedAt: branch.cloudflarePreviewCommentCreatedAt,
            convexPreviewDeploymentDashboardUrl:
              previewConvexDeployment &&
              !branch.isDefault &&
              branch.remoteState === "active" &&
              typeof branch.cloudflareBranchPreviewUrl === "string" &&
              branch.pullRequestNumber === branch.cloudflarePreviewPullRequestNumber
                ? buildConvexPreviewDeploymentDashboardUrl({
                    branchName: branch.name,
                    projectSlug: previewConvexDeployment.projectSlug,
                    teamSlug: previewConvexDeployment.teamSlug,
                  })
                : undefined,
          })),
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
      convexDeployments: v.array(
        v.object({
          appRoot: v.string(),
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

    const convexDeployments = await readConvexDeploymentsForVault(ctx, args.vaultId);

    const domains = await ctx.db
      .query("vaultDomains")
      .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
      .collect();
    const cloudflareWorkers = await readCloudflareWorkersForVault(ctx, args.vaultId);

    return {
      providerSetup: await resolveProviderSetupSummary(
        ctx,
        vault,
        convexDeployments,
        cloudflareWorkers,
      ),
      convexDeployments: convexDeployments.map((deployment) => ({
        appRoot: deployment.appRoot,
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
