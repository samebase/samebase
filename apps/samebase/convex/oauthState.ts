import { v } from "convex/values";

import { internalMutation, internalQuery } from "./_generated/server";
import { requireOrganizationOwnerAccessContext } from "./organizationAccess";
import {
  vCloudflareMcpProviderOAuthCallbackState,
  vCloudflareProviderOAuthCallbackState,
  vConvexProviderOAuthCallbackState,
  vOAuthProvider,
} from "./organizationProviderCredentialModel";
import { getOrganizationProviderConfiguration } from "./organizationProviderCredentials";
import { hashOrganizationProviderSnapshot } from "./providerAuthFingerprint";

export {
  vOAuthProvider,
  vProviderOAuthStoreResult,
  type OAuthProvider,
  type ProviderOAuthStoreResult,
} from "./organizationProviderCredentialModel";

const providerOAuthCallbackStateSystemFields = {
  _id: v.id("providerOAuthCallbackStates"),
  _creationTime: v.number(),
};
const vProviderOAuthCallbackStateResult = v.union(
  vConvexProviderOAuthCallbackState.extend(providerOAuthCallbackStateSystemFields),
  vCloudflareProviderOAuthCallbackState.extend(providerOAuthCallbackStateSystemFields),
  vCloudflareMcpProviderOAuthCallbackState.extend(providerOAuthCallbackStateSystemFields),
);

export const createOauthState = internalMutation({
  args: {
    provider: vOAuthProvider,
    userId: v.id("users"),
    organizationId: v.id("organizations"),
    state: v.string(),
    codeVerifier: v.optional(v.string()),
    clientId: v.optional(v.string()),
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
    await requireOrganizationOwnerAccessContext(ctx.db, args);
    const configuration = await getOrganizationProviderConfiguration(ctx.db, args.organizationId);
    const expectedProviderSnapshotHash =
      args.provider === "convex"
        ? await hashOrganizationProviderSnapshot({
            provider: "convex",
            teamId: configuration.convexTeam?.teamId,
            credential: configuration.convexCredential,
          })
        : await hashOrganizationProviderSnapshot({
            provider: "cloudflare",
            accountId: configuration.cloudflareAccount?.accountId,
            credential: configuration.cloudflareCredential,
          });
    const commonState = {
      userId: args.userId,
      organizationId: args.organizationId,
      expectedProviderSnapshotHash,
      state: args.state,
      createdAt: args.createdAt,
      expiresAt: args.expiresAt,
    };
    switch (args.provider) {
      case "convex":
        if (args.codeVerifier === undefined || args.clientId !== undefined) {
          throw new Error("Convex OAuth state has invalid PKCE fields.");
        }
        return await ctx.db.insert("providerOAuthCallbackStates", {
          provider: "convex",
          ...commonState,
          codeVerifier: args.codeVerifier,
        });
      case "cloudflare":
        if (args.codeVerifier !== undefined || args.clientId !== undefined) {
          throw new Error("Cloudflare OAuth state cannot contain PKCE fields.");
        }
        return await ctx.db.insert("providerOAuthCallbackStates", {
          provider: "cloudflare",
          ...commonState,
        });
      case "cloudflare_mcp":
        if (args.codeVerifier === undefined || args.clientId === undefined) {
          throw new Error("Cloudflare MCP OAuth state requires PKCE fields.");
        }
        return await ctx.db.insert("providerOAuthCallbackStates", {
          provider: "cloudflare_mcp",
          ...commonState,
          codeVerifier: args.codeVerifier,
          clientId: args.clientId,
        });
      default:
        args.provider satisfies never;
        throw new Error("Unsupported OAuth provider.");
    }
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
