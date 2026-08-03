import { defineTable } from "convex/server";
import { v } from "convex/values";

const { boolean, id, literal, number, object, optional, string, union } = v;

export const vOrganizationBillingState = object({
  provider: optional(literal("polar")),
  plan: union(literal("free"), literal("pro")),
  status: union(literal("inactive"), literal("active"), literal("past_due")),
  updatedAt: optional(number()),
  currentPeriodEndAt: optional(number()),
  cancelAtPeriodEnd: optional(boolean()),
  polarExternalCustomerId: optional(string()),
  polarStateChangedAt: optional(number()),
  polarObservationRevision: optional(number()),
  polarAppliedObservationRevision: optional(number()),
  polarCheckoutAttempt: optional(
    union(
      object({
        state: literal("pending"),
        attemptId: string(),
      }),
      object({
        state: literal("open"),
        attemptId: string(),
        checkoutId: string(),
      }),
    ),
  ),
});

export const organizationTables = {
  /** Samebase customer workspaces that own durable customer resources. */
  organizations: defineTable({}),

  /** User access to an organization. Row presence grants access. */
  organizationMemberships: defineTable({
    organizationId: id("organizations"),
    userId: id("users"),
  })
    .index("by_user", ["userId"])
    .index("by_organization_and_user", ["organizationId", "userId"]),

  /** Billing state for one organization. */
  organizationBillingAccounts: defineTable({
    organizationId: id("organizations"),
    ...vOrganizationBillingState.fields,
  })
    .index("by_organization", ["organizationId"])
    .index("by_polar_external_customer_id", ["polarExternalCustomerId"]),
};
