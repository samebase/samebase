"use node";

import { v } from "convex/values";
import { action, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { Resend } from "resend";

export const joinWaitlist = mutation({
  args: { email: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("waitlist")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();
    if (existing) {
      // Already on the waitlist, silently succeed
      return null;
    }
    await ctx.db.insert("waitlist", {
      email: args.email,
      createdAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.waitlist.notifyAdmin, {
      email: args.email,
    });
    return null;
  },
});

export const notifyAdmin = action({
  args: { email: v.string() },
  returns: v.null(),
  handler: async (_ctx, args) => {
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: "Noter Waitlist <onboarding@resend.dev>",
      to: "nicuchiciuc@gmail.com",
      subject: `New waitlist signup: ${args.email}`,
      text: `Someone just joined the noter waitlist: ${args.email}`,
    });
    return null;
  },
});
