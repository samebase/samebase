import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx } from "../_generated/server";
import { mutation, query } from "../functions";
import { vPullRequestLabel, vVaultBranchCommitSummary, type PullRequestLabel } from "../schema";
import { buildVaultBranchCommitSummaries } from "./branchCommitSummary";
import {
  deleteGitHubCommitChecksUnreferencedByBranches,
  getGitHubCommitCheckSnapshotsByCommitSha,
} from "../commitChecks";
import { vGithubTreeData, vTreeRefreshFailureKind } from "./model";
import { hasStagedFileChanges, type StagedFileChangeCandidate } from "../stagingChanges";
import { isLiveConnectedVault } from "./state";
import { isVaultDeletingOrDeleteFailed } from "./deletion/state";
import {
  doesTreeRefreshClaimMatch,
  shouldPreserveTreeRefreshCooldownAfterSuccess,
  TREE_REFRESH_DEBOUNCE_MS,
  TREE_REFRESH_STALE_LOCK_MS,
} from "../../shared/treeRefresh";

const nullValidator = v.null();
const { array, boolean, id, literal, number, object, optional, string, union } = v;
const REMOTE_BRANCH_MISSING_LAST_COMMIT_AT_SORT_RANK = Number.MAX_SAFE_INTEGER;
const REMOTE_BRANCH_SORT_BACKFILL_BATCH_SIZE = 100;
const REMOTE_BRANCH_SORT_BACKFILL_MAX_BATCH_SIZE = 500;

const vRemoteBranchSortFieldsBackfillBatchResult = object({
  scanned: number(),
  patched: number(),
  isDone: boolean(),
  continueCursor: union(string(), nullValidator),
  dryRun: boolean(),
});

const vRemoteBranchSortFieldsBackfillCheckResult = object({
  scanned: number(),
  missingBranchIds: array(id("vaultRemoteBranches")),
  isDone: boolean(),
  continueCursor: union(string(), nullValidator),
});

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
  // Keep the repository default branch pinned at the top regardless of activity.
  // `isDefault` comes from GitHub's `default_branch`, so it works for `main`,
  // `master`, or any custom default branch name.
  if (left.isDefault !== right.isDefault) {
    return left.isDefault ? -1 : 1;
  }
  if (left.remoteState !== right.remoteState) {
    return left.remoteState === "active" ? -1 : 1;
  }
  const leftLastCommitAt = left.lastCommitAt ?? Number.NEGATIVE_INFINITY;
  const rightLastCommitAt = right.lastCommitAt ?? Number.NEGATIVE_INFINITY;
  if (leftLastCommitAt !== rightLastCommitAt) {
    return rightLastCommitAt - leftLastCommitAt;
  }
  return left.name.localeCompare(right.name);
}

export function buildRemoteBranchSortFields(branch: {
  isDefault: boolean;
  remoteState: "active" | "deleted_upstream";
  lastCommitAt?: number;
}): {
  defaultRank: number;
  stateRank: number;
  commitRank: number;
} {
  return {
    defaultRank: branch.isDefault ? 0 : 1,
    stateRank: branch.remoteState === "active" ? 0 : 1,
    commitRank:
      branch.lastCommitAt === undefined
        ? REMOTE_BRANCH_MISSING_LAST_COMMIT_AT_SORT_RANK
        : -branch.lastCommitAt,
  };
}

function getRemoteBranchSortBackfillBatchSize(batchSize: number | undefined): number {
  const resolvedBatchSize = batchSize ?? REMOTE_BRANCH_SORT_BACKFILL_BATCH_SIZE;
  if (
    !Number.isInteger(resolvedBatchSize) ||
    resolvedBatchSize < 1 ||
    resolvedBatchSize > REMOTE_BRANCH_SORT_BACKFILL_MAX_BATCH_SIZE
  ) {
    throw new Error("batchSize must be an integer between 1 and 500");
  }
  return resolvedBatchSize;
}

function remoteBranchNeedsSortFieldBackfill(branch: {
  isDefault: boolean;
  remoteState: "active" | "deleted_upstream";
  lastCommitAt?: number;
  defaultRank?: number;
  stateRank?: number;
  commitRank?: number;
}): boolean {
  const sortFields = buildRemoteBranchSortFields(branch);
  return (
    branch.defaultRank !== sortFields.defaultRank ||
    branch.stateRank !== sortFields.stateRank ||
    branch.commitRank !== sortFields.commitRank
  );
}

type BranchStagingChangeCandidate = StagedFileChangeCandidate;
type BranchStagingRecord = BranchStagingChangeCandidate & {
  _id: Id<"fileStaging">;
  branch: string;
};

export function hasBranchStagingChanges(file: BranchStagingChangeCandidate): boolean {
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
  if (args.existingBranch && args.existingBranch.headCommitSha === args.incomingHeadCommitSha) {
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

export function buildActiveBranchPreviewUrlsByBranch(
  domains: readonly Doc<"vaultDomains">[],
): Map<string, string> {
  const urlsByBranch = new Map<string, string>();
  const previewDomains = domains
    .filter((domain) => domain.kind === "branch_preview" && domain.active)
    .sort(
      (left, right) =>
        right.lastSyncedAt - left.lastSyncedAt ||
        left.branch.localeCompare(right.branch) ||
        left.url.localeCompare(right.url) ||
        left._id.localeCompare(right._id),
    );

  for (const domain of previewDomains) {
    if (!urlsByBranch.has(domain.branch)) {
      urlsByBranch.set(domain.branch, domain.url);
    }
  }

  return urlsByBranch;
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

  await ctx.scheduler.runAfter(0, internal.fileStaging.deleteCollaborativeUpdatesBatch, {
    vaultId: args.vaultId,
    branch: args.branch,
    cutoffTimestamp: args.collaborativeUpdatesCutoffTimestamp,
  });
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
    branchHasStagedChanges.set(branch.name, branchStaging.some(hasBranchStagingChanges));
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

export const syncVaultBranchPreviewDomainFromCheckSnapshot = internalMutation({
  args: {
    vaultId: id("vaults"),
    branchName: string(),
    previewUrl: optional(string()),
    syncedAt: number(),
  },
  returns: nullValidator,
  handler: async (ctx, args) => {
    const vault = await ctx.db.get(args.vaultId);
    if (!vault || isVaultDeletingOrDeleteFailed(vault)) {
      return null;
    }

    const branch = await ctx.db
      .query("vaultRemoteBranches")
      .withIndex("by_vault_and_name", (q) =>
        q.eq("vaultId", args.vaultId).eq("name", args.branchName),
      )
      .first();
    if (!branch || branch.remoteState !== "active" || branch.isDefault) {
      return null;
    }

    const existingDomains = await ctx.db
      .query("vaultDomains")
      .withIndex("by_vault_and_branch", (q) =>
        q.eq("vaultId", args.vaultId).eq("branch", args.branchName),
      )
      .collect();
    const existingPreviewDomains = existingDomains
      .filter((domain) => domain.kind === "branch_preview")
      .sort(
        (left, right) =>
          right.lastSyncedAt - left.lastSyncedAt ||
          left.url.localeCompare(right.url) ||
          left._id.localeCompare(right._id),
      );
    if (!args.previewUrl) {
      for (const previewDomain of existingPreviewDomains) {
        await ctx.db.patch(previewDomain._id, {
          active: false,
          lastSyncedAt: args.syncedAt,
        });
      }
      return null;
    }

    if (existingPreviewDomains.length > 0) {
      const existingPreviewDomain = existingPreviewDomains[0];
      await ctx.db.patch(existingPreviewDomain._id, {
        url: args.previewUrl,
        source: "cloudflare_workers_preview",
        active: true,
        lastSyncedAt: args.syncedAt,
      });
      for (const duplicatePreviewDomain of existingPreviewDomains.slice(1)) {
        await ctx.db.patch(duplicatePreviewDomain._id, {
          active: false,
          lastSyncedAt: args.syncedAt,
        });
      }
      return null;
    }

    await ctx.db.insert("vaultDomains", {
      vaultId: args.vaultId,
      branch: args.branchName,
      kind: "branch_preview",
      url: args.previewUrl,
      source: "cloudflare_workers_preview",
      active: true,
      lastSyncedAt: args.syncedAt,
    });

    return null;
  },
});

export const getVaultRemoteBranches = query({
  access: "access_files_read",
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
      pullRequestLabels: optional(array(vPullRequestLabel)),
      pullRequestTitle: optional(string()),
      pullRequestIsDraft: optional(boolean()),
      previewUrl: optional(string()),
      isDefault: boolean(),
      isProtected: boolean(),
      remoteState: union(literal("active"), literal("deleted_upstream")),
      deletedUpstreamAt: optional(number()),
      lastSyncedAt: number(),
      commits: array(vVaultBranchCommitSummary),
    }),
  ),
  handler: async (ctx, args) => {
    const vault = await ctx.db.get(args.vaultId);
    if (!vault || vault.userId !== ctx.viewer.userId || !isLiveConnectedVault(vault)) {
      return [];
    }

    const [branches, domains] = await Promise.all([
      ctx.db
        .query("vaultRemoteBranches")
        .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
        .collect(),
      ctx.db
        .query("vaultDomains")
        .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
        .collect(),
    ]);
    const checkSnapshotsByCommitSha = await getGitHubCommitCheckSnapshotsByCommitSha(ctx, {
      githubRepositoryId: vault.ghRepoId,
      commitShas: branches.map((branch) => branch.headCommitSha),
    });
    const previewUrlsByBranch = buildActiveBranchPreviewUrlsByBranch(domains);

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
      previewUrl: previewUrlsByBranch.get(branch.name),
      isDefault: branch.isDefault,
      isProtected: branch.isProtected,
      remoteState: branch.remoteState,
      deletedUpstreamAt: branch.deletedUpstreamAt,
      lastSyncedAt: branch.lastSyncedAt,
      commits: buildVaultBranchCommitSummaries(
        branch,
        checkSnapshotsByCommitSha.get(branch.headCommitSha),
      ),
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
        aheadBehindState: union(literal("resolved"), literal("unavailable"), literal("preserve")),
        pullRequestUrl: optional(string()),
        pullRequestNumber: optional(number()),
        pullRequestLabels: optional(array(vPullRequestLabel)),
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

    const existingByName = new Map(existing.map((branch) => [branch.name, branch]));
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
          isDefault: boolean;
          isProtected: boolean;
          remoteState: "active";
          defaultRank: number;
          stateRank: number;
          commitRank: number;
          deletedUpstreamAt?: number;
          lastSyncedAt: number;
        } = {
          headCommitSha: branch.headCommitSha,
          lastCommitAt: nextLastCommitAt,
          isDefault: branch.isDefault,
          isProtected: branch.isProtected,
          remoteState: "active",
          ...buildRemoteBranchSortFields({
            isDefault: branch.isDefault,
            remoteState: "active",
            lastCommitAt: nextLastCommitAt,
          }),
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
        defaultRank: number;
        stateRank: number;
        commitRank: number;
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
        ...buildRemoteBranchSortFields({
          isDefault: branch.isDefault,
          remoteState: "active",
          lastCommitAt: branch.lastCommitAt,
        }),
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
        ...buildRemoteBranchSortFields({
          isDefault: false,
          remoteState: "deleted_upstream",
          lastCommitAt: branch.lastCommitAt,
        }),
        deletedUpstreamAt: branch.deletedUpstreamAt ?? args.syncedAt,
        lastSyncedAt: args.syncedAt,
      });
    }

    await pruneDeletedUpstreamBranchesForVault(ctx, args.vaultId);
    if (vault.state === "connected") {
      await deleteGitHubCommitChecksUnreferencedByBranches(ctx, {
        githubRepositoryId: vault.ghRepoId,
        activeCommitShas: new Set(args.branches.map((branch) => branch.headCommitSha)),
      });
    }

    return null;
  },
});

export const backfillVaultRemoteBranchSortFieldsBatch = internalMutation({
  args: {
    cursor: optional(union(string(), nullValidator)),
    batchSize: optional(number()),
    dryRun: optional(boolean()),
  },
  returns: vRemoteBranchSortFieldsBackfillBatchResult,
  handler: async (ctx, args) => {
    const batchSize = getRemoteBranchSortBackfillBatchSize(args.batchSize);
    const dryRun = args.dryRun === true;
    const result = await ctx.db.query("vaultRemoteBranches").paginate({
      cursor: args.cursor ?? null,
      numItems: batchSize,
    });
    let patched = 0;

    for (const branch of result.page) {
      if (!remoteBranchNeedsSortFieldBackfill(branch)) {
        continue;
      }
      patched += 1;
      if (!dryRun) {
        await ctx.db.patch(branch._id, buildRemoteBranchSortFields(branch));
      }
    }

    if (!dryRun && !result.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.vault.branches.backfillVaultRemoteBranchSortFieldsBatch,
        {
          cursor: result.continueCursor,
          batchSize,
        },
      );
    }

    return {
      scanned: result.page.length,
      patched,
      isDone: result.isDone,
      continueCursor: result.continueCursor,
      dryRun,
    };
  },
});

export const checkVaultRemoteBranchSortFieldsBackfill = internalQuery({
  args: {
    cursor: optional(union(string(), nullValidator)),
    batchSize: optional(number()),
  },
  returns: vRemoteBranchSortFieldsBackfillCheckResult,
  handler: async (ctx, args) => {
    const batchSize = getRemoteBranchSortBackfillBatchSize(args.batchSize);
    const result = await ctx.db.query("vaultRemoteBranches").paginate({
      cursor: args.cursor ?? null,
      numItems: batchSize,
    });

    return {
      scanned: result.page.length,
      missingBranchIds: result.page
        .filter(remoteBranchNeedsSortFieldBackfill)
        .map((branch) => branch._id),
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
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
    treeData: vGithubTreeData,
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
      : args.remoteBranches.find((branch) => branch.name === args.requestedBranch);
  const defaultBranch =
    activeRemoteBranches.find((branch) => branch.isDefault)?.name ?? args.defaultBranch;
  const canValidateRequestedBranch = args.remoteBranches.length > 0;
  const requestedBranchDiffersFromDefault =
    args.requestedBranch !== undefined && args.requestedBranch !== defaultBranch;
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
  return remoteBranches.filter((branch) => branch.remoteState === "active").length;
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
      v.union(v.literal("cooldown"), v.literal("recent_success"), v.literal("in_progress")),
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
      if (vault.treeRefreshStartedAt && now - vault.treeRefreshStartedAt < STALE_LOCK_MS) {
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
  access: "access_app_refresh",
  args: { vaultId: v.id("vaults") },
  handler: async (ctx, args) => {
    const vault = await ctx.db.get(args.vaultId);
    if (!vault || vault.userId !== ctx.viewer.userId) {
      throw new Error("Vault not found");
    }
    if (isVaultDeletingOrDeleteFailed(vault)) return;

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
    failureKind: v.optional(vTreeRefreshFailureKind),
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
    const cooldownUntil = getLaterCooldownUntil(vault.treeRefreshCooldownUntil, args.cooldownUntil);
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
              args.updateLastTreeRefreshAt === false ? vault.lastTreeRefreshAt : now,
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
            treeRefreshCooldownUntil: shouldPreserveCooldownState ? cooldownUntil : undefined,
          },
    );
    return { released: true };
  },
});

export const recordTreeRefreshFailure = internalMutation({
  args: {
    vaultId: id("vaults"),
    startedAt: optional(number()),
    failureKind: optional(vTreeRefreshFailureKind),
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
