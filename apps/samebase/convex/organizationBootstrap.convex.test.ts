import { describe, expect, it } from "vite-plus/test";

import { internal } from "./_generated/api";
import { makeConvexTest } from "./test.setup";

describe("organization ownership bootstrap", () => {
  it("creates one shared operator organization and one organization for every other user", async () => {
    const t = makeConvexTest();
    const ids = await t.run(async (ctx) => {
      const operatorUserIdA = await ctx.db.insert("users", {
        email: "operator-a@example.test",
      });
      const operatorUserIdB = await ctx.db.insert("users", {
        email: "operator-b@example.test",
      });
      const waitlistUserId = await ctx.db.insert("users", {
        email: "waitlist@example.test",
        isApproved: false,
      });
      return { operatorUserIdA, operatorUserIdB, waitlistUserId };
    });

    await expect(
      t.mutation(internal.organizationBootstrap.bootstrapOrganizationOwnership, {
        operatorUserIdA: ids.operatorUserIdA,
        operatorUserIdB: ids.operatorUserIdB,
        operatorOrganizationName: "Samebase",
        operatorBilling: {
          provider: "polar",
          plan: "pro",
          status: "active",
          updatedAt: 10,
          currentPeriodEndAt: 20,
          cancelAtPeriodEnd: false,
          polarExternalCustomerId: "operator-customer",
          polarStateChangedAt: 30,
          polarObservationRevision: 4,
          polarAppliedObservationRevision: 3,
        },
      }),
    ).resolves.toEqual({
      users: 3,
      organizations: 2,
      memberships: 3,
      billingAccounts: 2,
    });

    const graph = await t.run(async (ctx) => {
      const memberships = await ctx.db.query("organizationMemberships").take(4);
      const operatorMembershipA = memberships.find(
        (membership) => membership.userId === ids.operatorUserIdA,
      );
      const operatorMembershipB = memberships.find(
        (membership) => membership.userId === ids.operatorUserIdB,
      );
      const waitlistMembership = memberships.find(
        (membership) => membership.userId === ids.waitlistUserId,
      );
      if (
        operatorMembershipA === undefined ||
        operatorMembershipB === undefined ||
        waitlistMembership === undefined
      ) {
        throw new Error("Expected one membership for each retained user.");
      }
      const billingAccounts = await ctx.db.query("organizationBillingAccounts").take(3);
      return {
        organizations: await ctx.db.query("organizations").take(3),
        memberships,
        operatorMembershipA,
        operatorMembershipB,
        waitlistMembership,
        operatorBilling: billingAccounts.find(
          (account) => account.organizationId === operatorMembershipA.organizationId,
        ),
        waitlistBilling: billingAccounts.find(
          (account) => account.organizationId === waitlistMembership.organizationId,
        ),
      };
    });

    expect(graph.organizations).toHaveLength(2);
    expect(graph.memberships).toHaveLength(3);
    expect(graph.operatorMembershipA.organizationId).toBe(graph.operatorMembershipB.organizationId);
    expect(graph.waitlistMembership.organizationId).not.toBe(
      graph.operatorMembershipA.organizationId,
    );
    expect(graph.operatorBilling).toMatchObject({
      provider: "polar",
      plan: "pro",
      status: "active",
      polarExternalCustomerId: "operator-customer",
    });
    expect(graph.waitlistBilling).toMatchObject({ plan: "free", status: "inactive" });
  });

  it("accepts a coherent Free Polar billing state", async () => {
    const t = makeConvexTest();
    const ids = await t.run(async (ctx) => ({
      operatorUserIdA: await ctx.db.insert("users", {
        email: "free-operator-a@example.test",
      }),
      operatorUserIdB: await ctx.db.insert("users", {
        email: "free-operator-b@example.test",
      }),
    }));

    await expect(
      t.mutation(internal.organizationBootstrap.bootstrapOrganizationOwnership, {
        operatorUserIdA: ids.operatorUserIdA,
        operatorUserIdB: ids.operatorUserIdB,
        operatorOrganizationName: "Samebase",
        operatorBilling: {
          provider: "polar",
          plan: "free",
          status: "inactive",
          updatedAt: 10,
          polarExternalCustomerId: "free-operator-customer",
          polarObservationRevision: 4,
          polarAppliedObservationRevision: 4,
        },
      }),
    ).resolves.toEqual({ users: 2, organizations: 1, memberships: 2, billingAccounts: 1 });

    await expect(
      t.run(async (ctx) => await ctx.db.query("organizationBillingAccounts").unique()),
    ).resolves.toMatchObject({
      provider: "polar",
      plan: "free",
      status: "inactive",
      polarExternalCustomerId: "free-operator-customer",
    });
  });

  it("rejects an unresolved operator checkout attempt before it writes", async () => {
    const t = makeConvexTest();
    const ids = await t.run(async (ctx) => ({
      operatorUserIdA: await ctx.db.insert("users", {
        email: "checkout-operator-a@example.test",
      }),
      operatorUserIdB: await ctx.db.insert("users", {
        email: "checkout-operator-b@example.test",
      }),
    }));

    await expect(
      t.mutation(internal.organizationBootstrap.bootstrapOrganizationOwnership, {
        operatorUserIdA: ids.operatorUserIdA,
        operatorUserIdB: ids.operatorUserIdB,
        operatorOrganizationName: "Samebase",
        operatorBilling: {
          plan: "free",
          status: "inactive",
          polarCheckoutAttempt: {
            state: "pending",
            attemptId: "operator-attempt",
          },
        },
      }),
    ).rejects.toThrow("Organization bootstrap requires checkout attempts to be resolved.");

    await expect(
      t.run(async (ctx) => ({
        organizations: await ctx.db.query("organizations").take(1),
        memberships: await ctx.db.query("organizationMemberships").take(1),
        billingAccounts: await ctx.db.query("organizationBillingAccounts").take(1),
      })),
    ).resolves.toEqual({ organizations: [], memberships: [], billingAccounts: [] });
  });

  it("rejects a nonempty organization graph before it writes", async () => {
    const t = makeConvexTest();
    const ids = await t.run(async (ctx) => ({
      operatorUserIdA: await ctx.db.insert("users", {
        email: "dirty-operator-a@example.test",
      }),
      operatorUserIdB: await ctx.db.insert("users", {
        email: "dirty-operator-b@example.test",
      }),
      organizationId: await ctx.db.insert("organizations", { name: "Existing" }),
    }));

    await expect(
      t.mutation(internal.organizationBootstrap.bootstrapOrganizationOwnership, {
        operatorUserIdA: ids.operatorUserIdA,
        operatorUserIdB: ids.operatorUserIdB,
        operatorOrganizationName: "Samebase",
        operatorBilling: { plan: "free", status: "inactive" },
      }),
    ).rejects.toThrow("Organization bootstrap requires empty organization tables.");

    await expect(
      t.run(async (ctx) => ({
        organizations: await ctx.db.query("organizations").take(2),
        memberships: await ctx.db.query("organizationMemberships").take(1),
        billingAccounts: await ctx.db.query("organizationBillingAccounts").take(1),
      })),
    ).resolves.toEqual({
      organizations: [expect.objectContaining({ _id: ids.organizationId })],
      memberships: [],
      billingAccounts: [],
    });
  });

  it("requires both operator IDs to refer to retained users", async () => {
    const t = makeConvexTest();
    const ids = await t.run(async (ctx) => {
      const operatorUserIdA = await ctx.db.insert("users", {
        email: "retained-operator@example.test",
      });
      const removedOperatorUserId = await ctx.db.insert("users", {
        email: "removed-operator@example.test",
      });
      await ctx.db.delete(removedOperatorUserId);
      return { operatorUserIdA, removedOperatorUserId };
    });

    await expect(
      t.mutation(internal.organizationBootstrap.bootstrapOrganizationOwnership, {
        operatorUserIdA: ids.operatorUserIdA,
        operatorUserIdB: ids.removedOperatorUserId,
        operatorOrganizationName: "Samebase",
        operatorBilling: { plan: "free", status: "inactive" },
      }),
    ).rejects.toThrow("Organization bootstrap operator users must exist.");

    await expect(
      t.run(async (ctx) => await ctx.db.query("organizations").take(1)),
    ).resolves.toEqual([]);
  });
});
