import { v } from "convex/values";
import { internal } from "./_generated/api";
// oxlint-disable-next-line samebase/no-raw-public-convex-function-builders -- Component entrypoints are internal to the host; host functions enforce access.
import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { BATCH } from "./lifecycle";

const { array, boolean, number, object, optional, string } = v;

export const vApp = object({
  appId: string(),
  name: string(),
  firstParty: boolean(),
  connector: optional(string()),
  tenantId: optional(string()),
  /** The tenant of the app is suspended. */
  suspended: boolean(),
  createdAt: number(),
});

export async function isSuspended(ctx: QueryCtx, tenantId: string | undefined): Promise<boolean> {
  if (tenantId === undefined) {
    return false;
  }
  const tenant = await ctx.db
    .query("tenants")
    .withIndex("by_tenant_id", (q) => q.eq("tenantId", tenantId))
    .unique();
  return tenant?.suspendedAt !== undefined;
}

/** An app row with what `/authorize` and `/continue` need to know about its tenant. */
export async function appView(ctx: QueryCtx, app: Doc<"apps">) {
  return {
    appId: app.appId,
    name: app.name,
    firstParty: app.firstParty,
    ...(app.connector === undefined ? {} : { connector: app.connector }),
    ...(app.tenantId === undefined ? {} : { tenantId: app.tenantId }),
    suspended: await isSuspended(ctx, app.tenantId),
    createdAt: app.createdAt,
  };
}

/** Registers an app. Its clients come later, one per deployment. */
export const create = mutation({
  args: {
    appId: string(),
    name: string(),
    firstParty: boolean(),
    createdAt: number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("apps")
      .withIndex("by_app_id", (q) => q.eq("appId", args.appId))
      .unique();
    if (existing !== null) {
      throw new Error(`An app with id "${args.appId}" already exists`);
    }
    await ctx.db.insert("apps", {
      appId: args.appId,
      name: args.name,
      firstParty: args.firstParty,
      createdAt: args.createdAt,
    });
    return null;
  },
});

export const get = query({
  args: { appId: string() },
  returns: v.union(vApp, v.null()),
  handler: async (ctx, args) => {
    const app = await ctx.db
      .query("apps")
      .withIndex("by_app_id", (q) => q.eq("appId", args.appId))
      .unique();
    return app === null ? null : await appView(ctx, app);
  },
});

export const list = query({
  args: {},
  returns: array(vApp),
  handler: async (ctx) => {
    const apps = await ctx.db.query("apps").collect();
    const views = await Promise.all(apps.map((app) => appView(ctx, app)));
    return views.sort((a, b) => a.createdAt - b.createdAt || a.appId.localeCompare(b.appId));
  },
});

async function removeRows(ctx: MutationCtx, appId: string): Promise<void> {
  const clients = await ctx.db
    .query("clients")
    .withIndex("by_app_id", (q) => q.eq("appId", appId))
    .take(BATCH);
  for (const client of clients) {
    await ctx.db.delete("clients", client._id);
  }
  if (clients.length === BATCH) {
    await ctx.scheduler.runAfter(0, internal.apps.continueRemove, { appId });
  }
}

/**
 * Deletes an app with its clients. This is the emergency revocation. The app row goes first:
 * /authorize and /token refuse a client whose app is gone, so this transaction revokes every client
 * of the app, however many batches their rows take to delete.
 */
export const remove = mutation({
  args: { appId: string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const app = await ctx.db
      .query("apps")
      .withIndex("by_app_id", (q) => q.eq("appId", args.appId))
      .unique();
    if (app !== null) {
      await ctx.db.delete("apps", app._id);
    }
    await removeRows(ctx, args.appId);
    return null;
  },
});

export const continueRemove = internalMutation({
  args: { appId: string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await removeRows(ctx, args.appId);
    return null;
  },
});
