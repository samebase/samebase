import { v, type Infer } from "convex/values";
// oxlint-disable-next-line samebase/no-raw-public-convex-function-builders -- Component entrypoints are internal to the host; host functions enforce access.
import { mutation, type MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { isStopped, isSuspended, tenantRow } from "./apps";
import { vTokenEndpointAuthMethod } from "./schema";

const { literal, number, object, optional, string, union } = v;

/**
 * How long a client with a removal date lives after its last deploy, dev start, sign-in, resource
 * authorization, or provider refresh. Only preview and development clients get a removal date.
 */
export const LEASE_MS = 14 * 24 * 60 * 60 * 1000;
/** The rows of one app. The deployments of a stack cannot grow past this. */
export const MAX_CLIENTS_PER_APP = 30;
/** The apps of one tenant: five names, each with a production app and a preview app. */
export const MAX_APPS_PER_TENANT = 10;

/** `development`: a laptop's client, which lives and goes like a preview's. */
const vDeployment = union(literal("production"), literal("preview"), literal("development"));

/**
 * What a sign-in, a resource authorization, or a provider refresh writes on the client it used: a
 * client with a removal date then lives `LEASE_MS` from now.
 */
export function used(client: Doc<"clients">, now: number) {
  return {
    lastSignInAt: now,
    ...(client.removeAt === undefined ? {} : { removeAt: now + LEASE_MS }),
  };
}

/**
 * The one row that makes way for a new client at the cap. For a preview or development client any
 * row can go, because the next deploy or dev start of its owner registers again. For a production
 * client a row goes only if it never signed anyone in: the hub cannot know which client a deployment
 * holds, so one that has served users stays.
 */
function evicted(rows: Doc<"clients">[], deploymentType: Infer<typeof vDeployment>) {
  const candidates =
    deploymentType === "production" ? rows.filter((row) => row.lastSignInAt === undefined) : rows;
  return [...candidates].sort(
    (a, b) => (a.renewedAt ?? a.createdAt) - (b.renewedAt ?? b.createdAt),
  )[0];
}

async function clientAt(ctx: MutationCtx, clientId: string, registrationTokenHash: string) {
  const client = await ctx.db
    .query("clients")
    .withIndex("by_client_id", (q) => q.eq("clientId", clientId))
    .unique();
  return client !== null && client.registrationTokenHash === registrationTokenHash ? client : null;
}

/**
 * Registers one deployment as a client of a third-party app (RFC 7591), creating the app with its
 * first client. Everything is in one transaction, so a suspension or a cap cannot be raced. A client
 * is never replaced: a deployment that lost its client gets a new one, and any older one stays valid.
 * The host's own mutation can call it too, with the credentials of `newClientCredentials`, and then
 * write its own record of the client in the same transaction.
 */
export const register = mutation({
  args: {
    tenantId: string(),
    /**
     * The owner of the tenant as of this registration, checked against the owner switch and then
     * recorded on the tenant. Absent: the recorded owner is checked and kept.
     */
    ownerId: optional(string()),
    appId: string(),
    connector: string(),
    deploymentType: vDeployment,
    clientId: string(),
    secretHash: string(),
    registrationTokenHash: string(),
    tokenEndpointAuthMethod: vTokenEndpointAuthMethod,
    redirectUri: string(),
    clientName: string(),
    softwareVersion: string(),
    now: number(),
  },
  returns: union(
    object({ ok: literal(true) }),
    object({
      ok: literal(false),
      error: union(
        literal("suspended"),
        literal("too_many_apps"),
        literal("too_many_clients"),
        literal("app_taken"),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const tenant = await tenantRow(ctx, args.tenantId);
    if (await isStopped(ctx, tenant, args.ownerId ?? tenant?.ownerId)) {
      return { ok: false as const, error: "suspended" as const };
    }
    const app = await ctx.db
      .query("apps")
      .withIndex("by_app_id", (q) => q.eq("appId", args.appId))
      .unique();
    if (app !== null && (app.firstParty || app.tenantId !== args.tenantId)) {
      return { ok: false as const, error: "app_taken" as const };
    }
    if (app === null) {
      const apps = await ctx.db
        .query("apps")
        .withIndex("by_tenant_id", (q) => q.eq("tenantId", args.tenantId))
        .take(MAX_APPS_PER_TENANT);
      if (apps.length >= MAX_APPS_PER_TENANT) {
        return { ok: false as const, error: "too_many_apps" as const };
      }
      await ctx.db.insert("apps", {
        appId: args.appId,
        name: args.appId,
        firstParty: false,
        connector: args.connector,
        tenantId: args.tenantId,
        createdAt: args.now,
      });
    }
    // A transferred repository gets its new owner here, at its next new client.
    if (tenant === null) {
      await ctx.db.insert("tenants", {
        tenantId: args.tenantId,
        ...(args.ownerId === undefined ? {} : { ownerId: args.ownerId }),
      });
    } else if (args.ownerId !== undefined && args.ownerId !== tenant.ownerId) {
      await ctx.db.patch("tenants", tenant._id, { ownerId: args.ownerId });
    }
    const rows = await ctx.db
      .query("clients")
      .withIndex("by_app_id", (q) => q.eq("appId", args.appId))
      .take(MAX_CLIENTS_PER_APP);
    if (rows.length >= MAX_CLIENTS_PER_APP) {
      const row = evicted(rows, args.deploymentType);
      if (row === undefined) {
        return { ok: false as const, error: "too_many_clients" as const };
      }
      await ctx.db.delete("clients", row._id);
    }
    await ctx.db.insert("clients", {
      clientId: args.clientId,
      appId: args.appId,
      secretHash: args.secretHash,
      registrationTokenHash: args.registrationTokenHash,
      tokenEndpointAuthMethod: args.tokenEndpointAuthMethod,
      redirectUri: args.redirectUri,
      deploymentType: args.deploymentType,
      clientName: args.clientName,
      softwareVersion: args.softwareVersion,
      createdAt: args.now,
      renewedAt: args.now,
      ...(args.deploymentType === "production" ? {} : { removeAt: args.now + LEASE_MS }),
    });
    return { ok: true as const };
  },
});

/**
 * A deploy of a client reads it (RFC 7592 section 2.1), which also renews it. A preview client gets a
 * new removal date. A production client has none and never gets one.
 */
export const renew = mutation({
  args: { clientId: string(), registrationTokenHash: string(), now: number() },
  returns: union(
    object({
      ok: literal(true),
      redirectUri: string(),
      clientName: string(),
      softwareVersion: string(),
      tokenEndpointAuthMethod: vTokenEndpointAuthMethod,
      appId: string(),
      createdAt: number(),
    }),
    object({ ok: literal(false), error: union(literal("invalid_token"), literal("suspended")) }),
  ),
  handler: async (ctx, args) => {
    const client = await clientAt(ctx, args.clientId, args.registrationTokenHash);
    if (client === null) {
      return { ok: false as const, error: "invalid_token" as const };
    }
    const app = await ctx.db
      .query("apps")
      .withIndex("by_app_id", (q) => q.eq("appId", client.appId))
      .unique();
    if (app === null) {
      return { ok: false as const, error: "invalid_token" as const };
    }
    if (await isSuspended(ctx, app.tenantId)) {
      return { ok: false as const, error: "suspended" as const };
    }
    await ctx.db.patch("clients", client._id, {
      renewedAt: args.now,
      ...(client.removeAt === undefined ? {} : { removeAt: args.now + LEASE_MS }),
    });
    return {
      ok: true as const,
      redirectUri: client.redirectUri,
      clientName: client.clientName,
      softwareVersion: client.softwareVersion,
      tokenEndpointAuthMethod: client.tokenEndpointAuthMethod,
      appId: client.appId,
      createdAt: client.createdAt,
    };
  },
});

/**
 * A preview client deletes itself (RFC 7592 section 2.3). A production client cannot: a stack destroy
 * can leave a production deployment running, and the hub cannot know that it stopped.
 */
export const remove = mutation({
  args: { clientId: string(), registrationTokenHash: string() },
  returns: union(
    object({ ok: literal(true) }),
    object({ ok: literal(false), error: union(literal("invalid_token"), literal("production")) }),
  ),
  handler: async (ctx, args) => {
    const client = await clientAt(ctx, args.clientId, args.registrationTokenHash);
    if (client === null) {
      return { ok: false as const, error: "invalid_token" as const };
    }
    if (client.deploymentType === "production") {
      return { ok: false as const, error: "production" as const };
    }
    await ctx.db.delete("clients", client._id);
    return { ok: true as const };
  },
});

/**
 * Records that a tenant left or came back. The service that registers tenants calls this, and it can
 * retry, so a request can arrive after a newer one: only a newer revision changes anything. This is
 * separate from `setSuspended`, so coming back cannot clear an administrator's suspension.
 */
export const setConnection = mutation({
  args: { tenantId: string(), connected: v.boolean(), revision: number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const tenant = await tenantRow(ctx, args.tenantId);
    const change = { disconnected: !args.connected, connectionRevision: args.revision };
    if (tenant === null) {
      await ctx.db.insert("tenants", { tenantId: args.tenantId, ...change });
    } else if (args.revision > (tenant.connectionRevision ?? Number.NEGATIVE_INFINITY)) {
      await ctx.db.patch("tenants", tenant._id, change);
    }
    return null;
  },
});

/**
 * The host's own switch of a tenant's connection, such as a block of a repository. It raises the
 * stored revision by one in this transaction, so the host never counts revisions, and a request of
 * `/tenant-connection` that was sent before it and arrives late changes nothing. It leaves the
 * administrator's suspension as it is.
 */
export const switchConnection = mutation({
  args: { tenantId: string(), connected: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const tenant = await tenantRow(ctx, args.tenantId);
    if (tenant === null) {
      await ctx.db.insert("tenants", {
        tenantId: args.tenantId,
        disconnected: !args.connected,
        connectionRevision: 1,
      });
    } else {
      await ctx.db.patch("tenants", tenant._id, {
        disconnected: !args.connected,
        connectionRevision: (tenant.connectionRevision ?? 0) + 1,
      });
    }
    return null;
  },
});

/**
 * The owner switch. A blocked owner stops every tenant whose recorded owner it is, on registration,
 * renewal, sign-in, and code exchange, also tenants that register later. It changes no tenant row.
 */
export const setOwnerBlocked = mutation({
  args: { ownerId: string(), blocked: v.boolean(), now: number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("blockedOwners")
      .withIndex("by_owner_id", (q) => q.eq("ownerId", args.ownerId))
      .unique();
    if (args.blocked && row === null) {
      await ctx.db.insert("blockedOwners", { ownerId: args.ownerId, blockedAt: args.now });
    } else if (!args.blocked && row !== null) {
      await ctx.db.delete("blockedOwners", row._id);
    }
    return null;
  },
});

/**
 * The administrator's switch on a tenant. It covers every app of the tenant, and it holds for apps
 * that do not exist yet, so it needs no list of them.
 */
export const setSuspended = mutation({
  args: { tenantId: string(), suspended: v.boolean(), now: number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const tenant = await tenantRow(ctx, args.tenantId);
    const suspendedAt = args.suspended ? args.now : undefined;
    if (tenant === null) {
      await ctx.db.insert("tenants", {
        tenantId: args.tenantId,
        ...(suspendedAt === undefined ? {} : { suspendedAt }),
      });
    } else {
      await ctx.db.patch("tenants", tenant._id, { suspendedAt });
    }
    return null;
  },
});
