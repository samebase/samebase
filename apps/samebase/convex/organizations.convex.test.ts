import { describe, expect, it } from "vite-plus/test";

import { api, internal } from "./_generated/api";
import { makeConvexTest } from "./test.setup";

describe("GitHub-backed organizations", () => {
  it("lets a pending-access user load an empty organization list for Settings", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        state: "active",
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
        state: "active",
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
    await t.run(async (ctx) => {
      await ctx.db.patch(userId, { name: "Provider profile name", displayName: "Samebase name" });
    });
    await expect(
      t.mutation(internal.billing.ensurePolarExternalCustomerId, {
        userId,
        organizationId: created.organizationId,
      }),
    ).resolves.toMatchObject({
      name: "Samebase name",
      email: "owner@example.com",
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
        state: "active",
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
        state: "active",
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

  it("requires matching GitHub sign-in and user authorization for personal repository creation", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        state: "active",
        email: "personal-capability@example.com",
        isApproved: true,
      });
      const now = Date.now();
      await ctx.db.insert("githubUserAuthorizations", {
        userId,
        githubUserId: "personal-owner-id",
        githubUserLogin: "personal-owner",
        accessToken: "personal-capability-access-token",
        accessTokenExpiresAt: now + 60_000,
        refreshToken: "personal-capability-refresh-token",
        refreshTokenExpiresAt: now + 120_000,
        createdAt: now,
        updatedAt: now,
      });
      return userId;
    });
    await t.mutation(internal.organizations.createOrReconnectVerifiedOrganization, {
      userId,
      githubOwnerId: "organization-owner-id",
      githubOwnerType: "organization",
      githubOwnerLogin: "organization-owner",
      githubInstallationId: "organization-installation",
    });
    await t.mutation(internal.organizations.createOrReconnectVerifiedOrganization, {
      userId,
      githubOwnerId: "personal-owner-id",
      githubOwnerType: "user",
      githubOwnerLogin: "personal-owner",
      githubInstallationId: "personal-installation",
    });
    const asUser = t.withIdentity({
      subject: `${userId}|personal-capability`,
      tokenIdentifier: `test:${userId}`,
    });
    const readCapabilities = async () => {
      const organizations = await asUser.query(api.organizations.listForViewer, {});
      return Object.fromEntries(
        organizations.map((organization) => [
          organization.githubOwnerId,
          organization.canCreateRepository,
        ]),
      );
    };

    await expect(readCapabilities()).resolves.toEqual({
      "organization-owner-id": true,
      "personal-owner-id": false,
    });
    const signInAccountId = await t.run(async (ctx) => {
      return await ctx.db.insert("authAccounts", {
        userId,
        provider: "github",
        providerAccountId: "personal-owner-id",
        emailVerified: "personal-owner@example.com",
        githubLogin: "personal-owner",
      });
    });
    await expect(readCapabilities()).resolves.toEqual({
      "organization-owner-id": true,
      "personal-owner-id": true,
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(signInAccountId, { providerAccountId: "different-owner-id" });
    });
    await expect(readCapabilities()).resolves.toEqual({
      "organization-owner-id": true,
      "personal-owner-id": false,
    });
  });

  it("adds or updates one membership and denies owner work to a member", async () => {
    const t = makeConvexTest();
    const { ownerUserId, secondUserId } = await t.run(async (ctx) => {
      const ownerUserId = await ctx.db.insert("users", {
        state: "active",
        email: "owner@example.com",
        isApproved: true,
      });
      const secondUserId = await ctx.db.insert("users", {
        state: "active",
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
    const { firstUserId, secondUserId } = await t.run(async (ctx) => {
      const firstUserId = await ctx.db.insert("users", {
        state: "active",
        email: "first-owner@example.com",
        isApproved: true,
      });
      const secondUserId = await ctx.db.insert("users", {
        state: "active",
        email: "second-owner@example.com",
        isApproved: true,
      });
      return { firstUserId, secondUserId };
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

    await t.mutation(internal.organizationAdmin.addExistingUserToOrganization, {
      organizationId: organization.organizationId,
      role: "owner",
      userEmail: "first-owner@example.com",
    });
    const runId = await t.run(async (ctx) => {
      const initiatingSessionId = await ctx.db.insert("authSessions", {
        userId: secondUserId,
        expirationTime: Date.now() + 60_000,
      });
      return await ctx.db.insert("workflow_accountDeletion_runs", {
        state: "running",
        identity: {
          state: "active",
          userId: secondUserId,
          email: "second-owner@example.com",
        },
        completionCapability: "d".repeat(64),
        currentStep: "request_accepted",
        requestedAt: 1,
        updatedAt: 1,
        initiatingSessionId,
        retryCount: 0,
        outcomes: {
          providerRevocation: { state: "not_started" },
          completionEmail: { state: "not_started" },
        },
        workflow: { state: "started", workflowId: "active-owner-matrix", attempt: 1 },
      });
    });
    const expectFirstOwnerDemotionRejected = async () => {
      await expect(
        t.mutation(internal.organizationAdmin.addExistingUserToOrganization, {
          organizationId: organization.organizationId,
          role: "member",
          userEmail: "first-owner@example.com",
        }),
      ).rejects.toThrowError("An organization must have at least one active owner.");
    };

    await t.run(async (ctx) => {
      await ctx.db.replace(secondUserId, {
        state: "deleting",
        email: "second-owner@example.com",
        isApproved: true,
        runId,
        requestedAt: 1,
      });
    });
    await expectFirstOwnerDemotionRejected();
    await t.run(async (ctx) => {
      await ctx.db.replace(secondUserId, { state: "deleted", deletedAt: 2 });
    });
    await expect(
      t.mutation(internal.organizationAdmin.addExistingUserToOrganization, {
        organizationId: organization.organizationId,
        role: "member",
        userEmail: "first-owner@example.com",
      }),
    ).rejects.toThrowError("Organization membership references a deleted user.");
  });

  it("does not grant organization authority from stale membership rows", async () => {
    const t = makeConvexTest();
    const { deletedUserId, missingUserId, organizationId } = await t.run(async (ctx) => {
      const deletedUserId = await ctx.db.insert("users", {
        state: "active",
        email: "deleted-member@example.test",
        isApproved: true,
      });
      const missingUserId = await ctx.db.insert("users", {
        state: "active",
        email: "missing-member@example.test",
        isApproved: true,
      });
      const organizationId = await ctx.db.insert("organizations", {
        githubOwnerId: "stale-membership-owner",
        githubOwnerType: "organization",
        githubOwnerLogin: "stale-membership-owner",
        githubOwnerLoginNormalized: "stale-membership-owner",
        githubInstallationId: "stale-membership-installation",
      });
      for (const userId of [deletedUserId, missingUserId]) {
        await ctx.db.insert("organizationMemberships", {
          organizationId,
          userId,
          role: "owner",
        });
      }
      await ctx.db.replace(deletedUserId, { state: "deleted", deletedAt: 1 });
      await ctx.db.delete(missingUserId);
      return { deletedUserId, missingUserId, organizationId };
    });

    await expect(
      t.query(internal.organizationAccess.requireOrganizationIdForUser, {
        organizationId,
        userId: deletedUserId,
      }),
    ).rejects.toThrow("An active Samebase user is required.");
    await expect(
      t.query(internal.organizationAccess.requireOrganizationIdForUser, {
        organizationId,
        userId: missingUserId,
      }),
    ).rejects.toThrow("Organization actor user reference is invalid.");
  });
});
