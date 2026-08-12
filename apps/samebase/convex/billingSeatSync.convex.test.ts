import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

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

import { api, internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import { makeConvexTest } from "./test.setup";

type ReconciliationCtx = Pick<ActionCtx, "runMutation">;
type SeatUpdate = {
  id: string;
  subscriptionUpdate: {
    seats: number;
    prorationBehavior: "invoice" | "prorate";
  };
};

describe("Polar member-seat synchronization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("restores a seat consumed while a member-removal reduction is in flight", async () => {
    const t = makeConvexTest();
    const invitationCode = "a".repeat(64);
    const setup = await t.run(async (ctx) => {
      const ownerUserId = await ctx.db.insert("users", {
        state: "active",
        email: "seat-sync-owner@example.invalid",
        isApproved: true,
      });
      const inviteeUserId = await ctx.db.insert("users", {
        state: "active",
        email: "seat-sync-invitee@example.invalid",
        isApproved: true,
      });
      const memberUserId = await ctx.db.insert("users", {
        state: "active",
        email: "seat-sync-member@example.invalid",
        isApproved: true,
      });
      await ctx.db.insert("authAccounts", {
        userId: inviteeUserId,
        provider: "github",
        providerAccountId: "seat-sync-invitee",
        githubLogin: "seat-sync-invitee",
      });
      const organizationId = await ctx.db.insert("organizations", {
        githubOwnerId: "seat-sync-owner",
        githubOwnerType: "user",
        githubOwnerLogin: "seat-sync-owner",
        githubOwnerLoginNormalized: "seat-sync-owner",
        githubInstallationId: "seat-sync-installation",
      });
      await ctx.db.insert("organizationMemberships", {
        organizationId,
        userId: ownerUserId,
        role: "owner",
      });
      await ctx.db.insert("organizationMemberships", {
        organizationId,
        userId: memberUserId,
        role: "member",
      });
      const billingAccountId = await ctx.db.insert("organizationBillingAccounts", {
        organizationId,
        provider: "polar",
        plan: "pro",
        status: "active",
        polarExternalCustomerId: "seat-sync-customer",
        polarBillingUserId: ownerUserId,
        polarSeatQuantity: 3,
      });
      await ctx.db.insert("organizationInvitations", {
        state: "pending",
        organizationId,
        githubAccountId: "seat-sync-invitee",
        githubLogin: "seat-sync-invitee",
        code: invitationCode,
        createdByUserId: ownerUserId,
        createdAt: Date.now(),
        expiresAt: Date.now() + 60_000,
      });
      return { billingAccountId, inviteeUserId, organizationId };
    });
    const asInvitee = t.withIdentity({
      subject: `${setup.inviteeUserId}|seat-sync-session`,
      tokenIdentifier: `test:${setup.inviteeUserId}`,
    });

    let providerSeats = 3;
    const subscriptionUpdates: SeatUpdate[] = [];
    const updateSubscription = vi.fn(async (input: SeatUpdate) => {
      subscriptionUpdates.push(input);
      providerSeats = input.subscriptionUpdate.seats;
      if (providerSeats === 2) {
        await asInvitee.mutation(api.organizationMembers.acceptInvitation, {
          code: invitationCode,
        });
      }
      return null;
    });
    polarMocks.createPolarClient.mockReturnValue({
      subscriptions: { update: updateSubscription },
    });
    polarMocks.reconcilePolarCustomerBilling.mockImplementation(
      async (ctx: ReconciliationCtx, args: { externalCustomerId: string }) => {
        const target = await ctx.runMutation(internal.polarBillingState.beginObservation, {
          externalCustomerId: args.externalCustomerId,
        });
        if (target === null) {
          return null;
        }
        const state = {
          status: "active",
          plan: "pro",
          externalCustomerId: args.externalCustomerId,
          subscriptionId: "seat-sync-subscription",
          polarSeatQuantity: providerSeats,
          currentPeriodEndAt: 10_000,
          cancelAtPeriodEnd: false,
        } as const;
        const applied = await ctx.runMutation(internal.polarBillingState.applyObservation, {
          state,
          observationRevision: target.observationRevision,
        });
        return applied ? state : null;
      },
    );

    await expect(
      t.action(internal.billing.syncPolarSubscriptionSeats, {
        organizationId: setup.organizationId,
      }),
    ).resolves.toBeNull();

    expect(subscriptionUpdates).toEqual([
      {
        id: "seat-sync-subscription",
        subscriptionUpdate: { seats: 2, prorationBehavior: "prorate" },
      },
      {
        id: "seat-sync-subscription",
        subscriptionUpdate: { seats: 3, prorationBehavior: "invoice" },
      },
    ]);
    const finalState = await t.run(async (ctx) => {
      return {
        billingAccount: await ctx.db.get(setup.billingAccountId),
        memberships: await ctx.db
          .query("organizationMemberships")
          .withIndex("by_organization_and_user", (query) =>
            query.eq("organizationId", setup.organizationId),
          )
          .take(3),
      };
    });
    expect(finalState.memberships).toHaveLength(3);
    expect(finalState.billingAccount?.polarSeatQuantity).toBe(3);
  });

  it("does not change seats after cancellation is scheduled", async () => {
    const t = makeConvexTest();
    const organizationId = await t.run(async (ctx) => {
      const ownerUserId = await ctx.db.insert("users", {
        state: "active",
        email: "canceling-seat-owner@example.invalid",
        isApproved: true,
      });
      const organizationId = await ctx.db.insert("organizations", {
        githubOwnerId: "canceling-seat-owner",
        githubOwnerType: "user",
        githubOwnerLogin: "canceling-seat-owner",
        githubOwnerLoginNormalized: "canceling-seat-owner",
        githubInstallationId: "canceling-seat-installation",
      });
      await ctx.db.insert("organizationMemberships", {
        organizationId,
        userId: ownerUserId,
        role: "owner",
      });
      await ctx.db.insert("organizationBillingAccounts", {
        organizationId,
        provider: "polar",
        plan: "pro",
        status: "active",
        polarExternalCustomerId: "canceling-seat-customer",
        polarBillingUserId: ownerUserId,
        polarSeatQuantity: 3,
        cancelAtPeriodEnd: true,
      });
      return organizationId;
    });
    const updateSubscription = vi.fn();
    polarMocks.createPolarClient.mockReturnValue({
      subscriptions: { update: updateSubscription },
    });
    polarMocks.reconcilePolarCustomerBilling.mockResolvedValue({
      status: "active",
      plan: "pro",
      externalCustomerId: "canceling-seat-customer",
      subscriptionId: "canceling-seat-subscription",
      polarSeatQuantity: 3,
      currentPeriodEndAt: 10_000,
      cancelAtPeriodEnd: true,
    });

    await expect(
      t.action(internal.billing.syncPolarSubscriptionSeats, { organizationId }),
    ).resolves.toBeNull();

    expect(updateSubscription).not.toHaveBeenCalled();
    expect(polarMocks.reconcilePolarCustomerBilling).toHaveBeenCalledTimes(1);
  });
});
