import { v, type Infer } from "convex/values";

import { components } from "../_generated/api";
import type { Doc, Id, TableNames } from "../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { readBillingAccountState } from "../organizationBilling";
import { cleanupExpiredPendingUploadPage } from "../pendingUploads";
import { POLAR_CHECKOUT_CONTINUATION_FENCE_MS } from "../polarCheckout";
import {
  appendOrganizationDeletionEvent,
  readOrganizationDeletionEventsForFinalization,
} from "./events";
import { readOwnedActiveRun } from "./stepContext";

type OrganizationDeletionTablePolicy =
  | "organization_cleanup"
  | "vault_cleanup"
  | "finalization"
  | "receipt"
  | "preserve";

/** Every application table has one organization-deletion policy. */
export const ORGANIZATION_DELETION_TABLE_REGISTRY = {
  authSessions: "preserve",
  authAccounts: "preserve",
  authRefreshTokens: "preserve",
  authVerificationCodes: "preserve",
  authVerifiers: "preserve",
  authRateLimits: "preserve",
  users: "preserve",
  organizations: "finalization",
  organizationMemberships: "finalization",
  organizationInvitations: "organization_cleanup",
  organizationBillingAccounts: "organization_cleanup",
  organizationBillingActionLeases: "organization_cleanup",
  githubAppSetupStates: "organization_cleanup",
  githubUserAuthorizations: "preserve",
  workflow_accountDeletion_runs: "preserve",
  workflow_accountDeletion_events: "preserve",
  workflow_organizationDeletion_runs: "receipt",
  workflow_organizationDeletion_events: "finalization",
  organizationProviderCredentials: "organization_cleanup",
  vaultActionLeases: "vault_cleanup",
  vaultPendingUploads: "organization_cleanup",
  providerOAuthCallbackStates: "organization_cleanup",
  ui_user_settings: "preserve",
  ui_workspaceSidebar_layouts: "preserve",
  ui_vaultPullRequests_filters: "vault_cleanup",
  ui_vaultResourceLinks_settings: "vault_cleanup",
  ui_vaultFolders: "organization_cleanup",
  ui_vaultFolderAssignments: "organization_cleanup",
  ui_vaultOrganizationTree_settings: "organization_cleanup",
  vaults: "vault_cleanup",
  vaultCloudflareWorkers: "vault_cleanup",
  vaultConvexProjects: "vault_cleanup",
  observations_vaultConvexSchema_snapshots: "vault_cleanup",
  ui_vaultConvexSchemaGraph_nodeLayouts: "vault_cleanup",
  observations_vaultRepository_branchTrees: "vault_cleanup",
  workflow_vaultProvisioning_plans: "vault_cleanup",
  workflow_vaultProvisioning_writeLocks: "vault_cleanup",
  workflow_vaultProvisioning_runs: "vault_cleanup",
  workflow_vaultProvisioning_events: "vault_cleanup",
  workflow_vaultDeletion_runs: "vault_cleanup",
  workflow_vaultDeletion_events: "vault_cleanup",
  vaultStagedFiles: "vault_cleanup",
  observations_vaultFiles_blobs: "vault_cleanup",
  ui_vaultFileTree_folderExpansions: "vault_cleanup",
  vaultStagedFileUpdates: "vault_cleanup",
  mcpOauthClients: "preserve",
  mcpAuthorizationRequests: "preserve",
  mcpAuthorizationCodes: "preserve",
  mcpGrants: "preserve",
  mcpAccessTokens: "preserve",
  mcpRefreshTokens: "preserve",
  mcpBrowserLoginTokens: "preserve",
  audit_mcpAccess_events: "preserve",
} satisfies Record<TableNames, OrganizationDeletionTablePolicy>;

type OrganizationCleanupTableName = {
  [TableName in TableNames]: (typeof ORGANIZATION_DELETION_TABLE_REGISTRY)[TableName] extends "organization_cleanup"
    ? TableName
    : never;
}[TableNames];

type VaultCleanupTableName = {
  [TableName in TableNames]: (typeof ORGANIZATION_DELETION_TABLE_REGISTRY)[TableName] extends "vault_cleanup"
    ? TableName
    : never;
}[TableNames];

const ORGANIZATION_CLEANUP_BATCH_SIZE = 25;
const { id, literal, number, object, union } = v;

type OrganizationDeletionCleanupCtx = MutationCtx;
type OrganizationDeletionCleanupArgs = {
  organizationId: Id<"organizations">;
  runId: Id<"workflow_organizationDeletion_runs">;
  executionAttempt: number;
};
type OrganizationCleanupHandler = (
  ctx: OrganizationDeletionCleanupCtx,
  args: OrganizationDeletionCleanupArgs,
) => Promise<number>;
type VaultCleanupHandler = (
  ctx: OrganizationDeletionCleanupCtx,
  args: OrganizationDeletionCleanupArgs & { vault: Doc<"vaults"> | null },
) => Promise<number>;

async function deleteOrganizationInvitations(
  ctx: OrganizationDeletionCleanupCtx,
  args: OrganizationDeletionCleanupArgs,
): Promise<number> {
  const rows = await ctx.db
    .query("organizationInvitations")
    .withIndex("by_organization_and_state_and_expires_at", (query) =>
      query.eq("organizationId", args.organizationId),
    )
    .take(ORGANIZATION_CLEANUP_BATCH_SIZE);
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
  return rows.length;
}

async function deleteOrganizationBillingAccount(
  ctx: OrganizationDeletionCleanupCtx,
  args: OrganizationDeletionCleanupArgs,
): Promise<number> {
  const run = await readOwnedActiveRun(ctx, args);
  if (run.providerCleanup.state !== "not_required" && run.providerCleanup.state !== "completed") {
    throw new Error("Polar cleanup must finish before local billing cleanup.");
  }
  const row = await ctx.db
    .query("organizationBillingAccounts")
    .withIndex("by_organization", (query) => query.eq("organizationId", args.organizationId))
    .unique();
  if (row === null) {
    return 0;
  }
  await ctx.db.delete(row._id);
  return 1;
}

async function deleteOrganizationBillingActionLeases(
  ctx: OrganizationDeletionCleanupCtx,
  args: OrganizationDeletionCleanupArgs,
): Promise<number> {
  const rows = await ctx.db
    .query("organizationBillingActionLeases")
    .withIndex("by_organization_and_expires_at", (query) =>
      query.eq("organizationId", args.organizationId),
    )
    .take(ORGANIZATION_CLEANUP_BATCH_SIZE);
  return await deleteRowsById(ctx, rows);
}

async function deleteGitHubSetupStates(
  ctx: OrganizationDeletionCleanupCtx,
  args: OrganizationDeletionCleanupArgs,
): Promise<number> {
  const rows = await ctx.db
    .query("githubAppSetupStates")
    .withIndex("by_organization", (query) => query.eq("organizationId", args.organizationId))
    .take(ORGANIZATION_CLEANUP_BATCH_SIZE);
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
  return rows.length;
}

async function deleteOrganizationProviderCredentials(
  ctx: OrganizationDeletionCleanupCtx,
  args: OrganizationDeletionCleanupArgs,
): Promise<number> {
  const row = await ctx.db
    .query("organizationProviderCredentials")
    .withIndex("by_organization", (query) => query.eq("organizationId", args.organizationId))
    .unique();
  if (row === null) {
    return 0;
  }
  await ctx.db.delete(row._id);
  return 1;
}

async function deleteExpiredPendingUpload(
  ctx: OrganizationDeletionCleanupCtx,
  args: OrganizationDeletionCleanupArgs,
): Promise<number> {
  const upload = await ctx.db
    .query("vaultPendingUploads")
    .withIndex("by_organization_and_expires_at", (query) =>
      query.eq("organizationId", args.organizationId),
    )
    .first();
  if (upload === null) {
    return 0;
  }
  await cleanupExpiredPendingUploadPage(ctx, upload);
  return 1;
}

async function deleteProviderOAuthCallbackStates(
  ctx: OrganizationDeletionCleanupCtx,
  args: OrganizationDeletionCleanupArgs,
): Promise<number> {
  const rows = await ctx.db
    .query("providerOAuthCallbackStates")
    .withIndex("by_organization", (query) => query.eq("organizationId", args.organizationId))
    .take(ORGANIZATION_CLEANUP_BATCH_SIZE);
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
  return rows.length;
}

async function deleteVaultFolderAssignments(
  ctx: OrganizationDeletionCleanupCtx,
  args: OrganizationDeletionCleanupArgs,
): Promise<number> {
  const rows = await ctx.db
    .query("ui_vaultFolderAssignments")
    .withIndex("by_organization", (query) => query.eq("organizationId", args.organizationId))
    .take(ORGANIZATION_CLEANUP_BATCH_SIZE);
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
  return rows.length;
}

async function deleteVaultFolders(
  ctx: OrganizationDeletionCleanupCtx,
  args: OrganizationDeletionCleanupArgs,
): Promise<number> {
  const rows = await ctx.db
    .query("ui_vaultFolders")
    .withIndex("by_organization", (query) => query.eq("organizationId", args.organizationId))
    .take(ORGANIZATION_CLEANUP_BATCH_SIZE);
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
  return rows.length;
}

async function deleteVaultOrganizationTreeSettings(
  ctx: OrganizationDeletionCleanupCtx,
  args: OrganizationDeletionCleanupArgs,
): Promise<number> {
  const rows = await ctx.db
    .query("ui_vaultOrganizationTree_settings")
    .withIndex("by_organization", (query) => query.eq("organizationId", args.organizationId))
    .take(ORGANIZATION_CLEANUP_BATCH_SIZE);
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
  return rows.length;
}

const ORGANIZATION_CLEANUP_HANDLERS = {
  githubAppSetupStates: deleteGitHubSetupStates,
  providerOAuthCallbackStates: deleteProviderOAuthCallbackStates,
  ui_vaultFolderAssignments: deleteVaultFolderAssignments,
  ui_vaultFolders: deleteVaultFolders,
  ui_vaultOrganizationTree_settings: deleteVaultOrganizationTreeSettings,
  organizationInvitations: deleteOrganizationInvitations,
  organizationProviderCredentials: deleteOrganizationProviderCredentials,
  vaultPendingUploads: deleteExpiredPendingUpload,
  organizationBillingActionLeases: deleteOrganizationBillingActionLeases,
  organizationBillingAccounts: deleteOrganizationBillingAccount,
} satisfies Record<OrganizationCleanupTableName, OrganizationCleanupHandler>;

async function deleteRowsById<TableName extends TableNames>(
  ctx: OrganizationDeletionCleanupCtx,
  rows: Array<{ _id: Id<TableName> }>,
): Promise<number> {
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
  return rows.length;
}

async function deleteVaultPullRequestFilters(
  ctx: OrganizationDeletionCleanupCtx,
  args: OrganizationDeletionCleanupArgs & { vault: Doc<"vaults"> | null },
): Promise<number> {
  const vault = args.vault;
  if (vault === null) return 0;
  const rows = await ctx.db
    .query("ui_vaultPullRequests_filters")
    .withIndex("by_vault", (query) => query.eq("vaultId", vault._id))
    .take(ORGANIZATION_CLEANUP_BATCH_SIZE);
  return await deleteRowsById(ctx, rows);
}

async function deleteVaultResourceLinkSettings(
  ctx: OrganizationDeletionCleanupCtx,
  args: OrganizationDeletionCleanupArgs & { vault: Doc<"vaults"> | null },
): Promise<number> {
  const vault = args.vault;
  if (vault === null) return 0;
  const rows = await ctx.db
    .query("ui_vaultResourceLinks_settings")
    .withIndex("by_vault", (query) => query.eq("vaultId", vault._id))
    .take(ORGANIZATION_CLEANUP_BATCH_SIZE);
  return await deleteRowsById(ctx, rows);
}

async function deleteVaultStagedFileUpdates(
  ctx: OrganizationDeletionCleanupCtx,
  args: OrganizationDeletionCleanupArgs & { vault: Doc<"vaults"> | null },
): Promise<number> {
  const vault = args.vault;
  if (vault === null) return 0;
  const rows = await ctx.db
    .query("vaultStagedFileUpdates")
    .withIndex("by_vault", (query) => query.eq("vaultId", vault._id))
    .take(ORGANIZATION_CLEANUP_BATCH_SIZE);
  return await deleteRowsById(ctx, rows);
}

async function deleteVaultActionLeases(
  ctx: OrganizationDeletionCleanupCtx,
  args: OrganizationDeletionCleanupArgs & { vault: Doc<"vaults"> | null },
): Promise<number> {
  const vault = args.vault;
  if (vault === null) return 0;
  const rows = await ctx.db
    .query("vaultActionLeases")
    .withIndex("by_vault_and_expires_at", (query) => query.eq("vaultId", vault._id))
    .take(ORGANIZATION_CLEANUP_BATCH_SIZE);
  return await deleteRowsById(ctx, rows);
}

async function deleteVaultFileTreeFolderExpansions(
  ctx: OrganizationDeletionCleanupCtx,
  args: OrganizationDeletionCleanupArgs & { vault: Doc<"vaults"> | null },
): Promise<number> {
  const vault = args.vault;
  if (vault === null) return 0;
  const rows = await ctx.db
    .query("ui_vaultFileTree_folderExpansions")
    .withIndex("by_vault", (query) => query.eq("vaultId", vault._id))
    .take(ORGANIZATION_CLEANUP_BATCH_SIZE);
  return await deleteRowsById(ctx, rows);
}

async function deleteVaultBranchTrees(
  ctx: OrganizationDeletionCleanupCtx,
  args: OrganizationDeletionCleanupArgs & { vault: Doc<"vaults"> | null },
): Promise<number> {
  const vault = args.vault;
  if (vault === null) return 0;
  const rows = await ctx.db
    .query("observations_vaultRepository_branchTrees")
    .withIndex("by_vault_and_branch", (query) => query.eq("vaultId", vault._id))
    .take(ORGANIZATION_CLEANUP_BATCH_SIZE);
  return await deleteRowsById(ctx, rows);
}

async function deleteVaultConvexSchemaLayouts(
  ctx: OrganizationDeletionCleanupCtx,
  args: OrganizationDeletionCleanupArgs & { vault: Doc<"vaults"> | null },
): Promise<number> {
  const vault = args.vault;
  if (vault === null) return 0;
  const rows = await ctx.db
    .query("ui_vaultConvexSchemaGraph_nodeLayouts")
    .withIndex("by_vault", (query) => query.eq("vaultId", vault._id))
    .take(ORGANIZATION_CLEANUP_BATCH_SIZE);
  return await deleteRowsById(ctx, rows);
}

async function deleteVaultConvexSchemaSnapshots(
  ctx: OrganizationDeletionCleanupCtx,
  args: OrganizationDeletionCleanupArgs & { vault: Doc<"vaults"> | null },
): Promise<number> {
  const vault = args.vault;
  if (vault === null) return 0;
  const rows = await ctx.db
    .query("observations_vaultConvexSchema_snapshots")
    .withIndex("by_vault", (query) => query.eq("vaultId", vault._id))
    .take(ORGANIZATION_CLEANUP_BATCH_SIZE);
  return await deleteRowsById(ctx, rows);
}

async function deleteVaultProvisioningPlans(
  ctx: OrganizationDeletionCleanupCtx,
  args: OrganizationDeletionCleanupArgs & { vault: Doc<"vaults"> | null },
): Promise<number> {
  const vault = args.vault;
  if (vault === null) return 0;
  const rows = await ctx.db
    .query("workflow_vaultProvisioning_plans")
    .withIndex("by_vault", (query) => query.eq("vaultId", vault._id))
    .take(ORGANIZATION_CLEANUP_BATCH_SIZE);
  return await deleteRowsById(ctx, rows);
}

async function deleteVaultProvisioningWriteLocks(
  ctx: OrganizationDeletionCleanupCtx,
  args: OrganizationDeletionCleanupArgs & { vault: Doc<"vaults"> | null },
): Promise<number> {
  const vault = args.vault;
  if (vault === null) return 0;
  const rows = await ctx.db
    .query("workflow_vaultProvisioning_writeLocks")
    .withIndex("by_vault", (query) => query.eq("vaultId", vault._id))
    .take(ORGANIZATION_CLEANUP_BATCH_SIZE);
  return await deleteRowsById(ctx, rows);
}

async function deleteStorageBackedRows(
  ctx: OrganizationDeletionCleanupCtx,
  args: OrganizationDeletionCleanupArgs & { vault: Doc<"vaults"> | null },
  tableName: "vaultStagedFiles" | "observations_vaultFiles_blobs",
): Promise<number> {
  const vault = args.vault;
  if (vault === null) {
    return 0;
  }
  const rows = await ctx.db
    .query(tableName)
    .withIndex("by_vault", (query) => query.eq("vaultId", vault._id))
    .take(ORGANIZATION_CLEANUP_BATCH_SIZE);
  const storageIds = new Set<Id<"_storage">>();
  for (const row of rows) {
    if (row.storageId) {
      storageIds.add(row.storageId);
    }
    await ctx.db.delete(row._id);
  }
  for (const storageId of storageIds) {
    const [stagedFile, observedBlob] = await Promise.all([
      ctx.db
        .query("vaultStagedFiles")
        .withIndex("by_storageId", (query) => query.eq("storageId", storageId))
        .first(),
      ctx.db
        .query("observations_vaultFiles_blobs")
        .withIndex("by_storageId", (query) => query.eq("storageId", storageId))
        .first(),
    ]);
    if (stagedFile === null && observedBlob === null) {
      await ctx.storage.delete(storageId);
    }
  }
  return rows.length;
}

async function deleteVaultConvexProjects(
  ctx: OrganizationDeletionCleanupCtx,
  args: OrganizationDeletionCleanupArgs & { vault: Doc<"vaults"> | null },
): Promise<number> {
  const vault = args.vault;
  const rows = vault
    ? await ctx.db
        .query("vaultConvexProjects")
        .withIndex("by_vault", (query) => query.eq("vaultId", vault._id))
        .take(ORGANIZATION_CLEANUP_BATCH_SIZE)
    : await ctx.db
        .query("vaultConvexProjects")
        .withIndex("by_organization", (query) => query.eq("organizationId", args.organizationId))
        .take(ORGANIZATION_CLEANUP_BATCH_SIZE);
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
  return rows.length;
}

async function deleteVaultCloudflareWorkers(
  ctx: OrganizationDeletionCleanupCtx,
  args: OrganizationDeletionCleanupArgs & { vault: Doc<"vaults"> | null },
): Promise<number> {
  const vault = args.vault;
  const rows = vault
    ? await ctx.db
        .query("vaultCloudflareWorkers")
        .withIndex("by_vault", (query) => query.eq("vaultId", vault._id))
        .take(ORGANIZATION_CLEANUP_BATCH_SIZE)
    : await ctx.db
        .query("vaultCloudflareWorkers")
        .withIndex("by_organization", (query) => query.eq("organizationId", args.organizationId))
        .take(ORGANIZATION_CLEANUP_BATCH_SIZE);
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
  return rows.length;
}

async function deleteProvisioningEvents(
  ctx: OrganizationDeletionCleanupCtx,
  args: OrganizationDeletionCleanupArgs & { vault: Doc<"vaults"> | null },
): Promise<number> {
  let vaultId = args.vault?._id;
  if (vaultId === undefined) {
    const run = await ctx.db
      .query("workflow_vaultProvisioning_runs")
      .withIndex("by_organization_and_state_and_updated_at", (query) =>
        query.eq("organizationId", args.organizationId),
      )
      .first();
    vaultId = run?.vaultId;
  }
  if (vaultId === undefined) {
    return 0;
  }
  const rows = await ctx.db
    .query("workflow_vaultProvisioning_events")
    .withIndex("by_vault_and_created_at", (query) => query.eq("vaultId", vaultId))
    .take(ORGANIZATION_CLEANUP_BATCH_SIZE);
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
  return rows.length;
}

async function workflowComponentDataIsDeleted(
  ctx: OrganizationDeletionCleanupCtx,
  workflowId: string,
): Promise<boolean> {
  const cleanupStarted = await ctx.runMutation(components.workflow.workflow.cleanup, {
    workflowId,
  });
  if (cleanupStarted) {
    return false;
  }
  const steps = await ctx.runQuery(components.workflow.workflow.listSteps, {
    workflowId,
    order: "asc",
    paginationOpts: { cursor: null, numItems: 1 },
  });
  return steps.page.length === 0;
}

async function deleteProvisioningRuns(
  ctx: OrganizationDeletionCleanupCtx,
  args: OrganizationDeletionCleanupArgs & { vault: Doc<"vaults"> | null },
): Promise<number> {
  const vault = args.vault;
  const row = vault
    ? await ctx.db
        .query("workflow_vaultProvisioning_runs")
        .withIndex("by_vault_and_updated_at", (query) => query.eq("vaultId", vault._id))
        .order("desc")
        .first()
    : await ctx.db
        .query("workflow_vaultProvisioning_runs")
        .withIndex("by_organization_and_state_and_updated_at", (query) =>
          query.eq("organizationId", args.organizationId),
        )
        .order("desc")
        .first();
  if (row === null) {
    return 0;
  }
  const event = await ctx.db
    .query("workflow_vaultProvisioning_events")
    .withIndex("by_run_and_created_at", (query) => query.eq("runId", row._id))
    .first();
  if (event !== null) {
    return 1;
  }
  if (row.workflowId && !(await workflowComponentDataIsDeleted(ctx, row.workflowId))) {
    return 1;
  }
  await ctx.db.delete(row._id);
  return 1;
}

async function deleteVaultDeletionEvents(
  ctx: OrganizationDeletionCleanupCtx,
  args: OrganizationDeletionCleanupArgs & { vault: Doc<"vaults"> | null },
): Promise<number> {
  const vault = args.vault;
  const rows = vault
    ? await ctx.db
        .query("workflow_vaultDeletion_events")
        .withIndex("by_vault_and_created_at", (query) => query.eq("vaultId", vault._id))
        .take(ORGANIZATION_CLEANUP_BATCH_SIZE)
    : await ctx.db
        .query("workflow_vaultDeletion_events")
        .withIndex("by_organization_and_created_at", (query) =>
          query.eq("organizationId", args.organizationId),
        )
        .take(ORGANIZATION_CLEANUP_BATCH_SIZE);
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
  return rows.length;
}

async function deleteVaultDeletionRuns(
  ctx: OrganizationDeletionCleanupCtx,
  args: OrganizationDeletionCleanupArgs & { vault: Doc<"vaults"> | null },
): Promise<number> {
  const vault = args.vault;
  const rows = vault
    ? await ctx.db
        .query("workflow_vaultDeletion_runs")
        .withIndex("by_vault_and_updated_at", (query) => query.eq("vaultId", vault._id))
        .order("desc")
        .take(ORGANIZATION_CLEANUP_BATCH_SIZE)
    : await ctx.db
        .query("workflow_vaultDeletion_runs")
        .withIndex("by_organization_and_updated_at", (query) =>
          query.eq("organizationId", args.organizationId),
        )
        .order("desc")
        .take(ORGANIZATION_CLEANUP_BATCH_SIZE);
  for (const row of rows) {
    const child = await ctx.db
      .query("workflow_vaultDeletion_runs")
      .withIndex("by_retry_of", (query) => query.eq("attempt.retryOf", row._id))
      .first();
    if (child !== null) {
      continue;
    }
    const event = await ctx.db
      .query("workflow_vaultDeletion_events")
      .withIndex("by_run_and_created_at", (query) => query.eq("runId", row._id))
      .first();
    if (event !== null) {
      continue;
    }
    if (
      row.workflow.state === "started" &&
      !(await workflowComponentDataIsDeleted(ctx, row.workflow.workflowId))
    ) {
      return 1;
    }
    await ctx.db.delete(row._id);
    return 1;
  }
  if (rows.length > 0) {
    throw new Error("Vault deletion history is not referentially valid.");
  }
  return 0;
}

async function deletePreparedVault(
  ctx: OrganizationDeletionCleanupCtx,
  args: OrganizationDeletionCleanupArgs & { vault: Doc<"vaults"> | null },
): Promise<number> {
  const vault = args.vault;
  if (vault === null) {
    return 0;
  }
  if (vault.state !== "not_connected" || vault.deletion.state !== "not_deleting") {
    throw new Error("Vault cleanup must remove active workflow references before deletion.");
  }
  await ctx.db.delete(vault._id);
  return 1;
}

const VAULT_CLEANUP_HANDLERS = {
  vaultActionLeases: deleteVaultActionLeases,
  ui_vaultPullRequests_filters: deleteVaultPullRequestFilters,
  ui_vaultResourceLinks_settings: deleteVaultResourceLinkSettings,
  vaultStagedFileUpdates: deleteVaultStagedFileUpdates,
  vaultStagedFiles: async (ctx, args) =>
    await deleteStorageBackedRows(ctx, args, "vaultStagedFiles"),
  observations_vaultFiles_blobs: async (ctx, args) =>
    await deleteStorageBackedRows(ctx, args, "observations_vaultFiles_blobs"),
  ui_vaultFileTree_folderExpansions: deleteVaultFileTreeFolderExpansions,
  observations_vaultRepository_branchTrees: deleteVaultBranchTrees,
  ui_vaultConvexSchemaGraph_nodeLayouts: deleteVaultConvexSchemaLayouts,
  observations_vaultConvexSchema_snapshots: deleteVaultConvexSchemaSnapshots,
  vaultConvexProjects: deleteVaultConvexProjects,
  vaultCloudflareWorkers: deleteVaultCloudflareWorkers,
  workflow_vaultProvisioning_plans: deleteVaultProvisioningPlans,
  workflow_vaultProvisioning_writeLocks: deleteVaultProvisioningWriteLocks,
  workflow_vaultProvisioning_events: deleteProvisioningEvents,
  workflow_vaultProvisioning_runs: deleteProvisioningRuns,
  workflow_vaultDeletion_events: deleteVaultDeletionEvents,
  workflow_vaultDeletion_runs: deleteVaultDeletionRuns,
  vaults: deletePreparedVault,
} satisfies Record<VaultCleanupTableName, VaultCleanupHandler>;

async function prepareVaultForCleanup(
  ctx: OrganizationDeletionCleanupCtx,
  vault: Doc<"vaults"> | null,
): Promise<boolean> {
  if (
    vault === null ||
    (vault.state === "not_connected" && vault.deletion.state === "not_deleting")
  ) {
    return false;
  }
  await ctx.db.replace(vault._id, {
    state: "not_connected",
    organizationId: vault.organizationId,
    convexTeamId: vault.convexTeamId,
    cloudflareAccountId: vault.cloudflareAccountId,
    deletion: { state: "not_deleting" },
  });
  return true;
}

async function cleanupVaultDataBatch(
  ctx: OrganizationDeletionCleanupCtx,
  args: OrganizationDeletionCleanupArgs,
): Promise<number> {
  const vault = await ctx.db
    .query("vaults")
    .withIndex("by_organization", (query) => query.eq("organizationId", args.organizationId))
    .first();
  if (await prepareVaultForCleanup(ctx, vault)) {
    return 1;
  }
  const handlerArgs = { ...args, vault };
  for (const cleanup of Object.values(VAULT_CLEANUP_HANDLERS)) {
    const rowsChanged = await cleanup(ctx, handlerArgs);
    if (rowsChanged > 0) {
      return rowsChanged;
    }
  }
  return 0;
}

const quiescenceResult = union(
  object({ state: literal("done") }),
  object({ state: literal("waiting"), blocker: literal("active_vault_deletion") }),
  object({ state: literal("waiting"), blocker: literal("active_app_provisioning") }),
  object({ state: literal("waiting"), blocker: literal("active_manual_provider_write") }),
  object({ state: literal("waiting"), blocker: literal("active_provider_write_scan") }),
  object({ state: literal("waiting"), blocker: literal("active_provider_refresh") }),
  object({ state: literal("waiting"), blocker: literal("active_polar_checkout") }),
  object({ state: literal("waiting"), blocker: literal("active_polar_billing_action") }),
  object({ state: literal("waiting"), blocker: literal("active_github_setup") }),
  object({ state: literal("waiting"), blocker: literal("active_vault_action") }),
  object({ state: literal("waiting"), blocker: literal("active_media_upload") }),
);
export type OrganizationDeletionQuiescenceResult = Infer<typeof quiescenceResult>;

export const inspectQuiescence = internalMutation({
  args: {
    runId: id("workflow_organizationDeletion_runs"),
    executionAttempt: number(),
  },
  returns: quiescenceResult,
  handler: async (ctx, args): Promise<OrganizationDeletionQuiescenceResult> => {
    const run = await readOwnedActiveRun(ctx, args);
    if (run.currentStep === "request_accepted") {
      const now = Date.now();
      await ctx.db.patch(run._id, { currentStep: "wait_for_active_work", updatedAt: now });
      await appendOrganizationDeletionEvent(ctx, {
        runId: run._id,
        step: "wait_for_active_work",
        level: "info",
        message: "Waiting for active Samebase work to stop.",
        createdAt: now,
      });
    }
    for (const state of ["queued", "running"] as const) {
      const vaultDeletion = await ctx.db
        .query("workflow_vaultDeletion_runs")
        .withIndex("by_organization_and_state_and_updated_at", (query) =>
          query.eq("organizationId", run.organization.organizationId).eq("state", state),
        )
        .first();
      if (vaultDeletion !== null) {
        return { state: "waiting", blocker: "active_vault_deletion" };
      }
    }
    for (const state of ["queued", "running"] as const) {
      const provisioning = await ctx.db
        .query("workflow_vaultProvisioning_runs")
        .withIndex("by_organization_and_state_and_updated_at", (query) =>
          query.eq("organizationId", run.organization.organizationId).eq("state", state),
        )
        .first();
      if (provisioning !== null) {
        return { state: "waiting", blocker: "active_app_provisioning" };
      }
    }
    const now = Date.now();
    const setupStates = await ctx.db
      .query("githubAppSetupStates")
      .withIndex("by_user", (query) => query.eq("userId", run.requestedByUserId))
      .take(ORGANIZATION_CLEANUP_BATCH_SIZE);
    for (const setupState of setupStates) {
      if (setupState.expiresAt <= now) {
        await ctx.db.delete(setupState._id);
        continue;
      }
      if (
        setupState.organizationId === undefined &&
        (setupState.purpose ?? "installation") === "installation"
      ) {
        return { state: "waiting", blocker: "active_github_setup" };
      }
    }
    if (setupStates.length === ORGANIZATION_CLEANUP_BATCH_SIZE) {
      return { state: "waiting", blocker: "active_github_setup" };
    }
    const pendingUpload = await ctx.db
      .query("vaultPendingUploads")
      .withIndex("by_organization_and_expires_at", (query) =>
        query.eq("organizationId", run.organization.organizationId),
      )
      .first();
    if (pendingUpload !== null) {
      if (pendingUpload.expiresAt <= now) {
        await cleanupExpiredPendingUploadPage(ctx, pendingUpload);
      }
      return { state: "waiting", blocker: "active_media_upload" };
    }
    const actionLease = await ctx.db
      .query("vaultActionLeases")
      .withIndex("by_organization_and_expires_at", (query) =>
        query.eq("organizationId", run.organization.organizationId),
      )
      .first();
    if (actionLease !== null) {
      if (actionLease.expiresAt <= now) {
        await ctx.db.delete(actionLease._id);
      }
      return { state: "waiting", blocker: "active_vault_action" };
    }
    const billingActionLease = await ctx.db
      .query("organizationBillingActionLeases")
      .withIndex("by_organization_and_expires_at", (query) =>
        query.eq("organizationId", run.organization.organizationId),
      )
      .first();
    if (billingActionLease !== null) {
      if (billingActionLease.expiresAt <= now) {
        await ctx.db.delete(billingActionLease._id);
      }
      return { state: "waiting", blocker: "active_polar_billing_action" };
    }
    const vaultPage = await ctx.db
      .query("vaults")
      .withIndex("by_organization", (query) =>
        query.eq("organizationId", run.organization.organizationId),
      )
      .paginate({
        cursor: run.providerWriteScanCursor ?? null,
        numItems: ORGANIZATION_CLEANUP_BATCH_SIZE,
      });
    for (const vault of vaultPage.page) {
      const write = await ctx.db
        .query("workflow_vaultProvisioning_writeLocks")
        .withIndex("by_vault", (query) => query.eq("vaultId", vault._id))
        .unique();
      if (
        write === null ||
        write.state !== "active" ||
        (write.owner.kind === "manual_provider_write" && write.owner.expiresAt <= now)
      ) {
        continue;
      }
      return {
        state: "waiting",
        blocker:
          write.owner.kind === "manual_provider_write"
            ? "active_manual_provider_write"
            : "active_app_provisioning",
      };
    }
    if (!vaultPage.isDone) {
      await ctx.db.patch(run._id, {
        providerWriteScanCursor: vaultPage.continueCursor,
        updatedAt: now,
      });
      return { state: "waiting", blocker: "active_provider_write_scan" };
    }
    if (run.providerWriteScanCursor !== undefined) {
      await ctx.db.patch(run._id, { providerWriteScanCursor: undefined, updatedAt: now });
    }
    const billing = await ctx.db
      .query("organizationBillingAccounts")
      .withIndex("by_organization", (query) =>
        query.eq("organizationId", run.organization.organizationId),
      )
      .unique();
    const checkoutAttempt = billing
      ? readBillingAccountState(billing).polarCheckoutAttempt
      : undefined;
    if (checkoutAttempt !== undefined && run.providerCleanup.state === "not_required") {
      throw new Error("Polar checkout state has no provider cleanup identity.");
    }
    if (
      checkoutAttempt?.state === "pending" &&
      now < (checkoutAttempt.startedAt ?? run.requestedAt) + POLAR_CHECKOUT_CONTINUATION_FENCE_MS
    ) {
      return { state: "waiting", blocker: "active_polar_checkout" };
    }
    const credentials = await ctx.db
      .query("organizationProviderCredentials")
      .withIndex("by_organization", (query) =>
        query.eq("organizationId", run.organization.organizationId),
      )
      .unique();
    if (
      credentials?.cloudflare?.tokenRefreshLease &&
      credentials.cloudflare.tokenRefreshLease.expiresAt > now
    ) {
      return { state: "waiting", blocker: "active_provider_refresh" };
    }
    if (run.currentStep === "request_accepted" || run.currentStep === "wait_for_active_work") {
      const now = Date.now();
      await ctx.db.patch(run._id, { currentStep: "stop_billing", updatedAt: now });
      await appendOrganizationDeletionEvent(ctx, {
        runId: run._id,
        step: "stop_billing",
        level: "info",
        message: "Stopping organization billing.",
        createdAt: now,
      });
    }
    return { state: "done" };
  },
});

async function finalizeOrganizationDeletion(
  ctx: OrganizationDeletionCleanupCtx,
  args: OrganizationDeletionCleanupArgs,
): Promise<void> {
  const run = await readOwnedActiveRun(ctx, args);
  const organization = await ctx.db.get(args.organizationId);
  if (
    organization === null ||
    organization.deletion?.state !== "deleting" ||
    organization.deletion.runId !== run._id
  ) {
    throw new Error("Organization deletion gate changed before finalization.");
  }
  const memberships = await ctx.db
    .query("organizationMemberships")
    .withIndex("by_organization_and_role", (query) =>
      query.eq("organizationId", args.organizationId),
    )
    .take(2);
  const membership = memberships[0];
  if (
    memberships.length !== 1 ||
    membership.userId !== run.requestedByUserId ||
    membership.role !== "owner"
  ) {
    throw new Error("Organization membership changed before deletion finished.");
  }
  if (run.providerCleanup.state !== "not_required" && run.providerCleanup.state !== "completed") {
    throw new Error("Polar cleanup did not finish before organization finalization.");
  }
  const events = await readOrganizationDeletionEventsForFinalization(ctx, args.runId);

  const completedAt = Date.now();
  for (const event of events) {
    await ctx.db.delete(event._id);
  }
  await ctx.db.delete(membership._id);
  await ctx.db.delete(organization._id);
  await ctx.db.replace(run._id, {
    state: "succeeded",
    organization: { state: "scrubbed" },
    currentStep: "finish",
    requestedAt: run.requestedAt,
    updatedAt: completedAt,
    retryCount: run.retryCount,
    completedAt,
    providerCleanup:
      run.providerCleanup.state === "not_required"
        ? { state: "not_required" }
        : { state: "completed" },
  });
}

export const cleanupOrganizationDataBatch = internalMutation({
  args: {
    runId: id("workflow_organizationDeletion_runs"),
    executionAttempt: number(),
  },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    const run = await readOwnedActiveRun(ctx, args);
    if (run.currentStep !== "delete_samebase_data") {
      throw new Error("Organization data cleanup step is not active.");
    }
    const cleanupArgs = {
      ...args,
      organizationId: run.organization.organizationId,
    };
    for (const cleanup of Object.values(ORGANIZATION_CLEANUP_HANDLERS)) {
      if ((await cleanup(ctx, cleanupArgs)) > 0) {
        return false;
      }
    }
    if ((await cleanupVaultDataBatch(ctx, cleanupArgs)) > 0) {
      return false;
    }
    await finalizeOrganizationDeletion(ctx, cleanupArgs);
    return true;
  },
});
