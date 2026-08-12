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

async function insertAuthorizedUser(
  ctx: MutationCtx,
  args: { email: string; githubUserId: string; githubUserLogin: string },
) {
  const userId = await insertUser(ctx, args.email);
  await ctx.db.insert("authAccounts", {
    userId,
    provider: "github",
    providerAccountId: args.githubUserId,
    emailVerified: args.email,
    githubLogin: args.githubUserLogin,
  });
  const now = Date.now();
  const authorizationId = await ctx.db.insert("githubUserAuthorizations", {
    userId,
    githubUserId: args.githubUserId,
    githubUserLogin: args.githubUserLogin,
    accessToken: `${args.githubUserLogin}-access-token`,
    accessTokenExpiresAt: now + 60_000,
    refreshToken: `${args.githubUserLogin}-refresh-token`,
    refreshTokenExpiresAt: now + 120_000,
    createdAt: now,
    updatedAt: now,
  });
  return { authorizationId, userId };
}

describe("GitHub App connection", () => {
  it("keeps cleanup for legacy token-free connection sessions", async () => {
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

  it("creates one unbound organization and opens it on retry", async () => {
    const t = makeConvexTest();
    const { userId } = await t.run(async (ctx) => {
      return await insertAuthorizedUser(ctx, {
        email: "new-owner@example.test",
        githubUserId: "github-actor",
        githubUserLogin: "github-actor",
      });
    });
    const args = {
      userId,
      githubUserId: "github-actor",
      installationId: "new-installation",
      githubOwnerId: "new-owner",
      githubOwnerType: "organization" as const,
      githubOwnerLogin: "New-Owner",
    };

    await expect(
      t.mutation(internal.githubAppConnection.connectVerifiedInstallation, args),
    ).resolves.toEqual({ status: "connected", organizationOwnerLogin: "New-Owner" });
    await expect(
      t.mutation(internal.githubAppConnection.connectVerifiedInstallation, args),
    ).resolves.toEqual({ status: "open", organizationOwnerLogin: "New-Owner" });

    const snapshot = await t.run(async (ctx) => ({
      organization: await ctx.db
        .query("organizations")
        .withIndex("by_github_owner_id", (query) => query.eq("githubOwnerId", "new-owner"))
        .unique(),
      memberships: await ctx.db.query("organizationMemberships").collect(),
    }));
    expect(snapshot.organization).toMatchObject({
      githubOwnerLogin: "New-Owner",
      githubInstallationId: "new-installation",
    });
    expect(snapshot.memberships).toHaveLength(1);
    expect(snapshot.memberships[0]).toMatchObject({ userId, role: "owner" });
  });

  it("does not create after Samebase app-creation access is lost", async () => {
    const t = makeConvexTest();
    const { userId } = await t.run(async (ctx) => {
      const result = await insertAuthorizedUser(ctx, {
        email: "lost-access@example.test",
        githubUserId: "lost-access-actor",
        githubUserLogin: "lost-access-actor",
      });
      await ctx.db.patch(result.userId, { isApproved: false });
      return result;
    });

    await expect(
      t.mutation(internal.githubAppConnection.connectVerifiedInstallation, {
        userId,
        githubUserId: "lost-access-actor",
        installationId: "lost-access-installation",
        githubOwnerId: "lost-access-owner",
        githubOwnerType: "organization",
        githubOwnerLogin: "Lost-Access-Owner",
      }),
    ).resolves.toEqual({ status: "access_lost" });

    await expect(
      t.run(async (ctx) =>
        ctx.db
          .query("organizations")
          .withIndex("by_github_owner_id", (query) =>
            query.eq("githubOwnerId", "lost-access-owner"),
          )
          .unique(),
      ),
    ).resolves.toBeNull();
  });

  it("does not create after the durable authorization is removed", async () => {
    const t = makeConvexTest();
    const { userId } = await t.run(async (ctx) => {
      const result = await insertAuthorizedUser(ctx, {
        email: "revoked@example.test",
        githubUserId: "revoked-actor",
        githubUserLogin: "revoked-actor",
      });
      await ctx.db.delete(result.authorizationId);
      return result;
    });

    await expect(
      t.mutation(internal.githubAppConnection.connectVerifiedInstallation, {
        userId,
        githubUserId: "revoked-actor",
        installationId: "revoked-installation",
        githubOwnerId: "revoked-owner",
        githubOwnerType: "organization",
        githubOwnerLogin: "Revoked-Owner",
      }),
    ).resolves.toEqual({ status: "authorization_required" });
  });

  it("does not create after the linked GitHub sign-in is removed", async () => {
    const t = makeConvexTest();
    const { userId } = await t.run(async (ctx) => {
      const result = await insertAuthorizedUser(ctx, {
        email: "unlinked@example.test",
        githubUserId: "unlinked-actor",
        githubUserLogin: "unlinked-actor",
      });
      const account = await ctx.db
        .query("authAccounts")
        .withIndex("userIdAndProvider", (query) =>
          query.eq("userId", result.userId).eq("provider", "github"),
        )
        .unique();
      if (account === null) {
        throw new Error("GitHub sign-in fixture is missing.");
      }
      await ctx.db.delete(account._id);
      return result;
    });

    await expect(
      t.mutation(internal.githubAppConnection.connectVerifiedInstallation, {
        userId,
        githubUserId: "unlinked-actor",
        installationId: "unlinked-installation",
        githubOwnerId: "unlinked-owner",
        githubOwnerType: "organization",
        githubOwnerLogin: "Unlinked-Owner",
      }),
    ).resolves.toEqual({ status: "github_sign_in_required" });
  });

  it("does not admit the actor when another Samebase owner binds first", async () => {
    const t = makeConvexTest();
    const { organizationId, userId } = await t.run(async (ctx) => {
      const { userId } = await insertAuthorizedUser(ctx, {
        email: "late-actor@example.test",
        githubUserId: "late-actor",
        githubUserLogin: "late-actor",
      });
      const ownerUserId = await insertUser(ctx, "existing-owner@example.test");
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
      return { organizationId, userId };
    });

    await expect(
      t.mutation(internal.githubAppConnection.connectVerifiedInstallation, {
        userId,
        githubUserId: "late-actor",
        installationId: "replacement-installation",
        githubOwnerId: "late-owner",
        githubOwnerType: "organization",
        githubOwnerLogin: "Late-Owner",
      }),
    ).resolves.toEqual({ status: "invite_required" });

    const snapshot = await t.run(async (ctx) => ({
      membership: await ctx.db
        .query("organizationMemberships")
        .withIndex("by_organization_and_user", (query) =>
          query.eq("organizationId", organizationId).eq("userId", userId),
        )
        .unique(),
      organization: await ctx.db.get(organizationId),
    }));
    expect(snapshot.membership).toBeNull();
    expect(snapshot.organization).toMatchObject({ githubInstallationId: "existing-installation" });
  });
});
