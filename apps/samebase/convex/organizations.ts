import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { DatabaseWriter } from "./_generated/server";
import { query } from "./functions";

export function buildPersonalOrganizationName(user: Doc<"users">): string {
  for (const candidate of [user.displayName, user.name, user.email]) {
    const name = candidate?.trim();
    if (name) {
      return `${name}'s organization`;
    }
  }

  throw new Error("Organization provisioning requires a nonempty account email.");
}

export const listForViewer = query({
  args: {},
  returns: v.array(
    v.object({
      organizationId: v.id("organizations"),
      label: v.string(),
    }),
  ),
  access: "access_dashboard",
  handler: async (ctx) => {
    const memberships = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_user", (index) => index.eq("userId", ctx.viewer.userId))
      .collect();

    const organizations = await Promise.all(
      memberships.map(async (membership) => {
        const organization = await ctx.db.get(membership.organizationId);
        if (organization === null) {
          throw new Error("Organization membership refers to a missing organization.");
        }

        return {
          organizationId: organization._id,
          label: organization.name,
        };
      }),
    );

    organizations.sort(
      (left, right) =>
        left.label.localeCompare(right.label) ||
        left.organizationId.localeCompare(right.organizationId),
    );
    return organizations;
  },
});

/** Create a personal organization only when the user has no membership. */
export async function ensureOrganizationForUser(
  db: DatabaseWriter,
  userId: Id<"users">,
): Promise<void> {
  const user = await db.get(userId);
  if (user === null) {
    throw new Error("Organization provisioning requires an existing user.");
  }

  const memberships = await db
    .query("organizationMemberships")
    .withIndex("by_user", (query) => query.eq("userId", userId))
    .take(1);
  if (memberships.length > 0) {
    return;
  }

  const organizationId = await db.insert("organizations", {
    name: buildPersonalOrganizationName(user),
  });
  await db.insert("organizationMemberships", {
    organizationId,
    userId,
  });
  await db.insert("organizationBillingAccounts", {
    organizationId,
    plan: "free",
    status: "inactive",
  });
}
