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
    treeData: GithubTreeData,

    state: v.union(v.literal("copying_files"), v.literal("ready")),

    // Tree refresh mutex: prevents concurrent/redundant GitHub API calls
    lastTreeRefreshAt: v.optional(v.number()),
    treeRefreshStartedAt: v.optional(v.number()),
  }),

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
  }).index("by_userId", ["userId"]),

  /**
   * Chat messages within a conversation.
   */
  chatMessages: defineTable({
    conversationId: v.id("chatConversations"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
  }).index("by_conversationId", ["conversationId"]),

  /**
   * Waitlist for invite-only access.
   */
  waitlist: defineTable({
    email: v.string(),
    createdAt: v.number(),
  }).index("by_email", ["email"]),

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
