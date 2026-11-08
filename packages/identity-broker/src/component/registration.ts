import { v, type Infer } from "convex/values";
// oxlint-disable-next-line samebase/no-raw-public-convex-function-builders -- Component entrypoints are internal to the host; host functions enforce access.
import { mutation, type MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { isStopped, isSuspended, tenantRow } from "./apps";
import { removeClientGrants } from "./resourceRequests";
import { vRegisteredBy, vTokenEndpointAuthMethod } from "./schema";

const { array, literal, number, object, optional, string, union } = v;

/**
 * How long a client with a removal date lives after its last deploy, dev start, sign-in, resource
 * authorization, or provider refresh. Only preview and development clients get a removal date.
 */
export const LEASE_MS = 14 * 24 * 60 * 60 * 1000;
/**
 * The clients of one app in each of its two budgets: production, and previews with development
 * servers. The deployments of a stack cannot grow past this.
 */
export const MAX_CLIENTS_PER_APP = 30;
/** The apps of one tenant: ten names. */
export const MAX_APPS_PER_TENANT = 10;

/** `development`: a development server's client, which lives and goes like a preview's. */
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
 * The one row of the new client's budget that makes way for it at the cap: null below the cap, and
 * undefined when no row can go. For a preview or development client any preview or development row
 * can go, because the next deploy or dev start of its owner registers again. For a production client
 * a production row goes only if it never signed anyone in: the hub cannot know which client a
 * deployment holds, so one that has served users stays.
 */
function evicted(rows: Doc<"clients">[], deploymentType: Infer<typeof vDeployment>) {
  if (rows.length < MAX_CLIENTS_PER_APP) {
    return null;
  }
  const candidates =
    deploymentType === "production" ? rows.filter((row) => row.lastSignInAt === undefined) : rows;
  return [...candidates].sort((a, b) => a.renewedAt - b.renewedAt)[0];
}

async function clientAt(ctx: MutationCtx, clientId: string, registrationTokenHash: string) {
  const client = await ctx.db
    .query("clients")
    .withIndex("by_client_id", (q) => q.eq("clientId", clientId))
    .unique();
  return client !== null && client.registrationTokenHash === registrationTokenHash ? client : null;
}

const registerArgs = {
  tenantId: string(),
  /**
   * The owner of the tenant as of this registration, checked against the owner switch and then
   * recorded on the tenant. Absent: the recorded owner is checked and kept.
   */
  ownerId: optional(string()),
  appId: string(),
  /**
   * The connectors the client enrolls in: at least one. The host checked each against its
   * connectors and its policy. Stored sorted and unique, and never changed.
   */
  connectors: array(string()),
  deploymentType: vDeployment,
  clientId: string(),
  secretHash: string(),
  registrationTokenHash: string(),
  tokenEndpointAuthMethod: vTokenEndpointAuthMethod,
  redirectUri: string(),
  clientName: string(),
  softwareVersion: string(),
  /** The name that the app's stack gives itself. */
  app: string(),
  registeredBy: vRegisteredBy,
  now: number(),
};

const vRegisterResult = union(
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
);

const vRegisterArgs = object(registerArgs);

/** The enrollment as stored: sorted and unique. An empty enrollment is a host bug, never a client. */
export function enrollment(connectors: string[]) {
  const unique = [...new Set(connectors)].sort();
  if (unique.length === 0) {
    throw new Error("A client enrolls in at least one connector");
  }
  return unique;
}

/**
 * Registers one deployment as a client of an app, creating the app with its first client.
 * `hubClients.createClient` and `hubClients.createDevelopmentClient` call it in their own
 * transaction, which also records the registration, so a block or a cap cannot be raced. A client is
 * never replaced: a deployment that lost its client gets a new one, and any older one stays valid.
 */
export async function registerClient(
  ctx: MutationCtx,
  args: Infer<typeof vRegisterArgs>,
): Promise<Infer<typeof vRegisterResult>> {
  const connectors = enrollment(args.connectors);
  const tenant = await tenantRow(ctx, args.tenantId);
  if (await isStopped(ctx, args.tenantId, args.ownerId ?? tenant?.ownerId)) {
    return { ok: false as const, error: "suspended" as const };
  }
  const app = await ctx.db
    .query("apps")
    .withIndex("by_app_id", (q) => q.eq("appId", args.appId))
    .unique();
  if (app !== null && app.tenantId !== args.tenantId) {
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
  }
  // The budget of the new client: `development` and `preview` sort before `production`.
  const rows =
    app === null
      ? []
      : await ctx.db
          .query("clients")
          .withIndex("by_app_id_and_deployment_type", (q) =>
            args.deploymentType === "production"
              ? q.eq("appId", args.appId).eq("deploymentType", "production")
              : q.eq("appId", args.appId).lt("deploymentType", "production"),
          )
          .take(MAX_CLIENTS_PER_APP);
  const evictedRow = evicted(rows, args.deploymentType);
  if (evictedRow === undefined) {
    return { ok: false as const, error: "too_many_clients" as const };
  }

  // Every refusal is above this line: a refused registration writes nothing.
  if (app === null) {
    await ctx.db.insert("apps", {
      appId: args.appId,
      name: args.appId,
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
  if (evictedRow !== null) {
    await ctx.db.delete("clients", evictedRow._id);
    await removeClientGrants(ctx, evictedRow.clientId);
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
    app: args.app,
    registeredBy: args.registeredBy,
    connectors,
  });
  return { ok: true as const };
}

/**
 * `registerClient` as a component function: the low-level registration that `POST /hub-clients`
 * builds on, for a host that proves its callers in another way. It records no registration event.
 */
export const register = mutation({
  args: registerArgs,
  returns: vRegisterResult,
  handler: registerClient,
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
      connectors: array(string()),
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
      connectors: client.connectors,
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
    await removeClientGrants(ctx, client.clientId);
    return { ok: true as const };
  },
});
