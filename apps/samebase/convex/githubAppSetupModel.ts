import { defineTable } from "convex/server";
import { v } from "convex/values";

const { id, literal, number, object, optional, string, union } = v;

export const vGitHubAppSetupPurpose = union(
  literal("installation"),
  literal("installation_reconnect"),
  literal("organization_connection"),
  literal("user_authorization"),
);

export const vGitHubAppSetupState = object({
  userId: id("users"),
  state: string(),
  purpose: optional(vGitHubAppSetupPurpose),
  organizationId: optional(id("organizations")),
  githubSignInProviderAccountId: optional(string()),
  returnToPath: optional(string()),
  createdAt: number(),
  expiresAt: number(),
});

export const githubAppSetupTables = {
  /** One-use state for GitHub App installation or user authorization. */
  githubAppSetupStates: defineTable(vGitHubAppSetupState)
    .index("by_state", ["state"])
    .index("by_user", ["userId"])
    .index("by_organization", ["organizationId"]),
};
