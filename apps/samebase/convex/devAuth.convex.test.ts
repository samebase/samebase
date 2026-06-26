import { describe, expect, it } from "vite-plus/test";

import { internal } from "./_generated/api";
import { makeConvexTest } from "./test.setup";

describe("devAuth password account seed", () => {
  it("relinks the review password account to the approved email user", async () => {
    const t = makeConvexTest();
    const ids = await t.run(async (ctx) => {
      const approvedUserId = await ctx.db.insert("users", {
        email: "review@example.com",
        emailVerificationTime: 1,
        isApproved: true,
      });
      const passwordUserId = await ctx.db.insert("users", {
        email: "review@example.com",
      });
      const passwordAccountId = await ctx.db.insert("authAccounts", {
        userId: passwordUserId,
        provider: "password",
        providerAccountId: "review@example.com",
      });
      return { approvedUserId, passwordAccountId, passwordUserId };
    });

    await expect(
      t.mutation(internal.devAuth.seedProviderConnectionsForPasswordAccount, {
        email: " REVIEW@example.com ",
        shouldLinkViaEmail: true,
      }),
    ).resolves.toEqual({
      userId: ids.approvedUserId,
      invalidatedUserIds: [ids.passwordUserId],
    });

    const snapshot = await t.run(async (ctx) => {
      return {
        approvedUser: await ctx.db.get(ids.approvedUserId),
        passwordAccount: await ctx.db.get(ids.passwordAccountId),
        passwordUser: await ctx.db.get(ids.passwordUserId),
      };
    });

    expect(snapshot.approvedUser?.isApproved).toBe(true);
    expect(snapshot.passwordAccount?.userId).toBe(ids.approvedUserId);
    expect(snapshot.passwordUser?.isApproved).toBeUndefined();
  });

  it("keeps preview password accounts isolated when email linking is disabled", async () => {
    const t = makeConvexTest();
    const ids = await t.run(async (ctx) => {
      const approvedUserId = await ctx.db.insert("users", {
        email: "preview@example.com",
        emailVerificationTime: 1,
        isApproved: true,
      });
      const passwordUserId = await ctx.db.insert("users", {
        email: "preview@example.com",
      });
      const passwordAccountId = await ctx.db.insert("authAccounts", {
        userId: passwordUserId,
        provider: "password",
        providerAccountId: "preview@example.com",
      });
      return { approvedUserId, passwordAccountId, passwordUserId };
    });

    await expect(
      t.mutation(internal.devAuth.seedProviderConnectionsForPasswordAccount, {
        email: "preview@example.com",
        shouldLinkViaEmail: false,
      }),
    ).resolves.toEqual({
      userId: ids.passwordUserId,
      invalidatedUserIds: [],
    });

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

  it("fails closed when review email linking has multiple approved users", async () => {
    const t = makeConvexTest();
    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        email: "duplicate@example.com",
        isApproved: true,
      });
      const secondApprovedUserId = await ctx.db.insert("users", {
        email: "duplicate@example.com",
        isApproved: true,
      });
      await ctx.db.insert("authAccounts", {
        userId: secondApprovedUserId,
        provider: "password",
        providerAccountId: "duplicate@example.com",
      });
    });

    await expect(
      t.mutation(internal.devAuth.seedProviderConnectionsForPasswordAccount, {
        email: "duplicate@example.com",
        shouldLinkViaEmail: true,
      }),
    ).rejects.toThrowError("Multiple approved users exist for duplicate@example.com");
  });
});
