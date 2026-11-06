import { v } from "convex/values";
// oxlint-disable-next-line samebase/no-raw-public-convex-function-builders -- Component entrypoints are internal to the host; host functions enforce access.
import { mutation, query } from "./_generated/server";
import { appView, vApp } from "./apps";
import { vDeploymentType, vRegisteredBy, vTokenEndpointAuthMethod } from "./schema";
import { removeClientGrants } from "./resourceRequests";

const { array, number, object, optional, string } = v;

const vClient = object({
  clientId: string(),
  appId: string(),
  secretHash: string(),
  tokenEndpointAuthMethod: vTokenEndpointAuthMethod,
  redirectUri: string(),
  deploymentType: vDeploymentType,
  clientName: string(),
  softwareVersion: string(),
  createdAt: number(),
  lastSignInAt: optional(number()),
  registrationTokenHash: string(),
  removeAt: optional(number()),
  renewedAt: number(),
  app: string(),
  registeredBy: vRegisteredBy,
});

export const get = query({
  args: { clientId: string() },
  returns: v.union(vClient, v.null()),
  handler: async (ctx, args) => {
    const client = await ctx.db
      .query("clients")
      .withIndex("by_client_id", (q) => q.eq("clientId", args.clientId))
      .unique();
    if (client === null) {
      return null;
    }
    const { _id, _creationTime, ...fields } = client;
    return fields;
  },
});

/** A client with its app, in one call, for the start of `/authorize`. */
export const withApp = query({
  args: { clientId: string() },
  returns: v.union(object({ client: vClient, app: v.union(vApp, v.null()) }), v.null()),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("clients")
      .withIndex("by_client_id", (q) => q.eq("clientId", args.clientId))
      .unique();
    if (row === null) {
      return null;
    }
    const { _id, _creationTime, ...client } = row;
    const app = await ctx.db
      .query("apps")
      .withIndex("by_app_id", (q) => q.eq("appId", client.appId))
      .unique();
    return { client, app: app === null ? null : await appView(ctx, app) };
  },
});

export const listByApp = query({
  args: { appId: string() },
  returns: array(vClient),
  handler: async (ctx, args) => {
    const clients = await ctx.db
      .query("clients")
      .withIndex("by_app_id", (q) => q.eq("appId", args.appId))
      .collect();
    return clients
      .map(({ _id, _creationTime, ...fields }) => fields)
      .sort((a, b) => a.createdAt - b.createdAt || a.clientId.localeCompare(b.clientId));
  },
});

export const remove = mutation({
  args: { clientId: string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const client = await ctx.db
      .query("clients")
      .withIndex("by_client_id", (q) => q.eq("clientId", args.clientId))
      .unique();
    if (client !== null) {
      await ctx.db.delete("clients", client._id);
    }
    await removeClientGrants(ctx, args.clientId);
    return null;
  },
});
