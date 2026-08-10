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
    });
    return { organizationId, userId };
  });

  const makeInitiatorDeleting = async () => {
    await t.run(async (ctx) => {
      const initiatingSessionId = await ctx.db.insert("authSessions", {
        userId: ids.userId,
        expirationTime: 60_000,
      });
      const runId = await ctx.db.insert("workflow_accountDeletion_runs", {
        state: "queued",
        identity: {
          state: "active",
          userId: ids.userId,
          email: "checkout-owner@example.invalid",
        },
        completionCapability: "c".repeat(64),
        currentStep: "request_accepted",
        requestedAt: 1,
        updatedAt: 1,
        initiatingSessionId,
        retryCount: 0,
        outcomes: {
          providerRevocation: { state: "not_started" },
          completionEmail: { state: "not_started" },
        },
        workflow: { state: "not_started" },
      });
      await ctx.db.replace(ids.userId, {
        state: "deleting",
        email: "checkout-owner@example.invalid",
        isApproved: true,
        runId,
        requestedAt: 1,
      });
    });
  };

  return { t, ...ids, makeInitiatorDeleting };
}

describe("organization billing access", () => {
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

  it("clears the matching pending checkout after the initiating owner starts deletion", async () => {
    const seed = await seedCheckoutContinuation();
    const reservation = await seed.t.mutation(internal.polarCheckout.reserveAttempt, {
      userId: seed.userId,
      organizationId: seed.organizationId,
    });
    expect(reservation).toMatchObject({ state: "pending", canCreate: true });

    await seed.makeInitiatorDeleting();

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

  it("records and clears the matching open checkout after the initiating owner starts deletion", async () => {
    const seed = await seedCheckoutContinuation();
    const reservation = await seed.t.mutation(internal.polarCheckout.reserveAttempt, {
      userId: seed.userId,
      organizationId: seed.organizationId,
    });
    expect(reservation).toMatchObject({ state: "pending", canCreate: true });

    await seed.makeInitiatorDeleting();

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
