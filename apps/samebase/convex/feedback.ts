import { ConvexError, v } from "convex/values";

import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { sendEmail } from "./email";
import { MAX_FEEDBACK_REPORT_LENGTH, submitFeedbackContract } from "./mcp/contracts/submitFeedback";
import { defineMcpTool } from "./toolRuntime/mcpTool";

const FEEDBACK_SEND_LIMIT = 5;
const FEEDBACK_SEND_WINDOW_MS = 24 * 60 * 60 * 1_000;

export const reserveSend = internalMutation({
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
        throw new ConvexError("Feedback rate limit reached. Try again later.");
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

/** MCP-only: the dashboard has no feedback form. */
export const submit = defineMcpTool({
  contract: submitFeedbackContract,
  args: submitFeedbackContract.args,
  successFields: {},
  run: async (ctx, args) => {
    if (args.report.trim().length === 0) {
      throw new ConvexError("Feedback report cannot be empty.");
    }
    if (args.report.length > MAX_FEEDBACK_REPORT_LENGTH) {
      throw new ConvexError(
        `Feedback report must be ${MAX_FEEDBACK_REPORT_LENGTH} characters or fewer.`,
      );
    }

    await ctx.runMutation(internal.feedback.reserveSend, {
      userId: args.userId,
    });
    const emailResult = await sendEmail(ctx, {
      to: "contact@samebase.com",
      subject: "Samebase agent feedback",
      text: args.report,
    });
    if (!emailResult.ok) {
      return {
        status: "error" as const,
        text:
          emailResult.error === "unknown"
            ? "Feedback delivery could not be confirmed. Do not submit it again until Samebase has checked its delivery status."
            : "Samebase could not send the feedback email.",
      };
    }
    if (emailResult.value === "skipped") {
      return {
        status: "error" as const,
        text: "Feedback email is not configured in local development.",
      };
    }
    if (emailResult.value === "queued") {
      return {
        text: "Feedback is queued for delivery to Samebase. Cloudflare has delayed sending. Do not submit it again; the email component will retry automatically.",
      };
    }
    return { text: "Feedback submitted to Samebase." };
  },
});
