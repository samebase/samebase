import { v } from "convex/values";
// oxlint-disable-next-line samebase/no-raw-public-convex-function-builders -- Component entrypoints are internal to the host; host functions enforce access.
import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { appIdOf, appRowOf, moderationIdOf, newestClientOf, tenantIdOf, tenantRow } from "./apps";

// The connector grants that the hub's administrator sets (RFC 137 decision 10). A grant adds one
// connector to what the host's policy gives the clients of one app, a repository plus an exact name:
// its production, preview, and development clients. A row is keyed by the app's moderation id
// (`moderationIdOf`), whichever storage group a read or a write names. Unlike an exemption from the
// sign-in page, a grant is read again by every step of a sign-in, in the transaction that decides
// that step, so removing it stops a sign-in at its next step. Grants give no API resource and skip
// no page.

const { array, boolean, literal, object, string, union } = v;

/**
 * The connectors granted to a client of the storage group `appId`, sorted: the rows of its app,
 * whichever group the client is in. A row counts only while the tenant's
 * recorded owner and the owner that registered the client are the row's owner: a transfer to
 * another owner stops it, and an old client of a previous owner never gets it. It counts again if
 * the repository comes back to the same owner.
 */
export async function grantedTo(
  ctx: QueryCtx,
  args: { appId: string; tenantOwnerId: string | undefined; clientOwnerId: string },
): Promise<string[]> {
  const appId = moderationIdOf(args.appId);
  const rows = await ctx.db
    .query("connectorGrants")
    .withIndex("by_app_id_and_connector", (q) => q.eq("appId", appId))
    .collect();
  return rows
    .filter((row) => row.ownerId === args.tenantOwnerId && row.ownerId === args.clientOwnerId)
    .map((row) => row.connector)
    .sort();
}

/** The connectors granted to `client` now, read in the caller's transaction. */
export async function grantedToClient(ctx: QueryCtx, client: Doc<"clients">): Promise<string[]> {
  const app = await ctx.db
    .query("apps")
    .withIndex("by_app_id", (q) => q.eq("appId", client.appId))
    .unique();
  const tenant = app === null ? null : await tenantRow(ctx, app.tenantId);
  return await grantedTo(ctx, {
    appId: client.appId,
    tenantOwnerId: tenant?.ownerId,
    clientOwnerId: client.registeredBy.githubOwnerId,
  });
}

/**
 * The connectors granted to the app that a registration joins, in either storage group, for the
 * owner of its proof: the
 * owner that a GitHub run records with the new client, or the owner of an initial access token.
 * The registering mutation reads them again in its own transaction.
 */
export const forRegistration = query({
  args: {
    githubRepositoryDatabaseId: string(),
    githubOwnerId: string(),
    app: string(),
    production: boolean(),
  },
  returns: array(string()),
  handler: async (ctx, args) =>
    await grantedTo(ctx, {
      appId: await appIdOf(tenantIdOf(args.githubRepositoryDatabaseId), args.app, args.production),
      tenantOwnerId: args.githubOwnerId,
      clientOwnerId: args.githubOwnerId,
    }),
});

const vGrant = object({
  appId: string(),
  connector: string(),
  /** The owner the row is bound to. */
  ownerId: string(),
  /**
   * Whether the row is bound to the tenant's recorded owner now. False after a recorded transfer to
   * another owner: the row then grants nothing until the repository comes back to this owner.
   */
  active: boolean(),
  reason: string(),
  /**
   * From the newest client of either storage group of the app: `owner/name` and the stack's app
   * name. Null with no client.
   */
  repository: union(string(), v.null()),
  app: union(string(), v.null()),
  /** Whether that newest client is a production client. Null with none. */
  production: union(boolean(), v.null()),
});

/** Every grant, by app id and connector. */
export const list = query({
  args: {},
  returns: array(vGrant),
  handler: async (ctx) => {
    const rows = await ctx.db.query("connectorGrants").collect();
    const grants = [];
    for (const row of rows) {
      const client = await newestClientOf(ctx, row.appId);
      const app = await appRowOf(ctx, row.appId);
      const tenant = app === null ? null : await tenantRow(ctx, app.tenantId);
      grants.push({
        appId: row.appId,
        connector: row.connector,
        ownerId: row.ownerId,
        active: tenant?.ownerId === row.ownerId,
        reason: row.reason,
        repository: client?.registeredBy.githubRepository ?? null,
        app: client?.app ?? null,
        production: client === null ? null : client.deploymentType === "production",
      });
    }
    return grants.sort(
      (a, b) => a.appId.localeCompare(b.appId) || a.connector.localeCompare(b.connector),
    );
  },
});

/**
 * Grants (`grant: true`) or revokes one connector of one app and appends the event, in one
 * transaction. `appId` is either storage group of the app; the row and its event have the app's
 * moderation id, so a change from a preview client's menu covers production too. A change that is
 * already in place changes nothing and appends nothing. Granting needs the app, in either storage
 * group (`unknown_app`), and refuses when the tenant's recorded owner is not `expectedOwnerId`,
 * the owner that the admin saw; a row of another owner, which no longer counts, is bound to this one.
 * Revoking refuses when the row is bound to another owner than `expectedOwnerId`, the row's owner
 * that the admin saw, so a stale page cannot revoke a row that another admin bound since. It needs
 * neither the app nor the tenant's owner, so a row that no longer counts can always go: one of an
 * app that `apps.remove` deleted, which would count again when the app registers again, or of a
 * connector the hub no longer has. The host checks that a granted connector is one of its own.
 */
export const set = mutation({
  args: {
    appId: string(),
    connector: string(),
    expectedOwnerId: string(),
    grant: boolean(),
    reason: string(),
    adminEmail: string(),
  },
  returns: union(
    object({ ok: literal(true), changed: boolean() }),
    object({ ok: literal(false), error: union(literal("owner_changed"), literal("unknown_app")) }),
  ),
  handler: async (ctx, args) => {
    const appId = moderationIdOf(args.appId);
    const event = async (action: "grant" | "revoke", ownerId: string) => {
      await ctx.db.insert("events", {
        kind: "connector_grant_change",
        action,
        appId,
        connector: args.connector,
        ownerId,
        reason: args.reason,
        adminEmail: args.adminEmail,
        at: Date.now(),
      });
      return { ok: true as const, changed: true };
    };
    const unchanged = { ok: true as const, changed: false };
    const row = await ctx.db
      .query("connectorGrants")
      .withIndex("by_app_id_and_connector", (q) =>
        q.eq("appId", appId).eq("connector", args.connector),
      )
      .unique();

    if (!args.grant) {
      if (row === null) {
        return unchanged;
      }
      // The row's owner, not the tenant's: a row that no longer counts can go too.
      if (row.ownerId !== args.expectedOwnerId) {
        return { ok: false as const, error: "owner_changed" as const };
      }
      await ctx.db.delete("connectorGrants", row._id);
      return await event("revoke", row.ownerId);
    }
    const app = await appRowOf(ctx, appId);
    if (app === null) {
      return { ok: false as const, error: "unknown_app" as const };
    }
    if ((await tenantRow(ctx, app.tenantId))?.ownerId !== args.expectedOwnerId) {
      return { ok: false as const, error: "owner_changed" as const };
    }
    if (row === null) {
      await ctx.db.insert("connectorGrants", {
        appId,
        connector: args.connector,
        ownerId: args.expectedOwnerId,
        reason: args.reason,
      });
    } else if (row.ownerId === args.expectedOwnerId) {
      return unchanged;
    } else {
      await ctx.db.patch("connectorGrants", row._id, {
        ownerId: args.expectedOwnerId,
        reason: args.reason,
      });
    }
    return await event("grant", args.expectedOwnerId);
  },
});
