import { entries } from "@samebase/dependent/object";
import { v, type Infer } from "convex/values";

import type { Id, TableNames } from "../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { TREE_REFRESH_STALE_LOCK_MS } from "../../shared/treeRefresh";
import {
  deleteVaultLocalDataBatchForOrganization,
  type VaultLocalCleanupBatchResult,
} from "../vault/deletion/cleanup";
import {
  type AccountDeletionDataProgress,
  type AccountDeletionVaultCleanupPhase,
  vAccountDeletionVaultCleanupPhase,
} from "./model";
import {
  readAccountDeletionOrganization,
  readOwnedActiveRun,
  type AccountDeletionOrganization,
} from "./stepContext";

const { id, literal, number, object, union } = v;

type AccountDeletionTablePolicy =
  | "account_local"
  | "vault_lifecycle"
  | "vault_local"
  | "provider_revocation"
  | "auth_finalization"
  | "receipt"
  | "global"
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
  organizations: "user_finalization",
  organizationMemberships: "user_finalization",
  organizationBillingAccounts: "user_finalization",
  workflow_accountDeletion_runs: "receipt",
  workflow_accountDeletion_events: "receipt",
  providerConnections: "provider_revocation",
  ui_user_settings: "account_local",
  ui_workspaceSidebar_layouts: "account_local",
  ui_vaultPullRequests_filters: "account_local",
  ui_vaultResourceLinks_settings: "account_local",
  ui_vaultFolders: "account_local",
  ui_vaultFolderAssignments: "account_local",
  vaults: "vault_local",
  vaultCloudflareWorkers: "vault_local",
  vaultConvexProjects: "vault_local",
  observations_vaultConvexSchema_snapshots: "vault_local",
  ui_vaultConvexSchemaGraph_nodeLayouts: "account_local",
  observations_vaultRepository_branchTrees: "vault_local",
  workflow_vaultProvisioning_plans: "vault_local",
  workflow_vaultProvisioning_writeLocks: "vault_local",
  workflow_vaultProvisioning_runs: "vault_local",
  workflow_vaultProvisioning_events: "vault_local",
  workflow_vaultDeletion_runs: "vault_lifecycle",
  workflow_vaultDeletion_events: "vault_lifecycle",
  vaultStagedFiles: "vault_local",
  observations_vaultFiles_blobs: "vault_local",
  ui_vaultFileTree_folderExpansions: "account_local",
  providerOAuthCallbackStates: "account_local",
  mcpOauthClients: "global",
  mcpAuthorizationRequests: "account_local",
  mcpAuthorizationCodes: "account_local",
  mcpGrants: "account_local",
  mcpAccessTokens: "account_local",
  mcpRefreshTokens: "account_local",
  audit_mcpAccess_events: "account_local",
  mcpBrowserLoginTokens: "account_local",
  vaultStagedFileUpdates: "vault_local",
} satisfies Record<TableNames, AccountDeletionTablePolicy>;

type AccountLocalTableName = {
  [TableName in TableNames]: (typeof ACCOUNT_DELETION_TABLE_REGISTRY)[TableName] extends "account_local"
    ? TableName
    : never;
}[TableNames];

const accountLocalCleanupTarget = union(
  literal("vaults"),
  literal("ui_user_settings"),
  literal("ui_workspaceSidebar_layouts"),
  literal("ui_vaultPullRequests_filters"),
  literal("ui_vaultResourceLinks_settings"),
  literal("ui_vaultFolderAssignments"),
  literal("ui_vaultFileTree_folderExpansions"),
  literal("ui_vaultConvexSchemaGraph_nodeLayouts"),
  literal("ui_vaultFolders"),
  literal("providerOAuthCallbackStates"),
  literal("mcpAuthorizationRequests"),
  literal("mcpAuthorizationCodes"),
  literal("mcpAccessTokens"),
  literal("mcpRefreshTokens"),
  literal("mcpBrowserLoginTokens"),
  literal("mcpGrants"),
  literal("audit_mcpAccess_events"),
);
const accountLocalCleanupBatchResult = union(
  object({
    state: literal("blocked"),
    blocker: literal("active_vault_deletion"),
    runId: id("workflow_vaultDeletion_runs"),
  }),
  object({
    state: literal("blocked"),
    blocker: literal("active_app_provisioning"),
    runId: id("workflow_vaultProvisioning_runs"),
  }),
  object({
    state: literal("blocked"),
    blocker: literal("active_provider_change"),
    vaultId: id("vaults"),
  }),
  object({
    state: literal("blocked"),
    blocker: literal("active_repository_refresh"),
    vaultId: id("vaults"),
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
  object({ state: literal("waiting"), blocker: literal("active_provider_change") }),
  object({ state: literal("waiting"), blocker: literal("active_repository_refresh") }),
);

const ACCOUNT_LOCAL_CLEANUP_BATCH_SIZE = 25;
const ACTIVE_WORK_BLOCKS_DELETION_ERROR = "Account deletion cleanup is blocked by active work.";
type AccountLocalCleanupCtx = Pick<MutationCtx, "db" | "storage">;
type AccountDeletionCleanupScope = AccountDeletionOrganization & {
  userId: Id<"users">;
};

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
  scope: AccountDeletionCleanupScope,
): Promise<Id<"workflow_vaultDeletion_runs"> | null> {
  if (scope.membershipState === "shared") {
    for (const state of ["queued", "running"] as const) {
      const run = await ctx.db
        .query("workflow_vaultDeletion_runs")
        .withIndex("by_requester_and_state_and_updated_at", (query) =>
          query.eq("requestedByUserId", scope.userId).eq("state", state),
        )
        .order("asc")
        .first();
      if (run !== null) {
        return run._id;
      }
    }
    return null;
  }

  for await (const vault of ctx.db
    .query("vaults")
    .withIndex("by_organization", (query) => query.eq("organizationId", scope.organizationId))) {
    const run = await ctx.db
      .query("workflow_vaultDeletion_runs")
      .withIndex("by_vault_and_updated_at", (query) => query.eq("vaultId", vault._id))
      .filter((query) =>
        query.or(
          query.eq(query.field("state"), "queued"),
          query.eq(query.field("state"), "running"),
        ),
      )
      .first();
    if (run !== null) {
      return run._id;
    }
  }

  return null;
}

async function findActiveAppProvisioning(
  ctx: AccountLocalCleanupCtx,
  scope: AccountDeletionCleanupScope,
): Promise<Id<"workflow_vaultProvisioning_runs"> | null> {
  if (scope.membershipState === "shared") {
    for (const state of ["queued", "running"] as const) {
      const run = await ctx.db
        .query("workflow_vaultProvisioning_runs")
        .withIndex("by_requester_and_state_and_updated_at", (query) =>
          query.eq("requestedByUserId", scope.userId).eq("state", state),
        )
        .order("asc")
        .first();
      if (run !== null) {
        return run._id;
      }
    }
    return null;
  }

  for await (const vault of ctx.db
    .query("vaults")
    .withIndex("by_organization", (query) => query.eq("organizationId", scope.organizationId))) {
    for (const state of ["queued", "running"] as const) {
      const run = await ctx.db
        .query("workflow_vaultProvisioning_runs")
        .withIndex("by_vault_and_state", (query) =>
          query.eq("vaultId", vault._id).eq("state", state),
        )
        .first();
      if (run !== null) {
        return run._id;
      }
    }
  }

  return null;
}

async function findActiveRepositoryRefresh(
  ctx: AccountLocalCleanupCtx,
  scope: AccountDeletionCleanupScope,
): Promise<Id<"vaults"> | null> {
  const now = Date.now();
  const vaults = ctx.db
    .query("vaults")
    .withIndex("by_organization", (query) => query.eq("organizationId", scope.organizationId));

  for await (const vault of vaults) {
    const lock = vault.state === "connected" ? vault.treeRefreshLock : undefined;
    if (
      lock &&
      now - lock.startedAt < TREE_REFRESH_STALE_LOCK_MS &&
      (scope.membershipState === "sole" || lock.requestedByUserId === scope.userId)
    ) {
      return vault._id;
    }
  }

  return null;
}

async function findActiveManualProviderWrite(
  ctx: AccountLocalCleanupCtx,
  scope: AccountDeletionCleanupScope,
): Promise<Id<"vaults"> | null> {
  const vaults = ctx.db
    .query("vaults")
    .withIndex("by_organization", (query) => query.eq("organizationId", scope.organizationId));

  for await (const vault of vaults) {
    const write = await ctx.db
      .query("workflow_vaultProvisioning_writeLocks")
      .withIndex("by_vault", (query) => query.eq("vaultId", vault._id))
      .unique();
    if (
      write?.state === "active" &&
      write.owner.kind === "manual_provider_write" &&
      (scope.membershipState === "sole" || write.owner.requestedByUserId === scope.userId)
    ) {
      return vault._id;
    }
  }

  return null;
}

async function findAccountDeletionCleanupBlocker(
  ctx: AccountLocalCleanupCtx,
  scope: AccountDeletionCleanupScope,
): Promise<Extract<AccountLocalCleanupBatchResult, { state: "blocked" }> | null> {
  const activeVaultDeletionRunId = await findActiveVaultDeletion(ctx, scope);

  if (activeVaultDeletionRunId) {
    return {
      state: "blocked",
      blocker: "active_vault_deletion",
      runId: activeVaultDeletionRunId,
    };
  }

  const activeProvisioningRunId = await findActiveAppProvisioning(ctx, scope);

  if (activeProvisioningRunId) {
    return {
      state: "blocked",
      blocker: "active_app_provisioning",
      runId: activeProvisioningRunId,
    };
  }

  const activeManualProviderWriteVaultId = await findActiveManualProviderWrite(ctx, scope);

  if (activeManualProviderWriteVaultId) {
    return {
      state: "blocked",
      blocker: "active_provider_change",
      vaultId: activeManualProviderWriteVaultId,
    };
  }

  const activeRepositoryRefreshVaultId = await findActiveRepositoryRefresh(ctx, scope);

  if (activeRepositoryRefreshVaultId) {
    return {
      state: "blocked",
      blocker: "active_repository_refresh",
      vaultId: activeRepositoryRefreshVaultId,
    };
  }

  return null;
}

async function assertAccountDeletionCleanupIsQuiescent(
  ctx: AccountLocalCleanupCtx,
  scope: AccountDeletionCleanupScope,
) {
  if (await findAccountDeletionCleanupBlocker(ctx, scope)) {
    throw new Error(ACTIVE_WORK_BLOCKS_DELETION_ERROR);
  }
}

async function readAccountDeletionCleanupScope(
  ctx: AccountLocalCleanupCtx,
  userId: Id<"users">,
): Promise<AccountDeletionCleanupScope> {
  return {
    userId,
    ...(await readAccountDeletionOrganization(ctx.db, userId)),
  };
}

async function cleanupVaultBatch(
  ctx: AccountLocalCleanupCtx,
  scope: AccountDeletionCleanupScope,
): Promise<VaultDataCleanupBatchResult> {
  if (scope.membershipState === "shared") {
    return { state: "done" };
  }

  const vault = await ctx.db
    .query("vaults")
    .withIndex("by_organization", (query) => query.eq("organizationId", scope.organizationId))
    .order("asc")
    .first();

  if (!vault) {
    return { state: "done" };
  }

  const result = await deleteVaultLocalDataBatchForOrganization(ctx, {
    organizationId: scope.organizationId,
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
    case "vaultStagedFiles":
    case "vaultStagedFileUpdates":
    case "observations_vaultFiles_blobs":
      return "staged_changes";
    case "ui_vaultPullRequests_filters":
    case "ui_vaultResourceLinks_settings":
    case "ui_vaultFolderAssignments":
    case "ui_vaultFileTree_folderExpansions":
    case "observations_vaultRepository_branchTrees":
      return "source_data";
    case "vaultConvexProjects":
    case "observations_vaultConvexSchema_snapshots":
    case "ui_vaultConvexSchemaGraph_nodeLayouts":
    case "vaultCloudflareWorkers":
    case "workflow_vaultProvisioning_plans":
    case "workflow_vaultProvisioning_writeLocks":
      return "app_data";
    case "workflow_vaultProvisioning_events":
    case "workflow_vaultProvisioning_runs":
      return "provisioning_history";
    case "workflow_vaultDeletion_events":
    case "workflow_vaultDeletion_runs":
      return "vault_data";
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
  ui_user_settings: async (ctx, userId) => {
    const rows = await ctx.db
      .query("ui_user_settings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(ACCOUNT_LOCAL_CLEANUP_BATCH_SIZE);

    return rows.length > 0
      ? {
          state: "needs_more",
          target: "ui_user_settings",
          rowsChanged: await deleteRowsById(ctx, rows),
        }
      : null;
  },
  ui_workspaceSidebar_layouts: async (ctx, userId) => {
    const rows = await ctx.db
      .query("ui_workspaceSidebar_layouts")
      .withIndex("by_user_and_workspace_key", (q) => q.eq("userId", userId))
      .take(ACCOUNT_LOCAL_CLEANUP_BATCH_SIZE);

    return rows.length > 0
      ? {
          state: "needs_more",
          target: "ui_workspaceSidebar_layouts",
          rowsChanged: await deleteRowsById(ctx, rows),
        }
      : null;
  },
  ui_vaultPullRequests_filters: async (ctx, userId) => {
    const rows = await ctx.db
      .query("ui_vaultPullRequests_filters")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(ACCOUNT_LOCAL_CLEANUP_BATCH_SIZE);

    return rows.length > 0
      ? {
          state: "needs_more",
          target: "ui_vaultPullRequests_filters",
          rowsChanged: await deleteRowsById(ctx, rows),
        }
      : null;
  },
  ui_vaultResourceLinks_settings: async (ctx, userId) => {
    const rows = await ctx.db
      .query("ui_vaultResourceLinks_settings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(ACCOUNT_LOCAL_CLEANUP_BATCH_SIZE);

    return rows.length > 0
      ? {
          state: "needs_more",
          target: "ui_vaultResourceLinks_settings",
          rowsChanged: await deleteRowsById(ctx, rows),
        }
      : null;
  },
  ui_vaultFolderAssignments: async (ctx, userId) => {
    const rows = await ctx.db
      .query("ui_vaultFolderAssignments")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(ACCOUNT_LOCAL_CLEANUP_BATCH_SIZE);

    return rows.length > 0
      ? {
          state: "needs_more",
          target: "ui_vaultFolderAssignments",
          rowsChanged: await deleteRowsById(ctx, rows),
        }
      : null;
  },
  ui_vaultFileTree_folderExpansions: async (ctx, userId) => {
    const rows = await ctx.db
      .query("ui_vaultFileTree_folderExpansions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(ACCOUNT_LOCAL_CLEANUP_BATCH_SIZE);

    return rows.length > 0
      ? {
          state: "needs_more",
          target: "ui_vaultFileTree_folderExpansions",
          rowsChanged: await deleteRowsById(ctx, rows),
        }
      : null;
  },
  ui_vaultConvexSchemaGraph_nodeLayouts: async (ctx, userId) => {
    const rows = await ctx.db
      .query("ui_vaultConvexSchemaGraph_nodeLayouts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(ACCOUNT_LOCAL_CLEANUP_BATCH_SIZE);

    return rows.length > 0
      ? {
          state: "needs_more",
          target: "ui_vaultConvexSchemaGraph_nodeLayouts",
          rowsChanged: await deleteRowsById(ctx, rows),
        }
      : null;
  },
  ui_vaultFolders: async (ctx, userId) => {
    const rows = await ctx.db
      .query("ui_vaultFolders")
      .withIndex("by_userId_and_position", (q) => q.eq("userId", userId))
      .take(ACCOUNT_LOCAL_CLEANUP_BATCH_SIZE);

    return rows.length > 0
      ? {
          state: "needs_more",
          target: "ui_vaultFolders",
          rowsChanged: await deleteRowsById(ctx, rows),
        }
      : null;
  },
  providerOAuthCallbackStates: async (ctx, userId) => {
    const rows = await ctx.db
      .query("providerOAuthCallbackStates")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(ACCOUNT_LOCAL_CLEANUP_BATCH_SIZE);

    return rows.length > 0
      ? {
          state: "needs_more",
          target: "providerOAuthCallbackStates",
          rowsChanged: await deleteRowsById(ctx, rows),
        }
      : null;
  },
  mcpAuthorizationRequests: async (ctx, userId) => {
    const rows = await ctx.db
      .query("mcpAuthorizationRequests")
      .withIndex("by_user_id", (q) => q.eq("userId", userId))
      .take(ACCOUNT_LOCAL_CLEANUP_BATCH_SIZE);

    return rows.length > 0
      ? {
          state: "needs_more",
          target: "mcpAuthorizationRequests",
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
  mcpBrowserLoginTokens: async (ctx, userId) => {
    const rows = await ctx.db
      .query("mcpBrowserLoginTokens")
      .withIndex("by_user_id", (q) => q.eq("userId", userId))
      .take(ACCOUNT_LOCAL_CLEANUP_BATCH_SIZE);

    return rows.length > 0
      ? {
          state: "needs_more",
          target: "mcpBrowserLoginTokens",
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
  audit_mcpAccess_events: async (ctx, userId) => {
    const rows = await ctx.db
      .query("audit_mcpAccess_events")
      .withIndex("by_user_id", (q) => q.eq("userId", userId))
      .take(ACCOUNT_LOCAL_CLEANUP_BATCH_SIZE);

    return rows.length > 0
      ? {
          state: "needs_more",
          target: "audit_mcpAccess_events",
          rowsChanged: await deleteRowsById(ctx, rows),
        }
      : null;
  },
} satisfies Record<AccountLocalTableName, AccountLocalCleanupHandler>;

const ACCOUNT_LOCAL_CLEANUP_GROUPS = {
  ui_user_settings: "preferences",
  ui_workspaceSidebar_layouts: "preferences",
  ui_vaultPullRequests_filters: "preferences",
  ui_vaultResourceLinks_settings: "preferences",
  ui_vaultFolderAssignments: "preferences",
  ui_vaultFileTree_folderExpansions: "preferences",
  ui_vaultConvexSchemaGraph_nodeLayouts: "preferences",
  ui_vaultFolders: "preferences",
  providerOAuthCallbackStates: "appAccessAndTokens",
  mcpAuthorizationRequests: "appAccessAndTokens",
  mcpAuthorizationCodes: "appAccessAndTokens",
  mcpAccessTokens: "appAccessAndTokens",
  mcpRefreshTokens: "appAccessAndTokens",
  mcpBrowserLoginTokens: "appAccessAndTokens",
  mcpGrants: "appAccessAndTokens",
  audit_mcpAccess_events: "accessRequestsAndHistory",
} satisfies Record<AccountLocalTableName, SimpleDataDeletionGroup>;

/**
 * Deletes at most one bounded slice. The account workflow owns repetition and
 * does not advance while a separately-authorized vault deletion is active.
 */
export async function cleanupAccountLocalDataBatchForUser(
  ctx: AccountLocalCleanupCtx,
  args: { userId: Id<"users"> },
): Promise<AccountLocalCleanupBatchResult> {
  const scope = await readAccountDeletionCleanupScope(ctx, args.userId);
  const blocker = await findAccountDeletionCleanupBlocker(ctx, scope);

  if (blocker) {
    return blocker;
  }

  const vaultResult = await cleanupVaultBatch(ctx, scope);

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
    runId: id("workflow_accountDeletion_runs"),
    workflowId: v.string(),
    group: vSimpleDataDeletionGroup,
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const run = await readOwnedActiveRun(ctx, args);
    const scope = await readAccountDeletionCleanupScope(ctx, run.identity.userId);
    await assertAccountDeletionCleanupIsQuiescent(ctx, scope);

    const dataDeletion = run.dataDeletion;
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
  args: { runId: id("workflow_accountDeletion_runs"), workflowId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await readOwnedActiveRun(ctx, args);
    const scope = await readAccountDeletionCleanupScope(ctx, run.identity.userId);
    await assertAccountDeletionCleanupIsQuiescent(ctx, scope);

    const dataDeletion = run.dataDeletion;
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
  args: { runId: id("workflow_accountDeletion_runs"), workflowId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const run = await readOwnedActiveRun(ctx, args);
    const scope = await readAccountDeletionCleanupScope(ctx, run.identity.userId);
    await assertAccountDeletionCleanupIsQuiescent(ctx, scope);

    const dataDeletion = run.dataDeletion;
    const current = dataDeletion.vaultsAndStagedChanges;

    if (current.state === "not_started") {
      throw new Error("Vault data deletion was not started.");
    }

    if (current.state === "completed") {
      return true;
    }

    const result = await cleanupVaultBatch(ctx, scope);
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
        .withIndex("by_organization", (query) => query.eq("organizationId", scope.organizationId))
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

export const inspectQuiescence = internalMutation({
  args: { runId: id("workflow_accountDeletion_runs"), workflowId: v.string() },
  returns: accountDeletionQuiescenceResult,
  handler: async (ctx, args) => {
    const run = await readOwnedActiveRun(ctx, args);
    const scope = await readAccountDeletionCleanupScope(ctx, run.identity.userId);
    const blocker = await findAccountDeletionCleanupBlocker(ctx, scope);

    if (blocker) {
      return { state: "waiting", blocker: blocker.blocker } as const;
    }

    return { state: "done" } as const;
  },
});
