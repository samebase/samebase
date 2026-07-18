import { entries } from "@samebase/dependent/object";
import { v, type Infer } from "convex/values";

import { components } from "../_generated/api";
import type { Id, TableNames } from "../_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx } from "../_generated/server";
import {
  deleteVaultLocalDataBatchForUser,
  type VaultLocalCleanupBatchResult,
} from "../vault/deletion/cleanup";
import {
  type AccountDeletionDataProgress,
  type AccountDeletionVaultCleanupPhase,
  vAccountDeletionVaultCleanupPhase,
} from "./model";
import { readOwnedActiveRun } from "./stepContext";

const { id, literal, number, object, union } = v;

type AccountDeletionTablePolicy =
  | "account_local"
  | "vault_local"
  | "provider_revocation"
  | "auth_finalization"
  | "receipt"
  | "global"
  | "action_quiescence"
  | "user_finalization";

/**
 * Every app table has one deletion owner. Adding a table to the schema fails
 * typechecking until its account-deletion policy is chosen here.
 */
const ACCOUNT_DELETION_TABLE_REGISTRY = {
  authSessions: "auth_finalization",
  authAccounts: "auth_finalization",
  authRefreshTokens: "auth_finalization",
  authVerificationCodes: "auth_finalization",
  authVerifiers: "auth_finalization",
  authRateLimits: "auth_finalization",
  users: "user_finalization",
  operations_accountDeletionRuns: "receipt",
  operations_accountDeletionEvents: "receipt",
  operations_agentActionLeases: "action_quiescence",
  providerConnections: "provider_revocation",
  connectedMachines: "account_local",
  operations_machineRegistrationRequests: "account_local",
  operations_machineRegistrationBootstrapRateLimits: "global",
  operations_machineCredentials: "account_local",
  operations_machineControlTokens: "account_local",
  ui_dashboardSettings: "account_local",
  ui_workspaceSidebarState: "account_local",
  ui_vaultBranchFilters: "vault_local",
  ui_vaultResourceLinksState: "vault_local",
  vaults: "vault_local",
  vaultApps: "vault_local",
  vaultCloudflareWorkers: "vault_local",
  vaultConvexDeployments: "vault_local",
  observations_vaultConvexSchemaSnapshots: "vault_local",
  ui_vaultConvexSchemaGraphLayouts: "vault_local",
  observations_vaultRemoteBranches: "vault_local",
  observations_vaultCommitCheckSnapshots: "global",
  observations_vaultCommitCheckItems: "global",
  observations_vaultBranchTrees: "vault_local",
  operations_vaultRepositoryRefreshRequests: "vault_local",
  operations_vaultProvisioningPlans: "vault_local",
  operations_vaultProvisioningRunClaims: "vault_local",
  operations_vaultProvisioningRuns: "vault_local",
  operations_vaultProvisioningEvents: "vault_local",
  operations_vaultDeletionRuns: "account_local",
  operations_vaultDeletionEvents: "account_local",
  vaultDomains: "vault_local",
  codespaces: "vault_local",
  operations_fileStaging: "vault_local",
  observations_vaultFileBlobs: "vault_local",
  ui_folderExpansionState: "vault_local",
  ui_agentGraphNodeLayout: "vault_local",
  agentThreadContext: "account_local",
  chatMessageMetadata: "account_local",
  operations_aiProductionReadRequests: "account_local",
  audit_aiProductionReadEvents: "account_local",
  operations_providerOauthCallbackStates: "account_local",
  mcpOauthClients: "global",
  operations_mcpAuthorizationRequests: "account_local",
  operations_mcpAuthorizationCodes: "account_local",
  mcpGrants: "account_local",
  operations_mcpAccessTokens: "account_local",
  operations_mcpRefreshTokens: "account_local",
  audit_mcpAccessEvents: "account_local",
  operations_mcpBrowserLoginHandoffs: "account_local",
  operations_collaborativeFileUpdates: "vault_local",
} satisfies Record<TableNames, AccountDeletionTablePolicy>;

type AccountLocalTableName = {
  [TableName in TableNames]: (typeof ACCOUNT_DELETION_TABLE_REGISTRY)[TableName] extends "account_local"
    ? TableName
    : never;
}[TableNames];

const accountLocalCleanupTarget = union(
  literal("operations_vaultRepositoryRefreshRequests"),
  literal("chatMessageMetadata"),
  literal("agentThreadContext"),
  literal("vaults"),
  literal("connectedMachines"),
  literal("operations_machineRegistrationRequests"),
  literal("operations_machineCredentials"),
  literal("operations_machineControlTokens"),
  literal("ui_dashboardSettings"),
  literal("ui_workspaceSidebarState"),
  literal("operations_providerOauthCallbackStates"),
  literal("operations_mcpAuthorizationRequests"),
  literal("operations_mcpAuthorizationCodes"),
  literal("operations_mcpAccessTokens"),
  literal("operations_mcpRefreshTokens"),
  literal("operations_mcpBrowserLoginHandoffs"),
  literal("mcpGrants"),
  literal("audit_mcpAccessEvents"),
  literal("audit_aiProductionReadEvents"),
  literal("operations_aiProductionReadRequests"),
  literal("operations_vaultDeletionEvents"),
  literal("operations_vaultDeletionRuns"),
);
const accountLocalCleanupBatchResult = union(
  object({
    state: literal("blocked"),
    blocker: literal("active_vault_deletion"),
    runId: id("operations_vaultDeletionRuns"),
  }),
  object({
    state: literal("blocked"),
    blocker: literal("active_app_provisioning"),
    runId: id("operations_vaultProvisioningRuns"),
  }),
  object({
    state: literal("blocked"),
    blocker: literal("active_repository_refresh"),
    requestId: id("operations_vaultRepositoryRefreshRequests"),
  }),
  object({
    state: literal("needs_more"),
    target: accountLocalCleanupTarget,
    rowsChanged: number(),
  }),
  object({ state: literal("done") }),
);
type AccountLocalCleanupBatchResult = Infer<typeof accountLocalCleanupBatchResult>;

export const vSimpleDataDeletionGroup = union(
  literal("chatsAndAgentData"),
  literal("connectedMachines"),
  literal("preferences"),
  literal("appAccessAndTokens"),
  literal("accessRequestsAndHistory"),
);
export type SimpleDataDeletionGroup = Infer<typeof vSimpleDataDeletionGroup>;

const vVaultDataCleanupBatchResult = union(
  object({
    state: literal("needs_more"),
    currentPhase: vAccountDeletionVaultCleanupPhase,
    rowsChanged: number(),
  }),
  object({ state: literal("vault_deleted") }),
  object({ state: literal("done") }),
);
type VaultDataCleanupBatchResult = Infer<typeof vVaultDataCleanupBatchResult>;

const accountDeletionQuiescenceResult = union(
  object({ state: literal("done") }),
  object({ state: literal("waiting"), blocker: literal("active_vault_deletion") }),
  object({ state: literal("waiting"), blocker: literal("active_app_provisioning") }),
  object({
    state: literal("waiting"),
    blocker: literal("active_agent_action"),
    retryAfterMs: number(),
  }),
);

const ACCOUNT_LOCAL_CLEANUP_BATCH_SIZE = 25;
const ACTIVE_WORK_BLOCKS_DELETION_ERROR = "Account deletion cleanup is blocked by active work.";
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
): Promise<Id<"operations_vaultDeletionRuns"> | null> {
  const queued = await ctx.db
    .query("operations_vaultDeletionRuns")
    .withIndex("by_user_and_state_and_updated_at", (q) =>
      q.eq("userId", userId).eq("state", "queued"),
    )
    .order("asc")
    .first();

  if (queued) {
    return queued._id;
  }

  const running = await ctx.db
    .query("operations_vaultDeletionRuns")
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
): Promise<Id<"operations_vaultProvisioningRuns"> | null> {
  for (const state of ["queued", "running"] as const) {
    const run = await ctx.db
      .query("operations_vaultProvisioningRuns")
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
): Promise<Id<"operations_vaultRepositoryRefreshRequests"> | null> {
  for (const state of ["queued", "scheduled", "running"] as const) {
    const request = await ctx.db
      .query("operations_vaultRepositoryRefreshRequests")
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

async function findAccountDeletionCleanupBlocker(
  ctx: AccountLocalCleanupCtx,
  userId: Id<"users">,
): Promise<Extract<AccountLocalCleanupBatchResult, { state: "blocked" }> | null> {
  const activeVaultDeletionRunId = await findActiveVaultDeletion(ctx, userId);

  if (activeVaultDeletionRunId) {
    return {
      state: "blocked",
      blocker: "active_vault_deletion",
      runId: activeVaultDeletionRunId,
    };
  }

  const activeProvisioningRunId = await findActiveAppProvisioning(ctx, userId);

  if (activeProvisioningRunId) {
    return {
      state: "blocked",
      blocker: "active_app_provisioning",
      runId: activeProvisioningRunId,
    };
  }

  const activeRefreshRequestId = await findActiveRepositoryRefresh(ctx, userId);

  return activeRefreshRequestId
    ? {
        state: "blocked",
        blocker: "active_repository_refresh",
        requestId: activeRefreshRequestId,
      }
    : null;
}

async function assertAccountDeletionCleanupIsQuiescent(
  ctx: AccountLocalCleanupCtx,
  userId: Id<"users">,
) {
  if (await findAccountDeletionCleanupBlocker(ctx, userId)) {
    throw new Error(ACTIVE_WORK_BLOCKS_DELETION_ERROR);
  }
}

async function deleteThreadMetadataBatch(
  ctx: AccountLocalCleanupCtx,
  threadId: string,
): Promise<number> {
  const rows = await ctx.db
    .query("chatMessageMetadata")
    .withIndex("by_threadId", (q) => q.eq("threadId", threadId))
    .take(ACCOUNT_LOCAL_CLEANUP_BATCH_SIZE);

  return deleteRowsById(ctx, rows);
}

async function cleanupVaultBatch(
  ctx: AccountLocalCleanupCtx,
  userId: Id<"users">,
): Promise<VaultDataCleanupBatchResult> {
  const vault = await ctx.db
    .query("vaults")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .order("asc")
    .first();

  if (!vault) {
    return { state: "done" };
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
        currentPhase: "vault_data",
        rowsChanged: metadataDeleted,
      };
    }

    await ctx.db.delete(context._id);

    return { state: "needs_more", currentPhase: "vault_data", rowsChanged: 1 };
  }

  const refreshRequests = await ctx.db
    .query("operations_vaultRepositoryRefreshRequests")
    .withIndex("by_vaultId_and_updatedAt", (q) => q.eq("vaultId", vault._id))
    .take(ACCOUNT_LOCAL_CLEANUP_BATCH_SIZE);

  if (refreshRequests.length > 0) {
    return {
      state: "needs_more",
      currentPhase: "source_data",
      rowsChanged: await deleteRowsById(ctx, refreshRequests),
    };
  }

  const result = await deleteVaultLocalDataBatchForUser(ctx, {
    userId,
    vaultId: vault._id,
  });

  return result.state === "deleted"
    ? { state: "vault_deleted" }
    : {
        state: "needs_more",
        currentPhase: vaultCleanupPhase(result),
        rowsChanged: result.rowsChanged,
      };
}

function vaultCleanupPhase(
  result: Extract<VaultLocalCleanupBatchResult, { state: "needs_more" }>,
): AccountDeletionVaultCleanupPhase {
  switch (result.table) {
    case "operations_fileStaging":
    case "operations_collaborativeFileUpdates":
    case "observations_vaultFileBlobs":
      return "staged_changes";
    case "ui_vaultBranchFilters":
    case "ui_vaultResourceLinksState":
    case "ui_folderExpansionState":
    case "observations_vaultRemoteBranches":
    case "observations_vaultBranchTrees":
    case "operations_vaultRepositoryRefreshRequests":
      return "source_data";
    case "vaultDomains":
    case "vaultApps":
    case "vaultConvexDeployments":
    case "observations_vaultConvexSchemaSnapshots":
    case "ui_vaultConvexSchemaGraphLayouts":
    case "vaultCloudflareWorkers":
    case "operations_vaultProvisioningPlans":
    case "operations_vaultProvisioningRunClaims":
    case "codespaces":
    case "ui_agentGraphNodeLayout":
    case "agentThreadContext":
      return "app_data";
    case "operations_aiProductionReadRequests":
      return "access_state";
    case "operations_vaultProvisioningEvents":
    case "operations_vaultProvisioningRuns":
      return "provisioning_history";
    default:
      result.table satisfies never;
      return "vault_data";
  }
}

type AccountLocalCleanupHandler = (
  ctx: AccountLocalCleanupCtx,
  userId: Id<"users">,
) => Promise<AccountLocalCleanupBatchResult | null>;

/**
 * Property order is the production cleanup order. Every account-local table
 * must provide the handler that the account deletion workflow executes.
 */
const ACCOUNT_LOCAL_CLEANUP_HANDLERS = {
  chatMessageMetadata: async (ctx, userId) => {
    const context = await ctx.db
      .query("agentThreadContext")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    if (!context) {
      return null;
    }

    const rowsChanged = await deleteThreadMetadataBatch(ctx, context.threadId);

    return rowsChanged > 0
      ? { state: "needs_more", target: "chatMessageMetadata", rowsChanged }
      : null;
  },
  agentThreadContext: async (ctx, userId) => {
    const context = await ctx.db
      .query("agentThreadContext")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    if (!context) {
      return null;
    }

    await ctx.db.delete(context._id);

    return { state: "needs_more", target: "agentThreadContext", rowsChanged: 1 };
  },
  operations_machineCredentials: async (ctx, userId) => {
    const rows = await ctx.db
      .query("operations_machineCredentials")
      .withIndex("by_user_machine_id", (q) => q.eq("userId", userId))
      .take(ACCOUNT_LOCAL_CLEANUP_BATCH_SIZE);

    return rows.length > 0
      ? {
          state: "needs_more",
          target: "operations_machineCredentials",
          rowsChanged: await deleteRowsById(ctx, rows),
        }
      : null;
  },
  operations_machineControlTokens: async (ctx, userId) => {
    const rows = await ctx.db
      .query("operations_machineControlTokens")
      .withIndex("by_user_machine_id", (q) => q.eq("userId", userId))
      .take(ACCOUNT_LOCAL_CLEANUP_BATCH_SIZE);

    return rows.length > 0
      ? {
          state: "needs_more",
          target: "operations_machineControlTokens",
          rowsChanged: await deleteRowsById(ctx, rows),
        }
      : null;
  },
  operations_machineRegistrationRequests: async (ctx, userId) => {
    const rows = await ctx.db
      .query("operations_machineRegistrationRequests")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(ACCOUNT_LOCAL_CLEANUP_BATCH_SIZE);

    return rows.length > 0
      ? {
          state: "needs_more",
          target: "operations_machineRegistrationRequests",
          rowsChanged: await deleteRowsById(ctx, rows),
        }
      : null;
  },
  connectedMachines: async (ctx, userId) => {
    const rows = await ctx.db
      .query("connectedMachines")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(ACCOUNT_LOCAL_CLEANUP_BATCH_SIZE);

    return rows.length > 0
      ? {
          state: "needs_more",
          target: "connectedMachines",
          rowsChanged: await deleteRowsById(ctx, rows),
        }
      : null;
  },
  ui_dashboardSettings: async (ctx, userId) => {
    const rows = await ctx.db
      .query("ui_dashboardSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(ACCOUNT_LOCAL_CLEANUP_BATCH_SIZE);

    return rows.length > 0
      ? {
          state: "needs_more",
          target: "ui_dashboardSettings",
          rowsChanged: await deleteRowsById(ctx, rows),
        }
      : null;
  },
  ui_workspaceSidebarState: async (ctx, userId) => {
    const rows = await ctx.db
      .query("ui_workspaceSidebarState")
      .withIndex("by_user_and_workspace_key", (q) => q.eq("userId", userId))
      .take(ACCOUNT_LOCAL_CLEANUP_BATCH_SIZE);

    return rows.length > 0
      ? {
          state: "needs_more",
          target: "ui_workspaceSidebarState",
          rowsChanged: await deleteRowsById(ctx, rows),
        }
      : null;
  },
  operations_providerOauthCallbackStates: async (ctx, userId) => {
    const rows = await ctx.db
      .query("operations_providerOauthCallbackStates")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(ACCOUNT_LOCAL_CLEANUP_BATCH_SIZE);

    return rows.length > 0
      ? {
          state: "needs_more",
          target: "operations_providerOauthCallbackStates",
          rowsChanged: await deleteRowsById(ctx, rows),
        }
      : null;
  },
  operations_mcpAuthorizationRequests: async (ctx, userId) => {
    const rows = await ctx.db
      .query("operations_mcpAuthorizationRequests")
      .withIndex("by_user_id", (q) => q.eq("userId", userId))
      .take(ACCOUNT_LOCAL_CLEANUP_BATCH_SIZE);

    return rows.length > 0
      ? {
          state: "needs_more",
          target: "operations_mcpAuthorizationRequests",
          rowsChanged: await deleteRowsById(ctx, rows),
        }
      : null;
  },
  operations_mcpAuthorizationCodes: async (ctx, userId) => {
    const rows = await ctx.db
      .query("operations_mcpAuthorizationCodes")
      .withIndex("by_user_id", (q) => q.eq("userId", userId))
      .take(ACCOUNT_LOCAL_CLEANUP_BATCH_SIZE);

    return rows.length > 0
      ? {
          state: "needs_more",
          target: "operations_mcpAuthorizationCodes",
          rowsChanged: await deleteRowsById(ctx, rows),
        }
      : null;
  },
  operations_mcpAccessTokens: async (ctx, userId) => {
    const rows = await ctx.db
      .query("operations_mcpAccessTokens")
      .withIndex("by_user_id", (q) => q.eq("userId", userId))
      .take(ACCOUNT_LOCAL_CLEANUP_BATCH_SIZE);

    return rows.length > 0
      ? {
          state: "needs_more",
          target: "operations_mcpAccessTokens",
          rowsChanged: await deleteRowsById(ctx, rows),
        }
      : null;
  },
  operations_mcpRefreshTokens: async (ctx, userId) => {
    const rows = await ctx.db
      .query("operations_mcpRefreshTokens")
      .withIndex("by_user_id", (q) => q.eq("userId", userId))
      .take(ACCOUNT_LOCAL_CLEANUP_BATCH_SIZE);

    return rows.length > 0
      ? {
          state: "needs_more",
          target: "operations_mcpRefreshTokens",
          rowsChanged: await deleteRowsById(ctx, rows),
        }
      : null;
  },
  operations_mcpBrowserLoginHandoffs: async (ctx, userId) => {
    const rows = await ctx.db
      .query("operations_mcpBrowserLoginHandoffs")
      .withIndex("by_user_id", (q) => q.eq("userId", userId))
      .take(ACCOUNT_LOCAL_CLEANUP_BATCH_SIZE);

    return rows.length > 0
      ? {
          state: "needs_more",
          target: "operations_mcpBrowserLoginHandoffs",
          rowsChanged: await deleteRowsById(ctx, rows),
        }
      : null;
  },
  mcpGrants: async (ctx, userId) => {
    const rows = await ctx.db
      .query("mcpGrants")
      .withIndex("by_user_id", (q) => q.eq("userId", userId))
      .take(ACCOUNT_LOCAL_CLEANUP_BATCH_SIZE);

    return rows.length > 0
      ? {
          state: "needs_more",
          target: "mcpGrants",
          rowsChanged: await deleteRowsById(ctx, rows),
        }
      : null;
  },
  audit_mcpAccessEvents: async (ctx, userId) => {
    const rows = await ctx.db
      .query("audit_mcpAccessEvents")
      .withIndex("by_user_id", (q) => q.eq("userId", userId))
      .take(ACCOUNT_LOCAL_CLEANUP_BATCH_SIZE);

    return rows.length > 0
      ? {
          state: "needs_more",
          target: "audit_mcpAccessEvents",
          rowsChanged: await deleteRowsById(ctx, rows),
        }
      : null;
  },
  audit_aiProductionReadEvents: async (ctx, userId) => {
    const rows = await ctx.db
      .query("audit_aiProductionReadEvents")
      .withIndex("by_actor", (q) => q.eq("actorUserId", userId))
      .take(ACCOUNT_LOCAL_CLEANUP_BATCH_SIZE);

    return rows.length > 0
      ? {
          state: "needs_more",
          target: "audit_aiProductionReadEvents",
          rowsChanged: await deleteRowsById(ctx, rows),
        }
      : null;
  },
  operations_aiProductionReadRequests: async (ctx, userId) => {
    const requested = await ctx.db
      .query("operations_aiProductionReadRequests")
      .withIndex("by_requester", (q) => q.eq("requesterUserId", userId))
      .first();

    if (requested) {
      const audit = await ctx.db
        .query("audit_aiProductionReadEvents")
        .withIndex("by_request", (q) => q.eq("requestId", requested._id))
        .take(ACCOUNT_LOCAL_CLEANUP_BATCH_SIZE);

      if (audit.length > 0) {
        return {
          state: "needs_more",
          target: "audit_aiProductionReadEvents",
          rowsChanged: await deleteRowsById(ctx, audit),
        };
      }

      await ctx.db.delete(requested._id);

      return { state: "needs_more", target: "operations_aiProductionReadRequests", rowsChanged: 1 };
    }

    const approved = await ctx.db
      .query("operations_aiProductionReadRequests")
      .withIndex("by_approved_by", (q) => q.eq("approvedBy", userId))
      .first();

    if (!approved) {
      return null;
    }

    await ctx.db.patch(approved._id, { approvedBy: undefined });

    return { state: "needs_more", target: "operations_aiProductionReadRequests", rowsChanged: 1 };
  },
  operations_vaultDeletionEvents: async (ctx, userId) => {
    const run = await ctx.db
      .query("operations_vaultDeletionRuns")
      .withIndex("by_user_and_updated_at", (q) => q.eq("userId", userId))
      .order("asc")
      .first();

    if (!run) {
      return null;
    }

    const rows = await ctx.db
      .query("operations_vaultDeletionEvents")
      .withIndex("by_run_and_created_at", (q) => q.eq("runId", run._id))
      .take(ACCOUNT_LOCAL_CLEANUP_BATCH_SIZE);

    return rows.length > 0
      ? {
          state: "needs_more",
          target: "operations_vaultDeletionEvents",
          rowsChanged: await deleteRowsById(ctx, rows),
        }
      : null;
  },
  operations_vaultDeletionRuns: async (ctx, userId) => {
    const run = await ctx.db
      .query("operations_vaultDeletionRuns")
      .withIndex("by_user_and_updated_at", (q) => q.eq("userId", userId))
      .order("asc")
      .first();

    if (!run) {
      return null;
    }

    await ctx.db.delete(run._id);

    return { state: "needs_more", target: "operations_vaultDeletionRuns", rowsChanged: 1 };
  },
} satisfies Record<AccountLocalTableName, AccountLocalCleanupHandler>;

const ACCOUNT_LOCAL_CLEANUP_GROUPS = {
  chatMessageMetadata: "chatsAndAgentData",
  agentThreadContext: "chatsAndAgentData",
  operations_machineCredentials: "connectedMachines",
  operations_machineControlTokens: "connectedMachines",
  operations_machineRegistrationRequests: "connectedMachines",
  connectedMachines: "connectedMachines",
  ui_dashboardSettings: "preferences",
  ui_workspaceSidebarState: "preferences",
  operations_providerOauthCallbackStates: "appAccessAndTokens",
  operations_mcpAuthorizationRequests: "appAccessAndTokens",
  operations_mcpAuthorizationCodes: "appAccessAndTokens",
  operations_mcpAccessTokens: "appAccessAndTokens",
  operations_mcpRefreshTokens: "appAccessAndTokens",
  operations_mcpBrowserLoginHandoffs: "appAccessAndTokens",
  mcpGrants: "appAccessAndTokens",
  audit_mcpAccessEvents: "accessRequestsAndHistory",
  audit_aiProductionReadEvents: "accessRequestsAndHistory",
  operations_aiProductionReadRequests: "accessRequestsAndHistory",
  operations_vaultDeletionEvents: "accessRequestsAndHistory",
  operations_vaultDeletionRuns: "accessRequestsAndHistory",
} satisfies Record<AccountLocalTableName, SimpleDataDeletionGroup>;

/**
 * Deletes at most one bounded slice. The account workflow owns repetition and
 * does not advance while a separately-authorized vault deletion is active.
 */
export async function cleanupAccountLocalDataBatchForUser(
  ctx: AccountLocalCleanupCtx,
  args: { userId: Id<"users"> },
): Promise<AccountLocalCleanupBatchResult> {
  const blocker = await findAccountDeletionCleanupBlocker(ctx, args.userId);

  if (blocker) {
    return blocker;
  }

  const vaultResult = await cleanupVaultBatch(ctx, args.userId);

  if (vaultResult.state === "needs_more") {
    return { state: "needs_more", target: "vaults", rowsChanged: vaultResult.rowsChanged };
  }

  if (vaultResult.state === "vault_deleted") {
    return { state: "needs_more", target: "vaults", rowsChanged: 1 };
  }

  const refreshRequests = await ctx.db
    .query("operations_vaultRepositoryRefreshRequests")
    .withIndex("by_userId_and_updatedAt", (q) => q.eq("userId", args.userId))
    .take(ACCOUNT_LOCAL_CLEANUP_BATCH_SIZE);

  if (refreshRequests.length > 0) {
    return {
      state: "needs_more",
      target: "operations_vaultRepositoryRefreshRequests",
      rowsChanged: await deleteRowsById(ctx, refreshRequests),
    };
  }

  for (const cleanup of Object.values(ACCOUNT_LOCAL_CLEANUP_HANDLERS)) {
    const result = await cleanup(ctx, args.userId);

    if (result) {
      return result;
    }
  }

  return { state: "done" };
}

export const cleanupDataDeletionGroupBatch = internalMutation({
  args: {
    runId: id("operations_accountDeletionRuns"),
    workflowId: v.string(),
    group: vSimpleDataDeletionGroup,
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const run = await readOwnedActiveRun(ctx, args);
    await assertAccountDeletionCleanupIsQuiescent(ctx, run.identity.userId);

    const dataDeletion = run.dataDeletion;

    if (dataDeletion === undefined) {
      throw new Error("Account deletion progress is unavailable for this run.");
    }

    const current = dataDeletion[args.group];

    if (current.state === "completed") {
      return true;
    }

    const now = Date.now();
    const startedAt = current.state === "not_started" ? now : current.startedAt;
    for (const [tableName, cleanup] of entries(ACCOUNT_LOCAL_CLEANUP_HANDLERS)) {
      if (ACCOUNT_LOCAL_CLEANUP_GROUPS[tableName] !== args.group) {
        continue;
      }

      const result = await cleanup(ctx, run.identity.userId);

      if (result === null) {
        continue;
      }

      await ctx.db.patch(run._id, {
        dataDeletion: {
          ...dataDeletion,
          [args.group]: { state: "in_progress", startedAt, updatedAt: now },
        },
        updatedAt: now,
      });

      return false;
    }

    await ctx.db.patch(run._id, {
      dataDeletion: {
        ...dataDeletion,
        [args.group]: { state: "completed", startedAt, completedAt: now },
      },
      updatedAt: now,
    });

    return true;
  },
});

export const startVaultDataDeletion = internalMutation({
  args: { runId: id("operations_accountDeletionRuns"), workflowId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await readOwnedActiveRun(ctx, args);
    await assertAccountDeletionCleanupIsQuiescent(ctx, run.identity.userId);

    const dataDeletion = run.dataDeletion;

    if (dataDeletion === undefined) {
      throw new Error("Account deletion progress is unavailable for this run.");
    }

    const current = dataDeletion.vaultsAndStagedChanges;

    if (current.state !== "not_started") {
      return null;
    }

    const now = Date.now();
    const vaultProgress: AccountDeletionDataProgress["vaultsAndStagedChanges"] = {
      state: "in_progress",
      startedAt: now,
      updatedAt: now,
      deletedVaultCount: 0,
      currentVaultPhase: "vault_data",
    };

    await ctx.db.patch(run._id, {
      dataDeletion: {
        ...dataDeletion,
        vaultsAndStagedChanges: vaultProgress,
      },
      updatedAt: now,
    });

    return null;
  },
});

export const cleanupVaultDataDeletionBatch = internalMutation({
  args: { runId: id("operations_accountDeletionRuns"), workflowId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const run = await readOwnedActiveRun(ctx, args);
    await assertAccountDeletionCleanupIsQuiescent(ctx, run.identity.userId);

    const dataDeletion = run.dataDeletion;

    if (dataDeletion === undefined) {
      throw new Error("Account deletion progress is unavailable for this run.");
    }

    const current = dataDeletion.vaultsAndStagedChanges;

    if (current.state === "not_started") {
      throw new Error("Vault data deletion was not started.");
    }

    if (current.state === "completed") {
      return true;
    }

    const result = await cleanupVaultBatch(ctx, run.identity.userId);
    const now = Date.now();

    if (result.state === "needs_more") {
      await ctx.db.patch(run._id, {
        dataDeletion: {
          ...dataDeletion,
          vaultsAndStagedChanges: {
            ...current,
            updatedAt: now,
            currentVaultPhase: result.currentPhase,
          },
        },
        updatedAt: now,
      });

      return false;
    }

    if (result.state === "vault_deleted") {
      const deletedVaultCount = current.deletedVaultCount + 1;
      const nextVault = await ctx.db
        .query("vaults")
        .withIndex("by_userId", (query) => query.eq("userId", run.identity.userId))
        .first();

      await ctx.db.patch(run._id, {
        dataDeletion: {
          ...dataDeletion,
          vaultsAndStagedChanges:
            nextVault === null
              ? {
                  state: "completed",
                  startedAt: current.startedAt,
                  completedAt: now,
                  deletedVaultCount,
                  currentVaultPhase: null,
                }
              : {
                  ...current,
                  updatedAt: now,
                  deletedVaultCount,
                  currentVaultPhase: "vault_data",
                },
        },
        updatedAt: now,
      });

      return nextVault === null;
    }

    await ctx.db.patch(run._id, {
      dataDeletion: {
        ...dataDeletion,
        vaultsAndStagedChanges: {
          state: "completed",
          startedAt: current.startedAt,
          completedAt: now,
          deletedVaultCount: current.deletedVaultCount,
          currentVaultPhase: null,
        },
      },
      updatedAt: now,
    });

    return true;
  },
});

export const cleanupAccountLocalDataBatch = internalMutation({
  args: { runId: id("operations_accountDeletionRuns"), workflowId: v.string() },
  returns: accountLocalCleanupBatchResult,
  handler: async (ctx, args) => {
    const run = await readOwnedActiveRun(ctx, args);

    return cleanupAccountLocalDataBatchForUser(ctx, {
      userId: run.identity.userId,
    });
  },
});

export const inspectQuiescence = internalMutation({
  args: { runId: id("operations_accountDeletionRuns"), workflowId: v.string() },
  returns: accountDeletionQuiescenceResult,
  handler: async (ctx, args) => {
    const run = await readOwnedActiveRun(ctx, args);

    if (await findActiveVaultDeletion(ctx, run.identity.userId)) {
      return { state: "waiting", blocker: "active_vault_deletion" } as const;
    }

    if (await findActiveAppProvisioning(ctx, run.identity.userId)) {
      return { state: "waiting", blocker: "active_app_provisioning" } as const;
    }

    const now = Date.now();
    const leases = await ctx.db
      .query("operations_agentActionLeases")
      .withIndex("by_user_and_expires_at", (query) => query.eq("userId", run.identity.userId))
      .take(25);

    for (const lease of leases) {
      if (lease.expiresAt > now) {
        return {
          state: "waiting",
          blocker: "active_agent_action",
          retryAfterMs: lease.expiresAt - now,
        } as const;
      }

      await ctx.db.delete(lease._id);
    }

    if (leases.length === 25) {
      return { state: "waiting", blocker: "active_agent_action", retryAfterMs: 0 } as const;
    }

    return { state: "done" } as const;
  },
});

/** The Agent component owns its own bounded, internally-rescheduled deletion. */
export const cleanupAgentComponentData = internalMutation({
  args: { runId: id("operations_accountDeletionRuns"), workflowId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await readOwnedActiveRun(ctx, args);
    const dataDeletion = run.dataDeletion;

    if (dataDeletion !== undefined) {
      const current = dataDeletion.chatsAndAgentData;

      if (current.state !== "completed") {
        const now = Date.now();

        await ctx.db.patch(run._id, {
          dataDeletion: {
            ...dataDeletion,
            chatsAndAgentData: {
              state: "in_progress",
              startedAt: current.state === "not_started" ? now : current.startedAt,
              updatedAt: now,
            },
          },
          updatedAt: now,
        });
      }
    }

    await ctx.runMutation(components.agent.users.deleteAllForUserIdAsync, {
      userId: run.identity.userId,
    });

    return null;
  },
});

export const hasAgentComponentData = internalQuery({
  args: { runId: id("operations_accountDeletionRuns"), workflowId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const run = await readOwnedActiveRun(ctx, args);

    const threads = await ctx.runQuery(components.agent.threads.listThreadsByUserId, {
      userId: run.identity.userId,
      paginationOpts: { cursor: null, numItems: 1 },
    });

    return threads.page.length > 0;
  },
});
