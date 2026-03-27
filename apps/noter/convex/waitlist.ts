import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { internal } from "./_generated/api";

const { null: nullValidator, optional, string } = v;

/**
 * Normalize optional contact emails so operator notifications do not split one
 * person across trivial casing or Gmail alias differences.
 */
function normalizeOptionalEmail(email: string | undefined) {
  const normalizedEmail = email?.trim().toLowerCase();
  if (!normalizedEmail) {
    return undefined;
  }

  const [local, domain] = normalizedEmail.split("@");
  if (domain === "gmail.com") {
    const base = local.split("+")[0];
    return `${base}@${domain}`;
  }
  return normalizedEmail;
}

export const joinWaitlist = mutation({
  args: {
    message: string(),
    email: optional(string()),
  },
  returns: nullValidator(),
  handler: async (ctx, args) => {
    const message = args.message.trim();
    if (!message) {
      throw new Error("Message is required.");
    }

    // Repeated notes from the same person are legitimate product signal, so
    // the landing flow intentionally stores each submission instead of deduping.
    const normalizedEmail = normalizeOptionalEmail(args.email);
    await ctx.db.insert("waitlist", {
      email: normalizedEmail,
      message,
      createdAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.waitlistActions.notifyAdmin, {
      email: normalizedEmail,
      message,
    });
    return null;
  },
});
