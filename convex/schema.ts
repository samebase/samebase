import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
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
    githubAccessToken: v.optional(v.string()),
    githubRefreshToken: v.optional(v.string()),
    githubExpiresAt: v.optional(v.number()),
  })
    .index("email", ["email"])
    .index("phone", ["phone"]),

  messages: defineTable({
    userId: v.id("users"),
    body: v.string(),
  }),

  /**
   * Vault contains a connected github repository.
   */
  vaults: defineTable({
    userId: v.id("users"),
    ghRepoId: v.string(),
    ghRepoOwner: v.string(),
    ghRepoName: v.string(),
  }),

  /**
   * File staging for real-time collaborative editing.
   * Stores unsaved changes before they're committed to GitHub.
   */
  fileStaging: defineTable({
    repositoryId: v.string(), // "owner/repo"
    filePath: v.string(),
    content: v.string(),
    parentCommitSha: v.string(), // SHA of the GitHub commit this edit is based on
    lastEditTime: v.number(),
    lastEditUserId: v.id("users"),
    branch: v.string(),
  })
    .index("by_repository_and_path", ["repositoryId", "filePath"])
    .index("by_repository", ["repositoryId"])
    .index("by_user", ["lastEditUserId"]),
});
