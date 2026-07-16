import { Infer, v } from "convex/values";

const { array, id, literal, number, object, string, union } = v;

export const REPOSITORY_SUMMARY_PAGE_SIZE = 25;
export const REPOSITORY_SUMMARY_HARD_PAGE_SIZE = 50;
export const REPOSITORY_SUMMARY_REFRESH_INTERVAL_MS = 5 * 60_000;
export const REPOSITORY_SUMMARY_FAILURE_RETRY_MS = 60_000;
export const REPOSITORY_SUMMARY_UNAVAILABLE_RETRY_MS = 5 * 60_000;

export const vRepositorySummaryCheckState = union(
  literal("none"),
  literal("success"),
  literal("failure"),
  literal("running"),
);
export type RepositorySummaryCheckState = Infer<typeof vRepositorySummaryCheckState>;

export const vRepositorySummaryDefaultBranch = union(
  object({
    state: literal("ready"),
    name: string(),
    headSha: string(),
    checkState: vRepositorySummaryCheckState,
  }),
  object({
    state: literal("unavailable"),
    reason: literal("repository_has_no_default_branch"),
  }),
);
export type RepositorySummaryDefaultBranch = Infer<typeof vRepositorySummaryDefaultBranch>;

export const vRepositorySummaryCompletePublication = object({
  state: literal("complete"),
  defaultBranch: vRepositorySummaryDefaultBranch,
  openPullRequestCount: number(),
  publishedAt: number(),
  checkedAt: number(),
});
export type RepositorySummaryCompletePublication = Infer<
  typeof vRepositorySummaryCompletePublication
>;

export const vRepositorySummaryPublication = union(
  object({ state: literal("unobserved") }),
  vRepositorySummaryCompletePublication,
);
export type RepositorySummaryPublication = Infer<typeof vRepositorySummaryPublication>;

export const vRepositorySummaryScheduledWait = union(
  object({ kind: literal("immediate") }),
  object({
    kind: union(literal("queue"), literal("rate_limit")),
    retryAt: number(),
  }),
);
export type RepositorySummaryScheduledWait = Infer<typeof vRepositorySummaryScheduledWait>;

export const vRepositorySummaryLifecycle = union(
  object({ state: literal("idle") }),
  object({
    state: literal("scheduled"),
    source: literal("summary_batch"),
    batchId: string(),
    scheduledAt: number(),
    workpoolJobId: string(),
    wait: vRepositorySummaryScheduledWait,
  }),
  object({
    state: literal("scheduled"),
    source: literal("repository_inventory"),
    snapshotId: id("vaultRepositoryInventorySnapshots"),
    scheduledAt: number(),
    wait: vRepositorySummaryScheduledWait,
  }),
  object({
    state: literal("running"),
    source: literal("summary_batch"),
    batchId: string(),
    startedAt: number(),
    workpoolJobId: string(),
  }),
  object({
    state: literal("running"),
    source: literal("repository_inventory"),
    snapshotId: id("vaultRepositoryInventorySnapshots"),
    startedAt: number(),
  }),
  object({
    state: literal("failed"),
    failedAt: number(),
    message: string(),
  }),
  object({
    state: literal("unavailable"),
    observedAt: number(),
    reason: literal("repository_unavailable"),
  }),
);
export type RepositorySummaryLifecycle = Infer<typeof vRepositorySummaryLifecycle>;

export const vRepositorySummary = object({
  userId: id("users"),
  vaultId: id("vaults"),
  refreshEligibleAt: number(),
  lifecycle: vRepositorySummaryLifecycle,
  publication: vRepositorySummaryPublication,
});

export const vRepositorySummaryDirectoryState = object({
  userId: id("users"),
  revision: number(),
});

export const vRepositorySummaryPublicLifecycle = union(
  object({ state: literal("idle") }),
  object({ state: literal("updating") }),
  object({
    state: literal("waiting"),
    reason: literal("rate_limit"),
    retryAt: number(),
  }),
  object({
    state: literal("failed"),
    failedAt: number(),
    message: string(),
  }),
  object({
    state: literal("unavailable"),
    observedAt: number(),
    reason: literal("repository_unavailable"),
  }),
);

export const vRepositorySummaryPublicState = object({
  lifecycle: vRepositorySummaryPublicLifecycle,
  publication: vRepositorySummaryPublication,
});
export type RepositorySummaryPublicState = Infer<typeof vRepositorySummaryPublicState>;

export const vRepositorySummaryDirectoryEntry = object({
  vaultId: id("vaults"),
  repositoryFullName: string(),
  state: union(
    object({ state: literal("provisioning"), startedAt: number() }),
    object({ state: literal("setup_failed"), failedAt: number() }),
    object({ state: literal("deleting"), requestedAt: number() }),
    object({ state: literal("delete_failed"), failedAt: number() }),
    object({ state: literal("connected"), summary: vRepositorySummaryPublicState }),
  ),
});

export const vRepositorySummaryRefreshRequestResult = union(
  object({ state: literal("idle") }),
  object({
    state: literal("scheduled"),
    repositoryCount: number(),
  }),
);

export const vRepositorySummaryWorkerInput = union(
  object({ state: literal("cancel") }),
  object({
    state: literal("ready"),
    userId: id("users"),
    batchId: string(),
    repositories: array(
      object({
        vaultId: id("vaults"),
        repositoryNodeId: string(),
        expectedRepositoryDatabaseId: string(),
      }),
    ),
  }),
);
export type RepositorySummaryWorkerInput = Infer<typeof vRepositorySummaryWorkerInput>;

export const vRepositorySummaryObservationResult = union(
  object({
    state: literal("ready"),
    vaultId: id("vaults"),
    repositoryFullName: string(),
    defaultBranch: vRepositorySummaryDefaultBranch,
    openPullRequestCount: number(),
  }),
  object({
    state: literal("unavailable"),
    vaultId: id("vaults"),
  }),
);
export type RepositorySummaryObservationResult = Infer<typeof vRepositorySummaryObservationResult>;
