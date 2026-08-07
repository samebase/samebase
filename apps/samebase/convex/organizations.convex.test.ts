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
    const providerCredentialsId = await t.run(async (ctx) => {
      await ctx.db.patch(created.organizationId, {
        cloudflareAccount: {
          accountId: "cloudflare-account",
          accountName: "Cloudflare account",
        },
        convexTeam: { teamId: "convex-team", teamSlug: "convex-slug" },
      });
      return await ctx.db.insert("organizationProviderCredentials", {
        organizationId: created.organizationId,
        convex: {
          auth: { method: "api_key", credential: "convex-credential" },
          connectedByUserId: userId,
          updatedAt: 1,
        },
      });
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
        providerCredentials: await ctx.db.get(providerCredentialsId),
      };
    });

    expect(snapshot.organizations).toHaveLength(1);
    expect(snapshot.organizations[0]).toMatchObject({
      cloudflareAccount: {
        accountId: "cloudflare-account",
        accountName: "Cloudflare account",
      },
      convexTeam: { teamId: "convex-team", teamSlug: "convex-slug" },
      githubOwnerId: "101",
      githubOwnerLogin: "Samebase-Renamed",
      githubOwnerLoginNormalized: "samebase-renamed",
      githubInstallationId: "1002",
    });
    expect(snapshot.providerCredentials).toMatchObject({
      organizationId: created.organizationId,
      convex: {
        auth: { method: "api_key", credential: "convex-credential" },
        connectedByUserId: userId,
      },
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

  it("resolves a normalized external return coordinate from an organization ID", async () => {
    const t = makeConvexTest();
    const ownerUserId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "owner-return@example.com",
        isApproved: true,
      });
    });
    const { organizationId } = await t.mutation(
      internal.organizations.createOrReconnectVerifiedOrganization,
      {
        userId: ownerUserId,
        githubOwnerId: "return-owner",
        githubOwnerType: "organization",
        githubOwnerLogin: "Return-Owner",
        githubInstallationId: "return-installation",
      },
    );
    await expect(
      t.query(internal.organizations.getExternalReturnOwnerLogin, {
        organizationId,
      }),
    ).resolves.toBe("return-owner");
  });

  it("sorts mixed-case owner logins by normalized login", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "sorted-owner@example.com",
        isApproved: true,
      });
    });
    for (const githubOwnerLogin of ["Zulu", "beta", "Alpha"]) {
      await t.mutation(internal.organizations.createOrReconnectVerifiedOrganization, {
        userId,
        githubOwnerId: `${githubOwnerLogin}-id`,
        githubOwnerType: "organization",
        githubOwnerLogin,
        githubInstallationId: `${githubOwnerLogin}-installation`,
      });
    }

    const organizations = await t
      .withIdentity({
        subject: `${userId}|sorted-owner`,
        tokenIdentifier: `test:${userId}`,
      })
      .query(api.organizations.listForViewer, {});

    expect(organizations.map((organization) => organization.githubOwnerLogin)).toEqual([
      "Alpha",
      "beta",
      "Zulu",
    ]);
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

  it("does not allow an organization to lose its last active owner", async () => {
    const t = makeConvexTest();
    const { firstUserId } = await t.run(async (ctx) => {
      const firstUserId = await ctx.db.insert("users", {
        email: "first-owner@example.com",
        isApproved: true,
      });
      await ctx.db.insert("users", {
        email: "second-owner@example.com",
        isApproved: true,
      });
      return { firstUserId };
    });
    const organization = await t.mutation(
      internal.organizations.createOrReconnectVerifiedOrganization,
      {
        userId: firstUserId,
        githubOwnerId: "last-owner-check",
        githubOwnerType: "organization",
        githubOwnerLogin: "last-owner-check",
        githubInstallationId: "last-owner-installation",
      },
    );

    await expect(
      t.mutation(internal.organizationAdmin.addExistingUserToOrganization, {
        organizationId: organization.organizationId,
        role: "member",
        userEmail: "first-owner@example.com",
      }),
    ).rejects.toThrowError("An organization must have at least one active owner.");

    await t.mutation(internal.organizationAdmin.addExistingUserToOrganization, {
      organizationId: organization.organizationId,
      role: "owner",
      userEmail: "second-owner@example.com",
    });
    await expect(
      t.mutation(internal.organizationAdmin.addExistingUserToOrganization, {
        organizationId: organization.organizationId,
        role: "member",
        userEmail: "first-owner@example.com",
      }),
    ).resolves.toMatchObject({ state: "updated" });
  });
});
