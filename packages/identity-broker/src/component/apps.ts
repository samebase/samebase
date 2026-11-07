import { v } from "convex/values";
import { internal } from "./_generated/api";
// oxlint-disable-next-line samebase/no-raw-public-convex-function-builders -- Component entrypoints are internal to the host; host functions enforce access.
import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { BATCH } from "./lifecycle";

const { array, boolean, number, object, string } = v;

export const vApp = object({
  appId: string(),
  name: string(),
  tenantId: string(),
  /** The host blocked the tenant of the app, or its owner. */
  suspended: boolean(),
  createdAt: number(),
});

export async function tenantRow(ctx: QueryCtx, tenantId: string) {
  return await ctx.db
    .query("tenants")
    .withIndex("by_tenant_id", (q) => q.eq("tenantId", tenantId))
    .unique();
}

/** The tenant of a GitHub repository. */
export function tenantIdOf(githubRepositoryDatabaseId: string) {
  return `gh-${githubRepositoryDatabaseId}`;
}

/** The app of `app` in the repository's tenant: production, or previews and development clients. */
export async function appIdOf(tenantId: string, app: string, production: boolean) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(app));
  const appHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
  return `${tenantId}-${appHash}${production ? "" : "-preview"}`;
}

export async function readBlock(ctx: QueryCtx, kind: Doc<"blocks">["kind"], githubId: string) {
  return await ctx.db
    .query("blocks")
    .withIndex("by_kind_and_github_id", (q) => q.eq("kind", kind).eq("githubId", githubId))
    .unique();
}

/**
 * Whether no client of the tenant may register, renew, or sign in: its repository is blocked, or
 * `ownerId` is. `ownerId` is the tenant's recorded owner, or the owner that a new registration
 * names. A tenant that is not a repository's (`gh-<id>`) has no repository block.
 */
export async function isStopped(
  ctx: QueryCtx,
  tenantId: string,
  ownerId: string | undefined,
): Promise<boolean> {
  const repositoryId = /^gh-([1-9][0-9]*)$/.exec(tenantId)?.[1];
  if (repositoryId !== undefined && (await readBlock(ctx, "repository", repositoryId)) !== null) {
    return true;
  }
  return ownerId !== undefined && (await readBlock(ctx, "owner", ownerId)) !== null;
}

export async function isSuspended(ctx: QueryCtx, tenantId: string): Promise<boolean> {
  const tenant = await tenantRow(ctx, tenantId);
  return await isStopped(ctx, tenantId, tenant?.ownerId);
}

/** An app row with what `/authorize` and `/continue` need to know about its tenant. */
export async function appView(ctx: QueryCtx, app: Doc<"apps">) {
  return {
    appId: app.appId,
    name: app.name,
    tenantId: app.tenantId,
    suspended: await isSuspended(ctx, app.tenantId),
    createdAt: app.createdAt,
  };
}

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
    await ctx.scheduler.runAfter(0, internal.resourceRequests.continueRemoveClientGrants, {
      clientId: client.clientId,
    });
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
