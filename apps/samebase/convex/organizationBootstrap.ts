import { v, type Infer } from "convex/values";

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

function validateOperatorBilling(billing: Infer<typeof vOrganizationBillingState>): void {
  if (billing.polarCheckoutAttempt !== undefined) {
    throw new Error("Organization bootstrap requires checkout attempts to be resolved.");
  }

  const externalCustomerId = billing.polarExternalCustomerId;
  if (
    externalCustomerId !== undefined &&
    (externalCustomerId.length === 0 || externalCustomerId.trim() !== externalCustomerId)
  ) {
    throw new Error("Organization bootstrap requires a nonempty, trimmed Polar customer ID.");
  }

  if (billing.plan === "free") {
    if (
      billing.status !== "inactive" ||
      billing.currentPeriodEndAt !== undefined ||
      billing.cancelAtPeriodEnd !== undefined ||
      (billing.provider === "polar" && externalCustomerId === undefined) ||
      (billing.provider !== "polar" && externalCustomerId !== undefined) ||
      (billing.provider !== "polar" &&
        (billing.polarStateChangedAt !== undefined ||
          billing.polarObservationRevision !== undefined ||
          billing.polarAppliedObservationRevision !== undefined))
    ) {
      throw new Error("Organization bootstrap billing state is inconsistent.");
    }
    return;
  }

  if (
    billing.provider !== "polar" ||
    (billing.status !== "active" && billing.status !== "past_due") ||
    externalCustomerId === undefined ||
    billing.currentPeriodEndAt === undefined ||
    billing.cancelAtPeriodEnd === undefined
  ) {
    throw new Error("Organization bootstrap billing state is inconsistent.");
  }
}

/** Bootstrap the final organization graph after the manual production reset. */
export const bootstrapOrganizationOwnership = internalMutation({
  args: {
    operatorUserIdA: id("users"),
    operatorUserIdB: id("users"),
    operatorBilling: vOrganizationBillingState,
  },
  returns: bootstrapResult,
  handler: async (ctx, args) => {
    validateOperatorBilling(args.operatorBilling);
    if (args.operatorUserIdA === args.operatorUserIdB) {
      throw new Error("Organization bootstrap requires two different operator users.");
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
