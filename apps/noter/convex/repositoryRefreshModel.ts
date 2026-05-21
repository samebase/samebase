import { Infer, v } from "convex/values";

const { id, literal, number, object, string, union } = v;

// MARK: Demand Sources and Scheduler Priority
// These are caller-visible reasons for freshness, not exact worker steps.
// The frontend reports demand; backend policy decides depth, provider parsing,
// cooldown, fan-out, and Workpool scheduling.

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
/**
 * Scheduler lane derived from demand source by `getRepositoryRefreshPriority`.
 * It is intentionally not persisted on request rows.
 */
export type RepositoryRefreshPriority = Infer<typeof vRepositoryRefreshPriority>;

// MARK: Refresh Demand
// Demand answers "what user-visible freshness is needed?"
// It intentionally does not answer "which provider calls should run?"
// Backend execution policy may turn one demand into metadata, PR, branch-tree,
// and provider-link steps without widening request state.

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
});
/**
 * Repository demand created by passive dashboard activation.
 * Route load, visibility resume, and window focus all collapse before Convex.
 */
export type DashboardRepositoryRefreshDemand = Infer<typeof vDashboardRepositoryRefreshDemand>;

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
});
/**
 * Repository demand created by an explicit dashboard refresh action.
 * It upgrades passive dashboard demand because the user requested it directly.
 */
export type ManualRepositoryRefreshDemand = Infer<typeof vManualRepositoryRefreshDemand>;

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
});
/**
 * Repository demand created by backend setup completion.
 * The run id is audit context, not caller-selected refresh depth.
 */
export type SourceSetupRepositoryRefreshDemand = Infer<typeof vSourceSetupRepositoryRefreshDemand>;

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
});
/**
 * Branch demand created by file-route activation.
 * The branch is required because file freshness is branch-specific.
 */
export type FileViewBranchRefreshDemand = Infer<typeof vFileViewBranchRefreshDemand>;

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
});
/**
 * Branch demand created by a direct branch refresh click.
 * It is separate from repository manual demand so dedupe includes the branch.
 */
export type ManualBranchRefreshDemand = Infer<typeof vManualBranchRefreshDemand>;

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
/**
 * Branch demand created after a local commit changes one branch.
 */
export type CommitBranchRefreshDemand = Infer<typeof vCommitBranchRefreshDemand>;

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
/**
 * Branch demand created after a pull updates one local checkout branch.
 */
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
/**
 * All demand whose dedupe key is the whole repository.
 * These states cannot carry `branch`.
 */
export type RepositoryScopeRefreshDemand = Infer<typeof vRepositoryScopeRefreshDemand>;

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
/**
 * All demand whose dedupe key includes one branch name.
 * These states always carry `branch`.
 */
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
/**
 * Caller-facing freshness demand persisted on `repositoryRefreshRequests`.
 * Backend workers expand this into provider/API steps during execution.
 */
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
  }),
);
/**
 * Terminal success payload for completed worker work.
 */
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
/**
 * Terminal failure payload plus the retry/cooldown hint the scheduler needs.
 */
export type RepositoryRefreshFailure = Infer<typeof vRepositoryRefreshFailure>;

/**
 * Request stopped before normal success/failure.
 *
 * superseded = a newer deduped row replaced this row.
 *
 * worker_canceled = the worker infrastructure canceled pending/running work.
 *
 * vault_deleting/vault_deleted = worker started after the vault became unsafe
 * to refresh.
 */
export const vRepositoryRefreshCancelReason = union(
  literal("superseded"),
  literal("worker_canceled"),
  literal("vault_deleting"),
  literal("vault_deleted"),
);
/**
 * Why a queued or running request stopped without success/failure.
 */
export type RepositoryRefreshCancelReason = Infer<typeof vRepositoryRefreshCancelReason>;

/**
 * Durable execution state.
 *
 * queued = durable demand exists, but no Workpool job exists yet.
 *
 * scheduled = Workpool has a job id, but worker code has not started; no lease
 * exists yet, so this state cannot pretend refresh compute is running.
 *
 * running = worker code started and owns a lease. If the lease expires before
 * success/failure, the next backend demand can fail the stale owner and enqueue
 * fresh work.
 *
 * terminal variants carry only the fields meaningful for that terminal state.
 */
export const vRepositoryRefreshLifecycle = union(
  object({
    state: literal("queued"),
    notBefore: number(),
    queuedAt: number(),
  }),
  object({
    state: literal("scheduled"),
    notBefore: number(),
    queuedAt: number(),
    scheduledAt: number(),
    workpoolJobId: string(),
  }),
  object({
    state: literal("running"),
    startedAt: number(),
    leaseExpiresAt: number(),
    workpoolJobId: string(),
  }),
  object({
    state: literal("succeeded"),
    startedAt: number(),
    completedAt: number(),
    result: vRepositoryRefreshResult,
  }),
  object({
    state: literal("failed"),
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
/**
 * Durable execution state for one refresh request row.
 * The union keeps worker-only fields out of queued/terminal states.
 */
export type RepositoryRefreshLifecycle = Infer<typeof vRepositoryRefreshLifecycle>;

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
/**
 * Full row shape stored in `repositoryRefreshRequests`.
 * Use constructors/transitions below instead of assembling this by hand.
 */
export type RepositoryRefreshRequest = Infer<typeof vRepositoryRefreshRequest>;

// MARK: Enqueue Results
// Enqueue results describe what happened to durable demand. They intentionally
// do not expose execution details: callers learn whether demand coalesced, not
// whether provider calls have finished.

/**
 * Result returned by demand-ingest mutations.
 *
 * created = a new queued row now represents this demand.
 *
 * updated = an existing queued row was upgraded to stronger demand, such as a
 * dashboard row becoming a manual row.
 *
 * already_queued = an equal or weaker duplicate was coalesced before Workpool
 * scheduling.
 *
 * already_scheduled = an equal or weaker duplicate was coalesced after a
 * Workpool job already exists, but before worker code starts.
 *
 * already_running = a worker already owns this demand.
 *
 * blocked = the vault is deleting/deleted or not connected, so no row is
 * created.
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
    kind: literal("already_scheduled"),
    requestId: id("repositoryRefreshRequests"),
  }),
  object({
    kind: literal("already_running"),
    requestId: id("repositoryRefreshRequests"),
  }),
  object({
    kind: literal("blocked"),
    reason: union(literal("vault_deleting"), literal("vault_not_connected")),
  }),
);
/**
 * Public result shape shared by all demand-ingest entry points.
 * This reports queue/coalescing outcome, not whether refresh work has run.
 */
export type EnqueueRepositoryRefreshResult = Infer<typeof vEnqueueRepositoryRefreshResult>;

// MARK: Builder Inputs
// Builder input is the backend request constructor, not a frontend contract.
// Frontend/backend entry points provide demand. The builder derives dedupeKey
// and creates an immediately claimable queued lifecycle.

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
// the row. dedupeKey collapses repeated demand for the same repository scope.

/**
 * Derives the scheduler lane from demand source.
 *
 * Examples:
 * - dashboard -> background
 * - file_view -> normal
 * - source_setup, commit, pull -> system
 */
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

function getRepositoryRefreshPriorityRank(priority: RepositoryRefreshPriority): number {
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

/**
 * Strict priority comparison used when a queued row already exists.
 * Equal priority does not rewrite the row; only stronger demand upgrades it.
 */
export function isRepositoryRefreshPriorityStronger(args: {
  incoming: RepositoryRefreshPriority;
  existing: RepositoryRefreshPriority;
}): boolean {
  return (
    getRepositoryRefreshPriorityRank(args.incoming) >
    getRepositoryRefreshPriorityRank(args.existing)
  );
}

/**
 * Builds the stable key used to find an active queued/running request.
 * Repository demand ignores source; branch demand includes the branch name.
 */
export function deriveRepositoryRefreshDedupeKey(demand: RepositoryRefreshDemand): string {
  switch (demand.scope) {
    case "repository":
      return "repository";
    case "branch":
      return `branch:${demand.branch}`;
    default: {
      demand satisfies never;
      return "repository";
    }
  }
}

// MARK: Builders
// Builders create valid queued rows only.
// They do not choose provider calls, start Workpool jobs, or mutate existing
// rows. Later phases can insert/upsert the returned row.

/**
 * Creates a new queued request row from caller demand.
 * `dedupeKey`, `lifecycle.notBefore`, and timestamps are derived here.
 */
export function makeRepositoryRefreshRequest(
  args: MakeRepositoryRefreshRequestArgs,
): RepositoryRefreshRequest {
  return {
    userId: args.userId,
    vaultId: args.vaultId,
    dedupeKey: deriveRepositoryRefreshDedupeKey(args.demand),
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

/**
 * Replaces a queued row's demand when a stronger request arrives.
 * Preserves `createdAt` and `queuedAt` so the row keeps its original age.
 */
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

/**
 * Replaces a scheduled row's demand when a stronger request arrives.
 * The existing Workpool job stays pending; when it starts, it reads this newer
 * demand from the row. No lease is created here because worker code has not
 * started yet.
 */
export function upgradeScheduledRepositoryRefreshRequest(
  request: RepositoryRefreshRequest,
  args: {
    now: number;
    demand: RepositoryRefreshDemand;
  },
): RepositoryRefreshRequest {
  if (request.lifecycle.state !== "scheduled") {
    throw new Error("Only scheduled repository refresh requests can be upgraded.");
  }
  return {
    ...request,
    demand: args.demand,
    lifecycle: {
      ...request.lifecycle,
      notBefore: args.now,
    },
    updatedAt: args.now,
  };
}

// MARK: Lifecycle Transitions
// Lifecycle transitions are pure state moves used by queue mutations.
// Each transition checks the current state before returning the next row shape,
// which keeps invalid moves such as succeeded -> failed out of callers.

/**
 * Records that a queued repository request now has a Workpool job.
 * No lease is stored here. A queued row can sit inside Workpool before worker
 * code starts, so marking it running at enqueue time would create fake compute
 * ownership.
 */
export function markRepositoryRefreshRequestScheduled(
  request: RepositoryRefreshRequest,
  args: {
    now: number;
    workpoolJobId: string;
  },
): RepositoryRefreshRequest {
  if (request.lifecycle.state !== "queued") {
    throw new Error("Only queued repository refresh requests can be scheduled.");
  }
  return {
    ...request,
    lifecycle: {
      state: "scheduled",
      notBefore: request.lifecycle.notBefore,
      queuedAt: request.lifecycle.queuedAt,
      scheduledAt: args.now,
      workpoolJobId: args.workpoolJobId,
    },
    updatedAt: args.now,
  };
}

/**
 * Moves a scheduled request into running state when worker code starts.
 * The Workpool job id is already known from `scheduled`; this transition adds
 * `startedAt` and `leaseExpiresAt`, the actual ownership timer.
 */
export function markRepositoryRefreshRequestRunning(
  request: RepositoryRefreshRequest,
  args: {
    now: number;
    leaseExpiresAt: number;
  },
): RepositoryRefreshRequest {
  if (request.lifecycle.state !== "scheduled") {
    throw new Error("Only scheduled repository refresh requests can start.");
  }
  return {
    ...request,
    lifecycle: {
      state: "running",
      startedAt: args.now,
      leaseExpiresAt: args.leaseExpiresAt,
      workpoolJobId: request.lifecycle.workpoolJobId,
    },
    updatedAt: args.now,
  };
}

/**
 * Marks a running request as completed successfully.
 * Preserves start time from the running lifecycle state.
 */
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
      startedAt: request.lifecycle.startedAt,
      completedAt: args.now,
      result: args.result,
    },
    updatedAt: args.now,
  };
}

/**
 * Marks scheduled/running work as failed with a retry/cooldown-aware payload.
 * Scheduled failure is possible when Workpool reports failure before our action
 * managed to claim a running lease; in that case start/fail share one timestamp
 * so the row cannot stay stuck as active demand forever.
 */
export function markRepositoryRefreshRequestFailed(
  request: RepositoryRefreshRequest,
  args: {
    now: number;
    failure: RepositoryRefreshFailure;
  },
): RepositoryRefreshRequest {
  if (request.lifecycle.state !== "scheduled" && request.lifecycle.state !== "running") {
    throw new Error("Only scheduled or running repository refresh requests can fail.");
  }
  const startedAt = request.lifecycle.state === "running" ? request.lifecycle.startedAt : args.now;
  return {
    ...request,
    lifecycle: {
      state: "failed",
      startedAt,
      failedAt: args.now,
      failure: args.failure,
    },
    updatedAt: args.now,
  };
}

/**
 * Cancels queued, scheduled, or running work before normal success/failure.
 * Terminal requests cannot be canceled again.
 */
export function markRepositoryRefreshRequestCanceled(
  request: RepositoryRefreshRequest,
  args: {
    now: number;
    reason: RepositoryRefreshCancelReason;
  },
): RepositoryRefreshRequest {
  switch (request.lifecycle.state) {
    case "queued":
    case "scheduled":
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
        "Only queued, scheduled, or running repository refresh requests can be canceled.",
      );
    default: {
      request.lifecycle satisfies never;
      throw new Error("Unsupported repository refresh lifecycle state.");
    }
  }
}
