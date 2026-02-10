import { getAuthUserId } from "@convex-dev/auth/server";
import { internalQuery, query } from "./_generated/server";
import { v } from "convex/values";

const ADMIN_USERNAMES = ["nicu-chiciuc"];

export function isAdminUser(githubUsername: string): boolean {
  return ADMIN_USERNAMES.includes(githubUsername);
}

// Public

export const viewer = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    return userId !== null ? ctx.db.get(userId) : null;
  },
});

export const isCurrentUserApproved = query({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return false;
    const user = await ctx.db.get(userId);
    if (!user) return false;
    if (user.isApproved === true) return true;
    if (isAdminUser(user.githubUsername)) return true;
    return false;
  },
});

// Internal

export const getAuthUser = internalQuery({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    return userId !== null ? ctx.db.get(userId) : null;
  },
});

export const getById = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    return ctx.db.get(args.userId);
  },
});
