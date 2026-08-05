import { v } from "convex/values";

import { normalizeAccountEmail } from "../shared/accountPresentation";
import { internalMutation } from "./_generated/server";

const vAddExistingUserResult = v.union(
  v.object({
    state: v.literal("added"),
    membershipId: v.id("organizationMemberships"),
  }),
  v.object({
    state: v.literal("already_member"),
    membershipId: v.id("organizationMemberships"),
  }),
);

/** Add an existing Samebase account to an organization without an invitation flow. */
export const addExistingUserToOrganization = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    userEmail: v.string(),
  },
  returns: vAddExistingUserResult,
  handler: async (ctx, args) => {
    const userEmail = normalizeAccountEmail(args.userEmail);
    const [user, organization] = await Promise.all([
      ctx.db
        .query("users")
        .withIndex("email", (query) => query.eq("email", userEmail))
        .unique(),
      ctx.db.get(args.organizationId),
    ]);

    if (user === null) {
      throw new Error("User not found.");
    }
    if (user.accountDeletion !== undefined) {
      throw new Error("A deleting user cannot join an organization.");
    }
    if (organization === null) {
      throw new Error("Organization not found.");
    }

    const membership = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_organization_and_user", (query) =>
        query.eq("organizationId", args.organizationId).eq("userId", user._id),
      )
      .unique();
    if (membership !== null) {
      return {
        state: "already_member" as const,
        membershipId: membership._id,
      };
    }

    const membershipId = await ctx.db.insert("organizationMemberships", {
      organizationId: args.organizationId,
      userId: user._id,
      role: "member",
    });

    return {
      state: "added" as const,
      membershipId,
    };
  },
});
