import { paginationResultValidator } from "convex/server";
import { Infer, v } from "convex/values";

const { array, boolean, id, literal, number, object, optional, string, union } = v;

export const vRepositoryInventoryCheckState = union(
  literal("success"),
  literal("failure"),
  literal("running"),
  literal("neutral"),
  literal("unknown"),
);
export type RepositoryInventoryCheckState = Infer<typeof vRepositoryInventoryCheckState>;

export const vRepositoryInventoryCheckSummary = object({
  state: vRepositoryInventoryCheckState,
  totalCount: number(),
  checkRunCount: number(),
  statusContextCount: number(),
  successCount: number(),
  failureCount: number(),
  runningCount: number(),
  neutralCount: number(),
  unknownCount: number(),
  primaryTargetUrl: optional(string()),
  primaryLogUrl: optional(string()),
  syncedAt: number(),
});
export type RepositoryInventoryCheckSummary = Infer<typeof vRepositoryInventoryCheckSummary>;

export const vRepositoryInventoryCommit = object({
  sha: string(),
  title: optional(string()),
  authoredAt: optional(number()),
  committedAt: optional(number()),
  checks: vRepositoryInventoryCheckSummary,
});
export type RepositoryInventoryCommit = Infer<typeof vRepositoryInventoryCommit>;

export const vRepositoryInventoryPullRequestLabel = object({
  name: string(),
  color: optional(string()),
});
export type RepositoryInventoryPullRequestLabel = Infer<
  typeof vRepositoryInventoryPullRequestLabel
>;

const repositoryInventoryItemSortFields = {
  userId: id("users"),
  vaultId: id("vaults"),
  generation: number(),
  kindRank: number(),
  timeRank: number(),
  tie: string(),
  rowKey: string(),
  lastSyncedAt: number(),
};

const repositoryInventoryBranchFields = {
  ...repositoryInventoryItemSortFields,
  name: string(),
  repositoryFullName: string(),
  headCommitSha: string(),
  lastCommitAt: optional(number()),
  isDefault: boolean(),
  previewUrl: optional(string()),
  headCommit: vRepositoryInventoryCommit,
};

export const vRepositoryInventoryBranchItem = object({
  kind: literal("branch"),
  ...repositoryInventoryBranchFields,
});
export type RepositoryInventoryBranchItem = Infer<typeof vRepositoryInventoryBranchItem>;

export const vStoredRepositoryInventoryBranchItem = object({
  kind: literal("branch"),
  ...repositoryInventoryBranchFields,
  branchLookupKey: string(),
});
export type StoredRepositoryInventoryBranchItem = Infer<
  typeof vStoredRepositoryInventoryBranchItem
>;

const repositoryInventoryPullRequestFields = {
  ...repositoryInventoryItemSortFields,
  nodeId: string(),
  number: number(),
  url: string(),
  title: string(),
  isDraft: boolean(),
  isCrossRepository: boolean(),
  createdAt: number(),
  updatedAt: number(),
  baseRepositoryFullName: string(),
  baseRefName: string(),
  headRepositoryId: optional(string()),
  headRepositoryFullName: optional(string()),
  headRefName: string(),
  headCommitSha: string(),
  canOpenInSamebase: boolean(),
  previewUrl: optional(string()),
  headCommit: vRepositoryInventoryCommit,
};

export const vStoredRepositoryInventoryPullRequestItem = object({
  kind: literal("pull_request"),
  ...repositoryInventoryPullRequestFields,
  branchLookupKey: string(),
  labelChunkCount: number(),
});
export type StoredRepositoryInventoryPullRequestItem = Infer<
  typeof vStoredRepositoryInventoryPullRequestItem
>;

export const vRepositoryInventoryPullRequestItem = object({
  kind: literal("pull_request"),
  ...repositoryInventoryPullRequestFields,
  labels: array(vRepositoryInventoryPullRequestLabel),
});
export type RepositoryInventoryPullRequestItem = Infer<typeof vRepositoryInventoryPullRequestItem>;

export const vStoredRepositoryInventoryItem = union(
  vStoredRepositoryInventoryBranchItem,
  vStoredRepositoryInventoryPullRequestItem,
);
export type StoredRepositoryInventoryItem = Infer<typeof vStoredRepositoryInventoryItem>;

export const vRepositoryInventoryItem = union(
  vRepositoryInventoryBranchItem,
  vRepositoryInventoryPullRequestItem,
);
export type RepositoryInventoryItem = Infer<typeof vRepositoryInventoryItem>;
export const vRepositoryInventoryItemPage = paginationResultValidator(vRepositoryInventoryItem);

export const vRepositoryInventoryLabelChunk = object({
  userId: id("users"),
  vaultId: id("vaults"),
  generation: number(),
  rowKey: string(),
  chunkIndex: number(),
  labels: array(vRepositoryInventoryPullRequestLabel),
});
export type RepositoryInventoryLabelChunk = Infer<typeof vRepositoryInventoryLabelChunk>;

export const vRepositoryInventoryScheduledWait = union(
  object({
    kind: literal("immediate"),
  }),
  object({
    kind: literal("queue"),
    retryAt: number(),
  }),
  object({
    kind: literal("rate_limit"),
    retryAt: number(),
  }),
);
export type RepositoryInventoryScheduledWait = Infer<typeof vRepositoryInventoryScheduledWait>;

export const vRepositoryInventoryRefreshLifecycle = union(
  object({
    state: literal("idle"),
  }),
  object({
    state: literal("scheduled"),
    generation: number(),
    targetDemandVersion: number(),
    scheduledAt: number(),
    workpoolJobId: string(),
    wait: vRepositoryInventoryScheduledWait,
  }),
  object({
    state: literal("running"),
    generation: number(),
    targetDemandVersion: number(),
    startedAt: number(),
    leaseExpiresAt: number(),
    workpoolJobId: string(),
  }),
  object({
    state: literal("failed"),
    failedAt: number(),
    message: string(),
  }),
);
export type RepositoryInventoryRefreshLifecycle = Infer<
  typeof vRepositoryInventoryRefreshLifecycle
>;

export const vRepositoryInventoryPublication = object({
  userId: id("users"),
  vaultId: id("vaults"),
  repositoryNodeId: string(),
  repositoryFullName: string(),
  activeGeneration: number(),
  publishedAt: number(),
  itemCount: number(),
  branchCount: number(),
  pullRequestCount: number(),
  fingerprint: string(),
});

export const vRepositoryInventoryRefresh = object({
  userId: id("users"),
  vaultId: id("vaults"),
  demandVersion: number(),
  nextGeneration: number(),
  lifecycle: vRepositoryInventoryRefreshLifecycle,
  lastStartedAt: optional(number()),
  lastCheckedAt: optional(number()),
  updatedAt: number(),
});

export const vRepositoryInventoryGeneration = object({
  userId: id("users"),
  vaultId: id("vaults"),
  generation: number(),
  itemCount: number(),
  branchCount: number(),
  pullRequestCount: number(),
  labelChunkCount: number(),
  createdAt: number(),
});

const repositoryInventoryPublicCounts = {
  itemCount: number(),
  branchCount: number(),
  pullRequestCount: number(),
};

export const vRepositoryInventoryPublicState = union(
  object({
    state: literal("empty"),
  }),
  object({
    state: literal("refreshing"),
    startedAt: number(),
    activeGeneration: optional(number()),
    repositoryFullName: optional(string()),
    publishedAt: optional(number()),
    ...repositoryInventoryPublicCounts,
  }),
  object({
    state: literal("waiting"),
    reason: union(literal("queue"), literal("rate_limit")),
    retryAt: number(),
    activeGeneration: optional(number()),
    repositoryFullName: optional(string()),
    publishedAt: optional(number()),
    ...repositoryInventoryPublicCounts,
  }),
  object({
    state: literal("ready"),
    activeGeneration: number(),
    repositoryFullName: string(),
    publishedAt: number(),
    ...repositoryInventoryPublicCounts,
  }),
  object({
    state: literal("failed"),
    failedAt: number(),
    message: string(),
    activeGeneration: optional(number()),
    repositoryFullName: optional(string()),
    publishedAt: optional(number()),
    ...repositoryInventoryPublicCounts,
  }),
);
export type RepositoryInventoryPublicState = Infer<typeof vRepositoryInventoryPublicState>;

const repositoryInventoryBranchContextFields = {
  repositoryFullName: string(),
  defaultBranch: string(),
};

export const vRepositoryInventoryBranchContext = union(
  object({
    state: literal("unpublished"),
  }),
  object({
    state: literal("missing"),
    ...repositoryInventoryBranchContextFields,
  }),
  object({
    state: literal("ready"),
    ...repositoryInventoryBranchContextFields,
    branch: object({
      name: string(),
      headCommitSha: string(),
      isDefault: boolean(),
      headCommit: vRepositoryInventoryCommit,
    }),
    pullRequest: optional(
      object({
        number: number(),
        url: string(),
        isDraft: boolean(),
        baseRefName: string(),
      }),
    ),
  }),
);
export type RepositoryInventoryBranchContext = Infer<typeof vRepositoryInventoryBranchContext>;

export const vRepositoryInventoryRefreshRequestResult = union(
  object({ kind: literal("scheduled") }),
  object({ kind: literal("running") }),
);
export type RepositoryInventoryRefreshRequestResult = Infer<
  typeof vRepositoryInventoryRefreshRequestResult
>;

export const REPOSITORY_INVENTORY_STAGE_ITEM_BATCH_SIZE = 25;
export const REPOSITORY_INVENTORY_LABEL_CHUNK_SIZE = 100;
export const REPOSITORY_INVENTORY_MAX_LABELS_PER_PULL_REQUEST = 5_000;
export const REPOSITORY_INVENTORY_STAGE_LABEL_CHUNK_BATCH_SIZE = 25;
export const REPOSITORY_INVENTORY_MIN_REFRESH_INTERVAL_MS = 60_000;
export const REPOSITORY_INVENTORY_REFRESH_LEASE_MS = 2 * 60_000;

export function repositoryInventoryBranchRowKey(name: string): string {
  return `branch:${name}`;
}

export function repositoryInventoryBranchLookupKey(name: string): string {
  return repositoryInventoryBranchRowKey(name);
}

export function repositoryInventoryPullRequestRowKey(nodeId: string): string {
  return `pull-request:${nodeId}`;
}

export function repositoryInventoryPullRequestBranchLookupKey(headRefName: string): string {
  return `pull-request-head:${headRefName}`;
}
