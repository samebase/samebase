import { defineTable } from "convex/server";
import { v } from "convex/values";
import { vUserLifecycle } from "./lifecycle";

const { id, optional, string } = v;

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
    emailVerified: optional(string()),
    githubLogin: optional(string()),
  })
    .index("userIdAndProvider", ["userId", "provider"])
    .index("providerAndAccountId", ["provider", "providerAccountId"]),

  /** Samebase accounts with an explicit terminal lifecycle. */
  users: defineTable(vUserLifecycle)
    .index("by_deleted_at", ["deletedAt"])
    .index("email", ["email"]),
};
