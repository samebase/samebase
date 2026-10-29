import { defineTable } from "convex/server";
import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { vSealedSecret } from "./sealedSecret";

const { id, number, object, optional, string } = v;

export const vGitHubUserAuthorization = object({
  userId: id("users"),
  githubUserId: string(),
  githubUserLogin: string(),
  accessToken: vSealedSecret,
  accessTokenExpiresAt: number(),
  refreshToken: vSealedSecret,
  refreshTokenExpiresAt: number(),
  refreshStartedAt: optional(number()),
  createdAt: number(),
  updatedAt: number(),
});

/** The additional authenticated data of a sealed GitHub user token. */
export function githubUserAuthorizationAad(
  userId: Id<"users">,
  field: "accessToken" | "refreshToken",
): string {
  return `githubUserAuthorizations/${userId}/${field}`;
}

export const githubUserAuthorizationTables = {
  /** The one refreshable GitHub App user authorization for a matching Samebase GitHub identity. */
  githubUserAuthorizations: defineTable(vGitHubUserAuthorization)
    .index("by_user", ["userId"])
    .index("by_github_user", ["githubUserId"])
    .index("by_refresh_started_at", ["refreshStartedAt"]),
};
