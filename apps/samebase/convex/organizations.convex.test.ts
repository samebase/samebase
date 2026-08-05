import { describe, expect, it } from "vite-plus/test";

import { api, internal } from "./_generated/api";
import { makeConvexTest } from "./test.setup";

describe("GitHub-backed organizations", () => {
  it("lets a pending-access user load an empty organization list for Settings", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "pending@example.com",
        isApproved: false,
      });
    });
    const asPendingUser = t.withIdentity({
      subject: `${userId}|pending-session`,
      tokenIdentifier: `test:${userId}`,
    });

    await expect(asPendingUser.query(api.organizations.listForViewer, {})).resolves.toEqual([]);
  });

  it("creates one organization graph and reconnects it without duplicates", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "owner@example.com",
        isApproved: true,
      });
    });

    const created = await t.mutation(internal.organizations.createOrReconnectVerifiedOrganization, {
      userId,
      githubOwnerId: "101",
      githubOwnerType: "organization",
      githubOwnerLogin: "Samebase",
      githubInstallationId: "1001",
    });
    const reconnected = await t.mutation(
      internal.organizations.createOrReconnectVerifiedOrganization,
      {
        userId,
        githubOwnerId: "101",
        githubOwnerType: "organization",
        githubOwnerLogin: "Samebase-Renamed",
        githubInstallationId: "1002",
      },
    );

    expect(created.created).toBe(true);
    expect(reconnected).toEqual({
      organizationId: created.organizationId,
      created: false,
    });

    const snapshot = await t.run(async (ctx) => {
      return {
        organizations: await ctx.db.query("organizations").collect(),
        memberships: await ctx.db.query("organizationMemberships").collect(),
        billingAccounts: await ctx.db.query("organizationBillingAccounts").collect(),
      };
    });

    expect(snapshot.organizations).toHaveLength(1);
    expect(snapshot.organizations[0]).toMatchObject({
      githubOwnerId: "101",
      githubOwnerLogin: "Samebase-Renamed",
      githubOwnerLoginNormalized: "samebase-renamed",
      githubInstallationId: "1002",
    });
    expect(snapshot.memberships).toHaveLength(1);
    expect(snapshot.memberships[0]).toMatchObject({
      organizationId: created.organizationId,
      userId,
      role: "owner",
    });
    expect(snapshot.billingAccounts).toHaveLength(1);
    expect(snapshot.billingAccounts[0]).toMatchObject({
      organizationId: created.organizationId,
      plan: "free",
      status: "inactive",
    });
  });

  it("adds or updates one membership and denies owner work to a member", async () => {
    const t = makeConvexTest();
    const { ownerUserId, secondUserId } = await t.run(async (ctx) => {
      const ownerUserId = await ctx.db.insert("users", {
        email: "owner@example.com",
        isApproved: true,
      });
      const secondUserId = await ctx.db.insert("users", {
        email: "member@example.com",
        isApproved: true,
      });
      return { ownerUserId, secondUserId };
    });
    const created = await t.mutation(internal.organizations.createOrReconnectVerifiedOrganization, {
      userId: ownerUserId,
      githubOwnerId: "101",
      githubOwnerType: "user",
      githubOwnerLogin: "owner",
      githubInstallationId: "1001",
    });

    await expect(
      t.mutation(internal.organizations.createOrReconnectVerifiedOrganization, {
        userId: secondUserId,
        githubOwnerId: "101",
        githubOwnerType: "user",
        githubOwnerLogin: "owner",
        githubInstallationId: "1002",
      }),
    ).rejects.toThrowError("Organization membership is required.");

    const added = await t.mutation(internal.organizationAdmin.addExistingUserToOrganization, {
      organizationId: created.organizationId,
      role: "member",
      userEmail: "MEMBER@example.com",
    });
    const repeated = await t.mutation(internal.organizationAdmin.addExistingUserToOrganization, {
      organizationId: created.organizationId,
      role: "member",
      userEmail: "member@example.com",
    });

    expect(added.state).toBe("added");
    expect(repeated).toEqual({
      state: "already_member",
      membershipId: added.membershipId,
    });
    const memberships = await t.run(async (ctx) => {
      return await ctx.db
        .query("organizationMemberships")
        .withIndex("by_organization_and_user", (query) =>
          query.eq("organizationId", created.organizationId).eq("userId", secondUserId),
        )
        .collect();
    });
    expect(memberships).toHaveLength(1);
    expect(memberships[0]?.role).toBe("member");
    await expect(
      t.mutation(internal.organizations.createOrReconnectVerifiedOrganization, {
        userId: secondUserId,
        githubOwnerId: "101",
        githubOwnerType: "user",
        githubOwnerLogin: "owner",
        githubInstallationId: "1002",
      }),
    ).rejects.toThrowError("Organization owner access is required.");
    await expect(
      t.mutation(internal.billing.ensurePolarExternalCustomerId, {
        userId: secondUserId,
        organizationId: created.organizationId,
      }),
    ).rejects.toThrowError("Organization owner access is required.");

    await expect(
      t.mutation(internal.organizationAdmin.addExistingUserToOrganization, {
        organizationId: created.organizationId,
        role: "owner",
        userEmail: "member@example.com",
      }),
    ).resolves.toEqual({
      state: "updated",
      membershipId: added.membershipId,
    });
    await expect(
      t.run(async (ctx) => {
        return (await ctx.db.get(added.membershipId))?.role;
      }),
    ).resolves.toBe("owner");
  });
});
