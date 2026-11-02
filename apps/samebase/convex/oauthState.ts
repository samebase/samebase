import { v } from "convex/values";

import { internalMutation, internalQuery } from "./_generated/server";
import { requireOrganizationOwnerAccessContext } from "./organizationAccess";
import {
  vCloudflareMcpProviderOAuthCallbackState,
  vCloudflareProviderOAuthCallbackState,
  vConvexProviderOAuthCallbackState,
  vOAuthProvider,
} from "./organization/providerCredentialModel";
import { getOrganizationProviderConfiguration } from "./organizationProviderCredentials";
import { hashOrganizationProviderSnapshot } from "./providerAuthFingerprint";
import { readActiveUser } from "./identity/lifecycle";

export {
  vOAuthProvider,
  vProviderOAuthStoreResult,
  type OAuthProvider,
  type ProviderOAuthStoreResult,
} from "./organization/providerCredentialModel";

const providerOAuthCallbackStateSystemFields = {
  _id: v.id("providerOAuthCallbackStates"),
  _creationTime: v.number(),
};
const vProviderOAuthCallbackStateResult = v.union(
  vConvexProviderOAuthCallbackState.extend(providerOAuthCallbackStateSystemFields),
  vCloudflareProviderOAuthCallbackState.extend(providerOAuthCallbackStateSystemFields),
  vCloudflareMcpProviderOAuthCallbackState.extend(providerOAuthCallbackStateSystemFields),
);

const stateCreationFields = {
  userId: v.id("users"),
  organizationId: v.id("organizations"),
  returnToPath: v.optional(v.string()),
  state: v.string(),
  codeVerifier: v.string(),
  createdAt: v.number(),
  expiresAt: v.number(),
};

export const createOauthState = internalMutation({
  args: {
    provider: vOAuthProvider,
    ...stateCreationFields,
    clientId: v.optional(v.string()),
  },
  returns: v.id("providerOAuthCallbackStates"),
  handler: async (ctx, args) => {
    const [user, organization] = await Promise.all([
      ctx.db.get(args.userId),
      ctx.db.get(args.organizationId),
    ]);
    if (user === null || readActiveUser(user) === null) {
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
      returnToPath: args.returnToPath,
      state: args.state,
      createdAt: args.createdAt,
      expiresAt: args.expiresAt,
      codeVerifier: args.codeVerifier,
    };
    switch (args.provider) {
      case "convex":
      case "cloudflare":
        if (args.clientId !== undefined)
          throw new Error("Resource authorization uses the configured hub client.");
        return await ctx.db.insert("providerOAuthCallbackStates", {
          provider: args.provider,
          ...commonState,
        });
      case "cloudflare_mcp":
        if (args.clientId === undefined)
          throw new Error("Cloudflare MCP authorization requires its client ID.");
        return await ctx.db.insert("providerOAuthCallbackStates", {
          provider: "cloudflare_mcp",
          ...commonState,
          clientId: args.clientId,
        });
      default:
        args.provider satisfies never;
        throw new Error("Unsupported OAuth provider.");
    }
  },
});

export const getResourceOauthState = internalQuery({
  args: { state: v.string() },
  returns: v.union(
    vConvexProviderOAuthCallbackState.extend(providerOAuthCallbackStateSystemFields),
    vCloudflareProviderOAuthCallbackState.extend(providerOAuthCallbackStateSystemFields),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const record = await ctx.db
      .query("providerOAuthCallbackStates")
      .withIndex("by_state", (q) => q.eq("state", args.state))
      .unique();
    if (record === null || record.provider === "cloudflare_mcp") return null;
    const user = await ctx.db.get(record.userId);
    return user === null || readActiveUser(user) === null ? null : record;
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
    const user = await ctx.db.get(record.userId);
    if (user === null || readActiveUser(user) === null) {
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
