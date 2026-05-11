import { getAuthUserId } from "@convex-dev/auth/server";
import { Infer, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  type MutationCtx,
} from "./_generated/server";
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

// One dashboard page load can report many visible vaults, but this mutation
// still runs as one Convex transaction. Keep the batch bounded until Workpool
// owns the fan-out.
export const MAX_DASHBOARD_REFRESH_DEMAND_BATCH_SIZE = 50;

const vSourceSetupRepositoryRefreshMode = union(
  literal("create_repository"),
  literal("connect_existing_repository"),
);

const enqueueDashboardRepositoryRefreshArgs = object({
  vaultIds: array(id("vaults")),
  trigger: vRepositoryRefreshBrowserTrigger,
});
type EnqueueDashboardRepositoryRefreshArgs = Infer<
  typeof enqueueDashboardRepositoryRefreshArgs
>;
const vEnqueueDashboardRepositoryRefreshResult = array(
  object({
    vaultId: id("vaults"),
    result: vEnqueueRepositoryRefreshResult,
  }),
);
type EnqueueDashboardRepositoryRefreshResult = Infer<
  typeof vEnqueueDashboardRepositoryRefreshResult
>;

const enqueueManualRepositoryRefreshArgs = object({
  vaultId: id("vaults"),
});
type EnqueueManualRepositoryRefreshArgs = Infer<
  typeof enqueueManualRepositoryRefreshArgs
>;

const enqueueSourceSetupRepositoryRefreshArgs = object({
  userId: id("users"),
  vaultId: id("vaults"),
  runId: id("appProvisioningRuns"),
  mode: vSourceSetupRepositoryRefreshMode,
});
type EnqueueSourceSetupRepositoryRefreshArgs = Infer<
  typeof enqueueSourceSetupRepositoryRefreshArgs
>;

type EnqueueRepositoryRefreshArgs = {
  userId: Id<"users">;
  vaultId: Id<"vaults">;
  demand: RepositoryRefreshDemand;
};

type ActiveRepositoryRefreshState = "queued" | "running";

function getUniqueVaultIds(vaultIds: Id<"vaults">[]): Id<"vaults">[] {
  const uniqueVaultIds: Id<"vaults">[] = [];
  const seenVaultIds = new Set<Id<"vaults">>();
  for (const vaultId of vaultIds) {
    if (seenVaultIds.has(vaultId)) {
      continue;
    }
    seenVaultIds.add(vaultId);
    uniqueVaultIds.push(vaultId);
  }
  return uniqueVaultIds;
}

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

export const enqueueDashboardRepositoryRefresh = mutation({
  args: enqueueDashboardRepositoryRefreshArgs,
  returns: vEnqueueDashboardRepositoryRefreshResult,
  handler: async (
    ctx,
    args: EnqueueDashboardRepositoryRefreshArgs,
  ): Promise<EnqueueDashboardRepositoryRefreshResult> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("User not authenticated");
    }
    if (args.vaultIds.length > MAX_DASHBOARD_REFRESH_DEMAND_BATCH_SIZE) {
      throw new Error("Too many dashboard repository refresh demands.");
    }

    const results: EnqueueDashboardRepositoryRefreshResult = [];
    const vaultIds = getUniqueVaultIds(args.vaultIds);
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

export const enqueueManualRepositoryRefresh = mutation({
  args: enqueueManualRepositoryRefreshArgs,
  returns: vEnqueueRepositoryRefreshResult,
  handler: async (
    ctx,
    args: EnqueueManualRepositoryRefreshArgs,
  ): Promise<EnqueueRepositoryRefreshResult> => {
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

export const enqueueSourceSetupRepositoryRefresh = internalMutation({
  args: enqueueSourceSetupRepositoryRefreshArgs,
  returns: vEnqueueRepositoryRefreshResult,
  handler: async (
    ctx,
    args: EnqueueSourceSetupRepositoryRefreshArgs,
  ): Promise<EnqueueRepositoryRefreshResult> => {
    return await enqueueRepositoryRefresh(ctx, {
      userId: args.userId,
      vaultId: args.vaultId,
      demand: {
        scope: "repository",
        source: "source_setup",
        runId: args.runId,
        mode: args.mode,
      },
    });
  },
});
