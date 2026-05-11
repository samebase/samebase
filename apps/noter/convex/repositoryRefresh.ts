import { getAuthUserId } from "@convex-dev/auth/server";
import { Workpool, vOnCompleteArgs } from "@convex-dev/workpool";
import { Infer, v } from "convex/values";

import { components, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  mutation,
  type MutationCtx,
} from "./_generated/server";
import { MAX_DASHBOARD_REFRESH_DEMAND_VAULTS } from "../shared/repositoryRefresh";
import { TREE_REFRESH_FAILURE_COOLDOWN_MS } from "../shared/treeRefresh";
import { toErrorMessage } from "./jsonUtils";
import {
  deriveRepositoryRefreshDedupeKey,
  getRepositoryRefreshPriority,
  isRepositoryRefreshPriorityStronger,
  makeRepositoryRefreshRequest,
  markRepositoryRefreshRequestCanceled,
  markRepositoryRefreshRequestFailed,
  markRepositoryRefreshRequestRunning,
  markRepositoryRefreshRequestScheduled,
  markRepositoryRefreshRequestSucceeded,
  upgradeScheduledRepositoryRefreshRequest,
  upgradeQueuedRepositoryRefreshRequest,
  vEnqueueRepositoryRefreshResult,
  vRepositoryRefreshCancelReason,
  vRepositoryRefreshBrowserTrigger,
  vRepositoryRefreshFailure,
  vRepositoryRefreshResult,
  vRepositoryScopeRefreshDemand,
  type EnqueueRepositoryRefreshResult,
  type RepositoryRefreshBrowserTrigger,
  type RepositoryRefreshCancelReason,
  type RepositoryRefreshDemand,
  type RepositoryRefreshFailure,
  type RepositoryRefreshResult,
  type RepositoryScopeRefreshDemand,
} from "./repositoryRefreshModel";

const { id, literal, null: vNull, object, string, union } = v;
/**
 * One repository refresh pool for this runner.
 *
 * The queue row still carries the demand source, so priority and later policy
 * can evolve without exposing multiple pools or pool choice to callers.
 */
const repositoryRefreshWorkpool = new Workpool(
  components.repositoryRefreshWorkpool,
  {
    maxParallelism: 3,
    retryActionsByDefault: false,
  },
);
const REPOSITORY_REFRESH_RUNNING_LEASE_MS = 15 * 60 * 1000;

type RepositoryRefreshWorkerTrigger =
  | RepositoryRefreshBrowserTrigger
  | "manual";

const repositoryRefreshWorkpoolContext = object({
  requestId: id("repositoryRefreshRequests"),
});

/**
 * Result of claiming a scheduled row immediately before provider work.
 *
 * ready = the row is still valid and the action may call GitHub.
 * cancel/fail = live vault state changed after scheduling; the action records a
 * terminal lifecycle instead of doing provider work.
 */
const repositoryRefreshWorkerInput = union(
  object({
    kind: literal("ready"),
    userId: id("users"),
    vaultId: id("vaults"),
    owner: string(),
    repo: string(),
    demand: vRepositoryScopeRefreshDemand,
  }),
  object({
    kind: literal("cancel"),
    reason: vRepositoryRefreshCancelReason,
  }),
  object({
    kind: literal("fail"),
    message: string(),
  }),
  object({
    kind: literal("no_work_needed"),
  }),
);

type RepositoryRefreshWorkerInput = Infer<typeof repositoryRefreshWorkerInput>;

/**
 * Source setup mode stored on demand rows.
 * This is derived from `appProvisioningRuns.trigger`, never accepted from a
 * caller, so setup retries cannot invent a different original setup mode.
 */
const vSourceSetupRepositoryRefreshMode = union(
  literal("create_repository"),
  literal("connect_existing_repository"),
);

type SourceSetupRepositoryRefreshMode = Infer<
  typeof vSourceSetupRepositoryRefreshMode
>;

type EnqueueRepositoryRefreshArgs = {
  userId: Id<"users">;
  vaultId: Id<"vaults">;
  demand: RepositoryRefreshDemand;
};

type ActiveRepositoryRefreshState = "queued" | "scheduled" | "running";

type DashboardRefreshVaultPage = {
  vaultIds: Id<"vaults">[];
  isDone: boolean;
  continueCursor: string | null;
};

function getRepositoryRefreshLeaseExpiresAt(now: number): number {
  return now + REPOSITORY_REFRESH_RUNNING_LEASE_MS;
}

function makeRepositoryRefreshProviderFailure(args: {
  now: number;
  message: string;
}): RepositoryRefreshFailure {
  return {
    kind: "provider_error",
    cooldownUntil: args.now + TREE_REFRESH_FAILURE_COOLDOWN_MS,
    message: args.message,
  };
}

/**
 * Maps durable repository demand onto the existing GitHub refresh trigger.
 * Source setup uses page_load semantics because setup completion needs the same
 * branch discovery/default-tree reconciliation as opening the dashboard.
 */
function getRepositoryRefreshWorkerTrigger(
  demand: RepositoryScopeRefreshDemand,
): RepositoryRefreshWorkerTrigger {
  switch (demand.source) {
    case "dashboard":
      return demand.trigger;
    case "manual":
      return "manual";
    case "source_setup":
      return "page_load";
    default: {
      demand satisfies never;
      return "page_load";
    }
  }
}

function toRepositoryRefreshResult(args: {
  refreshed: boolean;
}): RepositoryRefreshResult {
  if (!args.refreshed) {
    return { kind: "no_work_needed" };
  }

  return {
    kind: "refreshed",
    refreshedAt: Date.now(),
  };
}

function isRunningRepositoryRefreshLeaseValid(
  request: Doc<"repositoryRefreshRequests">,
  now: number,
): boolean {
  return (
    request.lifecycle.state === "running" &&
    typeof request.lifecycle.leaseExpiresAt === "number" &&
    request.lifecycle.leaseExpiresAt > now
  );
}

async function markExpiredRunningRepositoryRefreshRequestFailed(
  ctx: MutationCtx,
  request: Doc<"repositoryRefreshRequests">,
  now: number,
): Promise<void> {
  if (request.lifecycle.state !== "running") {
    return;
  }

  const failed = markRepositoryRefreshRequestFailed(request, {
    now,
    failure: makeRepositoryRefreshProviderFailure({
      now,
      message: "Repository refresh worker lease expired.",
    }),
  });
  await ctx.db.patch(request._id, {
    lifecycle: failed.lifecycle,
    updatedAt: failed.updatedAt,
  });
}

/**
 * Selects one internal page of vaults implied by a dashboard freshness signal.
 * Example: a page load from user A can enqueue user A's connected vaults only;
 * ids for user B are not accepted from the browser at all. The cursor is only
 * used between Convex functions so the browser never owns fan-out.
 */
async function selectDashboardRefreshVaultPage(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    cursor: string | null;
  },
): Promise<DashboardRefreshVaultPage> {
  const page = await ctx.db
    .query("vaults")
    .withIndex("by_userId_and_state_and_deletion_state", (q) =>
      q
        .eq("userId", args.userId)
        .eq("state", "connected")
        .eq("deletion.state", "not_deleting"),
    )
    .paginate({
      cursor: args.cursor,
      numItems: MAX_DASHBOARD_REFRESH_DEMAND_VAULTS,
    });
  return {
    vaultIds: page.page.map((vault) => vault._id),
    isDone: page.isDone,
    continueCursor: page.isDone ? null : page.continueCursor,
  };
}

/**
 * Converts one dashboard signal page into repository demand rows.
 * If more vaults remain, this schedules the next internal page immediately.
 * Each repository demand is handed to Workpool from the backend; React never
 * loops vaults, batches ids, or decides refresh depth.
 */
async function enqueueDashboardRepositoryRefreshPageForUser(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    trigger: RepositoryRefreshBrowserTrigger;
    cursor: string | null;
  },
): Promise<void> {
  const page = await selectDashboardRefreshVaultPage(ctx, {
    userId: args.userId,
    cursor: args.cursor,
  });
  for (const vaultId of page.vaultIds) {
    await enqueueAndScheduleRepositoryRefresh(ctx, {
      userId: args.userId,
      vaultId,
      demand: {
        scope: "repository",
        source: "dashboard",
        trigger: args.trigger,
      },
    });
  }

  if (page.isDone) {
    return;
  }

  await ctx.scheduler.runAfter(
    0,
    internal.repositoryRefresh.enqueueDashboardRepositoryRefreshPage,
    {
      userId: args.userId,
      trigger: args.trigger,
      cursor: page.continueCursor,
    },
  );
}

/**
 * Converts the completed setup run into the durable source_setup mode.
 * Retry runs are rejected because the original create/connect run defines the
 * setup meaning.
 */
function getSourceSetupRepositoryRefreshMode(
  run: Doc<"appProvisioningRuns">,
): SourceSetupRepositoryRefreshMode {
  switch (run.trigger) {
    case "create":
      return "create_repository";
    case "connect_existing_repository":
      return "connect_existing_repository";
    case "retry":
      throw new Error("Retry run is not source setup refresh demand.");
    default: {
      run.trigger satisfies never;
      throw new Error("Unsupported source setup run trigger.");
    }
  }
}

/**
 * Only stronger demand rewrites an active queued/scheduled row.
 * Equal priority coalesces so repeated dashboard visibility signals do not
 * churn `updatedAt` or reschedule Workpool work.
 */
function shouldUpgradeRepositoryRefreshDemand(args: {
  incoming: RepositoryRefreshDemand;
  existing: RepositoryRefreshDemand;
}): boolean {
  return isRepositoryRefreshPriorityStronger({
    incoming: getRepositoryRefreshPriority(args.incoming),
    existing: getRepositoryRefreshPriority(args.existing),
  });
}

/**
 * Reads one active row for a specific lifecycle state. The caller checks states
 * in ownership order: running lease first, then scheduled Workpool job, then
 * queued demand waiting to be scheduled.
 */
async function getActiveRepositoryRefreshRequestForState(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    dedupeKey: string;
    state: ActiveRepositoryRefreshState;
  },
): Promise<Doc<"repositoryRefreshRequests"> | null> {
  return await ctx.db
    .query("repositoryRefreshRequests")
    .withIndex("by_userId_and_dedupeKey_and_lifecycle_state", (q) =>
      q
        .eq("userId", args.userId)
        .eq("dedupeKey", args.dedupeKey)
        .eq("lifecycle.state", args.state),
    )
    .order("desc")
    .first();
}

/**
 * One active row should exist per user + dedupe key. Running rows only win
 * while their Workpool lease is still valid; scheduled rows win over unscheduled
 * queued demand because a Workpool job already exists.
 */
async function getActiveRepositoryRefreshRequest(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    dedupeKey: string;
    now: number;
  },
): Promise<Doc<"repositoryRefreshRequests"> | null> {
  const running = await getActiveRepositoryRefreshRequestForState(ctx, {
    ...args,
    state: "running",
  });
  if (running) {
    if (isRunningRepositoryRefreshLeaseValid(running, args.now)) {
      return running;
    }

    await markExpiredRunningRepositoryRefreshRequestFailed(
      ctx,
      running,
      args.now,
    );
  }

  const scheduled = await getActiveRepositoryRefreshRequestForState(ctx, {
    ...args,
    state: "scheduled",
  });
  if (scheduled) {
    return scheduled;
  }

  return await getActiveRepositoryRefreshRequestForState(ctx, {
    ...args,
    state: "queued",
  });
}

/**
 * Shared demand-ingest helper for all current entry points.
 *
 * It owns the invariant that there is at most one useful active row per
 * `userId + dedupeKey`: running rows are reused, queued/scheduled rows upgrade
 * only for stronger demand, and terminal rows are treated as history.
 */
async function enqueueRepositoryRefresh(
  ctx: MutationCtx,
  args: EnqueueRepositoryRefreshArgs,
): Promise<EnqueueRepositoryRefreshResult> {
  const vault = await ctx.db.get(args.vaultId);
  if (!vault || vault.userId !== args.userId) {
    throw new Error("Vault not found.");
  }
  if (vault.deletion.state !== "not_deleting") {
    return {
      kind: "blocked",
      reason: "vault_deleting",
    };
  }
  if (vault.state !== "connected") {
    return {
      kind: "blocked",
      reason: "vault_not_connected",
    };
  }

  const now = Date.now();
  const dedupeKey = deriveRepositoryRefreshDedupeKey(args);
  const activeRequest = await getActiveRepositoryRefreshRequest(ctx, {
    userId: args.userId,
    dedupeKey,
    now,
  });
  if (!activeRequest) {
    const requestId = await ctx.db.insert(
      "repositoryRefreshRequests",
      makeRepositoryRefreshRequest({
        userId: args.userId,
        vaultId: args.vaultId,
        demand: args.demand,
        now,
      }),
    );
    return {
      kind: "created",
      requestId,
    };
  }

  switch (activeRequest.lifecycle.state) {
    case "running":
      return {
        kind: "already_running",
        requestId: activeRequest._id,
      };
    case "scheduled": {
      if (
        !shouldUpgradeRepositoryRefreshDemand({
          incoming: args.demand,
          existing: activeRequest.demand,
        })
      ) {
        return {
          kind: "already_scheduled",
          requestId: activeRequest._id,
        };
      }

      const upgraded = upgradeScheduledRepositoryRefreshRequest(activeRequest, {
        demand: args.demand,
        now,
      });
      await ctx.db.patch(activeRequest._id, {
        demand: upgraded.demand,
        lifecycle: upgraded.lifecycle,
        updatedAt: upgraded.updatedAt,
      });
      return {
        kind: "updated",
        requestId: activeRequest._id,
      };
    }
    case "queued": {
      if (
        !shouldUpgradeRepositoryRefreshDemand({
          incoming: args.demand,
          existing: activeRequest.demand,
        })
      ) {
        return {
          kind: "already_queued",
          requestId: activeRequest._id,
        };
      }

      const upgraded = upgradeQueuedRepositoryRefreshRequest(activeRequest, {
        demand: args.demand,
        now,
      });
      await ctx.db.patch(activeRequest._id, {
        demand: upgraded.demand,
        lifecycle: upgraded.lifecycle,
        updatedAt: upgraded.updatedAt,
      });
      return {
        kind: "updated",
        requestId: activeRequest._id,
      };
    }
    case "succeeded":
    case "failed":
    case "canceled":
      throw new Error("Terminal repository refresh request cannot be active.");
    default: {
      activeRequest.lifecycle satisfies never;
      throw new Error("Unsupported repository refresh lifecycle state.");
    }
  }
}

/**
 * Schedules repository-scoped queued demand on the Workpool.
 *
 * Branch demand remains queued for the later branch worker. That keeps this PR
 * narrow: dashboard/source-setup/manual repository freshness moves backend-side
 * without pretending branch/file-view semantics are done.
 *
 * The row becomes `scheduled`, not `running`. Workpool has accepted the job,
 * but the refresh lease starts only when the action handler begins.
 */
async function scheduleQueuedRepositoryRefreshRequest(
  ctx: MutationCtx,
  requestId: Id<"repositoryRefreshRequests">,
): Promise<void> {
  const request = await ctx.db.get(requestId);
  if (!request || request.lifecycle.state !== "queued") {
    return;
  }
  if (request.demand.scope !== "repository") {
    return;
  }

  const now = Date.now();
  const workpoolJobId = await repositoryRefreshWorkpool.enqueueAction(
    ctx,
    internal.repositoryRefresh.runRepositoryRefreshRequest,
    { requestId },
    {
      context: { requestId },
      onComplete: internal.repositoryRefresh.handleRepositoryRefreshComplete,
      retry: false,
      runAt: request.lifecycle.notBefore,
    },
  );
  const scheduled = markRepositoryRefreshRequestScheduled(request, {
    now,
    attempt: 1,
    workpoolJobId,
  });
  await ctx.db.patch(request._id, {
    lifecycle: scheduled.lifecycle,
    updatedAt: scheduled.updatedAt,
  });
}

/**
 * Ingests demand and immediately hands repository-scoped queued rows to
 * Workpool. Already-running/scheduled rows are left alone; already-queued rows
 * are also kicked so rows written before this runner deployed do not stay inert.
 */
async function enqueueAndScheduleRepositoryRefresh(
  ctx: MutationCtx,
  args: EnqueueRepositoryRefreshArgs,
): Promise<EnqueueRepositoryRefreshResult> {
  const result = await enqueueRepositoryRefresh(ctx, args);
  switch (result.kind) {
    case "created":
    case "updated":
    case "already_queued":
      await scheduleQueuedRepositoryRefreshRequest(ctx, result.requestId);
      return result;
    case "already_scheduled":
    case "already_running":
    case "blocked":
      return result;
    default: {
      result satisfies never;
      return result;
    }
  }
}

/**
 * Claims one scheduled repository refresh for worker execution.
 *
 * The action re-reads through this mutation instead of trusting enqueue-time
 * state: a vault can start deleting, disappear, or become disconnected after
 * demand was recorded but before Workpool starts the job. Only this mutation
 * creates the running lease.
 */
export const startRepositoryRefreshRequest = internalMutation({
  args: object({
    requestId: id("repositoryRefreshRequests"),
  }),
  returns: repositoryRefreshWorkerInput,
  handler: async (ctx, args): Promise<RepositoryRefreshWorkerInput> => {
    const request = await ctx.db.get(args.requestId);
    if (!request || request.lifecycle.state !== "scheduled") {
      return { kind: "no_work_needed" };
    }
    if (request.demand.scope !== "repository") {
      return { kind: "no_work_needed" };
    }

    const vault = await ctx.db.get(request.vaultId);
    if (!vault) {
      return {
        kind: "cancel",
        reason: "vault_deleted",
      };
    }
    if (vault.deletion.state !== "not_deleting") {
      return {
        kind: "cancel",
        reason: "vault_deleting",
      };
    }
    if (vault.state !== "connected") {
      return {
        kind: "fail",
        message: "Repository refresh vault is no longer connected.",
      };
    }

    const now = Date.now();
    const running = markRepositoryRefreshRequestRunning(request, {
      now,
      leaseExpiresAt: getRepositoryRefreshLeaseExpiresAt(now),
    });
    await ctx.db.patch(request._id, {
      lifecycle: running.lifecycle,
      updatedAt: running.updatedAt,
    });

    return {
      kind: "ready",
      userId: request.userId,
      vaultId: vault._id,
      owner: vault.owner,
      repo: vault.name,
      demand: request.demand,
    };
  },
});

/**
 * Extends the running lease from inside a worker attempt.
 * If another path already made the row terminal, this becomes a no-op.
 */
export const refreshRepositoryRefreshRequestLease = internalMutation({
  args: object({
    requestId: id("repositoryRefreshRequests"),
  }),
  returns: vNull(),
  handler: async (ctx, args): Promise<null> => {
    const request = await ctx.db.get(args.requestId);
    if (!request || request.lifecycle.state !== "running") {
      return null;
    }

    const now = Date.now();
    await ctx.db.patch(args.requestId, {
      lifecycle: {
        ...request.lifecycle,
        leaseExpiresAt: getRepositoryRefreshLeaseExpiresAt(now),
      },
      updatedAt: now,
    });
    return null;
  },
});

async function finishRunningRepositoryRefreshRequestSucceeded(
  ctx: MutationCtx,
  args: {
    requestId: Id<"repositoryRefreshRequests">;
    result: RepositoryRefreshResult;
  },
): Promise<void> {
  const request = await ctx.db.get(args.requestId);
  if (!request || request.lifecycle.state !== "running") {
    return;
  }

  const now = Date.now();
  const succeeded = markRepositoryRefreshRequestSucceeded(request, {
    now,
    result: args.result,
  });
  await ctx.db.patch(args.requestId, {
    lifecycle: succeeded.lifecycle,
    updatedAt: succeeded.updatedAt,
  });
}

/**
 * Loads a scheduled/running row only if the caller still owns the Workpool job.
 * onComplete passes `workpoolJobId` so an old Workpool completion callback
 * cannot mutate a row that has already been reused or replaced by newer work.
 */
async function getOwnedActiveRepositoryRefreshRequest(
  ctx: MutationCtx,
  args: {
    requestId: Id<"repositoryRefreshRequests">;
    workpoolJobId: string | null;
  },
): Promise<Doc<"repositoryRefreshRequests"> | null> {
  const request = await ctx.db.get(args.requestId);
  if (
    !request ||
    (request.lifecycle.state !== "scheduled" &&
      request.lifecycle.state !== "running")
  ) {
    return null;
  }
  if (
    args.workpoolJobId !== null &&
    request.lifecycle.workpoolJobId !== args.workpoolJobId
  ) {
    return null;
  }

  return request;
}

async function finishActiveRepositoryRefreshRequestFailed(
  ctx: MutationCtx,
  args: {
    requestId: Id<"repositoryRefreshRequests">;
    workpoolJobId: string | null;
    failure: RepositoryRefreshFailure;
  },
): Promise<void> {
  const request = await getOwnedActiveRepositoryRefreshRequest(ctx, args);
  if (!request) {
    return;
  }

  const now = Date.now();
  const failed = markRepositoryRefreshRequestFailed(request, {
    now,
    failure: args.failure,
  });
  await ctx.db.patch(args.requestId, {
    lifecycle: failed.lifecycle,
    updatedAt: failed.updatedAt,
  });
}

async function finishActiveRepositoryRefreshRequestCanceled(
  ctx: MutationCtx,
  args: {
    requestId: Id<"repositoryRefreshRequests">;
    workpoolJobId: string | null;
    reason: RepositoryRefreshCancelReason;
  },
): Promise<void> {
  const request = await getOwnedActiveRepositoryRefreshRequest(ctx, args);
  if (!request) {
    return;
  }

  const now = Date.now();
  const canceled = markRepositoryRefreshRequestCanceled(request, {
    now,
    reason: args.reason,
  });
  await ctx.db.patch(args.requestId, {
    lifecycle: canceled.lifecycle,
    updatedAt: canceled.updatedAt,
  });
}

/**
 * Terminal success transition used by the Workpool action.
 * Late duplicate completions are ignored so onComplete/error paths can be
 * idempotent around a row that already left `running`.
 */
export const finishRepositoryRefreshRequestSucceeded = internalMutation({
  args: object({
    requestId: id("repositoryRefreshRequests"),
    result: vRepositoryRefreshResult,
  }),
  returns: vNull(),
  handler: async (ctx, args): Promise<null> => {
    await finishRunningRepositoryRefreshRequestSucceeded(ctx, {
      requestId: args.requestId,
      result: args.result,
    });
    return null;
  },
});

/**
 * Terminal failure transition used by the action and by Workpool onComplete.
 * workpoolJobId is required for onComplete so an old job cannot fail a newer
 * owner. The action path omits it because it is the current worker code path.
 */
export const finishRepositoryRefreshRequestFailed = internalMutation({
  args: object({
    requestId: id("repositoryRefreshRequests"),
    workpoolJobId: union(string(), vNull()),
    failure: vRepositoryRefreshFailure,
  }),
  returns: vNull(),
  handler: async (ctx, args): Promise<null> => {
    await finishActiveRepositoryRefreshRequestFailed(ctx, {
      requestId: args.requestId,
      workpoolJobId: args.workpoolJobId,
      failure: args.failure,
    });
    return null;
  },
});

/**
 * Terminal cancel transition used when Workpool starts after the vault was
 * deleted/deleting or when the component cancels a pending job.
 */
export const finishRepositoryRefreshRequestCanceled = internalMutation({
  args: object({
    requestId: id("repositoryRefreshRequests"),
    workpoolJobId: union(string(), vNull()),
    reason: vRepositoryRefreshCancelReason,
  }),
  returns: vNull(),
  handler: async (ctx, args): Promise<null> => {
    await finishActiveRepositoryRefreshRequestCanceled(ctx, {
      requestId: args.requestId,
      workpoolJobId: args.workpoolJobId,
      reason: args.reason,
    });
    return null;
  },
});

/**
 * Workpool completion fallback.
 *
 * The action itself writes success/failure so it can use typed return values.
 * onComplete is still required for worker crashes and component cancellation.
 */
export const handleRepositoryRefreshComplete = internalMutation({
  args: vOnCompleteArgs(repositoryRefreshWorkpoolContext),
  returns: vNull(),
  handler: async (ctx, args): Promise<null> => {
    switch (args.result.kind) {
      case "success":
        return null;
      case "failed": {
        const now = Date.now();
        await finishActiveRepositoryRefreshRequestFailed(ctx, {
          requestId: args.context.requestId,
          workpoolJobId: args.workId,
          failure: makeRepositoryRefreshProviderFailure({
            now,
            message: args.result.error,
          }),
        });
        return null;
      }
      case "canceled":
        await finishActiveRepositoryRefreshRequestCanceled(ctx, {
          requestId: args.context.requestId,
          workpoolJobId: args.workId,
          reason: "workpool_canceled",
        });
        return null;
      default: {
        args.result satisfies never;
        return null;
      }
    }
  },
});

/**
 * Workpool action for repository-scoped demand.
 *
 * It re-checks live vault state, lets backend policy choose the old GitHub
 * refresh trigger, and records a terminal request lifecycle. Branch demand is
 * intentionally not executed here.
 */
export const runRepositoryRefreshRequest = internalAction({
  args: object({
    requestId: id("repositoryRefreshRequests"),
  }),
  returns: vRepositoryRefreshResult,
  handler: async (ctx, args): Promise<RepositoryRefreshResult> => {
    const input: RepositoryRefreshWorkerInput = await ctx.runMutation(
      internal.repositoryRefresh.startRepositoryRefreshRequest,
      args,
    );
    switch (input.kind) {
      case "no_work_needed":
        return { kind: "no_work_needed" };
      case "cancel":
        await ctx.runMutation(
          internal.repositoryRefresh.finishRepositoryRefreshRequestCanceled,
          {
            requestId: args.requestId,
            workpoolJobId: null,
            reason: input.reason,
          },
        );
        return { kind: "no_work_needed" };
      case "fail": {
        const now = Date.now();
        await ctx.runMutation(
          internal.repositoryRefresh.finishRepositoryRefreshRequestFailed,
          {
            requestId: args.requestId,
            workpoolJobId: null,
            failure: makeRepositoryRefreshProviderFailure({
              now,
              message: input.message,
            }),
          },
        );
        throw new Error(input.message);
      }
      case "ready":
        break;
      default: {
        input satisfies never;
        return { kind: "no_work_needed" };
      }
    }

    await ctx.runMutation(
      internal.repositoryRefresh.refreshRepositoryRefreshRequestLease,
      {
        requestId: args.requestId,
      },
    );

    try {
      const refreshResult: {
        refreshed: boolean;
      } = await ctx.runAction(internal.github.refreshRepositoryTreeForUser, {
        input: {
          scope: "repository",
          userId: input.userId,
          owner: input.owner,
          repo: input.repo,
          includeAheadBehind: true,
          includePullRequestLinks: true,
          includeCloudflarePreviewLinks: false,
          cloudflarePreviewBranchNames: [],
          trigger: getRepositoryRefreshWorkerTrigger(input.demand),
        },
      });
      const result = toRepositoryRefreshResult(refreshResult);
      await ctx.runMutation(
        internal.repositoryRefresh.finishRepositoryRefreshRequestSucceeded,
        {
          requestId: args.requestId,
          result,
        },
      );
      return result;
    } catch (error) {
      const now = Date.now();
      await ctx.runMutation(
        internal.repositoryRefresh.finishRepositoryRefreshRequestFailed,
        {
          requestId: args.requestId,
          workpoolJobId: null,
          failure: makeRepositoryRefreshProviderFailure({
            now,
            message: toErrorMessage(error),
          }),
        },
      );
      throw error;
    }
  },
});

/**
 * Public dashboard auto-refresh signal.
 *
 * The browser passes only `trigger`. Convex owns eligible vault selection and
 * internal continuation so React never batches, loops, or sends vault ids.
 */
export const enqueueDashboardRepositoryRefresh = mutation({
  args: object({
    trigger: vRepositoryRefreshBrowserTrigger,
  }),
  returns: vNull(),
  handler: async (ctx, args): Promise<null> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("User not authenticated");
    }

    await enqueueDashboardRepositoryRefreshPageForUser(ctx, {
      userId,
      trigger: args.trigger,
      cursor: null,
    });
    return null;
  },
});

/**
 * Internal continuation for dashboard demand fan-out.
 *
 * This keeps transaction size bounded without exposing pagination to the
 * browser. Workpool owns the actual repository refresh jobs created per page.
 */
export const enqueueDashboardRepositoryRefreshPage = internalMutation({
  args: object({
    userId: id("users"),
    trigger: vRepositoryRefreshBrowserTrigger,
    cursor: union(string(), vNull()),
  }),
  returns: vNull(),
  handler: async (ctx, args): Promise<null> => {
    await enqueueDashboardRepositoryRefreshPageForUser(ctx, args);
    return null;
  },
});

/**
 * Public manual dashboard refresh for one explicit vault.
 *
 * This accepts a vault id because the user clicked one vault's status control.
 * The shared helper still verifies ownership/deletion state before creating or
 * upgrading queue state.
 */
export const enqueueManualRepositoryRefresh = mutation({
  args: object({
    vaultId: id("vaults"),
  }),
  returns: vEnqueueRepositoryRefreshResult,
  handler: async (ctx, args): Promise<EnqueueRepositoryRefreshResult> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("User not authenticated");
    }

    return await enqueueAndScheduleRepositoryRefresh(ctx, {
      userId,
      vaultId: args.vaultId,
      demand: {
        scope: "repository",
        source: "manual",
        trigger: "dashboard_status_click",
      },
    });
  },
});

/**
 * Internal setup-completion refresh demand.
 *
 * Called after repository create/connect workflow actions finish. It verifies
 * that the provisioning run belongs to the provided user/vault, derives
 * create-vs-connect mode from that run, then enqueues repository-level demand
 * so branch discovery can happen without a dashboard reload.
 */
export const enqueueSourceSetupRepositoryRefresh = internalMutation({
  args: object({
    userId: id("users"),
    vaultId: id("vaults"),
    runId: id("appProvisioningRuns"),
  }),
  returns: vEnqueueRepositoryRefreshResult,
  handler: async (ctx, args): Promise<EnqueueRepositoryRefreshResult> => {
    const run = await ctx.db.get(args.runId);
    if (!run || run.userId !== args.userId || run.vaultId !== args.vaultId) {
      throw new Error("Source setup run does not match refresh demand.");
    }
    if (run.state !== "succeeded") {
      throw new Error("Source setup run has not succeeded.");
    }

    const mode = getSourceSetupRepositoryRefreshMode(run);
    return await enqueueAndScheduleRepositoryRefresh(ctx, {
      userId: args.userId,
      vaultId: args.vaultId,
      demand: {
        scope: "repository",
        source: "source_setup",
        runId: args.runId,
        mode,
      },
    });
  },
});

/**
 * Atomically marks an existing-repository connection complete and persists the
 * source-setup refresh demand. If enqueue fails, the success event is rolled
 * back with the run state update because both writes are in one mutation.
 */
export const completeExistingRepositoryConnectionAndEnqueueRefresh =
  internalMutation({
    args: object({
      userId: id("users"),
      vaultId: id("vaults"),
      runId: id("appProvisioningRuns"),
    }),
    returns: vEnqueueRepositoryRefreshResult,
    handler: async (ctx, args): Promise<EnqueueRepositoryRefreshResult> => {
      const run = await ctx.db.get(args.runId);
      if (
        !run ||
        run.userId !== args.userId ||
        run.vaultId !== args.vaultId ||
        run.trigger !== "connect_existing_repository"
      ) {
        throw new Error(
          "Provisioning run does not match existing repository workflow.",
        );
      }
      if (run.state === "failed" || run.state === "canceled") {
        throw new Error("Terminal source setup run cannot be completed.");
      }

      const now = Date.now();
      if (run.state !== "succeeded") {
        if (run.state !== "running" || run.currentStep !== "sync_tree") {
          throw new Error(
            "Existing repository workflow has not reached the finish boundary.",
          );
        }
        const vault = await ctx.db.get(args.vaultId);
        if (
          !vault ||
          vault.userId !== args.userId ||
          vault.state !== "connected" ||
          vault.deletion.state !== "not_deleting"
        ) {
          throw new Error("Existing repository vault is not connected.");
        }
        await ctx.db.insert("appProvisioningEvents", {
          userId: run.userId,
          vaultId: run.vaultId,
          repositoryFullName: run.repositoryFullName,
          runId: args.runId,
          step: "finish",
          level: "info",
          message: "Connected existing repository.",
          createdAt: now,
        });
        await ctx.db.patch(args.runId, {
          state: "succeeded",
          currentStep: "finish",
          updatedAt: now,
          completedAt: now,
        });
      }

      const result = await enqueueAndScheduleRepositoryRefresh(ctx, {
        userId: args.userId,
        vaultId: args.vaultId,
        demand: {
          scope: "repository",
          source: "source_setup",
          runId: args.runId,
          mode: "connect_existing_repository",
        },
      });
      if (result.kind === "blocked") {
        throw new Error(
          `Source setup refresh blocked after existing repository connection: reason=${result.reason}, runId=${args.runId}, userId=${args.userId}, vaultId=${args.vaultId}.`,
        );
      }
      return result;
    },
  });
