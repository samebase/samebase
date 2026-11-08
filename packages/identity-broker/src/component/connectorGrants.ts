import { v } from "convex/values";
// oxlint-disable-next-line samebase/no-raw-public-convex-function-builders -- Component entrypoints are internal to the host; host functions enforce access.
import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { repositoryIdOf, tenantIdOf, tenantRow } from "./apps";

// The connector grants that the hub's administrator sets (RFC 137 decision 10). A grant adds one
// connector to what the host's policy gives every app and deployment of one repository while one
// owner owns it. Unlike an exemption from the sign-in page, a grant is read again by every step of
// a sign-in, in the transaction that decides that step, so removing it stops a sign-in at its next
// step. Grants give no API resource and skip no page.

const { array, boolean, literal, object, string, union } = v;

/**
 * The connectors granted to a client of the repository `tenantId`, sorted. A row counts only while
 * the tenant's recorded owner and the owner that registered the client are the row's owner: a
 * transfer to another owner stops it, and an old client of a previous owner never gets it. It
 * counts again if the repository comes back to the same owner. A client of no repository has none.
 */
export async function grantedTo(
  ctx: QueryCtx,
  args: { tenantId: string | undefined; tenantOwnerId: string | undefined; clientOwnerId: string },
): Promise<string[]> {
  const { tenantId, clientOwnerId } = args;
  if (tenantId === undefined || args.tenantOwnerId !== clientOwnerId) {
    return [];
  }
  const rows = await ctx.db
    .query("connectorGrants")
    .withIndex("by_tenant_id_and_owner_id_and_connector", (q) =>
      q.eq("tenantId", tenantId).eq("ownerId", clientOwnerId),
    )
    .collect();
  return rows.map((row) => row.connector);
}

/** The connectors granted to `client` now, read in the caller's transaction. */
export async function grantedToClient(ctx: QueryCtx, client: Doc<"clients">): Promise<string[]> {
  const app = await ctx.db
    .query("apps")
    .withIndex("by_app_id", (q) => q.eq("appId", client.appId))
    .unique();
  const tenant = app === null ? null : await tenantRow(ctx, app.tenantId);
  return await grantedTo(ctx, {
    tenantId: app?.tenantId,
    tenantOwnerId: tenant?.ownerId,
    clientOwnerId: client.registeredBy.githubOwnerId,
  });
}

/**
 * The connectors granted to the repository that a registration joins, for the owner of its proof:
 * the owner that a GitHub run records with the new client, or the owner of an initial access token.
 * The registering mutation reads them again in its own transaction.
 */
export const forRegistration = query({
  args: { githubRepositoryDatabaseId: string(), githubOwnerId: string() },
  returns: array(string()),
  handler: async (ctx, args) =>
    await grantedTo(ctx, {
      tenantId: tenantIdOf(args.githubRepositoryDatabaseId),
      tenantOwnerId: args.githubOwnerId,
      clientOwnerId: args.githubOwnerId,
    }),
});

/** One row by repository, owner, and connector. */
async function grantRow(ctx: QueryCtx, tenantId: string, ownerId: string, connector: string) {
  return await ctx.db
    .query("connectorGrants")
    .withIndex("by_tenant_id_and_owner_id_and_connector", (q) =>
      q.eq("tenantId", tenantId).eq("ownerId", ownerId).eq("connector", connector),
    )
    .unique();
}

const vGrant = object({
  repositoryId: string(),
  /** The owner the row is bound to. */
  ownerId: string(),
  connector: string(),
  /** False once the hub has recorded another owner of the repository: the row then grants nothing. */
  active: boolean(),
  reason: string(),
});

/** Every grant, by repository, owner, and connector. */
export const list = query({
  args: {},
  returns: array(vGrant),
  handler: async (ctx) => {
    const grants = [];
    for (const row of await ctx.db.query("connectorGrants").collect()) {
      const repositoryId = repositoryIdOf(row.tenantId);
      if (repositoryId === undefined) {
        continue;
      }
      const recordedOwnerId = (await tenantRow(ctx, row.tenantId))?.ownerId;
      grants.push({
        repositoryId,
        ownerId: row.ownerId,
        connector: row.connector,
        active: recordedOwnerId === undefined || recordedOwnerId === row.ownerId,
        reason: row.reason,
      });
    }
    return grants.sort(
      (a, b) =>
        a.repositoryId.localeCompare(b.repositoryId) ||
        a.ownerId.localeCompare(b.ownerId) ||
        a.connector.localeCompare(b.connector),
    );
  },
});

/**
 * Grants (`grant: true`) or revokes one connector of one repository for the owner
 * `expectedOwnerId`, and appends the event, in one transaction. A change that is already in place
 * changes nothing and appends nothing. A grant needs no app, client, or tenant: it can come before
 * the repository's first registration. It refuses (`owner_changed`) when the hub has recorded
 * another owner of the repository. A revoke removes that owner's row only, so it never touches a
 * row that another owner's grant made. The host checks that a granted connector is one of its own.
 */
export const set = mutation({
  args: {
    repositoryId: string(),
    connector: string(),
    expectedOwnerId: string(),
    grant: boolean(),
    reason: string(),
    adminEmail: string(),
  },
  returns: union(
    object({ ok: literal(true), changed: boolean() }),
    object({ ok: literal(false), error: literal("owner_changed") }),
  ),
  handler: async (ctx, args) => {
    const tenantId = tenantIdOf(args.repositoryId);
    const ownerId = args.expectedOwnerId;
    const row = await grantRow(ctx, tenantId, ownerId, args.connector);
    if (args.grant) {
      const recordedOwnerId = (await tenantRow(ctx, tenantId))?.ownerId;
      if (recordedOwnerId !== undefined && recordedOwnerId !== ownerId) {
        return { ok: false as const, error: "owner_changed" as const };
      }
      if (row !== null) {
        return { ok: true as const, changed: false };
      }
      await ctx.db.insert("connectorGrants", {
        tenantId,
        ownerId,
        connector: args.connector,
        reason: args.reason,
      });
    } else if (row === null) {
      return { ok: true as const, changed: false };
    } else {
      await ctx.db.delete("connectorGrants", row._id);
    }
    await ctx.db.insert("events", {
      kind: "connector_grant_change",
      action: args.grant ? "grant" : "revoke",
      tenantId,
      connector: args.connector,
      ownerId,
      reason: args.reason,
      adminEmail: args.adminEmail,
      at: Date.now(),
    });
    return { ok: true as const, changed: true };
  },
});
