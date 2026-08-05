import { describe, expect, it } from "vite-plus/test";
import { ACCOUNT_EMAIL_MAX_LENGTH } from "../shared/accountPresentation";

import { internal } from "./_generated/api";
import { makeConvexTest } from "./test.setup";

describe("devAuth password account seed", () => {
  it("enforces the canonical email maximum for the seed account boundary", async () => {
    const suffix = "@b.co";
    const maximumEmail = "a".repeat(ACCOUNT_EMAIL_MAX_LENGTH - suffix.length) + suffix;
    const tooLongEmail = "a".repeat(ACCOUNT_EMAIL_MAX_LENGTH + 1 - suffix.length) + suffix;
    const t = makeConvexTest();

    await expect(
      t.mutation(internal.devAuth.resolveSeedPasswordAccountUser, {
        email: maximumEmail,
      }),
    ).resolves.toEqual({ kind: "missing" });
    await expect(
      t.mutation(internal.devAuth.resolveSeedPasswordAccountUser, {
        email: tooLongEmail,
      }),
    ).rejects.toThrowError(
      `Email address must be ${ACCOUNT_EMAIL_MAX_LENGTH} characters or fewer.`,
    );
  });

  it("resolves an existing seed password account", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      const insertedUserId = await ctx.db.insert("users", {
        email: "seed@example.com",
        emailVerificationTime: 1,
        isApproved: true,
      });
      await ctx.db.insert("authAccounts", {
        userId: insertedUserId,
        provider: "password",
        providerAccountId: "seed@example.com",
      });
      return insertedUserId;
    });

    await expect(
      t.mutation(internal.devAuth.resolveSeedPasswordAccountUser, {
        email: "seed@example.com",
      }),
    ).resolves.toEqual({
      kind: "existing",
      userId,
    });
  });

  it("approves the explicit seed user", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "seed@example.com",
      });
    });

    await expect(
      t.mutation(internal.devAuth.approveSeedPasswordAccount, { userId }),
    ).resolves.toBeNull();

    await expect(t.run(async (ctx) => (await ctx.db.get(userId))?.isApproved)).resolves.toBe(true);
  });

  it("seeds one repeat-safe organization graph with selected provider connections", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "seed@example.com",
        isApproved: true,
      });
    });
    const seed = {
      userId,
      githubOwnerId: "285392744",
      githubOwnerType: "organization",
      githubOwnerLogin: "samebase",
      githubInstallationId: "151325701",
      convexConnection: {
        credential: "convex-test-credential",
        teamId: "convex-team-id",
        teamSlug: "samebase",
      },
      cloudflareConnection: {
        credential: "cloudflare-test-credential",
        accountId: "cloudflare-account-id",
      },
    } as const;

    await t.mutation(internal.devAuth.seedWorktreeOrganization, seed);
    await t.mutation(internal.devAuth.seedWorktreeOrganization, seed);

    const snapshot = await t.run(async (ctx) => {
      return {
        organizations: await ctx.db.query("organizations").collect(),
        memberships: await ctx.db.query("organizationMemberships").collect(),
        billingAccounts: await ctx.db.query("organizationBillingAccounts").collect(),
        providerConnections: await ctx.db.query("providerConnections").collect(),
      };
    });

    expect(snapshot.organizations).toHaveLength(1);
    expect(snapshot.memberships).toHaveLength(1);
    expect(snapshot.billingAccounts).toHaveLength(1);
    expect(snapshot.providerConnections).toHaveLength(2);

    const organization = snapshot.organizations[0];
    expect(organization).toMatchObject({
      githubOwnerId: seed.githubOwnerId,
      githubOwnerType: seed.githubOwnerType,
      githubOwnerLogin: seed.githubOwnerLogin,
      githubOwnerLoginNormalized: seed.githubOwnerLogin,
      githubInstallationId: seed.githubInstallationId,
    });
    expect(snapshot.memberships[0]).toMatchObject({
      organizationId: organization._id,
      userId,
      role: "owner",
    });
    expect(snapshot.billingAccounts[0]).toMatchObject({
      organizationId: organization._id,
      plan: "free",
      status: "inactive",
    });

    const convexConnection = snapshot.providerConnections.find(
      (connection) => connection.kind === "convex",
    );
    const cloudflareConnection = snapshot.providerConnections.find(
      (connection) => connection.kind === "cloudflare",
    );
    expect(convexConnection).toMatchObject({
      organizationId: organization._id,
      connectedByUserId: userId,
      teamId: seed.convexConnection.teamId,
    });
    expect(cloudflareConnection).toMatchObject({
      organizationId: organization._id,
      connectedByUserId: userId,
      defaultAccount: {
        state: "selected",
        accountId: seed.cloudflareConnection.accountId,
      },
    });
    expect(organization.selectedConvexProviderConnectionId).toBe(convexConnection?._id);
    expect(organization.selectedCloudflareProviderConnectionId).toBe(cloudflareConnection?._id);
  });

  it("fails closed when the seed user is missing", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      const insertedUserId = await ctx.db.insert("users", {
        email: "missing@example.com",
      });
      await ctx.db.delete(insertedUserId);
      return insertedUserId;
    });

    await expect(
      t.mutation(internal.devAuth.approveSeedPasswordAccount, { userId }),
    ).rejects.toThrowError("Cannot approve missing seed user");
  });
});
