import { v } from "convex/values";

import { internalMutation } from "./_generated/server";

const { number, object } = v;

const MAX_AUDITED_USERS = 1_000;

const cleanupUnusedUserImageResult = object({
  scanned: number(),
  updated: number(),
});

/** Remove the provider image that Samebase does not read. */
export const cleanupUnusedUserImage = internalMutation({
  args: {},
  returns: cleanupUnusedUserImageResult,
  handler: async (ctx) => {
    const users = await ctx.db.query("users").take(MAX_AUDITED_USERS + 1);
    if (users.length > MAX_AUDITED_USERS) {
      throw new Error("Unused user image cleanup exceeds its audited row limit.");
    }

    let updated = 0;
    for (const user of users) {
      if (user.state === "deleted" || user.image === undefined) {
        continue;
      }

      await ctx.db.patch(user._id, {
        image: undefined,
      });
      updated += 1;
    }

    return {
      scanned: users.length,
      updated,
    };
  },
});
