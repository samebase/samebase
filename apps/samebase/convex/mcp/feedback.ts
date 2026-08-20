import { v } from "convex/values";

import { internalMutation } from "../_generated/server";

const FEEDBACK_SEND_LIMIT = 5;
const FEEDBACK_SEND_WINDOW_MS = 24 * 60 * 60 * 1_000;

export const reserveFeedbackSend = internalMutation({
  args: {
    userId: v.id("users"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const rateLimit = await ctx.db
      .query("mcpFeedbackRateLimits")
      .withIndex("by_user_id", (query) => query.eq("userId", args.userId))
      .unique();

    if (rateLimit && rateLimit._creationTime + FEEDBACK_SEND_WINDOW_MS > Date.now()) {
      if (rateLimit.count >= FEEDBACK_SEND_LIMIT) {
        throw new Error("Feedback rate limit reached. Try again later.");
      }
      await ctx.db.patch(rateLimit._id, { count: rateLimit.count + 1 });
      return null;
    }

    if (rateLimit) {
      await ctx.db.delete(rateLimit._id);
    }
    await ctx.db.insert("mcpFeedbackRateLimits", {
      userId: args.userId,
      count: 1,
    });
    return null;
  },
});
