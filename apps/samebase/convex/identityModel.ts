import { authTables } from "@convex-dev/auth/server";
import { defineTable } from "convex/server";
import { v } from "convex/values";
import { vAuthAccountLinkIntent } from "./authAccountModel";

const { boolean, id, literal, number, object, optional, string, union } = v;
const {
  users: _authUsers,
  authVerifiers: _authVerifiers,
  authSessions: _authSessions,
  ...authTablesWithoutUsersVerifiersAndSessions
} = authTables;

export const identityTables = {
  ...authTablesWithoutUsersVerifiersAndSessions,

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

  /** Samebase accounts linked to Convex Auth identities. */
  users: defineTable({
    name: optional(string()),
    displayName: optional(string()),
    image: optional(string()),
    email: string(),
    githubSignInLogin: optional(string()),
    emailVerificationTime: optional(number()),
    phone: optional(string()),
    phoneVerificationTime: optional(number()),
    isAnonymous: optional(boolean()),
    isApproved: optional(boolean()),
    accountDeletion: optional(
      union(
        object({
          state: literal("deleting"),
          runId: id("workflow_accountDeletion_runs"),
          requestedAt: number(),
        }),
        object({
          state: literal("finalizing"),
          runId: id("workflow_accountDeletion_runs"),
          requestedAt: number(),
        }),
      ),
    ),
  })
    .index("email", ["email"])
    .index("phone", ["phone"]),
};
