import { defineTable } from "convex/server";
import { v } from "convex/values";
import { vAuthAccountLinkIntent } from "./accountModel";
import { vUserLifecycle } from "./lifecycle";

const { id, number, optional, string } = v;

export const identityTables = {
  /**
  Samebase's sign-in identities: one row for each GitHub, Google, or password identity of a user.
  The Convex Auth callbacks and the password account functions write it. Convex Auth keeps its own
  accounts and sessions in its components and does not read this table.
  */
  authAccounts: defineTable({
    userId: id("users"),
    provider: string(),
    providerAccountId: string(),
    /** The password hash of a Convex Auth 0.0.x password account. Nothing reads it. */
    secret: optional(string()),
    emailVerified: optional(string()),
    githubLogin: optional(string()),
  })
    .index("userIdAndProvider", ["userId", "provider"])
    .index("providerAndAccountId", ["provider", "providerAccountId"]),

  // The Convex Auth 0.0.x session tables. Nothing writes them; they hold the documents from before
  // the Convex Auth 2 cutover until those are deleted, and account deletion removes a user's rows.
  authSessions: defineTable({
    userId: id("users"),
    expirationTime: number(),
    accountLinkIntent: optional(vAuthAccountLinkIntent),
  }).index("userId", ["userId"]),
  authRefreshTokens: defineTable({
    sessionId: id("authSessions"),
    expirationTime: number(),
    firstUsedTime: optional(number()),
    parentRefreshTokenId: optional(id("authRefreshTokens")),
  })
    .index("sessionId", ["sessionId"])
    .index("sessionIdAndParentRefreshTokenId", ["sessionId", "parentRefreshTokenId"]),
  authVerificationCodes: defineTable({
    accountId: id("authAccounts"),
    provider: string(),
    code: string(),
    expirationTime: number(),
    verifier: optional(string()),
    emailVerified: optional(string()),
    phoneVerified: optional(string()),
  })
    .index("accountId", ["accountId"])
    .index("code", ["code"]),
  authVerifiers: defineTable({
    sessionId: optional(id("authSessions")),
    signature: optional(string()),
  })
    .index("signature", ["signature"])
    .index("sessionId", ["sessionId"]),
  authRateLimits: defineTable({
    identifier: string(),
    lastAttemptTime: number(),
    attemptsLeft: number(),
  }).index("identifier", ["identifier"]),

  /** Samebase accounts with an explicit terminal lifecycle. */
  users: defineTable(vUserLifecycle)
    .index("by_deleted_at", ["deletedAt"])
    .index("email", ["email"]),
};
