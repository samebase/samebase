import { describe, expect, it } from "vite-plus/test";
import { internal } from "./_generated/api";
import { makeConvexTest } from "./test.setup";

describe("authAdmin password accounts", () => {
  it("creates and approves a password account without storing the plaintext password", async () => {
    const t = makeConvexTest();

    await expect(
      t.action(internal.authAdmin.createOrUpdatePasswordAccount, {
        email: " Manual@Example.com ",
        password: "first-password",
      }),
    ).resolves.toEqual({
      created: true,
      email: "manual@example.com",
    });

    const snapshot = await t.run(async (ctx) => {
      const account = await ctx.db
        .query("authAccounts")
        .withIndex("providerAndAccountId", (q) =>
          q.eq("provider", "password").eq("providerAccountId", "manual@example.com"),
        )
        .unique();
      return {
        account,
        user: account === null ? null : await ctx.db.get(account.userId),
      };
    });

    expect(snapshot.account?.secret).not.toBe("first-password");
    expect(snapshot.user).toMatchObject({
      email: "manual@example.com",
      isApproved: true,
      emailVerificationTime: expect.any(Number),
    });
  });

  it("links a new password account to one verified user", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        state: "active",
        email: "linked@example.com",
        emailVerificationTime: 1,
      });
    });

    await expect(
      t.action(internal.authAdmin.createOrUpdatePasswordAccount, {
        email: "linked@example.com",
        password: "linked-password",
      }),
    ).resolves.toEqual({
      created: true,
      email: "linked@example.com",
    });

    const snapshot = await t.run(async (ctx) => {
      const account = await ctx.db
        .query("authAccounts")
        .withIndex("providerAndAccountId", (q) =>
          q.eq("provider", "password").eq("providerAccountId", "linked@example.com"),
        )
        .unique();
      return {
        account,
        user: await ctx.db.get(userId),
      };
    });

    expect(snapshot.account?.userId).toBe(userId);
    expect(snapshot.user).toMatchObject({ isApproved: true });
  });

  it("rotates the stored password and ends existing sessions", async () => {
    const t = makeConvexTest();
    await t.action(internal.authAdmin.createOrUpdatePasswordAccount, {
      email: "rotate@example.com",
      password: "first-password",
    });
    const initial = await t.run(async (ctx) => {
      const account = await ctx.db
        .query("authAccounts")
        .withIndex("providerAndAccountId", (q) =>
          q.eq("provider", "password").eq("providerAccountId", "rotate@example.com"),
        )
        .unique();
      if (account === null) {
        throw new Error("Expected the password account to exist");
      }
      const sessionId = await ctx.db.insert("authSessions", {
        userId: account.userId,
        expirationTime: Date.now() + 60_000,
      });
      return {
        secret: account.secret,
        sessionId,
      };
    });

    await expect(
      t.action(internal.authAdmin.createOrUpdatePasswordAccount, {
        email: "rotate@example.com",
        password: "second-password",
      }),
    ).resolves.toEqual({
      created: false,
      email: "rotate@example.com",
    });

    const rotated = await t.run(async (ctx) => {
      const account = await ctx.db
        .query("authAccounts")
        .withIndex("providerAndAccountId", (q) =>
          q.eq("provider", "password").eq("providerAccountId", "rotate@example.com"),
        )
        .unique();
      return {
        secret: account?.secret,
        session: await ctx.db.get(initial.sessionId),
      };
    });

    expect(rotated.secret).not.toBe("second-password");
    expect(rotated.secret).not.toBe(initial.secret);
    expect(rotated.session).toBeNull();
  });

  it("fails instead of creating another user for a duplicate verified email", async () => {
    const t = makeConvexTest();
    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        state: "active",
        email: "duplicate@example.com",
        emailVerificationTime: 1,
      });
      await ctx.db.insert("users", {
        state: "active",
        email: "duplicate@example.com",
        emailVerificationTime: 2,
      });
    });

    await expect(
      t.action(internal.authAdmin.createOrUpdatePasswordAccount, {
        email: "duplicate@example.com",
        password: "valid-password",
      }),
    ).rejects.toThrowError("Multiple verified users exist for duplicate@example.com");
  });

  it("rejects an existing password account linked to a different same-email user", async () => {
    const t = makeConvexTest();
    const existing = await t.run(async (ctx) => {
      const accountUserId = await ctx.db.insert("users", {
        state: "active",
        email: "mismatch@example.com",
      });
      await ctx.db.insert("users", {
        state: "active",
        email: "mismatch@example.com",
        emailVerificationTime: 1,
      });
      const accountId = await ctx.db.insert("authAccounts", {
        provider: "password",
        providerAccountId: "mismatch@example.com",
        secret: "original-secret",
        userId: accountUserId,
      });
      return {
        accountId,
        accountUserId,
      };
    });

    await expect(
      t.action(internal.authAdmin.createOrUpdatePasswordAccount, {
        email: "mismatch@example.com",
        password: "replacement-password",
      }),
    ).rejects.toThrowError(
      "Password account is not linked to the verified user for mismatch@example.com",
    );

    const unchanged = await t.run(async (ctx) => {
      return {
        account: await ctx.db.get(existing.accountId),
        user: await ctx.db.get(existing.accountUserId),
      };
    });
    expect(unchanged.account?.secret).toBe("original-secret");
    expect(unchanged.user).not.toMatchObject({ isApproved: true });
  });

  it("rejects an existing password account whose linked user is missing", async () => {
    const t = makeConvexTest();
    await t.run(async (ctx) => {
      const deletedUserId = await ctx.db.insert("users", {
        state: "active",
        email: "missing-user@example.com",
      });
      await ctx.db.delete(deletedUserId);
      await ctx.db.insert("authAccounts", {
        provider: "password",
        providerAccountId: "missing-user@example.com",
        secret: "original-secret",
        userId: deletedUserId,
      });
    });

    await expect(
      t.action(internal.authAdmin.createOrUpdatePasswordAccount, {
        email: "missing-user@example.com",
        password: "replacement-password",
      }),
    ).rejects.toThrowError("Password account user does not exist for missing-user@example.com");
  });

  it("rejects an existing password account whose linked user has another email", async () => {
    const t = makeConvexTest();
    await t.run(async (ctx) => {
      const accountUserId = await ctx.db.insert("users", {
        state: "active",
        email: "other@example.com",
      });
      await ctx.db.insert("authAccounts", {
        provider: "password",
        providerAccountId: "mismatched-email@example.com",
        secret: "original-secret",
        userId: accountUserId,
      });
    });

    await expect(
      t.action(internal.authAdmin.createOrUpdatePasswordAccount, {
        email: "mismatched-email@example.com",
        password: "replacement-password",
      }),
    ).rejects.toThrowError(
      "Password account user email does not match mismatched-email@example.com",
    );
  });

  it("rejects invalid account input before writing", async () => {
    const t = makeConvexTest();

    await expect(
      t.action(internal.authAdmin.createOrUpdatePasswordAccount, {
        email: "not-an-email",
        password: "valid-password",
      }),
    ).rejects.toThrowError("A valid email address is required.");
    await expect(
      t.action(internal.authAdmin.createOrUpdatePasswordAccount, {
        email: "manual@example.com",
        password: "short",
      }),
    ).rejects.toThrowError("Password must contain at least 8 characters");
  });
});
