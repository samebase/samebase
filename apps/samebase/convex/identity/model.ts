import { authTables } from "@convex-dev/auth/server";
import { defineTable } from "convex/server";
import { v } from "convex/values";
import { vAuthAccountLinkIntent } from "./accountModel";
import { vUserLifecycle } from "./lifecycle";

const { id, number, optional, string } = v;
const {
  users: _authUsers,
  authAccounts: _authAccounts,
  authVerifiers: _authVerifiers,
  authSessions: _authSessions,
  ...baseAuthTables
} = authTables;

export const identityTables = {
  ...baseAuthTables,

  /** Convex Auth sessions, with a short-lived explicit account-linking intent. */
  authSessions: defineTable({
    userId: id("users"),
    expirationTime: number(),
    accountLinkIntent: optional(vAuthAccountLinkIntent),
  }).index("userId", ["userId"]),

  /** Convex Auth verification values, with optional signatures and session association. */
  authVerifiers: defineTable({
    sessionId: optional(id("authSessions")),
    signature: optional(string()),
  })
    .index("signature", ["signature"])
    .index("sessionId", ["sessionId"]),

  /** Convex Auth identities, with the latest GitHub login observation. */
  authAccounts: defineTable({
    userId: id("users"),
    provider: string(),
    providerAccountId: string(),
    secret: optional(string()),
    emailVerified: optional(string()),
    phoneVerified: optional(string()),
    githubLogin: optional(string()),
  })
    .index("userIdAndProvider", ["userId", "provider"])
    .index("providerAndAccountId", ["provider", "providerAccountId"]),

  /** Samebase accounts with an explicit terminal lifecycle. */
  users: defineTable(vUserLifecycle)
    .index("by_deleted_at", ["deletedAt"])
    .index("email", ["email"]),
};
