import { describe, expect, it } from "vite-plus/test";

import { internal } from "./_generated/api";
import { readCanonicalPolarBillingState } from "./polarBillingState";
import type { PolarProductCatalog } from "./polarClient";
import { makeConvexTest } from "./test.setup";

const currentProductId = "current-product";
const historicalProductId = "historical-product";
const productCatalog = [
  { productId: currentProductId, version: 2, availableForCheckout: true },
  { productId: historicalProductId, version: 1, availableForCheckout: false },
] satisfies PolarProductCatalog;

type MockSubscription = {
  cancelAtPeriodEnd: boolean;
  customerId: string;
  id: string;
  pendingProductId: string | null;
  pendingSeats: number | null;
  productId: string;
  seats: number;
  status: "active" | "past_due" | "paused" | "trialing";
};

function createMockSubscription(overrides: Partial<MockSubscription> = {}): MockSubscription {
  return {
    cancelAtPeriodEnd: false,
    customerId: "customer-1",
    id: "subscription-1",
    pendingProductId: null,
    pendingSeats: null,
    productId: currentProductId,
    seats: 2,
    status: "active",
    ...overrides,
  };
}

async function readMockCanonicalState(subscriptions: MockSubscription[]) {
  const externalCustomerId = "polar-customer";
  const customer = {
    deletedAt: null,
    externalId: externalCustomerId,
    id: "customer-1",
    type: "team" as const,
  };
  const polar = {
    customers: {
      getExternal: async () => customer,
    },
    subscriptions: {
      list: async () => ({
        result: {
          items: subscriptions.map((subscription) => ({
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
            currentPeriodEnd: new Date(10_000),
            customer,
            customerId: subscription.customerId,
            id: subscription.id,
            pendingUpdate: {
              productId: subscription.pendingProductId,
              seats: subscription.pendingSeats,
            },
            product: { id: subscription.productId },
            productId: subscription.productId,
            seats: subscription.seats,
            status: subscription.status,
          })),
          pagination: {
            maxPage: subscriptions.length === 0 ? 0 : 1,
            totalCount: subscriptions.length,
          },
        },
      }),
    },
  };

  return await readCanonicalPolarBillingState({
    // @ts-expect-error The test double implements the two Polar methods read by this boundary.
    polar,
    externalCustomerId,
    productCatalog,
  });
}

describe("canonical Polar billing state", () => {
  it("accepts scheduled cancellation on the current Pro product", async () => {
    await expect(
      readMockCanonicalState([createMockSubscription({ cancelAtPeriodEnd: true })]),
    ).resolves.toEqual({
      cancelAtPeriodEnd: true,
      currentPeriodEndAt: 10_000,
      externalCustomerId: "polar-customer",
      plan: "pro",
      polarSeatQuantity: 2,
      status: "active",
      subscriptionId: "subscription-1",
    });
  });

  it("accepts a retained historical Pro product", async () => {
    await expect(
      readMockCanonicalState([
        createMockSubscription({ productId: historicalProductId, seats: 3 }),
      ]),
    ).resolves.toMatchObject({
      plan: "pro",
      polarSeatQuantity: 3,
      status: "active",
    });
  });

  it("maps no current subscription to Free", async () => {
    await expect(readMockCanonicalState([])).resolves.toEqual({
      externalCustomerId: "polar-customer",
      plan: "free",
      status: "inactive",
    });
  });

  it("rejects unknown products and subscriptions below two seats", async () => {
    await expect(
      readMockCanonicalState([createMockSubscription({ productId: "unknown-product" })]),
    ).rejects.toThrow("does not use the expected product");
    await expect(readMockCanonicalState([createMockSubscription({ seats: 1 })])).rejects.toThrow(
      "invalid seat quantity",
    );
  });

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
    });
    if (firstObservation === null) {
      throw new Error("Polar observation target is required.");
    }

    await expect(
      t.mutation(internal.polarBillingState.applyObservation, {
        observationRevision: firstObservation.observationRevision,
        state: {
          status: "active",
          plan: "pro",
          externalCustomerId: "polar-customer",
          subscriptionId: "subscription-1",
          polarSeatQuantity: 3,
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
      plan: "pro",
      status: "active",
      polarBillingUserId: seed.userId,
      polarSeatQuantity: 3,
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
    expect(inactiveAccount?.currentPeriodEndAt).toBeUndefined();
    expect(inactiveAccount?.cancelAtPeriodEnd).toBeUndefined();
  });
});
