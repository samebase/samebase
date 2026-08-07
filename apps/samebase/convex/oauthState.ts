import { v, type Infer } from "convex/values";

import { internalMutation, internalQuery } from "./_generated/server";
import { requireOrganizationAccessContext } from "./organizationAccess";
import { getProviderConnectionByIdForOrganization } from "./providerConnections";
import {
  vOAuthProvider,
  vProviderOAuthCallbackState,
  type OAuthProvider,
  type ProviderKind,
} from "./providerConnectionModel";

export { vOAuthProvider, type OAuthProvider } from "./providerConnectionModel";

export const vProviderOAuthStoreResult = v.union(
  v.object({ status: v.literal("stored") }),
  v.object({ status: v.literal("access_lost") }),
);
export type ProviderOAuthStoreResult = Infer<typeof vProviderOAuthStoreResult>;

const vProviderOAuthCallbackStateResult = vProviderOAuthCallbackState.extend({
  _id: v.id("providerOAuthCallbackStates"),
  _creationTime: v.number(),
});

function providerKindForOAuthProvider(provider: OAuthProvider): ProviderKind {
  switch (provider) {
    case "convex":
      return "convex";
    case "cloudflare":
    case "cloudflare_mcp":
      return "cloudflare";
  }
}

export const createOauthState = internalMutation({
  args: {
    provider: vOAuthProvider,
    userId: v.id("users"),
    organizationId: v.id("organizations"),
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
    const [user, organization] = await Promise.all([
      ctx.db.get(args.userId),
      ctx.db.get(args.organizationId),
    ]);
    if (user === null || user.accountDeletion !== undefined) {
      throw new Error("Account deletion is in progress.");
    }
    if (organization === null) {
      throw new Error("Organization not found.");
    }
    await requireOrganizationAccessContext(ctx.db, args);
    if (args.providerConnectionId !== undefined) {
      const connection = await getProviderConnectionByIdForOrganization(ctx.db, {
        organizationId: args.organizationId,
        providerConnectionId: args.providerConnectionId,
        kind: providerKindForOAuthProvider(args.provider),
      });
      if (connection === null) {
        throw new Error("Provider connection not found.");
      }
    }
    return await ctx.db.insert("providerOAuthCallbackStates", args);
  },
});

export const getOauthStateByState = internalQuery({
  args: {
    provider: vOAuthProvider,
    state: v.string(),
  },
  returns: v.union(vProviderOAuthCallbackStateResult, v.null()),
  handler: async (ctx, args) => {
    const record = await ctx.db
      .query("providerOAuthCallbackStates")
      .withIndex("by_state", (query) => query.eq("state", args.state))
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
