import { v, type Infer } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  QueryCtx,
  type MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { DaytonaSnapshotBuildStatus, GithubTreeData } from "./schema";
import {
  hasStagedFileChanges,
  type StagedFileChangeCandidate,
} from "./stagingChanges";
import { Id } from "./_generated/dataModel";
import { getUserId } from "./common";
import { enqueueSnapshotBuild } from "./daytona/snapshotRecords";
import { DAYTONA_COMMIT_PINNED_BRANCH } from "./daytona/snapshotPolicy";
import {
  DAYTONA_PROVISIONING_MODE_LIVE_DEBUG,
  DAYTONA_PROVISIONING_MODE_SNAPSHOT_BACKED,
} from "./daytona/provisioning";
import {
  hostingProviderValidator,
  hostingStateValidator,
} from "./hostingState";
import {
  resolveHostingMainUrl,
  resolveNetlifySiteId,
} from "./hostingStateHelpers";
import {
  TREE_REFRESH_DEBOUNCE_MS,
  TREE_REFRESH_STALE_LOCK_MS,
} from "../shared/treeRefresh";

const nullValidator = v.null();
const { array, boolean, id, literal, number, object, optional, string, union } =
  v;

// MARK: Public

export const removeVault = mutation({
  args: {
    vaultId: v.id("vaults"),
  },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const vault = await ctx.db.get(args.vaultId);
    if (!vault) {
      console.error("vault not found", args.vaultId);
      return;
    }
    if (vault.userId !== userId) {
      console.error("vault ownership mismatch", args.vaultId);
      return;
    }

    // 1. Delete all blobs
    const blobs = await ctx.db
      .query("blobs")
      .filter((q) => q.eq(q.field("vaultId"), args.vaultId))
      .collect();

    for (const blob of blobs) {
      if (blob.storageId) {
        await ctx.storage.delete(blob.storageId).catch((e) => {
          console.error("storage delete", e);
        });
      }
      await ctx.db.delete(blob._id).catch((e) => {
        console.error("blob delete", e);
      });
    }

    // 2. Delete all collaborative updates of all the stagedFiles
    const stagedFiles = await ctx.db
      .query("fileStaging")
      .filter((q) => q.eq(q.field("vaultId"), args.vaultId))
      .collect();

    for (const stagedFile of stagedFiles) {
      await ctx.db.delete(stagedFile._id).catch((e) => {
        console.error("stagedFile delete", e);
      });
    }

    // 3. Delete all the stagedFiles
    await ctx.db.delete(args.vaultId);

    // 4. Delete folder expansion states
    const folderExpansionStates = await ctx.db
      .query("folderExpansionState")
      .filter((q) => q.eq(q.field("vaultId"), args.vaultId))
      .collect();

    for (const folderExpansionState of folderExpansionStates) {
      await ctx.db.delete(folderExpansionState._id).catch((e) => {
        console.error("folderExpansionState delete", e);
      });
    }

    // 5. Delete infra domain mappings
    const domains = await ctx.db
      .query("vaultDomains")
      .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
      .collect();
    for (const domain of domains) {
      await ctx.db.delete(domain._id).catch((e) => {
        console.error("vaultDomain delete", e);
      });
    }

    // 6. Delete infra record
    const infra = await ctx.db
      .query("vaultInfrastructure")
      .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
      .first();
    if (infra) {
      await ctx.db.delete(infra._id).catch((e) => {
        console.error("vaultInfrastructure delete", e);
      });
    }

    // 7. Delete codespaces records (GitHub resources are handled by vaultActions.deleteVault)
    const codespaces = await ctx.db
      .query("codespaces")
      .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
      .collect();
    for (const codespace of codespaces) {
      await ctx.db.delete(codespace._id).catch((e) => {
        console.error("codespace delete", e);
      });
    }

    // 8. Delete branch metadata/cache rows
    const remoteBranches = await ctx.db
      .query("vaultRemoteBranches")
      .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
      .collect();
    for (const branch of remoteBranches) {
      await ctx.db.delete(branch._id).catch((e) => {
        console.error("vaultRemoteBranch delete", e);
      });
    }

    const branchTrees = await ctx.db
      .query("vaultBranchTrees")
      .withIndex("by_vault_and_branch", (q) => q.eq("vaultId", args.vaultId))
      .collect();
    for (const branchTree of branchTrees) {
      await ctx.db.delete(branchTree._id).catch((e) => {
        console.error("vaultBranchTree delete", e);
      });
    }

    const hasOtherVaultsForRepository = await ctx.runQuery(
      internal.vault.hasOtherVaultsForRepository,
      {
        owner: vault.ghRepoOwner,
        repo: vault.ghRepoName,
        excludeVaultId: vault._id,
      },
    );

    // 9. Delete repo-scoped snapshot records only when this is the last vault for the repo.
    if (!hasOtherVaultsForRepository) {
      const snapshotRecords = await ctx.db
        .query("daytonaSnapshots")
        .withIndex("by_ghRepoOwner_and_ghRepoName_and_branch", (q) =>
          q
            .eq("ghRepoOwner", vault.ghRepoOwner)
            .eq("ghRepoName", vault.ghRepoName)
            .eq("branch", DAYTONA_COMMIT_PINNED_BRANCH),
        )
        .collect();
      for (const snapshotRecord of snapshotRecords) {
        await ctx.db.delete(snapshotRecord._id).catch((e) => {
          console.error("daytonaSnapshot delete", e);
        });
      }
    }

    // 10. Delete the vault
    await ctx.db.delete(vault._id).catch((e) => {
      console.error("vault delete", e);
    });
  },
});

// Get a specific vault by repository full name for a user
export const getVaultByRepository = query({
  args: {
    repositoryFullName: v.string(),
    branch: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);

    return await getVaultByRepositoryHelper(ctx, {
      userId,
      repositoryFullName: args.repositoryFullName,
      branch: args.branch,
    });
  },
});

// MARK: Internal

// mutation to add new vault
export const addVault = internalMutation({
  args: {
    ghRepoId: v.string(),
    ghRepoOwner: v.string(),
    ghRepoName: v.string(),
    treeSHA: v.string(),
    commitSHA: v.optional(v.string()),
    treeData: GithubTreeData,
    state: v.union(v.literal("copying_files"), v.literal("ready")),
    isNoterManaged: v.optional(v.boolean()),
    hostingProvider: v.optional(hostingProviderValidator),
  },
  handler: async (ctx, args): Promise<Id<"vaults">> => {
    const currentUser = await ctx.runQuery(internal.users.getAuthUser, {});

    if (!currentUser) {
      throw new Error("User not found");
    }

    // Check if vault already exists for this user and repository
    const existingVault = await ctx.db
      .query("vaults")
      .filter((q) =>
        q.and(
          q.eq(q.field("userId"), currentUser._id),
          q.eq(q.field("ghRepoId"), args.ghRepoId),
        ),
      )
      .first();

    if (existingVault) {
      if (!existingVault.commitSHA && args.commitSHA) {
        await ctx.db.patch(existingVault._id, { commitSHA: args.commitSHA });
      }
      if (!existingVault.hostingProvider && args.hostingProvider) {
        await ctx.db.patch(existingVault._id, {
          hostingProvider: args.hostingProvider,
        });
      }
      return existingVault._id;
    }

    return await ctx.db.insert("vaults", {
      userId: currentUser._id,
      ghRepoId: args.ghRepoId,
      ghRepoOwner: args.ghRepoOwner,
      ghRepoName: args.ghRepoName,
      treeSHA: args.treeSHA,
      commitSHA: args.commitSHA,
      treeData: args.treeData,
      state: args.state,
      isNoterManaged: args.isNoterManaged ?? false,
      hostingProvider: args.hostingProvider,
      infraState: "not_started",
      infraLastError: undefined,
      infraLastProvisionedAt: undefined,
      infraProvisioningStartedAt: undefined,
    });
  },
});

export const markVaultAsReady = internalMutation({
  args: {
    vaultId: v.id("vaults"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.patch(args.vaultId, { state: "ready" });
  },
});

export const updateVaultDevcontainerConfig = internalMutation({
  args: {
    vaultId: v.id("vaults"),
    devcontainerConfig: v.string(),
  },
  returns: nullValidator,
  handler: async (ctx, args) => {
    await ctx.db.patch(args.vaultId, {
      devcontainerConfig: args.devcontainerConfig,
    });
    return null;
  },
});

export const updateVaultDaytonaSandbox = internalMutation({
  args: {
    vaultId: v.id("vaults"),
    sandboxId: v.string(),
    sandboxName: v.optional(v.string()),
    createdAt: v.number(),
    provisioningMode: optional(
      union(
        literal(DAYTONA_PROVISIONING_MODE_SNAPSHOT_BACKED),
        literal(DAYTONA_PROVISIONING_MODE_LIVE_DEBUG),
      ),
    ),
  },
  returns: nullValidator,
  handler: async (ctx, args) => {
    const patch: {
      daytonaSandboxId: string;
      daytonaSandboxName?: string;
      daytonaSandboxCreatedAt: number;
      daytonaSandboxProvisioningMode?:
        | typeof DAYTONA_PROVISIONING_MODE_SNAPSHOT_BACKED
        | typeof DAYTONA_PROVISIONING_MODE_LIVE_DEBUG;
    } = {
      daytonaSandboxId: args.sandboxId,
      daytonaSandboxName: args.sandboxName,
      daytonaSandboxCreatedAt: args.createdAt,
    };
    if (args.provisioningMode !== undefined) {
      patch.daytonaSandboxProvisioningMode = args.provisioningMode;
    }
    await ctx.db.patch(args.vaultId, patch);
    return null;
  },
});

export const updateVaultDaytonaSnapshot = internalMutation({
  args: {
    vaultId: v.id("vaults"),
    snapshotName: v.optional(v.string()),
  },
  returns: nullValidator,
  handler: async (ctx, args) => {
    await ctx.db.patch(args.vaultId, {
      daytonaSnapshotName: args.snapshotName,
    });
    return null;
  },
});

export const updateVaultDaytonaPrebuildLogs = internalMutation({
  args: {
    vaultId: v.id("vaults"),
    branch: v.string(),
    snapshotName: v.optional(v.string()),
    logs: v.string(),
    updatedAt: v.number(),
  },
  returns: nullValidator,
  handler: async (ctx, args) => {
    await ctx.db.patch(args.vaultId, {
      daytonaPrebuildLogs: args.logs,
      daytonaPrebuildLogsUpdatedAt: args.updatedAt,
      daytonaPrebuildLogsBranch: args.branch,
      daytonaPrebuildLogsSnapshot: args.snapshotName,
    });
    return null;
  },
});

export const clearVaultDaytonaSandbox = internalMutation({
  args: {
    vaultId: v.id("vaults"),
  },
  returns: nullValidator,
  handler: async (ctx, args) => {
    await ctx.db.patch(args.vaultId, {
      daytonaSandboxId: undefined,
      daytonaSandboxName: undefined,
      daytonaSandboxCreatedAt: undefined,
      daytonaSandboxProvisioningMode: undefined,
    });
    return null;
  },
});

async function getCurrentDaytonaSnapshotState(
  ctx: QueryCtx,
  vault: {
    ghRepoOwner: string;
    ghRepoName: string;
    commitSHA?: string;
  },
) {
  if (!vault.commitSHA) {
    return {
      daytonaCurrentSnapshotCommitSha: undefined,
      daytonaCurrentSnapshotName: undefined,
      daytonaCurrentSnapshotStatus: undefined,
      daytonaCurrentSnapshotLastError: undefined,
      daytonaCurrentSnapshotUpdatedAt: undefined,
      daytonaCurrentSnapshotAttemptCount: undefined,
      daytonaCurrentSnapshotNextRetryAt: undefined,
    };
  }
  const commitSha = vault.commitSHA;

  const snapshot = await ctx.db
    .query("daytonaSnapshots")
    .withIndex("by_ghRepoOwner_and_ghRepoName_and_branch_and_commitSha", (q) =>
      q
        .eq("ghRepoOwner", vault.ghRepoOwner)
        .eq("ghRepoName", vault.ghRepoName)
        .eq("branch", DAYTONA_COMMIT_PINNED_BRANCH)
        .eq("commitSha", commitSha),
    )
    .first();

  return {
    daytonaCurrentSnapshotCommitSha: snapshot?.commitSha,
    daytonaCurrentSnapshotName: snapshot?.snapshotName,
    daytonaCurrentSnapshotStatus: snapshot?.status,
    daytonaCurrentSnapshotLastError: snapshot?.lastError,
    daytonaCurrentSnapshotUpdatedAt: snapshot?.updatedAt,
    daytonaCurrentSnapshotAttemptCount: snapshot?.attemptCount,
    daytonaCurrentSnapshotNextRetryAt: snapshot?.nextRetryAt,
  };
}

function compareRemoteBranchSortOrder(
  left: {
    remoteState: "active" | "deleted_upstream";
    lastCommitAt?: number;
    isDefault: boolean;
    name: string;
  },
  right: {
    remoteState: "active" | "deleted_upstream";
    lastCommitAt?: number;
    isDefault: boolean;
    name: string;
  },
): number {
  if (left.remoteState !== right.remoteState) {
    return left.remoteState === "active" ? -1 : 1;
  }
  // Keep the repository default branch pinned at the top regardless of activity.
  // `isDefault` comes from GitHub's `default_branch`, so it works for `main`,
  // `master`, or any custom default branch name.
  if (left.isDefault !== right.isDefault) {
    return left.isDefault ? -1 : 1;
  }
  const leftLastCommitAt = left.lastCommitAt ?? Number.NEGATIVE_INFINITY;
  const rightLastCommitAt = right.lastCommitAt ?? Number.NEGATIVE_INFINITY;
  if (leftLastCommitAt !== rightLastCommitAt) {
    return rightLastCommitAt - leftLastCommitAt;
  }
  return left.name.localeCompare(right.name);
}

type BranchStagingChangeCandidate = StagedFileChangeCandidate;
type BranchStagingRecord = BranchStagingChangeCandidate & {
  _id: Id<"fileStaging">;
  branch: string;
};

export function hasBranchStagingChanges(
  file: BranchStagingChangeCandidate,
): boolean {
  return hasStagedFileChanges(file);
}

export function resolveSyncedBranchLastCommitAt(args: {
  incomingHeadCommitSha: string;
  incomingLastCommitAt?: number;
  existingBranch?: {
    headCommitSha: string;
    lastCommitAt?: number;
  };
}): number | undefined {
  if (args.incomingLastCommitAt !== undefined) {
    return args.incomingLastCommitAt;
  }
  if (
    args.existingBranch &&
    args.existingBranch.headCommitSha === args.incomingHeadCommitSha
  ) {
    return args.existingBranch.lastCommitAt;
  }
  return undefined;
}

export function selectDeletedUpstreamBranchesToAutoPrune(args: {
  branches: Array<{
    name: string;
    remoteState: "active" | "deleted_upstream";
  }>;
  branchHasStagedChanges: ReadonlyMap<string, boolean>;
}): string[] {
  return args.branches
    .filter(
      (branch) =>
        branch.remoteState === "deleted_upstream" &&
        args.branchHasStagedChanges.get(branch.name) !== true,
    )
    .map((branch) => branch.name);
}

function groupStagingFilesByBranch(
  stagingFiles: BranchStagingRecord[],
): Map<string, BranchStagingRecord[]> {
  const grouped = new Map<string, BranchStagingRecord[]>();
  for (const stagingFile of stagingFiles) {
    const existing = grouped.get(stagingFile.branch);
    if (existing) {
      existing.push(stagingFile);
      continue;
    }
    grouped.set(stagingFile.branch, [stagingFile]);
  }
  return grouped;
}

async function deleteVaultBranchArtifacts(
  ctx: MutationCtx,
  args: {
    vaultId: Id<"vaults">;
    branch: string;
    collaborativeUpdatesCutoffTimestamp: number;
    stagingFiles: BranchStagingRecord[];
  },
): Promise<void> {
  const branchTree = await ctx.db
    .query("vaultBranchTrees")
    .withIndex("by_vault_and_branch", (q) =>
      q.eq("vaultId", args.vaultId).eq("branch", args.branch),
    )
    .first();
  if (branchTree) {
    await ctx.db.delete(branchTree._id);
  }

  const domains = await ctx.db
    .query("vaultDomains")
    .withIndex("by_vault_and_branch", (q) =>
      q.eq("vaultId", args.vaultId).eq("branch", args.branch),
    )
    .collect();
  for (const domain of domains) {
    await ctx.db.delete(domain._id);
  }

  for (const stagingFile of args.stagingFiles) {
    await ctx.db.delete(stagingFile._id);
  }

  await ctx.scheduler.runAfter(
    0,
    internal.fileStaging.deleteCollaborativeUpdatesBatch,
    {
      vaultId: args.vaultId,
      branch: args.branch,
      cutoffTimestamp: args.collaborativeUpdatesCutoffTimestamp,
    },
  );
}

async function pruneDeletedUpstreamBranchesForVault(
  ctx: MutationCtx,
  vaultId: Id<"vaults">,
): Promise<void> {
  const deletedUpstreamBranches = await ctx.db
    .query("vaultRemoteBranches")
    .withIndex("by_vault_and_remote_state", (q) =>
      q.eq("vaultId", vaultId).eq("remoteState", "deleted_upstream"),
    )
    .collect();
  if (deletedUpstreamBranches.length === 0) {
    return;
  }

  const collaborativeUpdatesCutoffTimestamp = Date.now() + 1;
  const stagingFilesByBranch = groupStagingFilesByBranch(
    await ctx.db
      .query("fileStaging")
      .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
      .collect(),
  );
  const branchHasStagedChanges = new Map<string, boolean>();
  for (const branch of deletedUpstreamBranches) {
    const branchStaging = stagingFilesByBranch.get(branch.name) ?? [];
    branchHasStagedChanges.set(
      branch.name,
      branchStaging.some(hasBranchStagingChanges),
    );
  }

  const branchNamesToPrune = new Set(
    selectDeletedUpstreamBranchesToAutoPrune({
      branches: deletedUpstreamBranches,
      branchHasStagedChanges,
    }),
  );

  for (const branch of deletedUpstreamBranches) {
    if (!branchNamesToPrune.has(branch.name)) {
      continue;
    }
    await deleteVaultBranchArtifacts(ctx, {
      vaultId,
      branch: branch.name,
      collaborativeUpdatesCutoffTimestamp,
      stagingFiles: stagingFilesByBranch.get(branch.name) ?? [],
    });
    await ctx.db.delete(branch._id);
  }
}

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
    state: union(literal("copying_files"), literal("ready")),
    isNoterManaged: boolean(),
    hostingProvider: optional(hostingProviderValidator),
    hasConvexProvision: boolean(),
    hasNetlifyProvision: boolean(),
    hasHostingProvision: boolean(),
    daytonaSandboxId: optional(string()),
    daytonaSandboxName: optional(string()),
    daytonaSandboxCreatedAt: optional(number()),
    daytonaSnapshotName: optional(string()),
    daytonaPrebuildLogsSnapshot: optional(string()),
    daytonaCurrentSnapshotCommitSha: optional(string()),
    daytonaCurrentSnapshotName: optional(string()),
    daytonaCurrentSnapshotStatus: optional(DaytonaSnapshotBuildStatus),
    daytonaCurrentSnapshotLastError: optional(string()),
    daytonaCurrentSnapshotUpdatedAt: optional(number()),
    daytonaCurrentSnapshotAttemptCount: optional(number()),
    daytonaCurrentSnapshotNextRetryAt: optional(number()),
    remoteBranches: array(
      object({
        name: string(),
        headCommitSha: string(),
        lastCommitAt: optional(number()),
        aheadBy: optional(number()),
        behindBy: optional(number()),
        pullRequestUrl: optional(string()),
        pullRequestNumber: optional(number()),
        isDefault: boolean(),
        isProtected: boolean(),
        remoteState: union(literal("active"), literal("deleted_upstream")),
        lastSyncedAt: number(),
      }),
    ),
    infraState: union(
      literal("not_started"),
      literal("provisioning"),
      literal("ready"),
      literal("failed"),
      literal("partial"),
    ),
    infraProductionUrl: optional(string()),
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

    // Get staging stats for each vault
    const vaultResults: UserVaultResult[] = await Promise.all(
      vaults.map(async (vault) => {
        const stagingData = await ctx.db
          .query("fileStaging")
          .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
          .collect();

        const fileCount = stagingData.filter(hasBranchStagingChanges).length;

        const lastEditTime =
          stagingData.length > 0
            ? Math.max(...stagingData.map((s) => s.lastEditTime))
            : undefined;

        const repositoryFullName = `${vault.ghRepoOwner}/${vault.ghRepoName}`;
        const daytonaSnapshotState = await getCurrentDaytonaSnapshotState(
          ctx,
          vault,
        );
        const remoteBranches = await ctx.db
          .query("vaultRemoteBranches")
          .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
          .collect();
        const infra = await ctx.db
          .query("vaultInfrastructure")
          .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
          .first();
        const hasConvexProvision =
          typeof infra?.convexProjectId === "string" ||
          typeof infra?.convexDeploymentName === "string";
        const hasNetlifyProvision =
          typeof resolveNetlifySiteId(infra) === "string";
        const hasCloudflareProvision =
          infra?.hosting?.provider === "cloudflare" &&
          typeof infra.hosting.projectName === "string" &&
          infra.hosting.projectName.length > 0 &&
          typeof infra.hosting.accountId === "string" &&
          infra.hosting.accountId.length > 0;
        const hasHostingProvision =
          hasNetlifyProvision || hasCloudflareProvision;

        return {
          _id: vault._id,
          _creationTime: vault._creationTime,
          ghRepoOwner: vault.ghRepoOwner,
          ghRepoName: vault.ghRepoName,
          repositoryFullName,
          commitSHA: vault.commitSHA,
          fileCount,
          lastEditTime,
          lastTreeRefreshAt: vault.lastTreeRefreshAt,
          treeRefreshStartedAt: vault.treeRefreshStartedAt,
          state: vault.state,
          isNoterManaged: vault.isNoterManaged ?? false,
          hostingProvider: vault.hostingProvider,
          hasConvexProvision,
          hasNetlifyProvision,
          hasHostingProvision,
          daytonaSandboxId: vault.daytonaSandboxId,
          daytonaSandboxName: vault.daytonaSandboxName,
          daytonaSandboxCreatedAt: vault.daytonaSandboxCreatedAt,
          daytonaSnapshotName: vault.daytonaSnapshotName,
          daytonaPrebuildLogsSnapshot: vault.daytonaPrebuildLogsSnapshot,
          daytonaCurrentSnapshotCommitSha:
            daytonaSnapshotState.daytonaCurrentSnapshotCommitSha,
          daytonaCurrentSnapshotName:
            daytonaSnapshotState.daytonaCurrentSnapshotName,
          daytonaCurrentSnapshotStatus:
            daytonaSnapshotState.daytonaCurrentSnapshotStatus,
          daytonaCurrentSnapshotLastError:
            daytonaSnapshotState.daytonaCurrentSnapshotLastError,
          daytonaCurrentSnapshotUpdatedAt:
            daytonaSnapshotState.daytonaCurrentSnapshotUpdatedAt,
          daytonaCurrentSnapshotAttemptCount:
            daytonaSnapshotState.daytonaCurrentSnapshotAttemptCount,
          daytonaCurrentSnapshotNextRetryAt:
            daytonaSnapshotState.daytonaCurrentSnapshotNextRetryAt,
          remoteBranches: remoteBranches
            .sort(compareRemoteBranchSortOrder)
            .map((branch) => ({
              name: branch.name,
              headCommitSha: branch.headCommitSha,
              lastCommitAt: branch.lastCommitAt,
              aheadBy: branch.aheadBy,
              behindBy: branch.behindBy,
              pullRequestUrl: branch.pullRequestUrl,
              pullRequestNumber: branch.pullRequestNumber,
              isDefault: branch.isDefault,
              isProtected: branch.isProtected,
              remoteState: branch.remoteState,
              lastSyncedAt: branch.lastSyncedAt,
            })),
          infraState: vault.infraState ?? "not_started",
          infraProductionUrl: resolveHostingMainUrl(infra),
        };
      }),
    );

    // Sort by last edit time if available, otherwise by creation time
    return vaultResults.sort((a, b) => {
      const aTime = a.lastEditTime ?? a._creationTime;
      const bTime = b.lastEditTime ?? b._creationTime;
      return bTime - aTime;
    });
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

export const getInfrastructureByVaultId = internalQuery({
  args: {
    vaultId: v.id("vaults"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("vaultInfrastructure")
      .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
      .first();
  },
});

export const getVaultRemoteBranches = query({
  args: {
    vaultId: id("vaults"),
  },
  returns: array(
    object({
      name: string(),
      headCommitSha: string(),
      lastCommitAt: optional(number()),
      aheadBy: optional(number()),
      behindBy: optional(number()),
      pullRequestUrl: optional(string()),
      pullRequestNumber: optional(number()),
      isDefault: boolean(),
      isProtected: boolean(),
      remoteState: union(literal("active"), literal("deleted_upstream")),
      deletedUpstreamAt: optional(number()),
      lastSyncedAt: number(),
    }),
  ),
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const vault = await ctx.db.get(args.vaultId);
    if (!vault || vault.userId !== userId) {
      return [];
    }

    const branches = await ctx.db
      .query("vaultRemoteBranches")
      .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
      .collect();

    return branches.sort(compareRemoteBranchSortOrder).map((branch) => ({
      name: branch.name,
      headCommitSha: branch.headCommitSha,
      lastCommitAt: branch.lastCommitAt,
      aheadBy: branch.aheadBy,
      behindBy: branch.behindBy,
      pullRequestUrl: branch.pullRequestUrl,
      pullRequestNumber: branch.pullRequestNumber,
      isDefault: branch.isDefault,
      isProtected: branch.isProtected,
      remoteState: branch.remoteState,
      deletedUpstreamAt: branch.deletedUpstreamAt,
      lastSyncedAt: branch.lastSyncedAt,
    }));
  },
});

export const getVaultRemoteBranch = internalQuery({
  args: {
    vaultId: id("vaults"),
    branchName: string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("vaultRemoteBranches")
      .withIndex("by_vault_and_name", (q) =>
        q.eq("vaultId", args.vaultId).eq("name", args.branchName),
      )
      .first();
  },
});

export const pruneVaultRemoteBranchCache = internalMutation({
  args: {
    vaultId: id("vaults"),
    branchName: string(),
  },
  returns: nullValidator,
  handler: async (ctx, args) => {
    const remoteBranch = await ctx.db
      .query("vaultRemoteBranches")
      .withIndex("by_vault_and_name", (q) =>
        q.eq("vaultId", args.vaultId).eq("name", args.branchName),
      )
      .first();
    if (remoteBranch) {
      await ctx.db.delete(remoteBranch._id);
    }

    const branchTree = await ctx.db
      .query("vaultBranchTrees")
      .withIndex("by_vault_and_branch", (q) =>
        q.eq("vaultId", args.vaultId).eq("branch", args.branchName),
      )
      .first();
    if (branchTree) {
      await ctx.db.delete(branchTree._id);
    }

    return null;
  },
});

export const syncVaultRemoteBranches = internalMutation({
  args: {
    vaultId: id("vaults"),
    syncedAt: number(),
    branches: array(
      object({
        name: string(),
        headCommitSha: string(),
        lastCommitAt: optional(number()),
        aheadBy: optional(number()),
        behindBy: optional(number()),
        aheadBehindState: union(
          literal("resolved"),
          literal("unavailable"),
          literal("preserve"),
        ),
        pullRequestUrl: optional(string()),
        pullRequestNumber: optional(number()),
        pullRequestState: union(literal("resolved"), literal("preserve")),
        isDefault: boolean(),
        isProtected: boolean(),
      }),
    ),
  },
  returns: nullValidator,
  handler: async (ctx, args) => {
    const vault = await ctx.db.get(args.vaultId);
    if (!vault) {
      return null;
    }

    const existing = await ctx.db
      .query("vaultRemoteBranches")
      .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
      .collect();

    const existingByName = new Map(
      existing.map((branch) => [branch.name, branch]),
    );
    const seenNames = new Set<string>();

    for (const branch of args.branches) {
      seenNames.add(branch.name);
      const existingBranch = existingByName.get(branch.name);
      if (existingBranch) {
        const nextLastCommitAt = resolveSyncedBranchLastCommitAt({
          incomingHeadCommitSha: branch.headCommitSha,
          incomingLastCommitAt: branch.lastCommitAt,
          existingBranch,
        });
        const patchData: {
          headCommitSha: string;
          lastCommitAt?: number;
          aheadBy?: number;
          behindBy?: number;
          pullRequestUrl?: string;
          pullRequestNumber?: number;
          isDefault: boolean;
          isProtected: boolean;
          remoteState: "active";
          deletedUpstreamAt?: number;
          lastSyncedAt: number;
        } = {
          headCommitSha: branch.headCommitSha,
          lastCommitAt: nextLastCommitAt,
          isDefault: branch.isDefault,
          isProtected: branch.isProtected,
          remoteState: "active",
          deletedUpstreamAt: undefined,
          lastSyncedAt: args.syncedAt,
        };
        if (branch.aheadBehindState === "resolved") {
          patchData.aheadBy = branch.aheadBy;
          patchData.behindBy = branch.behindBy;
        } else if (
          branch.aheadBehindState === "unavailable" ||
          existingBranch.headCommitSha !== branch.headCommitSha
        ) {
          patchData.aheadBy = undefined;
          patchData.behindBy = undefined;
        }
        if (branch.pullRequestState === "resolved") {
          patchData.pullRequestUrl = branch.pullRequestUrl;
          patchData.pullRequestNumber = branch.pullRequestNumber;
        }
        await ctx.db.patch(existingBranch._id, patchData);
        continue;
      }

      const insertData: {
        vaultId: Id<"vaults">;
        name: string;
        headCommitSha: string;
        lastCommitAt?: number;
        aheadBy?: number;
        behindBy?: number;
        pullRequestUrl?: string;
        pullRequestNumber?: number;
        isDefault: boolean;
        isProtected: boolean;
        remoteState: "active";
        deletedUpstreamAt?: number;
        lastSyncedAt: number;
      } = {
        vaultId: args.vaultId,
        name: branch.name,
        headCommitSha: branch.headCommitSha,
        lastCommitAt: branch.lastCommitAt,
        isDefault: branch.isDefault,
        isProtected: branch.isProtected,
        remoteState: "active",
        deletedUpstreamAt: undefined,
        lastSyncedAt: args.syncedAt,
      };
      if (branch.aheadBehindState === "resolved") {
        insertData.aheadBy = branch.aheadBy;
        insertData.behindBy = branch.behindBy;
      }
      if (branch.pullRequestState === "resolved") {
        if (typeof branch.pullRequestUrl === "string") {
          insertData.pullRequestUrl = branch.pullRequestUrl;
        }
        if (typeof branch.pullRequestNumber === "number") {
          insertData.pullRequestNumber = branch.pullRequestNumber;
        }
      }
      await ctx.db.insert("vaultRemoteBranches", insertData);
    }

    for (const branch of existing) {
      if (seenNames.has(branch.name)) {
        continue;
      }
      await ctx.db.patch(branch._id, {
        isDefault: false,
        remoteState: "deleted_upstream",
        deletedUpstreamAt: branch.deletedUpstreamAt ?? args.syncedAt,
        lastSyncedAt: args.syncedAt,
      });
    }

    await pruneDeletedUpstreamBranchesForVault(ctx, args.vaultId);

    return null;
  },
});

export const getVaultBranchTree = internalQuery({
  args: {
    vaultId: id("vaults"),
    branch: string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("vaultBranchTrees")
      .withIndex("by_vault_and_branch", (q) =>
        q.eq("vaultId", args.vaultId).eq("branch", args.branch),
      )
      .first();
  },
});

export const upsertVaultBranchTree = internalMutation({
  args: {
    vaultId: id("vaults"),
    branch: string(),
    treeData: GithubTreeData,
    commitSHA: optional(string()),
  },
  returns: nullValidator,
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("vaultBranchTrees")
      .withIndex("by_vault_and_branch", (q) =>
        q.eq("vaultId", args.vaultId).eq("branch", args.branch),
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        treeSHA: args.treeData.sha,
        commitSHA: args.commitSHA,
        treeData: args.treeData,
        lastTreeRefreshAt: now,
        treeRefreshStartedAt: undefined,
      });
      return null;
    }

    await ctx.db.insert("vaultBranchTrees", {
      vaultId: args.vaultId,
      branch: args.branch,
      treeSHA: args.treeData.sha,
      commitSHA: args.commitSHA,
      treeData: args.treeData,
      lastTreeRefreshAt: now,
      treeRefreshStartedAt: undefined,
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
    const matches = await ctx.db
      .query("vaults")
      .withIndex("by_ghRepoOwner_and_ghRepoName", (q) =>
        q.eq("ghRepoOwner", args.owner).eq("ghRepoName", args.repo),
      )
      .take(2);
    return matches.some((vault) => vault._id !== args.excludeVaultId);
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
  const [owner, name] = args.repositoryFullName.split("/");
  if (!owner || !name) {
    throw new Error("Invalid repository full name");
  }

  const vault = await ctx.db
    .query("vaults")
    .filter((q) =>
      q.and(
        q.eq(q.field("userId"), args.userId),
        q.eq(q.field("ghRepoOwner"), owner),
        q.eq(q.field("ghRepoName"), name),
      ),
    )
    .first();

  if (!vault) {
    return null;
  }

  const requestedBranch =
    typeof args.branch === "string" && args.branch.trim().length > 0
      ? args.branch.trim()
      : undefined;

  const remoteBranches = await ctx.db
    .query("vaultRemoteBranches")
    .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
    .collect();
  const { defaultBranch, resolvedBranch, branchNotFound } =
    resolveVaultBranchSelection({
      requestedBranch,
      remoteBranches,
    });

  const branchTree = await ctx.db
    .query("vaultBranchTrees")
    .withIndex("by_vault_and_branch", (q) =>
      q.eq("vaultId", vault._id).eq("branch", resolvedBranch),
    )
    .first();

  return {
    _id: vault._id,
    _creationTime: vault._creationTime,
    ghRepoOwner: vault.ghRepoOwner,
    ghRepoName: vault.ghRepoName,
    repositoryFullName: args.repositoryFullName,
    treeSHA: branchTree?.treeSHA ?? vault.treeSHA,
    commitSHA: branchTree?.commitSHA ?? vault.commitSHA,
    treeData: branchTree?.treeData ?? vault.treeData,
    treeRefreshStartedAt:
      branchTree?.treeRefreshStartedAt ?? vault.treeRefreshStartedAt,
    lastTreeRefreshAt: branchTree?.lastTreeRefreshAt ?? vault.lastTreeRefreshAt,
    defaultBranch,
    resolvedBranch,
    branchNotFound,
    ...(await getCurrentDaytonaSnapshotState(ctx, vault)),
    infraState: vault.infraState ?? "not_started",
    infraLastError: vault.infraLastError,
    infraLastProvisionedAt: vault.infraLastProvisionedAt,
  };
}

export function resolveVaultBranchSelection(args: {
  requestedBranch?: string;
  remoteBranches: Array<{
    name: string;
    isDefault: boolean;
    remoteState: "active" | "deleted_upstream";
  }>;
}): {
  defaultBranch?: string;
  resolvedBranch: string;
  branchNotFound: boolean;
} {
  const activeRemoteBranches = args.remoteBranches.filter(
    (branch) => branch.remoteState === "active",
  );
  const requestedBranchMatch =
    args.requestedBranch === undefined
      ? undefined
      : args.remoteBranches.find(
          (branch) => branch.name === args.requestedBranch,
        );
  const defaultBranch =
    activeRemoteBranches.find((branch) => branch.isDefault)?.name ??
    activeRemoteBranches.at(0)?.name ??
    requestedBranchMatch?.name ??
    args.remoteBranches.at(0)?.name;
  const canValidateRequestedBranch = args.remoteBranches.length > 0;
  const branchNotFound = Boolean(
    args.requestedBranch && canValidateRequestedBranch && !requestedBranchMatch,
  );
  let resolvedBranch = "main";
  if (branchNotFound) {
    resolvedBranch = defaultBranch ?? "main";
  } else if (args.requestedBranch) {
    resolvedBranch = args.requestedBranch;
  } else if (defaultBranch) {
    resolvedBranch = defaultBranch;
  }

  return {
    defaultBranch,
    resolvedBranch,
    branchNotFound,
  };
}

export const getVaultInfrastructure = query({
  args: {
    vaultId: v.id("vaults"),
  },
  returns: v.union(
    v.object({
      infraState: v.union(
        v.literal("not_started"),
        v.literal("provisioning"),
        v.literal("ready"),
        v.literal("failed"),
        v.literal("partial"),
      ),
      infraLastError: v.optional(v.string()),
      infraLastProvisionedAt: v.optional(v.number()),
      infrastructure: v.optional(
        v.object({
          status: v.union(
            v.literal("not_started"),
            v.literal("provisioning"),
            v.literal("ready"),
            v.literal("failed"),
            v.literal("partial"),
          ),
          convexProjectId: v.optional(v.string()),
          convexProjectSlug: v.optional(v.string()),
          convexDeploymentName: v.optional(v.string()),
          convexCloudUrl: v.optional(v.string()),
          convexSiteUrl: v.optional(v.string()),
          hosting: v.optional(hostingStateValidator),
          netlifySiteId: v.optional(v.string()),
          netlifySiteName: v.optional(v.string()),
          netlifyDefaultUrl: v.optional(v.string()),
          netlifyProductionUrl: v.optional(v.string()),
        }),
      ),
      domains: v.array(
        v.object({
          branch: v.string(),
          kind: v.union(v.literal("main"), v.literal("branch_preview")),
          url: v.string(),
          source: v.union(
            v.literal("netlify_default"),
            v.literal("netlify_custom"),
            v.literal("cloudflare_pages_default"),
            v.literal("cloudflare_pages_custom"),
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

    const infrastructure = await ctx.db
      .query("vaultInfrastructure")
      .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
      .first();

    const domains = await ctx.db
      .query("vaultDomains")
      .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
      .collect();

    return {
      infraState: vault.infraState ?? "not_started",
      infraLastError: vault.infraLastError,
      infraLastProvisionedAt: vault.infraLastProvisionedAt,
      infrastructure: infrastructure
        ? {
            status: infrastructure.status,
            convexProjectId: infrastructure.convexProjectId,
            convexProjectSlug: infrastructure.convexProjectSlug,
            convexDeploymentName: infrastructure.convexDeploymentName,
            convexCloudUrl: infrastructure.convexCloudUrl,
            convexSiteUrl: infrastructure.convexSiteUrl,
            hosting: infrastructure.hosting,
            netlifySiteId: infrastructure.netlifySiteId,
            netlifySiteName: infrastructure.netlifySiteName,
            netlifyDefaultUrl: infrastructure.netlifyDefaultUrl,
            netlifyProductionUrl: infrastructure.netlifyProductionUrl,
          }
        : undefined,
      domains: domains.map((domain) => ({
        branch: domain.branch,
        kind: domain.kind,
        url: domain.url,
        source: domain.source,
        active: domain.active,
      })),
    };
  },
});

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

const REFRESH_DEBOUNCE_MS = TREE_REFRESH_DEBOUNCE_MS;
const STALE_LOCK_MS = TREE_REFRESH_STALE_LOCK_MS;

// Atomically claim the tree refresh lock for a vault.
// Returns { claimed: true } if this caller should proceed, { claimed: false } if skipped.
export const claimTreeRefresh = internalMutation({
  args: {
    vaultId: v.id("vaults"),
    force: v.optional(v.boolean()),
    debounceMs: v.optional(v.number()),
  },
  returns: v.object({ claimed: v.boolean() }),
  handler: async (ctx, args) => {
    const vault = await ctx.db.get(args.vaultId);
    if (!vault) return { claimed: false };

    const now = Date.now();
    const debounceMs =
      args.debounceMs !== undefined
        ? Math.max(0, Math.floor(args.debounceMs))
        : REFRESH_DEBOUNCE_MS;

    if (!args.force) {
      // Skip if last successful refresh was recent
      if (
        vault.lastTreeRefreshAt &&
        now - vault.lastTreeRefreshAt < debounceMs
      ) {
        return { claimed: false };
      }

      // Skip if another refresh is already in progress (and not stale)
      if (
        vault.treeRefreshStartedAt &&
        now - vault.treeRefreshStartedAt < STALE_LOCK_MS
      ) {
        return { claimed: false };
      }
    }

    // Claim the lock
    await ctx.db.patch(args.vaultId, { treeRefreshStartedAt: now });
    return { claimed: true };
  },
});

// Optimistically start tree refresh (for immediate UI feedback)
export const startTreeRefreshOptimistic = mutation({
  args: { vaultId: v.id("vaults") },
  handler: async (ctx, args) => {
    const vault = await ctx.db.get(args.vaultId);
    if (!vault) return;

    // Optimistically set the refresh started timestamp
    await ctx.db.patch(args.vaultId, { treeRefreshStartedAt: Date.now() });
  },
});

// Release the tree refresh lock and record completion time.
export const releaseTreeRefresh = internalMutation({
  args: {
    vaultId: v.id("vaults"),
    markRefreshed: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const vault = await ctx.db.get(args.vaultId);
    if (!vault) return;

    await ctx.db.patch(
      args.vaultId,
      args.markRefreshed === false
        ? { treeRefreshStartedAt: undefined }
        : {
            lastTreeRefreshAt: Date.now(),
            treeRefreshStartedAt: undefined,
          },
    );
  },
});

// Update vault tree internal mutation
export const updateVaultTree = internalMutation({
  args: {
    vaultId: v.id("vaults"),
    treeData: GithubTreeData,
    commitSHA: v.optional(v.string()),
  },
  returns: nullValidator,
  handler: async (ctx, args) => {
    const vault = await ctx.db.get(args.vaultId);

    if (!vault) {
      throw new Error("Vault not found");
    }

    const patchData: {
      treeSHA: string;
      treeData: typeof args.treeData;
      commitSHA?: string;
    } = {
      treeSHA: args.treeData.sha,
      treeData: args.treeData,
    };

    if (typeof args.commitSHA === "string") {
      patchData.commitSHA = args.commitSHA;
    }
    await ctx.db.patch(args.vaultId, patchData);

    const commitSha = args.commitSHA;
    const shouldQueueDaytonaSnapshot =
      typeof commitSha === "string" &&
      commitSha !== vault.commitSHA &&
      vault.ghRepoOwner.length > 0 &&
      vault.ghRepoName.length > 0;

    if (shouldQueueDaytonaSnapshot) {
      const queueResult = await enqueueSnapshotBuild(ctx, {
        owner: vault.ghRepoOwner,
        repo: vault.ghRepoName,
        branch: DAYTONA_COMMIT_PINNED_BRANCH,
        commitSha,
        force: false,
      });
      if (queueResult.shouldSchedule) {
        await ctx.scheduler.runAfter(
          0,
          internal.daytona.actions.buildCommitPinnedSnapshot,
          {
            userId: vault.userId,
            owner: vault.ghRepoOwner,
            repo: vault.ghRepoName,
            branch: DAYTONA_COMMIT_PINNED_BRANCH,
            commitSha,
          },
        );
      }
    }

    return null;
  },
});
