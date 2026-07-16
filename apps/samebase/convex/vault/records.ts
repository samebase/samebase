import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import { query } from "../functions";
import { readActiveRepositoryInventoryBranchSelection } from "../repositoryInventory";
import {
  bumpRepositorySummaryDirectoryRevision,
  createRepositorySummaryForConnectedVault,
} from "../repositorySummary";
import {
  buildVaultCloudflareBuildConfigForAppRoot,
  normalizeRepositoryRouteKey,
  VAULT_DEVCONTAINER_CONFIG_MAX_LENGTH,
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

const nullValidator = v.null();
const { id, object, optional, string } = v;

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

async function assertUserHasNoVaultForRepository(
  ctx: Pick<MutationCtx, "db">,
  args: {
    userId: Id<"users">;
    routeRepositoryKey: string;
    excludeVaultId: Id<"vaults"> | null;
  },
): Promise<void> {
  const vault = await ctx.db
    .query("vaults")
    .withIndex("by_userId_and_routeRepositoryKey", (q) =>
      q.eq("userId", args.userId).eq("routeRepositoryKey", args.routeRepositoryKey),
    )
    .unique();
  if (vault !== null && vault._id !== args.excludeVaultId) {
    throw new Error("Vault already exists for this repository.");
  }
}

async function assertUserHasNoVaultForGitHubRepositoryId(
  ctx: Pick<MutationCtx, "db">,
  args: {
    userId: Id<"users">;
    ghRepoId: string;
    excludeVaultId: Id<"vaults">;
  },
): Promise<void> {
  // GitHub repository ids stay stable across owner/name renames.
  const vault = await ctx.db
    .query("vaults")
    .withIndex("by_userId_and_ghRepoId", (q) =>
      q.eq("userId", args.userId).eq("ghRepoId", args.ghRepoId),
    )
    .unique();
  if (vault !== null && vault._id !== args.excludeVaultId) {
    throw new Error("Vault already exists for this GitHub repository.");
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
  await ctx.db.insert("vaultResourceLinksState", {
    userId: args.userId,
    vaultId: args.vaultId,
    resourceLinksOpen: true,
    updatedAt: args.now,
  });
}

export const createInitializingExistingRepositoryVaultForUser = internalMutation({
  args: {
    userId: id("users"),
    ghRepoId: string(),
    ghRepoOwner: string(),
    ghRepoName: string(),
  },
  returns: object({
    vaultId: id("vaults"),
    runId: id("appProvisioningRuns"),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    vaultId: Id<"vaults">;
    runId: Id<"appProvisioningRuns">;
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
    const routeRepositoryKey = normalizeRepositoryRouteKey(`${owner}/${name}`);
    const ghRepoId = args.ghRepoId.trim();
    if (!ghRepoId) {
      throw new Error("GitHub repository id is required.");
    }
    const existingGitHubRepository = await ctx.db
      .query("vaults")
      .withIndex("by_userId_and_ghRepoId", (q) =>
        q.eq("userId", args.userId).eq("ghRepoId", ghRepoId),
      )
      .unique();
    if (existingGitHubRepository !== null) {
      throw new Error("Vault already exists for this GitHub repository.");
    }
    await assertUserHasNoVaultForRepository(ctx, {
      userId: args.userId,
      routeRepositoryKey,
      excludeVaultId: null,
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
    const runId = await ctx.db.insert("appProvisioningRuns", {
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
      routeRepositoryKey,
      routeOwner: owner,
      routeName: name,
    });
    await ctx.db.insert("appProvisioningEvents", {
      userId: args.userId,
      vaultId,
      repositoryFullName,
      runId,
      step: "initialize_vault",
      level: "info",
      message: "Queued existing repository connection.",
      createdAt: now,
    });
    await bumpRepositorySummaryDirectoryRevision(ctx, args.userId);

    return { vaultId, runId };
  },
});

export const connectExistingRepositoryVaultGitHub = internalMutation({
  args: {
    vaultId: id("vaults"),
    runId: id("appProvisioningRuns"),
    userId: id("users"),
    ghRepoId: v.string(),
    ghRepoNodeId: v.string(),
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

    await assertUserHasNoVaultForGitHubRepositoryId(ctx, {
      userId: args.userId,
      ghRepoId: args.ghRepoId,
      excludeVaultId: args.vaultId,
    });
    if (isConnectedVault(vault)) {
      if (
        vault.githubMode !== "connect_existing_repository" ||
        vault.ghRepoId !== args.ghRepoId ||
        vault.ghRepoNodeId !== args.ghRepoNodeId ||
        vault.runId !== args.runId
      ) {
        throw new Error("Connected vault repository identity cannot be changed.");
      }
      return null;
    }
    if (
      vault.state !== "provisioning" ||
      vault.githubMode !== "connect_existing_repository" ||
      vault.runId !== args.runId ||
      vault.ghRepoId !== args.ghRepoId
    ) {
      throw new Error("Vault is not waiting for existing repository setup.");
    }
    await assertUserHasNoVaultForRepository(ctx, {
      userId: args.userId,
      routeRepositoryKey: vault.routeRepositoryKey,
      excludeVaultId: args.vaultId,
    });

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
      ghRepoNodeId: args.ghRepoNodeId,
      githubOwner: args.ghRepoOwner,
      githubName: args.ghRepoName,
      routeRepositoryKey: vault.routeRepositoryKey,
      routeOwner: vault.routeOwner,
      routeName: vault.routeName,
      visibility: args.visibility,
      defaultBranch: args.defaultBranch,
      connectedAt: Date.now(),
    });
    await createRepositorySummaryForConnectedVault(ctx, {
      vaultId: args.vaultId,
      userId: args.userId,
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
    runId: id("appProvisioningRuns"),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    vaultId: Id<"vaults">;
    runId: Id<"appProvisioningRuns">;
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
    const routeRepositoryKey = normalizeRepositoryRouteKey(`${owner}/${name}`);
    await assertUserHasNoVaultForRepository(ctx, {
      userId: args.userId,
      routeRepositoryKey,
      excludeVaultId: null,
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
    const runId = await ctx.db.insert("appProvisioningRuns", {
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
      routeRepositoryKey,
      routeOwner: owner,
      routeName: name,
      visibility: args.visibility,
    });
    await ctx.db.insert("appProvisioningEvents", {
      userId: args.userId,
      vaultId,
      repositoryFullName,
      runId,
      step: "initialize_vault",
      level: "info",
      message: "Created the initializing Samebase vault.",
      createdAt: now,
    });
    await ctx.db.insert("vaultInfrastructureTargets", {
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
    await bumpRepositorySummaryDirectoryRevision(ctx, args.userId);

    return { vaultId, runId };
  },
});

export const connectSamebaseManagedVaultGitHub = internalMutation({
  args: {
    vaultId: id("vaults"),
    runId: id("appProvisioningRuns"),
    userId: id("users"),
    ghRepoId: string(),
    ghRepoNodeId: string(),
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
    await assertUserHasNoVaultForGitHubRepositoryId(ctx, {
      userId: args.userId,
      ghRepoId: args.ghRepoId,
      excludeVaultId: args.vaultId,
    });
    if (isConnectedVault(vault)) {
      if (!isSamebaseManagedVault(vault)) {
        throw new Error("Connected vault repository identity cannot be changed.");
      }
      if (
        vault.ghRepoId !== args.ghRepoId ||
        vault.ghRepoNodeId !== args.ghRepoNodeId ||
        vault.runId !== args.runId
      ) {
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
    await assertUserHasNoVaultForRepository(ctx, {
      userId: args.userId,
      routeRepositoryKey: vault.routeRepositoryKey,
      excludeVaultId: args.vaultId,
    });

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
      ghRepoNodeId: args.ghRepoNodeId,
      githubOwner: args.ghRepoOwner,
      githubName: args.ghRepoName,
      routeRepositoryKey: vault.routeRepositoryKey,
      routeOwner: vault.routeOwner,
      routeName: vault.routeName,
      visibility: args.visibility,
      defaultBranch: args.defaultBranch,
      connectedAt: Date.now(),
    });
    await createRepositorySummaryForConnectedVault(ctx, {
      vaultId: args.vaultId,
      userId: args.userId,
    });

    return null;
  },
});

export const markGithubProvisioningFailed = internalMutation({
  args: {
    runId: id("appProvisioningRuns"),
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
        routeRepositoryKey: vault.routeRepositoryKey,
        routeOwner: vault.routeOwner,
        routeName: vault.routeName,
        visibility: vault.visibility,
        failedAt: Date.now(),
      });
      await bumpRepositorySummaryDirectoryRevision(ctx, vault.userId);
      return null;
    }

    await ctx.db.replace(vault._id, {
      ...operationalFields,
      state: "failed",
      githubMode: "connect_existing_repository",
      runId: args.runId,
      ghRepoId: vault.ghRepoId,
      routeRepositoryKey: vault.routeRepositoryKey,
      routeOwner: vault.routeOwner,
      routeName: vault.routeName,
      failedAt: Date.now(),
    });
    await bumpRepositorySummaryDirectoryRevision(ctx, vault.userId);

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
    if (args.devcontainerConfig.length > VAULT_DEVCONTAINER_CONFIG_MAX_LENGTH) {
      throw new Error(
        `Devcontainer configuration may contain at most ${VAULT_DEVCONTAINER_CONFIG_MAX_LENGTH} characters.`,
      );
    }
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

async function getVaultByRepositoryHelper(
  ctx: QueryCtx,
  args: {
    userId: Id<"users">;
    repositoryFullName: string;
    branch?: string;
  },
) {
  const routeRepositoryKey = normalizeRepositoryRouteKey(args.repositoryFullName);

  const vault = await ctx.db
    .query("vaults")
    .withIndex("by_userId_and_routeRepositoryKey", (q) =>
      q.eq("userId", args.userId).eq("routeRepositoryKey", routeRepositoryKey),
    )
    .unique();

  if (!isLiveConnectedVault(vault)) {
    return null;
  }

  const requestedBranch =
    typeof args.branch === "string" && args.branch.trim().length > 0
      ? args.branch.trim()
      : undefined;

  const inventorySelection = await readActiveRepositoryInventoryBranchSelection(ctx, {
    vaultId: vault._id,
    branch: requestedBranch ?? vault.defaultBranch,
  });
  const defaultBranch = inventorySelection?.defaultBranch ?? vault.defaultBranch;
  const branchNotFound = Boolean(
    requestedBranch &&
    inventorySelection &&
    !inventorySelection.branch &&
    requestedBranch !== defaultBranch,
  );
  const resolvedBranch = branchNotFound ? defaultBranch : (requestedBranch ?? defaultBranch);

  const branchTree = await ctx.db
    .query("vaultBranchTrees")
    .withIndex("by_vault_and_branch", (q) =>
      q.eq("vaultId", vault._id).eq("branch", resolvedBranch),
    )
    .first();

  return {
    _id: vault._id,
    _creationTime: vault._creationTime,
    ghRepoId: vault.ghRepoId,
    ghRepoNodeId: vault.ghRepoNodeId,
    routeOwner: vault.routeOwner,
    routeName: vault.routeName,
    routeRepositoryFullName: `${vault.routeOwner}/${vault.routeName}`,
    githubOwner: vault.githubOwner,
    githubName: vault.githubName,
    githubRepositoryFullName: `${vault.githubOwner}/${vault.githubName}`,
    treeSHA: branchTree?.treeSHA,
    commitSHA: branchTree?.commitSHA,
    treeData: branchTree?.treeData,
    treeRefreshStartedAt: branchTree?.treeRefreshStartedAt ?? vault.treeRefreshStartedAt,
    lastTreeRefreshAt: branchTree?.lastTreeRefreshAt ?? vault.lastTreeRefreshAt,
    lastTreeRefreshFailedAt: vault.lastTreeRefreshFailedAt,
    treeRefreshFailureKind: vault.treeRefreshFailureKind,
    treeRefreshFailureMessage: vault.treeRefreshFailureMessage,
    treeRefreshCooldownUntil: vault.treeRefreshCooldownUntil,
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
