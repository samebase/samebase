import { v, type Infer } from "convex/values";

import { components, internal } from "../_generated/api";
import type { Id, TableNames } from "../_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "../_generated/server";
import { deleteVaultLocalDataBatchForUser } from "../vault/deletion/cleanup";

const { id, literal, number, object, union } = v;

export const accountDeletionTablePolicy = union(
  literal("account_local"),
  literal("vault_local"),
  literal("provider_revocation"),
  literal("auth_finalization"),
  literal("receipt"),
  literal("global"),
  literal("user_finalization"),
);
export type AccountDeletionTablePolicy = Infer<typeof accountDeletionTablePolicy>;

/**
 * Every app table has one deletion owner. Adding a table to the schema fails
 * typechecking until its account-deletion policy is chosen here.
 */
export const ACCOUNT_DELETION_TABLE_REGISTRY = {
  authSessions: "auth_finalization",
  authAccounts: "auth_finalization",
  authRefreshTokens: "auth_finalization",
  authVerificationCodes: "auth_finalization",
  authVerifiers: "auth_finalization",
  authRateLimits: "auth_finalization",
  users: "user_finalization",
  accountDeletionRuns: "receipt",
  accountDeletionEvents: "receipt",
  providerConnections: "provider_revocation",
  connectedMachines: "account_local",
  machineRegistrationRequests: "account_local",
  machineRegistrationBootstrapRateLimits: "global",
  machineCredentials: "account_local",
  machineControlTokens: "account_local",
  dashboardSettings: "account_local",
  workspaceSidebarState: "account_local",
  vaultBranchFilters: "vault_local",
  vaultResourceLinksState: "vault_local",
  vaults: "vault_local",
  vaultApps: "vault_local",
  vaultCloudflareWorkers: "vault_local",
  vaultConvexDeployments: "vault_local",
  vaultConvexSchemaSnapshots: "vault_local",
  vaultConvexSchemaGraphLayouts: "vault_local",
  vaultRemoteBranches: "vault_local",
  githubCommitCheckSnapshots: "vault_local",
  githubCommitCheckItems: "vault_local",
  vaultBranchTrees: "vault_local",
  repositoryRefreshRequests: "vault_local",
  vaultInfrastructureTargets: "vault_local",
  vaultInfrastructureOwnership: "vault_local",
  appProvisioningRuns: "vault_local",
  appProvisioningEvents: "vault_local",
  vaultDeletionRuns: "account_local",
  vaultDeletionEvents: "account_local",
  vaultDomains: "vault_local",
  codespaces: "vault_local",
  fileStaging: "vault_local",
  blobs: "vault_local",
  folderExpansionState: "vault_local",
  agentGraphNodeLayout: "vault_local",
  agentThreadContext: "account_local",
  chatMessageMetadata: "account_local",
  aiProdAccessRequests: "account_local",
  aiProdAccessAudit: "account_local",
  oauthStates: "account_local",
  mcpOauthClients: "global",
  mcpAuthRequests: "account_local",
  mcpAuthorizationCodes: "account_local",
  mcpGrants: "account_local",
  mcpAccessTokens: "account_local",
  mcpRefreshTokens: "account_local",
  mcpAccessAudit: "account_local",
  agentBrowserHandoffs: "account_local",
  collaborativeUpdates: "vault_local",
} satisfies Record<TableNames, AccountDeletionTablePolicy>;

const accountLocalCleanupTarget = union(
  literal("githubCommitCheckItems"),
  literal("githubCommitCheckSnapshots"),
  literal("repositoryRefreshRequests"),
  literal("chatMessageMetadata"),
  literal("agentThreadContext"),
  literal("vaults"),
  literal("connectedMachines"),
  literal("machineRegistrationRequests"),
  literal("machineCredentials"),
  literal("machineControlTokens"),
  literal("dashboardSettings"),
  literal("workspaceSidebarState"),
  literal("oauthStates"),
  literal("mcpAuthRequests"),
  literal("mcpAuthorizationCodes"),
  literal("mcpAccessTokens"),
  literal("mcpRefreshTokens"),
  literal("agentBrowserHandoffs"),
  literal("mcpGrants"),
  literal("mcpAccessAudit"),
  literal("aiProdAccessAudit"),
  literal("aiProdAccessRequests"),
  literal("vaultDeletionEvents"),
  literal("vaultDeletionRuns"),
);
export type AccountLocalCleanupTarget = Infer<typeof accountLocalCleanupTarget>;

const accountLocalCleanupBatchResult = union(
  object({
    state: literal("blocked"),
    blocker: literal("active_vault_deletion"),
    runId: id("vaultDeletionRuns"),
  }),
  object({
    state: literal("blocked"),
    blocker: literal("active_app_provisioning"),
    runId: id("appProvisioningRuns"),
  }),
  object({
    state: literal("blocked"),
    blocker: literal("active_repository_refresh"),
    requestId: id("repositoryRefreshRequests"),
  }),
  object({
    state: literal("needs_more"),
    target: accountLocalCleanupTarget,
    rowsChanged: number(),
  }),
  object({ state: literal("done") }),
);
export type AccountLocalCleanupBatchResult = Infer<typeof accountLocalCleanupBatchResult>;

const ACCOUNT_LOCAL_CLEANUP_BATCH_SIZE = 25;
type AccountLocalCleanupCtx = Pick<MutationCtx, "db" | "storage">;

async function deleteRowsById<TableName extends TableNames>(
  ctx: AccountLocalCleanupCtx,
  rows: Array<{ _id: Id<TableName> }>,
): Promise<number> {
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
  return rows.length;
}

async function findActiveVaultDeletion(
  ctx: AccountLocalCleanupCtx,
  userId: Id<"users">,
): Promise<Id<"vaultDeletionRuns"> | null> {
  const queued = await ctx.db
    .query("vaultDeletionRuns")
    .withIndex("by_user_and_state_and_updated_at", (q) =>
      q.eq("userId", userId).eq("state", "queued"),
    )
    .order("asc")
    .first();
  if (queued) {
    return queued._id;
  }
  const running = await ctx.db
    .query("vaultDeletionRuns")
    .withIndex("by_user_and_state_and_updated_at", (q) =>
      q.eq("userId", userId).eq("state", "running"),
    )
    .order("asc")
    .first();
  return running?._id ?? null;
}

async function findActiveAppProvisioning(
  ctx: AccountLocalCleanupCtx,
  userId: Id<"users">,
): Promise<Id<"appProvisioningRuns"> | null> {
  for (const state of ["queued", "running"] as const) {
    const run = await ctx.db
      .query("appProvisioningRuns")
      .withIndex("by_user_and_state_and_updated_at", (q) =>
        q.eq("userId", userId).eq("state", state),
      )
      .order("asc")
      .first();
    if (run) {
      return run._id;
    }
  }
  return null;
}

async function findActiveRepositoryRefresh(
  ctx: AccountLocalCleanupCtx,
  userId: Id<"users">,
): Promise<Id<"repositoryRefreshRequests"> | null> {
  for (const state of ["queued", "scheduled", "running"] as const) {
    const request = await ctx.db
      .query("repositoryRefreshRequests")
      .withIndex("by_userId_and_lifecycle_state_and_updatedAt", (q) =>
        q.eq("userId", userId).eq("lifecycle.state", state),
      )
      .order("asc")
      .first();
    if (request) {
      return request._id;
    }
  }
  return null;
}

async function deleteThreadMetadataBatch(
  ctx: AccountLocalCleanupCtx,
  threadId: string,
): Promise<number> {
  const rows = await ctx.db
    .query("chatMessageMetadata")
    .withIndex("by_threadId", (q) => q.eq("threadId", threadId))
    .take(ACCOUNT_LOCAL_CLEANUP_BATCH_SIZE);
  return await deleteRowsById(ctx, rows);
}

async function cleanupVaultBatch(
  ctx: AccountLocalCleanupCtx,
  userId: Id<"users">,
): Promise<AccountLocalCleanupBatchResult | null> {
  const vault = await ctx.db
    .query("vaults")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .order("asc")
    .first();
  if (!vault) {
    return null;
  }

  if (vault.state === "connected") {
    const checkItems = await ctx.db
      .query("githubCommitCheckItems")
      .withIndex("by_githubRepositoryId_and_commitSha", (q) =>
        q.eq("githubRepositoryId", vault.ghRepoId),
      )
      .take(ACCOUNT_LOCAL_CLEANUP_BATCH_SIZE);
    if (checkItems.length > 0) {
      return {
        state: "needs_more",
        target: "githubCommitCheckItems",
        rowsChanged: await deleteRowsById(ctx, checkItems),
      };
    }
    const snapshots = await ctx.db
      .query("githubCommitCheckSnapshots")
      .withIndex("by_githubRepositoryId_and_commitSha", (q) =>
        q.eq("githubRepositoryId", vault.ghRepoId),
      )
      .take(ACCOUNT_LOCAL_CLEANUP_BATCH_SIZE);
    if (snapshots.length > 0) {
      return {
        state: "needs_more",
        target: "githubCommitCheckSnapshots",
        rowsChanged: await deleteRowsById(ctx, snapshots),
      };
    }
  }

  const context = await ctx.db
    .query("agentThreadContext")
    .withIndex("by_vault", (q) => q.eq("vaultId", vault._id))
    .first();
  if (context) {
    const metadataDeleted = await deleteThreadMetadataBatch(ctx, context.threadId);
    if (metadataDeleted > 0) {
      return {
        state: "needs_more",
        target: "chatMessageMetadata",
        rowsChanged: metadataDeleted,
      };
    }
    await ctx.db.delete(context._id);
    return { state: "needs_more", target: "agentThreadContext", rowsChanged: 1 };
  }

  const refreshRequests = await ctx.db
    .query("repositoryRefreshRequests")
    .withIndex("by_vaultId_and_updatedAt", (q) => q.eq("vaultId", vault._id))
    .take(ACCOUNT_LOCAL_CLEANUP_BATCH_SIZE);
  if (refreshRequests.length > 0) {
    return {
      state: "needs_more",
      target: "repositoryRefreshRequests",
      rowsChanged: await deleteRowsById(ctx, refreshRequests),
    };
  }

  const result = await deleteVaultLocalDataBatchForUser(ctx, {
    userId,
    vaultId: vault._id,
  });
  return result.state === "deleted"
    ? { state: "needs_more", target: "vaults", rowsChanged: 1 }
    : { state: "needs_more", target: "vaults", rowsChanged: result.rowsChanged };
}

/**
 * Deletes at most one bounded slice. The account workflow owns repetition and
 * does not advance while a separately-authorized vault deletion is active.
 */
export async function cleanupAccountLocalDataBatchForUser(
  ctx: AccountLocalCleanupCtx,
  args: { userId: Id<"users"> },
): Promise<AccountLocalCleanupBatchResult> {
  const activeVaultDeletionRunId = await findActiveVaultDeletion(ctx, args.userId);
  if (activeVaultDeletionRunId) {
    return {
      state: "blocked",
      blocker: "active_vault_deletion",
      runId: activeVaultDeletionRunId,
    };
  }

  const activeProvisioningRunId = await findActiveAppProvisioning(ctx, args.userId);
  if (activeProvisioningRunId) {
    return {
      state: "blocked",
      blocker: "active_app_provisioning",
      runId: activeProvisioningRunId,
    };
  }

  const activeRefreshRequestId = await findActiveRepositoryRefresh(ctx, args.userId);
  if (activeRefreshRequestId) {
    return {
      state: "blocked",
      blocker: "active_repository_refresh",
      requestId: activeRefreshRequestId,
    };
  }

  const vaultResult = await cleanupVaultBatch(ctx, args.userId);
  if (vaultResult) {
    return vaultResult;
  }

  const context = await ctx.db
    .query("agentThreadContext")
    .withIndex("by_userId", (q) => q.eq("userId", args.userId))
    .first();
  if (context) {
    const metadataDeleted = await deleteThreadMetadataBatch(ctx, context.threadId);
    if (metadataDeleted > 0) {
      return {
        state: "needs_more",
        target: "chatMessageMetadata",
        rowsChanged: metadataDeleted,
      };
    }
    await ctx.db.delete(context._id);
    return { state: "needs_more", target: "agentThreadContext", rowsChanged: 1 };
  }

  const connectedMachines = await ctx.db
    .query("connectedMachines")
    .withIndex("by_user", (q) => q.eq("userId", args.userId))
    .take(ACCOUNT_LOCAL_CLEANUP_BATCH_SIZE);
  if (connectedMachines.length > 0) {
    return {
      state: "needs_more",
      target: "connectedMachines",
      rowsChanged: await deleteRowsById(ctx, connectedMachines),
    };
  }

  const registrationRequests = await ctx.db
    .query("machineRegistrationRequests")
    .withIndex("by_user", (q) => q.eq("userId", args.userId))
    .take(ACCOUNT_LOCAL_CLEANUP_BATCH_SIZE);
  if (registrationRequests.length > 0) {
    return {
      state: "needs_more",
      target: "machineRegistrationRequests",
      rowsChanged: await deleteRowsById(ctx, registrationRequests),
    };
  }

  const machineCredentials = await ctx.db
    .query("machineCredentials")
    .withIndex("by_user_machine_id", (q) => q.eq("userId", args.userId))
    .take(ACCOUNT_LOCAL_CLEANUP_BATCH_SIZE);
  if (machineCredentials.length > 0) {
    return {
      state: "needs_more",
      target: "machineCredentials",
      rowsChanged: await deleteRowsById(ctx, machineCredentials),
    };
  }

  const machineControlTokens = await ctx.db
    .query("machineControlTokens")
    .withIndex("by_user_machine_id", (q) => q.eq("userId", args.userId))
    .take(ACCOUNT_LOCAL_CLEANUP_BATCH_SIZE);
  if (machineControlTokens.length > 0) {
    return {
      state: "needs_more",
      target: "machineControlTokens",
      rowsChanged: await deleteRowsById(ctx, machineControlTokens),
    };
  }

  const dashboardSettings = await ctx.db
    .query("dashboardSettings")
    .withIndex("by_user", (q) => q.eq("userId", args.userId))
    .take(ACCOUNT_LOCAL_CLEANUP_BATCH_SIZE);
  if (dashboardSettings.length > 0) {
    return {
      state: "needs_more",
      target: "dashboardSettings",
      rowsChanged: await deleteRowsById(ctx, dashboardSettings),
    };
  }

  const sidebarState = await ctx.db
    .query("workspaceSidebarState")
    .withIndex("by_user_and_workspace_key", (q) => q.eq("userId", args.userId))
    .take(ACCOUNT_LOCAL_CLEANUP_BATCH_SIZE);
  if (sidebarState.length > 0) {
    return {
      state: "needs_more",
      target: "workspaceSidebarState",
      rowsChanged: await deleteRowsById(ctx, sidebarState),
    };
  }

  const oauthStates = await ctx.db
    .query("oauthStates")
    .withIndex("by_user", (q) => q.eq("userId", args.userId))
    .take(ACCOUNT_LOCAL_CLEANUP_BATCH_SIZE);
  if (oauthStates.length > 0) {
    return {
      state: "needs_more",
      target: "oauthStates",
      rowsChanged: await deleteRowsById(ctx, oauthStates),
    };
  }

  const mcpAuthRequests = await ctx.db
    .query("mcpAuthRequests")
    .withIndex("by_user_id", (q) => q.eq("userId", args.userId))
    .take(ACCOUNT_LOCAL_CLEANUP_BATCH_SIZE);
  if (mcpAuthRequests.length > 0) {
    return {
      state: "needs_more",
      target: "mcpAuthRequests",
      rowsChanged: await deleteRowsById(ctx, mcpAuthRequests),
    };
  }

  const authorizationCodes = await ctx.db
    .query("mcpAuthorizationCodes")
    .withIndex("by_user_id", (q) => q.eq("userId", args.userId))
    .take(ACCOUNT_LOCAL_CLEANUP_BATCH_SIZE);
  if (authorizationCodes.length > 0) {
    return {
      state: "needs_more",
      target: "mcpAuthorizationCodes",
      rowsChanged: await deleteRowsById(ctx, authorizationCodes),
    };
  }

  const accessTokens = await ctx.db
    .query("mcpAccessTokens")
    .withIndex("by_user_id", (q) => q.eq("userId", args.userId))
    .take(ACCOUNT_LOCAL_CLEANUP_BATCH_SIZE);
  if (accessTokens.length > 0) {
    return {
      state: "needs_more",
      target: "mcpAccessTokens",
      rowsChanged: await deleteRowsById(ctx, accessTokens),
    };
  }

  const refreshTokens = await ctx.db
    .query("mcpRefreshTokens")
    .withIndex("by_user_id", (q) => q.eq("userId", args.userId))
    .take(ACCOUNT_LOCAL_CLEANUP_BATCH_SIZE);
  if (refreshTokens.length > 0) {
    return {
      state: "needs_more",
      target: "mcpRefreshTokens",
      rowsChanged: await deleteRowsById(ctx, refreshTokens),
    };
  }

  const handoffs = await ctx.db
    .query("agentBrowserHandoffs")
    .withIndex("by_user_id", (q) => q.eq("userId", args.userId))
    .take(ACCOUNT_LOCAL_CLEANUP_BATCH_SIZE);
  if (handoffs.length > 0) {
    return {
      state: "needs_more",
      target: "agentBrowserHandoffs",
      rowsChanged: await deleteRowsById(ctx, handoffs),
    };
  }

  const grants = await ctx.db
    .query("mcpGrants")
    .withIndex("by_user_id", (q) => q.eq("userId", args.userId))
    .take(ACCOUNT_LOCAL_CLEANUP_BATCH_SIZE);
  if (grants.length > 0) {
    return {
      state: "needs_more",
      target: "mcpGrants",
      rowsChanged: await deleteRowsById(ctx, grants),
    };
  }

  const mcpAudit = await ctx.db
    .query("mcpAccessAudit")
    .withIndex("by_user_id", (q) => q.eq("userId", args.userId))
    .take(ACCOUNT_LOCAL_CLEANUP_BATCH_SIZE);
  if (mcpAudit.length > 0) {
    return {
      state: "needs_more",
      target: "mcpAccessAudit",
      rowsChanged: await deleteRowsById(ctx, mcpAudit),
    };
  }

  const prodAudit = await ctx.db
    .query("aiProdAccessAudit")
    .withIndex("by_actor", (q) => q.eq("actorUserId", args.userId))
    .take(ACCOUNT_LOCAL_CLEANUP_BATCH_SIZE);
  if (prodAudit.length > 0) {
    return {
      state: "needs_more",
      target: "aiProdAccessAudit",
      rowsChanged: await deleteRowsById(ctx, prodAudit),
    };
  }

  const prodRequest = await ctx.db
    .query("aiProdAccessRequests")
    .withIndex("by_requester", (q) => q.eq("requesterUserId", args.userId))
    .first();
  if (prodRequest) {
    const requestAudit = await ctx.db
      .query("aiProdAccessAudit")
      .withIndex("by_request", (q) => q.eq("requestId", prodRequest._id))
      .take(ACCOUNT_LOCAL_CLEANUP_BATCH_SIZE);
    if (requestAudit.length > 0) {
      return {
        state: "needs_more",
        target: "aiProdAccessAudit",
        rowsChanged: await deleteRowsById(ctx, requestAudit),
      };
    }
    await ctx.db.delete(prodRequest._id);
    return { state: "needs_more", target: "aiProdAccessRequests", rowsChanged: 1 };
  }

  const approvedRequest = await ctx.db
    .query("aiProdAccessRequests")
    .withIndex("by_approved_by", (q) => q.eq("approvedBy", args.userId))
    .first();
  if (approvedRequest) {
    await ctx.db.patch(approvedRequest._id, { approvedBy: undefined });
    return { state: "needs_more", target: "aiProdAccessRequests", rowsChanged: 1 };
  }

  const deletionRun = await ctx.db
    .query("vaultDeletionRuns")
    .withIndex("by_user_and_updated_at", (q) => q.eq("userId", args.userId))
    .order("asc")
    .first();
  if (deletionRun) {
    const events = await ctx.db
      .query("vaultDeletionEvents")
      .withIndex("by_run_and_created_at", (q) => q.eq("runId", deletionRun._id))
      .take(ACCOUNT_LOCAL_CLEANUP_BATCH_SIZE);
    if (events.length > 0) {
      return {
        state: "needs_more",
        target: "vaultDeletionEvents",
        rowsChanged: await deleteRowsById(ctx, events),
      };
    }
    await ctx.db.delete(deletionRun._id);
    return { state: "needs_more", target: "vaultDeletionRuns", rowsChanged: 1 };
  }

  return { state: "done" };
}

export const cleanupAccountLocalDataBatch = internalMutation({
  args: { runId: id("accountDeletionRuns") },
  returns: accountLocalCleanupBatchResult,
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run || run.identity.state !== "active") {
      throw new Error("Active account deletion run not found.");
    }
    return await cleanupAccountLocalDataBatchForUser(ctx, {
      userId: run.identity.userId,
    });
  },
});

export const resolveActiveUserId = internalQuery({
  args: { runId: id("accountDeletionRuns") },
  returns: id("users"),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run || run.identity.state !== "active") {
      throw new Error("Active account deletion run not found.");
    }
    return run.identity.userId;
  },
});

/** The Agent component owns its own bounded, internally-rescheduled deletion. */
export const cleanupAgentComponentData = internalAction({
  args: { runId: id("accountDeletionRuns") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId: Id<"users"> = await ctx.runQuery(
      internal.accountDeletion.cleanup.resolveActiveUserId,
      { runId: args.runId },
    );
    await ctx.runAction(components.agent.users.deleteAllForUserId, {
      userId,
    });
    return null;
  },
});
