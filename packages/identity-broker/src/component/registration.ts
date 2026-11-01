import { v } from "convex/values";
// oxlint-disable-next-line samebase/no-raw-public-convex-function-builders -- Component entrypoints are internal to the host; host functions enforce access.
import { mutation, type MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { isSuspended } from "./apps";
import { vTokenEndpointAuthMethod } from "./schema";

const { literal, number, object, string, union } = v;

/** How long a preview client lives after its last deploy or sign-in. */
export const LEASE_MS = 14 * 24 * 60 * 60 * 1000;
/** The rows of one app. The deployments of a stack cannot grow past this. */
export const MAX_CLIENTS_PER_APP = 30;
/** The apps of one tenant: five names, each with a production app and a preview app. */
export const MAX_APPS_PER_TENANT = 10;

const vDeployment = union(literal("production"), literal("preview"));

/**
 * The one row that makes way for a new client at the cap. A preview client can always go, because
 * its next deploy registers again. A production client goes only if it never signed anyone in: the
 * hub cannot know which client a deployment holds, so one that has served users stays.
 */
function evicted(rows: Doc<"clients">[], deploymentType: "production" | "preview") {
  const candidates =
    deploymentType === "preview" ? rows : rows.filter((row) => row.lastSignInAt === undefined);
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
 */
export const register = mutation({
  args: {
    tenantId: string(),
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
    if (await isSuspended(ctx, args.tenantId)) {
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
      const tenant = await ctx.db
        .query("tenants")
        .withIndex("by_tenant_id", (q) => q.eq("tenantId", args.tenantId))
        .unique();
      if (tenant === null) {
        await ctx.db.insert("tenants", { tenantId: args.tenantId });
      }
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
      ...(args.deploymentType === "preview" ? { removeAt: args.now + LEASE_MS } : {}),
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

/** A client deletes itself (RFC 7592 section 2.3). */
export const remove = mutation({
  args: { clientId: string(), registrationTokenHash: string() },
  returns: union(object({ ok: literal(true) }), object({ ok: literal(false) })),
  handler: async (ctx, args) => {
    const client = await clientAt(ctx, args.clientId, args.registrationTokenHash);
    if (client === null) {
      return { ok: false as const };
    }
    await ctx.db.delete("clients", client._id);
    return { ok: true as const };
  },
});

/**
 * Turns a tenant's switch on or off. It covers every app of the tenant, and it holds for apps that
 * do not exist yet, so it needs no list of them.
 */
export const setSuspended = mutation({
  args: { tenantId: string(), suspended: v.boolean(), now: number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const tenant = await ctx.db
      .query("tenants")
      .withIndex("by_tenant_id", (q) => q.eq("tenantId", args.tenantId))
      .unique();
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
