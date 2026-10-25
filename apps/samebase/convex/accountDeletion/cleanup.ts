import type { Doc, Id, TableNames } from "../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { v, type Infer } from "convex/values";
import { GITHUB_USER_TOKEN_REFRESH_STALE_LOCK_MS } from "../../shared/githubUserTokenRefresh";
import { readOwnedActiveRun } from "./stepContext";

type AccountDeletionTablePolicy =
  | "account_data"
  | "credential_revocation"
  | "auth_finalization"
  | "user_finalization"
  | "receipt"
  | "organization_preserved"
  | "precondition_absent"
  | "global";

/**
 * Every application table has one account-deletion policy. Organization data
 * stays intact when one member deletes their Samebase identity.
 */
export const ACCOUNT_DELETION_TABLE_REGISTRY = {
  authSessions: "auth_finalization",
  authAccounts: "auth_finalization",
  authRefreshTokens: "auth_finalization",
  authVerificationCodes: "auth_finalization",
  authVerifiers: "auth_finalization",
  authRateLimits: "auth_finalization",
  users: "user_finalization",
  organizations: "organization_preserved",
  organizationMemberships: "precondition_absent",
  organizationInvitations: "account_data",
  organizationBillingAccounts: "organization_preserved",
  githubAppSetupStates: "account_data",
  githubUserAuthorizations: "credential_revocation",
  workflow_accountDeletion_runs: "receipt",
  workflow_accountDeletion_events: "receipt",
  organizationProviderCredentials: "credential_revocation",
  organizationCiCredentials: "credential_revocation",
  providerOAuthCallbackStates: "account_data",
  ui_user_settings: "account_data",
  ui_workspaceSidebar_layouts: "account_data",
  ui_repositoryPullRequests_filters: "account_data",
  ui_repositoryResourceLinks_settings: "account_data",
  ui_repositoryTree_folders: "account_data",
  ui_repositoryTree_folderAssignments: "account_data",
  ui_repositoryTree_organizationSettings: "account_data",
  repositories: "organization_preserved",
  repositoryCloudflareWorkers: "organization_preserved",
  repositoryConvexProjects: "organization_preserved",
  actionConfirmationTokens: "account_data",
  audit_confirmedActions_events: "account_data",
  observations_repositoryConvexSchema_snapshots: "organization_preserved",
  ui_repositoryConvexSchemaGraph_nodeLayouts: "account_data",
  observations_repository_branchTrees: "organization_preserved",
  workflow_repositoryProvisioning_plans: "organization_preserved",
  workflow_repositoryProvisioning_writeLocks: "organization_preserved",
  workflow_repositoryProvisioning_runs: "organization_preserved",
  workflow_repositoryProvisioning_events: "organization_preserved",
  workflow_repositoryDeletion_runs: "organization_preserved",
  workflow_repositoryDeletion_events: "organization_preserved",
  observations_repositoryFiles_blobs: "organization_preserved",
  ui_repositoryFileTree_folderExpansions: "account_data",
  mcpOauthClients: "global",
  mcpAuthorizationRequests: "account_data",
  mcpAuthorizationCodes: "account_data",
  mcpGrants: "account_data",
  mcpAccessTokens: "account_data",
  mcpRefreshTokens: "account_data",
  mcpBrowserLoginTokens: "account_data",
  mcpFeedbackRateLimits: "account_data",
  audit_mcpAccess_events: "account_data",
} satisfies Record<TableNames, AccountDeletionTablePolicy>;

type AccountDataTableName = {
  [
    TableName in TableNames
  ]: (typeof ACCOUNT_DELETION_TABLE_REGISTRY)[TableName] extends "account_data" ? TableName : never;
}[TableNames];

const ACCOUNT_DATA_BATCH_SIZE = 25;
type AccountDataCleanupCtx = Pick<MutationCtx, "db">;

const accountDeletionQuiescenceResult = v.union(
  v.object({ state: v.literal("done") }),
  v.object({ state: v.literal("waiting"), blocker: v.literal("active_repository_deletion") }),
  v.object({ state: v.literal("waiting"), blocker: v.literal("active_app_provisioning") }),
  v.object({ state: v.literal("waiting"), blocker: v.literal("active_manual_provider_write") }),
  v.object({
    state: v.literal("waiting"),
    blocker: v.literal("active_github_user_authorization_refresh"),
  }),
);
type AccountDeletionQuiescenceResult = Infer<typeof accountDeletionQuiescenceResult>;

async function findActiveRepositoryDeletion(
  ctx: AccountDataCleanupCtx,
  userId: Id<"users">,
): Promise<Id<"workflow_repositoryDeletion_runs"> | null> {
  for (const state of ["queued", "running"] as const) {
    const run = await ctx.db
      .query("workflow_repositoryDeletion_runs")
      .withIndex("by_user_and_state_and_updated_at", (query) =>
        query.eq("userId", userId).eq("state", state),
      )
      .order("asc")
      .first();
    if (run !== null) {
      return run._id;
    }
  }

  return null;
}

async function findActiveRepositoryProvisioning(
  ctx: AccountDataCleanupCtx,
  userId: Id<"users">,
): Promise<Id<"workflow_repositoryProvisioning_runs"> | null> {
  for (const state of ["queued", "running"] as const) {
    const run = await ctx.db
      .query("workflow_repositoryProvisioning_runs")
      .withIndex("by_user_and_state_and_updated_at", (query) =>
        query.eq("userId", userId).eq("state", state),
      )
      .order("asc")
      .first();
    if (run !== null) {
      return run._id;
    }
  }

  return null;
}

async function findActiveManualProviderWrite(
  ctx: AccountDataCleanupCtx,
  userId: Id<"users">,
): Promise<Id<"workflow_repositoryProvisioning_writeLocks"> | null> {
  const write = await ctx.db
    .query("workflow_repositoryProvisioning_writeLocks")
    .withIndex("by_manual_user_and_state", (query) =>
      query.eq("owner.userId", userId).eq("state", "active"),
    )
    .first();
  return write?._id ?? null;
}

async function deleteRowsById<TableName extends TableNames>(
  ctx: AccountDataCleanupCtx,
  rows: Array<{ _id: Id<TableName> }>,
): Promise<number> {
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }

  return rows.length;
}

type AccountDataCleanupHandler = (
  ctx: AccountDataCleanupCtx,
  userId: Id<"users">,
) => Promise<number>;

/** Property order is the bounded account-data cleanup order. */
const ACCOUNT_DATA_CLEANUP_HANDLERS = {
  organizationInvitations: async (ctx, userId) => {
    const rows = await ctx.db
      .query("organizationInvitations")
      .withIndex("by_accepted_by_user_and_state", (query) =>
        query.eq("acceptedByUserId", userId).eq("state", "accepted"),
      )
      .take(ACCOUNT_DATA_BATCH_SIZE);
    for (const invitation of rows) {
      // @ts-expect-error The compound index fixes state to accepted, but Convex does not narrow it.
      const acceptedInvitation: Extract<
        Doc<"organizationInvitations">,
        { state: "accepted" }
      > = invitation;
      await ctx.db.replace(acceptedInvitation._id, {
        state: "accepted_recipient_deleted",
        organizationId: acceptedInvitation.organizationId,
        createdByUserId: acceptedInvitation.createdByUserId,
        acceptedByUserId: acceptedInvitation.acceptedByUserId,
        createdAt: acceptedInvitation.createdAt,
        acceptedAt: acceptedInvitation.acceptedAt,
      });
    }
    return rows.length;
  },
  githubAppSetupStates: async (ctx, userId) => {
    const rows = await ctx.db
      .query("githubAppSetupStates")
      .withIndex("by_user", (query) => query.eq("userId", userId))
      .take(ACCOUNT_DATA_BATCH_SIZE);
    return await deleteRowsById(ctx, rows);
  },
  providerOAuthCallbackStates: async (ctx, userId) => {
    const rows = await ctx.db
      .query("providerOAuthCallbackStates")
      .withIndex("by_user", (query) => query.eq("userId", userId))
      .take(ACCOUNT_DATA_BATCH_SIZE);
    return await deleteRowsById(ctx, rows);
  },
  actionConfirmationTokens: async (ctx, userId) => {
    const rows = await ctx.db
      .query("actionConfirmationTokens")
      .withIndex("by_user_id", (query) => query.eq("userId", userId))
      .take(ACCOUNT_DATA_BATCH_SIZE);
    return await deleteRowsById(ctx, rows);
  },
  audit_confirmedActions_events: async (ctx, userId) => {
    const rows = await ctx.db
      .query("audit_confirmedActions_events")
      .withIndex("by_user_id", (query) => query.eq("userId", userId))
      .take(ACCOUNT_DATA_BATCH_SIZE);
    return await deleteRowsById(ctx, rows);
  },
  ui_user_settings: async (ctx, userId) => {
    const rows = await ctx.db
      .query("ui_user_settings")
      .withIndex("by_user", (query) => query.eq("userId", userId))
      .take(ACCOUNT_DATA_BATCH_SIZE);
    return await deleteRowsById(ctx, rows);
  },
  ui_workspaceSidebar_layouts: async (ctx, userId) => {
    const rows = await ctx.db
      .query("ui_workspaceSidebar_layouts")
      .withIndex("by_user_and_workspace_key", (query) => query.eq("userId", userId))
      .take(ACCOUNT_DATA_BATCH_SIZE);
    return await deleteRowsById(ctx, rows);
  },
  ui_repositoryPullRequests_filters: async (ctx, userId) => {
    const rows = await ctx.db
      .query("ui_repositoryPullRequests_filters")
      .withIndex("by_user", (query) => query.eq("userId", userId))
      .take(ACCOUNT_DATA_BATCH_SIZE);
    return await deleteRowsById(ctx, rows);
  },
  ui_repositoryResourceLinks_settings: async (ctx, userId) => {
    const rows = await ctx.db
      .query("ui_repositoryResourceLinks_settings")
      .withIndex("by_user", (query) => query.eq("userId", userId))
      .take(ACCOUNT_DATA_BATCH_SIZE);
    return await deleteRowsById(ctx, rows);
  },
  ui_repositoryTree_folderAssignments: async (ctx, userId) => {
    const rows = await ctx.db
      .query("ui_repositoryTree_folderAssignments")
      .withIndex("by_userId_and_organizationId_and_repositoryId", (query) =>
        query.eq("userId", userId),
      )
      .take(ACCOUNT_DATA_BATCH_SIZE);
    return await deleteRowsById(ctx, rows);
  },
  ui_repositoryTree_folders: async (ctx, userId) => {
    const rows = await ctx.db
      .query("ui_repositoryTree_folders")
      .withIndex("by_userId_and_organizationId_and_position", (query) => query.eq("userId", userId))
      .take(ACCOUNT_DATA_BATCH_SIZE);
    return await deleteRowsById(ctx, rows);
  },
  ui_repositoryTree_organizationSettings: async (ctx, userId) => {
    const rows = await ctx.db
      .query("ui_repositoryTree_organizationSettings")
      .withIndex("by_userId_and_organizationId", (query) => query.eq("userId", userId))
      .take(ACCOUNT_DATA_BATCH_SIZE);
    return await deleteRowsById(ctx, rows);
  },
  ui_repositoryConvexSchemaGraph_nodeLayouts: async (ctx, userId) => {
    const rows = await ctx.db
      .query("ui_repositoryConvexSchemaGraph_nodeLayouts")
      .withIndex("by_user_repository_project", (query) => query.eq("userId", userId))
      .take(ACCOUNT_DATA_BATCH_SIZE);
    return await deleteRowsById(ctx, rows);
  },
  ui_repositoryFileTree_folderExpansions: async (ctx, userId) => {
    const rows = await ctx.db
      .query("ui_repositoryFileTree_folderExpansions")
      .withIndex("by_user_and_repository", (query) => query.eq("userId", userId))
      .take(ACCOUNT_DATA_BATCH_SIZE);
    return await deleteRowsById(ctx, rows);
  },
  mcpAuthorizationRequests: async (ctx, userId) => {
    const rows = await ctx.db
      .query("mcpAuthorizationRequests")
      .withIndex("by_user_id", (query) => query.eq("userId", userId))
      .take(ACCOUNT_DATA_BATCH_SIZE);
    return await deleteRowsById(ctx, rows);
  },
  mcpAuthorizationCodes: async (ctx, userId) => {
    const rows = await ctx.db
      .query("mcpAuthorizationCodes")
      .withIndex("by_user_id", (query) => query.eq("userId", userId))
      .take(ACCOUNT_DATA_BATCH_SIZE);
    return await deleteRowsById(ctx, rows);
  },
  mcpAccessTokens: async (ctx, userId) => {
    const rows = await ctx.db
      .query("mcpAccessTokens")
      .withIndex("by_user_id", (query) => query.eq("userId", userId))
      .take(ACCOUNT_DATA_BATCH_SIZE);
    return await deleteRowsById(ctx, rows);
  },
  mcpRefreshTokens: async (ctx, userId) => {
    const rows = await ctx.db
      .query("mcpRefreshTokens")
      .withIndex("by_user_id", (query) => query.eq("userId", userId))
      .take(ACCOUNT_DATA_BATCH_SIZE);
    return await deleteRowsById(ctx, rows);
  },
  mcpBrowserLoginTokens: async (ctx, userId) => {
    const rows = await ctx.db
      .query("mcpBrowserLoginTokens")
      .withIndex("by_user_id", (query) => query.eq("userId", userId))
      .take(ACCOUNT_DATA_BATCH_SIZE);
    return await deleteRowsById(ctx, rows);
  },
  mcpFeedbackRateLimits: async (ctx, userId) => {
    const rows = await ctx.db
      .query("mcpFeedbackRateLimits")
      .withIndex("by_user_id", (query) => query.eq("userId", userId))
      .take(ACCOUNT_DATA_BATCH_SIZE);
    return await deleteRowsById(ctx, rows);
  },
  mcpGrants: async (ctx, userId) => {
    const rows = await ctx.db
      .query("mcpGrants")
      .withIndex("by_user_id", (query) => query.eq("userId", userId))
      .take(ACCOUNT_DATA_BATCH_SIZE);
    return await deleteRowsById(ctx, rows);
  },
  audit_mcpAccess_events: async (ctx, userId) => {
    const rows = await ctx.db
      .query("audit_mcpAccess_events")
      .withIndex("by_user_id", (query) => query.eq("userId", userId))
      .take(ACCOUNT_DATA_BATCH_SIZE);
    return await deleteRowsById(ctx, rows);
  },
} satisfies Record<AccountDataTableName, AccountDataCleanupHandler>;

/** Deletes at most one bounded slice of user-owned application data. */
export async function cleanupAccountDataBatchForUser(
  ctx: AccountDataCleanupCtx,
  args: { userId: Id<"users"> },
): Promise<boolean> {
  for (const cleanup of Object.values(ACCOUNT_DATA_CLEANUP_HANDLERS)) {
    if ((await cleanup(ctx, args.userId)) > 0) {
      return false;
    }
  }

  return true;
}

export const cleanupAccountDataBatch = internalMutation({
  args: {
    runId: v.id("workflow_accountDeletion_runs"),
    workflowId: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const run = await readOwnedActiveRun(ctx, args);
    return await cleanupAccountDataBatchForUser(ctx, { userId: run.identity.userId });
  },
});

export const inspectQuiescence = internalMutation({
  args: {
    runId: v.id("workflow_accountDeletion_runs"),
    workflowId: v.string(),
  },
  returns: accountDeletionQuiescenceResult,
  handler: async (ctx, args): Promise<AccountDeletionQuiescenceResult> => {
    const run = await readOwnedActiveRun(ctx, args);

    if (await findActiveRepositoryDeletion(ctx, run.identity.userId)) {
      return { state: "waiting", blocker: "active_repository_deletion" };
    }
    if (await findActiveRepositoryProvisioning(ctx, run.identity.userId)) {
      return { state: "waiting", blocker: "active_app_provisioning" };
    }
    if (await findActiveManualProviderWrite(ctx, run.identity.userId)) {
      return { state: "waiting", blocker: "active_manual_provider_write" };
    }
    const githubUserAuthorization = await ctx.db
      .query("githubUserAuthorizations")
      .withIndex("by_user", (query) => query.eq("userId", run.identity.userId))
      .unique();
    if (
      githubUserAuthorization?.refreshStartedAt !== undefined &&
      Date.now() - githubUserAuthorization.refreshStartedAt <
        GITHUB_USER_TOKEN_REFRESH_STALE_LOCK_MS
    ) {
      return { state: "waiting", blocker: "active_github_user_authorization_refresh" };
    }

    return { state: "done" };
  },
});
