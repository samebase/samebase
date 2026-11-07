import { v } from "convex/values";
// oxlint-disable-next-line samebase/no-raw-public-convex-function-builders -- Component entrypoints are internal to the host; host functions enforce access.
import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { appView, vApp } from "./apps";
import { registrationOf, vRegistration } from "./policy";
import { exemptionOf, vExemption } from "./signInPage";
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
  connectors: array(string()),
});

/**
 * A client with its app and the facts the host's policy decides on. `registration` is null when the
 * app is gone or the client is not a repository's (`registrationOf`).
 */
export const vClientWithApp = object({
  client: vClient,
  app: v.union(vApp, v.null()),
  registration: v.union(vRegistration, v.null()),
});

export async function clientWithApp(ctx: QueryCtx, row: Doc<"clients">) {
  const { _id, _creationTime, ...client } = row;
  const app = await ctx.db
    .query("apps")
    .withIndex("by_app_id", (q) => q.eq("appId", client.appId))
    .unique();
  return {
    client,
    app: app === null ? null : await appView(ctx, app),
    registration: app === null ? null : await registrationOf(ctx, row, app),
  };
}

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

/** A client with its app and its policy facts, in one call, for the start of each use of it. */
export const withApp = query({
  args: { clientId: string() },
  returns: v.union(vClientWithApp, v.null()),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("clients")
      .withIndex("by_client_id", (q) => q.eq("clientId", args.clientId))
      .unique();
    return row === null ? null : await clientWithApp(ctx, row);
  },
});

/**
 * `withApp` for `/authorize`, with the exemptions from the sign-in page that cover the client
 * (`signInPage.ts`), read in the same snapshot as its facts. Only `/authorize` decides the page, so
 * only it reads them; the policy never sees them.
 */
export const forAuthorize = query({
  args: { clientId: string() },
  returns: v.union(object({ ...vClientWithApp.fields, exemption: vExemption }), v.null()),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("clients")
      .withIndex("by_client_id", (q) => q.eq("clientId", args.clientId))
      .unique();
    if (row === null) {
      return null;
    }
    const found = await clientWithApp(ctx, row);
    return {
      ...found,
      exemption: await exemptionOf(ctx, {
        appId: row.appId,
        // The tenant's recorded owner, which the facts carry; no facts, no exemption.
        tenantOwnerId: found.registration?.ownerId,
        clientOwnerId: row.registeredBy.githubOwnerId,
      }),
    };
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

/**
 * Deletes a client and its provider grants, as the hub's administrator. The deployment that held it
 * gets a new client at its next deploy. `changed` is false for a client that was already gone.
 */
export const remove = mutation({
  args: { clientId: string() },
  returns: object({ changed: v.boolean() }),
  handler: async (ctx, args) => {
    const client = await ctx.db
      .query("clients")
      .withIndex("by_client_id", (q) => q.eq("clientId", args.clientId))
      .unique();
    if (client !== null) {
      await ctx.db.delete("clients", client._id);
    }
    await removeClientGrants(ctx, args.clientId);
    return { changed: client !== null };
  },
});
