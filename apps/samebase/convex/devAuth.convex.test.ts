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

  it("approves the explicit seed user without creating an organization", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "seed@example.com",
      });
    });

    await expect(
      t.mutation(internal.devAuth.approveSeedPasswordAccount, { userId }),
    ).resolves.toBeNull();

    const snapshot = await t.run(async (ctx) => {
      const connections = await ctx.db
        .query("providerConnections")
        .withIndex("by_connected_by_user", (query) => query.eq("connectedByUserId", userId))
        .take(1);
      const memberships = await ctx.db
        .query("organizationMemberships")
        .withIndex("by_user", (query) => query.eq("userId", userId))
        .take(1);
      return {
        connections,
        memberships,
        user: await ctx.db.get(userId),
      };
    });

    expect(snapshot.user?.isApproved).toBe(true);
    expect(snapshot.connections).toEqual([]);
    expect(snapshot.memberships).toEqual([]);
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
