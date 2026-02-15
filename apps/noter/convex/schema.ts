import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

// Helper function to omit keys from an object
function omit<T extends Record<string, any>, K extends keyof T>(
  obj: T,
  keys: K[],
): Omit<T, K> {
  return Object.fromEntries(
    Object.entries(obj).filter(([key]) => !keys.includes(key as K)),
  ) as Omit<T, K>;
}

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

export const VaultDomainKind = v.union(
  v.literal("main"),
  v.literal("branch_preview"),
);

export const VaultDomainSource = v.union(
  v.literal("netlify_default"),
  v.literal("netlify_custom"),
);

export const ProdAccessScope = v.union(v.literal("vault"), v.literal("global"));

export const ProdAccessProvider = v.union(
  v.literal("convex"),
  v.literal("netlify"),
);

export const ProdAccessResourceKind = v.union(
  v.literal("deployment_status"),
  v.literal("logs"),
  v.literal("data_query"),
  v.literal("project_inventory"),
  v.literal("site_inventory"),
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

// The schema is normally optional, but Convex Auth
// requires indexes defined on `authTables`.
// The schema provides more precise TypeScript types.
export default defineSchema({
  ...omit(authTables, ["users"]),

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

    // Added these things. Maybe find a better way?
    // GitHub
    githubUsername: v.string(),
    isApproved: v.optional(v.boolean()),
    githubAccessToken: v.optional(v.string()),
    githubRefreshToken: v.optional(v.string()),
    githubExpiresAt: v.optional(v.number()),
  })
    .index("email", ["email"])
    .index("phone", ["phone"]),

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

    // Tree refresh mutex: prevents concurrent/redundant GitHub API calls
    lastTreeRefreshAt: v.optional(v.number()),
    treeRefreshStartedAt: v.optional(v.number()),

    // Codespace integration
    activeCodespaceId: v.optional(v.id("codespaces")),
    devcontainerConfig: v.optional(v.string()), // JSON string of .devcontainer/devcontainer.json

    // Daytona sandbox integration
    daytonaSandboxId: v.optional(v.string()),
    daytonaSandboxName: v.optional(v.string()),
    daytonaSandboxCreatedAt: v.optional(v.number()),

    // Infrastructure provisioning lifecycle
    infraState: v.optional(InfraState),
    infraLastError: v.optional(v.string()),
    infraLastProvisionedAt: v.optional(v.number()),
    infraProvisioningStartedAt: v.optional(v.number()),
  }),

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

    // Netlify
    netlifySiteId: v.optional(v.string()),
    netlifySiteName: v.optional(v.string()),
    netlifyTeamId: v.optional(v.string()),
    netlifyDefaultUrl: v.optional(v.string()),
    netlifyProductionUrl: v.optional(v.string()),
    netlifyBuildHookId: v.optional(v.string()),
  })
    .index("by_vault", ["vaultId"])
    .index("by_status", ["status"]),

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

    filePath: v.string(),
    initialFilePath: v.string(),

    content: v.string(),
    // TODO: Maybe remove and rely on blobs table instead?
    initialContent: v.string(),

    parentCommitSha: v.union(v.string(), v.null()), // SHA of the GitHub commit this edit is based on

    lastEditTime: v.number(),
    lastEditUserId: v.id("users"),
    branch: v.string(),

    // Collaborative editing fields
    version: v.number(), // Current version for collaborative editing (defaults to 0)
  })
    .index("by_vault_and_path", ["vaultId", "filePath"])
    .index("by_vault_and_initial_path", ["vaultId", "initialFilePath"])
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
   * Collaborative editing updates for operational transformation.
   * Stores individual changes made to files for proper conflict resolution.
   */
  /**
   * Chat conversations per user.
   */
  chatConversations: defineTable({
    userId: v.id("users"),
    title: v.optional(v.string()),
    vaultId: v.optional(v.id("vaults")),
    systemPrompt: v.optional(v.string()),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_and_vaultId", ["userId", "vaultId"]),

  /**
   * Chat messages within a conversation.
   */
  chatMessages: defineTable({
    conversationId: v.id("chatConversations"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    model: v.optional(v.string()),
    metadata: v.optional(v.string()),
  }).index("by_conversationId", ["conversationId"]),

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
    conversationId: v.id("chatConversations"),
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
    .index("by_conversation", ["conversationId"])
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

  collaborativeUpdates: defineTable({
    vaultId: v.id("vaults"),
    filePath: v.string(),
    version: v.number(), // Version number when this update was applied
    clientId: v.string(), // Client identifier
    changes: v.string(), // Serialized ChangeSet from CodeMirror
    userId: v.id("users"), // User who made the change
    timestamp: v.number(),
  })
    .index("by_vault", ["vaultId"])
    .index("by_file", ["vaultId", "filePath"])
    .index("by_file_and_version", ["vaultId", "filePath", "version"]),
});
