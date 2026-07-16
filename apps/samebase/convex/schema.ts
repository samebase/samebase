import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";
import {
  vGithubTree,
  vGithubTreeData,
  vGitHubRepositoryVisibility,
  vTreeRefreshFailureKind,
  vVaultApp,
  vVaultCloudflareBuildConfig,
  vVaultCloudflareWorker,
  vVaultConvexDeployment,
  vVaultRow,
} from "./vault/model";
import {
  vVaultDeletionEventLevel,
  vVaultDeletionRun,
  vVaultDeletionStep,
} from "./vault/deletion/model";
import { vMcpTokenHealthSource, vMcpTokenHealthStatus, vMcpTokenHealth } from "./mcpTokenHealth";
import {
  vConnectedMachineRow,
  vMachineControlTokenRow,
  vMachineCredentialRow,
  vMachineRegistrationBootstrapRateLimitRow,
  vMachineRegistrationRequestRow,
} from "./connectedMachineModel";
import { vGitHubGraphqlRateBudget } from "./githubGraphqlRateBudget";
import { vGitHubObservationActionLease } from "./githubObservationActionLeaseModel";
import {
  vRepositoryInventoryFilterView,
  vRepositoryInventoryFilterViewRow,
  vRepositoryInventoryLabelChunk,
  vRepositoryInventorySnapshot,
  vRepositoryInventoryState,
  vStoredRepositoryInventoryFilter,
  vStoredRepositoryInventoryItem,
  vStoredRepositoryInventoryPullRequestLabelFacet,
} from "./repositoryInventoryModel";
import { vRepositorySummary, vRepositorySummaryDirectoryState } from "./repositorySummaryModel";
import { codespacesTable } from "./codespaces/model";
import { vWorkspaceSidebarStateRow } from "./workspaceSidebarStateModel";
import { vVaultResourceLinksStateRow } from "./vault/resourceLinksStateModel";
import { vConvexSchemaGraphLayout, vConvexSchemaSnapshot } from "./vault/convexSchemaGraphModel";
import {
  vAccountDeletionEventLevel,
  vAccountDeletionMarker,
  vAccountDeletionRun,
  vAccountDeletionStep,
} from "./accountDeletion/model";

const { array, boolean, id, literal, number, object, optional, string, union } = v;
const {
  users: _authUsers,
  authVerifiers: _authVerifiers,
  ...authTablesWithoutUsersAndVerifiers
} = authTables;

const BillingProvider = optional(literal("polar"));
const BillingPlan = optional(union(literal("free"), literal("pro")));
const BillingStatus = optional(
  union(
    literal("inactive"),
    literal("active"),
    literal("past_due"),
    literal("canceled"),
    literal("unknown"),
  ),
);
const BillingUpdatedAt = optional(number());
const BillingCurrentPeriodEndAt = optional(number());
const BillingPolarExternalCustomerId = optional(string());

const PricingBillingCycle = optional(union(literal("monthly"), literal("annual")));

export type GithubTree = Infer<typeof vGithubTree>;
export type GithubTreeData = Infer<typeof vGithubTreeData>;
export type GitHubRepositoryVisibility = Infer<typeof vGitHubRepositoryVisibility>;
export const vAppProvisioningEventLevel = union(literal("info"), literal("warn"), literal("error"));
export type AppProvisioningEventLevel = Infer<typeof vAppProvisioningEventLevel>;

export const vAppProvisioningStep = union(
  literal("initialize_vault"),
  literal("validate_connections"),
  literal("create_github_repo"),
  literal("fetch_github_repo"),
  literal("seed_starter"),
  literal("connect_github"),
  literal("create_vault"),
  literal("sync_tree"),
  literal("claim_infra"),
  literal("attach_convex"),
  literal("attach_worker"),
  literal("wire_builds"),
  literal("wire_convex_build_access"),
  literal("verify_infrastructure"),
  literal("record_domains"),
  literal("finish"),
);
export type AppProvisioningStep = Infer<typeof vAppProvisioningStep>;

export const vAppProvisioningRunStep = union(
  literal("run_created"),
  literal("initialize_vault"),
  literal("validate_connections"),
  literal("create_github_repo"),
  literal("fetch_github_repo"),
  literal("seed_starter"),
  literal("connect_github"),
  literal("create_vault"),
  literal("sync_tree"),
  literal("claim_infra"),
  literal("attach_convex"),
  literal("attach_worker"),
  literal("wire_builds"),
  literal("wire_convex_build_access"),
  literal("verify_infrastructure"),
  literal("record_domains"),
  literal("finish"),
);
export type AppProvisioningRunStep = Infer<typeof vAppProvisioningRunStep>;

export const vAppProvisioningRunTrigger = union(
  literal("create"),
  literal("connect_existing_repository"),
  literal("connect_convex_deployment"),
  literal("connect_cloudflare_worker"),
  literal("wire_builds"),
  literal("wire_convex_build_access"),
  literal("verify_infrastructure"),
  literal("retry"),
);
export type AppProvisioningRunTrigger = Infer<typeof vAppProvisioningRunTrigger>;

export const vAppProvisioningRunState = union(
  literal("queued"),
  literal("running"),
  literal("succeeded"),
  literal("failed"),
  literal("canceled"),
);
export type AppProvisioningRunState = Infer<typeof vAppProvisioningRunState>;

export const vVaultDomainKind = union(literal("main"), literal("branch_preview"));

export const vVaultDomainSource = union(
  literal("cloudflare_workers_default"),
  literal("cloudflare_workers_custom"),
  literal("cloudflare_workers_preview"),
);

export type TreeRefreshFailureKind = Infer<typeof vTreeRefreshFailureKind>;
export type VaultDeletionStep = Infer<typeof vVaultDeletionStep>;
export type VaultDeletionEventLevel = Infer<typeof vVaultDeletionEventLevel>;

export const vProdAccessScope = union(literal("vault"), literal("global"));

export const vProdAccessProvider = union(literal("convex"), literal("cloudflare"));

export const vProdAccessResourceKind = union(
  literal("deployment_status"),
  literal("logs"),
  literal("data_query"),
  literal("project_inventory"),
  literal("account_inventory"),
  literal("workers_inventory"),
);

export const vProdAccessStatus = union(
  literal("proposed"),
  literal("approved"),
  literal("rejected"),
  literal("executed"),
  literal("failed"),
  literal("expired"),
);

export const vProdAccessRedactionLevel = union(
  literal("default"),
  literal("strict"),
  literal("raw_fallback"),
);

export const vProdAccessAuditAction = union(
  literal("proposed"),
  literal("approved"),
  literal("rejected"),
  literal("executed"),
  literal("failed"),
  literal("expired"),
);

export const vProviderKind = union(literal("github"), literal("convex"), literal("cloudflare"));
export type ProviderKind = Infer<typeof vProviderKind>;

export const vMcpOauthClientCreatedBy = union(literal("dynamic_registration"), literal("manual"));
export const vMcpOauthClientRegistrationStatus = union(
  literal("provisional"),
  literal("active"),
  literal("expired"),
  literal("disabled"),
);
export const vMcpAuthRequestStatus = union(
  literal("pending"),
  literal("approved"),
  literal("denied"),
  literal("expired"),
);
export const vMcpGrantStatus = union(literal("active"), literal("revoked"));
export const vMcpRefreshTokenStatus = union(
  literal("active"),
  literal("rotated"),
  literal("revoked"),
  literal("expired"),
);

export const vOAuthAuth = object({
  method: literal("oauth"),
  credential: string(),
});
export const vCloudflareOAuthAuth = object({
  method: literal("oauth"),
  credential: string(),
  refreshCredential: string(),
  credentialExpiresAt: number(),
});
export const vMcpOAuthAuth = object({
  method: literal("mcp_oauth"),
  credential: string(),
  refreshCredential: string(),
  credentialExpiresAt: number(),
  clientId: string(),
});
export const vApiKeyAuth = object({
  method: literal("api_key"),
  credential: string(),
});
export const vStandardProviderAuth = union(vOAuthAuth, vApiKeyAuth);
export type StandardProviderAuth = Infer<typeof vStandardProviderAuth>;
export const vCloudflareProviderAuth = union(vCloudflareOAuthAuth, vMcpOAuthAuth, vApiKeyAuth);
export type CloudflareProviderAuth = Infer<typeof vCloudflareProviderAuth>;
export const vProviderAuth = union(vOAuthAuth, vMcpOAuthAuth, vApiKeyAuth);
export type ProviderAuth = Infer<typeof vProviderAuth>;
export type McpTokenHealthStatus = Infer<typeof vMcpTokenHealthStatus>;
export type McpTokenHealthSource = Infer<typeof vMcpTokenHealthSource>;
export type McpTokenHealth = Infer<typeof vMcpTokenHealth>;

export const vCloudflareDefaultAccount = union(
  object({
    state: literal("not_selected"),
  }),
  object({
    state: literal("selected"),
    accountId: string(),
    accountName: string(),
  }),
);
export type CloudflareDefaultAccount = Infer<typeof vCloudflareDefaultAccount>;

export const vGithubProviderConnection = object({
  kind: literal("github"),
  userId: id("users"),
  auth: vStandardProviderAuth,
  githubAccountId: number(),
  username: optional(string()),
  createdAt: number(),
  updatedAt: number(),
});
export const vConvexProviderConnection = object({
  kind: literal("convex"),
  userId: id("users"),
  auth: vStandardProviderAuth,
  teamId: string(),
  teamSlug: optional(string()),
  createdAt: number(),
  updatedAt: number(),
});
export const vCloudflareProviderConnection = object({
  kind: literal("cloudflare"),
  userId: id("users"),
  auth: vCloudflareProviderAuth,
  defaultAccount: vCloudflareDefaultAccount,
  tokenHealth: optional(vMcpTokenHealth),
  tokenRefreshStartedAt: optional(number()),
  lastTokenRefreshAt: optional(number()),
  createdAt: number(),
  updatedAt: number(),
});
export const vProviderConnection = union(
  vGithubProviderConnection,
  vConvexProviderConnection,
  vCloudflareProviderConnection,
);
export type ProviderConnection = Infer<typeof vProviderConnection>;

// The schema is normally optional, but Convex Auth
// requires indexes defined on `authTables`.
// The schema provides more precise TypeScript types.
export default defineSchema({
  ...authTablesWithoutUsersAndVerifiers,

  authVerifiers: defineTable({
    sessionId: optional(id("authSessions")),
    signature: optional(string()),
  })
    .index("signature", ["signature"])
    .index("sessionId", ["sessionId"]),

  /**
   * Users.
   */
  users: defineTable({
    name: optional(string()),
    displayName: optional(string()),
    image: optional(string()),
    email: string(),
    emailVerificationTime: optional(number()),
    phone: optional(string()),
    phoneVerificationTime: optional(number()),
    isAnonymous: optional(boolean()),
    isApproved: optional(boolean()),
    accountDeletion: optional(vAccountDeletionMarker),

    // Billing (Polar-backed for now).
    billingProvider: BillingProvider,
    billingPlan: BillingPlan,
    billingStatus: BillingStatus,
    billingUpdatedAt: BillingUpdatedAt,
    billingCurrentPeriodEndAt: BillingCurrentPeriodEndAt,
    billingPolarExternalCustomerId: BillingPolarExternalCustomerId,
  })
    .index("email", ["email"])
    .index("phone", ["phone"])
    .index("by_polar_external_customer_id", ["billingPolarExternalCustomerId"]),

  /**
   * Durable account deletion operations. Active identity is removed when a
   * successful run becomes a scrubbed receipt.
   */
  accountDeletionRuns: defineTable(vAccountDeletionRun)
    .index("by_completion_capability", ["completionCapability"])
    .index("by_updated_at", ["updatedAt"]),

  /** User-safe progress without account identity or provider payloads. */
  accountDeletionEvents: defineTable({
    runId: id("accountDeletionRuns"),
    step: vAccountDeletionStep,
    level: vAccountDeletionEventLevel,
    message: string(),
    createdAt: number(),
  }).index("by_run_and_created_at", ["runId", "createdAt"]),

  /** In-flight actions that can write to the Agent component. */
  agentActionLeases: defineTable({
    userId: id("users"),
    expiresAt: number(),
  }).index("by_user_and_expires_at", ["userId", "expiresAt"]),

  providerConnections: defineTable(vProviderConnection)
    .index("by_user", ["userId"])
    .index("by_user_kind", ["userId", "kind"])
    .index("by_kind_method", ["kind", "auth.method"])
    .index("by_kind_and_githubAccountId", ["kind", "githubAccountId"]),

  connectedMachines: defineTable(vConnectedMachineRow)
    .index("by_user", ["userId"])
    .index("by_machine_id", ["machineId"])
    .index("by_user_machine_id", ["userId", "machineId"]),

  machineRegistrationRequests: defineTable(vMachineRegistrationRequestRow)
    .index("by_request_id", ["requestId"])
    .index("by_machine_id", ["machineId"])
    .index("by_user", ["userId"]),

  machineRegistrationBootstrapRateLimits: defineTable(
    vMachineRegistrationBootstrapRateLimitRow,
  ).index("by_fingerprint", ["fingerprint"]),

  machineCredentials: defineTable(vMachineCredentialRow)
    .index("by_machine_id", ["machineId"])
    .index("by_user_machine_id", ["userId", "machineId"])
    .index("by_credential_hash", ["credentialHash"]),

  machineControlTokens: defineTable(vMachineControlTokenRow)
    .index("by_token_hash", ["tokenHash"])
    .index("by_user_machine_id", ["userId", "machineId"])
    .index("by_expires_at", ["expiresAt"]),

  dashboardSettings: defineTable({
    userId: id("users"),
    accountPanelOpen: optional(boolean()),
    providersPanelOpen: boolean(),
    // TODO: remove this
    pricingBillingCycle: PricingBillingCycle,
    editorChatOpen: optional(boolean()),
    globalChatOpen: optional(boolean()),
  }).index("by_user", ["userId"]),

  workspaceSidebarState: defineTable(vWorkspaceSidebarStateRow).index("by_user_and_workspace_key", [
    "userId",
    "workspaceKey",
  ]),

  vaultResourceLinksState: defineTable(vVaultResourceLinksStateRow)
    .index("by_user", ["userId"])
    .index("by_user_and_vault", ["userId", "vaultId"])
    .index("by_vault", ["vaultId"]),

  /**
   * Vault is the durable app container. Repo-backed behavior must require the
   * connected GitHub variant before reading repository identity fields.
   */
  vaults: defineTable(vVaultRow)
    .index("by_userId", ["userId"])
    .index("by_userId_and_state_and_deletion_state", ["userId", "state", "deletion.state"])
    .index("by_userId_and_ghRepoId", ["userId", "ghRepoId"])
    .index("by_userId_and_repositoryKey", ["userId", "repositoryKey"]),

  /**
   * Deployable app roots inside a repo-backed vault. Provider resources attach
   * to these rows; "." is an explicit root app, not a fallback target.
   */
  vaultApps: defineTable(vVaultApp)
    .index("by_vault", ["vaultId"])
    .index("by_user", ["userId"])
    .index("by_vault_and_appRoot", ["vaultId", "appRoot"]),

  /**
   * Cloudflare Worker targets connected to one repo-backed vault. App root is
   * the monorepo path this Worker deploys; vault identity stays repository-only.
   */
  vaultCloudflareWorkers: defineTable(vVaultCloudflareWorker)
    .index("by_vault", ["vaultId"])
    .index("by_user", ["userId"])
    .index("by_vault_and_appRoot", ["vaultId", "appRoot"])
    .index("by_vault_and_account_and_worker", ["vaultId", "accountId", "workerName"]),

  /**
   * Convex deployments connected to one repo-backed vault. App root is the
   * monorepo path this deployment serves; vault identity stays repository-only.
   */
  vaultConvexDeployments: defineTable(vVaultConvexDeployment)
    .index("by_vault", ["vaultId"])
    .index("by_user", ["userId"])
    .index("by_vault_and_appRoot", ["vaultId", "appRoot"])
    .index("by_vault_and_project", ["vaultId", "projectId"]),

  /**
   * Live Convex deployment schema snapshots normalized into table graph data.
   * Raw schema JSON is retained for export/debugging; deploy keys are never stored.
   */
  vaultConvexSchemaSnapshots: defineTable(vConvexSchemaSnapshot)
    .index("by_vault", ["vaultId"])
    .index("by_user", ["userId"])
    .index("by_deployment_and_fetched_at", ["deploymentId", "fetchedAt"]),

  /**
   * Per-user Convex schema graph node positions. Layout is intentionally
   * separate from snapshots so refreshes do not reset manual arrangement.
   */
  vaultConvexSchemaGraphLayouts: defineTable(vConvexSchemaGraphLayout)
    .index("by_vault", ["vaultId"])
    .index("by_user_vault_deployment", ["userId", "vaultId", "deploymentId"])
    .index("by_user_vault_deployment_node", ["userId", "vaultId", "deploymentId", "nodeId"]),

  /**
   * Branch-scoped Git trees for each vault.
   */
  vaultBranchTrees: defineTable({
    vaultId: id("vaults"),
    branch: string(),
    treeSHA: string(),
    commitSHA: optional(string()),
    treeData: vGithubTreeData,
    lastTreeRefreshAt: number(),
    treeRefreshStartedAt: optional(number()),
  }).index("by_vault_and_branch", ["vaultId", "branch"]),

  /**
   * The single reactive row for one selected repository. Immutable snapshot
   * pages never read this row, so polling lifecycle writes cannot fan out to
   * every page the browser has loaded.
   */
  vaultRepositoryInventories: defineTable(vRepositoryInventoryState)
    .index("by_vault", ["vaultId"])
    .index("by_userId_and_lifecycle_state", ["userId", "lifecycle.state"]),

  /**
   * One fixed-size default-branch summary for every connected vault. Directory
   * pages join at most one summary row per vault and never read inventory pages.
   */
  vaultRepositorySummaries: defineTable(vRepositorySummary)
    .index("by_vault", ["vaultId"])
    .index("by_userId_and_lifecycle_state_and_refreshEligibleAt", [
      "userId",
      "lifecycle.state",
      "refreshEligibleAt",
    ]),

  /**
   * One reactive revision per user. Summary directory pages are point-in-time;
   * this row tells the browser when its currently loaded pages should refetch.
   */
  vaultRepositorySummaryDirectoryStates: defineTable(vRepositorySummaryDirectoryState).index(
    "by_userId",
    ["userId"],
  ),

  /**
   * High-churn GitHub GraphQL budget state. GitHub-account-scoped leases serialize
   * repository crawls across every connection for the same provider principal.
   */
  githubGraphqlRateBudgets: defineTable(vGitHubGraphqlRateBudget)
    .index("by_githubAccountId", ["githubAccountId"])
    .index("by_inventory_lease_vaultId", ["lease.owner.vaultId"]),

  /** Provider-capable GitHub actions that account and vault deletion must outlive. */
  githubObservationActionLeases: defineTable(vGitHubObservationActionLease)
    .index("by_userId_and_expiresAt", ["userId", "expiresAt"])
    .index("by_vaultId_and_expiresAt", ["vaultId", "expiresAt"])
    .index("by_leaseGroupId", ["leaseGroupId"]),

  /**
   * Bounded counters for one immutable repository inventory snapshot.
   */
  vaultRepositoryInventorySnapshots: defineTable(vRepositoryInventorySnapshot).index("by_vault", [
    "vaultId",
  ]),

  /**
   * Branch and open pull request rows for one immutable inventory snapshot.
   */
  vaultRepositoryInventoryItems: defineTable(vStoredRepositoryInventoryItem)
    .index("by_vault", ["vaultId"])
    .index("by_snapshot_and_rowKey", ["snapshotId", "rowKey"])
    .index("by_snapshot_and_kind_and_sortGroup_and_sortTime_and_rowKey", [
      "snapshotId",
      "kind",
      "sortGroup",
      "sortTime",
      "rowKey",
    ])
    .index("by_snapshot_kind_localHeadRefName_sortTime_rowKey", [
      "snapshotId",
      "kind",
      "localHeadRefName",
      "sortTime",
      "rowKey",
    ]),

  /**
   * Bounded pull request label chunks for one immutable inventory snapshot.
   */
  vaultRepositoryInventoryLabelChunks: defineTable(vRepositoryInventoryLabelChunk)
    .index("by_vault", ["vaultId"])
    .index("by_snapshot_and_rowKey_and_chunkIndex", ["snapshotId", "rowKey", "chunkIndex"]),

  /** Complete label counts for one immutable repository inventory snapshot. */
  vaultRepositoryInventoryLabelFacets: defineTable(vStoredRepositoryInventoryPullRequestLabelFacet)
    .index("by_vault", ["vaultId"])
    .index("by_snapshot_and_sortKey_and_labelKey", ["snapshotId", "sortKey", "labelKey"]),

  /** Saved PR presentation settings for one user and vault. */
  vaultRepositoryInventoryFilters: defineTable(vStoredRepositoryInventoryFilter)
    .index("by_user", ["userId"])
    .index("by_vault", ["vaultId"])
    .index("by_user_and_vault", ["userId", "vaultId"]),

  /** A complete materialized PR result set for one snapshot and filter revision. */
  vaultRepositoryInventoryFilterViews: defineTable(vRepositoryInventoryFilterView)
    .index("by_vault", ["vaultId"])
    .index("by_snapshot", ["snapshotId"])
    .index("by_snapshot_and_filterRevision", ["snapshotId", "filterRevision"]),

  /** Visible PR membership ordered independently from unfiltered branch rows. */
  vaultRepositoryInventoryFilterViewRows: defineTable(vRepositoryInventoryFilterViewRow)
    .index("by_vault", ["vaultId"])
    .index("by_view_and_sortTime_and_rowKey", ["viewId", "sortTime", "rowKey"]),

  /**
   * User-selected app root, provider names, and early provider identities for
   * Samebase-managed infrastructure. The single app root is shared across
   * provider resources so one target cannot split Convex and Cloudflare.
   */
  vaultInfrastructureTargets: defineTable({
    vaultId: id("vaults"),
    appRoot: string(),
    convex: union(
      object({
        state: literal("planned"),
        projectName: string(),
      }),
      object({
        state: literal("created"),
        projectName: string(),
        projectId: string(),
      }),
    ),
    cloudflare: union(
      object({
        state: literal("planned"),
        accountId: string(),
        workerName: string(),
        build: vVaultCloudflareBuildConfig,
      }),
      object({
        state: literal("created"),
        accountId: string(),
        workerName: string(),
        workerTag: string(),
        workersDevUrl: optional(string()),
        build: vVaultCloudflareBuildConfig,
      }),
    ),
    createdAt: number(),
    updatedAt: number(),
  }).index("by_vault", ["vaultId"]),

  /**
   * Latest Workflow run allowed to write provider state for a vault.
   * Keeping the last owner after completion makes older in-flight workflows
   * fail closed instead of regaining ownership after a newer run finishes.
   */
  vaultInfrastructureOwnership: defineTable({
    vaultId: id("vaults"),
    runId: id("appProvisioningRuns"),
    state: union(literal("active"), literal("succeeded"), literal("failed")),
    updatedAt: number(),
  })
    .index("by_vault", ["vaultId"])
    .index("by_vault_and_state", ["vaultId", "state"])
    .index("by_run", ["runId"]),

  /**
   * App-owned Workflow run identity for Samebase-managed provisioning.
   */
  appProvisioningRuns: defineTable({
    userId: id("users"),
    vaultId: id("vaults"),
    repositoryFullName: string(),
    // Assigned after the Workflow component start call returns; run identity
    // exists first so early events can still be linked deterministically.
    workflowId: optional(string()),
    trigger: vAppProvisioningRunTrigger,
    createdConvexProject: optional(
      object({
        projectName: string(),
        projectId: string(),
        projectSlug: string(),
      }),
    ),
    state: vAppProvisioningRunState,
    currentStep: vAppProvisioningRunStep,
    lastError: optional(string()),
    createdAt: number(),
    updatedAt: number(),
    completedAt: optional(number()),
  })
    .index("by_vault_and_updated_at", ["vaultId", "updatedAt"])
    .index("by_vault_and_state", ["vaultId", "state"])
    .index("by_user_and_updated_at", ["userId", "updatedAt"])
    .index("by_user_and_state_and_updated_at", ["userId", "state", "updatedAt"])
    .index("by_workflow_id", ["workflowId"]),

  /**
   * User-visible provisioning events for Samebase-managed app creation.
   */
  appProvisioningEvents: defineTable({
    userId: id("users"),
    vaultId: id("vaults"),
    repositoryFullName: string(),
    runId: id("appProvisioningRuns"),
    step: vAppProvisioningStep,
    level: vAppProvisioningEventLevel,
    message: string(),
    createdAt: number(),
  })
    .index("by_vault_and_created_at", ["vaultId", "createdAt"])
    .index("by_run_and_created_at", ["runId", "createdAt"]),

  /**
   * Durable operation runs for vault deletion. These rows intentionally outlive
   * the vault so failed and completed destructive work remains auditable.
   */
  vaultDeletionRuns: defineTable(vVaultDeletionRun)
    .index("by_vault_and_updated_at", ["vaultId", "updatedAt"])
    .index("by_user_and_updated_at", ["userId", "updatedAt"])
    .index("by_user_and_state_and_updated_at", ["userId", "state", "updatedAt"])
    .index("by_workflow_id", ["workflow.workflowId"])
    .index("by_retry_of", ["attempt.retryOf"]),

  /**
   * User-safe deletion progress events. Events never store credentials,
   * provider request payloads, or response bodies.
   */
  vaultDeletionEvents: defineTable({
    userId: id("users"),
    vaultId: id("vaults"),
    repositoryFullName: string(),
    runId: id("vaultDeletionRuns"),
    step: vVaultDeletionStep,
    level: vVaultDeletionEventLevel,
    message: string(),
    createdAt: number(),
  })
    .index("by_vault_and_created_at", ["vaultId", "createdAt"])
    .index("by_run_and_created_at", ["runId", "createdAt"]),

  /**
   * Branch to domain mapping.
   */
  vaultDomains: defineTable({
    vaultId: id("vaults"),
    branch: string(),
    kind: vVaultDomainKind,
    url: string(),
    source: vVaultDomainSource,
    active: boolean(),
    lastSyncedAt: number(),
  })
    .index("by_vault", ["vaultId"])
    .index("by_vault_and_branch", ["vaultId", "branch"]),

  codespaces: codespacesTable,

  /**
   * File staging for real-time collaborative editing.
   * Stores unsaved changes before they're committed to GitHub.
   */
  fileStaging: defineTable({
    ownerId: id("users"),
    vaultId: id("vaults"),

    fileDeleted: boolean(),
    kind: optional(union(literal("text"), literal("binary"))),

    filePath: string(),
    initialFilePath: string(),

    content: string(),
    // TODO: Maybe remove and rely on blobs table instead?
    initialContent: string(),
    storageId: optional(id("_storage")),
    mime: optional(string()),
    size: optional(number()),
    stagedBlobSha: optional(string()),

    parentCommitSha: union(string(), v.null()), // SHA of the GitHub commit this edit is based on

    lastEditTime: number(),
    lastEditUserId: id("users"),
    branch: string(),

    // Collaborative editing fields
    version: number(), // Current version for collaborative editing (defaults to 0)
  })
    .index("by_vault_and_path", ["vaultId", "filePath"])
    .index("by_vault_and_branch_and_path", ["vaultId", "branch", "filePath"])
    .index("by_vault_and_initial_path", ["vaultId", "initialFilePath"])
    .index("by_vault_and_branch", ["vaultId", "branch"])
    .index("by_vault_and_branch_and_initial_path", ["vaultId", "branch", "initialFilePath"])
    .index("by_vault", ["vaultId"])
    .index("by_vault_and_storageId", ["vaultId", "storageId"])
    .index("by_storageId", ["storageId"])
    .index("by_user", ["lastEditUserId"]),

  // Unique content (dedup by sha)
  blobs: defineTable({
    // Even though it's not necessary. It can be used to easily cleanup files and unreferenced blobs.
    vaultId: id("vaults"),
    sha: string(), // unique index
    size: number(),
    // Inline small text for fast reads
    text: optional(string()),
    // Everything else goes to storage
    storageId: optional(id("_storage")),
    mime: optional(string()),
    ext: optional(string()),
  })
    .index("by_sha", ["sha"])
    .index("by_vault", ["vaultId"])
    .index("by_vault_and_storageId", ["vaultId", "storageId"])
    .index("by_storageId", ["storageId"]),

  /**
   * Folder expansion state for file tree sidebar.
   * Stores which folders are expanded/collapsed per user per vault.
   */
  folderExpansionState: defineTable({
    userId: id("users"),
    vaultId: id("vaults"),
    folderPath: string(), // path to the folder
    isExpanded: boolean(),
  })
    .index("by_vault", ["vaultId"])
    .index("by_user_and_vault", ["userId", "vaultId"])
    .index("by_user_vault_and_path", ["userId", "vaultId", "folderPath"]),

  /**
   * Agent graph node layout for Graph View.
   * Stores per-user, per-vault node dimensions.
   */
  agentGraphNodeLayout: defineTable({
    userId: id("users"),
    vaultId: id("vaults"),
    nodeId: string(),
    width: number(),
    height: number(),
    updatedAt: number(),
  })
    .index("by_vault", ["vaultId"])
    .index("by_user_and_vault", ["userId", "vaultId"])
    .index("by_user_vault_and_node", ["userId", "vaultId", "nodeId"]),

  /**
   * Collaborative editing updates for operational transformation.
   * Stores individual changes made to files for proper conflict resolution.
   */

  /**
   * Agent thread context for AI Fab.
   * Stores per-thread context not modeled by the Agent component.
   */
  agentThreadContext: defineTable({
    threadId: string(),
    userId: id("users"),
    vaultId: optional(id("vaults")),
    repositoryFullName: optional(string()),
    branch: optional(string()),
    filePath: optional(string()),
    systemPrompt: optional(string()),
    draftMessage: optional(string()),
    draftUpdatedAt: optional(number()),
    createdAt: number(),
  })
    .index("by_threadId", ["threadId"])
    .index("by_userId", ["userId"])
    .index("by_vault", ["vaultId"])
    .index("by_userId_and_vaultId", ["userId", "vaultId"]),

  /**
   * Chat message metadata for AI Fab (commit proposals, prod-read proposals, tool activity).
   */
  chatMessageMetadata: defineTable({
    messageId: string(),
    threadId: string(),
    type: union(
      literal("tool_activity"),
      literal("commit_proposal"),
      literal("prod_read_proposal"),
      literal("prod_read_result"),
    ),
    payloadJson: string(),
    createdAt: number(),
  })
    .index("by_messageId", ["messageId"])
    .index("by_threadId", ["threadId"]),

  /**
   * Approval-first requests for AI reads against production infrastructure/data.
   */
  aiProdAccessRequests: defineTable({
    threadId: string(),
    requesterUserId: id("users"),
    vaultId: optional(id("vaults")),

    scope: vProdAccessScope,
    provider: vProdAccessProvider,
    resourceKind: vProdAccessResourceKind,
    toolName: string(),
    paramsJson: string(),

    status: vProdAccessStatus,
    redactionLevel: vProdAccessRedactionLevel,

    approvedBy: optional(id("users")),
    approvedAt: optional(number()),
    executedAt: optional(number()),
    expiresAt: optional(number()),
    error: optional(string()),
  })
    .index("by_threadId", ["threadId"])
    .index("by_requester", ["requesterUserId"])
    .index("by_approved_by", ["approvedBy"])
    .index("by_status", ["status"])
    .index("by_vault", ["vaultId"]),

  /**
   * Immutable audit events for prod-access request lifecycle.
   */
  aiProdAccessAudit: defineTable({
    requestId: id("aiProdAccessRequests"),
    actorUserId: id("users"),
    action: vProdAccessAuditAction,
    toolName: string(),
    endpoint: string(),
    argumentHash: string(),
    rowCount: optional(number()),
    logLineCount: optional(number()),
    createdAt: number(),
    error: optional(string()),
  })
    .index("by_request", ["requestId"])
    .index("by_actor", ["actorUserId"])
    .index("by_action", ["action"]),

  /**
   * OAuth state records for provider integrations.
   */
  oauthStates: defineTable({
    provider: union(
      literal("github"),
      literal("convex"),
      literal("cloudflare"),
      literal("cloudflare_mcp"),
    ),
    userId: id("users"),
    state: string(),
    returnToPath: optional(string()),
    codeVerifier: optional(string()),
    clientId: optional(string()),
    clientSecret: optional(string()),
    createdAt: number(),
    expiresAt: number(),
  })
    .index("by_state", ["state"])
    .index("by_user", ["userId"]),

  /**
   * MCP OAuth clients registered against samebase.com.
   */
  mcpOauthClients: defineTable({
    clientId: string(),
    clientName: optional(string()),
    redirectUris: array(string()),
    grantTypes: array(string()),
    responseTypes: array(string()),
    tokenEndpointAuthMethod: literal("none"),
    createdAt: number(),
    updatedAt: number(),
    createdBy: vMcpOauthClientCreatedBy,
    registrationStatus: vMcpOauthClientRegistrationStatus,
    provisionalExpiresAt: optional(number()),
    firstTokenExchangedAt: optional(number()),
    metadataJson: string(),
  })
    .index("by_client_id", ["clientId"])
    .index("by_registration_status", ["registrationStatus"])
    .index("by_provisional_expires_at", ["provisionalExpiresAt"]),

  /**
   * Pending authorization requests for MCP OAuth consent.
   */
  mcpAuthRequests: defineTable({
    requestId: string(),
    clientId: string(),
    redirectUri: string(),
    resource: string(),
    scope: string(),
    state: optional(string()),
    codeChallenge: string(),
    codeChallengeMethod: literal("S256"),
    userId: optional(id("users")),
    status: vMcpAuthRequestStatus,
    createdAt: number(),
    expiresAt: number(),
  })
    .index("by_request_id", ["requestId"])
    .index("by_user_id", ["userId"])
    .index("by_client_id", ["clientId"])
    .index("by_status", ["status"])
    .index("by_expires_at", ["expiresAt"]),

  /**
   * One-time authorization codes for MCP OAuth.
   */
  mcpAuthorizationCodes: defineTable({
    codeHash: string(),
    requestId: string(),
    grantId: string(),
    clientId: string(),
    userId: id("users"),
    redirectUri: string(),
    resource: string(),
    scope: string(),
    expiresAt: number(),
    usedAt: optional(number()),
  })
    .index("by_code_hash", ["codeHash"])
    .index("by_user_id", ["userId"])
    .index("by_grant_id", ["grantId"])
    .index("by_client_id", ["clientId"])
    .index("by_expires_at", ["expiresAt"]),

  /**
   * Durable OAuth grants for MCP clients.
   */
  mcpGrants: defineTable({
    grantId: string(),
    userId: id("users"),
    clientId: string(),
    resource: string(),
    scope: string(),
    status: vMcpGrantStatus,
    createdAt: number(),
    updatedAt: number(),
    lastUsedAt: optional(number()),
    metadataJson: optional(string()),
  })
    .index("by_grant_id", ["grantId"])
    .index("by_user_id", ["userId"])
    .index("by_user_id_and_status", ["userId", "status"])
    .index("by_client_id", ["clientId"])
    .index("by_status", ["status"]),

  /**
   * Opaque access tokens for MCP resource access.
   */
  mcpAccessTokens: defineTable({
    tokenHash: string(),
    grantId: string(),
    clientId: string(),
    userId: id("users"),
    resource: string(),
    scope: string(),
    createdAt: number(),
    expiresAt: number(),
    lastUsedAt: optional(number()),
    revokedAt: optional(number()),
  })
    .index("by_token_hash", ["tokenHash"])
    .index("by_grant_id", ["grantId"])
    .index("by_user_id", ["userId"])
    .index("by_expires_at", ["expiresAt"]),

  /**
   * Opaque refresh tokens for OAuth token rotation.
   */
  mcpRefreshTokens: defineTable({
    grantId: string(),
    clientId: string(),
    userId: id("users"),
    tokenHash: string(),
    status: vMcpRefreshTokenStatus,
    createdAt: number(),
    expiresAt: optional(number()),
    rotatedAt: optional(number()),
    replacedByTokenHash: optional(string()),
  })
    .index("by_token_hash", ["tokenHash"])
    .index("by_grant_id", ["grantId"])
    .index("by_user_id", ["userId"])
    .index("by_status", ["status"])
    .index("by_expires_at", ["expiresAt"]),

  /**
   * Immutable audit events for MCP OAuth lifecycle.
   */
  mcpAccessAudit: defineTable({
    grantId: optional(string()),
    clientId: optional(string()),
    userId: optional(id("users")),
    action: string(),
    createdAt: number(),
    detailsJson: optional(string()),
  })
    .index("by_grant_id", ["grantId"])
    .index("by_client_id", ["clientId"])
    .index("by_user_id", ["userId"])
    .index("by_action", ["action"]),

  agentBrowserHandoffs: defineTable({
    tokenHash: string(),
    userId: id("users"),
    grantId: string(),
    clientId: string(),
    // Deprecated rollout field. New handoffs never write it; legacy rows expire after five minutes.
    returnToPath: optional(string()),
    createdAt: number(),
    expiresAt: number(),
    consumedAt: optional(number()),
  })
    .index("by_token_hash", ["tokenHash"])
    .index("by_user_id", ["userId"])
    .index("by_grant_id", ["grantId"]),

  collaborativeUpdates: defineTable({
    vaultId: id("vaults"),
    branch: optional(string()),
    filePath: string(),
    version: number(), // Version number when this update was applied
    clientId: string(), // Client identifier
    changes: string(), // Serialized ChangeSet from CodeMirror
    userId: id("users"), // User who made the change
    timestamp: number(),
  })
    .index("by_vault", ["vaultId"])
    .index("by_vault_and_timestamp", ["vaultId", "timestamp"])
    .index("by_file", ["vaultId", "filePath"])
    .index("by_file_and_version", ["vaultId", "filePath", "version"])
    .index("by_vaultId_and_branch", ["vaultId", "branch"])
    .index("by_vaultId_and_branch_and_timestamp", ["vaultId", "branch", "timestamp"])
    .index("by_vaultId_and_branch_and_filePath", ["vaultId", "branch", "filePath"])
    .index("by_vaultId_and_branch_and_filePath_and_version", [
      "vaultId",
      "branch",
      "filePath",
      "version",
    ])
    .index("by_vaultId_and_branch_and_filePath_and_timestamp", [
      "vaultId",
      "branch",
      "filePath",
      "timestamp",
    ]),
});
