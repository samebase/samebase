import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalQuery, type QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { mutation, query } from "../functions";
import {
  findVaultForUser,
  listOrganizationIdsForUser,
  requireVaultForUser,
} from "../organizationAccess";
import { isConnectedVault, isLiveConnectedVault, isSamebaseManagedVault } from "./state";
import {
  hasActiveVaultProvisioningRun,
  resolveVaultDeletionEligibility,
} from "./deletion/eligibility";
import { isVaultDeletingOrDeleteFailed, readVaultDeletionState } from "./deletion/state";
import { hasStagedFileChanges } from "../../shared/stagedFiles";
import { vVaultResourceLinksState } from "./dashboardModel";
import { canAccess } from "../../shared/accessModel";
import type { AppProvisioningRunStep } from "../appProvisioningModel";
import { getConvexCodeLocationKey, readConvexCodeLocation } from "../../shared/convexCodeLocation";
import {
  getUserVaultsContract,
  type ManagedProviderPlan,
  type ProviderSetupSummary,
  type ProviderSetupStep,
  type ProviderWriteSummary,
  type SourceSetupSummary,
  type SourceSetupStep,
  type UserVaultResult,
  type UserVaultsResult,
  type VaultDeletionSummary,
} from "./contracts/getUserVaults";
import {
  readManualProviderWriteProviders,
  readVaultInfrastructureState,
  type VaultInfrastructureState,
} from "./infrastructureOperation";

const { array, boolean, id, object, string } = v;
type SourceSetupVault = Extract<
  Doc<"vaults">,
  { githubMode: "create_repository" | "connect_existing_repository" }
>;
type ConvexProject = Doc<"vaultConvexProjects">;
type CloudflareWorker = Doc<"vaultCloudflareWorkers">;
type ProvisioningRun = Doc<"workflow_vaultProvisioning_runs">;
const SOURCE_SETUP_ERROR_EVENT_SCAN_LIMIT = 20;

function classifyProvisioningStep(
  step: AppProvisioningRunStep,
): { phase: "source"; step: SourceSetupStep } | { phase: "provider"; step: ProviderSetupStep } {
  switch (step) {
    case "run_created":
    case "initialize_vault":
    case "validate_connections":
    case "create_github_repo":
    case "fetch_github_repo":
    case "seed_starter":
    case "connect_github":
    case "sync_tree":
      return { phase: "source", step };
    case "claim_infra":
    case "attach_convex":
    case "attach_worker":
    case "configure_workers_builds_for_github":
    case "rotate_convex_deploy_keys_for_workers_builds":
    case "finish":
      return { phase: "provider", step };
    default:
      step satisfies never;
      throw new Error("Unknown provisioning step.");
  }
}

function readProviderSetupStep(
  run: Pick<Doc<"workflow_vaultProvisioning_runs">, "currentStep" | "trigger">,
): ProviderSetupStep {
  if (run.trigger === "retry" && run.currentStep === "run_created") {
    return "claim_infra";
  }
  const classified = classifyProvisioningStep(run.currentStep);
  if (classified.phase !== "provider") {
    throw new Error("Provider setup run has not reached provider provisioning.");
  }
  return classified.step;
}

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
  vault: SourceSetupVault,
): Promise<SourceSetupSummary> {
  const run = await ctx.db.get(vault.runId);
  if (!run) {
    return {
      status: "failed",
      runId: vault.runId,
      step: "run_created",
      message: "Provisioning run not found.",
      updatedAt: getSourceSetupVaultFallbackUpdatedAt(vault),
    };
  }
  const classifiedStep = classifyProvisioningStep(run.currentStep);
  if (
    vault.state === "connected" &&
    (run.state === "succeeded" || classifiedStep.phase === "provider")
  ) {
    return { status: "ready" };
  }
  if (classifiedStep.phase !== "source") {
    throw new Error("Pre-connection vault reached provider provisioning.");
  }

  if (run.state === "failed") {
    const message =
      (await readLatestRunErrorMessage(ctx, vault.runId)) ??
      run.lastError ??
      `Provisioning failed during ${run.currentStep}.`;
    return {
      status: "failed",
      runId: vault.runId,
      step: classifiedStep.step,
      message,
      updatedAt: run.updatedAt,
    };
  }

  if (run.state === "canceled") {
    return {
      status: "failed",
      runId: vault.runId,
      step: classifiedStep.step,
      message: run.lastError ?? `Provisioning was canceled during ${run.currentStep}.`,
      updatedAt: run.updatedAt,
    };
  }

  if (run.state === "queued" || run.state === "running") {
    return {
      status: "running",
      runId: vault.runId,
      step: classifiedStep.step,
      updatedAt: run.updatedAt,
    };
  }

  return vault.state === "connected" ? { status: "ready" } : { status: "not_applicable" };
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

function readProviderRunSummary(args: {
  provider: "convex" | "cloudflare";
  runId: Id<"workflow_vaultProvisioning_runs">;
  run: ProvisioningRun | null;
  status: "running" | "failed";
  fallbackUpdatedAt: number;
}): Extract<ProviderSetupSummary, { status: "running" | "failed" }> {
  const run = args.run;
  if (!run) {
    return {
      status: "failed",
      provider: args.provider,
      runId: args.runId,
      step: "claim_infra",
      message: "Provisioning run not found.",
      updatedAt: args.fallbackUpdatedAt,
    };
  }
  const step = readProviderSetupStep(run);

  if (args.status === "running" && (run.state === "queued" || run.state === "running")) {
    return {
      status: "running",
      provider: args.provider,
      runId: args.runId,
      step,
      updatedAt: run.updatedAt,
    };
  }

  const message = run.lastError ?? `Provisioning failed during ${run.currentStep}.`;
  return {
    status: "failed",
    provider: args.provider,
    runId: args.runId,
    step,
    message,
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
  infrastructure: VaultInfrastructureState,
): Promise<VaultDeletionSummary> {
  const deletion = readVaultDeletionState(vault);
  switch (deletion.state) {
    case "not_deleting": {
      const eligibility = resolveVaultDeletionEligibility(
        vault,
        infrastructure,
        await hasActiveVaultProvisioningRun(ctx, vault._id),
      );
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
      const run = await ctx.db.get(deletion.runId);
      return {
        state: "delete_failed",
        runId: deletion.runId,
        failedAt: deletion.failedAt,
        currentStep: run?.currentStep ?? "initialize_deletion",
        message: "Vault removal failed. Retry it from the Samebase dashboard.",
        updatedAt: run?.updatedAt ?? deletion.failedAt,
      };
    }
    default: {
      deletion satisfies never;
      throw new Error("Unknown vault deletion state.");
    }
  }
}

async function readManagedProviderPlan(
  ctx: Pick<QueryCtx, "db">,
  vault: Doc<"vaults">,
): Promise<ManagedProviderPlan> {
  const plan = await ctx.db
    .query("workflow_vaultProvisioning_plans")
    .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
    .unique();
  if (!plan) {
    return null;
  }

  return {
    convexConfigPath: plan.convexConfigPath,
    convex: { ...plan.convex, teamId: vault.convexTeamId },
    cloudflare: { ...plan.cloudflare, accountId: vault.cloudflareAccountId },
  };
}

function resolveProviderWriteSummary(
  infrastructure: VaultInfrastructureState,
): ProviderWriteSummary {
  if (infrastructure.operation.kind === "managed_run") {
    return {
      status: "active",
      owner: {
        kind: "managed_run",
      },
      lastWriteAt: infrastructure.providerWrite?.lastWriteAt ?? {},
    };
  }
  if (infrastructure.operation.kind === "manual_provider_write") {
    const write = infrastructure.operation.write;
    return {
      status: "active",
      owner: { kind: "manual_provider_write" },
      affectedProviders: readManualProviderWriteProviders(write.owner.action),
      lastWriteAt: write.lastWriteAt,
    };
  }

  return {
    status: "idle",
    lastWriteAt: infrastructure.providerWrite?.lastWriteAt ?? {},
  };
}

async function readManagedProviderOperation(
  ctx: Pick<QueryCtx, "db">,
  infrastructure: VaultInfrastructureState,
): Promise<{
  runId: Id<"workflow_vaultProvisioning_runs">;
  run: ProvisioningRun | null;
  status: "running" | "failed";
  fallbackUpdatedAt: number;
} | null> {
  if (infrastructure.operation.kind === "managed_run") {
    return {
      runId: infrastructure.operation.runId,
      run: infrastructure.operation.run,
      status: "running",
      fallbackUpdatedAt: infrastructure.operation.updatedAt,
    };
  }
  if (infrastructure.operation.kind !== "none") {
    return null;
  }

  const write = infrastructure.providerWrite;
  if (!write || write.owner.kind !== "managed_run" || write.state !== "failed") {
    return null;
  }
  return {
    runId: write.owner.runId,
    run: await ctx.db.get(write.owner.runId),
    status: "failed",
    fallbackUpdatedAt: write.updatedAt,
  };
}

async function resolveProviderSetupSummary(
  ctx: Pick<QueryCtx, "db">,
  convexProjects: ConvexProject[],
  cloudflareWorkers: CloudflareWorker[],
  infrastructure: VaultInfrastructureState,
): Promise<ProviderSetupSummary> {
  const managedOperation = await readManagedProviderOperation(ctx, infrastructure);

  if (convexProjects.length === 0) {
    if (managedOperation) {
      return readProviderRunSummary({
        provider: "convex",
        ...managedOperation,
      });
    }
    return { status: "not_applicable" };
  }
  if (cloudflareWorkers.length === 0) {
    if (managedOperation) {
      return readProviderRunSummary({
        provider: "cloudflare",
        ...managedOperation,
      });
    }
    return { status: "not_applicable" };
  }
  if (managedOperation) {
    return readProviderRunSummary({
      provider: "cloudflare",
      ...managedOperation,
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
    getConvexCodeLocationKey(readConvexCodeLocation(left)).localeCompare(
      getConvexCodeLocationKey(readConvexCodeLocation(right)),
    ) ||
    left.projectId.localeCompare(right.projectId) ||
    left.teamId.localeCompare(right.teamId) ||
    left._id.localeCompare(right._id)
  );
}

const vVaultPullRequestFilters = object({
  vaultId: id("vaults"),
  hiddenLabels: array(string()),
  includeDrafts: boolean(),
  includeNoLabel: boolean(),
});
const vVaultRepositoryFolderSuggestions = array(string());

// MARK: Public

export const listVaultRepositoryFolderSuggestions = query({
  access: "access_repo_connect",
  args: {
    vaultId: id("vaults"),
  },
  returns: vVaultRepositoryFolderSuggestions,
  handler: async (ctx, args) => {
    const vault = await findVaultForUser(ctx.db, {
      userId: ctx.viewer.userId,
      vaultId: args.vaultId,
    });
    if (!isLiveConnectedVault(vault)) {
      return [];
    }

    const defaultBranchTree = await ctx.db
      .query("observations_vaultRepository_branchTrees")
      .withIndex("by_vault_and_branch", (q) =>
        q.eq("vaultId", args.vaultId).eq("branch", vault.defaultBranch),
      )
      .first();
    if (!defaultBranchTree) {
      return [];
    }

    return defaultBranchTree.treeData.tree
      .filter((item) => item.type === "tree")
      .map((item) => item.path)
      .sort((left, right) => left.localeCompare(right));
  },
});

export const getUserVaultPullRequestFilters = query({
  access: "access_dashboard",
  args: {},
  returns: array(vVaultPullRequestFilters),
  handler: async (ctx) => {
    const filters = [];
    for await (const vaultPullRequestFilter of ctx.db
      .query("ui_vaultPullRequests_filters")
      .withIndex("by_user", (q) => q.eq("userId", ctx.viewer.userId))) {
      const vault = await findVaultForUser(ctx.db, {
        userId: ctx.viewer.userId,
        vaultId: vaultPullRequestFilter.vaultId,
      });
      if (vault === null) {
        continue;
      }
      filters.push({
        vaultId: vaultPullRequestFilter.vaultId,
        hiddenLabels: vaultPullRequestFilter.hiddenLabels,
        includeDrafts: vaultPullRequestFilter.includeDrafts,
        includeNoLabel: vaultPullRequestFilter.includeNoLabel,
      });
    }

    return filters.sort((left, right) => left.vaultId.localeCompare(right.vaultId));
  },
});

export const getUserVaultResourceLinksState = query({
  access: "access_dashboard",
  args: {},
  returns: array(vVaultResourceLinksState),
  handler: async (ctx) => {
    const states = [];
    for await (const state of ctx.db
      .query("ui_vaultResourceLinks_settings")
      .withIndex("by_user", (q) => q.eq("userId", ctx.viewer.userId))) {
      const vault = await findVaultForUser(ctx.db, {
        userId: ctx.viewer.userId,
        vaultId: state.vaultId,
      });
      if (vault === null) {
        continue;
      }
      states.push({
        resourceLinksOpen: state.resourceLinksOpen,
        vaultId: state.vaultId,
      });
    }

    return states.sort((left, right) => left.vaultId.localeCompare(right.vaultId));
  },
});

export const setVaultResourceLinksOpen = mutation({
  access: "access_dashboard",
  args: vVaultResourceLinksState,
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = ctx.viewer.userId;
    const vault = await requireVaultForUser(ctx.db, { userId, vaultId: args.vaultId });
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

export const setVaultPullRequestFilters = mutation({
  access: "access_dashboard",
  args: vVaultPullRequestFilters,
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = ctx.viewer.userId;
    const vault = await requireVaultForUser(ctx.db, { userId, vaultId: args.vaultId });
    if (isVaultDeletingOrDeleteFailed(vault)) {
      throw new Error("Vault deletion is in progress.");
    }

    const existing = await ctx.db
      .query("ui_vaultPullRequests_filters")
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
        includeNoLabel: args.includeNoLabel,
      });
    } else {
      await ctx.db.insert("ui_vaultPullRequests_filters", {
        userId,
        vaultId: args.vaultId,
        hiddenLabels: args.hiddenLabels,
        includeDrafts: args.includeDrafts,
        includeNoLabel: args.includeNoLabel,
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

async function readOrganizationVaults(
  ctx: Pick<QueryCtx, "db">,
  organizationIds: Id<"organizations">[],
): Promise<UserVaultsResult> {
  const organizationRows = await Promise.all(
    organizationIds.map(async (organizationId) => {
      const [
        organization,
        connectedVaults,
        provisioningVaults,
        failedVaults,
        convexProjects,
        cloudflareWorkers,
      ] = await Promise.all([
        ctx.db.get(organizationId),
        ctx.db
          .query("vaults")
          .withIndex("by_organization_and_state_and_deletion_state", (q) =>
            q.eq("organizationId", organizationId).eq("state", "connected"),
          )
          .collect(),
        ctx.db
          .query("vaults")
          .withIndex("by_organization_and_state_and_deletion_state", (q) =>
            q.eq("organizationId", organizationId).eq("state", "provisioning"),
          )
          .collect(),
        ctx.db
          .query("vaults")
          .withIndex("by_organization_and_state_and_deletion_state", (q) =>
            q.eq("organizationId", organizationId).eq("state", "failed"),
          )
          .collect(),
        ctx.db
          .query("vaultConvexProjects")
          .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
          .collect(),
        ctx.db
          .query("vaultCloudflareWorkers")
          .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
          .collect(),
      ]);
      if (organization === null) {
        throw new Error("Organization not found.");
      }
      return {
        organizationId,
        githubOwnerLogin: organization.githubOwnerLogin,
        vaults: [...connectedVaults, ...provisioningVaults, ...failedVaults],
        convexProjects,
        cloudflareWorkers,
      };
    }),
  );
  const vaults = organizationRows.flatMap((rows) => rows.vaults);
  const githubOwnerLoginByOrganizationId = new Map(
    organizationRows.map((rows) => [rows.organizationId, rows.githubOwnerLogin] as const),
  );
  const getGitHubOwnerLogin = (organizationId: Id<"organizations">): string => {
    const githubOwnerLogin = githubOwnerLoginByOrganizationId.get(organizationId);
    if (githubOwnerLogin === undefined) {
      throw new Error("Organization not found.");
    }
    return githubOwnerLogin;
  };
  const convexProjectsByVault = groupVaultRows(
    organizationRows.flatMap((rows) => rows.convexProjects),
  );
  const cloudflareWorkersByVault = groupVaultRows(
    organizationRows.flatMap((rows) => rows.cloudflareWorkers),
  );
  const connectedVaults = vaults.filter(isConnectedVault);
  const initializingVaultResults: Array<UserVaultResult & { _creationTime: number }> = [];
  for (const vault of vaults) {
    if (vault.state !== "provisioning" && vault.state !== "failed") {
      continue;
    }
    const [infrastructure, providerPlan] = await Promise.all([
      readVaultInfrastructureState(ctx, vault),
      readManagedProviderPlan(ctx, vault),
    ]);
    const deletion = await resolveVaultDeletionSummary(ctx, vault, infrastructure);
    const githubOwnerLogin = getGitHubOwnerLogin(vault.organizationId);
    initializingVaultResults.push({
      _id: vault._id,
      organizationId: vault.organizationId,
      convexTeamId: vault.convexTeamId,
      cloudflareAccountId: vault.cloudflareAccountId,
      _creationTime: vault._creationTime,
      ghRepoOwner: githubOwnerLogin,
      ghRepoName: vault.name,
      ghRepoId: vault.githubMode === "connect_existing_repository" ? vault.ghRepoId : undefined,
      repositoryFullName: `${githubOwnerLogin}/${vault.name}`,
      defaultBranch: undefined,
      fileCount: 0,
      lastEditTime: undefined,
      sourceSetup: await resolveSourceSetupSummary(ctx, vault),
      providerSetup: { status: "not_applicable" },
      providerPlan,
      providerWrite: resolveProviderWriteSummary(infrastructure),
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

  const vaultResults: Array<UserVaultResult & { _creationTime: number }> = await Promise.all(
    connectedVaults.map(async (vault) => {
      const githubOwnerLogin = getGitHubOwnerLogin(vault.organizationId);
      const [infrastructure, providerPlan] = await Promise.all([
        readVaultInfrastructureState(ctx, vault),
        readManagedProviderPlan(ctx, vault),
      ]);
      const deletion = await resolveVaultDeletionSummary(ctx, vault, infrastructure);
      const providerWrite = resolveProviderWriteSummary(infrastructure);
      const convexProjects = (convexProjectsByVault.get(vault._id) ?? []).sort(
        compareConvexProjectSortOrder,
      );
      const cloudflareWorkers = (cloudflareWorkersByVault.get(vault._id) ?? []).sort(
        compareCloudflareWorkerSortOrder,
      );
      const hasConvexProvision = convexProjects.length > 0;
      const hasCloudflareProvision = cloudflareWorkers.length > 0;
      const canRemoveConvexProvision = convexProjects.some(
        (project) => project.origin === "provisioned",
      );
      const canRemoveCloudflareProvision = cloudflareWorkers.some(
        (worker) => worker.origin === "provisioned",
      );
      const cloudflareWorkerSummaries = cloudflareWorkers.map((worker) => ({
        workerId: worker._id,
        accountId: worker.accountId,
        workerName: worker.workerName,
        workerTag: worker.workerTag,
        rootDirectory: worker.rootDirectory,
      }));
      const convexProjectSummaries = convexProjects.map((project) => ({
        convexProjectId: project._id,
        teamId: project.teamId,
        projectId: project.projectId,
        codeLocation: readConvexCodeLocation(project),
      }));
      if (deletion.state !== "not_deleting") {
        return {
          _id: vault._id,
          organizationId: vault.organizationId,
          convexTeamId: vault.convexTeamId,
          cloudflareAccountId: vault.cloudflareAccountId,
          _creationTime: vault._creationTime,
          ghRepoOwner: githubOwnerLogin,
          ghRepoName: vault.name,
          ghRepoId: vault.ghRepoId,
          repositoryFullName: `${githubOwnerLogin}/${vault.name}`,
          defaultBranch: vault.defaultBranch,
          fileCount: 0,
          lastEditTime: undefined,
          sourceSetup: { status: "not_applicable" },
          providerSetup: { status: "not_applicable" },
          providerPlan,
          providerWrite,
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
      }

      const stagingData = await ctx.db
        .query("vaultStagedFiles")
        .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
        .collect();

      const fileCount = stagingData.filter(hasStagedFileChanges).length;

      const lastEditTime =
        stagingData.length > 0 ? Math.max(...stagingData.map((s) => s.lastEditTime)) : undefined;

      const repositoryFullName = `${githubOwnerLogin}/${vault.name}`;
      const sourceSetup = await resolveSourceSetupSummary(ctx, vault);
      const providerSetup =
        sourceSetup.status === "ready"
          ? await resolveProviderSetupSummary(
              ctx,
              convexProjects,
              cloudflareWorkers,
              infrastructure,
            )
          : { status: "not_applicable" as const };
      return {
        _id: vault._id,
        organizationId: vault.organizationId,
        convexTeamId: vault.convexTeamId,
        cloudflareAccountId: vault.cloudflareAccountId,
        _creationTime: vault._creationTime,
        ghRepoOwner: githubOwnerLogin,
        ghRepoName: vault.name,
        ghRepoId: vault.ghRepoId,
        repositoryFullName,
        defaultBranch: vault.defaultBranch,
        fileCount,
        lastEditTime,
        sourceSetup,
        providerSetup,
        providerPlan,
        providerWrite,
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
  return [...vaultResults, ...initializingVaultResults]
    .sort((a, b) => {
      const aTime = a.lastEditTime ?? a._creationTime;
      const bTime = b.lastEditTime ?? b._creationTime;
      return (
        bTime - aTime ||
        a.repositoryFullName.localeCompare(b.repositoryFullName) ||
        a._id.localeCompare(b._id)
      );
    })
    .map(({ _creationTime: _sortTime, ...vault }) => vault);
}

export const getUserVaults = query({
  access: getUserVaultsContract.access,
  args: getUserVaultsContract.args,
  returns: getUserVaultsContract.returns,
  mcp: getUserVaultsContract.mcp,
  handler: async (ctx): Promise<UserVaultsResult> => {
    const organizationIds = await listOrganizationIdsForUser(ctx.db, ctx.viewer.userId);
    return await readOrganizationVaults(ctx, organizationIds);
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

    const organizationIds = await listOrganizationIdsForUser(ctx.db, args.userId);
    return await readOrganizationVaults(ctx, organizationIds);
  },
});
