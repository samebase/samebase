import { describe, expect, it } from "vite-plus/test";

import { internal } from "./_generated/api";
import { makeConvexTest } from "./test.setup";

describe("devAuth password account seed", () => {
  it("seeds the explicit password account user when duplicate emails exist", async () => {
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
      const passwordAccountId = await ctx.db.insert("authAccounts", {
        userId: passwordUserId,
        provider: "password",
        providerAccountId: "seed@example.com",
      });
      return { approvedUserId, passwordAccountId, passwordUserId };
    });

    await expect(
      t.mutation(internal.devAuth.seedProviderConnectionsForUser, {
        userId: ids.passwordUserId,
      }),
    ).resolves.toBeNull();

    const snapshot = await t.run(async (ctx) => {
      return {
        approvedUser: await ctx.db.get(ids.approvedUserId),
        passwordAccount: await ctx.db.get(ids.passwordAccountId),
        passwordUser: await ctx.db.get(ids.passwordUserId),
      };
    });

    expect(snapshot.approvedUser?.isApproved).toBe(true);
    expect(snapshot.passwordAccount?.userId).toBe(ids.passwordUserId);
    expect(snapshot.passwordUser?.isApproved).toBe(true);
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
