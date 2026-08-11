import { v } from "convex/values";

import { normalizeAccountEmail } from "../shared/accountPresentation";
import { internalMutation } from "./_generated/server";
import { requireAnotherActiveOrganizationOwner } from "./organizationAccess";
import {
  requireAdditionalOrganizationMemberCapacity,
  requireUserIsNotOrganizationBillingPayer,
} from "./organizationBillingLimits";
import { requireOrganizationNotDeleting } from "./organizationDeletion/state";
import { vOrganizationMembershipRole } from "./organizationModel";
import { readActiveUser } from "./userLifecycle";

const vAddExistingUserResult = v.union(
  v.object({
    state: v.literal("added"),
    membershipId: v.id("organizationMemberships"),
  }),
  v.object({
    state: v.literal("already_member"),
    membershipId: v.id("organizationMemberships"),
  }),
  v.object({
    state: v.literal("updated"),
    membershipId: v.id("organizationMemberships"),
  }),
);

/** Operator recovery: add or update an existing Samebase organization membership. */
export const addExistingUserToOrganization = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    role: vOrganizationMembershipRole,
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
    const activeUser = readActiveUser(user);
    if (activeUser === null) {
      throw new Error("A deleting user cannot join an organization.");
    }
    if (activeUser.isApproved !== true) {
      throw new Error("An unapproved user cannot join an organization.");
    }
    if (organization === null) {
      throw new Error("Organization not found.");
    }
    requireOrganizationNotDeleting(organization);

    const membership = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_organization_and_user", (query) =>
        query.eq("organizationId", args.organizationId).eq("userId", activeUser._id),
      )
      .unique();
    if (membership !== null) {
      if (membership.role !== args.role) {
        if (membership.role === "owner" && args.role === "member") {
          await requireUserIsNotOrganizationBillingPayer(ctx.db, {
            organizationId: args.organizationId,
            userId: activeUser._id,
          });
          await requireAnotherActiveOrganizationOwner(ctx.db, {
            organizationId: args.organizationId,
            excludedUserId: activeUser._id,
          });
        }
        await ctx.db.patch(membership._id, { role: args.role });
        return {
          state: "updated" as const,
          membershipId: membership._id,
        };
      }
      return {
        state: "already_member" as const,
        membershipId: membership._id,
      };
    }

    await requireAdditionalOrganizationMemberCapacity(ctx.db, args.organizationId);
    const membershipId = await ctx.db.insert("organizationMemberships", {
      organizationId: args.organizationId,
      userId: activeUser._id,
      role: args.role,
    });

    return {
      state: "added" as const,
      membershipId,
    };
  },
});
