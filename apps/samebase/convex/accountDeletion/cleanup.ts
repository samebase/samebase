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
  accountDeletionRuns: "receipt",
  accountDeletionEvents: "receipt",
  agentActionLeases: "action_quiescence",
  githubObservationActionLeases: "action_quiescence",
  providerConnections: "provider_revocation",
  githubGraphqlRateBudgets: "global",
  connectedMachines: "account_local",
  machineRegistrationRequests: "account_local",
  machineRegistrationBootstrapRateLimits: "global",
  machineCredentials: "account_local",
  machineControlTokens: "account_local",
  dashboardSettings: "account_local",
  workspaceSidebarState: "account_local",
  vaultResourceLinksState: "vault_local",
  vaults: "vault_local",
  vaultApps: "vault_local",
  vaultCloudflareWorkers: "vault_local",
  vaultConvexDeployments: "vault_local",
  vaultConvexSchemaSnapshots: "vault_local",
  vaultConvexSchemaGraphLayouts: "vault_local",
  vaultRepositoryInventories: "vault_local",
  vaultRepositorySummaries: "vault_local",
  vaultRepositorySummaryDirectoryStates: "user_finalization",
  vaultRepositoryInventorySnapshots: "vault_local",
  vaultRepositoryInventoryItems: "vault_local",
  vaultRepositoryInventoryCloudflareBuilds: "vault_local",
  vaultRepositoryInventoryCloudflareBuildAssociations: "vault_local",
  vaultRepositoryInventoryLabelChunks: "vault_local",
  vaultRepositoryInventoryFilters: "vault_local",
  vaultRepositoryInventoryExcludedLabels: "vault_local",
  vaultRepositoryInventoryFilterViews: "vault_local",
  vaultRepositoryInventoryFilterViewRows: "vault_local",
  vaultRepositoryInventoryLabelFacets: "vault_local",
  vaultBranchTrees: "vault_local",
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

type AccountLocalTableName = {
  [TableName in TableNames]: (typeof ACCOUNT_DELETION_TABLE_REGISTRY)[TableName] extends "account_local"
    ? TableName
    : never;
}[TableNames];

const accountLocalCleanupTarget = union(
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
  object({
    state: literal("waiting"),
    blocker: literal("active_github_observation"),
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

  return null;
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
    case "fileStaging":
    case "collaborativeUpdates":
    case "blobs":
      return "staged_changes";
    case "vaultResourceLinksState":
    case "folderExpansionState":
    case "vaultRepositoryInventories":
    case "vaultRepositorySummaries":
    case "vaultRepositoryInventorySnapshots":
    case "vaultRepositoryInventoryItems":
    case "vaultRepositoryInventoryCloudflareBuilds":
    case "vaultRepositoryInventoryCloudflareBuildAssociations":
    case "vaultRepositoryInventoryLabelChunks":
    case "vaultRepositoryInventoryFilters":
    case "vaultRepositoryInventoryExcludedLabels":
    case "vaultRepositoryInventoryFilterViews":
    case "vaultRepositoryInventoryFilterViewRows":
    case "vaultRepositoryInventoryLabelFacets":
    case "vaultBranchTrees":
      return "source_data";
    case "vaultDomains":
    case "vaultApps":
    case "vaultConvexDeployments":
    case "vaultConvexSchemaSnapshots":
    case "vaultConvexSchemaGraphLayouts":
    case "vaultCloudflareWorkers":
    case "vaultInfrastructureTargets":
    case "vaultInfrastructureOwnership":
    case "codespaces":
    case "agentGraphNodeLayout":
    case "agentThreadContext":
      return "app_data";
    case "aiProdAccessRequests":
      return "access_state";
    case "appProvisioningEvents":
    case "appProvisioningRuns":
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
  machineCredentials: async (ctx, userId) => {
    const rows = await ctx.db
      .query("machineCredentials")
      .withIndex("by_user_machine_id", (q) => q.eq("userId", userId))
      .take(ACCOUNT_LOCAL_CLEANUP_BATCH_SIZE);

    return rows.length > 0
      ? {
          state: "needs_more",
          target: "machineCredentials",
          rowsChanged: await deleteRowsById(ctx, rows),
        }
      : null;
  },
  machineControlTokens: async (ctx, userId) => {
    const rows = await ctx.db
      .query("machineControlTokens")
      .withIndex("by_user_machine_id", (q) => q.eq("userId", userId))
      .take(ACCOUNT_LOCAL_CLEANUP_BATCH_SIZE);

    return rows.length > 0
      ? {
          state: "needs_more",
          target: "machineControlTokens",
          rowsChanged: await deleteRowsById(ctx, rows),
        }
      : null;
  },
  machineRegistrationRequests: async (ctx, userId) => {
    const rows = await ctx.db
      .query("machineRegistrationRequests")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(ACCOUNT_LOCAL_CLEANUP_BATCH_SIZE);

    return rows.length > 0
      ? {
          state: "needs_more",
          target: "machineRegistrationRequests",
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
  dashboardSettings: async (ctx, userId) => {
    const rows = await ctx.db
      .query("dashboardSettings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(ACCOUNT_LOCAL_CLEANUP_BATCH_SIZE);

    return rows.length > 0
      ? {
          state: "needs_more",
          target: "dashboardSettings",
          rowsChanged: await deleteRowsById(ctx, rows),
        }
      : null;
  },
  workspaceSidebarState: async (ctx, userId) => {
    const rows = await ctx.db
      .query("workspaceSidebarState")
      .withIndex("by_user_and_workspace_key", (q) => q.eq("userId", userId))
      .take(ACCOUNT_LOCAL_CLEANUP_BATCH_SIZE);

    return rows.length > 0
      ? {
          state: "needs_more",
          target: "workspaceSidebarState",
          rowsChanged: await deleteRowsById(ctx, rows),
        }
      : null;
  },
  oauthStates: async (ctx, userId) => {
    const rows = await ctx.db
      .query("oauthStates")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(ACCOUNT_LOCAL_CLEANUP_BATCH_SIZE);

    return rows.length > 0
      ? {
          state: "needs_more",
          target: "oauthStates",
          rowsChanged: await deleteRowsById(ctx, rows),
        }
      : null;
  },
  mcpAuthRequests: async (ctx, userId) => {
    const rows = await ctx.db
      .query("mcpAuthRequests")
      .withIndex("by_user_id", (q) => q.eq("userId", userId))
      .take(ACCOUNT_LOCAL_CLEANUP_BATCH_SIZE);

    return rows.length > 0
      ? {
          state: "needs_more",
          target: "mcpAuthRequests",
          rowsChanged: await deleteRowsById(ctx, rows),
        }
      : null;
  },
  mcpAuthorizationCodes: async (ctx, userId) => {
    const rows = await ctx.db
      .query("mcpAuthorizationCodes")
      .withIndex("by_user_id", (q) => q.eq("userId", userId))
      .take(ACCOUNT_LOCAL_CLEANUP_BATCH_SIZE);

    return rows.length > 0
      ? {
          state: "needs_more",
          target: "mcpAuthorizationCodes",
          rowsChanged: await deleteRowsById(ctx, rows),
        }
      : null;
  },
  mcpAccessTokens: async (ctx, userId) => {
    const rows = await ctx.db
      .query("mcpAccessTokens")
      .withIndex("by_user_id", (q) => q.eq("userId", userId))
      .take(ACCOUNT_LOCAL_CLEANUP_BATCH_SIZE);

    return rows.length > 0
      ? {
          state: "needs_more",
          target: "mcpAccessTokens",
          rowsChanged: await deleteRowsById(ctx, rows),
        }
      : null;
  },
  mcpRefreshTokens: async (ctx, userId) => {
    const rows = await ctx.db
      .query("mcpRefreshTokens")
      .withIndex("by_user_id", (q) => q.eq("userId", userId))
      .take(ACCOUNT_LOCAL_CLEANUP_BATCH_SIZE);

    return rows.length > 0
      ? {
          state: "needs_more",
          target: "mcpRefreshTokens",
          rowsChanged: await deleteRowsById(ctx, rows),
        }
      : null;
  },
  agentBrowserHandoffs: async (ctx, userId) => {
    const rows = await ctx.db
      .query("agentBrowserHandoffs")
      .withIndex("by_user_id", (q) => q.eq("userId", userId))
      .take(ACCOUNT_LOCAL_CLEANUP_BATCH_SIZE);

    return rows.length > 0
      ? {
          state: "needs_more",
          target: "agentBrowserHandoffs",
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
  mcpAccessAudit: async (ctx, userId) => {
    const rows = await ctx.db
      .query("mcpAccessAudit")
      .withIndex("by_user_id", (q) => q.eq("userId", userId))
      .take(ACCOUNT_LOCAL_CLEANUP_BATCH_SIZE);

    return rows.length > 0
      ? {
          state: "needs_more",
          target: "mcpAccessAudit",
          rowsChanged: await deleteRowsById(ctx, rows),
        }
      : null;
  },
  aiProdAccessAudit: async (ctx, userId) => {
    const rows = await ctx.db
      .query("aiProdAccessAudit")
      .withIndex("by_actor", (q) => q.eq("actorUserId", userId))
      .take(ACCOUNT_LOCAL_CLEANUP_BATCH_SIZE);

    return rows.length > 0
      ? {
          state: "needs_more",
          target: "aiProdAccessAudit",
          rowsChanged: await deleteRowsById(ctx, rows),
        }
      : null;
  },
  aiProdAccessRequests: async (ctx, userId) => {
    const requested = await ctx.db
      .query("aiProdAccessRequests")
      .withIndex("by_requester", (q) => q.eq("requesterUserId", userId))
      .first();

    if (requested) {
      const audit = await ctx.db
        .query("aiProdAccessAudit")
        .withIndex("by_request", (q) => q.eq("requestId", requested._id))
        .take(ACCOUNT_LOCAL_CLEANUP_BATCH_SIZE);

      if (audit.length > 0) {
        return {
          state: "needs_more",
          target: "aiProdAccessAudit",
          rowsChanged: await deleteRowsById(ctx, audit),
        };
      }

      await ctx.db.delete(requested._id);

      return { state: "needs_more", target: "aiProdAccessRequests", rowsChanged: 1 };
    }

    const approved = await ctx.db
      .query("aiProdAccessRequests")
      .withIndex("by_approved_by", (q) => q.eq("approvedBy", userId))
      .first();

    if (!approved) {
      return null;
    }

    await ctx.db.patch(approved._id, { approvedBy: undefined });

    return { state: "needs_more", target: "aiProdAccessRequests", rowsChanged: 1 };
  },
  vaultDeletionEvents: async (ctx, userId) => {
    const run = await ctx.db
      .query("vaultDeletionRuns")
      .withIndex("by_user_and_updated_at", (q) => q.eq("userId", userId))
      .order("asc")
      .first();

    if (!run) {
      return null;
    }

    const rows = await ctx.db
      .query("vaultDeletionEvents")
      .withIndex("by_run_and_created_at", (q) => q.eq("runId", run._id))
      .take(ACCOUNT_LOCAL_CLEANUP_BATCH_SIZE);

    return rows.length > 0
      ? {
          state: "needs_more",
          target: "vaultDeletionEvents",
          rowsChanged: await deleteRowsById(ctx, rows),
        }
      : null;
  },
  vaultDeletionRuns: async (ctx, userId) => {
    const run = await ctx.db
      .query("vaultDeletionRuns")
      .withIndex("by_user_and_updated_at", (q) => q.eq("userId", userId))
      .order("asc")
      .first();

    if (!run) {
      return null;
    }

    await ctx.db.delete(run._id);

    return { state: "needs_more", target: "vaultDeletionRuns", rowsChanged: 1 };
  },
} satisfies Record<AccountLocalTableName, AccountLocalCleanupHandler>;

const ACCOUNT_LOCAL_CLEANUP_GROUPS = {
  chatMessageMetadata: "chatsAndAgentData",
  agentThreadContext: "chatsAndAgentData",
  machineCredentials: "connectedMachines",
  machineControlTokens: "connectedMachines",
  machineRegistrationRequests: "connectedMachines",
  connectedMachines: "connectedMachines",
  dashboardSettings: "preferences",
  workspaceSidebarState: "preferences",
  oauthStates: "appAccessAndTokens",
  mcpAuthRequests: "appAccessAndTokens",
  mcpAuthorizationCodes: "appAccessAndTokens",
  mcpAccessTokens: "appAccessAndTokens",
  mcpRefreshTokens: "appAccessAndTokens",
  agentBrowserHandoffs: "appAccessAndTokens",
  mcpGrants: "appAccessAndTokens",
  mcpAccessAudit: "accessRequestsAndHistory",
  aiProdAccessAudit: "accessRequestsAndHistory",
  aiProdAccessRequests: "accessRequestsAndHistory",
  vaultDeletionEvents: "accessRequestsAndHistory",
  vaultDeletionRuns: "accessRequestsAndHistory",
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
    runId: id("accountDeletionRuns"),
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
  args: { runId: id("accountDeletionRuns"), workflowId: v.string() },
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
  args: { runId: id("accountDeletionRuns"), workflowId: v.string() },
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
  args: { runId: id("accountDeletionRuns"), workflowId: v.string() },
  returns: accountLocalCleanupBatchResult,
  handler: async (ctx, args) => {
    const run = await readOwnedActiveRun(ctx, args);

    return cleanupAccountLocalDataBatchForUser(ctx, {
      userId: run.identity.userId,
    });
  },
});

export const inspectQuiescence = internalMutation({
  args: { runId: id("accountDeletionRuns"), workflowId: v.string() },
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
      .query("agentActionLeases")
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

    const githubObservationLeases = await ctx.db
      .query("githubObservationActionLeases")
      .withIndex("by_userId_and_expiresAt", (query) => query.eq("userId", run.identity.userId))
      .take(25);

    for (const lease of githubObservationLeases) {
      if (lease.expiresAt > now) {
        return {
          state: "waiting",
          blocker: "active_github_observation",
          retryAfterMs: lease.expiresAt - now,
        } as const;
      }

      await ctx.db.delete(lease._id);
    }

    if (githubObservationLeases.length === 25) {
      return {
        state: "waiting",
        blocker: "active_github_observation",
        retryAfterMs: 0,
      } as const;
    }

    return { state: "done" } as const;
  },
});

/** The Agent component owns its own bounded, internally-rescheduled deletion. */
export const cleanupAgentComponentData = internalMutation({
  args: { runId: id("accountDeletionRuns"), workflowId: v.string() },
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
  args: { runId: id("accountDeletionRuns"), workflowId: v.string() },
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
