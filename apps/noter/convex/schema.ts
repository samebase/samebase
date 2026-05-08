import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";
import { hostingStateValidator } from "./hostingState";
import {
  GithubTree as githubTreeValidator,
  GithubTreeData as githubTreeDataValidator,
  GitHubRepositoryVisibility as gitHubRepositoryVisibilityValidator,
  InfraState as infraStateValidator,
  TreeRefreshFailureKind as treeRefreshFailureKindValidator,
  VaultRow,
} from "./vaultModel";
import {
  mcpTokenHealthSourceValidator,
  mcpTokenHealthStatusValidator,
  mcpTokenHealthValidator,
} from "./mcpTokenHealth";
import {
  connectedMachineRowValidator,
  machineControlTokenRowValidator,
  machineCredentialRowValidator,
  machineRegistrationBootstrapRateLimitRowValidator,
  machineRegistrationRequestRowValidator,
} from "./connectedMachineModel";
import { codespacesTable } from "./codespaces/model";
import { workspaceSidebarStateRowValidator } from "./workspaceSidebarStateModel";

const { array, boolean, id, literal, number, object, optional, string, union } =
  v;
const { users: _authUsers, ...authTablesWithoutUsers } = authTables;

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

const PricingBillingCycle = optional(
  union(literal("monthly"), literal("annual")),
);

export const PullRequestLabel = union(
  string(),
  object({
    name: string(),
    color: optional(string()),
  }),
);
export type PullRequestLabel = Infer<typeof PullRequestLabel>;

export const GithubTree = githubTreeValidator;
export type GithubTreeType = Infer<typeof GithubTree>;
export const GithubTreeData = githubTreeDataValidator;
export type GithubTreeData = Infer<typeof GithubTreeData>;
export const GitHubRepositoryVisibility = gitHubRepositoryVisibilityValidator;
export type GitHubRepositoryVisibility = Infer<
  typeof GitHubRepositoryVisibility
>;
export const InfraState = infraStateValidator;
export type InfraState = Infer<typeof InfraState>;

export const AppProvisioningEventLevel = union(
  literal("info"),
  literal("warn"),
  literal("error"),
);
export type AppProvisioningEventLevel = Infer<typeof AppProvisioningEventLevel>;

export const AppProvisioningStep = union(
  literal("validate_connections"),
  literal("create_github_repo"),
  literal("seed_starter"),
  literal("create_vault"),
  literal("sync_tree"),
  literal("claim_infra"),
  literal("ensure_convex"),
  literal("ensure_convex_preview"),
  literal("ensure_cloudflare"),
  literal("record_domains"),
  literal("finish"),
);
export type AppProvisioningStep = Infer<typeof AppProvisioningStep>;

export const AppProvisioningRunStep = union(
  literal("run_created"),
  literal("validate_connections"),
  literal("create_github_repo"),
  literal("seed_starter"),
  literal("create_vault"),
  literal("sync_tree"),
  literal("claim_infra"),
  literal("ensure_convex"),
  literal("ensure_convex_preview"),
  literal("ensure_cloudflare"),
  literal("record_domains"),
  literal("finish"),
);
export type AppProvisioningRunStep = Infer<typeof AppProvisioningRunStep>;

export const AppProvisioningRunTrigger = union(
  literal("create"),
  literal("retry"),
);
export type AppProvisioningRunTrigger = Infer<typeof AppProvisioningRunTrigger>;

export const AppProvisioningRunState = union(
  literal("queued"),
  literal("running"),
  literal("succeeded"),
  literal("failed"),
  literal("canceled"),
);
export type AppProvisioningRunState = Infer<typeof AppProvisioningRunState>;

export const VaultDomainKind = union(
  literal("main"),
  literal("branch_preview"),
);

export const VaultDomainSource = union(
  literal("cloudflare_pages_default"),
  literal("cloudflare_pages_custom"),
);

export const VaultRemoteBranchState = union(
  literal("active"),
  literal("deleted_upstream"),
);

export const TreeRefreshFailureKind = treeRefreshFailureKindValidator;
export type TreeRefreshFailureKind = Infer<typeof TreeRefreshFailureKind>;

export const ProdAccessScope = union(literal("vault"), literal("global"));

export const ProdAccessProvider = union(
  literal("convex"),
  literal("cloudflare"),
);

export const ProdAccessResourceKind = union(
  literal("deployment_status"),
  literal("logs"),
  literal("data_query"),
  literal("project_inventory"),
  literal("account_inventory"),
  literal("pages_project_inventory"),
);

export const ProdAccessStatus = union(
  literal("proposed"),
  literal("approved"),
  literal("rejected"),
  literal("executed"),
  literal("failed"),
  literal("expired"),
);

export const ProdAccessRedactionLevel = union(
  literal("default"),
  literal("strict"),
  literal("raw_fallback"),
);

export const ProdAccessAuditAction = union(
  literal("proposed"),
  literal("approved"),
  literal("rejected"),
  literal("executed"),
  literal("failed"),
  literal("expired"),
);

export const ProviderKind = union(
  literal("github"),
  literal("convex"),
  literal("cloudflare"),
);
export type ProviderKind = Infer<typeof ProviderKind>;

export const McpOauthClientCreatedBy = union(
  literal("dynamic_registration"),
  literal("manual"),
);
export const McpOauthClientRegistrationStatus = union(
  literal("provisional"),
  literal("active"),
  literal("expired"),
  literal("disabled"),
);
export const McpAuthRequestStatus = union(
  literal("pending"),
  literal("approved"),
  literal("denied"),
  literal("expired"),
);
export const McpGrantStatus = union(literal("active"), literal("revoked"));
export const McpRefreshTokenStatus = union(
  literal("active"),
  literal("rotated"),
  literal("revoked"),
  literal("expired"),
);

export const OAuthAuth = object({
  method: literal("oauth"),
  credential: string(),
  refreshCredential: optional(string()),
  credentialExpiresAt: optional(number()),
});
export const McpOAuthAuth = object({
  method: literal("mcp_oauth"),
  credential: string(),
  refreshCredential: optional(string()),
  credentialExpiresAt: optional(number()),
  clientId: optional(string()),
  mcpServerUrl: string(),
});
export const ApiKeyAuth = object({
  method: literal("api_key"),
  credential: string(),
  credentialExpiresAt: optional(number()),
});
export const StandardProviderAuth = union(OAuthAuth, ApiKeyAuth);
export type StandardProviderAuth = Infer<typeof StandardProviderAuth>;
export const CloudflareProviderAuth = union(McpOAuthAuth, ApiKeyAuth);
export type CloudflareProviderAuth = Infer<typeof CloudflareProviderAuth>;
export const ProviderAuth = union(OAuthAuth, McpOAuthAuth, ApiKeyAuth);
export type ProviderAuth = Infer<typeof ProviderAuth>;
export const McpTokenHealthStatus = mcpTokenHealthStatusValidator;
export type McpTokenHealthStatus = Infer<typeof McpTokenHealthStatus>;
export const McpTokenHealthSource = mcpTokenHealthSourceValidator;
export type McpTokenHealthSource = Infer<typeof McpTokenHealthSource>;
export const McpTokenHealth = mcpTokenHealthValidator;
export type McpTokenHealth = Infer<typeof McpTokenHealth>;

export const GithubProviderConnection = object({
  kind: literal("github"),
  userId: id("users"),
  auth: StandardProviderAuth,
  username: optional(string()),
  createdAt: number(),
  updatedAt: number(),
});
export const ConvexProviderConnection = object({
  kind: literal("convex"),
  userId: id("users"),
  auth: StandardProviderAuth,
  teamId: string(),
  teamSlug: optional(string()),
  createdAt: number(),
  updatedAt: number(),
});
export const CloudflareProviderConnection = object({
  kind: literal("cloudflare"),
  userId: id("users"),
  auth: CloudflareProviderAuth,
  accountId: optional(string()),
  tokenHealth: optional(McpTokenHealth),
  tokenRefreshStartedAt: optional(number()),
  lastTokenRefreshAt: optional(number()),
  createdAt: number(),
  updatedAt: number(),
});
export const ProviderConnection = union(
  GithubProviderConnection,
  ConvexProviderConnection,
  CloudflareProviderConnection,
);
export type ProviderConnection = Infer<typeof ProviderConnection>;

// The schema is normally optional, but Convex Auth
// requires indexes defined on `authTables`.
// The schema provides more precise TypeScript types.
export default defineSchema({
  ...authTablesWithoutUsers,

  /**
   * Users.
   */
  users: defineTable({
    name: optional(string()),
    image: optional(string()),
    email: optional(string()),
    emailVerificationTime: optional(number()),
    phone: optional(string()),
    phoneVerificationTime: optional(number()),
    isAnonymous: optional(boolean()),
    isApproved: optional(boolean()),

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

  providerConnections: defineTable(ProviderConnection)
    .index("by_user", ["userId"])
    .index("by_user_kind", ["userId", "kind"])
    .index("by_kind_method", ["kind", "auth.method"]),

  connectedMachines: defineTable(connectedMachineRowValidator)
    .index("by_user", ["userId"])
    .index("by_machine_id", ["machineId"])
    .index("by_user_machine_id", ["userId", "machineId"]),

  machineRegistrationRequests: defineTable(
    machineRegistrationRequestRowValidator,
  )
    .index("by_request_id", ["requestId"])
    .index("by_machine_id", ["machineId"]),

  machineRegistrationBootstrapRateLimits: defineTable(
    machineRegistrationBootstrapRateLimitRowValidator,
  ).index("by_fingerprint", ["fingerprint"]),

  machineCredentials: defineTable(machineCredentialRowValidator)
    .index("by_machine_id", ["machineId"])
    .index("by_user_machine_id", ["userId", "machineId"])
    .index("by_credential_hash", ["credentialHash"]),

  machineControlTokens: defineTable(machineControlTokenRowValidator)
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

  workspaceSidebarState: defineTable(workspaceSidebarStateRowValidator).index(
    "by_user_and_workspace_key",
    ["userId", "workspaceKey"],
  ),

  vaultBranchFilters: defineTable({
    userId: id("users"),
    vaultId: id("vaults"),
    hiddenLabels: array(string()),
    includeDrafts: boolean(),
    // Keep this optional so rows saved before unlabeled-branch support remain
    // readable until each user re-saves their filters.
    includeNoLabel: optional(boolean()),
    // Keep this optional so rows saved before branch-list expansion support
    // remain readable until each user re-saves their filters.
    branchesExpanded: optional(boolean()),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_vault", ["userId", "vaultId"]),

  /**
   * Vault is the durable app container. Repo-backed behavior must require the
   * connected GitHub variant before reading repository identity fields.
   */
  vaults: defineTable(VaultRow)
    .index("by_userId", ["userId"])
    .index("by_userId_and_ghRepoId", ["userId", "ghRepoId"])
    .index("by_owner_and_name", ["owner", "name"]),

  /**
   * Remote Git branches mirrored from GitHub for a vault repository.
   */
  vaultRemoteBranches: defineTable({
    vaultId: id("vaults"),
    name: string(),
    headCommitSha: string(),
    lastCommitAt: optional(number()),
    aheadBy: optional(number()),
    behindBy: optional(number()),
    pullRequestUrl: optional(string()),
    pullRequestNumber: optional(number()),
    pullRequestLabels: optional(array(PullRequestLabel)),
    pullRequestTitle: optional(string()),
    pullRequestIsDraft: optional(boolean()),
    cloudflareBranchPreviewUrl: optional(string()),
    cloudflarePreviewPullRequestNumber: optional(number()),
    cloudflarePreviewUrl: optional(string()),
    cloudflarePreviewCommitSha: optional(string()),
    cloudflarePreviewStatus: optional(string()),
    cloudflarePreviewLogsUrl: optional(string()),
    cloudflarePreviewCommentCreatedAt: optional(number()),
    isDefault: boolean(),
    isProtected: boolean(),
    remoteState: VaultRemoteBranchState,
    deletedUpstreamAt: optional(number()),
    lastSyncedAt: number(),
  })
    .index("by_vault", ["vaultId"])
    .index("by_vault_and_name", ["vaultId", "name"])
    .index("by_vault_and_remote_state", ["vaultId", "remoteState"]),

  /**
   * Branch-scoped Git trees for each vault.
   */
  vaultBranchTrees: defineTable({
    vaultId: id("vaults"),
    branch: string(),
    treeSHA: string(),
    commitSHA: optional(string()),
    treeData: GithubTreeData,
    lastTreeRefreshAt: number(),
    treeRefreshStartedAt: optional(number()),
  }).index("by_vault_and_branch", ["vaultId", "branch"]),

  /**
   * External infrastructure identifiers and status for a vault.
   */
  vaultInfrastructure: defineTable({
    vaultId: id("vaults"),

    status: InfraState,
    lastError: optional(string()),
    provisioningVersion: number(),
    lastProvisionedAt: optional(number()),

    // Convex
    convexProjectId: optional(string()),
    convexProjectSlug: optional(string()),
    convexDeploymentName: optional(string()),
    convexDeploymentType: optional(union(literal("prod"), literal("dev"))),
    convexCloudUrl: optional(string()),
    convexSiteUrl: optional(string()),
    convexDeployKeyId: optional(string()),

    // Provider-aware hosting state (phase 2+)
    hosting: optional(hostingStateValidator),
  })
    .index("by_vault", ["vaultId"])
    .index("by_status", ["status"]),

  /**
   * Latest Workflow run allowed to write provider state for a vault.
   * Keeping the last owner after completion makes older in-flight workflows
   * fail closed instead of regaining ownership after a newer run finishes.
   */
  vaultInfrastructureOwnership: defineTable({
    vaultId: id("vaults"),
    runId: id("appProvisioningRuns"),
    provisioningVersion: number(),
    state: union(literal("active"), literal("succeeded"), literal("failed")),
    updatedAt: number(),
  })
    .index("by_vault", ["vaultId"])
    .index("by_run", ["runId"]),

  /**
   * App-owned Workflow run identity for Noter-managed provisioning.
   */
  appProvisioningRuns: defineTable({
    userId: id("users"),
    // Deprecated: older create-app runs could exist before a vault row. New
    // supported runs are vault-owned; keep nullable until old rows are retired.
    vaultId: union(id("vaults"), v.null()),
    // Deprecated null state from pre-owner-selection create flows.
    repositoryFullName: union(string(), v.null()),
    // Assigned after the Workflow component start call returns; run identity
    // exists first so early events can still be linked deterministically.
    workflowId: optional(string()),
    trigger: AppProvisioningRunTrigger,
    state: AppProvisioningRunState,
    currentStep: AppProvisioningRunStep,
    lastError: optional(string()),
    createdAt: number(),
    updatedAt: number(),
    completedAt: optional(number()),
  })
    .index("by_vault_and_updated_at", ["vaultId", "updatedAt"])
    .index("by_user_and_updated_at", ["userId", "updatedAt"])
    .index("by_workflow_id", ["workflowId"]),

  /**
   * User-visible provisioning events for Noter-managed app creation.
   */
  appProvisioningEvents: defineTable({
    userId: id("users"),
    // Deprecated nullable fields are retained only for stored legacy events.
    // New events are appended through run-backed helpers with vault ids.
    vaultId: union(id("vaults"), v.null()),
    repositoryFullName: union(string(), v.null()),
    // TODO(Vault-First Phase 4 narrow): after old events are retired, make this
    // required in schema too.
    runId: optional(id("appProvisioningRuns")),
    step: AppProvisioningStep,
    level: AppProvisioningEventLevel,
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
    kind: VaultDomainKind,
    url: string(),
    source: VaultDomainSource,
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
    .index("by_vault_and_branch_and_initial_path", [
      "vaultId",
      "branch",
      "initialFilePath",
    ])
    .index("by_vault", ["vaultId"])
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
  }).index("by_sha", ["sha"]),

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
   * Waitlist for invite-only access.
   */
  waitlist: defineTable({
    email: string(),
    createdAt: number(),
  }).index("by_email", ["email"]),

  /**
   * Approval-first requests for AI reads against production infrastructure/data.
   */
  aiProdAccessRequests: defineTable({
    threadId: string(),
    requesterUserId: id("users"),
    vaultId: optional(id("vaults")),

    scope: ProdAccessScope,
    provider: ProdAccessProvider,
    resourceKind: ProdAccessResourceKind,
    toolName: string(),
    paramsJson: string(),

    status: ProdAccessStatus,
    redactionLevel: ProdAccessRedactionLevel,

    approvedBy: optional(id("users")),
    approvedAt: optional(number()),
    executedAt: optional(number()),
    expiresAt: optional(number()),
    error: optional(string()),
  })
    .index("by_threadId", ["threadId"])
    .index("by_requester", ["requesterUserId"])
    .index("by_status", ["status"])
    .index("by_vault", ["vaultId"]),

  /**
   * Immutable audit events for prod-access request lifecycle.
   */
  aiProdAccessAudit: defineTable({
    requestId: id("aiProdAccessRequests"),
    actorUserId: id("users"),
    action: ProdAccessAuditAction,
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
   * MCP OAuth clients registered against noter.md.
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
    createdBy: McpOauthClientCreatedBy,
    registrationStatus: McpOauthClientRegistrationStatus,
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
    status: McpAuthRequestStatus,
    createdAt: number(),
    expiresAt: number(),
  })
    .index("by_request_id", ["requestId"])
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
    status: McpGrantStatus,
    createdAt: number(),
    updatedAt: number(),
    lastUsedAt: optional(number()),
    metadataJson: optional(string()),
  })
    .index("by_grant_id", ["grantId"])
    .index("by_user_id", ["userId"])
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
    status: McpRefreshTokenStatus,
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
    .index("by_vaultId_and_branch_and_timestamp", [
      "vaultId",
      "branch",
      "timestamp",
    ])
    .index("by_vaultId_and_branch_and_filePath", [
      "vaultId",
      "branch",
      "filePath",
    ])
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
