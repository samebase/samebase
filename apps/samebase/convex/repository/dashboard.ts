import { v } from "convex/values";
import type { QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { mutation, query } from "../functions";
import { findRepositoryForUser, requireRepositoryForUser } from "../organizationAccess";
import {
  isConnectedRepository,
  isLiveConnectedRepository,
  isSamebaseManagedRepository,
} from "./state";
import {
  hasActiveRepositoryProvisioningRun,
  resolveRepositoryDeletionEligibility,
} from "./deletion/eligibility";
import { isRepositoryDeletingOrDeleteFailed } from "./deletion/state";
import { components } from "../_generated/api";
import { vRepositoryResourceLinksState } from "./dashboardModel";
import type { RepositoryProvisioningRunStep } from "./provisioningModel";
import { isSamebaseProvisioningPlan, readRepositoryProvisioningMode } from "./provisioningPlan";
import { getConvexCodeLocationKey, readConvexCodeLocation } from "../../shared/convexCodeLocation";
import {
  type ManagedProviderPlan,
  type ProviderSetupSummary,
  type ProviderSetupStep,
  type ProviderWriteSummary,
  type SourceSetupSummary,
  type SourceSetupStep,
  type UserRepositoryResult,
  type UserRepositoriesResult,
  type RepositoryDeletionSummary,
} from "./contracts/getUserRepositories";
import {
  readManualProviderWriteProviders,
  readRepositoryInfrastructureState,
  type RepositoryInfrastructureState,
} from "./infrastructureOperation";

const { array, boolean, id, object, string } = v;
type SourceSetupRepository = Extract<
  Doc<"repositories">,
  { githubMode: "create_repository" | "connect_existing_repository" }
>;
type ConvexProject = Doc<"repositoryConvexProjects">;
type CloudflareWorker = Doc<"repositoryCloudflareWorkers">;
type ProvisioningRun = Doc<"workflow_repositoryProvisioning_runs">;
const SOURCE_SETUP_ERROR_EVENT_SCAN_LIMIT = 20;

function classifyProvisioningStep(
  step: RepositoryProvisioningRunStep,
): { phase: "source"; step: SourceSetupStep } | { phase: "provider"; step: ProviderSetupStep } {
  switch (step) {
    case "run_created":
    case "initialize_repository":
    case "validate_connections":
    case "create_github_repository":
    case "fetch_github_repository":
    case "seed_starter":
    case "connect_github_repository":
    case "sync_tree":
      return { phase: "source", step };
    case "write_actions_secrets":
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
  run: Pick<Doc<"workflow_repositoryProvisioning_runs">, "currentStep" | "trigger">,
): ProviderSetupStep {
  if (run.trigger === "retry" && run.currentStep === "run_created") {
    return "claim_infra";
  }
  const classified = classifyProvisioningStep(run.currentStep);
  if (classified.phase === "provider") {
    return classified.step;
  }
  // A repository_actions setup reports its seed and tree sync as provider setup: they run after
  // the secrets write, and its retry resumes them. A samebase run never reaches this read in them.
  if (classified.step === "seed_starter" || classified.step === "sync_tree") {
    return classified.step;
  }
  throw new Error("Provider setup run has not reached provider provisioning.");
}

async function readLatestRunErrorMessage(
  ctx: Pick<QueryCtx, "db">,
  runId: Id<"workflow_repositoryProvisioning_runs">,
): Promise<string | undefined> {
  const events = await ctx.db
    .query("workflow_repositoryProvisioning_events")
    .withIndex("by_run_and_created_at_and_source_order", (q) => q.eq("runId", runId))
    .order("desc")
    .take(SOURCE_SETUP_ERROR_EVENT_SCAN_LIMIT);
  return events.find((event) => event.level === "error")?.message;
}

async function resolveSourceSetupSummary(
  ctx: Pick<QueryCtx, "db">,
  repository: SourceSetupRepository,
  providerPlan: ManagedProviderPlan,
): Promise<SourceSetupSummary> {
  const run = await ctx.db.get(repository.runId);
  if (!run) {
    return {
      status: "failed",
      runId: repository.runId,
      step: "run_created",
      message: "Provisioning run not found.",
      updatedAt: getSourceSetupRepositoryFallbackUpdatedAt(repository),
    };
  }
  const classifiedStep = classifyProvisioningStep(run.currentStep);
  // A repository_actions setup runs its seed and tree sync after write_actions_secrets, and its retry
  // resumes them, so they count as provider setup. connect_github_repository, which runs before the
  // secrets write and can already show a connected repository, stays source setup.
  const repositoryActionsProviderStep =
    providerPlan !== null &&
    readRepositoryProvisioningMode(providerPlan) === "repository_actions" &&
    (classifiedStep.step === "seed_starter" || classifiedStep.step === "sync_tree");
  if (
    repository.state === "connected" &&
    (run.state === "succeeded" ||
      classifiedStep.phase === "provider" ||
      repositoryActionsProviderStep)
  ) {
    return { status: "ready" };
  }
  if (classifiedStep.phase !== "source") {
    throw new Error("Pre-connection repository reached provider provisioning.");
  }

  if (run.state === "failed") {
    const message =
      (await readLatestRunErrorMessage(ctx, repository.runId)) ??
      run.lastError ??
      `Provisioning failed during ${run.currentStep}.`;
    return {
      status: "failed",
      runId: repository.runId,
      step: classifiedStep.step,
      message,
      updatedAt: run.updatedAt,
    };
  }

  if (run.state === "canceled") {
    return {
      status: "failed",
      runId: repository.runId,
      step: classifiedStep.step,
      message: run.lastError ?? `Provisioning was canceled during ${run.currentStep}.`,
      updatedAt: run.updatedAt,
    };
  }

  if (run.state === "queued" || run.state === "running") {
    return {
      status: "running",
      runId: repository.runId,
      step: classifiedStep.step,
      updatedAt: run.updatedAt,
    };
  }

  return repository.state === "connected" ? { status: "ready" } : { status: "not_applicable" };
}

function getSourceSetupRepositoryFallbackUpdatedAt(repository: SourceSetupRepository): number {
  switch (repository.state) {
    case "connected":
      return repository.connectedAt;
    case "failed":
      return repository.failedAt;
    case "provisioning":
      return repository.startedAt;
    default:
      return repository satisfies never;
  }
}

function readProviderRunSummary(args: {
  provider: Extract<ProviderSetupSummary, { status: "running" | "failed" }>["provider"];
  runId: Id<"workflow_repositoryProvisioning_runs">;
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
  runId: Id<"workflow_repositoryDeletion_runs">,
): Promise<Doc<"workflow_repositoryDeletion_events"> | null> {
  return await ctx.db
    .query("workflow_repositoryDeletion_events")
    .withIndex("by_run_and_created_at_and_source_order", (q) => q.eq("runId", runId))
    .order("desc")
    .first();
}

async function resolveRepositoryDeletionSummary(
  ctx: Pick<QueryCtx, "db">,
  repository: Doc<"repositories">,
  infrastructure: RepositoryInfrastructureState,
): Promise<RepositoryDeletionSummary> {
  const deletion = repository.deletion;
  switch (deletion.state) {
    case "not_deleting": {
      const eligibility = resolveRepositoryDeletionEligibility(
        repository,
        infrastructure,
        await hasActiveRepositoryProvisioningRun(ctx, repository._id),
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
        message: "Removing this repository from Samebase.",
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
        message: "Removal from Samebase failed. Retry it from the Samebase dashboard.",
        updatedAt: run?.updatedAt ?? deletion.failedAt,
      };
    }
    default: {
      deletion satisfies never;
      throw new Error("Unknown repository deletion state.");
    }
  }
}

async function readManagedProviderPlan(
  ctx: Pick<QueryCtx, "db">,
  repository: Doc<"repositories">,
): Promise<ManagedProviderPlan> {
  const plan = await ctx.db
    .query("workflow_repositoryProvisioning_plans")
    .withIndex("by_repository", (q) => q.eq("repositoryId", repository._id))
    .unique();
  if (!plan) {
    return null;
  }
  if (!isSamebaseProvisioningPlan(plan)) {
    return {
      provisioning: plan.provisioning,
      convexConfigPath: plan.convexConfigPath,
      ciSecrets: plan.ciSecrets,
    };
  }
  // An old plan without its destinations reads like a finished old plan, so that one such row does
  // not break the whole list of its organization.
  if (repository.convexTeamId === undefined || repository.cloudflareAccountId === undefined) {
    return null;
  }

  return {
    convexConfigPath: plan.convexConfigPath,
    convex: { ...plan.convex, teamId: repository.convexTeamId },
    cloudflare: { ...plan.cloudflare, accountId: repository.cloudflareAccountId },
  };
}

function resolveProviderWriteSummary(
  infrastructure: RepositoryInfrastructureState,
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
  infrastructure: RepositoryInfrastructureState,
): Promise<{
  runId: Id<"workflow_repositoryProvisioning_runs">;
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
  providerPlan: ManagedProviderPlan,
  convexProjects: ConvexProject[],
  cloudflareWorkers: CloudflareWorker[],
  infrastructure: RepositoryInfrastructureState,
): Promise<ProviderSetupSummary> {
  const managedOperation = await readManagedProviderOperation(ctx, infrastructure);

  // Samebase's part of a repository_actions setup is the GitHub Actions secret and variable; the
  // repository's alchemy workflow owns the Convex project.
  if (providerPlan && readRepositoryProvisioningMode(providerPlan) === "repository_actions") {
    return managedOperation
      ? readProviderRunSummary({ provider: "github", ...managedOperation })
      : { status: "ready" };
  }
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

const vRepositoryPullRequestFilters = object({
  repositoryId: id("repositories"),
  hiddenLabels: array(string()),
  includeDrafts: boolean(),
  includeNoLabel: boolean(),
});
const vRepositoryFolderSuggestions = array(string());

// MARK: Public

export const listRepositoryFolderSuggestions = query({
  access: "access_repo_connect",
  args: {
    repositoryId: id("repositories"),
  },
  returns: vRepositoryFolderSuggestions,
  handler: async (ctx, args) => {
    const repository = await findRepositoryForUser(ctx.db, {
      userId: ctx.viewer.userId,
      repositoryId: args.repositoryId,
    });
    if (!isLiveConnectedRepository(repository)) {
      return [];
    }

    const defaultBranchTree = await ctx.runQuery(components.gitEditor.branches.get, {
      repositoryId: args.repositoryId,
      branch: repository.defaultBranch,
    });
    if (!defaultBranchTree) {
      return [];
    }

    return defaultBranchTree.treeData.tree
      .filter((item) => item.type === "tree")
      .map((item) => item.path)
      .sort((left, right) => left.localeCompare(right));
  },
});

export const getUserRepositoryPullRequestFilters = query({
  access: "access_dashboard",
  args: {},
  returns: array(vRepositoryPullRequestFilters),
  handler: async (ctx) => {
    const filters = [];
    for await (const repositoryPullRequestFilter of ctx.db
      .query("ui_repositoryPullRequests_filters")
      .withIndex("by_user", (q) => q.eq("userId", ctx.viewer.userId))) {
      const repository = await findRepositoryForUser(ctx.db, {
        userId: ctx.viewer.userId,
        repositoryId: repositoryPullRequestFilter.repositoryId,
      });
      if (repository === null) {
        continue;
      }
      filters.push({
        repositoryId: repositoryPullRequestFilter.repositoryId,
        hiddenLabels: repositoryPullRequestFilter.hiddenLabels,
        includeDrafts: repositoryPullRequestFilter.includeDrafts,
        includeNoLabel: repositoryPullRequestFilter.includeNoLabel,
      });
    }

    return filters.sort((left, right) => left.repositoryId.localeCompare(right.repositoryId));
  },
});

export const getUserRepositoryResourceLinksState = query({
  access: "access_dashboard",
  args: {},
  returns: array(vRepositoryResourceLinksState),
  handler: async (ctx) => {
    const states = [];
    for await (const state of ctx.db
      .query("ui_repositoryResourceLinks_settings")
      .withIndex("by_user", (q) => q.eq("userId", ctx.viewer.userId))) {
      const repository = await findRepositoryForUser(ctx.db, {
        userId: ctx.viewer.userId,
        repositoryId: state.repositoryId,
      });
      if (repository === null) {
        continue;
      }
      states.push({
        resourceLinksOpen: state.resourceLinksOpen,
        repositoryId: state.repositoryId,
      });
    }

    return states.sort((left, right) => left.repositoryId.localeCompare(right.repositoryId));
  },
});

export const setRepositoryResourceLinksOpen = mutation({
  access: "access_dashboard",
  args: vRepositoryResourceLinksState,
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = ctx.viewer.userId;
    const repository = await requireRepositoryForUser(ctx.db, {
      userId,
      repositoryId: args.repositoryId,
    });
    if (isRepositoryDeletingOrDeleteFailed(repository)) {
      throw new Error("Removal from Samebase is in progress.");
    }
    const existing = await ctx.db
      .query("ui_repositoryResourceLinks_settings")
      .withIndex("by_user_and_repository", (q) =>
        q.eq("userId", userId).eq("repositoryId", args.repositoryId),
      )
      .first();
    const nextState = {
      resourceLinksOpen: args.resourceLinksOpen,
      updatedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, nextState);
      return;
    }

    await ctx.db.insert("ui_repositoryResourceLinks_settings", {
      userId,
      repositoryId: args.repositoryId,
      ...nextState,
    });
  },
});

export const setRepositoryPullRequestFilters = mutation({
  access: "access_dashboard",
  args: vRepositoryPullRequestFilters,
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = ctx.viewer.userId;
    const repository = await requireRepositoryForUser(ctx.db, {
      userId,
      repositoryId: args.repositoryId,
    });
    if (isRepositoryDeletingOrDeleteFailed(repository)) {
      throw new Error("Removal from Samebase is in progress.");
    }
    const existing = await ctx.db
      .query("ui_repositoryPullRequests_filters")
      .withIndex("by_user_and_repository", (q) =>
        q.eq("userId", userId).eq("repositoryId", args.repositoryId),
      )
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
      await ctx.db.insert("ui_repositoryPullRequests_filters", {
        userId,
        repositoryId: args.repositoryId,
        hiddenLabels: args.hiddenLabels,
        includeDrafts: args.includeDrafts,
        includeNoLabel: args.includeNoLabel,
      });
    }
  },
});

function groupRepositoryRows<Row extends { repositoryId: Id<"repositories"> }>(
  rows: Row[],
): Map<Id<"repositories">, Row[]> {
  const rowsByRepository = new Map<Id<"repositories">, Row[]>();
  for (const row of rows) {
    const repositoryRows = rowsByRepository.get(row.repositoryId);
    if (repositoryRows) {
      repositoryRows.push(row);
    } else {
      rowsByRepository.set(row.repositoryId, [row]);
    }
  }
  return rowsByRepository;
}

/** The repository list that `repository:list` and `repository:listForUser` return. */
export async function readOrganizationRepositories(
  ctx: Pick<QueryCtx, "db" | "runQuery">,
  organizationIds: Id<"organizations">[],
): Promise<UserRepositoriesResult> {
  const organizationRows = await Promise.all(
    organizationIds.map(async (organizationId) => {
      const [
        organization,
        connectedRepositories,
        provisioningRepositories,
        failedRepositories,
        convexProjects,
        cloudflareWorkers,
      ] = await Promise.all([
        ctx.db.get(organizationId),
        ctx.db
          .query("repositories")
          .withIndex("by_organization_and_state_and_deletion_state", (q) =>
            q.eq("organizationId", organizationId).eq("state", "connected"),
          )
          .collect(),
        ctx.db
          .query("repositories")
          .withIndex("by_organization_and_state_and_deletion_state", (q) =>
            q.eq("organizationId", organizationId).eq("state", "provisioning"),
          )
          .collect(),
        ctx.db
          .query("repositories")
          .withIndex("by_organization_and_state_and_deletion_state", (q) =>
            q.eq("organizationId", organizationId).eq("state", "failed"),
          )
          .collect(),
        ctx.db
          .query("repositoryConvexProjects")
          .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
          .collect(),
        ctx.db
          .query("repositoryCloudflareWorkers")
          .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
          .collect(),
      ]);
      if (organization === null) {
        throw new Error("Organization not found.");
      }
      return {
        organizationId,
        githubOwnerLogin: organization.githubOwnerLogin,
        repositories: [
          ...connectedRepositories,
          ...provisioningRepositories,
          ...failedRepositories,
        ],
        convexProjects,
        cloudflareWorkers,
      };
    }),
  );
  const repositories = organizationRows.flatMap((rows) => rows.repositories);
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
  const convexProjectsByRepository = groupRepositoryRows(
    organizationRows.flatMap((rows) => rows.convexProjects),
  );
  const cloudflareWorkersByRepository = groupRepositoryRows(
    organizationRows.flatMap((rows) => rows.cloudflareWorkers),
  );
  const connectedRepositories = repositories.filter(isConnectedRepository);
  const initializingRepositoryResults: Array<UserRepositoryResult & { sortTime: number }> = [];
  for (const repository of repositories) {
    if (repository.state !== "provisioning" && repository.state !== "failed") {
      continue;
    }
    const [infrastructure, providerPlan] = await Promise.all([
      readRepositoryInfrastructureState(ctx, repository),
      readManagedProviderPlan(ctx, repository),
    ]);
    const deletion = await resolveRepositoryDeletionSummary(ctx, repository, infrastructure);
    const githubOwnerLogin = getGitHubOwnerLogin(repository.organizationId);
    initializingRepositoryResults.push({
      repositoryId: repository._id,
      organizationId: repository.organizationId,
      convexTeamId: repository.convexTeamId,
      cloudflareAccountId: repository.cloudflareAccountId,
      sortTime: repository.createdAt,
      githubOwnerLogin: githubOwnerLogin,
      githubRepositoryName: repository.githubRepositoryName,
      githubRepositoryDatabaseId:
        repository.githubMode === "connect_existing_repository"
          ? repository.githubRepositoryDatabaseId
          : undefined,
      githubRepositoryFullName: `${githubOwnerLogin}/${repository.githubRepositoryName}`,
      defaultBranch: undefined,
      fileCount: 0,
      lastEditTime: undefined,
      sourceSetup: await resolveSourceSetupSummary(ctx, repository, providerPlan),
      providerSetup: { status: "not_applicable" },
      providerPlan,
      providerWrite: resolveProviderWriteSummary(infrastructure),
      deletion,
      isSamebaseManaged: repository.githubMode === "create_repository",
      hasConnectedGitHubRepository: false,
      hasConvexProvision: false,
      hasCloudflareProvision: false,
      canRemoveConvexProvision: false,
      canRemoveCloudflareProvision: false,
      cloudflareWorkers: [],
      convexProjects: [],
    });
  }

  const repositoryResults: Array<UserRepositoryResult & { sortTime: number }> = await Promise.all(
    connectedRepositories.map(async (repository) => {
      const githubOwnerLogin = getGitHubOwnerLogin(repository.organizationId);
      const [infrastructure, providerPlan] = await Promise.all([
        readRepositoryInfrastructureState(ctx, repository),
        readManagedProviderPlan(ctx, repository),
      ]);
      const deletion = await resolveRepositoryDeletionSummary(ctx, repository, infrastructure);
      const providerWrite = resolveProviderWriteSummary(infrastructure);
      const convexProjects = (convexProjectsByRepository.get(repository._id) ?? []).sort(
        compareConvexProjectSortOrder,
      );
      const cloudflareWorkers = (cloudflareWorkersByRepository.get(repository._id) ?? []).sort(
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
          repositoryId: repository._id,
          organizationId: repository.organizationId,
          convexTeamId: repository.convexTeamId,
          cloudflareAccountId: repository.cloudflareAccountId,
          sortTime: repository.createdAt,
          githubOwnerLogin: githubOwnerLogin,
          githubRepositoryName: repository.githubRepositoryName,
          githubRepositoryDatabaseId: repository.githubRepositoryDatabaseId,
          githubRepositoryFullName: `${githubOwnerLogin}/${repository.githubRepositoryName}`,
          defaultBranch: repository.defaultBranch,
          fileCount: 0,
          lastEditTime: undefined,
          sourceSetup: { status: "not_applicable" },
          providerSetup: { status: "not_applicable" },
          providerPlan,
          providerWrite,
          deletion,
          isSamebaseManaged: isSamebaseManagedRepository(repository),
          hasConnectedGitHubRepository: true,
          hasConvexProvision,
          hasCloudflareProvision,
          canRemoveConvexProvision,
          canRemoveCloudflareProvision,
          cloudflareWorkers: cloudflareWorkerSummaries,
          convexProjects: convexProjectSummaries,
        };
      }

      const { fileCount, lastEditTime } = await ctx.runQuery(
        components.gitEditor.staging.getRepositorySummary,
        { repositoryId: repository._id },
      );

      const githubRepositoryFullName = `${githubOwnerLogin}/${repository.githubRepositoryName}`;
      const sourceSetup = await resolveSourceSetupSummary(ctx, repository, providerPlan);
      const providerSetup =
        sourceSetup.status === "ready"
          ? await resolveProviderSetupSummary(
              ctx,
              providerPlan,
              convexProjects,
              cloudflareWorkers,
              infrastructure,
            )
          : { status: "not_applicable" as const };
      return {
        repositoryId: repository._id,
        organizationId: repository.organizationId,
        convexTeamId: repository.convexTeamId,
        cloudflareAccountId: repository.cloudflareAccountId,
        sortTime: repository.createdAt,
        githubOwnerLogin: githubOwnerLogin,
        githubRepositoryName: repository.githubRepositoryName,
        githubRepositoryDatabaseId: repository.githubRepositoryDatabaseId,
        githubRepositoryFullName,
        defaultBranch: repository.defaultBranch,
        fileCount,
        lastEditTime,
        sourceSetup,
        providerSetup,
        providerPlan,
        providerWrite,
        deletion,
        isSamebaseManaged: isSamebaseManagedRepository(repository),
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
  return [...repositoryResults, ...initializingRepositoryResults]
    .sort((a, b) => {
      const aTime = a.lastEditTime ?? a.sortTime;
      const bTime = b.lastEditTime ?? b.sortTime;
      return (
        bTime - aTime ||
        a.githubRepositoryFullName.localeCompare(b.githubRepositoryFullName) ||
        a.repositoryId.localeCompare(b.repositoryId)
      );
    })
    .map(({ sortTime: _sortTime, ...repository }) => repository);
}
