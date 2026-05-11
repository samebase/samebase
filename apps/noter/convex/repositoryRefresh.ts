import { getAuthUserId } from "@convex-dev/auth/server";
import { Infer, v } from "convex/values";

import { internal } from "./_generated/api";
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
  type RepositoryRefreshBrowserTrigger,
  type RepositoryRefreshDemand,
} from "./repositoryRefreshModel";

const { id, literal, null: vNull, object, string, union } = v;

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

type ActiveRepositoryRefreshState = "queued" | "running";

type DashboardRefreshVaultPage = {
  vaultIds: Id<"vaults">[];
  isDone: boolean;
  continueCursor: string | null;
};

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
 * The Workpool PR will replace this scheduling boundary without changing
 * the public dashboard mutation.
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
    await enqueueRepositoryRefresh(ctx, {
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
 * browser. The next PR moves this boundary to Workpool while preserving the
 * same public dashboard signal.
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
    if (run.state !== "succeeded") {
      throw new Error("Source setup run has not succeeded.");
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

      return await enqueueRepositoryRefresh(ctx, {
        userId: args.userId,
        vaultId: args.vaultId,
        demand: {
          scope: "repository",
          source: "source_setup",
          runId: args.runId,
          mode: "connect_existing_repository",
        },
      });
    },
  });
