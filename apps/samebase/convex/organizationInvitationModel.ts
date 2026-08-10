import { defineTable } from "convex/server";
import { v } from "convex/values";

const { id, literal, number, object, optional, string, union } = v;

const invitationFields = {
  organizationId: id("organizations"),
  githubAccountId: string(),
  githubLogin: string(),
  githubAvatarUrl: optional(string()),
  code: string(),
  createdByUserId: id("users"),
  createdAt: number(),
  expiresAt: number(),
};

export const organizationInvitationTables = {
  /** One explicit invitation for one stable GitHub user identity. */
  organizationInvitations: defineTable(
    union(
      object({
        state: literal("pending"),
        ...invitationFields,
      }),
      object({
        state: literal("accepted"),
        ...invitationFields,
        acceptedByUserId: id("users"),
        acceptedAt: number(),
      }),
    ),
  )
    .index("by_code", ["code"])
    .index("by_organization_and_github_account_id", ["organizationId", "githubAccountId"])
    .index("by_organization_and_state_and_expires_at", ["organizationId", "state", "expiresAt"])
    .index("by_created_by_user", ["createdByUserId"])
    .index("by_accepted_by_user", ["acceptedByUserId"]),
};
