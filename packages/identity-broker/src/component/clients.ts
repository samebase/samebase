import { v } from "convex/values";
// oxlint-disable-next-line samebase/no-raw-public-convex-function-builders -- Component entrypoints are internal to the host; host functions enforce access.
import { mutation, query } from "./_generated/server";
import { appView, vApp } from "./apps";
import { LEASE_MS } from "./registration";
import { vDeploymentType, vTokenEndpointAuthMethod } from "./schema";
import { removeClientGrants } from "./resourceRequests";

const { array, boolean, number, object, optional, string } = v;

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
  registrationTokenHash: optional(string()),
  removeAt: optional(number()),
  renewedAt: optional(number()),
});

/** A client without its credentials: `list` returns these, so no hash leaves the component there. */
const vClientSummary = object({
  clientId: string(),
  appId: string(),
  redirectUri: string(),
  deploymentType: vDeploymentType,
  clientName: string(),
  softwareVersion: string(),
  createdAt: number(),
  lastSignInAt: optional(number()),
  removeAt: optional(number()),
  renewedAt: optional(number()),
});

/**
 * Registers one deployment of an app as a client with its single exact redirect URI. With
 * `expires`, a preview or development client gets a removal date `LEASE_MS` after `createdAt`. A
 * production client never gets one.
 */
export const create = mutation({
  args: {
    clientId: string(),
    appId: string(),
    secretHash: string(),
    tokenEndpointAuthMethod: vTokenEndpointAuthMethod,
    redirectUri: string(),
    deploymentType: vDeploymentType,
    clientName: string(),
    softwareVersion: string(),
    createdAt: number(),
    expires: boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("clients")
      .withIndex("by_client_id", (q) => q.eq("clientId", args.clientId))
      .unique();
    if (existing !== null) {
      throw new Error(`A client with id "${args.clientId}" already exists`);
    }
    await ctx.db.insert("clients", {
      clientId: args.clientId,
      appId: args.appId,
      secretHash: args.secretHash,
      tokenEndpointAuthMethod: args.tokenEndpointAuthMethod,
      redirectUri: args.redirectUri,
      deploymentType: args.deploymentType,
      clientName: args.clientName,
      softwareVersion: args.softwareVersion,
      createdAt: args.createdAt,
      ...(args.expires && args.deploymentType !== "production"
        ? { removeAt: args.createdAt + LEASE_MS }
        : {}),
    });
    return null;
  },
});

/**
 * A deploy or a dev start of the client's deployment: false when the client is gone. It sets
 * `renewedAt`, and a client with a removal date lives `LEASE_MS` from `now`. With `expires`, a
 * preview or development client without a removal date gets one. A production client never does.
 */
export const renew = mutation({
  args: { clientId: string(), expires: boolean(), now: number() },
  returns: boolean(),
  handler: async (ctx, args) => {
    const client = await ctx.db
      .query("clients")
      .withIndex("by_client_id", (q) => q.eq("clientId", args.clientId))
      .unique();
    if (client === null) {
      return false;
    }

    const expires =
      client.removeAt !== undefined || (args.expires && client.deploymentType !== "production");
    await ctx.db.patch("clients", client._id, {
      renewedAt: args.now,
      ...(expires ? { removeAt: args.now + LEASE_MS } : {}),
    });
    return true;
  },
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

/** The newest clients of every app, first-party apps included, newest first, at most `limit`. */
export const list = query({
  args: { limit: number() },
  returns: array(vClientSummary),
  handler: async (ctx, args) => {
    const clients = await ctx.db.query("clients").order("desc").take(args.limit);
    return clients.map((client) => ({
      clientId: client.clientId,
      appId: client.appId,
      redirectUri: client.redirectUri,
      deploymentType: client.deploymentType,
      clientName: client.clientName,
      softwareVersion: client.softwareVersion,
      createdAt: client.createdAt,
      ...(client.lastSignInAt === undefined ? {} : { lastSignInAt: client.lastSignInAt }),
      ...(client.removeAt === undefined ? {} : { removeAt: client.removeAt }),
      ...(client.renewedAt === undefined ? {} : { renewedAt: client.renewedAt }),
    }));
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
