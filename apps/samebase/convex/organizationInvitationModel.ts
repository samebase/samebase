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
  /** One current invitation or one scrubbed accepted-attribution row. */
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
      object({
        state: literal("accepted_recipient_deleted"),
        organizationId: id("organizations"),
        createdByUserId: id("users"),
        acceptedByUserId: id("users"),
        createdAt: number(),
        acceptedAt: number(),
      }),
    ),
  )
    .index("by_code", ["code"])
    .index("by_organization_and_github_account_id", ["organizationId", "githubAccountId"])
    .index("by_organization_and_state_and_expires_at", ["organizationId", "state", "expiresAt"])
    .index("by_accepted_by_user_and_state", ["acceptedByUserId", "state"]),
};
