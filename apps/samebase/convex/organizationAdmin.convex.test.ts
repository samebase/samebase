import { describe, expect, it } from "vite-plus/test";

import { internal } from "./_generated/api";
import { makeConvexTest } from "./test.setup";

describe("organization admin membership", () => {
  it("adds an existing user without changing their existing organization or approval", async () => {
    const t = makeConvexTest();
    const ids = await t.run(async (ctx) => {
      const ownerId = await ctx.db.insert("users", { email: "owner@example.test" });
      const userId = await ctx.db.insert("users", {
        email: "member@example.test",
        isApproved: false,
      });
      const targetOrganizationId = await ctx.db.insert("organizations", { name: "Team" });
      const personalOrganizationId = await ctx.db.insert("organizations", { name: "Personal" });
      await ctx.db.insert("organizationMemberships", {
        organizationId: targetOrganizationId,
        userId: ownerId,
      });
      await ctx.db.insert("organizationMemberships", {
        organizationId: personalOrganizationId,
        userId,
      });
      await ctx.db.insert("organizationBillingAccounts", {
        organizationId: targetOrganizationId,
        plan: "pro",
        status: "active",
      });
      await ctx.db.insert("organizationBillingAccounts", {
        organizationId: personalOrganizationId,
        plan: "free",
        status: "inactive",
      });
      return { personalOrganizationId, targetOrganizationId, userId };
    });

    await expect(
      t.mutation(internal.organizationAdmin.addExistingUserToOrganization, {
        organizationId: ids.targetOrganizationId,
        userEmail: "member@example.test",
      }),
    ).resolves.toMatchObject({ state: "added" });

    const snapshot = await t.run(async (ctx) => ({
      user: await ctx.db.get(ids.userId),
      memberships: await ctx.db
        .query("organizationMemberships")
        .withIndex("by_user", (query) => query.eq("userId", ids.userId))
        .collect(),
      organizations: await ctx.db.query("organizations").collect(),
      billingAccounts: await ctx.db.query("organizationBillingAccounts").collect(),
    }));

    expect(snapshot.user).toMatchObject({ isApproved: false });
    expect(snapshot.memberships.map(({ organizationId }) => organizationId)).toEqual(
      expect.arrayContaining([ids.personalOrganizationId, ids.targetOrganizationId]),
    );
    expect(snapshot.memberships).toHaveLength(2);
    expect(snapshot.organizations).toHaveLength(2);
    expect(snapshot.billingAccounts).toHaveLength(2);
  });

  it("is idempotent for an existing membership", async () => {
    const t = makeConvexTest();
    const ids = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { email: "member@example.test" });
      const organizationId = await ctx.db.insert("organizations", { name: "Team" });
      const membershipId = await ctx.db.insert("organizationMemberships", {
        organizationId,
        userId,
      });
      await ctx.db.insert("organizationBillingAccounts", {
        organizationId,
        plan: "free",
        status: "inactive",
      });
      return { membershipId, organizationId, userId };
    });

    await expect(
      t.mutation(internal.organizationAdmin.addExistingUserToOrganization, {
        organizationId: ids.organizationId,
        userEmail: "member@example.test",
      }),
    ).resolves.toEqual({ state: "already_member", membershipId: ids.membershipId });
    await expect(
      t.run(async (ctx) => await ctx.db.query("organizationMemberships").collect()),
    ).resolves.toHaveLength(1);
  });
});
