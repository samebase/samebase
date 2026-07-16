import { paginationResultValidator } from "convex/server";
import { Infer, v } from "convex/values";

import { vRepositorySummaryDefaultBranch } from "./repositorySummaryModel";

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

export const vRepositoryInventoryBranchComparison = union(
  object({
    state: literal("ready"),
    aheadBy: number(),
    behindBy: number(),
  }),
  object({
    state: literal("unavailable"),
    reason: union(literal("default_branch_unavailable"), literal("not_comparable")),
  }),
);
export type RepositoryInventoryBranchComparison = Infer<
  typeof vRepositoryInventoryBranchComparison
>;

export const vRepositoryInventoryPullRequestComparison = union(
  object({
    state: literal("ready"),
    aheadBy: number(),
    behindBy: number(),
  }),
  object({
    state: literal("unavailable"),
    reason: union(
      literal("base_ref_unavailable"),
      literal("head_ref_unavailable"),
      literal("not_comparable"),
    ),
  }),
);
export type RepositoryInventoryPullRequestComparison = Infer<
  typeof vRepositoryInventoryPullRequestComparison
>;

export const vRepositoryInventoryFilterState = object({
  includeDrafts: boolean(),
  includeNoLabel: boolean(),
  revision: number(),
  excludedLabelCount: number(),
});
export type RepositoryInventoryFilterState = Infer<typeof vRepositoryInventoryFilterState>;

export const vStoredRepositoryInventoryFilter = object({
  userId: id("users"),
  vaultId: id("vaults"),
  ...vRepositoryInventoryFilterState.fields,
  excludedLabelGeneration: number(),
});

export const vRepositoryInventoryExcludedLabel = object({
  vaultId: id("vaults"),
  filterId: id("vaultRepositoryInventoryFilters"),
  generation: number(),
  labelKey: string(),
  name: string(),
});

const vRepositoryInventoryPublicExcludedLabel = object({
  labelKey: string(),
  name: string(),
});
const vRepositoryInventoryPublicExcludedLabelPage = paginationResultValidator(
  vRepositoryInventoryPublicExcludedLabel,
);
export const vRepositoryInventoryExcludedLabelPageResult = union(
  vNull(),
  object({
    filterRevision: number(),
    expectedExcludedLabelCount: number(),
    page: vRepositoryInventoryPublicExcludedLabelPage.fields.page,
    isDone: boolean(),
    continueCursor: string(),
  }),
);

export const vRepositoryInventoryFilterChange = union(
  object({
    kind: literal("set_include_drafts"),
    included: boolean(),
  }),
  object({
    kind: literal("set_include_no_label"),
    included: boolean(),
  }),
  object({
    kind: literal("set_label_included"),
    name: string(),
    included: boolean(),
  }),
  object({ kind: literal("reset") }),
);

export const DEFAULT_REPOSITORY_INVENTORY_FILTER_STATE: RepositoryInventoryFilterState = {
  includeDrafts: false,
  includeNoLabel: true,
  revision: 0,
  excludedLabelCount: 0,
};

const repositoryInventoryPublicItemFields = {
  rowKey: string(),
  previewUrl: optional(string()),
  headCommit: vRepositoryInventoryCommit,
};

const repositoryInventoryBranchFields = {
  ...repositoryInventoryPublicItemFields,
  name: string(),
  isDefault: boolean(),
  comparison: vRepositoryInventoryBranchComparison,
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
  additions: number(),
  deletions: number(),
  changedFiles: number(),
  baseRefName: string(),
  isCrossRepository: boolean(),
  headRepositoryFullName: optional(string()),
  headRefName: string(),
  comparison: vRepositoryInventoryPullRequestComparison,
  canOpenInSamebase: boolean(),
  labelCount: number(),
};

export const vRepositoryInventoryPullRequestItem = object({
  kind: literal("pull_request"),
  ...repositoryInventoryPullRequestFields,
});
export type RepositoryInventoryPullRequestItem = Infer<typeof vRepositoryInventoryPullRequestItem>;

export const vRepositoryInventoryBranchPage = paginationResultValidator(
  vRepositoryInventoryBranchItem,
);
export const vRepositoryInventoryBranchPageResult = union(
  object({
    state: literal("unavailable"),
  }),
  object({
    state: literal("ready"),
    snapshotId: id("vaultRepositoryInventorySnapshots"),
    expectedBranchCount: number(),
    page: vRepositoryInventoryBranchPage.fields.page,
    isDone: boolean(),
    continueCursor: string(),
  }),
);
export type RepositoryInventoryBranchPageResult = Infer<
  typeof vRepositoryInventoryBranchPageResult
>;

export const vRepositoryInventoryPullRequestPage = paginationResultValidator(
  vRepositoryInventoryPullRequestItem,
);
export const vRepositoryInventoryPullRequestPageResult = union(
  object({
    state: literal("unavailable"),
  }),
  object({
    state: literal("ready"),
    snapshotId: id("vaultRepositoryInventorySnapshots"),
    viewId: id("vaultRepositoryInventoryFilterViews"),
    expectedVisiblePullRequestCount: number(),
    totalPullRequestCount: number(),
    page: vRepositoryInventoryPullRequestPage.fields.page,
    isDone: boolean(),
    continueCursor: string(),
  }),
);
export type RepositoryInventoryPullRequestPageResult = Infer<
  typeof vRepositoryInventoryPullRequestPageResult
>;

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

export const vRepositoryInventoryPullRequestLabelFacet = object({
  name: string(),
  color: optional(string()),
  pullRequestCount: number(),
});
export type RepositoryInventoryPullRequestLabelFacet = Infer<
  typeof vRepositoryInventoryPullRequestLabelFacet
>;

export const vStoredRepositoryInventoryPullRequestLabelFacet = object({
  vaultId: id("vaults"),
  snapshotId: id("vaultRepositoryInventorySnapshots"),
  labelKey: string(),
  sortKey: string(),
  ...vRepositoryInventoryPullRequestLabelFacet.fields,
});
export type StoredRepositoryInventoryPullRequestLabelFacet = Infer<
  typeof vStoredRepositoryInventoryPullRequestLabelFacet
>;

const repositoryInventoryFilterViewFields = {
  vaultId: id("vaults"),
  snapshotId: id("vaultRepositoryInventorySnapshots"),
  filterRevision: number(),
  totalPullRequestCount: number(),
  processedPullRequestCount: number(),
  visiblePullRequestCount: number(),
};

const vRepositoryInventoryFilterLabelCandidate = object({
  pullRequestItemId: id("vaultRepositoryInventoryItems"),
  rowKey: string(),
  sortTime: number(),
  nextLabelChunkIndex: number(),
  processedLabelCount: number(),
});
export type RepositoryInventoryFilterLabelCandidate = Infer<
  typeof vRepositoryInventoryFilterLabelCandidate
>;

export const vRepositoryInventoryFilterView = union(
  object({
    state: literal("building"),
    ...repositoryInventoryFilterViewFields,
    cursor: union(string(), vNull()),
    labelBatch: union(
      object({ state: literal("none") }),
      object({
        state: literal("pending"),
        continueCursor: string(),
        isDone: boolean(),
        candidates: array(vRepositoryInventoryFilterLabelCandidate),
      }),
    ),
  }),
  object({
    state: literal("complete"),
    ...repositoryInventoryFilterViewFields,
  }),
);

export const vRepositoryInventoryFilterViewRow = object({
  vaultId: id("vaults"),
  snapshotId: id("vaultRepositoryInventorySnapshots"),
  viewId: id("vaultRepositoryInventoryFilterViews"),
  pullRequestItemId: id("vaultRepositoryInventoryItems"),
  rowKey: string(),
  sortTime: number(),
});

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

const vRepositoryInventoryPullRequestLabelFacetPage = paginationResultValidator(
  vRepositoryInventoryPullRequestLabelFacet,
);
export const vRepositoryInventoryLabelFacetPageResult = union(
  object({
    state: literal("unavailable"),
  }),
  object({
    state: literal("ready"),
    snapshotId: id("vaultRepositoryInventorySnapshots"),
    expectedFacetCount: number(),
    noLabelPullRequestCount: number(),
    page: vRepositoryInventoryPullRequestLabelFacetPage.fields.page,
    isDone: boolean(),
    continueCursor: string(),
  }),
);
export type RepositoryInventoryLabelFacetPageResult = Infer<
  typeof vRepositoryInventoryLabelFacetPageResult
>;

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

export const REPOSITORY_INVENTORY_FAILURE_MESSAGE_MAX_LENGTH = 4_000;

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
    state: literal("materializing"),
    snapshotId: id("vaultRepositoryInventorySnapshots"),
    targetWriteVersion: number(),
    required: boolean(),
    startedAt: number(),
    workpoolJobId: string(),
  }),
  object({
    state: literal("failed"),
    required: boolean(),
    failedAt: number(),
    message: string(),
  }),
);
export type RepositoryInventoryLifecycle = Infer<typeof vRepositoryInventoryLifecycle>;

export const vRepositoryInventoryPublication = object({
  snapshotId: id("vaultRepositoryInventorySnapshots"),
  filterViewId: id("vaultRepositoryInventoryFilterViews"),
  filterRevision: number(),
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
  observedWriteVersion: number(),
  requiredFailureCount: number(),
  lifecycle: vRepositoryInventoryLifecycle,
  publication: optional(vRepositoryInventoryPublication),
  lastStartedAt: optional(number()),
  estimatedCrawlCost: optional(number()),
  lastCrawlRequestCount: optional(number()),
  lastCrawlDurationMs: optional(number()),
});

const repositoryInventorySnapshotFields = {
  vaultId: id("vaults"),
  branchCount: number(),
  pullRequestCount: number(),
  labelCount: number(),
  labelChunkCount: number(),
  labelFacetCount: number(),
  noLabelPullRequestCount: number(),
};

export const vRepositoryInventorySnapshot = union(
  object({
    state: literal("collecting"),
    ...repositoryInventorySnapshotFields,
  }),
  object({
    state: literal("ready"),
    ...repositoryInventorySnapshotFields,
    observedAt: number(),
    repositoryNodeId: string(),
    repositoryFullName: string(),
    defaultBranch: union(string(), vNull()),
    fingerprint: string(),
    crawlCost: number(),
    summaryDefaultBranch: vRepositorySummaryDefaultBranch,
  }),
);

const repositoryInventoryPublicPublicationFields = {
  activeSnapshotId: optional(id("vaultRepositoryInventorySnapshots")),
  activeFilterViewId: optional(id("vaultRepositoryInventoryFilterViews")),
  activeFilterRevision: optional(number()),
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
    activeFilterViewId: id("vaultRepositoryInventoryFilterViews"),
    activeFilterRevision: number(),
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
  object({ kind: literal("satisfied") }),
  object({ kind: literal("scheduled") }),
  object({ kind: literal("running") }),
  object({
    kind: literal("deferred"),
    retryAt: number(),
  }),
);
export type RepositoryInventoryRefreshRequestResult = Infer<
  typeof vRepositoryInventoryRefreshRequestResult
>;

export const REPOSITORY_INVENTORY_STAGE_ITEM_BATCH_SIZE = 25;
export const REPOSITORY_INVENTORY_LABEL_CHUNK_SIZE = 100;
export const REPOSITORY_INVENTORY_STAGE_LABEL_CHUNK_BATCH_SIZE = 25;
export const REPOSITORY_INVENTORY_STAGE_LABEL_FACET_BATCH_SIZE = 25;
export const REPOSITORY_INVENTORY_MIN_REFRESH_INTERVAL_MS = 60_000;
const REPOSITORY_INVENTORY_ORDINARY_POINTS_PER_MINUTE = 12;
export const REPOSITORY_INVENTORY_DEMAND_TTL_MS = 135_000;

export function repositoryInventoryMinimumRefreshIntervalMs(
  estimatedCrawlCost: number | undefined,
): number {
  return estimatedCrawlCost === undefined
    ? REPOSITORY_INVENTORY_MIN_REFRESH_INTERVAL_MS
    : Math.max(
        REPOSITORY_INVENTORY_MIN_REFRESH_INTERVAL_MS,
        Math.ceil((estimatedCrawlCost * 60_000) / REPOSITORY_INVENTORY_ORDINARY_POINTS_PER_MINUTE),
      );
}

export function repositoryInventoryBranchRowKey(name: string): string {
  return `branch:${name}`;
}

export function repositoryInventoryPullRequestRowKey(nodeId: string): string {
  return `pull-request:${nodeId}`;
}
