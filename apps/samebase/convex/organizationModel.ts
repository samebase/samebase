import { defineTable } from "convex/server";
import { v } from "convex/values";

const { boolean, id, literal, number, object, optional, string, union } = v;

export const vOrganizationConvexTeam = object({
  teamId: string(),
  // TODO: Make teamSlug required when Convex exposes it in token details or a
  // team lookup. An empty team has no project response from which Samebase can
  // learn the slug. Samebase fills it when a project response becomes available.
  teamSlug: optional(string()),
});

export const vOrganizationCloudflareAccount = object({
  accountId: string(),
  accountName: string(),
  lastUsedBuildTokenUuid: optional(string()),
});

export const vGitHubOwnerType = union(literal("organization"), literal("user"));
export const vOrganizationMembershipRole = union(literal("owner"), literal("member"));

export const vOrganizationBillingState = object({
  provider: optional(literal("polar")),
  plan: union(literal("free"), literal("pro")),
  status: union(literal("inactive"), literal("active"), literal("past_due")),
  updatedAt: optional(number()),
  currentPeriodEndAt: optional(number()),
  cancelAtPeriodEnd: optional(boolean()),
  polarExternalCustomerId: optional(string()),
  polarBillingUserId: optional(id("users")),
  polarBillingPayerTransfer: optional(
    object({
      attemptId: string(),
      targetUserId: id("users"),
    }),
  ),
  polarSeatQuantity: optional(number()),
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
  /** One Samebase workspace for one stable GitHub repository owner. */
  organizations: defineTable({
    githubOwnerId: string(),
    githubOwnerType: vGitHubOwnerType,
    githubOwnerLogin: string(),
    githubOwnerLoginNormalized: string(),
    githubInstallationId: string(),
    convexTeam: optional(vOrganizationConvexTeam),
    cloudflareAccount: optional(vOrganizationCloudflareAccount),
  })
    .index("by_github_owner_id", ["githubOwnerId"])
    .index("by_github_owner_login_normalized", ["githubOwnerLoginNormalized"])
    .index("by_github_installation_id", ["githubInstallationId"]),

  /** User access to an organization. */
  organizationMemberships: defineTable({
    organizationId: id("organizations"),
    userId: id("users"),
    role: vOrganizationMembershipRole,
  })
    .index("by_user", ["userId"])
    .index("by_organization_and_user", ["organizationId", "userId"])
    .index("by_organization_and_role", ["organizationId", "role"]),

  /** Billing state for one organization. */
  organizationBillingAccounts: defineTable({
    organizationId: id("organizations"),
    ...vOrganizationBillingState.fields,
  })
    .index("by_organization", ["organizationId"])
    .index("by_polar_external_customer_id", ["polarExternalCustomerId"]),
};
