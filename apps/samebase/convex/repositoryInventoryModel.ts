import { paginationResultValidator } from "convex/server";
import { Infer, v } from "convex/values";

const { array, boolean, id, literal, null: vNull, number, object, optional, string, union } = v;

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
});
export type RepositoryInventoryCheckSummary = Infer<typeof vRepositoryInventoryCheckSummary>;

export const vRepositoryInventoryCommit = object({
  sha: string(),
  title: optional(string()),
  authoredAt: optional(number()),
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

const repositoryInventoryPublicItemFields = {
  rowKey: string(),
  previewUrl: optional(string()),
  headCommit: vRepositoryInventoryCommit,
};

const repositoryInventoryBranchFields = {
  ...repositoryInventoryPublicItemFields,
  name: string(),
  isDefault: boolean(),
};

export const vRepositoryInventoryBranchItem = object({
  kind: literal("branch"),
  ...repositoryInventoryBranchFields,
});
export type RepositoryInventoryBranchItem = Infer<typeof vRepositoryInventoryBranchItem>;

const repositoryInventoryPullRequestFields = {
  ...repositoryInventoryPublicItemFields,
  number: number(),
  url: string(),
  title: string(),
  isDraft: boolean(),
  baseRefName: string(),
  headRepositoryFullName: optional(string()),
  headRefName: string(),
  canOpenInSamebase: boolean(),
  labelCount: number(),
};

export const vRepositoryInventoryPullRequestItem = object({
  kind: literal("pull_request"),
  ...repositoryInventoryPullRequestFields,
});
export type RepositoryInventoryPullRequestItem = Infer<typeof vRepositoryInventoryPullRequestItem>;

export const vRepositoryInventoryItem = union(
  vRepositoryInventoryBranchItem,
  vRepositoryInventoryPullRequestItem,
);
export type RepositoryInventoryItem = Infer<typeof vRepositoryInventoryItem>;
export const vRepositoryInventoryItemPage = paginationResultValidator(vRepositoryInventoryItem);
export const vRepositoryInventoryPageResult = union(
  object({
    state: literal("unavailable"),
  }),
  object({
    state: literal("ready"),
    expectedItemCount: number(),
    page: vRepositoryInventoryItemPage.fields.page,
    isDone: boolean(),
    continueCursor: string(),
  }),
);
export type RepositoryInventoryPageResult = Infer<typeof vRepositoryInventoryPageResult>;

const repositoryInventoryStoredFields = {
  vaultId: id("vaults"),
  snapshotId: id("vaultRepositoryInventorySnapshots"),
  sortGroup: number(),
  sortTime: number(),
};

export const vCollectedRepositoryInventoryBranchItem = object({
  kind: literal("branch"),
  ...repositoryInventoryBranchFields,
  sortGroup: number(),
  sortTime: number(),
});
export type CollectedRepositoryInventoryBranchItem = Infer<
  typeof vCollectedRepositoryInventoryBranchItem
>;

export const vCollectedRepositoryInventoryPullRequestItem = object({
  kind: literal("pull_request"),
  ...repositoryInventoryPullRequestFields,
  labels: array(vRepositoryInventoryPullRequestLabel),
  sortGroup: number(),
  sortTime: number(),
  localHeadRefName: optional(string()),
});
export type CollectedRepositoryInventoryPullRequestItem = Infer<
  typeof vCollectedRepositoryInventoryPullRequestItem
>;

export const vCollectedRepositoryInventoryItem = union(
  vCollectedRepositoryInventoryBranchItem,
  vCollectedRepositoryInventoryPullRequestItem,
);
export type CollectedRepositoryInventoryItem = Infer<typeof vCollectedRepositoryInventoryItem>;

export const vStoredRepositoryInventoryBranchItem = object({
  kind: literal("branch"),
  ...repositoryInventoryBranchFields,
  ...repositoryInventoryStoredFields,
});
export type StoredRepositoryInventoryBranchItem = Infer<
  typeof vStoredRepositoryInventoryBranchItem
>;

export const vStoredRepositoryInventoryPullRequestItem = object({
  kind: literal("pull_request"),
  ...repositoryInventoryPullRequestFields,
  ...repositoryInventoryStoredFields,
  localHeadRefName: optional(string()),
  labelChunkCount: number(),
});
export type StoredRepositoryInventoryPullRequestItem = Infer<
  typeof vStoredRepositoryInventoryPullRequestItem
>;

export const vStoredRepositoryInventoryItem = union(
  vStoredRepositoryInventoryBranchItem,
  vStoredRepositoryInventoryPullRequestItem,
);
export type StoredRepositoryInventoryItem = Infer<typeof vStoredRepositoryInventoryItem>;

export const vRepositoryInventoryLabelChunk = object({
  vaultId: id("vaults"),
  snapshotId: id("vaultRepositoryInventorySnapshots"),
  rowKey: string(),
  chunkIndex: number(),
  labels: array(vRepositoryInventoryPullRequestLabel),
});
export type RepositoryInventoryLabelChunk = Infer<typeof vRepositoryInventoryLabelChunk>;

const vRepositoryInventoryPublicLabelChunk = object({
  chunkIndex: number(),
  labels: array(vRepositoryInventoryPullRequestLabel),
});
const vRepositoryInventoryPublicLabelChunkPage = paginationResultValidator(
  vRepositoryInventoryPublicLabelChunk,
);
export const vRepositoryInventoryLabelPageResult = union(
  object({
    state: literal("unavailable"),
  }),
  object({
    state: literal("ready"),
    expectedLabelCount: number(),
    expectedChunkCount: number(),
    page: vRepositoryInventoryPublicLabelChunkPage.fields.page,
    isDone: boolean(),
    continueCursor: string(),
  }),
);
export type RepositoryInventoryLabelPageResult = Infer<typeof vRepositoryInventoryLabelPageResult>;

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

export const vRepositoryInventoryLifecycle = union(
  object({
    state: literal("idle"),
  }),
  object({
    state: literal("scheduled"),
    snapshotId: id("vaultRepositoryInventorySnapshots"),
    targetWriteVersion: number(),
    required: boolean(),
    scheduledAt: number(),
    workpoolJobId: string(),
    wait: vRepositoryInventoryScheduledWait,
  }),
  object({
    state: literal("running"),
    snapshotId: id("vaultRepositoryInventorySnapshots"),
    targetWriteVersion: number(),
    required: boolean(),
    startedAt: number(),
    workpoolJobId: string(),
  }),
  object({
    state: literal("failed"),
    failedAt: number(),
    message: string(),
  }),
);
export type RepositoryInventoryLifecycle = Infer<typeof vRepositoryInventoryLifecycle>;

export const vRepositoryInventoryPublication = object({
  snapshotId: id("vaultRepositoryInventorySnapshots"),
  repositoryNodeId: string(),
  repositoryFullName: string(),
  defaultBranch: union(string(), vNull()),
  publishedAt: number(),
  checkedAt: number(),
  fingerprint: string(),
});
export type RepositoryInventoryPublication = Infer<typeof vRepositoryInventoryPublication>;

export const vRepositoryInventoryState = object({
  userId: id("users"),
  vaultId: id("vaults"),
  wantedUntil: number(),
  writeVersion: number(),
  lifecycle: vRepositoryInventoryLifecycle,
  publication: optional(vRepositoryInventoryPublication),
  lastStartedAt: optional(number()),
  estimatedCrawlCost: optional(number()),
});

export const vRepositoryInventorySnapshot = object({
  vaultId: id("vaults"),
  branchCount: number(),
  pullRequestCount: number(),
  labelCount: number(),
  labelChunkCount: number(),
});

const repositoryInventoryPublicPublicationFields = {
  activeSnapshotId: optional(id("vaultRepositoryInventorySnapshots")),
  repositoryFullName: optional(string()),
  defaultBranch: optional(union(string(), vNull())),
  publishedAt: optional(number()),
  checkedAt: optional(number()),
};

export const vRepositoryInventoryPublicState = union(
  object({
    state: literal("empty"),
  }),
  object({
    state: literal("refreshing"),
    startedAt: number(),
    ...repositoryInventoryPublicPublicationFields,
  }),
  object({
    state: literal("waiting"),
    reason: union(literal("queue"), literal("rate_limit")),
    retryAt: number(),
    ...repositoryInventoryPublicPublicationFields,
  }),
  object({
    state: literal("ready"),
    activeSnapshotId: id("vaultRepositoryInventorySnapshots"),
    repositoryFullName: string(),
    defaultBranch: union(string(), vNull()),
    publishedAt: number(),
    checkedAt: number(),
  }),
  object({
    state: literal("failed"),
    failedAt: number(),
    message: string(),
    ...repositoryInventoryPublicPublicationFields,
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
export const REPOSITORY_INVENTORY_STAGE_LABEL_CHUNK_BATCH_SIZE = 25;
export const REPOSITORY_INVENTORY_MIN_REFRESH_INTERVAL_MS = 60_000;
export const REPOSITORY_INVENTORY_DEMAND_TTL_MS = 135_000;

export function repositoryInventoryBranchRowKey(name: string): string {
  return `branch:${name}`;
}

export function repositoryInventoryPullRequestRowKey(nodeId: string): string {
  return `pull-request:${nodeId}`;
}
