import { getAuthUserId } from "@convex-dev/auth/server";
import { internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";

const ADMIN_USERNAMES = ["nicu-chiciuc"];
const ALLOWED_EMAILS = ["nicu.dev@gmail.com"];

export function isAdminUser(githubUsername: string | null | undefined): boolean {
  if (!githubUsername) {
    return false;
  }
  return ADMIN_USERNAMES.includes(githubUsername);
}

function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) {
    return false;
  }
  return ALLOWED_EMAILS.includes(email.toLowerCase());
}

// Public

export const viewer = query({
  args: {},
  returns: v.union(
    v.object({
      _id: v.id("users"),
      name: v.optional(v.string()),
      image: v.optional(v.string()),
      email: v.optional(v.string()),
      githubUsername: v.optional(v.string()),
      hasGithubAccessToken: v.boolean(),
      hasConvexAccessToken: v.boolean(),
      hasCloudflareAccessToken: v.boolean(),
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return null;
    }
    const user = await ctx.db.get(userId);
    if (!user) {
      return null;
    }
    return {
      _id: user._id,
      name: user.name,
      image: user.image,
      email: user.email,
      githubUsername: user.githubUsername,
      hasGithubAccessToken: typeof user.githubAccessToken === "string",
      hasConvexAccessToken: typeof user.convexAccessToken === "string",
      hasCloudflareAccessToken: typeof user.cloudflareAccessToken === "string",
    };
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
    if (isAllowedEmail(user.email)) return true;
    return false;
  },
});

export const getGithubConnectionStatus = query({
  args: {},
  returns: v.object({
    connected: v.boolean(),
    username: v.optional(v.string()),
  }),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return { connected: false };
    }
    const user = await ctx.db.get(userId);
    if (!user) {
      return { connected: false };
    }
    return {
      connected: typeof user.githubAccessToken === "string",
      username: user.githubUsername,
    };
  },
});

export const disconnectGithub = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("User not authenticated");
    }
    await ctx.db.patch(userId, {
      githubAccessToken: undefined,
      githubRefreshToken: undefined,
      githubExpiresAt: undefined,
      githubUsername: undefined,
    });
    return null;
  },
});

export const getConvexConnectionStatus = query({
  args: {},
  returns: v.object({
    connected: v.boolean(),
    teamId: v.optional(v.string()),
    teamSlug: v.optional(v.string()),
  }),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return { connected: false };
    }
    const user = await ctx.db.get(userId);
    if (!user) {
      return { connected: false };
    }
    return {
      connected:
        typeof user.convexAccessToken === "string" &&
        typeof user.convexTeamId === "string",
      teamId: user.convexTeamId,
      teamSlug: user.convexTeamSlug,
    };
  },
});

export const disconnectConvex = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("User not authenticated");
    }
    await ctx.db.patch(userId, {
      convexAccessToken: undefined,
      convexRefreshToken: undefined,
      convexExpiresAt: undefined,
      convexUserId: undefined,
      convexTeamId: undefined,
      convexTeamSlug: undefined,
    });
    return null;
  },
});

export const getCloudflareConnectionStatus = query({
  args: {},
  returns: v.object({
    connected: v.boolean(),
    accountId: v.optional(v.string()),
    accountName: v.optional(v.string()),
  }),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return { connected: false };
    }
    const user = await ctx.db.get(userId);
    if (!user) {
      return { connected: false };
    }
    return {
      connected:
        typeof user.cloudflareAccessToken === "string" &&
        typeof user.cloudflareAccountId === "string",
      accountId: user.cloudflareAccountId,
      accountName: user.cloudflareAccountName,
    };
  },
});

export const disconnectCloudflare = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("User not authenticated");
    }
    await ctx.db.patch(userId, {
      cloudflareAccessToken: undefined,
      cloudflareRefreshToken: undefined,
      cloudflareExpiresAt: undefined,
      cloudflareAccountId: undefined,
      cloudflareAccountName: undefined,
    });
    return null;
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
