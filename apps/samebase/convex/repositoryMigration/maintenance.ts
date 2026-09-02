import { v } from "convex/values";

import type { Id } from "../_generated/dataModel";
import { internalMutation, type MutationCtx, type QueryCtx } from "../_generated/server";
import { query } from "../functions";
import { TREE_REFRESH_STALE_LOCK_MS } from "../../shared/treeRefresh";
import { GITHUB_USER_TOKEN_REFRESH_STALE_LOCK_MS } from "../../shared/githubUserTokenRefresh";
import {
  type RepositoryOperationLeaseResult,
  type RepositoryWriteMode,
  type RepositoryWriteModeStatus,
  vRepositoryOperationLeaseResult,
  vRepositoryWriteMode,
  vRepositoryWriteModeStatus,
} from "./maintenanceModel";

const nullValidator = v.null();
const { id, string } = v;

const REPOSITORY_OPERATION_LEASE_DURATION_MS = 15 * 60 * 1000;
const REPOSITORY_MAINTENANCE_WRITE_ERROR =
  "Repository changes are paused for maintenance. Try again after maintenance.";

type RepositoryMaintenanceReadCtx = Pick<QueryCtx | MutationCtx, "db">;
type RepositoryMaintenanceMutationCtx = Pick<MutationCtx, "db">;

async function readRepositoryWriteGate(ctx: RepositoryMaintenanceReadCtx) {
  return await ctx.db
    .query("repositoryWriteGates")
    .withIndex("by_scope", (indexQuery) => indexQuery.eq("scope", "global"))
    .unique();
}

function projectRepositoryWriteMode(
  gate: Awaited<ReturnType<typeof readRepositoryWriteGate>>,
): RepositoryWriteModeStatus {
  if (gate === null) {
    return { mode: "normal", changedAt: null };
  }
  return { mode: gate.mode, changedAt: gate.changedAt };
}

export async function readRepositoryWriteMode(
  ctx: RepositoryMaintenanceReadCtx,
): Promise<RepositoryWriteModeStatus> {
  return projectRepositoryWriteMode(await readRepositoryWriteGate(ctx));
}

export async function requireRepositoryOperationStart(
  ctx: RepositoryMaintenanceMutationCtx,
): Promise<void> {
  const status = await readRepositoryWriteMode(ctx);
  if (status.mode !== "normal") {
    throw new Error(REPOSITORY_MAINTENANCE_WRITE_ERROR);
  }
}

/** The caller must validate its active workflow, lock, or lease in the same mutation. */
export async function requireRepositoryAuthorityContinuation(
  ctx: RepositoryMaintenanceReadCtx,
): Promise<void> {
  const status = await readRepositoryWriteMode(ctx);
  if (status.mode === "frozen") {
    throw new Error(REPOSITORY_MAINTENANCE_WRITE_ERROR);
  }
}

export async function requireFrozenRepositoryMigrationWrite(
  ctx: RepositoryMaintenanceMutationCtx,
): Promise<void> {
  const status = await readRepositoryWriteMode(ctx);
  if (status.mode !== "frozen") {
    throw new Error("Repository migration writes require frozen maintenance mode.");
  }
}

export async function claimRepositoryOperationLease(
  ctx: RepositoryMaintenanceMutationCtx,
  args: {
    operationId: string;
    operationName: string;
    durationMs: number;
  },
): Promise<RepositoryOperationLeaseResult> {
  if (args.operationId.length === 0 || args.operationName.length === 0) {
    throw new Error("Repository operation lease identity is required.");
  }
  if (!Number.isFinite(args.durationMs) || args.durationMs <= 0) {
    throw new Error("Repository operation lease duration must be positive.");
  }

  const now = Date.now();
  const existing = await ctx.db
    .query("repositoryOperationLeases")
    .withIndex("by_operation_id", (indexQuery) => indexQuery.eq("operationId", args.operationId))
    .unique();

  if (existing !== null) {
    if (existing.operationName !== args.operationName) {
      throw new Error("Repository operation lease identity is already in use.");
    }
    if (existing.expiresAt > now) {
      await requireRepositoryAuthorityContinuation(ctx);
      return { leaseId: existing._id, expiresAt: existing.expiresAt };
    }
  }

  await requireRepositoryOperationStart(ctx);
  if (existing !== null) {
    await ctx.db.delete(existing._id);
  }

  const expiresAt = now + args.durationMs;
  const leaseId = await ctx.db.insert("repositoryOperationLeases", {
    operationId: args.operationId,
    operationName: args.operationName,
    startedAt: now,
    expiresAt,
  });
  return { leaseId, expiresAt };
}

export async function requireRepositoryOperationLease(
  ctx: RepositoryMaintenanceMutationCtx,
  args: {
    leaseId: Id<"repositoryOperationLeases">;
    operationId: string;
    operationName: string;
  },
): Promise<void> {
  await requireRepositoryAuthorityContinuation(ctx);

  const lease = await ctx.db.get(args.leaseId);
  if (
    lease === null ||
    lease.operationId !== args.operationId ||
    lease.operationName !== args.operationName ||
    lease.expiresAt <= Date.now()
  ) {
    throw new Error("Repository operation lease is not active.");
  }
}

export async function releaseRepositoryOperationLease(
  ctx: RepositoryMaintenanceMutationCtx,
  args: {
    leaseId: Id<"repositoryOperationLeases">;
    operationId: string;
    operationName: string;
  },
): Promise<void> {
  const lease = await ctx.db.get(args.leaseId);
  if (lease === null) {
    return;
  }
  if (lease.operationId !== args.operationId || lease.operationName !== args.operationName) {
    throw new Error("Repository operation lease identity does not match.");
  }
  await ctx.db.delete(lease._id);
}

export const getRepositoryMaintenanceMode = query({
  access: "access_public",
  args: {},
  returns: vRepositoryWriteModeStatus,
  handler: async (ctx): Promise<RepositoryWriteModeStatus> => {
    return await readRepositoryWriteMode(ctx);
  },
});

export const claimOperationLease = internalMutation({
  args: {
    operationId: string(),
    operationName: string(),
  },
  returns: vRepositoryOperationLeaseResult,
  handler: async (ctx, args): Promise<RepositoryOperationLeaseResult> => {
    return await claimRepositoryOperationLease(ctx, {
      operationId: args.operationId,
      operationName: args.operationName,
      durationMs: REPOSITORY_OPERATION_LEASE_DURATION_MS,
    });
  },
});

export const releaseOperationLease = internalMutation({
  args: {
    leaseId: id("repositoryOperationLeases"),
    operationId: string(),
    operationName: string(),
  },
  returns: nullValidator,
  handler: async (ctx, args) => {
    await releaseRepositoryOperationLease(ctx, args);
    return null;
  },
});

async function readFreezeBlocker(
  ctx: RepositoryMaintenanceReadCtx,
  now: number,
): Promise<string | null> {
  const queuedProvisioningRun = await ctx.db
    .query("workflow_vaultProvisioning_runs")
    .withIndex("by_state", (indexQuery) => indexQuery.eq("state", "queued"))
    .first();
  if (queuedProvisioningRun !== null) {
    return "a repository provisioning run is queued";
  }

  const runningProvisioningRun = await ctx.db
    .query("workflow_vaultProvisioning_runs")
    .withIndex("by_state", (indexQuery) => indexQuery.eq("state", "running"))
    .first();
  if (runningProvisioningRun !== null) {
    return "a repository provisioning run is running";
  }

  const activeProviderWrite = await ctx.db
    .query("workflow_vaultProvisioning_writeLocks")
    .withIndex("by_state", (indexQuery) => indexQuery.eq("state", "active"))
    .first();
  if (activeProviderWrite !== null) {
    return "a repository provider write is active";
  }

  const queuedDeletionRun = await ctx.db
    .query("workflow_vaultDeletion_runs")
    .withIndex("by_state", (indexQuery) => indexQuery.eq("state", "queued"))
    .first();
  if (queuedDeletionRun !== null) {
    return "a repository deletion run is queued";
  }

  const runningDeletionRun = await ctx.db
    .query("workflow_vaultDeletion_runs")
    .withIndex("by_state", (indexQuery) => indexQuery.eq("state", "running"))
    .first();
  if (runningDeletionRun !== null) {
    return "a repository deletion run is running";
  }

  const runningAccountDeletion = await ctx.db
    .query("workflow_accountDeletion_runs")
    .withIndex("by_state", (indexQuery) => indexQuery.eq("state", "running"))
    .first();
  if (runningAccountDeletion !== null) {
    return "an account deletion can still write repository data";
  }

  const activeTreeRefresh = await ctx.db
    .query("vaults")
    .withIndex("by_tree_refresh_started_at", (indexQuery) =>
      indexQuery.gt("treeRefreshStartedAt", now - TREE_REFRESH_STALE_LOCK_MS),
    )
    .first();
  if (activeTreeRefresh !== null) {
    return "a repository tree refresh is active";
  }

  const activeOperationLease = await ctx.db
    .query("repositoryOperationLeases")
    .withIndex("by_expires_at", (indexQuery) => indexQuery.gt("expiresAt", now))
    .first();
  if (activeOperationLease !== null) {
    return "a repository operation lease is active";
  }

  const activeGitHubTokenRefresh = await ctx.db
    .query("githubUserAuthorizations")
    .withIndex("by_refresh_started_at", (indexQuery) =>
      indexQuery.gt("refreshStartedAt", now - GITHUB_USER_TOKEN_REFRESH_STALE_LOCK_MS),
    )
    .first();
  if (activeGitHubTokenRefresh !== null) {
    return "a GitHub authorization refresh is active";
  }

  const activeCloudflareTokenRefresh = await ctx.db
    .query("organizationProviderCredentials")
    .withIndex("by_cloudflare_token_refresh_expiry", (indexQuery) =>
      indexQuery.gt("cloudflare.tokenRefreshLease.expiresAt", now),
    )
    .first();
  if (activeCloudflareTokenRefresh !== null) {
    return "a Cloudflare token refresh is active";
  }

  return null;
}

function isLegalModeTransition(current: RepositoryWriteMode, next: RepositoryWriteMode): boolean {
  if (current === next) {
    return true;
  }

  switch (current) {
    case "normal":
      return next === "draining";
    case "draining":
      return next === "normal" || next === "frozen";
    case "frozen":
      return next === "normal";
    default:
      current satisfies never;
      throw new Error("Unknown repository write mode.");
  }
}

export const transitionRepositoryMaintenanceMode = internalMutation({
  args: {
    mode: vRepositoryWriteMode,
  },
  returns: vRepositoryWriteModeStatus,
  handler: async (ctx, args): Promise<RepositoryWriteModeStatus> => {
    const gate = await readRepositoryWriteGate(ctx);
    const current = projectRepositoryWriteMode(gate);
    if (!isLegalModeTransition(current.mode, args.mode)) {
      throw new Error(
        `Repository maintenance cannot transition from ${current.mode} to ${args.mode}.`,
      );
    }
    if (current.mode === args.mode) {
      return current;
    }

    const now = Date.now();
    if (current.mode === "draining" && args.mode === "frozen") {
      const blocker = await readFreezeBlocker(ctx, now);
      if (blocker !== null) {
        throw new Error(`Repository writes cannot freeze while ${blocker}.`);
      }
    }

    if (gate === null) {
      await ctx.db.insert("repositoryWriteGates", {
        scope: "global",
        mode: args.mode,
        changedAt: now,
      });
    } else {
      await ctx.db.patch(gate._id, {
        mode: args.mode,
        changedAt: now,
      });
    }

    return { mode: args.mode, changedAt: now };
  },
});
