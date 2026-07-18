import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import { query } from "../functions";
import {
  buildVaultCloudflareBuildConfigForAppRoot,
  parseRepositoryFullName,
  vGitHubRepositoryVisibility,
} from "./model";
import { ROOT_VAULT_APP_ROOT } from "../../shared/vaultAppRoot";
import {
  assertConnectedVault,
  isConnectedVault,
  isLiveConnectedVault,
  isSamebaseManagedVault,
} from "./state";
import { isVaultDeletingOrDeleteFailed } from "./deletion/state";
import { countActiveRemoteBranches, resolveVaultBranchSelection } from "./branches";
import { getLastRepositoryMetadataRefreshAt } from "../../shared/treeRefresh";

const nullValidator = v.null();
const { boolean, id, object, optional, string } = v;

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
    const vault = await ctx.db.get(args.vaultId);
    if (!vault || vault.userId !== args.userId) {
      return null;
    }
    return vault;
  },
});

function normalizeGitHubRepositoryCoordinate(value: string): string {
  return value.trim().toLowerCase();
}

async function assertUserHasNoVaultForRepository(
  ctx: Pick<MutationCtx, "db">,
  args: {
    userId: Id<"users">;
    owner: string;
    name: string;
  },
): Promise<void> {
  const normalizedOwner = normalizeGitHubRepositoryCoordinate(args.owner);
  const normalizedName = normalizeGitHubRepositoryCoordinate(args.name);
  for await (const vault of ctx.db
    .query("vaults")
    .withIndex("by_userId", (q) => q.eq("userId", args.userId))) {
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

function pickProvisioningVaultOperationalFields(vault: ProvisioningVault) {
  return {
    userId: vault.userId,
    deletion: vault.deletion,
    lastTreeRefreshAt: vault.lastTreeRefreshAt,
    treeRefreshStartedAt: vault.treeRefreshStartedAt,
    lastTreeRefreshFailedAt: vault.lastTreeRefreshFailedAt,
    treeRefreshFailureKind: vault.treeRefreshFailureKind,
    treeRefreshFailureMessage: vault.treeRefreshFailureMessage,
    treeRefreshCooldownUntil: vault.treeRefreshCooldownUntil,
    activeCodespaceId: vault.activeCodespaceId,
    devcontainerConfig: vault.devcontainerConfig,
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
  await ctx.db.insert("ui_vaultResourceLinksState", {
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
    runId: id("operations_vaultProvisioningRuns"),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    vaultId: Id<"vaults">;
    runId: Id<"operations_vaultProvisioningRuns">;
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
    await assertUserHasNoVaultForRepository(ctx, {
      userId: args.userId,
      owner,
      name,
    });

    const now = Date.now();
    const vaultId = await ctx.db.insert("vaults", {
      userId: args.userId,
      deletion: { state: "not_deleting" },
      state: "not_connected",
    });
    await insertDefaultVaultResourceLinksState(ctx, {
      now,
      userId: args.userId,
      vaultId,
    });
    const repositoryFullName = `${owner}/${name}`;
    const runId = await ctx.db.insert("operations_vaultProvisioningRuns", {
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
      owner,
      name,
    });
    await ctx.db.insert("operations_vaultProvisioningEvents", {
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
    runId: id("operations_vaultProvisioningRuns"),
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
    if (!vault || vault.userId !== args.userId) {
      throw new Error("Vault not found");
    }
    if (isVaultDeletingOrDeleteFailed(vault)) {
      return null;
    }

    // GitHub repository id stays stable across owner/name renames.
    const existingVault = await ctx.db
      .query("vaults")
      .withIndex("by_userId_and_ghRepoId", (q) =>
        q.eq("userId", args.userId).eq("ghRepoId", args.ghRepoId),
      )
      .first();
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
      userId: vault.userId,
      deletion: vault.deletion,
      lastTreeRefreshAt: vault.lastTreeRefreshAt,
      treeRefreshStartedAt: vault.treeRefreshStartedAt,
      lastTreeRefreshFailedAt: vault.lastTreeRefreshFailedAt,
      treeRefreshFailureKind: vault.treeRefreshFailureKind,
      treeRefreshFailureMessage: vault.treeRefreshFailureMessage,
      treeRefreshCooldownUntil: vault.treeRefreshCooldownUntil,
      activeCodespaceId: vault.activeCodespaceId,
      devcontainerConfig: vault.devcontainerConfig,
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
    convexProjectName: string(),
    cloudflareAccountId: string(),
    cloudflareWorkerName: string(),
  },
  returns: object({
    vaultId: id("vaults"),
    runId: id("operations_vaultProvisioningRuns"),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    vaultId: Id<"vaults">;
    runId: Id<"operations_vaultProvisioningRuns">;
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
    await assertUserHasNoVaultForRepository(ctx, {
      userId: args.userId,
      owner,
      name,
    });

    const now = Date.now();
    const vaultId = await ctx.db.insert("vaults", {
      userId: args.userId,
      deletion: { state: "not_deleting" },
      state: "not_connected",
    });
    await insertDefaultVaultResourceLinksState(ctx, {
      now,
      userId: args.userId,
      vaultId,
    });
    const repositoryFullName = `${owner}/${name}`;
    const runId = await ctx.db.insert("operations_vaultProvisioningRuns", {
      userId: args.userId,
      vaultId,
      repositoryFullName,
      trigger: "create",
      state: "queued",
      currentStep: "run_created",
      createdAt: now,
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
    await ctx.db.insert("operations_vaultProvisioningEvents", {
      userId: args.userId,
      vaultId,
      repositoryFullName,
      runId,
      step: "initialize_vault",
      level: "info",
      message: "Created the initializing Samebase vault.",
      createdAt: now,
    });
    await ctx.db.insert("operations_vaultInfrastructureTargets", {
      vaultId,
      appRoot: ROOT_VAULT_APP_ROOT,
      convex: {
        state: "planned",
        projectName: args.convexProjectName,
      },
      cloudflare: {
        state: "planned",
        accountId: args.cloudflareAccountId,
        workerName: args.cloudflareWorkerName,
        build: buildVaultCloudflareBuildConfigForAppRoot({
          appRoot: ROOT_VAULT_APP_ROOT,
        }),
      },
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("vaultApps", {
      vaultId,
      userId: args.userId,
      appRoot: ROOT_VAULT_APP_ROOT,
      createdAt: now,
    });

    return { vaultId, runId };
  },
});

export const connectSamebaseManagedVaultGitHub = internalMutation({
  args: {
    vaultId: id("vaults"),
    runId: id("operations_vaultProvisioningRuns"),
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
    if (!vault || vault.userId !== args.userId) {
      throw new Error("Vault not found");
    }
    if (isVaultDeletingOrDeleteFailed(vault)) {
      return null;
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
      userId: vault.userId,
      deletion: vault.deletion,
      lastTreeRefreshAt: vault.lastTreeRefreshAt,
      treeRefreshStartedAt: vault.treeRefreshStartedAt,
      lastTreeRefreshFailedAt: vault.lastTreeRefreshFailedAt,
      treeRefreshFailureKind: vault.treeRefreshFailureKind,
      treeRefreshFailureMessage: vault.treeRefreshFailureMessage,
      treeRefreshCooldownUntil: vault.treeRefreshCooldownUntil,
      activeCodespaceId: vault.activeCodespaceId,
      devcontainerConfig: vault.devcontainerConfig,
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
    runId: id("operations_vaultProvisioningRuns"),
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

    const operationalFields = pickProvisioningVaultOperationalFields(vault);
    if (vault.githubMode === "create_repository") {
      await ctx.db.replace(vault._id, {
        ...operationalFields,
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
      ...operationalFields,
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

export const markVaultAsReady = internalMutation({
  args: {
    vaultId: v.id("vaults"),
  },
  handler: async (ctx, args) => {
    assertConnectedVault(await ctx.db.get(args.vaultId));
    return null;
  },
});

export const updateVaultDevcontainerConfig = internalMutation({
  args: {
    vaultId: v.id("vaults"),
    devcontainerConfig: v.string(),
  },
  returns: nullValidator,
  handler: async (ctx, args) => {
    if (!isLiveConnectedVault(await ctx.db.get(args.vaultId))) {
      return null;
    }
    await ctx.db.patch(args.vaultId, {
      devcontainerConfig: args.devcontainerConfig,
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

  const vault = await ctx.db
    .query("vaults")
    .withIndex("by_userId_and_owner_and_name", (q) =>
      q.eq("userId", args.userId).eq("owner", owner).eq("name", name),
    )
    .first();

  if (!isLiveConnectedVault(vault)) {
    return null;
  }

  const requestedBranch =
    typeof args.branch === "string" && args.branch.trim().length > 0
      ? args.branch.trim()
      : undefined;

  const remoteBranches = await ctx.db
    .query("observations_vaultRemoteBranches")
    .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
    .collect();
  const { defaultBranch, resolvedBranch, branchNotFound } = resolveVaultBranchSelection({
    requestedBranch,
    defaultBranch: vault.defaultBranch,
    remoteBranches,
  });

  const branchTree = await ctx.db
    .query("observations_vaultBranchTrees")
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
    treeSHA: branchTree?.treeSHA,
    commitSHA: branchTree?.commitSHA,
    treeData: branchTree?.treeData,
    treeRefreshStartedAt: branchTree?.treeRefreshStartedAt ?? vault.treeRefreshStartedAt,
    lastTreeRefreshAt: branchTree?.lastTreeRefreshAt ?? vault.lastTreeRefreshAt,
    lastTreeRefreshFailedAt: vault.lastTreeRefreshFailedAt,
    treeRefreshFailureKind: vault.treeRefreshFailureKind,
    treeRefreshFailureMessage: vault.treeRefreshFailureMessage,
    treeRefreshCooldownUntil: vault.treeRefreshCooldownUntil,
    lastRepositoryMetadataRefreshAt: getLastRepositoryMetadataRefreshAt(remoteBranches),
    // Budget automatic refreshes from live remote branches only; retained
    // deleted-upstream rows are local recovery state, not GitHub fan-out.
    remoteBranchCount: countActiveRemoteBranches(remoteBranches),
    hasResolvedBranchTree: Boolean(branchTree),
    defaultBranch,
    resolvedBranch,
    branchNotFound,
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
