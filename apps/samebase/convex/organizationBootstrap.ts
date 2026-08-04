import { v } from "convex/values";

import { internalMutation } from "./_generated/server";
import { vOrganizationBillingState } from "./organizationModel";

const { id, number, object } = v;

const USER_ROW_CAP = 500;

const bootstrapResult = object({
  users: number(),
  organizations: number(),
  memberships: number(),
  billingAccounts: number(),
});

/** Bootstrap the final organization graph after the manual production reset. */
export const bootstrapOrganizationOwnership = internalMutation({
  args: {
    operatorUserIdA: id("users"),
    operatorUserIdB: id("users"),
    operatorBilling: vOrganizationBillingState,
  },
  returns: bootstrapResult,
  handler: async (ctx, args) => {
    if (args.operatorUserIdA === args.operatorUserIdB) {
      throw new Error("Organization bootstrap requires two different operator users.");
    }
    if (args.operatorBilling.polarCheckoutAttempt !== undefined) {
      throw new Error("Organization bootstrap requires checkout attempts to be resolved.");
    }

    const [users, organization, membership, billingAccount] = await Promise.all([
      ctx.db.query("users").take(USER_ROW_CAP + 1),
      ctx.db.query("organizations").first(),
      ctx.db.query("organizationMemberships").first(),
      ctx.db.query("organizationBillingAccounts").first(),
    ]);
    if (users.length > USER_ROW_CAP) {
      throw new Error(`Organization bootstrap supports at most ${USER_ROW_CAP} retained users.`);
    }
    if (organization !== null || membership !== null || billingAccount !== null) {
      throw new Error("Organization bootstrap requires empty organization tables.");
    }

    const retainedUserIds = new Set(users.map((user) => user._id));
    if (!retainedUserIds.has(args.operatorUserIdA) || !retainedUserIds.has(args.operatorUserIdB)) {
      throw new Error("Organization bootstrap operator users must exist.");
    }

    const operatorOrganizationId = await ctx.db.insert("organizations", {});
    await ctx.db.insert("organizationMemberships", {
      organizationId: operatorOrganizationId,
      userId: args.operatorUserIdA,
    });
    await ctx.db.insert("organizationMemberships", {
      organizationId: operatorOrganizationId,
      userId: args.operatorUserIdB,
    });
    await ctx.db.insert("organizationBillingAccounts", {
      organizationId: operatorOrganizationId,
      ...args.operatorBilling,
    });

    let organizationCount = 1;
    for (const user of users) {
      if (user._id === args.operatorUserIdA || user._id === args.operatorUserIdB) {
        continue;
      }
      const organizationId = await ctx.db.insert("organizations", {});
      await ctx.db.insert("organizationMemberships", {
        organizationId,
        userId: user._id,
      });
      await ctx.db.insert("organizationBillingAccounts", {
        organizationId,
        plan: "free",
        status: "inactive",
      });
      organizationCount += 1;
    }

    return {
      users: users.length,
      organizations: organizationCount,
      memberships: users.length,
      billingAccounts: organizationCount,
    };
  },
});
