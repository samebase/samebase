import { Infer, v } from "convex/values";

const { id, literal, number, object, string, union } = v;

// MARK: Demand Sources and Scheduler Priority
// These are caller-visible reasons for freshness, not exact worker steps.
// The frontend reports demand; backend policy later decides depth, provider
// parsing, cooldown, fan-out, and Workpool scheduling.

/**
 * Browser demand trigger.
 *
 * page_load = the route/surface opened.
 *
 * visibility = the browser document became visible again after being hidden or
 * backgrounded. It is about the browser tab, not repository visibility.
 */
export const vRepositoryRefreshBrowserTrigger = union(
  literal("page_load"),
  literal("visibility"),
);
export type RepositoryRefreshBrowserTrigger = Infer<
  typeof vRepositoryRefreshBrowserTrigger
>;

/**
 * Dashboard status button.
 *
 * The click says "make this vault/branch fresh". It does not say whether to
 * fetch pull requests, ahead/behind counts, provider comments, or branch trees.
 */
export const vRepositoryRefreshManualTrigger = literal(
  "dashboard_status_click",
);
export type RepositoryRefreshManualTrigger = Infer<
  typeof vRepositoryRefreshManualTrigger
>;

/**
 * Backend scheduling lane derived from demand source.
 *
 * background = passive dashboard freshness, safe to delay behind visible work.
 *
 * normal = branch freshness for a file route the user is reading.
 *
 * manual = explicit refresh click.
 *
 * system = backend correctness after create/connect/commit/pull; used when
 * stale refresh state would contradict a completed operation.
 */
export const vRepositoryRefreshPriority = union(
  literal("background"),
  literal("normal"),
  literal("manual"),
  literal("system"),
);
export type RepositoryRefreshPriority = Infer<
  typeof vRepositoryRefreshPriority
>;

// MARK: Refresh Demand
// Demand answers "what user-visible freshness is needed?"
// It intentionally does not answer "which provider calls should run?"
// Backend execution policy may turn one demand into metadata, PR, branch-tree,
// and provider-link steps in later phases.

/**
 * Dashboard asks for vault-level freshness.
 *
 * Example: dashboard opens after repository setup. The demand is repository
 * freshness; the backend decides whether branch discovery, PR metadata, or
 * provider-link parsing should run.
 */
export const vDashboardRepositoryRefreshDemand = object({
  scope: literal("repository"),
  source: literal("dashboard"),
  trigger: vRepositoryRefreshBrowserTrigger,
});
export type DashboardRepositoryRefreshDemand = Infer<
  typeof vDashboardRepositoryRefreshDemand
>;

/**
 * Manual vault-level refresh.
 *
 * Example: user clicks the dashboard refresh control without targeting one
 * branch. The backend may choose deeper work than passive dashboard demand, but
 * that depth is not caller state.
 */
export const vManualRepositoryRefreshDemand = object({
  scope: literal("repository"),
  source: literal("manual"),
  trigger: vRepositoryRefreshManualTrigger,
});
export type ManualRepositoryRefreshDemand = Infer<
  typeof vManualRepositoryRefreshDemand
>;

/**
 * GitHub repo create/connect flow finished.
 *
 * This is the branch-discovery demand created by backend setup completion.
 * Connecting an existing repo should make branches appear without requiring a
 * browser reload. runId points at the provisioning run for audit/debugging.
 */
export const vSourceSetupRepositoryRefreshDemand = object({
  scope: literal("repository"),
  source: literal("source_setup"),
  runId: id("appProvisioningRuns"),
  mode: union(
    literal("create_repository"),
    literal("connect_existing_repository"),
  ),
});
export type SourceSetupRepositoryRefreshDemand = Infer<
  typeof vSourceSetupRepositoryRefreshDemand
>;

/**
 * File route asks for freshness for the branch it is showing.
 *
 * Example: opening a file on main creates branch demand for main. It does not
 * choose tree-only work; the backend decides which branch-scoped steps to run.
 */
export const vFileViewBranchRefreshDemand = object({
  scope: literal("branch"),
  branch: string(),
  source: literal("file_view"),
  trigger: vRepositoryRefreshBrowserTrigger,
});
export type FileViewBranchRefreshDemand = Infer<
  typeof vFileViewBranchRefreshDemand
>;

/**
 * Manual branch-level refresh.
 *
 * Example: user clicks refresh for branch "main". The demand is branch
 * freshness, not "tree refresh" or "provider link refresh".
 */
export const vManualBranchRefreshDemand = object({
  scope: literal("branch"),
  branch: string(),
  source: literal("manual"),
  trigger: vRepositoryRefreshManualTrigger,
});
export type ManualBranchRefreshDemand = Infer<
  typeof vManualBranchRefreshDemand
>;

/**
 * Local commit finished for one branch.
 *
 * The branch changed locally, so persisted branch-visible state should catch up.
 */
export const vCommitBranchRefreshDemand = object({
  scope: literal("branch"),
  branch: string(),
  source: literal("commit"),
});
export type CommitBranchRefreshDemand = Infer<
  typeof vCommitBranchRefreshDemand
>;

/**
 * Local pull finished for one branch.
 *
 * Provider state moved under the local checkout, so persisted branch-visible
 * state should catch up.
 */
export const vPullBranchRefreshDemand = object({
  scope: literal("branch"),
  branch: string(),
  source: literal("pull"),
});
export type PullBranchRefreshDemand = Infer<typeof vPullBranchRefreshDemand>;

/**
 * Repository-level freshness demand.
 *
 * No branch field exists here. Source setup belongs here because setup should
 * first discover repository/branch metadata before any branch-specific work.
 */
export const vRepositoryScopeRefreshDemand = union(
  vDashboardRepositoryRefreshDemand,
  vManualRepositoryRefreshDemand,
  vSourceSetupRepositoryRefreshDemand,
);
export type RepositoryScopeRefreshDemand = Infer<
  typeof vRepositoryScopeRefreshDemand
>;

/**
 * Branch-level freshness demand.
 *
 * Branch is required by schema. Dashboard passive refresh is intentionally not a
 * branch demand so a dashboard visit cannot fan out one request per branch.
 */
export const vBranchScopeRefreshDemand = union(
  vFileViewBranchRefreshDemand,
  vManualBranchRefreshDemand,
  vCommitBranchRefreshDemand,
  vPullBranchRefreshDemand,
);
export type BranchScopeRefreshDemand = Infer<typeof vBranchScopeRefreshDemand>;

/**
 * All durable refresh demand accepted by the queue.
 *
 * This is the persisted contract between refresh entry points and backend
 * scheduling. Exact work such as PR metadata, ahead/behind counts, branch tree
 * reads, and provider comment parsing is backend execution policy, not request
 * state.
 */
export const vRepositoryRefreshDemand = union(
  vRepositoryScopeRefreshDemand,
  vBranchScopeRefreshDemand,
);
export type RepositoryRefreshDemand = Infer<typeof vRepositoryRefreshDemand>;

// MARK: Refresh Lifecycle
// Lifecycle is the durable execution state stored on each request row.
// The union keeps state-specific fields out of impossible states: queued has no
// workpool job, running has no result, succeeded has no failure, and canceled
// has no worker result.

/**
 * Successful worker outcome.
 *
 * no_work_needed means the worker checked state and skipped writes; refreshed
 * records when backend refresh state actually changed.
 */
export const vRepositoryRefreshResult = union(
  object({
    kind: literal("no_work_needed"),
  }),
  object({
    kind: literal("refreshed"),
    refreshedAt: number(),
  }),
);
export type RepositoryRefreshResult = Infer<typeof vRepositoryRefreshResult>;

/**
 * Failed worker outcome with scheduling hints.
 *
 * rate_limited tells the scheduler when the provider may be retried.
 * provider_error cools this lane after a non-rate-limit provider failure.
 */
export const vRepositoryRefreshFailure = union(
  object({
    kind: literal("rate_limited"),
    retryAfter: number(),
    message: string(),
  }),
  object({
    kind: literal("provider_error"),
    cooldownUntil: number(),
    message: string(),
  }),
);
export type RepositoryRefreshFailure = Infer<typeof vRepositoryRefreshFailure>;

/**
 * Request stopped before normal success/failure.
 *
 * superseded means a newer deduped row replaced this row; vault_deleting and
 * vault_deleted prevent work from running against a vault that is going away or
 * gone.
 */
export const vRepositoryRefreshCancelReason = union(
  literal("superseded"),
  literal("vault_deleting"),
  literal("vault_deleted"),
);
export type RepositoryRefreshCancelReason = Infer<
  typeof vRepositoryRefreshCancelReason
>;

/**
 * Durable execution state.
 *
 * queued has notBefore and no workpool job. running has attempt + workpoolJobId
 * and may become succeeded, failed, or canceled. Terminal variants carry only
 * the fields meaningful for that terminal state.
 */
export const vRepositoryRefreshLifecycle = union(
  object({
    state: literal("queued"),
    notBefore: number(),
    queuedAt: number(),
  }),
  object({
    state: literal("running"),
    attempt: number(),
    startedAt: number(),
    workpoolJobId: string(),
  }),
  object({
    state: literal("succeeded"),
    attempt: number(),
    startedAt: number(),
    completedAt: number(),
    result: vRepositoryRefreshResult,
  }),
  object({
    state: literal("failed"),
    attempt: number(),
    startedAt: number(),
    failedAt: number(),
    failure: vRepositoryRefreshFailure,
  }),
  object({
    state: literal("canceled"),
    canceledAt: number(),
    reason: vRepositoryRefreshCancelReason,
  }),
);
export type RepositoryRefreshLifecycle = Infer<
  typeof vRepositoryRefreshLifecycle
>;

// MARK: Request Rows
// Request rows combine ownership, demand, dedupe, and lifecycle.
// There is no persisted exact-work field. Later workers can expand demand into
// internal execution steps without widening the caller-facing state space.

/**
 * Persisted repositoryRefreshRequests row.
 *
 * The demand union forbids impossible states, such as dashboard branch fan-out
 * or source_setup without the provisioning run id.
 */
export const vRepositoryRefreshRequest = object({
  userId: id("users"),
  vaultId: id("vaults"),
  dedupeKey: string(),
  demand: vRepositoryRefreshDemand,
  lifecycle: vRepositoryRefreshLifecycle,
  createdAt: number(),
  updatedAt: number(),
});
export type RepositoryRefreshRequest = Infer<typeof vRepositoryRefreshRequest>;

// MARK: Enqueue Results
// Enqueue results describe what happened to durable demand. They intentionally
// do not expose execution details because Phase 2 only records demand; workers
// start in later phases.

/**
 * Result returned by demand-ingest mutations.
 *
 * created = a new queued row now represents this demand.
 *
 * updated = an existing queued row was upgraded to stronger demand, such as a
 * dashboard row becoming a manual row.
 *
 * already_queued = an equal or weaker duplicate was coalesced without writing.
 *
 * already_running = Workpool or a future worker already owns this demand.
 *
 * blocked = the vault is deleting or deletion failed, so no row is created.
 */
export const vEnqueueRepositoryRefreshResult = union(
  object({
    kind: literal("created"),
    requestId: id("repositoryRefreshRequests"),
  }),
  object({
    kind: literal("updated"),
    requestId: id("repositoryRefreshRequests"),
  }),
  object({
    kind: literal("already_queued"),
    requestId: id("repositoryRefreshRequests"),
  }),
  object({
    kind: literal("already_running"),
    requestId: id("repositoryRefreshRequests"),
  }),
  object({
    kind: literal("blocked"),
    reason: literal("vault_deleting"),
  }),
);
export type EnqueueRepositoryRefreshResult = Infer<
  typeof vEnqueueRepositoryRefreshResult
>;

// MARK: Builder Inputs
// Builder input is the backend request constructor, not a frontend contract.
// Frontend/backend entry points provide demand. The builder derives dedupeKey
// and creates an immediately claimable queued lifecycle for Phase 1.

/**
 * Public builder input.
 *
 * Callers provide only the ownership, time, and freshness demand. They cannot
 * provide priority, dedupeKey, provider parser, metadata depth, or exact work.
 */
export type MakeRepositoryRefreshRequestArgs = {
  userId: RepositoryRefreshRequest["userId"];
  vaultId: RepositoryRefreshRequest["vaultId"];
  now: number;
  demand: RepositoryRefreshDemand;
};

// MARK: Scheduling
// Scheduling helpers turn domain state into queue mechanics.
// Priority maps demand source to a backend lane without being duplicated into
// the row. dedupeKey collapses repeated demand for the same user/vault/scope.

export function getRepositoryRefreshPriority(
  demand: RepositoryRefreshDemand,
): RepositoryRefreshPriority {
  switch (demand.source) {
    case "dashboard":
      return "background";
    case "manual":
      return "manual";
    case "source_setup":
      return "system";
    case "file_view":
      return "normal";
    case "commit":
    case "pull":
      return "system";
    default: {
      demand satisfies never;
      return "normal";
    }
  }
}

function getRepositoryRefreshPriorityRank(
  priority: RepositoryRefreshPriority,
): number {
  switch (priority) {
    case "background":
      return 0;
    case "normal":
      return 1;
    case "manual":
      return 2;
    case "system":
      return 3;
    default: {
      priority satisfies never;
      return 0;
    }
  }
}

export function isRepositoryRefreshPriorityStronger(args: {
  incoming: RepositoryRefreshPriority;
  existing: RepositoryRefreshPriority;
}): boolean {
  return (
    getRepositoryRefreshPriorityRank(args.incoming) >
    getRepositoryRefreshPriorityRank(args.existing)
  );
}

export function deriveRepositoryRefreshDedupeKey(args: {
  userId: RepositoryRefreshRequest["userId"];
  vaultId: RepositoryRefreshRequest["vaultId"];
  demand: RepositoryRefreshDemand;
}): string {
  const prefix = `user:${args.userId}:vault:${args.vaultId}`;
  switch (args.demand.scope) {
    case "repository":
      return `${prefix}:repository`;
    case "branch":
      return `${prefix}:branch:${args.demand.branch}`;
    default: {
      args.demand satisfies never;
      return prefix;
    }
  }
}

// MARK: Builders
// Builders create valid queued rows only.
// They do not choose provider calls, start Workpool jobs, or mutate existing
// rows. Later phases can insert/upsert the returned row.

export function makeRepositoryRefreshRequest(
  args: MakeRepositoryRefreshRequestArgs,
): RepositoryRefreshRequest {
  return {
    userId: args.userId,
    vaultId: args.vaultId,
    dedupeKey: deriveRepositoryRefreshDedupeKey(args),
    demand: args.demand,
    lifecycle: {
      state: "queued",
      notBefore: args.now,
      queuedAt: args.now,
    },
    createdAt: args.now,
    updatedAt: args.now,
  };
}

export function upgradeQueuedRepositoryRefreshRequest(
  request: RepositoryRefreshRequest,
  args: {
    now: number;
    demand: RepositoryRefreshDemand;
  },
): RepositoryRefreshRequest {
  if (request.lifecycle.state !== "queued") {
    throw new Error("Only queued repository refresh requests can be upgraded.");
  }
  return {
    ...request,
    demand: args.demand,
    lifecycle: {
      state: "queued",
      notBefore: args.now,
      queuedAt: request.lifecycle.queuedAt,
    },
    updatedAt: args.now,
  };
}

// MARK: Lifecycle Transitions
// Lifecycle transitions are pure state moves used by future queue mutations.
// Each transition checks the current state before returning the next row shape,
// which keeps invalid moves such as succeeded -> failed out of callers.

function assertPositiveAttempt(attempt: number): void {
  if (attempt < 1) {
    throw new Error("Repository refresh attempt must be positive.");
  }
}

export function markRepositoryRefreshRequestRunning(
  request: RepositoryRefreshRequest,
  args: {
    now: number;
    attempt: number;
    workpoolJobId: string;
  },
): RepositoryRefreshRequest {
  if (request.lifecycle.state !== "queued") {
    throw new Error("Only queued repository refresh requests can start.");
  }
  assertPositiveAttempt(args.attempt);
  return {
    ...request,
    lifecycle: {
      state: "running",
      attempt: args.attempt,
      startedAt: args.now,
      workpoolJobId: args.workpoolJobId,
    },
    updatedAt: args.now,
  };
}

export function markRepositoryRefreshRequestSucceeded(
  request: RepositoryRefreshRequest,
  args: {
    now: number;
    result: RepositoryRefreshResult;
  },
): RepositoryRefreshRequest {
  if (request.lifecycle.state !== "running") {
    throw new Error("Only running repository refresh requests can succeed.");
  }
  return {
    ...request,
    lifecycle: {
      state: "succeeded",
      attempt: request.lifecycle.attempt,
      startedAt: request.lifecycle.startedAt,
      completedAt: args.now,
      result: args.result,
    },
    updatedAt: args.now,
  };
}

export function markRepositoryRefreshRequestFailed(
  request: RepositoryRefreshRequest,
  args: {
    now: number;
    failure: RepositoryRefreshFailure;
  },
): RepositoryRefreshRequest {
  if (request.lifecycle.state !== "running") {
    throw new Error("Only running repository refresh requests can fail.");
  }
  return {
    ...request,
    lifecycle: {
      state: "failed",
      attempt: request.lifecycle.attempt,
      startedAt: request.lifecycle.startedAt,
      failedAt: args.now,
      failure: args.failure,
    },
    updatedAt: args.now,
  };
}

export function markRepositoryRefreshRequestCanceled(
  request: RepositoryRefreshRequest,
  args: {
    now: number;
    reason: RepositoryRefreshCancelReason;
  },
): RepositoryRefreshRequest {
  switch (request.lifecycle.state) {
    case "queued":
    case "running":
      return {
        ...request,
        lifecycle: {
          state: "canceled",
          canceledAt: args.now,
          reason: args.reason,
        },
        updatedAt: args.now,
      };
    case "succeeded":
    case "failed":
    case "canceled":
      throw new Error(
        "Only queued or running repository refresh requests can be canceled.",
      );
    default: {
      request.lifecycle satisfies never;
      throw new Error("Unsupported repository refresh lifecycle state.");
    }
  }
}
