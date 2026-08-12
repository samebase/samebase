import { defineTable } from "convex/server";
import { v } from "convex/values";

const { id, number, object, optional, string } = v;

export const vGitHubAppConnectionCredential = object({
  userId: id("users"),
  session: string(),
  githubUserId: string(),
  githubUserLogin: string(),
  githubSignInProviderAccountId: optional(string()),
  accessToken: string(),
  accessTokenExpiresAt: number(),
  refreshToken: string(),
  refreshTokenExpiresAt: number(),
  createdAt: number(),
  expiresAt: number(),
});

export const githubAppConnectionTables = {
  /** Ten-minute GitHub App user credentials for live installation discovery and connection. */
  githubAppConnectionCredentials: defineTable(vGitHubAppConnectionCredential)
    .index("by_session", ["session"])
    .index("by_user", ["userId"]),
};
