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
      const billingAccountId = await ctx.db.insert("organizationBillingAccounts", {
        organizationId,
        provider: "polar",
        plan: "free",
        status: "active",
        polarExternalCustomerId: "seat-sync-customer",
        polarBillingUserId: ownerUserId,
        polarSeatQuantity: 2,
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

    let providerSeats = 2;
    const subscriptionUpdates: SeatUpdate[] = [];
    const updateSubscription = vi.fn(async (input: SeatUpdate) => {
      subscriptionUpdates.push(input);
      providerSeats = input.subscriptionUpdate.seats;
      if (providerSeats === 1) {
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
          plan: "free",
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
        subscriptionUpdate: { seats: 1, prorationBehavior: "prorate" },
      },
      {
        id: "seat-sync-subscription",
        subscriptionUpdate: { seats: 2, prorationBehavior: "invoice" },
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
    expect(finalState.memberships).toHaveLength(2);
    expect(finalState.billingAccount?.polarSeatQuantity).toBe(2);
  });
});
