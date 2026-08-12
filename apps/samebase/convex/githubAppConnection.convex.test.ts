import { describe, expect, it } from "vite-plus/test";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { makeConvexTest } from "./test.setup";

async function insertUser(ctx: MutationCtx, email: string): Promise<Id<"users">> {
  return await ctx.db.insert("users", {
    state: "active",
    email,
    isApproved: true,
  });
}

async function insertCredential(
  ctx: MutationCtx,
  args: { session: string; userId: Id<"users"> },
): Promise<Id<"githubAppConnectionCredentials">> {
  return await ctx.db.insert("githubAppConnectionCredentials", {
    state: "authorized",
    userId: args.userId,
    session: args.session,
    githubUserId: "github-actor",
    githubUserLogin: "github-actor",
    accessToken: `${args.session}-access-token`,
    accessTokenExpiresAt: Date.now() + 60_000,
    refreshToken: `${args.session}-refresh-token`,
    refreshTokenExpiresAt: Date.now() + 120_000,
    createdAt: Date.now(),
    expiresAt: Date.now() + 60_000,
  });
}

describe("GitHub App connection", () => {
  it("binds a connection credential to its Samebase user and expiry", async () => {
    const t = makeConvexTest();
    const { credentialId, otherUserId, userId } = await t.run(async (ctx) => {
      const userId = await insertUser(ctx, "credential-owner@example.test");
      const otherUserId = await insertUser(ctx, "other-viewer@example.test");
      const credentialId = await insertCredential(ctx, {
        userId,
        session: "user-bound-session",
      });
      return { credentialId, otherUserId, userId };
    });

    await expect(
      t.query(internal.githubAppConnection.getCredential, {
        session: "user-bound-session",
        userId: otherUserId,
        now: 0,
      }),
    ).resolves.toBeNull();
    await expect(
      t.query(internal.githubAppConnection.getCredential, {
        session: "user-bound-session",
        userId,
        now: Number.MAX_SAFE_INTEGER,
      }),
    ).resolves.toBeNull();
    await expect(
      t.query(internal.githubAppConnection.getCredential, {
        session: "user-bound-session",
        userId,
        now: 0,
      }),
    ).resolves.toMatchObject({
      credentialId,
      credential: { state: "authorized", userId },
    });
  });

  it("does not store a callback credential after the Samebase user stops being active", async () => {
    const t = makeConvexTest();
    const { setupStateId, userId } = await t.run(async (ctx) => {
      const userId = await insertUser(ctx, "deleting-user@example.test");
      const setupStateId = await ctx.db.insert("githubAppSetupStates", {
        userId,
        state: "deleting-user-state",
        purpose: "organization_connection",
        createdAt: Date.now(),
        expiresAt: Date.now() + 60_000,
      });
      await ctx.db.replace(userId, { state: "deleted", deletedAt: Date.now() });
      return { setupStateId, userId };
    });

    await expect(
      t.mutation(internal.githubAppConnection.storeCredential, {
        setupStateId,
        state: "deleting-user-state",
        githubUserId: "deleting-github-user",
        githubUserLogin: "deleting-github-user",
        accessToken: "uncommitted-access-token",
        accessTokenExpiresAt: Date.now() + 60_000,
        refreshToken: "uncommitted-refresh-token",
        refreshTokenExpiresAt: Date.now() + 120_000,
      }),
    ).rejects.toThrow("An active Samebase user is required.");

    await expect(
      t.run(async (ctx) => ({
        credential: await ctx.db
          .query("githubAppConnectionCredentials")
          .withIndex("by_user", (query) => query.eq("userId", userId))
          .unique(),
        setupState: await ctx.db.get(setupStateId),
      })),
    ).resolves.toMatchObject({ credential: null, setupState: { userId } });
  });

  it("does not store a callback credential after the user loses app creation access", async () => {
    const t = makeConvexTest();
    const { setupStateId, userId } = await t.run(async (ctx) => {
      const userId = await insertUser(ctx, "pending-user@example.test");
      const setupStateId = await ctx.db.insert("githubAppSetupStates", {
        userId,
        state: "pending-user-state",
        purpose: "organization_connection",
        createdAt: Date.now(),
        expiresAt: Date.now() + 60_000,
      });
      await ctx.db.patch(userId, { isApproved: false });
      return { setupStateId, userId };
    });

    await expect(
      t.mutation(internal.githubAppConnection.storeCredential, {
        setupStateId,
        state: "pending-user-state",
        githubUserId: "pending-github-user",
        githubUserLogin: "pending-github-user",
        accessToken: "uncommitted-access-token",
        accessTokenExpiresAt: Date.now() + 60_000,
        refreshToken: "uncommitted-refresh-token",
        refreshTokenExpiresAt: Date.now() + 120_000,
      }),
    ).resolves.toEqual({ status: "access_lost" });

    await expect(
      t.run(async (ctx) => ({
        credential: await ctx.db
          .query("githubAppConnectionCredentials")
          .withIndex("by_user", (query) => query.eq("userId", userId))
          .unique(),
        setupState: await ctx.db.get(setupStateId),
      })),
    ).resolves.toEqual({ credential: null, setupState: null });
  });

  it("deletes token-free completed sessions during expiry and account deletion", async () => {
    const t = makeConvexTest();
    const { accountDeletionCredentialId, accountDeletionUserId, expiredCredentialId } = await t.run(
      async (ctx) => {
        const expiredUserId = await insertUser(ctx, "expired-session@example.test");
        const accountDeletionUserId = await insertUser(ctx, "deleting-session@example.test");
        const expiredCredentialId = await ctx.db.insert("githubAppConnectionCredentials", {
          state: "completed",
          userId: expiredUserId,
          session: "expired-completed-session",
          organizationOwnerLogin: "Expired-Owner",
          createdAt: Date.now() - 120_000,
          expiresAt: Date.now() - 60_000,
        });
        const accountDeletionCredentialId = await ctx.db.insert("githubAppConnectionCredentials", {
          state: "completed",
          userId: accountDeletionUserId,
          session: "deleting-completed-session",
          organizationOwnerLogin: "Deleting-Owner",
          createdAt: Date.now(),
          expiresAt: Date.now() + 60_000,
        });
        return { accountDeletionCredentialId, accountDeletionUserId, expiredCredentialId };
      },
    );

    await expect(
      t.mutation(internal.githubAppConnection.takeExpiredCredential, {
        credentialId: expiredCredentialId,
      }),
    ).resolves.toEqual({ status: "deleted" });
    await expect(
      t.mutation(internal.githubAppConnection.prepareForAccountDeletion, {
        userId: accountDeletionUserId,
      }),
    ).resolves.toEqual({ status: "deleted" });
    await expect(
      t.run(async (ctx) => ({
        accountDeletionCredential: await ctx.db.get(accountDeletionCredentialId),
        expiredCredential: await ctx.db.get(expiredCredentialId),
      })),
    ).resolves.toEqual({ accountDeletionCredential: null, expiredCredential: null });
  });

  it("classifies visible installations without granting Samebase membership", async () => {
    const t = makeConvexTest();
    const { userId } = await t.run(async (ctx) => {
      const userId = await insertUser(ctx, "viewer@example.test");
      const otherUserId = await insertUser(ctx, "owner@example.test");
      const openOrganizationId = await ctx.db.insert("organizations", {
        githubOwnerId: "open-owner",
        githubOwnerType: "organization",
        githubOwnerLogin: "Open-Owner",
        githubOwnerLoginNormalized: "open-owner",
        githubInstallationId: "open-installation",
      });
      await ctx.db.insert("organizationMemberships", {
        organizationId: openOrganizationId,
        userId,
        role: "member",
      });
      const inviteOrganizationId = await ctx.db.insert("organizations", {
        githubOwnerId: "invite-owner",
        githubOwnerType: "organization",
        githubOwnerLogin: "Invite-Owner",
        githubOwnerLoginNormalized: "invite-owner",
        githubInstallationId: "invite-installation",
      });
      await ctx.db.insert("organizationMemberships", {
        organizationId: inviteOrganizationId,
        userId: otherUserId,
        role: "owner",
      });
      return { userId };
    });

    await expect(
      t.query(internal.githubAppConnection.classifyOptions, {
        userId,
        installations: [
          {
            installationId: "open-installation",
            githubOwnerId: "open-owner",
            githubOwnerType: "organization",
            githubOwnerLogin: "open-owner",
            canManage: false,
          },
          {
            installationId: "hidden-binding-installation",
            githubOwnerId: "invite-owner",
            githubOwnerType: "organization",
            githubOwnerLogin: "invite-owner",
            canManage: false,
          },
          {
            installationId: "invite-installation",
            githubOwnerId: "invite-owner",
            githubOwnerType: "organization",
            githubOwnerLogin: "invite-owner",
            canManage: true,
          },
          {
            installationId: "connect-installation",
            githubOwnerId: "connect-owner",
            githubOwnerType: "organization",
            githubOwnerLogin: "connect-owner",
            canManage: true,
          },
        ],
      }),
    ).resolves.toEqual([
      {
        status: "open",
        installationId: "open-installation",
        githubOwnerType: "organization",
        githubOwnerLogin: "open-owner",
        organizationOwnerLogin: "Open-Owner",
      },
      {
        status: "owner_required",
        installationId: "hidden-binding-installation",
        githubOwnerType: "organization",
        githubOwnerLogin: "invite-owner",
      },
      {
        status: "invite_required",
        installationId: "invite-installation",
        githubOwnerType: "organization",
        githubOwnerLogin: "invite-owner",
      },
      {
        status: "connect",
        installationId: "connect-installation",
        githubOwnerType: "organization",
        githubOwnerLogin: "connect-owner",
      },
    ]);
  });

  it("creates an unbound organization and returns the completed result to a retry", async () => {
    const t = makeConvexTest();
    const { credentialId, userId } = await t.run(async (ctx) => {
      const userId = await insertUser(ctx, "new-owner@example.test");
      const credentialId = await insertCredential(ctx, { userId, session: "connect-session" });
      return { credentialId, userId };
    });

    await expect(
      t.mutation(internal.githubAppConnection.connectVerifiedInstallation, {
        credentialId,
        session: "connect-session",
        userId,
        installationId: "new-installation",
        githubOwnerId: "new-owner",
        githubOwnerType: "organization",
        githubOwnerLogin: "New-Owner",
      }),
    ).resolves.toEqual({ status: "connected", organizationOwnerLogin: "New-Owner" });

    await expect(
      t.mutation(internal.githubAppConnection.connectVerifiedInstallation, {
        credentialId,
        session: "connect-session",
        userId,
        installationId: "new-installation",
        githubOwnerId: "new-owner",
        githubOwnerType: "organization",
        githubOwnerLogin: "New-Owner",
      }),
    ).resolves.toEqual({ status: "open", organizationOwnerLogin: "New-Owner" });

    const snapshot = await t.run(async (ctx) => ({
      credential: await ctx.db.get(credentialId),
      organization: await ctx.db
        .query("organizations")
        .withIndex("by_github_owner_id", (query) => query.eq("githubOwnerId", "new-owner"))
        .unique(),
      memberships: await ctx.db.query("organizationMemberships").collect(),
    }));
    expect(snapshot.credential).toMatchObject({
      state: "completed",
      userId,
      session: "connect-session",
      organizationOwnerLogin: "New-Owner",
    });
    expect(snapshot.credential).not.toHaveProperty("accessToken");
    expect(snapshot.organization).toMatchObject({
      githubOwnerLogin: "New-Owner",
      githubInstallationId: "new-installation",
    });
    expect(snapshot.memberships).toHaveLength(1);
    expect(snapshot.memberships[0]).toMatchObject({ userId, role: "owner" });
  });

  it("does not create an organization after the user loses app creation access", async () => {
    const t = makeConvexTest();
    const { credentialId, userId } = await t.run(async (ctx) => {
      const userId = await insertUser(ctx, "lost-access@example.test");
      const credentialId = await insertCredential(ctx, {
        userId,
        session: "lost-access-session",
      });
      await ctx.db.patch(userId, { isApproved: false });
      return { credentialId, userId };
    });

    await expect(
      t.mutation(internal.githubAppConnection.connectVerifiedInstallation, {
        credentialId,
        session: "lost-access-session",
        userId,
        installationId: "lost-access-installation",
        githubOwnerId: "lost-access-owner",
        githubOwnerType: "organization",
        githubOwnerLogin: "Lost-Access-Owner",
      }),
    ).resolves.toEqual({ status: "access_lost" });

    await expect(
      t.run(async (ctx) => ({
        credential: await ctx.db.get(credentialId),
        organization: await ctx.db
          .query("organizations")
          .withIndex("by_github_owner_id", (query) =>
            query.eq("githubOwnerId", "lost-access-owner"),
          )
          .unique(),
      })),
    ).resolves.toEqual({ credential: null, organization: null });
  });

  it("does not admit the actor when another owner binds the installation first", async () => {
    const t = makeConvexTest();
    const { credentialId, organizationId, userId } = await t.run(async (ctx) => {
      const userId = await insertUser(ctx, "late-actor@example.test");
      const ownerUserId = await insertUser(ctx, "existing-owner@example.test");
      const credentialId = await insertCredential(ctx, { userId, session: "late-session" });
      const organizationId = await ctx.db.insert("organizations", {
        githubOwnerId: "late-owner",
        githubOwnerType: "organization",
        githubOwnerLogin: "Late-Owner",
        githubOwnerLoginNormalized: "late-owner",
        githubInstallationId: "existing-installation",
      });
      await ctx.db.insert("organizationMemberships", {
        organizationId,
        userId: ownerUserId,
        role: "owner",
      });
      return { credentialId, organizationId, userId };
    });

    await expect(
      t.mutation(internal.githubAppConnection.connectVerifiedInstallation, {
        credentialId,
        session: "late-session",
        userId,
        installationId: "replacement-installation",
        githubOwnerId: "late-owner",
        githubOwnerType: "organization",
        githubOwnerLogin: "Late-Owner",
      }),
    ).resolves.toEqual({ status: "invite_required" });

    const snapshot = await t.run(async (ctx) => ({
      credential: await ctx.db.get(credentialId),
      membership: await ctx.db
        .query("organizationMemberships")
        .withIndex("by_organization_and_user", (query) =>
          query.eq("organizationId", organizationId).eq("userId", userId),
        )
        .unique(),
      organization: await ctx.db.get(organizationId),
    }));
    expect(snapshot.credential).not.toBeNull();
    expect(snapshot.membership).toBeNull();
    expect(snapshot.organization).toMatchObject({ githubInstallationId: "existing-installation" });
  });
});
