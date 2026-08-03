import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import {
  type DatabaseReader,
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import { query } from "../functions";
import { startCreateAppProvisioningWorkflow } from "../appProvisioningWorkflow";
import { requireSingleOrganizationIdForUser } from "../organizations";
import {
  hasPhaseOneUserOwnership,
  readPhaseOneOwnershipContext,
  type PhaseOneOwnershipContext,
} from "../phaseOneOwnership";
import {
  parseRepositoryFullName,
  vGitHubRepositoryVisibility,
  vVaultConnectedRepositoryTarget,
} from "./model";
import { VAULT_ROOT_DIRECTORY } from "../../shared/vaultRootDirectory";
import { isConnectedVault, isLiveConnectedVault, isSamebaseManagedVault } from "./state";
import { isVaultDeletingOrDeleteFailed } from "./deletion/state";

const nullValidator = v.null();
const { array, boolean, id, object, optional, string, union } = v;

type ProvisioningVault = Extract<Doc<"vaults">, { state: "provisioning" }>;

export async function listPhaseOneUserVaults(
  db: DatabaseReader,
  ownership: PhaseOneOwnershipContext,
): Promise<Array<Doc<"vaults">>> {
  const candidates = new Map<Id<"vaults">, Doc<"vaults">>();
  if (ownership.organizationId) {
    for await (const vault of db
      .query("vaults")
      .withIndex("by_organization", (query) =>
        query.eq("organizationId", ownership.organizationId),
      )) {
      candidates.set(vault._id, vault);
    }
    for await (const vault of db
      .query("vaults")
      .withIndex("by_user_and_organization", (query) =>
        query.eq("userId", ownership.userId).eq("organizationId", undefined),
      )) {
      candidates.set(vault._id, vault);
    }
  } else {
    for await (const vault of db
      .query("vaults")
      .withIndex("by_userId", (query) => query.eq("userId", ownership.userId))) {
      candidates.set(vault._id, vault);
    }
  }

  return [...candidates.values()].filter((vault) => hasPhaseOneUserOwnership(ownership, vault));
}

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
    const vault = await ctx.db.get(args.vaultId);
    if (!vault) {
      return null;
    }
    const ownership = await readPhaseOneOwnershipContext(ctx.db, args.userId);
    if (!hasPhaseOneUserOwnership(ownership, vault)) {
      return null;
    }
    return vault;
  },
});

export const listConnectedRepositoriesForUser = internalQuery({
  args: {
    userId: id("users"),
  },
  returns: array(vVaultConnectedRepositoryTarget),
  handler: async (ctx, args) => {
    const ownership = await readPhaseOneOwnershipContext(ctx.db, args.userId);
    const repositories = [];
    for (const vault of await listPhaseOneUserVaults(ctx.db, ownership)) {
      if (!isLiveConnectedVault(vault)) {
        continue;
      }
      repositories.push({
        vaultId: vault._id,
        ghRepoId: vault.ghRepoId,
        owner: vault.owner,
        name: vault.name,
        defaultBranch: vault.defaultBranch,
      });
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

async function listPhaseOneOrganizationMemberUserIds(
  ctx: Pick<MutationCtx, "db">,
  organizationId: Id<"organizations">,
): Promise<Array<Id<"users">>> {
  const memberships = await ctx.db
    .query("organizationMemberships")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .take(3);
  if (memberships.length > 2) {
    throw new Error("Phase 1 repository uniqueness supports at most two organization members.");
  }
  return memberships.map((membership) => membership.userId);
}

async function assertOrganizationHasNoVaultForRepository(
  ctx: Pick<MutationCtx, "db">,
  args: {
    organizationId: Id<"organizations">;
    owner: string;
    name: string;
  },
): Promise<void> {
  const normalizedOwner = normalizeGitHubRepositoryCoordinate(args.owner);
  const normalizedName = normalizeGitHubRepositoryCoordinate(args.name);
  for await (const vault of ctx.db
    .query("vaults")
    .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))) {
    if (vault.state === "not_connected") {
      continue;
    }
    if (
      normalizeGitHubRepositoryCoordinate(vault.owner) === normalizedOwner &&
      normalizeGitHubRepositoryCoordinate(vault.name) === normalizedName
    ) {
      throw new Error("Vault already exists for this repository.");
    }
  }

  const memberUserIds = await listPhaseOneOrganizationMemberUserIds(ctx, args.organizationId);
  for (const userId of memberUserIds) {
    for await (const vault of ctx.db
      .query("vaults")
      .withIndex("by_user_and_organization", (q) =>
        q.eq("userId", userId).eq("organizationId", undefined),
      )) {
      if (vault.state === "not_connected") {
        continue;
      }
      if (
        normalizeGitHubRepositoryCoordinate(vault.owner) === normalizedOwner &&
        normalizeGitHubRepositoryCoordinate(vault.name) === normalizedName
      ) {
        throw new Error("Vault already exists for this repository.");
      }
    }
  }
}

async function assertOrganizationHasNoOtherVaultForGitHubRepository(
  ctx: Pick<MutationCtx, "db">,
  args: {
    organizationId: Id<"organizations">;
    ghRepoId: string;
    excludeVaultId: Id<"vaults">;
  },
): Promise<void> {
  for await (const vault of ctx.db
    .query("vaults")
    .withIndex("by_organization_and_ghRepoId", (q) =>
      q.eq("organizationId", args.organizationId).eq("ghRepoId", args.ghRepoId),
    )) {
    if (vault._id !== args.excludeVaultId) {
      throw new Error("Vault already exists for this GitHub repository.");
    }
  }

  const memberUserIds = await listPhaseOneOrganizationMemberUserIds(ctx, args.organizationId);
  for (const userId of memberUserIds) {
    for await (const vault of ctx.db
      .query("vaults")
      .withIndex("by_user_and_organization", (q) =>
        q.eq("userId", userId).eq("organizationId", undefined),
      )) {
      if (
        isConnectedVault(vault) &&
        vault.ghRepoId === args.ghRepoId &&
        vault._id !== args.excludeVaultId
      ) {
        throw new Error("Vault already exists for this GitHub repository.");
      }
    }
  }
}

function pickProvisioningVaultCoreFields(vault: ProvisioningVault) {
  return {
    userId: vault.userId,
    ...(vault.organizationId ? { organizationId: vault.organizationId } : {}),
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
    const owner = args.ghRepoOwner.trim();
    const name = args.ghRepoName.trim();
    if (!owner || !name) {
      throw new Error("Invalid repository full name");
    }
    const organizationId = await requireSingleOrganizationIdForUser(ctx.db, args.userId);
    await assertOrganizationHasNoVaultForRepository(ctx, {
      organizationId,
      owner,
      name,
    });

    const now = Date.now();
    const vaultId = await ctx.db.insert("vaults", {
      userId: args.userId,
      organizationId,
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
      requestedByUserId: args.userId,
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
      owner,
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
    const vault = await ctx.db.get(args.vaultId);
    if (!vault) {
      throw new Error("Vault not found");
    }
    const ownership = await readPhaseOneOwnershipContext(ctx.db, args.userId);
    if (!hasPhaseOneUserOwnership(ownership, vault)) {
      throw new Error("Vault not found");
    }
    if (isVaultDeletingOrDeleteFailed(vault)) {
      return null;
    }
    const organizationId = vault.organizationId;
    if (!organizationId) {
      throw new Error("Vault organization is required.");
    }

    // GitHub repository id stays stable across owner/name renames.
    await assertOrganizationHasNoOtherVaultForGitHubRepository(ctx, {
      organizationId,
      ghRepoId: args.ghRepoId,
      excludeVaultId: args.vaultId,
    });
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
      userId: vault.userId,
      organizationId,
      deletion: vault.deletion,
      state: "connected",
      githubMode: "connect_existing_repository",
      runId: args.runId,
      ghRepoId: args.ghRepoId,
      owner: args.ghRepoOwner,
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
    ghRepoOwner: string(),
    ghRepoName: string(),
    visibility: vGitHubRepositoryVisibility,
    description: union(string(), nullValidator),
    convexProjectName: string(),
    convexTeamId: string(),
    cloudflareAccountId: string(),
    cloudflareWorkerName: string(),
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

    const owner = args.ghRepoOwner.trim();
    const name = args.ghRepoName.trim();
    if (!owner || !name) {
      throw new Error("Invalid repository full name");
    }
    const organizationId = await requireSingleOrganizationIdForUser(ctx.db, args.userId);
    await assertOrganizationHasNoVaultForRepository(ctx, {
      organizationId,
      owner,
      name,
    });

    const now = Date.now();
    const vaultId = await ctx.db.insert("vaults", {
      userId: args.userId,
      organizationId,
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
      requestedByUserId: args.userId,
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
      owner,
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
      userId: args.userId,
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
    const vault = await ctx.db.get(args.vaultId);
    if (!vault) {
      throw new Error("Vault not found");
    }
    const ownership = await readPhaseOneOwnershipContext(ctx.db, args.userId);
    if (!hasPhaseOneUserOwnership(ownership, vault)) {
      throw new Error("Vault not found");
    }
    if (isVaultDeletingOrDeleteFailed(vault)) {
      return null;
    }
    const organizationId = vault.organizationId;
    if (!organizationId) {
      throw new Error("Vault organization is required.");
    }
    await assertOrganizationHasNoOtherVaultForGitHubRepository(ctx, {
      organizationId,
      ghRepoId: args.ghRepoId,
      excludeVaultId: args.vaultId,
    });
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
      userId: vault.userId,
      organizationId,
      deletion: vault.deletion,
      state: "connected",
      githubMode: "create_repository",
      runId: args.runId,
      ghRepoId: args.ghRepoId,
      owner: args.ghRepoOwner,
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
        owner: vault.owner,
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
      owner: vault.owner,
      name: vault.name,
      failedAt: Date.now(),
    });

    return null;
  },
});

export const hasOtherVaultsForRepository = internalQuery({
  args: {
    owner: string(),
    repo: string(),
    excludeVaultId: id("vaults"),
  },
  returns: boolean(),
  handler: async (ctx, args) => {
    for await (const vault of ctx.db
      .query("vaults")
      .withIndex("by_owner_and_name", (q) => q.eq("owner", args.owner).eq("name", args.repo))) {
      if (isConnectedVault(vault) && vault._id !== args.excludeVaultId) {
        return true;
      }
    }
    return false;
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
  const ownership = await readPhaseOneOwnershipContext(ctx.db, args.userId);
  const candidates = new Map<Id<"vaults">, Doc<"vaults">>();
  if (ownership.organizationId) {
    for await (const vault of ctx.db
      .query("vaults")
      .withIndex("by_organization_and_owner_and_name", (query) =>
        query.eq("organizationId", ownership.organizationId).eq("owner", owner).eq("name", name),
      )) {
      candidates.set(vault._id, vault);
    }
    for await (const vault of ctx.db
      .query("vaults")
      .withIndex("by_user_and_organization", (query) =>
        query.eq("userId", args.userId).eq("organizationId", undefined),
      )) {
      if (isConnectedVault(vault) && vault.owner === owner && vault.name === name) {
        candidates.set(vault._id, vault);
      }
    }
  } else {
    for await (const vault of ctx.db
      .query("vaults")
      .withIndex("by_userId_and_owner_and_name", (query) =>
        query.eq("userId", args.userId).eq("owner", owner).eq("name", name),
      )) {
      candidates.set(vault._id, vault);
    }
  }

  const vault = [...candidates.values()]
    .filter((candidate) => hasPhaseOneUserOwnership(ownership, candidate))
    .sort((left, right) => left._id.localeCompare(right._id))
    .find(isLiveConnectedVault);

  if (!isLiveConnectedVault(vault)) {
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
    _creationTime: vault._creationTime,
    ghRepoId: vault.ghRepoId,
    ghRepoOwner: vault.owner,
    ghRepoName: vault.name,
    owner: vault.owner,
    name: vault.name,
    repositoryFullName: `${vault.owner}/${vault.name}`,
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
