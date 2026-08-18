import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import { query } from "../functions";
import { startCreateAppProvisioningWorkflow } from "../appProvisioningWorkflow";
import {
  findOrganizationAccessContext,
  findVaultForUser,
  listOrganizationIdsForUser,
  requireActiveOrganizationActor,
  requireOrganizationAccessContext,
  requireOrganizationOwnerAccessContext,
} from "../organizationAccess";
import { vGitHubAppInstallationAccess } from "../githubAppAccess";
import {
  parseRepositoryFullName,
  vGitHubRepositoryVisibility,
  vVaultConnectedRepositoryTarget,
} from "./model";
import { VAULT_ROOT_DIRECTORY } from "../../shared/vaultRootDirectory";
import { isConnectedVault, isLiveConnectedVault, isSamebaseManagedVault } from "./state";
import { isVaultDeletingOrDeleteFailed } from "./deletion/state";
import { readActiveUser } from "../userLifecycle";
import { requireActiveVaultProvisioningAuthority } from "../vaultWorkflowAuthority";
import {
  requireBillingResourceCapacity,
  requireBillingResourceCapacityForAuthority,
} from "../billingResourceQuotas";

const nullValidator = v.null();
const { array, id, object, optional, string, union } = v;

type ProvisioningVault = Extract<Doc<"vaults">, { state: "provisioning" }>;

// Get a specific vault by repository full name for a user
export const getVaultByRepository = query({
  access: "access_files_read",
  args: {
    repositoryFullName: string(),
    branch: optional(string()),
  },
  handler: async (ctx, args) => {
    return await getVaultByRepositoryHelper(ctx, {
      userId: ctx.viewer.userId,
      repositoryFullName: args.repositoryFullName,
      branch: args.branch,
    });
  },
});

// MARK: Internal

export const getByIdForUser = internalQuery({
  args: {
    vaultId: id("vaults"),
    userId: id("users"),
  },
  handler: async (ctx, args) => {
    return await findVaultForUser(ctx.db, args);
  },
});

const vVaultProviderTargets = object({
  convexTeamId: string(),
  cloudflareAccountId: string(),
});

const vGitHubIdentityConnectedVault = object({
  vaultId: id("vaults"),
  ghRepoId: string(),
  name: string(),
});

const vGitHubIdentityOccupiedVault = object({
  vaultId: id("vaults"),
  name: string(),
});

const vGitHubIdentityObservationTarget = object({
  connectedVaults: array(vGitHubIdentityConnectedVault),
  occupiedVaults: array(vGitHubIdentityOccupiedVault),
});

export const getGitHubIdentityObservationVaults = internalQuery({
  args: {
    userId: id("users"),
    organizationId: id("organizations"),
  },
  returns: vGitHubIdentityObservationTarget,
  handler: async (ctx, args) => {
    await requireOrganizationAccessContext(ctx.db, args);
    const connectedVaults = [];
    const occupiedVaults = [];
    for await (const vault of ctx.db
      .query("vaults")
      .withIndex("by_organization", (query) => query.eq("organizationId", args.organizationId))) {
      if (vault.state !== "not_connected") {
        occupiedVaults.push({ vaultId: vault._id, name: vault.name });
      }
      if (isConnectedVault(vault)) {
        connectedVaults.push({
          vaultId: vault._id,
          ghRepoId: vault.ghRepoId,
          name: vault.name,
        });
      }
    }

    connectedVaults.sort((left, right) => left.vaultId.localeCompare(right.vaultId));
    occupiedVaults.sort((left, right) => left.vaultId.localeCompare(right.vaultId));
    return {
      connectedVaults,
      occupiedVaults,
    };
  },
});

const vGitHubRepositoryNameUpdateTarget = object({
  organization: vGitHubAppInstallationAccess,
  vault: vGitHubIdentityConnectedVault,
});

export const getGitHubRepositoryNameUpdateTargetForUser = internalQuery({
  args: {
    userId: id("users"),
    vaultId: id("vaults"),
  },
  returns: vGitHubRepositoryNameUpdateTarget,
  handler: async (ctx, args) => {
    const vault = await ctx.db.get(args.vaultId);
    if (!isConnectedVault(vault)) {
      throw new Error("Connected vault not found.");
    }
    await requireOrganizationOwnerAccessContext(ctx.db, {
      userId: args.userId,
      organizationId: vault.organizationId,
    });
    const organization = await ctx.db.get(vault.organizationId);
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
      vault: {
        vaultId: vault._id,
        ghRepoId: vault.ghRepoId,
        name: vault.name,
      },
    };
  },
});

export const updateGitHubRepositoryNameForUser = internalMutation({
  args: {
    userId: id("users"),
    vaultId: id("vaults"),
    ghRepoId: string(),
    githubOwnerId: string(),
    expectedStoredName: string(),
    repositoryName: string(),
  },
  returns: object({
    githubOwnerLogin: string(),
    repositoryName: string(),
  }),
  handler: async (ctx, args) => {
    const vault = await ctx.db.get(args.vaultId);
    if (!isConnectedVault(vault)) {
      throw new Error("Connected vault not found.");
    }
    if (vault.ghRepoId !== args.ghRepoId) {
      throw new Error("GitHub repository identity changed before the name update.");
    }
    await requireOrganizationOwnerAccessContext(ctx.db, {
      userId: args.userId,
      organizationId: vault.organizationId,
    });
    const organization = await ctx.db.get(vault.organizationId);
    if (organization === null || organization.githubOwnerId !== args.githubOwnerId) {
      throw new Error("GitHub owner identity changed before the name update.");
    }

    const repositoryName = args.repositoryName.trim();
    if (repositoryName.length === 0) {
      throw new Error("GitHub repository name is required.");
    }
    if (vault.name === repositoryName) {
      return {
        githubOwnerLogin: organization.githubOwnerLogin,
        repositoryName,
      };
    }
    if (vault.name !== args.expectedStoredName) {
      throw new Error("Vault name changed before the GitHub name update.");
    }

    const normalizedName = normalizeGitHubRepositoryCoordinate(repositoryName);
    for await (const occupiedVault of ctx.db
      .query("vaults")
      .withIndex("by_organization", (query) => query.eq("organizationId", organization._id))) {
      if (
        occupiedVault._id !== vault._id &&
        occupiedVault.state !== "not_connected" &&
        normalizeGitHubRepositoryCoordinate(occupiedVault.name) === normalizedName
      ) {
        throw new Error("Vault already exists for this repository name.");
      }
    }

    await ctx.db.patch(vault._id, { name: repositoryName });
    return {
      githubOwnerLogin: organization.githubOwnerLogin,
      repositoryName,
    };
  },
});

export const getProviderTargetsForProvisioningRun = internalQuery({
  args: {
    runId: id("workflow_vaultProvisioning_runs"),
    userId: id("users"),
    vaultId: id("vaults"),
  },
  returns: vVaultProviderTargets,
  handler: async (ctx, args) => {
    const vault = (await requireActiveVaultProvisioningAuthority(ctx.db, args)).vault;
    return {
      convexTeamId: vault.convexTeamId,
      cloudflareAccountId: vault.cloudflareAccountId,
    };
  },
});

export const listConnectedRepositoriesForUser = internalQuery({
  args: {
    userId: id("users"),
  },
  returns: array(vVaultConnectedRepositoryTarget),
  handler: async (ctx, args) => {
    await requireActiveOrganizationActor(ctx.db, args.userId);
    const repositories = [];
    const organizationIds = await listOrganizationIdsForUser(ctx.db, args.userId);
    for (const organizationId of organizationIds) {
      const organization = await ctx.db.get(organizationId);
      if (organization === null) {
        continue;
      }
      for await (const vault of ctx.db
        .query("vaults")
        .withIndex("by_organization_and_state_and_deletion_state", (q) =>
          q.eq("organizationId", organizationId).eq("state", "connected"),
        )) {
        if (!isLiveConnectedVault(vault)) {
          continue;
        }
        repositories.push({
          vaultId: vault._id,
          ghRepoId: vault.ghRepoId,
          owner: organization.githubOwnerLogin,
          name: vault.name,
          defaultBranch: vault.defaultBranch,
        });
      }
    }

    return repositories.sort(
      (left, right) =>
        left.owner.localeCompare(right.owner) ||
        left.name.localeCompare(right.name) ||
        left.vaultId.localeCompare(right.vaultId),
    );
  },
});

function normalizeGitHubRepositoryCoordinate(value: string): string {
  return value.trim().toLowerCase();
}

async function assertOrganizationHasNoVaultForRepository(
  ctx: Pick<MutationCtx, "db">,
  args: {
    organizationId: Id<"organizations">;
    name: string;
  },
): Promise<void> {
  const normalizedName = normalizeGitHubRepositoryCoordinate(args.name);
  for await (const vault of ctx.db
    .query("vaults")
    .withIndex("by_organization", (query) => query.eq("organizationId", args.organizationId))) {
    if (vault.state === "not_connected") {
      continue;
    }
    if (normalizeGitHubRepositoryCoordinate(vault.name) === normalizedName) {
      throw new Error("Vault already exists for this repository.");
    }
  }
}

async function requireOrganizationRepositoryOwner(
  ctx: Pick<MutationCtx, "db">,
  args: {
    organizationId: Id<"organizations">;
    userId: Id<"users">;
    owner: string;
  },
): Promise<Doc<"organizations">> {
  await requireOrganizationAccessContext(ctx.db, args);
  const organization = await ctx.db.get(args.organizationId);
  if (organization === null) {
    throw new Error("Organization not found.");
  }
  if (organization.githubOwnerLoginNormalized !== normalizeGitHubRepositoryCoordinate(args.owner)) {
    throw new Error("Repository owner does not match the organization GitHub owner.");
  }

  return organization;
}

async function requireVaultRepositoryOwner(
  ctx: Pick<MutationCtx, "db">,
  args: {
    vault: Doc<"vaults">;
    owner: string;
  },
): Promise<void> {
  const organization = await ctx.db.get(args.vault.organizationId);
  if (
    organization === null ||
    organization.githubOwnerLoginNormalized !== normalizeGitHubRepositoryCoordinate(args.owner)
  ) {
    throw new Error("Repository owner does not match the vault organization.");
  }
}

function pickProvisioningVaultCoreFields(vault: ProvisioningVault) {
  return {
    organizationId: vault.organizationId,
    convexTeamId: vault.convexTeamId,
    cloudflareAccountId: vault.cloudflareAccountId,
    deletion: vault.deletion,
  };
}

function requireOrganizationProviderDestinations(organization: Doc<"organizations">): {
  convexTeamId: string;
  cloudflareAccountId: string;
} {
  const convexTeamId = organization.convexTeam?.teamId.trim();
  const cloudflareAccountId = organization.cloudflareAccount?.accountId.trim();
  if (!convexTeamId || !cloudflareAccountId) {
    throw new Error("Convex and Cloudflare destinations are required before creating a vault.");
  }
  return { convexTeamId, cloudflareAccountId };
}

async function insertDefaultVaultResourceLinksState(
  ctx: Pick<MutationCtx, "db">,
  args: {
    now: number;
    userId: Id<"users">;
    vaultId: Id<"vaults">;
  },
): Promise<void> {
  await ctx.db.insert("ui_vaultResourceLinks_settings", {
    userId: args.userId,
    vaultId: args.vaultId,
    resourceLinksOpen: true,
    updatedAt: args.now,
  });
}

export const createInitializingExistingRepositoryVaultForUser = internalMutation({
  args: {
    userId: id("users"),
    organizationId: id("organizations"),
    ghRepoId: string(),
    ghRepoOwner: string(),
    ghRepoName: string(),
  },
  returns: object({
    vaultId: id("vaults"),
    runId: id("workflow_vaultProvisioning_runs"),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    vaultId: Id<"vaults">;
    runId: Id<"workflow_vaultProvisioning_runs">;
  }> => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found");
    }
    if (readActiveUser(user) === null) {
      throw new Error("Account deletion is in progress.");
    }
    const requestedOwner = args.ghRepoOwner.trim();
    const ghRepoId = args.ghRepoId.trim();
    const name = args.ghRepoName.trim();
    if (!requestedOwner || !ghRepoId || !name) {
      throw new Error("Invalid repository full name");
    }
    const organization = await requireOrganizationRepositoryOwner(ctx, {
      organizationId: args.organizationId,
      userId: args.userId,
      owner: requestedOwner,
    });
    const owner = organization.githubOwnerLogin;
    const destinations = requireOrganizationProviderDestinations(organization);
    await assertOrganizationHasNoVaultForRepository(ctx, {
      organizationId: organization._id,
      name,
    });
    const existingVault = await ctx.db
      .query("vaults")
      .withIndex("by_ghRepoId", (query) => query.eq("ghRepoId", ghRepoId))
      .unique();
    if (existingVault !== null) {
      throw new Error("Vault already exists for this GitHub repository.");
    }
    await requireBillingResourceCapacity(ctx, {
      organizationId: organization._id,
      userId: args.userId,
    });

    const now = Date.now();
    const vaultId = await ctx.db.insert("vaults", {
      organizationId: organization._id,
      ...destinations,
      deletion: { state: "not_deleting" },
      state: "not_connected",
    });
    await insertDefaultVaultResourceLinksState(ctx, {
      now,
      userId: args.userId,
      vaultId,
    });
    const repositoryFullName = `${owner}/${name}`;
    const runId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
      organizationId: organization._id,
      userId: args.userId,
      vaultId,
      repositoryFullName,
      trigger: "connect_existing_repository",
      state: "queued",
      currentStep: "run_created",
      createdAt: now,
      updatedAt: now,
    });

    // The run owns source setup for this existing repository connection.
    await ctx.db.patch(vaultId, {
      state: "provisioning",
      githubMode: "connect_existing_repository",
      runId,
      startedAt: now,
      ghRepoId,
      name,
    });
    await ctx.db.insert("workflow_vaultProvisioning_events", {
      userId: args.userId,
      vaultId,
      repositoryFullName,
      runId,
      step: "initialize_vault",
      level: "info",
      message: "Queued existing repository connection.",
      createdAt: now,
    });

    return { vaultId, runId };
  },
});

export const connectExistingRepositoryVaultGitHub = internalMutation({
  args: {
    vaultId: id("vaults"),
    runId: id("workflow_vaultProvisioning_runs"),
    userId: id("users"),
    ghRepoId: v.string(),
    ghRepoOwner: v.string(),
    ghRepoName: v.string(),
    defaultBranch: v.string(),
    visibility: vGitHubRepositoryVisibility,
  },
  returns: nullValidator,
  handler: async (ctx, args) => {
    const authority = await requireActiveVaultProvisioningAuthority(ctx.db, args);
    if (authority.run.trigger !== "connect_existing_repository") {
      throw new Error("Provisioning run does not match existing repository setup.");
    }
    const vault = authority.vault;
    if (isVaultDeletingOrDeleteFailed(vault)) {
      return null;
    }

    await requireVaultRepositoryOwner(ctx, {
      vault,
      owner: args.ghRepoOwner,
    });

    // GitHub repository id stays stable across owner/name renames.
    const existingVault = await ctx.db
      .query("vaults")
      .withIndex("by_ghRepoId", (q) => q.eq("ghRepoId", args.ghRepoId))
      .unique();
    if (existingVault && existingVault._id !== args.vaultId) {
      throw new Error("Vault already exists for this GitHub repository.");
    }
    if (isConnectedVault(vault)) {
      if (
        vault.githubMode !== "connect_existing_repository" ||
        vault.ghRepoId !== args.ghRepoId ||
        vault.runId !== args.runId
      ) {
        throw new Error("Connected vault repository identity cannot be changed.");
      }
      return null;
    }
    if (
      vault.state !== "provisioning" ||
      vault.githubMode !== "connect_existing_repository" ||
      vault.runId !== args.runId
    ) {
      throw new Error("Vault is not waiting for existing repository setup.");
    }
    if (vault.ghRepoId !== args.ghRepoId) {
      throw new Error("Provisioning vault repository identity cannot be changed.");
    }
    await requireBillingResourceCapacityForAuthority(ctx, {
      authority: {
        kind: "vault_provisioning",
        runId: args.runId,
        userId: args.userId,
        vaultId: args.vaultId,
      },
    });

    await ctx.db.replace(args.vaultId, {
      organizationId: vault.organizationId,
      convexTeamId: vault.convexTeamId,
      cloudflareAccountId: vault.cloudflareAccountId,
      deletion: vault.deletion,
      state: "connected",
      githubMode: "connect_existing_repository",
      runId: args.runId,
      ghRepoId: args.ghRepoId,
      name: args.ghRepoName,
      visibility: args.visibility,
      defaultBranch: args.defaultBranch,
      connectedAt: Date.now(),
    });

    return null;
  },
});

export const createInitializingSamebaseManagedVaultForUser = internalMutation({
  args: {
    userId: id("users"),
    organizationId: id("organizations"),
    ghRepoOwner: string(),
    ghRepoName: string(),
    visibility: vGitHubRepositoryVisibility,
    description: union(string(), nullValidator),
    convexProjectName: string(),
    convexTeamId: string(),
    cloudflareAccountId: string(),
    cloudflareWorkerName: string(),
    cloudflareBuildTokenUuid: union(string(), nullValidator),
  },
  returns: object({
    vaultId: id("vaults"),
    runId: id("workflow_vaultProvisioning_runs"),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    vaultId: Id<"vaults">;
    runId: Id<"workflow_vaultProvisioning_runs">;
  }> => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found");
    }
    if (readActiveUser(user) === null) {
      throw new Error("Account deletion is in progress.");
    }

    const requestedOwner = args.ghRepoOwner.trim();
    const name = args.ghRepoName.trim();
    if (!requestedOwner || !name) {
      throw new Error("Invalid repository full name");
    }
    const organization = await requireOrganizationRepositoryOwner(ctx, {
      organizationId: args.organizationId,
      userId: args.userId,
      owner: requestedOwner,
    });
    const owner = organization.githubOwnerLogin;
    const destinations = requireOrganizationProviderDestinations(organization);
    if (
      destinations.convexTeamId !== args.convexTeamId ||
      destinations.cloudflareAccountId !== args.cloudflareAccountId
    ) {
      throw new Error("Organization provider destinations changed before vault creation.");
    }
    await assertOrganizationHasNoVaultForRepository(ctx, {
      organizationId: organization._id,
      name,
    });
    await requireBillingResourceCapacity(ctx, {
      organizationId: organization._id,
      userId: args.userId,
    });

    const now = Date.now();
    const vaultId = await ctx.db.insert("vaults", {
      organizationId: organization._id,
      ...destinations,
      deletion: { state: "not_deleting" },
      state: "not_connected",
    });
    await insertDefaultVaultResourceLinksState(ctx, {
      now,
      userId: args.userId,
      vaultId,
    });
    const repositoryFullName = `${owner}/${name}`;
    const runId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
      organizationId: organization._id,
      userId: args.userId,
      vaultId,
      repositoryFullName,
      trigger: "create",
      state: "queued",
      currentStep: "run_created",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("workflow_vaultProvisioning_writeLocks", {
      vaultId,
      owner: {
        kind: "managed_run",
        runId,
      },
      state: "active",
      lastWriteAt: {},
      updatedAt: now,
    });

    // The run owns this GitHub attempt; later provider retries use their own runs.
    await ctx.db.patch(vaultId, {
      state: "provisioning",
      githubMode: "create_repository",
      runId,
      startedAt: now,
      name,
      visibility: args.visibility,
    });
    await ctx.db.insert("workflow_vaultProvisioning_events", {
      userId: args.userId,
      vaultId,
      repositoryFullName,
      runId,
      step: "initialize_vault",
      level: "info",
      message: "Created the initializing Samebase vault.",
      createdAt: now,
    });
    await ctx.db.insert("workflow_vaultProvisioning_plans", {
      vaultId,
      convexConfigPath: "convex.json",
      convex: {
        state: "planned",
        projectName: args.convexProjectName,
      },
      cloudflare: {
        state: "planned",
        workerName: args.cloudflareWorkerName,
        rootDirectory: VAULT_ROOT_DIRECTORY,
        buildTokenUuid: args.cloudflareBuildTokenUuid,
      },
      createdAt: now,
      updatedAt: now,
    });
    const workflowId = await startCreateAppProvisioningWorkflow(ctx, {
      vaultId,
      runId,
      userId: args.userId,
      repositoryName: name,
      repositoryOwner: owner,
      description: args.description,
      private: args.visibility === "private",
    });
    const queuedAt = Date.now();
    await ctx.db.patch(runId, {
      workflowId,
      currentStep: "validate_connections",
      updatedAt: queuedAt,
    });
    await ctx.db.insert("workflow_vaultProvisioning_events", {
      userId: args.userId,
      vaultId,
      repositoryFullName,
      runId,
      step: "validate_connections",
      level: "info",
      message: "Queued app provisioning.",
      createdAt: queuedAt,
    });
    return { vaultId, runId };
  },
});

export const connectSamebaseManagedVaultGitHub = internalMutation({
  args: {
    vaultId: id("vaults"),
    runId: id("workflow_vaultProvisioning_runs"),
    userId: id("users"),
    ghRepoId: string(),
    ghRepoOwner: string(),
    ghRepoName: string(),
    defaultBranch: string(),
    visibility: vGitHubRepositoryVisibility,
  },
  returns: nullValidator,
  handler: async (ctx, args) => {
    const authority = await requireActiveVaultProvisioningAuthority(ctx.db, args);
    if (authority.run.trigger !== "create") {
      throw new Error("Provisioning run does not match managed repository setup.");
    }
    const vault = authority.vault;
    if (isVaultDeletingOrDeleteFailed(vault)) {
      return null;
    }
    await requireVaultRepositoryOwner(ctx, {
      vault,
      owner: args.ghRepoOwner,
    });

    const existingVault = await ctx.db
      .query("vaults")
      .withIndex("by_ghRepoId", (q) => q.eq("ghRepoId", args.ghRepoId))
      .unique();
    if (existingVault && existingVault._id !== args.vaultId) {
      throw new Error("Vault already exists for this GitHub repository.");
    }
    if (isConnectedVault(vault)) {
      if (!isSamebaseManagedVault(vault)) {
        throw new Error("Connected vault repository identity cannot be changed.");
      }
      if (vault.ghRepoId !== args.ghRepoId || vault.runId !== args.runId) {
        throw new Error("Connected vault repository identity cannot be changed.");
      }
      return null;
    }
    if (
      vault.state !== "provisioning" ||
      vault.githubMode !== "create_repository" ||
      vault.runId !== args.runId
    ) {
      throw new Error("Vault is not waiting for GitHub provisioning.");
    }
    await requireBillingResourceCapacityForAuthority(ctx, {
      authority: {
        kind: "vault_provisioning",
        runId: args.runId,
        userId: args.userId,
        vaultId: args.vaultId,
      },
    });

    await ctx.db.replace(args.vaultId, {
      organizationId: vault.organizationId,
      convexTeamId: vault.convexTeamId,
      cloudflareAccountId: vault.cloudflareAccountId,
      deletion: vault.deletion,
      state: "connected",
      githubMode: "create_repository",
      runId: args.runId,
      ghRepoId: args.ghRepoId,
      name: args.ghRepoName,
      visibility: args.visibility,
      defaultBranch: args.defaultBranch,
      connectedAt: Date.now(),
    });

    return null;
  },
});

export const markGithubProvisioningFailed = internalMutation({
  args: {
    runId: id("workflow_vaultProvisioning_runs"),
  },
  returns: nullValidator,
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) {
      return null;
    }
    const vault = await ctx.db.get(run.vaultId);
    if (vault && isVaultDeletingOrDeleteFailed(vault)) {
      return null;
    }
    if (vault?.state !== "provisioning" || vault.runId !== args.runId) {
      return null;
    }

    const coreFields = pickProvisioningVaultCoreFields(vault);
    if (vault.githubMode === "create_repository") {
      await ctx.db.replace(vault._id, {
        ...coreFields,
        state: "failed",
        githubMode: "create_repository",
        runId: args.runId,
        name: vault.name,
        visibility: vault.visibility,
        failedAt: Date.now(),
      });
      return null;
    }

    await ctx.db.replace(vault._id, {
      ...coreFields,
      state: "failed",
      githubMode: "connect_existing_repository",
      runId: args.runId,
      ghRepoId: vault.ghRepoId,
      name: vault.name,
      failedAt: Date.now(),
    });

    return null;
  },
});

export const getById = internalQuery({
  args: {
    id: v.id("vaults"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

async function getVaultByRepositoryHelper(
  ctx: QueryCtx,
  args: {
    userId: Id<"users">;
    repositoryFullName: string;
    branch?: string;
  },
) {
  const { owner, name } = parseRepositoryFullName(args.repositoryFullName);
  const organization = await ctx.db
    .query("organizations")
    .withIndex("by_github_owner_login_normalized", (query) =>
      query.eq("githubOwnerLoginNormalized", normalizeGitHubRepositoryCoordinate(owner)),
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
  const matchingVaults = await ctx.db
    .query("vaults")
    .withIndex("by_organization_and_name", (query) =>
      query.eq("organizationId", organization._id).eq("name", name),
    )
    .collect();
  const liveVaults = matchingVaults.filter(isLiveConnectedVault);
  if (liveVaults.length > 1) {
    throw new Error("Repository maps to multiple live vaults.");
  }
  const vault = liveVaults.at(0);

  if (vault === undefined) {
    return null;
  }

  const requestedBranch =
    typeof args.branch === "string" && args.branch.trim().length > 0
      ? args.branch.trim()
      : undefined;

  const resolvedBranch = requestedBranch ?? vault.defaultBranch;

  const branchTree = await ctx.db
    .query("observations_vaultRepository_branchTrees")
    .withIndex("by_vault_and_branch", (q) =>
      q.eq("vaultId", vault._id).eq("branch", resolvedBranch),
    )
    .first();

  return {
    _id: vault._id,
    organizationId: vault.organizationId,
    _creationTime: vault._creationTime,
    ghRepoId: vault.ghRepoId,
    ghRepoOwner: organization.githubOwnerLogin,
    ghRepoName: vault.name,
    owner: organization.githubOwnerLogin,
    name: vault.name,
    repositoryFullName: `${organization.githubOwnerLogin}/${vault.name}`,
    treeSHA: branchTree?.treeData.sha,
    commitSHA: branchTree?.commitSHA,
    treeData: branchTree?.treeData,
    treeRefreshStartedAt: vault.treeRefreshStartedAt,
    lastTreeRefreshAt: branchTree?.lastTreeRefreshAt,
    lastTreeRefreshFailedAt: vault.lastTreeRefreshFailedAt,
    treeRefreshFailureKind: vault.treeRefreshFailureKind,
    treeRefreshFailureMessage: vault.treeRefreshFailureMessage,
    treeRefreshCooldownUntil: vault.treeRefreshCooldownUntil,
    branchTreeState: branchTree ? ("ready" as const) : ("unhydrated" as const),
    defaultBranch: vault.defaultBranch,
    resolvedBranch,
  };
}

export const getByRepositoryFullName = internalQuery({
  args: {
    userId: v.id("users"),
    repositoryFullName: v.string(),
    branch: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await getVaultByRepositoryHelper(ctx, {
      userId: args.userId,
      repositoryFullName: args.repositoryFullName,
      branch: args.branch,
    });
  },
});
