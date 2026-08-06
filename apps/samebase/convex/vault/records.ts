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
  requireOrganizationAccessContext,
  requireVaultForUser,
} from "../organizationAccess";
import { getProviderConnectionByIdForOrganization } from "../providerConnections";
import {
  parseRepositoryFullName,
  vGitHubRepositoryVisibility,
  vVaultConnectedRepositoryTarget,
} from "./model";
import { VAULT_ROOT_DIRECTORY } from "../../shared/vaultRootDirectory";
import { isConnectedVault, isLiveConnectedVault, isSamebaseManagedVault } from "./state";
import { isVaultDeletingOrDeleteFailed } from "./deletion/state";

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

export const listConnectedRepositoriesForUser = internalQuery({
  args: {
    userId: id("users"),
  },
  returns: array(vVaultConnectedRepositoryTarget),
  handler: async (ctx, args) => {
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
    deletion: vault.deletion,
  };
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
    if (user.accountDeletion) {
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
    await assertOrganizationHasNoVaultForRepository(ctx, {
      organizationId: organization._id,
      name,
    });

    const now = Date.now();
    const vaultId = await ctx.db.insert("vaults", {
      organizationId: organization._id,
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
    const vault = await requireVaultForUser(ctx.db, args);
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

    await ctx.db.replace(args.vaultId, {
      organizationId: vault.organizationId,
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
    convexProviderConnectionId: id("providerConnections"),
    cloudflareAccountId: string(),
    cloudflareWorkerName: string(),
    cloudflareProviderConnectionId: id("providerConnections"),
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
    if (user.accountDeletion) {
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
    const [convexProviderConnection, cloudflareProviderConnection] = await Promise.all([
      getProviderConnectionByIdForOrganization(ctx.db, {
        organizationId: organization._id,
        providerConnectionId: args.convexProviderConnectionId,
        kind: "convex",
      }),
      getProviderConnectionByIdForOrganization(ctx.db, {
        organizationId: organization._id,
        providerConnectionId: args.cloudflareProviderConnectionId,
        kind: "cloudflare",
      }),
    ]);
    if (convexProviderConnection?.kind !== "convex") {
      throw new Error("Convex provider connection not found.");
    }
    if (convexProviderConnection.teamId !== args.convexTeamId) {
      throw new Error("Convex team does not match the provider connection.");
    }
    if (cloudflareProviderConnection?.kind !== "cloudflare") {
      throw new Error("Cloudflare provider connection not found.");
    }
    if (
      cloudflareProviderConnection.defaultAccount.state !== "selected" ||
      cloudflareProviderConnection.defaultAccount.accountId !== args.cloudflareAccountId
    ) {
      throw new Error("Cloudflare account does not match the provider connection.");
    }
    await assertOrganizationHasNoVaultForRepository(ctx, {
      organizationId: organization._id,
      name,
    });

    const now = Date.now();
    const vaultId = await ctx.db.insert("vaults", {
      organizationId: organization._id,
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
        teamId: args.convexTeamId,
      },
      cloudflare: {
        state: "planned",
        accountId: args.cloudflareAccountId,
        workerName: args.cloudflareWorkerName,
        rootDirectory: VAULT_ROOT_DIRECTORY,
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
    const vault = await requireVaultForUser(ctx.db, args);
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

    await ctx.db.replace(args.vaultId, {
      organizationId: vault.organizationId,
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
