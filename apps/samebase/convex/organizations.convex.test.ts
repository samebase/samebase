import { describe, expect, it } from "vite-plus/test";
import { internal } from "./_generated/api";
import { ensureOrganizationForUser, requireSingleOrganizationIdForUser } from "./organizations";
import { makeConvexTest } from "./test.setup";

describe("organization provisioning", () => {
  it("creates an organization graph for a waitlisted user", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "waitlisted@example.com",
        isApproved: false,
      });
    });

    await t.run(async (ctx) => {
      await ensureOrganizationForUser(ctx.db, userId);
    });

    const snapshot = await t.run(async (ctx) => {
      const membership = await ctx.db
        .query("organizationMemberships")
        .withIndex("by_user", (query) => query.eq("userId", userId))
        .unique();
      if (membership === null) {
        return null;
      }
      return {
        organization: await ctx.db.get(membership.organizationId),
        membership,
        billingAccount: await ctx.db
          .query("organizationBillingAccounts")
          .withIndex("by_organization", (query) =>
            query.eq("organizationId", membership.organizationId),
          )
          .unique(),
      };
    });

    expect(snapshot).toMatchObject({
      organization: expect.objectContaining({}),
      membership: { userId },
      billingAccount: {
        plan: "free",
        status: "inactive",
      },
    });
  });

  it("does not create duplicate memberships or billing accounts", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "idempotent@example.com",
      });
    });

    await t.run(async (ctx) => {
      await ensureOrganizationForUser(ctx.db, userId);
    });
    await t.run(async (ctx) => {
      await ensureOrganizationForUser(ctx.db, userId);
    });

    const snapshot = await t.run(async (ctx) => {
      return {
        organizations: await ctx.db.query("organizations").take(2),
        memberships: await ctx.db
          .query("organizationMemberships")
          .withIndex("by_user", (query) => query.eq("userId", userId))
          .take(2),
        billingAccounts: await ctx.db.query("organizationBillingAccounts").take(2),
      };
    });

    expect(snapshot.organizations).toHaveLength(1);
    expect(snapshot.memberships).toHaveLength(1);
    expect(snapshot.billingAccounts).toHaveLength(1);
  });

  it("requires one membership when resolving a user's organization", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "missing-membership@example.com",
      });
    });

    await expect(
      t.run(async (ctx) => await requireSingleOrganizationIdForUser(ctx.db, userId)),
    ).rejects.toThrowError("Organization membership is required.");
  });

  it("provisions a new admin-created user through the auth callback", async () => {
    const t = makeConvexTest();

    await t.action(internal.authAdmin.createOrUpdatePasswordAccount, {
      email: "admin-created@example.com",
      password: "valid-password",
    });

    const snapshot = await t.run(async (ctx) => {
      const user = await ctx.db
        .query("users")
        .withIndex("email", (query) => query.eq("email", "admin-created@example.com"))
        .unique();
      if (user === null) {
        return null;
      }
      const membership = await ctx.db
        .query("organizationMemberships")
        .withIndex("by_user", (query) => query.eq("userId", user._id))
        .unique();
      if (membership === null) {
        return { user, membership, billingAccount: null };
      }
      return {
        user,
        membership,
        billingAccount: await ctx.db
          .query("organizationBillingAccounts")
          .withIndex("by_organization", (query) =>
            query.eq("organizationId", membership.organizationId),
          )
          .unique(),
      };
    });

    expect(snapshot).toMatchObject({
      user: { isApproved: true },
      membership: expect.objectContaining({}),
      billingAccount: {
        plan: "free",
        status: "inactive",
      },
    });
  });

  it("leaves an existing linked user for the explicit backfill", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "existing@example.com",
        emailVerificationTime: 1,
      });
    });

    await t.action(internal.authAdmin.createOrUpdatePasswordAccount, {
      email: "existing@example.com",
      password: "valid-password",
    });

    const snapshot = await t.run(async (ctx) => {
      return {
        membership: await ctx.db
          .query("organizationMemberships")
          .withIndex("by_user", (query) => query.eq("userId", userId))
          .unique(),
        organizations: await ctx.db.query("organizations").take(1),
        billingAccounts: await ctx.db.query("organizationBillingAccounts").take(1),
      };
    });

    expect(snapshot.membership).toBeNull();
    expect(snapshot.organizations).toEqual([]);
    expect(snapshot.billingAccounts).toEqual([]);
  });
});
