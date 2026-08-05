import { defineTable } from "convex/server";
import { v } from "convex/values";

const { id, number, object, optional, string } = v;

export const vGitHubAppSetupState = object({
  userId: id("users"),
  state: string(),
  returnToPath: optional(string()),
  createdAt: number(),
  expiresAt: number(),
});

export const githubAppSetupTables = {
  /** One-use OAuth state created when a Samebase user starts GitHub App installation. */
  githubAppSetupStates: defineTable(vGitHubAppSetupState)
    .index("by_state", ["state"])
    .index("by_user", ["userId"]),
};
