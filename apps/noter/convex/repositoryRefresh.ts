import { getAuthUserId } from "@convex-dev/auth/server";
import { Infer, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  type MutationCtx,
} from "./_generated/server";
import { MAX_DASHBOARD_REFRESH_DEMAND_VAULTS } from "../shared/repositoryRefresh";
import {
  deriveRepositoryRefreshDedupeKey,
  getRepositoryRefreshPriority,
  isRepositoryRefreshPriorityStronger,
  makeRepositoryRefreshRequest,
  upgradeQueuedRepositoryRefreshRequest,
  vEnqueueRepositoryRefreshResult,
  vRepositoryRefreshBrowserTrigger,
  type EnqueueRepositoryRefreshResult,
  type RepositoryRefreshDemand,
} from "./repositoryRefreshModel";

const { array, id, literal, object, union } = v;

/**
 * Source setup mode stored on demand rows.
 * This is derived from `appProvisioningRuns.trigger`, never accepted from a
 * caller, so setup retries cannot invent a different original setup mode.
 */
const vSourceSetupRepositoryRefreshMode = union(
  literal("create_repository"),
  literal("connect_existing_repository"),
);

/**
 * Dashboard enqueue returns one coalescing result per backend-selected vault.
 * The browser does not pass vault ids for this entry point.
 */
const vEnqueueDashboardRepositoryRefreshResult = array(
  object({
    vaultId: id("vaults"),
    result: vEnqueueRepositoryRefreshResult,
  }),
);
type EnqueueDashboardRepositoryRefreshResult = Infer<
  typeof vEnqueueDashboardRepositoryRefreshResult
>;

type SourceSetupRepositoryRefreshMode = Infer<
  typeof vSourceSetupRepositoryRefreshMode
>;

type EnqueueRepositoryRefreshArgs = {
  userId: Id<"users">;
  vaultId: Id<"vaults">;
  demand: RepositoryRefreshDemand;
};

type ActiveRepositoryRefreshState = "queued" | "running";

/**
 * Selects the vault set implied by one dashboard freshness signal.
 * Example: a page load from user A can enqueue user A's connected vaults only;
 * ids for user B are not accepted from the browser at all.
 */
async function selectDashboardRefreshVaultIds(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<Id<"vaults">[]> {
  const connectedVaults = await ctx.db
    .query("vaults")
    .withIndex("by_userId_and_state", (q) =>
      q.eq("userId", userId).eq("state", "connected"),
    )
    .take(MAX_DASHBOARD_REFRESH_DEMAND_VAULTS);
  return connectedVaults
    .filter((vault) => vault.deletion.state === "not_deleting")
    .map((vault) => vault._id);
}

/**
 * Converts the completed setup run into the durable source_setup mode.
 * Retry runs are rejected because the original create/connect run defines the
 * setup meaning.
 */
async function getSourceSetupRepositoryRefreshMode(
  run: Doc<"appProvisioningRuns">,
): Promise<SourceSetupRepositoryRefreshMode> {
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
 * Reads one active row for a specific lifecycle state.
 * Kept separate so `getActiveRepositoryRefreshRequest` can prefer running over
 * queued if older data ever contains both.
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
 * One active row should exist per user + dedupe key. If old/corrupt data has
 * both running and queued rows, running wins because a worker may already be
 * mutating provider-backed state.
 */
async function getActiveRepositoryRefreshRequest(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    dedupeKey: string;
  },
): Promise<Doc<"repositoryRefreshRequests"> | null> {
  const running = await getActiveRepositoryRefreshRequestForState(ctx, {
    ...args,
    state: "running",
  });
  if (running) {
    return running;
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
 * `userId + dedupeKey`: running rows are reused, queued rows upgrade only for
 * stronger demand, and terminal rows are treated as history.
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

  const now = Date.now();
  const dedupeKey = deriveRepositoryRefreshDedupeKey(args);
  const activeRequest = await getActiveRepositoryRefreshRequest(ctx, {
    userId: args.userId,
    dedupeKey,
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
    case "queued": {
      const incomingPriority = getRepositoryRefreshPriority(args.demand);
      const existingPriority = getRepositoryRefreshPriority(
        activeRequest.demand,
      );
      if (
        !isRepositoryRefreshPriorityStronger({
          incoming: incomingPriority,
          existing: existingPriority,
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
 * Public dashboard auto-refresh signal.
 *
 * The browser passes only `trigger`; Convex selects up to
 * `MAX_DASHBOARD_REFRESH_DEMAND_VAULTS` connected, non-deleting vaults for the
 * authenticated user and enqueues repository-level demand for each selected
 * vault.
 */
export const enqueueDashboardRepositoryRefresh = mutation({
  args: object({
    trigger: vRepositoryRefreshBrowserTrigger,
  }),
  returns: vEnqueueDashboardRepositoryRefreshResult,
  handler: async (
    ctx,
    args,
  ): Promise<EnqueueDashboardRepositoryRefreshResult> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("User not authenticated");
    }

    const results: EnqueueDashboardRepositoryRefreshResult = [];
    const vaultIds = await selectDashboardRefreshVaultIds(ctx, userId);
    for (const vaultId of vaultIds) {
      results.push({
        vaultId,
        result: await enqueueRepositoryRefresh(ctx, {
          userId,
          vaultId,
          demand: {
            scope: "repository",
            source: "dashboard",
            trigger: args.trigger,
          },
        }),
      });
    }
    return results;
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

    return await enqueueRepositoryRefresh(ctx, {
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

    const mode = await getSourceSetupRepositoryRefreshMode(run);
    return await enqueueRepositoryRefresh(ctx, {
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
