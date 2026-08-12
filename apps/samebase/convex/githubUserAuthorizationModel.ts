import { defineTable } from "convex/server";
import { v } from "convex/values";

const { id, number, object, optional, string } = v;

export const vGitHubUserAuthorization = object({
  userId: id("users"),
  githubUserId: string(),
  githubUserLogin: string(),
  accessToken: string(),
  accessTokenExpiresAt: number(),
  refreshToken: string(),
  refreshTokenExpiresAt: number(),
  refreshStartedAt: optional(number()),
  createdAt: number(),
  updatedAt: number(),
});

export const githubUserAuthorizationTables = {
  /** The one refreshable GitHub App user authorization for a matching Samebase GitHub identity. */
  githubUserAuthorizations: defineTable(vGitHubUserAuthorization)
    .index("by_user", ["userId"])
    .index("by_github_user", ["githubUserId"]),
};
