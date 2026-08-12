import { expect, it } from "vite-plus/test";

import { internal } from "./_generated/api";
import { makeConvexTest } from "./test.setup";

it("clears stored user profile fields that Samebase does not read", async () => {
  const t = makeConvexTest();
  const userIds = await t.run(async (ctx) => {
    const storedProfileUserId = await ctx.db.insert("users", {
      state: "active",
      email: "stored-profile@example.test",
      name: "Provider name",
      image: "https://example.test/avatar.png",
    });
    const minimalUserId = await ctx.db.insert("users", {
      state: "active",
      email: "minimal@example.test",
    });
    const deletedUserId = await ctx.db.insert("users", {
      state: "deleted",
      deletedAt: 1,
    });
    return [storedProfileUserId, minimalUserId, deletedUserId];
  });

  await expect(
    t.mutation(internal.userProfileMigration.cleanupUnusedUserProfileFields, {}),
  ).resolves.toEqual({
    scanned: 3,
    updated: 1,
  });

  const users = await t.run(async (ctx) => await Promise.all(userIds.map((id) => ctx.db.get(id))));
  for (const user of users) {
    expect(user).not.toHaveProperty("name");
    expect(user).not.toHaveProperty("image");
  }
});
