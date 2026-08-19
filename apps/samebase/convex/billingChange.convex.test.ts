import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const polarMocks = vi.hoisted(() => ({
  createPolarClient: vi.fn(),
  reconcilePolarCustomerBilling: vi.fn(),
}));

vi.mock("./polarClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./polarClient")>();
  return {
    ...actual,
    createPolarClient: polarMocks.createPolarClient,
  };
});

vi.mock("./polarBillingState", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./polarBillingState")>();
  return {
    ...actual,
    reconcilePolarCustomerBilling: polarMocks.reconcilePolarCustomerBilling,
  };
});

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { makeConvexTest } from "./test.setup";

const successUrl = "http://localhost/org/billing-owner/settings?checkout=success";
const returnUrl = "http://localhost/org/billing-owner/settings?checkout=cancel";

async function seedBillingOrganization(args: {
  githubOwnerType: "organization" | "user";
  memberCount?: number;
  subscription?: { seats: number };
}) {
  const t = makeConvexTest();
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      state: "active",
      email: "billing-owner@example.invalid",
      isApproved: true,
      termsVersion: "2026-08-12",
      termsAcceptedAt: 1,
    });
    const organizationId = await ctx.db.insert("organizations", {
      githubOwnerId: `billing-${args.githubOwnerType}`,
      githubOwnerType: args.githubOwnerType,
      githubOwnerLogin: "billing-owner",
      githubOwnerLoginNormalized: "billing-owner",
      githubInstallationId: `billing-installation-${args.githubOwnerType}`,
    });
    await ctx.db.insert("organizationMemberships", {
      organizationId,
      userId,
      role: "owner",
    });
    for (let memberIndex = 1; memberIndex < (args.memberCount ?? 1); memberIndex += 1) {
      const memberUserId = await ctx.db.insert("users", {
        state: "active",
        email: `billing-member-${memberIndex}@example.invalid`,
        isApproved: true,
        termsVersion: "2026-08-12",
        termsAcceptedAt: 1,
      });
      await ctx.db.insert("organizationMemberships", {
        organizationId,
        userId: memberUserId,
        role: "member",
      });
    }
    await ctx.db.insert("organizationBillingAccounts", {
      organizationId,
      ...(args.subscription
        ? {
            provider: "polar" as const,
            plan: "pro" as const,
            status: "active" as const,
            polarExternalCustomerId: `billing-customer-${organizationId}`,
            polarBillingUserId: userId,
            polarSeatQuantity: args.subscription.seats,
          }
        : {
            plan: "free" as const,
            status: "inactive" as const,
          }),
    });
    return { organizationId, userId };
  });
  return {
    ...ids,
    t,
    asOwner: t.withIdentity({
      subject: `${ids.userId}|billing-session`,
      tokenIdentifier: `test:${ids.userId}`,
    }),
  };
}

function createPolarBoundary(userId: Id<"users">) {
  const createCheckout = vi.fn(async (input) => ({
    id: "checkout-1",
    url: "https://sandbox.polar.sh/checkout/checkout-1",
    externalCustomerId: input.externalCustomerId,
    metadata: input.metadata,
    products: [{ id: input.products[0] }],
    seats: input.seats,
    successUrl: input.successUrl,
    returnUrl: input.returnUrl,
    status: "open",
    expiresAt: new Date(Date.now() + 60_000),
  }));
  const getCheckout = vi.fn(async () => {
    const createdCheckout = createCheckout.mock.results.at(-1);
    if (createdCheckout?.type !== "return") {
      throw new Error("No checkout was created for this test.");
    }
    return await createdCheckout.value;
  });
  const updateSubscription = vi.fn();
  const polar = {
    customers: {
      getExternal: vi.fn(async ({ externalId }: { externalId: string }) => ({
        id: "customer-1",
        type: "team",
        externalId,
        deletedAt: null,
      })),
      members: {
        getExternal: vi.fn(async () => ({
          customerId: "customer-1",
          externalId: userId,
          role: "owner",
        })),
      },
    },
    checkouts: { create: createCheckout, get: getCheckout },
    subscriptions: { update: updateSubscription },
  };
  polarMocks.createPolarClient.mockReturnValue(polar);
  return { createCheckout, getCheckout, updateSubscription };
}

describe("Polar billing changes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CONVEX_AGENT_MODE", "");
    vi.stubEnv("CONVEX_DEPLOYMENT", "local:test");
  });

  afterEach(() => vi.unstubAllEnvs());

  for (const githubOwnerType of ["user", "organization"] as const) {
    it(`starts ${githubOwnerType} Pro with the shared product and two seats`, async () => {
      const seed = await seedBillingOrganization({ githubOwnerType });
      const { createCheckout } = createPolarBoundary(seed.userId);
      polarMocks.reconcilePolarCustomerBilling.mockImplementation(
        async (_ctx, args: { externalCustomerId: string }) => ({
          status: "inactive",
          plan: "free",
          externalCustomerId: args.externalCustomerId,
        }),
      );

      await expect(
        seed.asOwner.action(api.billing.requestPolarBillingChange, {
          organizationId: seed.organizationId,
          change: { kind: "upgrade_to_pro" },
          successUrl,
          returnUrl,
        }),
      ).resolves.toEqual({
        state: "checkout",
        url: "https://sandbox.polar.sh/checkout/checkout-1",
      });

      expect(createCheckout).toHaveBeenCalledWith(
        expect.objectContaining({
          products: ["0e721c02-c98b-425b-bc8d-fb323fa54925"],
          seats: 2,
          minSeats: 2,
          maxSeats: 2,
          metadata: expect.objectContaining({
            source: "samebase_organization",
            seat_quantity: 2,
          }),
        }),
      );
      expect(createCheckout.mock.calls[0]?.[0].metadata).not.toHaveProperty("plan");
    });
  }

  it("resumes an open checkout after a member is removed", async () => {
    const seed = await seedBillingOrganization({
      githubOwnerType: "organization",
      memberCount: 3,
    });
    const { createCheckout, getCheckout } = createPolarBoundary(seed.userId);
    polarMocks.reconcilePolarCustomerBilling.mockImplementation(
      async (_ctx, args: { externalCustomerId: string }) => ({
        status: "inactive",
        plan: "free",
        externalCustomerId: args.externalCustomerId,
      }),
    );

    await seed.asOwner.action(api.billing.requestPolarBillingChange, {
      organizationId: seed.organizationId,
      change: { kind: "upgrade_to_pro" },
      successUrl,
      returnUrl,
    });
    await seed.t.run(async (ctx) => {
      const memberships = await ctx.db
        .query("organizationMemberships")
        .withIndex("by_organization_and_user", (query) =>
          query.eq("organizationId", seed.organizationId),
        )
        .take(3);
      const removedMembership = memberships.find((membership) => membership.userId !== seed.userId);
      if (!removedMembership) {
        throw new Error("Member not found.");
      }
      await ctx.db.delete(removedMembership._id);
    });

    await expect(
      seed.asOwner.action(api.billing.requestPolarBillingChange, {
        organizationId: seed.organizationId,
        change: { kind: "upgrade_to_pro" },
        successUrl,
        returnUrl,
      }),
    ).resolves.toEqual({
      state: "checkout",
      url: "https://sandbox.polar.sh/checkout/checkout-1",
    });

    expect(getCheckout).toHaveBeenCalledWith({ id: "checkout-1" });
    expect(createCheckout).toHaveBeenCalledTimes(1);
    expect(createCheckout).toHaveBeenCalledWith(expect.objectContaining({ seats: 3 }));
  });

  it("requires Pro before a Free organization can buy another member seat", async () => {
    const seed = await seedBillingOrganization({ githubOwnerType: "organization" });
    const { createCheckout } = createPolarBoundary(seed.userId);
    polarMocks.reconcilePolarCustomerBilling.mockImplementation(
      async (_ctx, args: { externalCustomerId: string }) => ({
        status: "inactive",
        plan: "free",
        externalCustomerId: args.externalCustomerId,
      }),
    );

    await expect(
      seed.asOwner.action(api.billing.requestPolarBillingChange, {
        organizationId: seed.organizationId,
        change: { kind: "add_member_seat", expectedSeatQuantity: 2 },
        successUrl,
        returnUrl,
      }),
    ).rejects.toThrow("Upgrade to Pro before adding member seats.");
    expect(createCheckout).not.toHaveBeenCalled();
    expect(polarMocks.createPolarClient).not.toHaveBeenCalled();
    const billingAccount = await seed.t.run(async (ctx) => {
      return await ctx.db
        .query("organizationBillingAccounts")
        .withIndex("by_organization", (query) => query.eq("organizationId", seed.organizationId))
        .unique();
    });
    expect(billingAccount).not.toHaveProperty("polarBillingUserId");
    expect(billingAccount).not.toHaveProperty("polarExternalCustomerId");
  });

  it("adds exactly one Pro seat once when more member capacity is needed", async () => {
    const seed = await seedBillingOrganization({
      githubOwnerType: "organization",
      memberCount: 4,
      subscription: { seats: 2 },
    });
    const { updateSubscription } = createPolarBoundary(seed.userId);
    let providerSeats = 2;
    updateSubscription.mockImplementation(async (input) => {
      providerSeats = input.subscriptionUpdate.seats;
      return null;
    });
    polarMocks.reconcilePolarCustomerBilling.mockImplementation(
      async (_ctx, args: { externalCustomerId: string }) => ({
        status: "active",
        plan: "pro",
        externalCustomerId: args.externalCustomerId,
        subscriptionId: "subscription-1",
        polarSeatQuantity: providerSeats,
        currentPeriodEndAt: 10_000,
        cancelAtPeriodEnd: false,
      }),
    );

    await expect(
      seed.asOwner.action(api.billing.requestPolarBillingChange, {
        organizationId: seed.organizationId,
        change: { kind: "add_member_seat", expectedSeatQuantity: 2 },
        successUrl,
        returnUrl,
      }),
    ).resolves.toEqual({ state: "updated" });
    await expect(
      seed.asOwner.action(api.billing.requestPolarBillingChange, {
        organizationId: seed.organizationId,
        change: { kind: "add_member_seat", expectedSeatQuantity: 2 },
        successUrl,
        returnUrl,
      }),
    ).resolves.toEqual({ state: "updated" });

    expect(updateSubscription).toHaveBeenCalledWith({
      id: "subscription-1",
      subscriptionUpdate: { seats: 3, prorationBehavior: "invoice" },
    });
    expect(updateSubscription).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid return URLs before assigning the billing payer", async () => {
    const seed = await seedBillingOrganization({ githubOwnerType: "user" });

    await expect(
      seed.asOwner.action(api.billing.requestPolarBillingChange, {
        organizationId: seed.organizationId,
        change: { kind: "upgrade_to_pro" },
        successUrl: "https://example.invalid/success",
        returnUrl: "https://example.invalid/cancel",
      }),
    ).rejects.toThrow("Checkout return URLs must target this organization settings page.");
    expect(polarMocks.createPolarClient).not.toHaveBeenCalled();
    const billingAccount = await seed.t.run(async (ctx) => {
      return await ctx.db
        .query("organizationBillingAccounts")
        .withIndex("by_organization", (query) => query.eq("organizationId", seed.organizationId))
        .unique();
    });
    expect(billingAccount).not.toHaveProperty("polarBillingUserId");
    expect(billingAccount).not.toHaveProperty("polarExternalCustomerId");
  });

  it("removes one unused member seat once when the completed request is repeated", async () => {
    const seed = await seedBillingOrganization({
      githubOwnerType: "organization",
      memberCount: 2,
      subscription: { seats: 3 },
    });
    const { updateSubscription } = createPolarBoundary(seed.userId);
    let providerSeats = 3;
    updateSubscription.mockImplementation(async (input) => {
      providerSeats = input.subscriptionUpdate.seats;
      return null;
    });
    polarMocks.reconcilePolarCustomerBilling.mockImplementation(
      async (_ctx, args: { externalCustomerId: string }) => ({
        status: "active",
        plan: "pro",
        externalCustomerId: args.externalCustomerId,
        subscriptionId: "subscription-1",
        polarSeatQuantity: providerSeats,
        currentPeriodEndAt: 10_000,
        cancelAtPeriodEnd: false,
      }),
    );

    await expect(
      seed.asOwner.action(api.billing.requestPolarBillingChange, {
        organizationId: seed.organizationId,
        change: { kind: "remove_member_seat", expectedSeatQuantity: 3 },
        successUrl,
        returnUrl,
      }),
    ).resolves.toEqual({ state: "updated" });
    await expect(
      seed.asOwner.action(api.billing.requestPolarBillingChange, {
        organizationId: seed.organizationId,
        change: { kind: "remove_member_seat", expectedSeatQuantity: 3 },
        successUrl,
        returnUrl,
      }),
    ).resolves.toEqual({ state: "updated" });

    expect(updateSubscription).toHaveBeenCalledWith({
      id: "subscription-1",
      subscriptionUpdate: { seats: 2, prorationBehavior: "prorate" },
    });
    expect(updateSubscription).toHaveBeenCalledTimes(1);
  });

  it("rejects a stale seat quantity without changing Polar", async () => {
    const seed = await seedBillingOrganization({
      githubOwnerType: "organization",
      memberCount: 2,
      subscription: { seats: 4 },
    });
    const { updateSubscription } = createPolarBoundary(seed.userId);
    polarMocks.reconcilePolarCustomerBilling.mockImplementation(
      async (_ctx, args: { externalCustomerId: string }) => ({
        status: "active",
        plan: "pro",
        externalCustomerId: args.externalCustomerId,
        subscriptionId: "subscription-1",
        polarSeatQuantity: 4,
        currentPeriodEndAt: 10_000,
        cancelAtPeriodEnd: false,
      }),
    );

    await expect(
      seed.asOwner.action(api.billing.requestPolarBillingChange, {
        organizationId: seed.organizationId,
        change: { kind: "add_member_seat", expectedSeatQuantity: 2 },
        successUrl,
        returnUrl,
      }),
    ).rejects.toThrow("Member seat quantity changed. Refresh this page and try again.");

    expect(updateSubscription).not.toHaveBeenCalled();
  });

  it("keeps concurrent duplicate seat requests on one billed seat transition", async () => {
    const seed = await seedBillingOrganization({
      githubOwnerType: "organization",
      memberCount: 2,
      subscription: { seats: 2 },
    });
    const { updateSubscription } = createPolarBoundary(seed.userId);
    let providerSeats = 2;
    let billedSeatTransitions = 0;
    const initialReadWaiters = new Array<() => void>();
    const waitForBothInitialReads = async () => {
      await new Promise<void>((resolve) => {
        initialReadWaiters.push(resolve);
        if (initialReadWaiters.length === 2) {
          for (const release of initialReadWaiters) {
            release();
          }
        }
      });
    };
    updateSubscription.mockImplementation(async (input) => {
      if (providerSeats !== input.subscriptionUpdate.seats) {
        providerSeats = input.subscriptionUpdate.seats;
        billedSeatTransitions += 1;
      }
      return null;
    });
    polarMocks.reconcilePolarCustomerBilling.mockImplementation(
      async (_ctx, args: { externalCustomerId: string }) => {
        if (providerSeats === 2 && initialReadWaiters.length < 2) {
          await waitForBothInitialReads();
          return {
            status: "active",
            plan: "pro",
            externalCustomerId: args.externalCustomerId,
            subscriptionId: "subscription-1",
            polarSeatQuantity: 2,
            currentPeriodEndAt: 10_000,
            cancelAtPeriodEnd: false,
          };
        }
        return {
          status: "active",
          plan: "pro",
          externalCustomerId: args.externalCustomerId,
          subscriptionId: "subscription-1",
          polarSeatQuantity: providerSeats,
          currentPeriodEndAt: 10_000,
          cancelAtPeriodEnd: false,
        };
      },
    );

    await expect(
      Promise.all([
        seed.asOwner.action(api.billing.requestPolarBillingChange, {
          organizationId: seed.organizationId,
          change: { kind: "add_member_seat", expectedSeatQuantity: 2 },
          successUrl,
          returnUrl,
        }),
        seed.asOwner.action(api.billing.requestPolarBillingChange, {
          organizationId: seed.organizationId,
          change: { kind: "add_member_seat", expectedSeatQuantity: 2 },
          successUrl,
          returnUrl,
        }),
      ]),
    ).resolves.toEqual([{ state: "updated" }, { state: "updated" }]);

    expect(updateSubscription).toHaveBeenCalledTimes(2);
    for (const [input] of updateSubscription.mock.calls) {
      expect(input).toMatchObject({ subscriptionUpdate: { seats: 3 } });
    }
    expect(providerSeats).toBe(3);
    expect(billedSeatTransitions).toBe(1);
  });

  it("rejects seat changes from members and owners who are not the billing payer", async () => {
    const seed = await seedBillingOrganization({
      githubOwnerType: "organization",
      memberCount: 1,
      subscription: { seats: 2 },
    });
    const identities = await seed.t.run(async (ctx) => {
      const memberUserId = await ctx.db.insert("users", {
        state: "active",
        email: "member@example.invalid",
        isApproved: true,
        termsVersion: "2026-08-12",
        termsAcceptedAt: 1,
      });
      const otherOwnerUserId = await ctx.db.insert("users", {
        state: "active",
        email: "other-owner@example.invalid",
        isApproved: true,
        termsVersion: "2026-08-12",
        termsAcceptedAt: 1,
      });
      await ctx.db.insert("organizationMemberships", {
        organizationId: seed.organizationId,
        userId: memberUserId,
        role: "member",
      });
      await ctx.db.insert("organizationMemberships", {
        organizationId: seed.organizationId,
        userId: otherOwnerUserId,
        role: "owner",
      });
      return { memberUserId, otherOwnerUserId };
    });
    const asMember = seed.t.withIdentity({
      subject: `${identities.memberUserId}|member-session`,
      tokenIdentifier: `test:${identities.memberUserId}`,
    });
    const asOtherOwner = seed.t.withIdentity({
      subject: `${identities.otherOwnerUserId}|other-owner-session`,
      tokenIdentifier: `test:${identities.otherOwnerUserId}`,
    });

    await expect(
      asMember.action(api.billing.requestPolarBillingChange, {
        organizationId: seed.organizationId,
        change: { kind: "add_member_seat", expectedSeatQuantity: 2 },
        successUrl,
        returnUrl,
      }),
    ).rejects.toThrow("Organization owner access is required.");
    await expect(
      asOtherOwner.action(api.billing.requestPolarBillingChange, {
        organizationId: seed.organizationId,
        change: { kind: "add_member_seat", expectedSeatQuantity: 2 },
        successUrl,
        returnUrl,
      }),
    ).rejects.toThrow("Only the designated billing payer can manage this subscription.");

    expect(polarMocks.createPolarClient).not.toHaveBeenCalled();
  });

  it("rejects preview billing changes before assigning a payer or accessing Polar", async () => {
    vi.stubEnv("CONVEX_DEPLOYMENT", "preview:test");
    const seed = await seedBillingOrganization({ githubOwnerType: "organization" });

    await expect(
      seed.asOwner.action(api.billing.requestPolarBillingChange, {
        organizationId: seed.organizationId,
        change: { kind: "upgrade_to_pro" },
        successUrl,
        returnUrl,
      }),
    ).rejects.toThrow("Polar billing is unavailable in pull request previews.");

    expect(polarMocks.createPolarClient).not.toHaveBeenCalled();
    const billingAccount = await seed.t.run(async (ctx) => {
      return await ctx.db
        .query("organizationBillingAccounts")
        .withIndex("by_organization", (query) => query.eq("organizationId", seed.organizationId))
        .unique();
    });
    expect(billingAccount).not.toHaveProperty("polarBillingUserId");
    expect(billingAccount).not.toHaveProperty("polarExternalCustomerId");
  });

  it("does not remove member capacity that is in use", async () => {
    const seed = await seedBillingOrganization({
      githubOwnerType: "organization",
      memberCount: 2,
      subscription: { seats: 2 },
    });
    const { updateSubscription } = createPolarBoundary(seed.userId);
    polarMocks.reconcilePolarCustomerBilling.mockImplementation(
      async (_ctx, args: { externalCustomerId: string }) => ({
        status: "active",
        plan: "pro",
        externalCustomerId: args.externalCustomerId,
        subscriptionId: "subscription-1",
        polarSeatQuantity: 2,
        currentPeriodEndAt: 10_000,
        cancelAtPeriodEnd: false,
      }),
    );

    await expect(
      seed.asOwner.action(api.billing.requestPolarBillingChange, {
        organizationId: seed.organizationId,
        change: { kind: "remove_member_seat", expectedSeatQuantity: 2 },
        successUrl,
        returnUrl,
      }),
    ).rejects.toThrow("This organization has no unused member seat.");

    expect(updateSubscription).not.toHaveBeenCalled();
  });

  it("schedules Pro cancellation without changing products", async () => {
    const seed = await seedBillingOrganization({
      githubOwnerType: "organization",
      subscription: { seats: 2 },
    });
    const { updateSubscription } = createPolarBoundary(seed.userId);
    let cancelAtPeriodEnd = false;
    updateSubscription.mockImplementation(async () => {
      cancelAtPeriodEnd = true;
      return {
        id: "subscription-1",
        seats: 2,
        cancelAtPeriodEnd: true,
      };
    });
    polarMocks.reconcilePolarCustomerBilling.mockImplementation(
      async (_ctx, args: { externalCustomerId: string }) => ({
        status: "active",
        plan: "pro",
        externalCustomerId: args.externalCustomerId,
        subscriptionId: "subscription-1",
        polarSeatQuantity: 2,
        currentPeriodEndAt: 10_000,
        cancelAtPeriodEnd,
      }),
    );

    await expect(
      seed.asOwner.action(api.billing.requestPolarBillingChange, {
        organizationId: seed.organizationId,
        change: { kind: "downgrade_to_free" },
        successUrl,
        returnUrl,
      }),
    ).resolves.toEqual({ state: "updated" });

    expect(updateSubscription).toHaveBeenCalledWith({
      id: "subscription-1",
      subscriptionUpdate: { cancelAtPeriodEnd: true },
    });
  });
});
