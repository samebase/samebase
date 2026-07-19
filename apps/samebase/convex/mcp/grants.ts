import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";

import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { mutation, query } from "../functions";
import { parseScopeTokens } from "./scopes";

const { array, boolean, number, object, optional, string } = v;

const grantListItemValidator = object({
  clientId: string(),
  clientName: optional(string()),
  createdAt: number(),
  grantId: string(),
  lastUsedAt: optional(number()),
  resource: string(),
  scopes: array(string()),
});

export async function revokeActiveMcpGrant(
  ctx: MutationCtx,
  args: {
    action: "grant_revoked" | "refresh_token_replay_detected";
    detailsJson: string;
    grant: Doc<"mcpGrants">;
    now: number;
  },
): Promise<boolean> {
  if (args.grant.status !== "active") {
    return false;
  }

  await ctx.db.patch(args.grant._id, {
    status: "revoked",
    updatedAt: args.now,
  });
  await ctx.db.insert("audit_mcpAccess_events", {
    action: args.action,
    clientId: args.grant.clientId,
    createdAt: args.now,
    detailsJson: args.detailsJson,
    grantId: args.grant.grantId,
    userId: args.grant.userId,
  });
  return true;
}

export const listCurrentUserGrants = query({
  access: "access_mcp",
  args: {
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(grantListItemValidator),
  handler: async (ctx, args) => {
    const grants = await ctx.db
      .query("mcpGrants")
      .withIndex("by_user_id_and_status", (q) =>
        q.eq("userId", ctx.viewer.userId).eq("status", "active"),
      )
      .order("desc")
      .paginate(args.paginationOpts);

    return {
      ...grants,
      page: await Promise.all(
        grants.page.map(async (grant) => {
          const client = await ctx.db
            .query("mcpOauthClients")
            .withIndex("by_client_id", (q) => q.eq("clientId", grant.clientId))
            .first();
          return {
            clientId: grant.clientId,
            ...(client?.clientName !== undefined ? { clientName: client.clientName } : {}),
            createdAt: grant.createdAt,
            grantId: grant.grantId,
            ...(grant.lastUsedAt !== undefined ? { lastUsedAt: grant.lastUsedAt } : {}),
            resource: grant.resource,
            scopes: parseScopeTokens(grant.scope),
          };
        }),
      ),
    };
  },
});

export const revokeCurrentUserGrant = mutation({
  access: "access_mcp",
  args: {
    grantId: string(),
  },
  returns: object({ revoked: boolean() }),
  handler: async (ctx, args) => {
    const grant = await ctx.db
      .query("mcpGrants")
      .withIndex("by_grant_id", (q) => q.eq("grantId", args.grantId))
      .unique();
    if (!grant || grant.userId !== ctx.viewer.userId) {
      throw new Error("MCP client connection was not found.");
    }

    const revoked = await revokeActiveMcpGrant(ctx, {
      action: "grant_revoked",
      detailsJson: JSON.stringify({ source: "user" }),
      grant,
      now: Date.now(),
    });
    return { revoked };
  },
});
