import { Infer, v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { requireOrganizationAccessContext } from "./organizationAccess";

export const vOAuthProvider = v.union(
  v.literal("github"),
  v.literal("convex"),
  v.literal("cloudflare"),
  v.literal("cloudflare_mcp"),
);

export type OAuthProvider = Infer<typeof vOAuthProvider>;

export const createOauthState = internalMutation({
  args: {
    provider: vOAuthProvider,
    userId: v.id("users"),
    providerConnectionId: v.optional(v.id("providerConnections")),
    state: v.string(),
    returnToPath: v.optional(v.string()),
    codeVerifier: v.optional(v.string()),
    clientId: v.optional(v.string()),
    clientSecret: v.optional(v.string()),
    createdAt: v.number(),
    expiresAt: v.number(),
  },
  returns: v.id("providerOAuthCallbackStates"),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user || user.accountDeletion) {
      throw new Error("Account deletion is in progress.");
    }
    const access = await requireOrganizationAccessContext(ctx.db, args.userId);
    return await ctx.db.insert("providerOAuthCallbackStates", {
      provider: args.provider,
      userId: args.userId,
      organizationId: access.organizationId,
      providerConnectionId: args.providerConnectionId,
      state: args.state,
      returnToPath: args.returnToPath,
      codeVerifier: args.codeVerifier,
      clientId: args.clientId,
      clientSecret: args.clientSecret,
      createdAt: args.createdAt,
      expiresAt: args.expiresAt,
    });
  },
});

export const getOauthStateByState = internalQuery({
  args: {
    provider: vOAuthProvider,
    state: v.string(),
  },
  handler: async (ctx, args) => {
    const record = await ctx.db
      .query("providerOAuthCallbackStates")
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
    id: v.id("providerOAuthCallbackStates"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
    return null;
  },
});
