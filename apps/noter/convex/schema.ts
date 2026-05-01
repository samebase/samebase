import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";
import {
  hostingProviderValidator,
  hostingStateValidator,
} from "./hostingState";
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

export const GithubTree = v.object({
  path: v.string(),
  mode: v.string(),
  type: v.string(),
  sha: v.string(),
  size: v.optional(v.number()),
  url: v.optional(v.string()),
});
export type GithubTreeType = Infer<typeof GithubTree>;

export const GithubTreeData = v.object({
  sha: v.string(),
  url: v.optional(v.string()),
  truncated: v.boolean(),
  tree: v.array(GithubTree),
});

export const CodespaceState = v.union(
  v.literal("creating"),
  v.literal("starting"),
  v.literal("running"),
  v.literal("stopping"),
  v.literal("stopped"),
  v.literal("deleting"),
  v.literal("deleted"),
  v.literal("failed"),
);

export const InfraState = v.union(
  v.literal("not_started"),
  v.literal("provisioning"),
  v.literal("ready"),
  v.literal("failed"),
  v.literal("partial"),
);

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
  literal("claim_infra"),
  literal("ensure_convex"),
  literal("ensure_convex_preview"),
  literal("ensure_cloudflare"),
  literal("record_domains"),
  literal("finish"),
);
export type AppProvisioningStep = Infer<typeof AppProvisioningStep>;

export const DaytonaSnapshotBuildStatus = union(
  literal("queued"),
  literal("building"),
  literal("active"),
  literal("failed"),
  literal("removing"),
);
export type DaytonaSnapshotBuildStatus = Infer<
  typeof DaytonaSnapshotBuildStatus
>;

export const VaultDomainKind = v.union(
  v.literal("main"),
  v.literal("branch_preview"),
);

export const VaultDomainSource = v.union(
  v.literal("cloudflare_pages_default"),
  v.literal("cloudflare_pages_custom"),
);

export const VaultRemoteBranchState = v.union(
  v.literal("active"),
  v.literal("deleted_upstream"),
);

export const TreeRefreshFailureKind = union(
  literal("failed"),
  literal("rate_limited"),
);
export type TreeRefreshFailureKind = Infer<typeof TreeRefreshFailureKind>;

export const ProdAccessScope = v.union(v.literal("vault"), v.literal("global"));

export const ProdAccessProvider = v.union(
  v.literal("convex"),
  v.literal("cloudflare"),
);

export const ProdAccessResourceKind = v.union(
  v.literal("deployment_status"),
  v.literal("logs"),
  v.literal("data_query"),
  v.literal("project_inventory"),
  v.literal("account_inventory"),
  v.literal("pages_project_inventory"),
);

export const ProdAccessStatus = v.union(
  v.literal("proposed"),
  v.literal("approved"),
  v.literal("rejected"),
  v.literal("executed"),
  v.literal("failed"),
  v.literal("expired"),
);

export const ProdAccessRedactionLevel = v.union(
  v.literal("default"),
  v.literal("strict"),
  v.literal("raw_fallback"),
);

export const ProdAccessAuditAction = v.union(
  v.literal("proposed"),
  v.literal("approved"),
  v.literal("rejected"),
  v.literal("executed"),
  v.literal("failed"),
  v.literal("expired"),
);

export const ProviderKind = v.union(
  v.literal("github"),
  v.literal("convex"),
  v.literal("cloudflare"),
  v.literal("codex"),
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

export const OAuthAuth = v.object({
  method: v.literal("oauth"),
  credential: v.string(),
  refreshCredential: v.optional(v.string()),
  credentialExpiresAt: v.optional(v.number()),
});
export const McpOAuthAuth = v.object({
  method: v.literal("mcp_oauth"),
  credential: v.string(),
  refreshCredential: v.optional(v.string()),
  credentialExpiresAt: v.optional(v.number()),
  clientId: optional(string()),
  mcpServerUrl: v.string(),
});
export const ApiKeyAuth = v.object({
  method: v.literal("api_key"),
  credential: v.string(),
  credentialExpiresAt: v.optional(v.number()),
});
export const CodexDeviceAuth = object({
  method: literal("device_auth"),
  storage: literal("daytona_volume"),
  volumeId: string(),
  volumeName: string(),
  codexHome: string(),
  authSandboxId: optional(string()),
  authSandboxName: optional(string()),
  lastCheckAt: optional(number()),
  lastCheckStatus: optional(
    union(literal("ready"), literal("needs_reauth"), literal("error")),
  ),
  lastError: optional(string()),
});
export const StandardProviderAuth = v.union(OAuthAuth, ApiKeyAuth);
export type StandardProviderAuth = Infer<typeof StandardProviderAuth>;
export const CloudflareProviderAuth = v.union(McpOAuthAuth, ApiKeyAuth);
export type CloudflareProviderAuth = Infer<typeof CloudflareProviderAuth>;
export const ProviderAuth = v.union(
  OAuthAuth,
  McpOAuthAuth,
  ApiKeyAuth,
  CodexDeviceAuth,
);
export type ProviderAuth = Infer<typeof ProviderAuth>;
export const McpTokenHealthStatus = mcpTokenHealthStatusValidator;
export type McpTokenHealthStatus = Infer<typeof McpTokenHealthStatus>;
export const McpTokenHealthSource = mcpTokenHealthSourceValidator;
export type McpTokenHealthSource = Infer<typeof McpTokenHealthSource>;
export const McpTokenHealth = mcpTokenHealthValidator;
export type McpTokenHealth = Infer<typeof McpTokenHealth>;

export const GithubProviderConnection = v.object({
  kind: v.literal("github"),
  userId: v.id("users"),
  auth: StandardProviderAuth,
  username: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
});
export const ConvexProviderConnection = v.object({
  kind: v.literal("convex"),
  userId: v.id("users"),
  auth: StandardProviderAuth,
  teamId: v.string(),
  teamSlug: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
});
export const CloudflareProviderConnection = v.object({
  kind: v.literal("cloudflare"),
  userId: v.id("users"),
  auth: CloudflareProviderAuth,
  accountId: v.optional(v.string()),
  tokenHealth: optional(McpTokenHealth),
  tokenRefreshStartedAt: v.optional(v.number()),
  lastTokenRefreshAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
});
export const CodexProviderConnection = object({
  kind: literal("codex"),
  userId: id("users"),
  auth: CodexDeviceAuth,
  createdAt: number(),
  updatedAt: number(),
});
export const ProviderConnection = v.union(
  GithubProviderConnection,
  ConvexProviderConnection,
  CloudflareProviderConnection,
  CodexProviderConnection,
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
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    isApproved: v.optional(v.boolean()),

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
    userId: v.id("users"),
    accountPanelOpen: v.optional(v.boolean()),
    providersPanelOpen: v.boolean(),
    // TODO: remove this
    pricingBillingCycle: PricingBillingCycle,
    editorChatOpen: v.optional(v.boolean()),
    globalChatOpen: v.optional(v.boolean()),
  }).index("by_user", ["userId"]),

  workspaceSidebarState: defineTable(workspaceSidebarStateRowValidator).index(
    "by_user_and_workspace_key",
    ["userId", "workspaceKey"],
  ),

  vaultBranchFilters: defineTable({
    userId: v.id("users"),
    vaultId: v.id("vaults"),
    hiddenLabels: v.array(v.string()),
    includeDrafts: v.boolean(),
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
   * Vault contains a connected github repository.
   */
  vaults: defineTable({
    userId: v.id("users"),
    ghRepoId: v.string(),
    ghRepoOwner: v.string(),
    ghRepoName: v.string(),
    treeSHA: v.string(),
    commitSHA: v.optional(v.string()),
    treeData: GithubTreeData,

    state: v.union(v.literal("copying_files"), v.literal("ready")),
    isNoterManaged: v.optional(v.boolean()),
    hostingProvider: v.optional(hostingProviderValidator),

    // Tree refresh mutex: prevents concurrent/redundant GitHub API calls
    lastTreeRefreshAt: v.optional(v.number()),
    treeRefreshStartedAt: v.optional(v.number()),
    lastTreeRefreshFailedAt: v.optional(v.number()),
    treeRefreshFailureKind: v.optional(TreeRefreshFailureKind),
    treeRefreshFailureMessage: v.optional(v.string()),
    treeRefreshCooldownUntil: v.optional(v.number()),

    // Codespace integration
    activeCodespaceId: v.optional(v.id("codespaces")),
    devcontainerConfig: v.optional(v.string()), // JSON string of .devcontainer/devcontainer.json

    // Daytona sandbox integration
    daytonaSandboxId: v.optional(v.string()),
    daytonaSandboxName: v.optional(v.string()),
    daytonaSandboxCreatedAt: v.optional(v.number()),
    daytonaSandboxProvisioningMode: optional(
      union(literal("snapshot_backed"), literal("live_debug")),
    ),
    daytonaSnapshotName: v.optional(v.string()),
    daytonaPrebuildLogs: v.optional(v.string()),
    daytonaPrebuildLogsUpdatedAt: v.optional(v.number()),
    daytonaPrebuildLogsBranch: v.optional(v.string()),
    daytonaPrebuildLogsSnapshot: v.optional(v.string()),

    // Infrastructure provisioning lifecycle
    infraState: v.optional(InfraState),
    infraLastError: v.optional(v.string()),
    infraLastProvisionedAt: v.optional(v.number()),
    infraProvisioningStartedAt: v.optional(v.number()),
  })
    .index("by_userId", ["userId"])
    .index("by_ghRepoOwner_and_ghRepoName", ["ghRepoOwner", "ghRepoName"]),

  /**
   * Remote Git branches mirrored from GitHub for a vault repository.
   */
  vaultRemoteBranches: defineTable({
    vaultId: v.id("vaults"),
    name: v.string(),
    headCommitSha: v.string(),
    lastCommitAt: v.optional(v.number()),
    aheadBy: v.optional(v.number()),
    behindBy: v.optional(v.number()),
    pullRequestUrl: v.optional(v.string()),
    pullRequestNumber: v.optional(v.number()),
    pullRequestLabels: optional(array(PullRequestLabel)),
    pullRequestTitle: v.optional(v.string()),
    pullRequestIsDraft: v.optional(v.boolean()),
    cloudflareBranchPreviewUrl: v.optional(v.string()),
    cloudflarePreviewPullRequestNumber: v.optional(v.number()),
    cloudflarePreviewUrl: v.optional(v.string()),
    cloudflarePreviewCommitSha: v.optional(v.string()),
    cloudflarePreviewStatus: v.optional(v.string()),
    cloudflarePreviewLogsUrl: v.optional(v.string()),
    cloudflarePreviewCommentCreatedAt: v.optional(v.number()),
    isDefault: v.boolean(),
    isProtected: v.boolean(),
    remoteState: VaultRemoteBranchState,
    deletedUpstreamAt: v.optional(v.number()),
    lastSyncedAt: v.number(),
  })
    .index("by_vault", ["vaultId"])
    .index("by_vault_and_name", ["vaultId", "name"])
    .index("by_vault_and_remote_state", ["vaultId", "remoteState"]),

  /**
   * Branch-scoped Git trees for each vault.
   */
  vaultBranchTrees: defineTable({
    vaultId: v.id("vaults"),
    branch: v.string(),
    treeSHA: v.string(),
    commitSHA: v.optional(v.string()),
    treeData: GithubTreeData,
    lastTreeRefreshAt: v.number(),
    treeRefreshStartedAt: v.optional(v.number()),
  }).index("by_vault_and_branch", ["vaultId", "branch"]),

  /**
   * External infrastructure identifiers and status for a vault.
   */
  vaultInfrastructure: defineTable({
    vaultId: v.id("vaults"),

    status: InfraState,
    lastError: v.optional(v.string()),
    provisioningVersion: v.number(),
    lastProvisionedAt: v.optional(v.number()),

    // Convex
    convexProjectId: v.optional(v.string()),
    convexProjectSlug: v.optional(v.string()),
    convexDeploymentName: v.optional(v.string()),
    convexDeploymentType: v.optional(
      v.union(v.literal("prod"), v.literal("dev")),
    ),
    convexCloudUrl: v.optional(v.string()),
    convexSiteUrl: v.optional(v.string()),
    convexDeployKeyId: v.optional(v.string()),

    // Provider-aware hosting state (phase 2+)
    hosting: v.optional(hostingStateValidator),
  })
    .index("by_vault", ["vaultId"])
    .index("by_status", ["status"]),

  /**
   * User-visible provisioning events for Noter-managed app creation.
   */
  appProvisioningEvents: defineTable({
    userId: v.id("users"),
    vaultId: v.id("vaults"),
    repositoryFullName: v.string(),
    step: AppProvisioningStep,
    level: AppProvisioningEventLevel,
    message: v.string(),
    createdAt: v.number(),
  }).index("by_vault_and_created_at", ["vaultId", "createdAt"]),

  daytonaSnapshots: defineTable({
    ghRepoOwner: string(),
    ghRepoName: string(),
    branch: string(),
    commitSha: string(),
    snapshotName: optional(string()),
    snapshotId: optional(string()),
    status: DaytonaSnapshotBuildStatus,
    attemptCount: number(),
    lastError: optional(string()),
    logs: optional(string()),
    logsUpdatedAt: optional(number()),
    nextRetryAt: optional(number()),
    createdAt: number(),
    updatedAt: number(),
  })
    .index("by_ghRepoOwner_and_ghRepoName_and_branch", [
      "ghRepoOwner",
      "ghRepoName",
      "branch",
    ])
    .index("by_ghRepoOwner_and_ghRepoName_and_branch_and_commitSha", [
      "ghRepoOwner",
      "ghRepoName",
      "branch",
      "commitSha",
    ])
    .index("by_snapshot_name", ["snapshotName"]),

  /**
   * Branch to domain mapping.
   */
  vaultDomains: defineTable({
    vaultId: v.id("vaults"),
    branch: v.string(),
    kind: VaultDomainKind,
    url: v.string(),
    source: VaultDomainSource,
    active: v.boolean(),
    lastSyncedAt: v.number(),
  })
    .index("by_vault", ["vaultId"])
    .index("by_vault_and_branch", ["vaultId", "branch"]),

  /**
   * GitHub Codespaces for AI execution environment.
   * Each vault can have multiple codespaces over time, but only one active.
   */
  codespaces: defineTable({
    vaultId: v.id("vaults"),
    userId: v.id("users"),

    // GitHub Codespace identifiers
    ghCodespaceId: v.string(),
    ghCodespaceName: v.string(),

    // State management
    state: CodespaceState,

    // Connection details (when running)
    webUrl: v.optional(v.string()),

    // HTTP Agent details
    agentUrl: v.optional(v.string()), // https://<codespace>-3000.app.github.dev
    agentToken: v.optional(v.string()), // Random token for authentication
    agentHealthy: v.optional(v.boolean()), // Last health check status
    portsVisibilityEnsured: v.optional(v.boolean()),
    portsVisibilityEnsuredAt: v.optional(v.number()),
    portsVisibilityLastError: v.optional(v.string()),

    // Lifecycle tracking
    createdAt: v.number(),
    lastStartedAt: v.optional(v.number()),
    lastStoppedAt: v.optional(v.number()),
    deletedAt: v.optional(v.number()),
    lastHealthCheckAt: v.optional(v.number()),

    // Commit tracking for reproducibility
    commitSha: v.string(),
    branch: v.string(),
  })
    .index("by_vault", ["vaultId"])
    .index("by_user", ["userId"])
    .index("by_gh_id", ["ghCodespaceId"])
    .index("by_state", ["state"]),

  /**
   * File staging for real-time collaborative editing.
   * Stores unsaved changes before they're committed to GitHub.
   */
  fileStaging: defineTable({
    ownerId: v.id("users"),
    vaultId: v.id("vaults"),

    fileDeleted: v.boolean(),
    kind: optional(union(literal("text"), literal("binary"))),

    filePath: v.string(),
    initialFilePath: v.string(),

    content: v.string(),
    // TODO: Maybe remove and rely on blobs table instead?
    initialContent: v.string(),
    storageId: optional(v.id("_storage")),
    mime: optional(v.string()),
    size: optional(v.number()),
    stagedBlobSha: optional(v.string()),

    parentCommitSha: v.union(v.string(), v.null()), // SHA of the GitHub commit this edit is based on

    lastEditTime: v.number(),
    lastEditUserId: v.id("users"),
    branch: v.string(),

    // Collaborative editing fields
    version: v.number(), // Current version for collaborative editing (defaults to 0)
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
    vaultId: v.id("vaults"),
    sha: v.string(), // unique index
    size: v.number(),
    // Inline small text for fast reads
    text: v.optional(v.string()),
    // Everything else goes to storage
    storageId: v.optional(v.id("_storage")),
    mime: v.optional(v.string()),
    ext: v.optional(v.string()),
  }).index("by_sha", ["sha"]),

  /**
   * Folder expansion state for file tree sidebar.
   * Stores which folders are expanded/collapsed per user per vault.
   */
  folderExpansionState: defineTable({
    userId: v.id("users"),
    vaultId: v.id("vaults"),
    folderPath: v.string(), // path to the folder
    isExpanded: v.boolean(),
  })
    .index("by_user_and_vault", ["userId", "vaultId"])
    .index("by_user_vault_and_path", ["userId", "vaultId", "folderPath"]),

  /**
   * Agent graph node layout for Graph View.
   * Stores per-user, per-vault node dimensions.
   */
  agentGraphNodeLayout: defineTable({
    userId: v.id("users"),
    vaultId: v.id("vaults"),
    nodeId: v.string(),
    width: v.number(),
    height: v.number(),
    updatedAt: v.number(),
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
    threadId: v.string(),
    userId: v.id("users"),
    vaultId: v.optional(v.id("vaults")),
    repositoryFullName: v.optional(v.string()),
    branch: v.optional(v.string()),
    filePath: v.optional(v.string()),
    systemPrompt: v.optional(v.string()),
    draftMessage: v.optional(v.string()),
    draftUpdatedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_threadId", ["threadId"])
    .index("by_userId", ["userId"])
    .index("by_userId_and_vaultId", ["userId", "vaultId"]),

  /**
   * Chat message metadata for AI Fab (commit proposals, prod-read proposals, tool activity).
   */
  chatMessageMetadata: defineTable({
    messageId: v.string(),
    threadId: v.string(),
    type: v.union(
      v.literal("tool_activity"),
      v.literal("commit_proposal"),
      v.literal("prod_read_proposal"),
      v.literal("prod_read_result"),
    ),
    payloadJson: v.string(),
    createdAt: v.number(),
  })
    .index("by_messageId", ["messageId"])
    .index("by_threadId", ["threadId"]),

  /**
   * Waitlist for invite-only access.
   */
  waitlist: defineTable({
    email: v.string(),
    createdAt: v.number(),
  }).index("by_email", ["email"]),

  /**
   * Approval-first requests for AI reads against production infrastructure/data.
   */
  aiProdAccessRequests: defineTable({
    threadId: v.string(),
    requesterUserId: v.id("users"),
    vaultId: v.optional(v.id("vaults")),

    scope: ProdAccessScope,
    provider: ProdAccessProvider,
    resourceKind: ProdAccessResourceKind,
    toolName: v.string(),
    paramsJson: v.string(),

    status: ProdAccessStatus,
    redactionLevel: ProdAccessRedactionLevel,

    approvedBy: v.optional(v.id("users")),
    approvedAt: v.optional(v.number()),
    executedAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    error: v.optional(v.string()),
  })
    .index("by_threadId", ["threadId"])
    .index("by_requester", ["requesterUserId"])
    .index("by_status", ["status"])
    .index("by_vault", ["vaultId"]),

  /**
   * Immutable audit events for prod-access request lifecycle.
   */
  aiProdAccessAudit: defineTable({
    requestId: v.id("aiProdAccessRequests"),
    actorUserId: v.id("users"),
    action: ProdAccessAuditAction,
    toolName: v.string(),
    endpoint: v.string(),
    argumentHash: v.string(),
    rowCount: v.optional(v.number()),
    logLineCount: v.optional(v.number()),
    createdAt: v.number(),
    error: v.optional(v.string()),
  })
    .index("by_request", ["requestId"])
    .index("by_actor", ["actorUserId"])
    .index("by_action", ["action"]),

  /**
   * OAuth state records for provider integrations.
   */
  oauthStates: defineTable({
    provider: v.union(
      v.literal("github"),
      v.literal("convex"),
      v.literal("cloudflare_mcp"),
    ),
    userId: v.id("users"),
    state: v.string(),
    returnToPath: v.optional(v.string()),
    codeVerifier: v.optional(v.string()),
    clientId: v.optional(v.string()),
    clientSecret: v.optional(v.string()),
    createdAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_state", ["state"])
    .index("by_user", ["userId"]),

  /**
   * MCP OAuth clients registered against noter.md.
   */
  mcpOauthClients: defineTable({
    clientId: string(),
    clientName: optional(string()),
    redirectUris: v.array(string()),
    grantTypes: v.array(string()),
    responseTypes: v.array(string()),
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
    userId: optional(v.id("users")),
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
    userId: v.id("users"),
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
    userId: v.id("users"),
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
    userId: v.id("users"),
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
    userId: v.id("users"),
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
    userId: optional(v.id("users")),
    action: string(),
    createdAt: number(),
    detailsJson: optional(string()),
  })
    .index("by_grant_id", ["grantId"])
    .index("by_client_id", ["clientId"])
    .index("by_user_id", ["userId"])
    .index("by_action", ["action"]),

  collaborativeUpdates: defineTable({
    vaultId: v.id("vaults"),
    branch: v.optional(v.string()),
    filePath: v.string(),
    version: v.number(), // Version number when this update was applied
    clientId: v.string(), // Client identifier
    changes: v.string(), // Serialized ChangeSet from CodeMirror
    userId: v.id("users"), // User who made the change
    timestamp: v.number(),
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
