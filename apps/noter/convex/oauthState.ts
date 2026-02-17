import { Infer, v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

export const OAuthProvider = v.union(
  v.literal("convex"),
  v.literal("cloudflare"),
);

export type OAuthProvider = Infer<typeof OAuthProvider>;

export const createOauthState = internalMutation({
  args: {
    provider: OAuthProvider,
    userId: v.id("users"),
    state: v.string(),
    codeVerifier: v.string(),
    createdAt: v.number(),
    expiresAt: v.number(),
  },
  returns: v.id("oauthStates"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("oauthStates", {
      provider: args.provider,
      userId: args.userId,
      state: args.state,
      codeVerifier: args.codeVerifier,
      createdAt: args.createdAt,
      expiresAt: args.expiresAt,
    });
  },
});

export const getOauthStateByState = internalQuery({
  args: {
    provider: OAuthProvider,
    state: v.string(),
  },
  handler: async (ctx, args) => {
    const record = await ctx.db
      .query("oauthStates")
      .withIndex("by_state", (q) => q.eq("state", args.state))
      .first();
    if (record?.provider !== args.provider) {
      return null;
    }
    return record;
  },
});

export const deleteOauthState = internalMutation({
  args: {
    id: v.id("oauthStates"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
    return null;
  },
});
