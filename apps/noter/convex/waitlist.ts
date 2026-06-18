import { v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation } from "./functions";

/**
 * Normalize Gmail aliases: strip `+tag` from Gmail addresses.
 * Only applies to gmail.com addresses.
 */
function normalizeEmail(email: string): string {
  const [local, domain] = email.toLowerCase().split("@");
  if (domain === "gmail.com") {
    const base = local.split("+")[0];
    return `${base}@${domain}`;
  }
  return email.toLowerCase();
}

export const joinWaitlist = mutation({
  access: "access_public",
  args: { email: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const normalized = normalizeEmail(args.email);
    const existing = await ctx.db
      .query("waitlist")
      .withIndex("by_email", (q) => q.eq("email", normalized))
      .unique();
    if (existing) {
      return null;
    }
    await ctx.db.insert("waitlist", {
      email: normalized,
      createdAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.waitlistActions.notifyAdmin, {
      email: args.email,
    });
    return null;
  },
});
