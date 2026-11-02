import { describe, expect, it } from "vite-plus/test";

import { internal } from "../_generated/api";
import { makeConvexTest } from "../test.setup";

describe("clearOldPasswordHashes", () => {
  it("clears the old hash, keeps the account, and leaves other accounts alone", async () => {
    const t = makeConvexTest();
    const { oldAccountId, otherAccountId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        state: "active",
        email: "old-password@example.invalid",
      });
      return {
        oldAccountId: await ctx.db.insert("authAccounts", {
          userId,
          provider: "password",
          providerAccountId: "old-password@example.invalid",
          secret: "old-hash",
        }),
        otherAccountId: await ctx.db.insert("authAccounts", {
          userId,
          provider: "github",
          providerAccountId: "1234",
        }),
      };
    });

    await expect(
      t.mutation(internal.identity.passwordAccounts.clearOldPasswordHashes, {}),
    ).resolves.toBe(1);

    const accounts = await t.run(async (ctx) => ({
      old: await ctx.db.get(oldAccountId),
      other: await ctx.db.get(otherAccountId),
    }));
    expect(accounts.old).toMatchObject({ provider: "password" });
    expect(accounts.old).not.toHaveProperty("secret");
    expect(accounts.other).toMatchObject({ provider: "github" });
    await expect(
      t.mutation(internal.identity.passwordAccounts.clearOldPasswordHashes, {}),
    ).resolves.toBe(0);
  });
});
