import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import { query } from "../functions";
import { startCreateRepositoryProvisioningWorkflow } from "../repositoryProvisioningWorkflow";
import {
  findOrganizationAccessContext,
  findRepositoryForUser,
  listOrganizationIdsForUser,
  requireActiveOrganizationActor,
  requireOrganizationAccessContext,
  requireOrganizationOwnerAccessContext,
} from "../organizationAccess";
import { vGitHubAppInstallationAccess } from "../githubAppAccess";
import {
  parseGitHubRepositoryFullName,
  vGitHubRepositoryVisibility,
  vRepositoryConnectedGitHubTarget,
} from "./model";
import { REPOSITORY_ROOT_DIRECTORY } from "../../shared/repositoryRootDirectory";
import {
  isConnectedRepository,
  isLiveConnectedRepository,
  isSamebaseManagedRepository,
} from "./state";
import { isRepositoryDeletingOrDeleteFailed } from "./deletion/state";
import { readActiveUser } from "../identity/lifecycle";
import {
  requireActiveRepositoryProvisioningAuthority,
  requireActiveRepositoryProvisioningContinuation,
} from "../repositoryWorkflowAuthority";
import {
  requireBillingResourceCapacity,
  requireBillingResourceCapacityForAuthority,
} from "../billingResourceQuotas";
import { vConvexDeploymentRegion } from "../convexDeploymentRegionModel";

const nullValidator = v.null();
const { array, id, object, optional, string, union } = v;

// Get a specific repository by repository full name for a user
export const getRepositoryByRepository = query({
  access: "access_files_read",
  args: {
    githubRepositoryFullName: string(),
    branch: optional(string()),
  },
  handler: async (ctx, args) => {
    return await getRepositoryByRepositoryHelper(ctx, {
      userId: ctx.viewer.userId,
      githubRepositoryFullName: args.githubRepositoryFullName,
      branch: args.branch,
    });
  },
});

// MARK: Internal

export const getByIdForUser = internalQuery({
  args: {
    repositoryId: id("repositories"),
    userId: id("users"),
  },
  handler: async (ctx, args) => {
    return await findRepositoryForUser(ctx.db, args);
  },
});

const vRepositoryProviderTargets = object({
  convexTeamId: string(),
  cloudflareAccountId: string(),
});

const vGitHubIdentityConnectedRepository = object({
  repositoryId: id("repositories"),
  githubRepositoryDatabaseId: string(),
  githubRepositoryName: string(),
});

const vGitHubIdentityOccupiedRepository = object({
  repositoryId: id("repositories"),
  githubRepositoryName: string(),
});

const vGitHubIdentityObservationTarget = object({
  connectedRepositories: array(vGitHubIdentityConnectedRepository),
  occupiedRepositories: array(vGitHubIdentityOccupiedRepository),
});

export const getGitHubIdentityObservationRepositories = internalQuery({
  args: {
    userId: id("users"),
    organizationId: id("organizations"),
  },
  returns: vGitHubIdentityObservationTarget,
  handler: async (ctx, args) => {
    await requireOrganizationAccessContext(ctx.db, args);
    const connectedRepositories = [];
    const occupiedRepositories = [];
    for await (const repository of ctx.db
      .query("repositories")
      .withIndex("by_organization", (query) => query.eq("organizationId", args.organizationId))) {
      if (repository.state !== "not_connected") {
        occupiedRepositories.push({
          repositoryId: repository._id,
          githubRepositoryName: repository.githubRepositoryName,
        });
      }
      if (isConnectedRepository(repository)) {
        connectedRepositories.push({
          repositoryId: repository._id,
          githubRepositoryDatabaseId: repository.githubRepositoryDatabaseId,
          githubRepositoryName: repository.githubRepositoryName,
        });
      }
    }

    connectedRepositories.sort((left, right) =>
      left.repositoryId.localeCompare(right.repositoryId),
    );
    occupiedRepositories.sort((left, right) => left.repositoryId.localeCompare(right.repositoryId));
    return {
      connectedRepositories,
      occupiedRepositories,
    };
  },
});

const vGitHubRepositoryNameUpdateTarget = object({
  organization: vGitHubAppInstallationAccess,
  repository: vGitHubIdentityConnectedRepository,
});

export const getGitHubRepositoryNameUpdateTargetForUser = internalQuery({
  args: {
    userId: id("users"),
    repositoryId: id("repositories"),
  },
  returns: vGitHubRepositoryNameUpdateTarget,
  handler: async (ctx, args) => {
    const repository = await ctx.db.get(args.repositoryId);
    if (!isConnectedRepository(repository)) {
      throw new Error("Connected repository not found.");
    }
    await requireOrganizationOwnerAccessContext(ctx.db, {
      userId: args.userId,
      organizationId: repository.organizationId,
    });
    const organization = await ctx.db.get(repository.organizationId);
    if (organization === null) {
      throw new Error("Organization not found.");
    }

    return {
      organization: {
        organizationId: organization._id,
        githubOwnerId: organization.githubOwnerId,
        githubOwnerType: organization.githubOwnerType,
        githubOwnerLogin: organization.githubOwnerLogin,
        githubInstallationId: organization.githubInstallationId,
      },
      repository: {
        repositoryId: repository._id,
        githubRepositoryDatabaseId: repository.githubRepositoryDatabaseId,
        githubRepositoryName: repository.githubRepositoryName,
      },
    };
  },
});

export const updateGitHubRepositoryNameForUser = internalMutation({
  args: {
    userId: id("users"),
    repositoryId: id("repositories"),
    githubRepositoryDatabaseId: string(),
    githubOwnerId: string(),
    expectedStoredName: string(),
    repositoryName: string(),
  },
  returns: object({
    githubOwnerLogin: string(),
    repositoryName: string(),
  }),
  handler: async (ctx, args) => {
    const repository = await ctx.db.get(args.repositoryId);
    if (!isConnectedRepository(repository)) {
      throw new Error("Connected repository not found.");
    }
    if (repository.githubRepositoryDatabaseId !== args.githubRepositoryDatabaseId) {
      throw new Error("GitHub repository identity changed before the name update.");
    }
    await requireOrganizationOwnerAccessContext(ctx.db, {
      userId: args.userId,
      organizationId: repository.organizationId,
    });
    const organization = await ctx.db.get(repository.organizationId);
    if (organization === null || organization.githubOwnerId !== args.githubOwnerId) {
      throw new Error("GitHub owner identity changed before the name update.");
    }
    const repositoryName = args.repositoryName.trim();
    if (repositoryName.length === 0) {
      throw new Error("GitHub repository name is required.");
    }
    if (repository.githubRepositoryName === repositoryName) {
      return {
        githubOwnerLogin: organization.githubOwnerLogin,
        repositoryName,
      };
    }
    if (repository.githubRepositoryName !== args.expectedStoredName) {
      throw new Error("Repository name changed before the GitHub name update.");
    }

    const normalizedName = normalizeGitHubRepositoryCoordinate(repositoryName);
    for await (const occupiedRepository of ctx.db
      .query("repositories")
      .withIndex("by_organization", (query) => query.eq("organizationId", organization._id))) {
      if (
        occupiedRepository._id !== repository._id &&
        occupiedRepository.state !== "not_connected" &&
        normalizeGitHubRepositoryCoordinate(occupiedRepository.githubRepositoryName) ===
          normalizedName
      ) {
        throw new Error("Repository already exists for this repository name.");
      }
    }

    await ctx.db.patch(repository._id, { githubRepositoryName: repositoryName });
    return {
      githubOwnerLogin: organization.githubOwnerLogin,
      repositoryName,
    };
  },
});

export const getProviderTargetsForProvisioningRun = internalQuery({
  args: {
    runId: id("workflow_repositoryProvisioning_runs"),
    userId: id("users"),
    repositoryId: id("repositories"),
  },
  returns: vRepositoryProviderTargets,
  handler: async (ctx, args) => {
    const authority = await requireActiveRepositoryProvisioningAuthority(ctx.db, args);
    const repository = authority.repository;
    if (
      authority.run.trigger !== "create" ||
      repository.convexTeamId === undefined ||
      repository.cloudflareAccountId === undefined
    ) {
      throw new Error("Managed repository provider destinations are not configured.");
    }
    return {
      convexTeamId: repository.convexTeamId,
      cloudflareAccountId: repository.cloudflareAccountId,
    };
  },
});

export const listConnectedRepositoriesForUser = internalQuery({
  args: {
    userId: id("users"),
  },
  returns: array(vRepositoryConnectedGitHubTarget),
  handler: async (ctx, args) => {
    await requireActiveOrganizationActor(ctx.db, args.userId);
    const repositories = [];
    const organizationIds = await listOrganizationIdsForUser(ctx.db, args.userId);
    for (const organizationId of organizationIds) {
      const organization = await ctx.db.get(organizationId);
      if (organization === null) {
        continue;
      }
      for await (const repository of ctx.db
        .query("repositories")
        .withIndex("by_organization_and_state_and_deletion_state", (q) =>
          q.eq("organizationId", organizationId).eq("state", "connected"),
        )) {
        if (!isLiveConnectedRepository(repository)) {
          continue;
        }
        repositories.push({
          repositoryId: repository._id,
          githubRepositoryDatabaseId: repository.githubRepositoryDatabaseId,
          githubOwnerLogin: organization.githubOwnerLogin,
          githubRepositoryName: repository.githubRepositoryName,
          defaultBranch: repository.defaultBranch,
        });
      }
    }

    return repositories.sort(
      (left, right) =>
        left.githubOwnerLogin.localeCompare(right.githubOwnerLogin) ||
        left.githubRepositoryName.localeCompare(right.githubRepositoryName) ||
        left.repositoryId.localeCompare(right.repositoryId),
    );
  },
});

function normalizeGitHubRepositoryCoordinate(value: string): string {
  return value.trim().toLowerCase();
}

async function assertOrganizationHasNoRepositoryNamed(
  ctx: Pick<MutationCtx, "db">,
  args: {
    organizationId: Id<"organizations">;
    githubRepositoryName: string;
  },
): Promise<void> {
  const normalizedName = normalizeGitHubRepositoryCoordinate(args.githubRepositoryName);
  for await (const repository of ctx.db
    .query("repositories")
    .withIndex("by_organization", (query) => query.eq("organizationId", args.organizationId))) {
    if (repository.state === "not_connected") {
      continue;
    }
    if (normalizeGitHubRepositoryCoordinate(repository.githubRepositoryName) === normalizedName) {
      throw new Error("Repository already exists for this repository.");
    }
  }
}

async function requireOrganizationGitHubOwner(
  ctx: Pick<MutationCtx, "db">,
  args: {
    organizationId: Id<"organizations">;
    userId: Id<"users">;
    githubOwnerLogin: string;
  },
): Promise<Doc<"organizations">> {
  await requireOrganizationAccessContext(ctx.db, args);
  const organization = await ctx.db.get(args.organizationId);
  if (organization === null) {
    throw new Error("Organization not found.");
  }
  if (
    organization.githubOwnerLoginNormalized !==
    normalizeGitHubRepositoryCoordinate(args.githubOwnerLogin)
  ) {
    throw new Error("Repository owner does not match the organization GitHub owner.");
  }

  return organization;
}

async function requireRepositoryGitHubOwner(
  ctx: Pick<MutationCtx, "db">,
  args: {
    repository: Doc<"repositories">;
    githubOwnerLogin: string;
  },
): Promise<Doc<"organizations">> {
  const organization = await ctx.db.get(args.repository.organizationId);
  if (
    organization === null ||
    organization.githubOwnerLoginNormalized !==
      normalizeGitHubRepositoryCoordinate(args.githubOwnerLogin)
  ) {
    throw new Error("Repository owner does not match the repository organization.");
  }
  return organization;
}

function requireOrganizationProviderDestinations(organization: Doc<"organizations">): {
  convexTeamId: string;
  cloudflareAccountId: string;
} {
  const convexTeamId = organization.convexTeam?.teamId.trim();
  const cloudflareAccountId = organization.cloudflareAccount?.accountId.trim();
  if (!convexTeamId || !cloudflareAccountId) {
    throw new Error(
      "Convex and Cloudflare destinations are required before creating a repository.",
    );
  }
  return { convexTeamId, cloudflareAccountId };
}

async function insertDefaultRepositoryResourceLinksState(
  ctx: Pick<MutationCtx, "db">,
  args: {
    now: number;
    userId: Id<"users">;
    repositoryId: Id<"repositories">;
  },
): Promise<void> {
  await ctx.db.insert("ui_repositoryResourceLinks_settings", {
    userId: args.userId,
    repositoryId: args.repositoryId,
    resourceLinksOpen: true,
    updatedAt: args.now,
  });
}

export const createInitializingExistingRepositoryForUser = internalMutation({
  args: {
    userId: id("users"),
    organizationId: id("organizations"),
    githubRepositoryDatabaseId: string(),
    githubOwnerLogin: string(),
    githubRepositoryName: string(),
  },
  returns: object({
    repositoryId: id("repositories"),
    runId: id("workflow_repositoryProvisioning_runs"),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    repositoryId: Id<"repositories">;
    runId: Id<"workflow_repositoryProvisioning_runs">;
  }> => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found");
    }
    if (readActiveUser(user) === null) {
      throw new Error("Account deletion is in progress.");
    }
    const requestedGitHubOwnerLogin = args.githubOwnerLogin.trim();
    const githubRepositoryDatabaseId = args.githubRepositoryDatabaseId.trim();
    const githubRepositoryName = args.githubRepositoryName.trim();
    if (!requestedGitHubOwnerLogin || !githubRepositoryDatabaseId || !githubRepositoryName) {
      throw new Error("Invalid repository full name");
    }
    const organization = await requireOrganizationGitHubOwner(ctx, {
      organizationId: args.organizationId,
      userId: args.userId,
      githubOwnerLogin: requestedGitHubOwnerLogin,
    });
    const githubOwnerLogin = organization.githubOwnerLogin;
    const convexTeamId = organization.convexTeam?.teamId.trim();
    const cloudflareAccountId = organization.cloudflareAccount?.accountId.trim();
    await assertOrganizationHasNoRepositoryNamed(ctx, {
      organizationId: organization._id,
      githubRepositoryName,
    });
    const existingRepository = await ctx.db
      .query("repositories")
      .withIndex("by_github_repository_database_id", (query) =>
        query.eq("githubRepositoryDatabaseId", githubRepositoryDatabaseId),
      )
      .unique();
    if (existingRepository !== null) {
      throw new Error("Repository already exists for this GitHub repository.");
    }
    await requireBillingResourceCapacity(ctx, {
      organizationId: organization._id,
      userId: args.userId,
    });
    const now = Date.now();
    const repositoryId = await ctx.db.insert("repositories", {
      organizationId: organization._id,
      ...(convexTeamId ? { convexTeamId } : {}),
      ...(cloudflareAccountId ? { cloudflareAccountId } : {}),
      deletion: { state: "not_deleting" },
      state: "not_connected",
      createdAt: now,
    });
    await insertDefaultRepositoryResourceLinksState(ctx, {
      now,
      userId: args.userId,
      repositoryId,
    });
    const githubRepositoryFullName = `${githubOwnerLogin}/${githubRepositoryName}`;
    const runId = await ctx.db.insert("workflow_repositoryProvisioning_runs", {
      organizationId: organization._id,
      userId: args.userId,
      repositoryId,
      githubRepositoryFullName,
      trigger: "connect_existing_repository",
      state: "queued",
      currentStep: "run_created",
      createdAt: now,
      updatedAt: now,
    });

    // The run owns source setup for this existing repository connection.
    await ctx.db.patch(repositoryId, {
      state: "provisioning",
      githubMode: "connect_existing_repository",
      runId,
      startedAt: now,
      githubRepositoryDatabaseId,
      githubRepositoryName,
    });
    await ctx.db.insert("workflow_repositoryProvisioning_events", {
      userId: args.userId,
      repositoryId,
      githubRepositoryFullName,
      runId,
      step: "initialize_repository",
      level: "info",
      message: "Queued existing repository connection.",
      createdAt: now,
      sourceOrder: { creationTime: now, documentId: crypto.randomUUID() },
    });

    return { repositoryId, runId };
  },
});

export const connectExistingRepositoryGitHub = internalMutation({
  args: {
    repositoryId: id("repositories"),
    runId: id("workflow_repositoryProvisioning_runs"),
    userId: id("users"),
    githubRepositoryDatabaseId: v.string(),
    githubOwnerLogin: v.string(),
    githubRepositoryName: v.string(),
    defaultBranch: v.string(),
    visibility: vGitHubRepositoryVisibility,
  },
  returns: nullValidator,
  handler: async (ctx, args) => {
    const authority = await requireActiveRepositoryProvisioningContinuation(ctx, args);
    if (authority.run.trigger !== "connect_existing_repository") {
      throw new Error("Provisioning run does not match existing repository setup.");
    }
    const repository = authority.repository;
    if (isRepositoryDeletingOrDeleteFailed(repository)) {
      return null;
    }

    const organization = await requireRepositoryGitHubOwner(ctx, {
      repository,
      githubOwnerLogin: args.githubOwnerLogin,
    });
    const convexTeamId = repository.convexTeamId ?? organization.convexTeam?.teamId.trim();
    const cloudflareAccountId =
      repository.cloudflareAccountId ?? organization.cloudflareAccount?.accountId.trim();

    // GitHub repository id stays stable across owner/name renames.
    const existingRepository = await ctx.db
      .query("repositories")
      .withIndex("by_github_repository_database_id", (q) =>
        q.eq("githubRepositoryDatabaseId", args.githubRepositoryDatabaseId),
      )
      .unique();
    if (existingRepository && existingRepository._id !== args.repositoryId) {
      throw new Error("Repository already exists for this GitHub repository.");
    }
    if (isConnectedRepository(repository)) {
      if (
        repository.githubMode !== "connect_existing_repository" ||
        repository.githubRepositoryDatabaseId !== args.githubRepositoryDatabaseId ||
        repository.runId !== args.runId
      ) {
        throw new Error("Connected GitHub repository identity cannot be changed.");
      }
      return null;
    }
    if (
      repository.state !== "provisioning" ||
      repository.githubMode !== "connect_existing_repository" ||
      repository.runId !== args.runId
    ) {
      throw new Error("Repository is not waiting for existing repository setup.");
    }
    if (repository.githubRepositoryDatabaseId !== args.githubRepositoryDatabaseId) {
      throw new Error("Provisioning GitHub repository identity cannot be changed.");
    }
    await requireBillingResourceCapacityForAuthority(ctx, {
      authority: {
        kind: "repository_provisioning",
        runId: args.runId,
        userId: args.userId,
        repositoryId: args.repositoryId,
      },
    });

    await ctx.db.replace(args.repositoryId, {
      organizationId: repository.organizationId,
      ...(convexTeamId ? { convexTeamId } : {}),
      ...(cloudflareAccountId ? { cloudflareAccountId } : {}),
      deletion: repository.deletion,
      state: "connected",
      githubMode: "connect_existing_repository",
      runId: args.runId,
      githubRepositoryDatabaseId: args.githubRepositoryDatabaseId,
      githubRepositoryName: args.githubRepositoryName,
      visibility: args.visibility,
      defaultBranch: args.defaultBranch,
      connectedAt: Date.now(),
      createdAt: repository.createdAt,
    });

    return null;
  },
});

export const createInitializingSamebaseManagedRepositoryForUser = internalMutation({
  args: {
    userId: id("users"),
    organizationId: id("organizations"),
    githubOwnerLogin: string(),
    githubRepositoryName: string(),
    visibility: vGitHubRepositoryVisibility,
    description: union(string(), nullValidator),
    convexProjectName: string(),
    convexDeploymentRegion: vConvexDeploymentRegion,
    convexTeamId: string(),
    cloudflareAccountId: string(),
    cloudflareWorkerName: string(),
    cloudflareBuildTokenUuid: union(string(), nullValidator),
  },
  returns: object({
    repositoryId: id("repositories"),
    runId: id("workflow_repositoryProvisioning_runs"),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    repositoryId: Id<"repositories">;
    runId: Id<"workflow_repositoryProvisioning_runs">;
  }> => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found");
    }
    if (readActiveUser(user) === null) {
      throw new Error("Account deletion is in progress.");
    }

    const requestedGitHubOwnerLogin = args.githubOwnerLogin.trim();
    const githubRepositoryName = args.githubRepositoryName.trim();
    if (!requestedGitHubOwnerLogin || !githubRepositoryName) {
      throw new Error("Invalid repository full name");
    }
    const organization = await requireOrganizationGitHubOwner(ctx, {
      organizationId: args.organizationId,
      userId: args.userId,
      githubOwnerLogin: requestedGitHubOwnerLogin,
    });
    const githubOwnerLogin = organization.githubOwnerLogin;
    const destinations = requireOrganizationProviderDestinations(organization);
    if (
      destinations.convexTeamId !== args.convexTeamId ||
      destinations.cloudflareAccountId !== args.cloudflareAccountId
    ) {
      throw new Error("Organization provider destinations changed before repository creation.");
    }
    await assertOrganizationHasNoRepositoryNamed(ctx, {
      organizationId: organization._id,
      githubRepositoryName,
    });
    await requireBillingResourceCapacity(ctx, {
      organizationId: organization._id,
      userId: args.userId,
    });
    const now = Date.now();
    const repositoryId = await ctx.db.insert("repositories", {
      organizationId: organization._id,
      ...destinations,
      deletion: { state: "not_deleting" },
      state: "not_connected",
      createdAt: now,
    });
    await insertDefaultRepositoryResourceLinksState(ctx, {
      now,
      userId: args.userId,
      repositoryId,
    });
    const githubRepositoryFullName = `${githubOwnerLogin}/${githubRepositoryName}`;
    const runId = await ctx.db.insert("workflow_repositoryProvisioning_runs", {
      organizationId: organization._id,
      userId: args.userId,
      repositoryId,
      githubRepositoryFullName,
      trigger: "create",
      state: "queued",
      currentStep: "run_created",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("workflow_repositoryProvisioning_writeLocks", {
      repositoryId,
      owner: {
        kind: "managed_run",
        runId,
      },
      state: "active",
      lastWriteAt: {},
      updatedAt: now,
    });

    // The run owns this GitHub attempt; later provider retries use their own runs.
    await ctx.db.patch(repositoryId, {
      state: "provisioning",
      githubMode: "create_repository",
      runId,
      startedAt: now,
      githubRepositoryName,
      visibility: args.visibility,
    });
    await ctx.db.insert("workflow_repositoryProvisioning_events", {
      userId: args.userId,
      repositoryId,
      githubRepositoryFullName,
      runId,
      step: "initialize_repository",
      level: "info",
      message: "Created the initializing Samebase repository.",
      createdAt: now,
      sourceOrder: { creationTime: now, documentId: crypto.randomUUID() },
    });
    await ctx.db.insert("workflow_repositoryProvisioning_plans", {
      repositoryId,
      convexConfigPath: "convex.json",
      starterBuildContract: "native_worker_previews",
      convex: {
        state: "planned",
        projectName: args.convexProjectName,
        deploymentRegion: args.convexDeploymentRegion,
      },
      cloudflare: {
        state: "planned",
        workerName: args.cloudflareWorkerName,
        rootDirectory: REPOSITORY_ROOT_DIRECTORY,
        buildTokenUuid: args.cloudflareBuildTokenUuid,
      },
      createdAt: now,
      updatedAt: now,
    });
    const workflowId = await startCreateRepositoryProvisioningWorkflow(ctx, {
      repositoryId,
      runId,
      userId: args.userId,
      githubRepositoryName,
      githubOwnerLogin,
      description: args.description,
      private: args.visibility === "private",
    });
    const queuedAt = Date.now();
    await ctx.db.patch(runId, {
      workflowId,
      currentStep: "validate_connections",
      updatedAt: queuedAt,
    });
    await ctx.db.insert("workflow_repositoryProvisioning_events", {
      userId: args.userId,
      repositoryId,
      githubRepositoryFullName,
      runId,
      step: "validate_connections",
      level: "info",
      message: "Queued app provisioning.",
      createdAt: queuedAt,
      sourceOrder: { creationTime: queuedAt, documentId: crypto.randomUUID() },
    });
    return { repositoryId, runId };
  },
});

export const connectSamebaseManagedRepositoryGitHub = internalMutation({
  args: {
    repositoryId: id("repositories"),
    runId: id("workflow_repositoryProvisioning_runs"),
    userId: id("users"),
    githubRepositoryDatabaseId: string(),
    githubOwnerLogin: string(),
    githubRepositoryName: string(),
    defaultBranch: string(),
    visibility: vGitHubRepositoryVisibility,
  },
  returns: nullValidator,
  handler: async (ctx, args) => {
    const authority = await requireActiveRepositoryProvisioningContinuation(ctx, args);
    if (authority.run.trigger !== "create") {
      throw new Error("Provisioning run does not match managed repository setup.");
    }
    const repository = authority.repository;
    if (isRepositoryDeletingOrDeleteFailed(repository)) {
      return null;
    }
    await requireRepositoryGitHubOwner(ctx, {
      repository,
      githubOwnerLogin: args.githubOwnerLogin,
    });

    const existingRepository = await ctx.db
      .query("repositories")
      .withIndex("by_github_repository_database_id", (q) =>
        q.eq("githubRepositoryDatabaseId", args.githubRepositoryDatabaseId),
      )
      .unique();
    if (existingRepository && existingRepository._id !== args.repositoryId) {
      throw new Error("Repository already exists for this GitHub repository.");
    }
    if (isConnectedRepository(repository)) {
      if (!isSamebaseManagedRepository(repository)) {
        throw new Error("Connected GitHub repository identity cannot be changed.");
      }
      if (
        repository.githubRepositoryDatabaseId !== args.githubRepositoryDatabaseId ||
        repository.runId !== args.runId
      ) {
        throw new Error("Connected GitHub repository identity cannot be changed.");
      }
      return null;
    }
    if (
      repository.state !== "provisioning" ||
      repository.githubMode !== "create_repository" ||
      repository.runId !== args.runId
    ) {
      throw new Error("Repository is not waiting for GitHub provisioning.");
    }
    await requireBillingResourceCapacityForAuthority(ctx, {
      authority: {
        kind: "repository_provisioning",
        runId: args.runId,
        userId: args.userId,
        repositoryId: args.repositoryId,
      },
    });

    await ctx.db.replace(args.repositoryId, {
      organizationId: repository.organizationId,
      convexTeamId: repository.convexTeamId,
      cloudflareAccountId: repository.cloudflareAccountId,
      deletion: repository.deletion,
      state: "connected",
      githubMode: "create_repository",
      runId: args.runId,
      githubRepositoryDatabaseId: args.githubRepositoryDatabaseId,
      githubRepositoryName: args.githubRepositoryName,
      visibility: args.visibility,
      defaultBranch: args.defaultBranch,
      connectedAt: Date.now(),
      createdAt: repository.createdAt,
    });

    return null;
  },
});

export const markGithubProvisioningFailed = internalMutation({
  args: {
    runId: id("workflow_repositoryProvisioning_runs"),
  },
  returns: nullValidator,
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) {
      return null;
    }
    const repository = await ctx.db.get(run.repositoryId);
    if (repository && isRepositoryDeletingOrDeleteFailed(repository)) {
      return null;
    }
    if (repository?.state !== "provisioning" || repository.runId !== args.runId) {
      return null;
    }
    if (run.state !== "queued" && run.state !== "running") {
      return null;
    }
    if (repository.githubMode === "create_repository") {
      await ctx.db.replace(repository._id, {
        organizationId: repository.organizationId,
        convexTeamId: repository.convexTeamId,
        cloudflareAccountId: repository.cloudflareAccountId,
        deletion: repository.deletion,
        state: "failed",
        githubMode: "create_repository",
        runId: args.runId,
        githubRepositoryName: repository.githubRepositoryName,
        visibility: repository.visibility,
        failedAt: Date.now(),
        createdAt: repository.createdAt,
      });
      return null;
    }

    await ctx.db.replace(repository._id, {
      organizationId: repository.organizationId,
      ...(repository.convexTeamId === undefined ? {} : { convexTeamId: repository.convexTeamId }),
      ...(repository.cloudflareAccountId === undefined
        ? {}
        : { cloudflareAccountId: repository.cloudflareAccountId }),
      deletion: repository.deletion,
      state: "failed",
      githubMode: "connect_existing_repository",
      runId: args.runId,
      githubRepositoryDatabaseId: repository.githubRepositoryDatabaseId,
      githubRepositoryName: repository.githubRepositoryName,
      failedAt: Date.now(),
      createdAt: repository.createdAt,
    });

    return null;
  },
});

export const getById = internalQuery({
  args: {
    id: v.id("repositories"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

async function getRepositoryByRepositoryHelper(
  ctx: QueryCtx,
  args: {
    userId: Id<"users">;
    githubRepositoryFullName: string;
    branch?: string;
  },
) {
  const { owner: githubOwnerLogin, name: githubRepositoryName } = parseGitHubRepositoryFullName(
    args.githubRepositoryFullName,
  );
  const organization = await ctx.db
    .query("organizations")
    .withIndex("by_github_owner_login_normalized", (query) =>
      query.eq("githubOwnerLoginNormalized", normalizeGitHubRepositoryCoordinate(githubOwnerLogin)),
    )
    .unique();
  if (organization === null) {
    return null;
  }
  const access = await findOrganizationAccessContext(ctx.db, {
    userId: args.userId,
    organizationId: organization._id,
  });
  if (access === null) {
    return null;
  }
  const matchingRepositories = await ctx.db
    .query("repositories")
    .withIndex("by_organization_and_github_repository_name", (query) =>
      query.eq("organizationId", organization._id).eq("githubRepositoryName", githubRepositoryName),
    )
    .collect();
  const liveRepositories = matchingRepositories.filter(isLiveConnectedRepository);
  if (liveRepositories.length > 1) {
    throw new Error("Repository maps to multiple live repositories.");
  }
  const repository = liveRepositories.at(0);

  if (repository === undefined) {
    return null;
  }

  const requestedBranch =
    typeof args.branch === "string" && args.branch.trim().length > 0
      ? args.branch.trim()
      : undefined;

  const resolvedBranch = requestedBranch ?? repository.defaultBranch;

  const branchTree = await ctx.db
    .query("observations_repository_branchTrees")
    .withIndex("by_repository_and_branch", (q) =>
      q.eq("repositoryId", repository._id).eq("branch", resolvedBranch),
    )
    .first();

  return {
    repositoryId: repository._id,
    organizationId: repository.organizationId,
    createdAt: repository.createdAt,
    githubRepositoryDatabaseId: repository.githubRepositoryDatabaseId,
    githubOwnerLogin: organization.githubOwnerLogin,
    githubRepositoryName: repository.githubRepositoryName,
    githubRepositoryFullName: `${organization.githubOwnerLogin}/${repository.githubRepositoryName}`,
    treeSHA: branchTree?.treeData.sha,
    commitSHA: branchTree?.commitSHA,
    treeData: branchTree?.treeData,
    treeRefreshStartedAt: repository.treeRefreshStartedAt,
    lastTreeRefreshAt: branchTree?.lastTreeRefreshAt,
    lastTreeRefreshFailedAt: repository.lastTreeRefreshFailedAt,
    treeRefreshFailureKind: repository.treeRefreshFailureKind,
    treeRefreshFailureMessage: repository.treeRefreshFailureMessage,
    treeRefreshCooldownUntil: repository.treeRefreshCooldownUntil,
    branchTreeState: branchTree ? ("ready" as const) : ("unhydrated" as const),
    defaultBranch: repository.defaultBranch,
    resolvedBranch,
  };
}

export const getByRepositoryFullName = internalQuery({
  args: {
    userId: v.id("users"),
    githubRepositoryFullName: v.string(),
    branch: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await getRepositoryByRepositoryHelper(ctx, {
      userId: args.userId,
      githubRepositoryFullName: args.githubRepositoryFullName,
      branch: args.branch,
    });
  },
});
