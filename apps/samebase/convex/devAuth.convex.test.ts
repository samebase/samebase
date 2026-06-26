import { describe, expect, it } from "vite-plus/test";

import { internal } from "./_generated/api";
import { makeConvexTest } from "./test.setup";

describe("devAuth password account seed", () => {
  it("resolves an existing password account linked to the verified review user", async () => {
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
        shouldLinkViaEmail: true,
      }),
    ).resolves.toEqual({
      kind: "existing",
      userId,
    });
  });

  it("fails when the review password account is linked to a duplicate user", async () => {
    const t = makeConvexTest();
    const ids = await t.run(async (ctx) => {
      const approvedUserId = await ctx.db.insert("users", {
        email: "seed@example.com",
        emailVerificationTime: 1,
        isApproved: true,
      });
      const passwordUserId = await ctx.db.insert("users", {
        email: "seed@example.com",
      });
      await ctx.db.insert("authAccounts", {
        userId: passwordUserId,
        provider: "password",
        providerAccountId: "seed@example.com",
      });
      return { approvedUserId, passwordUserId };
    });

    await expect(
      t.mutation(internal.devAuth.resolveSeedPasswordAccountUser, {
        email: "seed@example.com",
        shouldLinkViaEmail: true,
      }),
    ).rejects.toThrowError(
      `Review password account for seed@example.com is linked to ${ids.passwordUserId}, not verified user ${ids.approvedUserId}`,
    );
  });

  it("returns the verified review user when the password account is missing", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "seed@example.com",
        emailVerificationTime: 1,
        isApproved: true,
      });
    });

    await expect(
      t.mutation(internal.devAuth.resolveSeedPasswordAccountUser, {
        email: "seed@example.com",
        shouldLinkViaEmail: true,
      }),
    ).resolves.toEqual({
      kind: "missing",
      verifiedUserId: userId,
    });
  });

  it("fails when the review email has multiple verified users", async () => {
    const t = makeConvexTest();
    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        email: "seed@example.com",
        emailVerificationTime: 1,
      });
      await ctx.db.insert("users", {
        email: "seed@example.com",
        emailVerificationTime: 2,
      });
    });

    await expect(
      t.mutation(internal.devAuth.resolveSeedPasswordAccountUser, {
        email: "seed@example.com",
        shouldLinkViaEmail: true,
      }),
    ).rejects.toThrowError("Expected exactly one verified user for seed@example.com; found 2");
  });

  it("adds provider keys to the explicit seed user", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "seed@example.com",
      });
    });

    await expect(
      t.mutation(internal.devAuth.seedProviderConnectionsForUser, {
        userId,
        githubApiKey: "github-token",
        convexManagementApiKey: "convex-token",
        convexTeamId: "team-id",
        convexTeamSlug: "team-slug",
        cloudflareApiKey: "cloudflare-token",
        cloudflareAccountId: "cloudflare-account-id",
      }),
    ).resolves.toBeNull();

    const snapshot = await t.run(async (ctx) => {
      const connections = await ctx.db
        .query("providerConnections")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
      return {
        connections,
        user: await ctx.db.get(userId),
      };
    });

    expect(snapshot.user?.isApproved).toBe(true);
    expect(snapshot.connections.map((connection) => connection.kind).sort()).toEqual([
      "cloudflare",
      "convex",
      "github",
    ]);
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
      t.mutation(internal.devAuth.seedProviderConnectionsForUser, {
        userId,
      }),
    ).rejects.toThrowError("Cannot seed provider connections for missing user");
  });
});
