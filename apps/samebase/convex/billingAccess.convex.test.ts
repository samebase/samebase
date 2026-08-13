import { describe, expect, it } from "vite-plus/test";

import { api, internal } from "./_generated/api";
import { makeConvexTest } from "./test.setup";

async function seedCheckoutContinuation() {
  const t = makeConvexTest();
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      state: "active",
      email: "checkout-owner@example.invalid",
      isApproved: true,
    });
    const organizationId = await ctx.db.insert("organizations", {
      githubOwnerId: "checkout-owner",
      githubOwnerType: "organization",
      githubOwnerLogin: "checkout-owner",
      githubOwnerLoginNormalized: "checkout-owner",
      githubInstallationId: "checkout-installation",
    });
    await ctx.db.insert("organizationMemberships", {
      organizationId,
      userId,
      role: "owner",
    });
    await ctx.db.insert("organizationBillingAccounts", {
      organizationId,
      plan: "free",
      status: "inactive",
      polarBillingUserId: userId,
    });
    return { organizationId, userId };
  });

  return { t, ...ids };
}

describe("organization billing access", () => {
  it("includes two members in personal Pro", async () => {
    const t = makeConvexTest();
    const { organizationId, userId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        state: "active",
        email: "personal-pro-owner@example.invalid",
        isApproved: true,
      });
      const organizationId = await ctx.db.insert("organizations", {
        githubOwnerId: "personal-pro-owner",
        githubOwnerType: "user",
        githubOwnerLogin: "personal-pro-owner",
        githubOwnerLoginNormalized: "personal-pro-owner",
        githubInstallationId: "personal-pro-installation",
      });
      await ctx.db.insert("organizationMemberships", {
        organizationId,
        userId,
        role: "owner",
      });
      await ctx.db.insert("organizationBillingAccounts", {
        organizationId,
        provider: "polar",
        plan: "pro",
        status: "active",
        polarExternalCustomerId: "personal-pro-customer",
        polarBillingUserId: userId,
        polarSeatQuantity: 2,
      });
      return { organizationId, userId };
    });
    const asOwner = t.withIdentity({
      subject: `${userId}|personal-pro-session`,
      tokenIdentifier: `test:${userId}`,
    });

    await expect(
      asOwner.query(api.billing.getViewerBillingStatus, { organizationId }),
    ).resolves.toMatchObject({
      plan: "pro",
      includedMembers: 2,
      memberCapacity: 2,
      memberCount: 1,
    });
  });

  it("rejects the final billing payer check after membership removal", async () => {
    const seed = await seedCheckoutContinuation();
    await expect(
      seed.t.query(internal.billing.confirmCurrentBillingPayer, {
        userId: seed.userId,
        organizationId: seed.organizationId,
      }),
    ).resolves.toBeNull();

    await seed.t.run(async (ctx) => {
      const membership = await ctx.db
        .query("organizationMemberships")
        .withIndex("by_organization_and_user", (query) =>
          query.eq("organizationId", seed.organizationId).eq("userId", seed.userId),
        )
        .unique();
      if (membership === null) {
        throw new Error("Billing owner membership is required.");
      }
      await ctx.db.delete(membership._id);
    });

    await expect(
      seed.t.query(internal.billing.confirmCurrentBillingPayer, {
        userId: seed.userId,
        organizationId: seed.organizationId,
      }),
    ).rejects.toThrow("Only the designated billing payer can manage this subscription.");
  });

  it("denies direct billing reads and reconciliation to a pending user with a membership", async () => {
    const t = makeConvexTest();
    const { organizationId, userId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        state: "active",
        email: "pending-billing@example.invalid",
        isApproved: false,
      });
      const organizationId = await ctx.db.insert("organizations", {
        githubOwnerId: "pending-billing-owner",
        githubOwnerType: "organization",
        githubOwnerLogin: "pending-billing-owner",
        githubOwnerLoginNormalized: "pending-billing-owner",
        githubInstallationId: "pending-billing-installation",
      });
      await ctx.db.insert("organizationMemberships", {
        organizationId,
        userId,
        role: "owner",
      });
      await ctx.db.insert("organizationBillingAccounts", {
        organizationId,
        plan: "free",
        status: "inactive",
      });
      return { organizationId, userId };
    });
    const asPendingUser = t.withIdentity({
      subject: `${userId}|pending-billing-session`,
      tokenIdentifier: `test:${userId}`,
    });

    await expect(
      asPendingUser.query(api.billing.getViewerBillingStatus, { organizationId }),
    ).rejects.toThrowError("Access denied");
    await expect(
      asPendingUser.query(api.billingResourceQuotas.getViewerBillingResourceUsage, {
        organizationId,
      }),
    ).rejects.toThrowError("Access denied");
    await expect(
      asPendingUser.action(api.billing.reconcileViewerBillingFromPolar, { organizationId }),
    ).rejects.toThrowError("Access denied");
  });

  it("blocks normal organization access but keeps billing visible above member capacity", async () => {
    const seed = await seedCheckoutContinuation();
    await seed.t.run(async (ctx) => {
      for (const index of [1, 2]) {
        const userId = await ctx.db.insert("users", {
          state: "active",
          email: `limited-member-${index}@example.invalid`,
          isApproved: true,
        });
        await ctx.db.insert("organizationMemberships", {
          organizationId: seed.organizationId,
          userId,
          role: "member",
        });
      }
    });

    await expect(
      seed.t.query(internal.organizationAccess.requireOrganizationIdForUser, {
        userId: seed.userId,
        organizationId: seed.organizationId,
      }),
    ).rejects.toThrow("This organization needs more paid member seats.");

    const asPayer = seed.t.withIdentity({
      subject: `${seed.userId}|billing-payer-session`,
      tokenIdentifier: `test:${seed.userId}`,
    });
    await expect(
      asPayer.query(api.billing.getViewerBillingStatus, {
        organizationId: seed.organizationId,
      }),
    ).resolves.toMatchObject({
      billingLimited: true,
      canManageBilling: true,
      includedMembers: 2,
      memberCapacity: 2,
      memberCount: 3,
      payerState: "viewer",
    });
  });

  it("clears only the matching pending checkout", async () => {
    const seed = await seedCheckoutContinuation();
    const reservation = await seed.t.mutation(internal.polarCheckout.reserveAttempt, {
      userId: seed.userId,
      organizationId: seed.organizationId,
    });
    expect(reservation).toMatchObject({ state: "pending", canCreate: true });

    await expect(
      seed.t.mutation(internal.polarCheckout.clearPending, {
        organizationId: seed.organizationId,
        attemptId: "different-attempt",
      }),
    ).resolves.toBe(false);
    await expect(
      seed.t.mutation(internal.polarCheckout.clearPending, {
        organizationId: seed.organizationId,
        attemptId: reservation.attemptId,
      }),
    ).resolves.toBe(true);
  });

  it("records and clears only the matching open checkout", async () => {
    const seed = await seedCheckoutContinuation();
    const reservation = await seed.t.mutation(internal.polarCheckout.reserveAttempt, {
      userId: seed.userId,
      organizationId: seed.organizationId,
    });
    expect(reservation).toMatchObject({ state: "pending", canCreate: true });

    await expect(
      seed.t.mutation(internal.polarCheckout.recordOpen, {
        organizationId: seed.organizationId,
        attemptId: "different-attempt",
        checkoutId: "checkout-1",
      }),
    ).resolves.toBe(false);
    await expect(
      seed.t.mutation(internal.polarCheckout.recordOpen, {
        organizationId: seed.organizationId,
        attemptId: reservation.attemptId,
        checkoutId: "checkout-1",
      }),
    ).resolves.toBe(true);
    await expect(
      seed.t.mutation(internal.polarCheckout.recordOpen, {
        organizationId: seed.organizationId,
        attemptId: reservation.attemptId,
        checkoutId: "checkout-2",
      }),
    ).resolves.toBe(false);
    await expect(
      seed.t.mutation(internal.polarCheckout.recordOpen, {
        organizationId: seed.organizationId,
        attemptId: reservation.attemptId,
        checkoutId: "checkout-1",
      }),
    ).resolves.toBe(true);
    await expect(
      seed.t.mutation(internal.polarCheckout.clearOpen, {
        organizationId: seed.organizationId,
        attemptId: reservation.attemptId,
        checkoutId: "checkout-1",
      }),
    ).resolves.toBe(true);
  });
});
