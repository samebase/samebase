import { describe, expect, it } from "vite-plus/test";

import { internal } from "./_generated/api";
import { makeConvexTest } from "./test.setup";

describe("canonical Polar billing state", () => {
  it("applies only the latest observation and stores verified seat capacity", async () => {
    const t = makeConvexTest();
    const seed = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        state: "active",
        email: "polar-payer@example.invalid",
        isApproved: true,
      });
      const organizationId = await ctx.db.insert("organizations", {
        githubOwnerId: "polar-owner",
        githubOwnerType: "organization",
        githubOwnerLogin: "polar-owner",
        githubOwnerLoginNormalized: "polar-owner",
        githubInstallationId: "polar-installation",
      });
      const billingAccountId = await ctx.db.insert("organizationBillingAccounts", {
        organizationId,
        plan: "free",
        status: "inactive",
        polarExternalCustomerId: "polar-customer",
        polarBillingUserId: userId,
        polarCheckoutAttempt: {
          state: "open",
          attemptId: "attempt-1",
          checkoutId: "checkout-1",
        },
      });
      return { billingAccountId, userId };
    });

    const firstObservation = await t.mutation(internal.polarBillingState.beginObservation, {
      externalCustomerId: "polar-customer",
    });
    expect(firstObservation).toEqual({
      observationRevision: 1,
      githubOwnerType: "organization",
    });
    if (firstObservation === null) {
      throw new Error("Polar observation target is required.");
    }

    await expect(
      t.mutation(internal.polarBillingState.applyObservation, {
        observationRevision: firstObservation.observationRevision,
        state: {
          status: "active",
          plan: "free",
          externalCustomerId: "polar-customer",
          subscriptionId: "subscription-1",
          polarSeatQuantity: 3,
          pendingPlan: "free",
          currentPeriodEndAt: 10_000,
          cancelAtPeriodEnd: false,
        },
      }),
    ).resolves.toBe(true);
    await expect(
      t.mutation(internal.polarBillingState.applyObservation, {
        observationRevision: firstObservation.observationRevision,
        state: {
          status: "inactive",
          plan: "free",
          externalCustomerId: "polar-customer",
        },
      }),
    ).resolves.toBe(false);

    const activeAccount = await t.run(async (ctx) => {
      return await ctx.db.get(seed.billingAccountId);
    });
    expect(activeAccount).toMatchObject({
      provider: "polar",
      plan: "free",
      status: "active",
      polarBillingUserId: seed.userId,
      polarSeatQuantity: 3,
      polarPendingPlan: "free",
      currentPeriodEndAt: 10_000,
      cancelAtPeriodEnd: false,
      polarAppliedObservationRevision: 1,
    });
    expect(activeAccount?.polarCheckoutAttempt).toBeUndefined();

    const finalObservation = await t.mutation(internal.polarBillingState.beginObservation, {
      externalCustomerId: "polar-customer",
    });
    if (finalObservation === null) {
      throw new Error("Polar observation target is required.");
    }
    await expect(
      t.mutation(internal.polarBillingState.applyObservation, {
        observationRevision: finalObservation.observationRevision,
        state: {
          status: "inactive",
          plan: "free",
          externalCustomerId: "polar-customer",
        },
      }),
    ).resolves.toBe(true);

    const inactiveAccount = await t.run(async (ctx) => {
      return await ctx.db.get(seed.billingAccountId);
    });
    expect(inactiveAccount).toMatchObject({
      provider: "polar",
      plan: "free",
      status: "inactive",
      polarBillingUserId: seed.userId,
      polarAppliedObservationRevision: 2,
    });
    expect(inactiveAccount?.polarSeatQuantity).toBeUndefined();
    expect(inactiveAccount?.polarPendingPlan).toBeUndefined();
    expect(inactiveAccount?.currentPeriodEndAt).toBeUndefined();
    expect(inactiveAccount?.cancelAtPeriodEnd).toBeUndefined();
  });
});
