import { defineTable } from "convex/server";
import { v } from "convex/values";

const { id, literal, number, object, optional, string, union } = v;

export const vGitHubAppConnectionAuthorizedCredential = object({
  state: literal("authorized"),
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

export const vGitHubAppConnectionCompletedCredential = object({
  state: literal("completed"),
  userId: id("users"),
  session: string(),
  organizationOwnerLogin: string(),
  createdAt: number(),
  expiresAt: number(),
});

export const vGitHubAppConnectionCredential = union(
  vGitHubAppConnectionAuthorizedCredential,
  vGitHubAppConnectionCompletedCredential,
);

export const githubAppConnectionTables = {
  /** Legacy ten-minute sessions kept for one deploy so scheduled revocation can finish. */
  githubAppConnectionCredentials: defineTable(vGitHubAppConnectionCredential)
    .index("by_session", ["session"])
    .index("by_user", ["userId"]),
};
