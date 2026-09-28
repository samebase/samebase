import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const githubAppConnectionMocks = vi.hoisted(() => ({
  discoverPreviewSeedGitHubAppInstallations: vi.fn(),
}));

vi.mock("./githubApi/app", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./githubApi/app")>();
  return {
    ...actual,
    discoverPreviewSeedGitHubAppInstallations:
      githubAppConnectionMocks.discoverPreviewSeedGitHubAppInstallations,
  };
});

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { makeConvexTest } from "./test.setup";

async function insertUser(ctx: MutationCtx, email: string): Promise<Id<"users">> {
  return await ctx.db.insert("users", {
    state: "active",
    email,
    isApproved: true,
    termsVersion: "2026-08-12",
    termsAcceptedAt: 1,
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

async function insertPasswordUser(ctx: MutationCtx, email: string): Promise<Id<"users">> {
  const userId = await insertUser(ctx, email);
  await ctx.db.insert("authAccounts", {
    userId,
    provider: "password",
    providerAccountId: email,
  });
  return userId;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GitHub App connection", () => {
  it("omits existing memberships and classifies the remaining visible installations", async () => {
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

  it("lists and connects installations for the exact preview seed account", async () => {
    vi.stubEnv("CONVEX_DEPLOYMENT", "preview:github-connection");
    vi.stubEnv("DEV_SEED_AUTH_EMAIL", "preview@example.test");
    vi.stubEnv("DEV_SEED_AUTH_PASSWORD", "preview-password");
    vi.stubEnv("DEV_SEED_GITHUB_API_KEY", "preview-api-key");
    const t = makeConvexTest();
    const userId = await t.run(
      async (ctx) => await insertPasswordUser(ctx, "preview@example.test"),
    );
    githubAppConnectionMocks.discoverPreviewSeedGitHubAppInstallations.mockResolvedValue([
      {
        githubInstallationId: "connect-installation",
        githubOwnerId: "connect-owner",
        githubOwnerType: "organization",
        githubOwnerLogin: "Connect-Owner",
      },
    ]);
    const asSeedUser = t.withIdentity({
      subject: `${userId}|preview-session`,
      tokenIdentifier: `test:${userId}`,
    });

    await expect(asSeedUser.action(api.githubAppConnection.listOptions, {})).resolves.toEqual({
      status: "ready",
      options: [
        {
          status: "connect",
          installationId: "connect-installation",
          githubOwnerType: "organization",
          githubOwnerLogin: "Connect-Owner",
        },
      ],
    });
    await expect(
      asSeedUser.action(api.githubAppConnection.connectInstallation, {
        installationId: "connect-installation",
      }),
    ).resolves.toEqual({ status: "connected", organizationOwnerLogin: "Connect-Owner" });
    expect(githubAppConnectionMocks.discoverPreviewSeedGitHubAppInstallations).toHaveBeenCalledWith(
      "preview-api-key",
    );
    await expect(
      t.run(async (ctx) =>
        ctx.db
          .query("organizations")
          .withIndex("by_github_owner_id", (query) => query.eq("githubOwnerId", "connect-owner"))
          .unique(),
      ),
    ).resolves.toMatchObject({ githubInstallationId: "connect-installation" });
  });

  it("does not give another preview account the seeded GitHub access", async () => {
    vi.stubEnv("CONVEX_DEPLOYMENT", "preview:github-connection");
    vi.stubEnv("DEV_SEED_AUTH_EMAIL", "preview@example.test");
    vi.stubEnv("DEV_SEED_AUTH_PASSWORD", "preview-password");
    const t = makeConvexTest();
    const otherUserId = await t.run(async (ctx) => {
      await insertPasswordUser(ctx, "preview@example.test");
      return await insertPasswordUser(ctx, "other@example.test");
    });

    await expect(
      t.mutation(internal.githubAppConnection.connectPreviewSeedVerifiedInstallation, {
        userId: otherUserId,
        installationId: "other-installation",
        githubOwnerId: "other-owner",
        githubOwnerType: "organization",
        githubOwnerLogin: "Other-Owner",
      }),
    ).resolves.toEqual({ status: "authorization_required" });
    await expect(
      t.run(async (ctx) => await ctx.db.query("organizations").collect()),
    ).resolves.toEqual([]);
  });

  it("does not use the preview seed access outside a preview deployment", async () => {
    vi.stubEnv("CONVEX_DEPLOYMENT", "dev:github-connection");
    vi.stubEnv("DEV_SEED_AUTH_EMAIL", "preview@example.test");
    vi.stubEnv("DEV_SEED_AUTH_PASSWORD", "preview-password");
    const t = makeConvexTest();
    const userId = await t.run(
      async (ctx) => await insertPasswordUser(ctx, "preview@example.test"),
    );

    await expect(
      t.mutation(internal.githubAppConnection.connectPreviewSeedVerifiedInstallation, {
        userId,
        installationId: "development-installation",
        githubOwnerId: "development-owner",
        githubOwnerType: "organization",
        githubOwnerLogin: "Development-Owner",
      }),
    ).resolves.toEqual({ status: "authorization_required" });
    await expect(
      t.run(async (ctx) => await ctx.db.query("organizations").collect()),
    ).resolves.toEqual([]);
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
