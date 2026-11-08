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

const PREVIEW_SUFFIX = "-preview";
/** A production storage group id of `appIdOf`: a repository's tenant and the hash of an exact name. */
const PRODUCTION_APP_ID = /^gh-[1-9][0-9]*-[0-9a-f]{32}$/;

/**
 * The storage group of `app` in the repository's tenant: production clients, or preview and
 * development clients. The two groups keep their own caps and eviction (registration.ts).
 */
export async function appIdOf(tenantId: string, app: string, production: boolean) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(app));
  const appHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
  return `${tenantId}-${appHash}${production ? "" : PREVIEW_SUFFIX}`;
}

/**
 * The id of the app of the storage group `appId` for connector grants and sign-in page exemptions
 * (RFC 137): an app is a repository plus an exact name, so both of its storage groups have the
 * production group's id. Only an id that `appIdOf` makes for a repository's tenant maps; any other
 * id, such as one with `-preview` in a host's own format, is its own app. The name is hashed before
 * the suffix, so a name that ends in `-preview` maps like any other.
 */
export function moderationIdOf(appId: string): string {
  if (!appId.endsWith(PREVIEW_SUFFIX)) {
    return appId;
  }
  const production = appId.slice(0, -PREVIEW_SUFFIX.length);
  return PRODUCTION_APP_ID.test(production) ? production : appId;
}

/** The storage groups of the app with the moderation id `moderationId`, production first. */
function storageGroupsOf(moderationId: string): string[] {
  return PRODUCTION_APP_ID.test(moderationId)
    ? [moderationId, `${moderationId}${PREVIEW_SUFFIX}`]
    : [moderationId];
}

/**
 * The app row of the app with the moderation id `moderationId`: its production storage group,
 * else its preview one. Either one proves that the app exists and names its tenant.
 */
export async function appRowOf(ctx: QueryCtx, moderationId: string) {
  for (const appId of storageGroupsOf(moderationId)) {
    const app = await ctx.db
      .query("apps")
      .withIndex("by_app_id", (q) => q.eq("appId", appId))
      .unique();
    if (app !== null) {
      return app;
    }
  }
  return null;
}

/** The newest client of either storage group of the app with the moderation id `moderationId`. */
export async function newestClientOf(ctx: QueryCtx, moderationId: string) {
  let newest: Doc<"clients"> | null = null;
  for (const appId of storageGroupsOf(moderationId)) {
    const client = await ctx.db
      .query("clients")
      .withIndex("by_app_id", (q) => q.eq("appId", appId))
      .order("desc")
      .first();
    if (client !== null && (newest === null || client._creationTime > newest._creationTime)) {
      newest = client;
    }
  }
  return newest;
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
 * Deletes one storage group of an app with its clients: its production group, or its preview one.
 * The app row goes first: /authorize and /token refuse a client whose app is gone, so this
 * transaction revokes every client of the group, however many batches their rows take to delete.
 * The app's connector grants and sign-in page exemption stay, and still cover its other group.
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
