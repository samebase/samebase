import { authTables } from "@convex-dev/auth/server";
import { defineTable } from "convex/server";
import { v } from "convex/values";

const { boolean, id, literal, number, object, optional, string, union } = v;
const {
  users: _authUsers,
  authVerifiers: _authVerifiers,
  ...authTablesWithoutUsersAndVerifiers
} = authTables;

export const identityTables = {
  ...authTablesWithoutUsersAndVerifiers,

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

    // Billing (Polar-backed for now).
    billingProvider: optional(literal("polar")),
    billingPlan: optional(union(literal("free"), literal("pro"))),
    billingStatus: optional(union(literal("inactive"), literal("active"), literal("past_due"))),
    billingUpdatedAt: optional(number()),
    billingCurrentPeriodEndAt: optional(number()),
    billingCancelAtPeriodEnd: optional(boolean()),
    billingPolarExternalCustomerId: optional(string()),
    billingPolarStateChangedAt: optional(number()),
    billingPolarObservationRevision: optional(number()),
    billingPolarCheckoutAttempt: optional(
      union(
        object({
          state: literal("creating"),
          attemptId: string(),
          leaseId: string(),
          leaseExpiresAt: number(),
        }),
        object({
          state: literal("open"),
          attemptId: string(),
          checkoutId: string(),
          url: string(),
          expiresAt: number(),
        }),
      ),
    ),
  })
    .index("email", ["email"])
    .index("phone", ["phone"])
    .index("by_polar_external_customer_id", ["billingPolarExternalCustomerId"]),
};
