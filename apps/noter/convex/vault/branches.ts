import { v, type Infer } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
} from "../_generated/server";
import { getUserId } from "../common";
import {
  GithubTreeData,
  PullRequestLabel,
  TreeRefreshFailureKind,
} from "../schema";
import {
  hasStagedFileChanges,
  type StagedFileChangeCandidate,
} from "../stagingChanges";
import { isLiveConnectedVault } from "./state";
import { isVaultDeletingOrDeleteFailed } from "./deletion/state";
import {
  doesTreeRefreshClaimMatch,
  shouldPreserveTreeRefreshCooldownAfterSuccess,
  TREE_REFRESH_DEBOUNCE_MS,
  TREE_REFRESH_STALE_LOCK_MS,
} from "../../shared/treeRefresh";

const nullValidator = v.null();
const { array, boolean, id, literal, number, object, optional, string, union } =
  v;
const cloudflarePreviewMetadataFields = {
  cloudflareBranchPreviewUrl: optional(string()),
  cloudflarePreviewPullRequestNumber: optional(number()),
  cloudflarePreviewUrl: optional(string()),
  cloudflarePreviewCommitSha: optional(string()),
  cloudflarePreviewStatus: optional(string()),
  cloudflarePreviewLogsUrl: optional(string()),
  cloudflarePreviewCommentCreatedAt: optional(number()),
} as const;
const cloudflarePreviewMetadataValidator = object(
  cloudflarePreviewMetadataFields,
);
type CloudflarePreviewMetadata = Infer<
  typeof cloudflarePreviewMetadataValidator
>;

/**
 * Cloudflare can edit or partially reformat its PR comment without removing the
 * underlying branch alias. Preserve existing cached fields when the latest
 * comment only yields a partial parse, but still clear everything when GitHub
 * told us there is no relevant preview comment for the branch anymore.
 */
export function resolveSyncedCloudflarePreviewMetadata(args: {
  existing?: CloudflarePreviewMetadata;
  incoming: CloudflarePreviewMetadata & {
    previewState: "resolved" | "clear";
  };
}): CloudflarePreviewMetadata {
  if (args.incoming.previewState === "clear") {
    return {
      cloudflareBranchPreviewUrl: undefined,
      cloudflarePreviewPullRequestNumber: undefined,
      cloudflarePreviewUrl: undefined,
      cloudflarePreviewCommitSha: undefined,
      cloudflarePreviewStatus: undefined,
      cloudflarePreviewLogsUrl: undefined,
      cloudflarePreviewCommentCreatedAt: undefined,
    };
  }

  return {
    cloudflareBranchPreviewUrl:
      args.incoming.cloudflareBranchPreviewUrl ??
      args.existing?.cloudflareBranchPreviewUrl,
    cloudflarePreviewPullRequestNumber:
      args.incoming.cloudflarePreviewPullRequestNumber ??
      args.existing?.cloudflarePreviewPullRequestNumber,
    cloudflarePreviewUrl:
      args.incoming.cloudflarePreviewUrl ?? args.existing?.cloudflarePreviewUrl,
    cloudflarePreviewCommitSha:
      args.incoming.cloudflarePreviewCommitSha ??
      args.existing?.cloudflarePreviewCommitSha,
    cloudflarePreviewStatus:
      args.incoming.cloudflarePreviewStatus ??
      args.existing?.cloudflarePreviewStatus,
    cloudflarePreviewLogsUrl:
      args.incoming.cloudflarePreviewLogsUrl ??
      args.existing?.cloudflarePreviewLogsUrl,
    cloudflarePreviewCommentCreatedAt:
      args.incoming.cloudflarePreviewCommentCreatedAt ??
      args.existing?.cloudflarePreviewCommentCreatedAt,
  };
}

/**
 * Cloudflare preview links are cached per PR. Clear the saved preview when the
 * branch loses its current PR or when GitHub points the branch at a different
 * PR number so the next hydration can fetch fresh comment data exactly once for
 * that PR.
 */
export function shouldClearCloudflarePreviewForPullRequestSync(args: {
  incomingPullRequestState: "resolved" | "preserve";
  incomingPullRequestNumber?: number;
  existingPullRequestNumber?: number;
}): boolean {
  if (args.incomingPullRequestState !== "resolved") {
    return false;
  }

  if (typeof args.incomingPullRequestNumber !== "number") {
    return true;
  }

  return args.incomingPullRequestNumber !== args.existingPullRequestNumber;
}

export function compareRemoteBranchSortOrder(
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
      pullRequestLabels: optional(array(PullRequestLabel)),
      pullRequestTitle: optional(string()),
      pullRequestIsDraft: optional(boolean()),
      isDefault: boolean(),
      isProtected: boolean(),
      remoteState: union(literal("active"), literal("deleted_upstream")),
      deletedUpstreamAt: optional(number()),
      lastSyncedAt: number(),
      ...cloudflarePreviewMetadataFields,
    }),
  ),
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    const vault = await ctx.db.get(args.vaultId);
    if (!vault || vault.userId !== userId || !isLiveConnectedVault(vault)) {
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
      pullRequestLabels: branch.pullRequestLabels,
      pullRequestTitle: branch.pullRequestTitle,
      pullRequestIsDraft: branch.pullRequestIsDraft,
      isDefault: branch.isDefault,
      isProtected: branch.isProtected,
      remoteState: branch.remoteState,
      deletedUpstreamAt: branch.deletedUpstreamAt,
      lastSyncedAt: branch.lastSyncedAt,
      cloudflareBranchPreviewUrl: branch.cloudflareBranchPreviewUrl,
      cloudflarePreviewPullRequestNumber:
        branch.cloudflarePreviewPullRequestNumber,
      cloudflarePreviewUrl: branch.cloudflarePreviewUrl,
      cloudflarePreviewCommitSha: branch.cloudflarePreviewCommitSha,
      cloudflarePreviewStatus: branch.cloudflarePreviewStatus,
      cloudflarePreviewLogsUrl: branch.cloudflarePreviewLogsUrl,
      cloudflarePreviewCommentCreatedAt:
        branch.cloudflarePreviewCommentCreatedAt,
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
        pullRequestLabels: optional(array(PullRequestLabel)),
        pullRequestTitle: optional(string()),
        pullRequestIsDraft: optional(boolean()),
        pullRequestState: union(literal("resolved"), literal("preserve")),
        isDefault: boolean(),
        isProtected: boolean(),
      }),
    ),
  },
  returns: nullValidator,
  handler: async (ctx, args) => {
    const vault = await ctx.db.get(args.vaultId);
    if (!vault || isVaultDeletingOrDeleteFailed(vault)) {
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
          pullRequestLabels?: PullRequestLabel[];
          pullRequestTitle?: string;
          pullRequestIsDraft?: boolean;
          cloudflareBranchPreviewUrl?: string;
          cloudflarePreviewPullRequestNumber?: number;
          cloudflarePreviewUrl?: string;
          cloudflarePreviewCommitSha?: string;
          cloudflarePreviewStatus?: string;
          cloudflarePreviewLogsUrl?: string;
          cloudflarePreviewCommentCreatedAt?: number;
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
          patchData.pullRequestLabels = branch.pullRequestLabels;
          patchData.pullRequestTitle = branch.pullRequestTitle;
          patchData.pullRequestIsDraft =
            typeof branch.pullRequestUrl === "string"
              ? branch.pullRequestIsDraft === true
              : undefined;
          if (
            shouldClearCloudflarePreviewForPullRequestSync({
              incomingPullRequestState: branch.pullRequestState,
              incomingPullRequestNumber: branch.pullRequestNumber,
              existingPullRequestNumber: existingBranch.pullRequestNumber,
            })
          ) {
            patchData.cloudflareBranchPreviewUrl = undefined;
            patchData.cloudflarePreviewPullRequestNumber = undefined;
            patchData.cloudflarePreviewUrl = undefined;
            patchData.cloudflarePreviewCommitSha = undefined;
            patchData.cloudflarePreviewStatus = undefined;
            patchData.cloudflarePreviewLogsUrl = undefined;
            patchData.cloudflarePreviewCommentCreatedAt = undefined;
          }
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
        pullRequestLabels?: PullRequestLabel[];
        pullRequestTitle?: string;
        pullRequestIsDraft?: boolean;
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
        if (Array.isArray(branch.pullRequestLabels)) {
          insertData.pullRequestLabels = branch.pullRequestLabels;
        }
        if (typeof branch.pullRequestTitle === "string") {
          insertData.pullRequestTitle = branch.pullRequestTitle;
        }
        if (typeof branch.pullRequestUrl === "string") {
          insertData.pullRequestIsDraft = branch.pullRequestIsDraft === true;
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
        cloudflareBranchPreviewUrl: undefined,
        cloudflarePreviewPullRequestNumber: undefined,
        cloudflarePreviewUrl: undefined,
        cloudflarePreviewCommitSha: undefined,
        cloudflarePreviewStatus: undefined,
        cloudflarePreviewLogsUrl: undefined,
        cloudflarePreviewCommentCreatedAt: undefined,
      });
    }

    await pruneDeletedUpstreamBranchesForVault(ctx, args.vaultId);

    return null;
  },
});

export const syncVaultRemoteBranchCloudflarePreviews = internalMutation({
  args: {
    vaultId: id("vaults"),
    branches: array(
      object({
        name: string(),
        previewState: union(
          literal("resolved"),
          literal("clear"),
          literal("preserve"),
        ),
        ...cloudflarePreviewMetadataFields,
      }),
    ),
  },
  returns: nullValidator,
  handler: async (ctx, args) => {
    const vault = await ctx.db.get(args.vaultId);
    if (!vault || isVaultDeletingOrDeleteFailed(vault)) {
      return null;
    }

    const existing = await ctx.db
      .query("vaultRemoteBranches")
      .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
      .collect();
    const existingByName = new Map(
      existing.map((branch) => [branch.name, branch]),
    );

    for (const branch of args.branches) {
      if (branch.previewState === "preserve") {
        continue;
      }

      const existingBranch = existingByName.get(branch.name);
      if (!existingBranch) {
        continue;
      }

      const resolvedMetadata =
        branch.previewState === "clear"
          ? resolveSyncedCloudflarePreviewMetadata({
              existing: existingBranch,
              incoming: {
                previewState: "clear",
              },
            })
          : resolveSyncedCloudflarePreviewMetadata({
              existing: existingBranch,
              incoming: {
                previewState: "resolved",
                cloudflareBranchPreviewUrl: branch.cloudflareBranchPreviewUrl,
                cloudflarePreviewPullRequestNumber:
                  branch.cloudflarePreviewPullRequestNumber,
                cloudflarePreviewUrl: branch.cloudflarePreviewUrl,
                cloudflarePreviewCommitSha: branch.cloudflarePreviewCommitSha,
                cloudflarePreviewStatus: branch.cloudflarePreviewStatus,
                cloudflarePreviewLogsUrl: branch.cloudflarePreviewLogsUrl,
                cloudflarePreviewCommentCreatedAt:
                  branch.cloudflarePreviewCommentCreatedAt,
              },
            });

      await ctx.db.patch(existingBranch._id, resolvedMetadata);
    }

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
    const vault = await ctx.db.get(args.vaultId);
    if (!vault || isVaultDeletingOrDeleteFailed(vault)) {
      return null;
    }

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

export function resolveVaultBranchSelection(args: {
  requestedBranch?: string;
  defaultBranch: string;
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
    args.defaultBranch;
  const canValidateRequestedBranch = args.remoteBranches.length > 0;
  const requestedBranchDiffersFromDefault =
    args.requestedBranch !== undefined &&
    args.requestedBranch !== defaultBranch;
  const branchNotFound = Boolean(
    args.requestedBranch &&
    ((canValidateRequestedBranch && !requestedBranchMatch) ||
      (!canValidateRequestedBranch && requestedBranchDiffersFromDefault)),
  );
  let resolvedBranch = defaultBranch;
  if (branchNotFound) {
    resolvedBranch = defaultBranch;
  } else if (args.requestedBranch) {
    resolvedBranch = args.requestedBranch;
  }

  return {
    defaultBranch,
    resolvedBranch,
    branchNotFound,
  };
}

export function countActiveRemoteBranches(
  remoteBranches: Array<{
    remoteState: "active" | "deleted_upstream";
  }>,
): number {
  return remoteBranches.filter((branch) => branch.remoteState === "active")
    .length;
}

const REFRESH_DEBOUNCE_MS = TREE_REFRESH_DEBOUNCE_MS;
const STALE_LOCK_MS = TREE_REFRESH_STALE_LOCK_MS;

function getLaterCooldownUntil(
  existingCooldownUntil: number | undefined,
  nextCooldownUntil: number | undefined,
): number | undefined {
  if (typeof existingCooldownUntil !== "number") {
    return nextCooldownUntil;
  }
  if (typeof nextCooldownUntil !== "number") {
    return existingCooldownUntil;
  }
  return Math.max(existingCooldownUntil, nextCooldownUntil);
}

// Atomically claim the tree refresh lock for a vault.
// Returns the claimed timestamp when this caller should proceed.
export const claimTreeRefresh = internalMutation({
  args: {
    vaultId: v.id("vaults"),
    force: v.optional(v.boolean()),
    debounceMs: v.optional(v.number()),
    skipRecentSuccessDebounce: v.optional(v.boolean()),
  },
  returns: v.object({
    claimed: v.boolean(),
    startedAt: v.optional(v.number()),
    reason: v.optional(
      v.union(
        v.literal("cooldown"),
        v.literal("recent_success"),
        v.literal("in_progress"),
      ),
    ),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    claimed: boolean;
    startedAt?: number;
    reason?: "cooldown" | "recent_success" | "in_progress";
  }> => {
    const vault = await ctx.db.get(args.vaultId);
    if (!vault || isVaultDeletingOrDeleteFailed(vault)) {
      return { claimed: false };
    }

    const now = Date.now();
    const debounceMs =
      args.debounceMs !== undefined
        ? Math.max(0, Math.floor(args.debounceMs))
        : REFRESH_DEBOUNCE_MS;

    if (!args.force) {
      if (
        typeof vault.treeRefreshCooldownUntil === "number" &&
        vault.treeRefreshCooldownUntil > now
      ) {
        return { claimed: false, reason: "cooldown" };
      }

      // Skip if last successful refresh was recent
      if (
        !args.skipRecentSuccessDebounce &&
        vault.lastTreeRefreshAt &&
        now - vault.lastTreeRefreshAt < debounceMs
      ) {
        return { claimed: false, reason: "recent_success" };
      }

      // Skip if another refresh is already in progress (and not stale)
      if (
        vault.treeRefreshStartedAt &&
        now - vault.treeRefreshStartedAt < STALE_LOCK_MS
      ) {
        return { claimed: false, reason: "in_progress" };
      }
    }

    // Claim the lock
    await ctx.db.patch(args.vaultId, { treeRefreshStartedAt: now });
    return { claimed: true, startedAt: now };
  },
});

// Optimistically start tree refresh (for immediate UI feedback)
export const startTreeRefreshOptimistic = mutation({
  args: { vaultId: v.id("vaults") },
  handler: async (ctx, args) => {
    const vault = await ctx.db.get(args.vaultId);
    if (!vault || isVaultDeletingOrDeleteFailed(vault)) return;

    // Optimistically set the refresh started timestamp
    await ctx.db.patch(args.vaultId, { treeRefreshStartedAt: Date.now() });
  },
});

// Release the tree refresh lock and record completion time.
export const releaseTreeRefresh = internalMutation({
  args: {
    vaultId: v.id("vaults"),
    startedAt: v.number(),
    markRefreshed: v.optional(v.boolean()),
    updateLastTreeRefreshAt: v.optional(v.boolean()),
    failureKind: v.optional(TreeRefreshFailureKind),
    failureMessage: v.optional(v.string()),
    cooldownUntil: v.optional(v.number()),
  },
  returns: object({
    released: boolean(),
  }),
  handler: async (ctx, args) => {
    const vault = await ctx.db.get(args.vaultId);
    if (!vault || isVaultDeletingOrDeleteFailed(vault)) {
      return { released: false };
    }

    if (
      !doesTreeRefreshClaimMatch({
        claimedStartedAt: args.startedAt,
        treeRefreshStartedAt: vault.treeRefreshStartedAt,
      })
    ) {
      return { released: false };
    }

    const now = Date.now();
    const cooldownUntil = getLaterCooldownUntil(
      vault.treeRefreshCooldownUntil,
      args.cooldownUntil,
    );
    const shouldPreserveCooldownState =
      args.markRefreshed !== false &&
      shouldPreserveTreeRefreshCooldownAfterSuccess({
        claimedStartedAt: args.startedAt,
        lastTreeRefreshFailedAt: vault.lastTreeRefreshFailedAt,
        cooldownUntil,
        now,
      });
    await ctx.db.patch(
      args.vaultId,
      args.markRefreshed === false
        ? {
            treeRefreshStartedAt: undefined,
            lastTreeRefreshFailedAt: now,
            treeRefreshFailureKind: args.failureKind ?? "failed",
            treeRefreshFailureMessage: args.failureMessage,
            treeRefreshCooldownUntil: cooldownUntil,
          }
        : {
            lastTreeRefreshAt:
              args.updateLastTreeRefreshAt === false
                ? vault.lastTreeRefreshAt
                : now,
            treeRefreshStartedAt: undefined,
            // Preserve any newer repo-level cooldown that landed while this
            // tree refresh was still in flight so a late success cannot reopen
            // GitHub traffic immediately.
            lastTreeRefreshFailedAt: shouldPreserveCooldownState
              ? vault.lastTreeRefreshFailedAt
              : undefined,
            treeRefreshFailureKind: shouldPreserveCooldownState
              ? vault.treeRefreshFailureKind
              : undefined,
            treeRefreshFailureMessage: shouldPreserveCooldownState
              ? vault.treeRefreshFailureMessage
              : undefined,
            treeRefreshCooldownUntil: shouldPreserveCooldownState
              ? cooldownUntil
              : undefined,
          },
    );
    return { released: true };
  },
});

export const recordTreeRefreshFailure = internalMutation({
  args: {
    vaultId: id("vaults"),
    startedAt: optional(number()),
    failureKind: optional(TreeRefreshFailureKind),
    failureMessage: optional(string()),
    cooldownUntil: optional(number()),
  },
  returns: nullValidator,
  handler: async (ctx, args) => {
    const vault = await ctx.db.get(args.vaultId);
    if (!vault || isVaultDeletingOrDeleteFailed(vault)) {
      return null;
    }
    // Ignore stale fallback failures once another refresh claim has taken over.
    if (
      typeof args.startedAt === "number" &&
      !doesTreeRefreshClaimMatch({
        claimedStartedAt: args.startedAt,
        treeRefreshStartedAt: vault.treeRefreshStartedAt,
      })
    ) {
      return null;
    }

    await ctx.db.patch(args.vaultId, {
      lastTreeRefreshFailedAt: Date.now(),
      treeRefreshFailureKind: args.failureKind ?? "failed",
      treeRefreshFailureMessage: args.failureMessage,
      treeRefreshCooldownUntil: getLaterCooldownUntil(
        vault.treeRefreshCooldownUntil,
        args.cooldownUntil,
      ),
    });
    return null;
  },
});
