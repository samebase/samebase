import { v, type Infer } from "convex/values";
// oxlint-disable-next-line samebase/no-raw-public-convex-function-builders -- Component entrypoints are internal to the host; host functions enforce access.
import { mutation, query, type QueryCtx } from "./_generated/server";
import { tenantRow } from "./apps";
import { vSignInPageTarget } from "./schema";

// The exemptions from the sign-in page that the hub's administrator sets (RFC 137 decision 5, as
// amended). The broker stores them and applies them itself: in hub mode the page shows unless an
// exemption covers the client (docs/design.md). The decision is read at
// `/authorize` and nowhere later: a sign-in that passed `/authorize` finishes with that decision.

const { array, boolean, literal, object, string, union } = v;

/** Which exemptions cover a client, read with its facts in the same snapshot. */
export const vExemption = object({
  /** The "every app" row exists. */
  everyApp: boolean(),
  /** A row of the client's app exists, bound to the tenant's recorded owner and the client's. */
  thisApp: boolean(),
});
export type Exemption = Infer<typeof vExemption>;

async function everyAppRow(ctx: QueryCtx) {
  return await ctx.db
    .query("signInPageExemptions")
    .withIndex("by_target", (q) => q.eq("target.scope", "every_app"))
    .unique();
}

async function appRow(ctx: QueryCtx, appId: string) {
  return await ctx.db
    .query("signInPageExemptions")
    .withIndex("by_target", (q) => q.eq("target.scope", "app").eq("target.appId", appId))
    .unique();
}

/**
 * The exemptions of a client of `appId`. The app's row counts only while the tenant's recorded
 * owner and the owner that registered the client are the row's owner: a transfer to another owner
 * stops it, and an old client of a previous owner never gets it. The row counts again if the
 * repository comes back to the same owner.
 */
export async function exemptionOf(
  ctx: QueryCtx,
  args: { appId: string; tenantOwnerId: string | undefined; clientOwnerId: string },
): Promise<Exemption> {
  const app = await appRow(ctx, args.appId);
  return {
    everyApp: (await everyAppRow(ctx)) !== null,
    thisApp:
      app !== null &&
      app.target.scope === "app" &&
      app.target.ownerId === args.tenantOwnerId &&
      app.target.ownerId === args.clientOwnerId,
  };
}

const vAppExemption = object({
  appId: string(),
  /** The owner the row is bound to. */
  ownerId: string(),
  /**
   * Whether the row is bound to the tenant's recorded owner now. False after a recorded transfer to
   * another owner: the row then covers no client until the repository comes back to this owner.
   */
  active: boolean(),
  reason: string(),
  /** From the app's newest client: `owner/name` and the stack's app name. Null with no client. */
  repository: union(string(), v.null()),
  app: union(string(), v.null()),
  /** Whether the app is a repository's production app, from its newest client. Null with none. */
  production: union(boolean(), v.null()),
});

/** The "every app" row with its reason, and every one-app row, by app id. */
export const list = query({
  args: {},
  returns: object({
    everyApp: union(object({ reason: string() }), v.null()),
    apps: array(vAppExemption),
  }),
  handler: async (ctx) => {
    const everyApp = await everyAppRow(ctx);
    const rows = await ctx.db
      .query("signInPageExemptions")
      .withIndex("by_target", (q) => q.eq("target.scope", "app"))
      .collect();
    const apps = [];
    for (const row of rows) {
      if (row.target.scope !== "app") {
        continue;
      }
      const { appId } = row.target;
      const client = await ctx.db
        .query("clients")
        .withIndex("by_app_id", (q) => q.eq("appId", appId))
        .order("desc")
        .first();
      const app = await ctx.db
        .query("apps")
        .withIndex("by_app_id", (q) => q.eq("appId", appId))
        .unique();
      const tenant = app === null ? null : await tenantRow(ctx, app.tenantId);
      apps.push({
        appId,
        ownerId: row.target.ownerId,
        active: tenant?.ownerId === row.target.ownerId,
        reason: row.reason,
        repository: client?.registeredBy.githubRepository ?? null,
        app: client?.app ?? null,
        production: client === null ? null : client.deploymentType === "production",
      });
    }
    return {
      everyApp: everyApp === null ? null : { reason: everyApp.reason },
      apps: apps.sort((a, b) => a.appId.localeCompare(b.appId)),
    };
  },
});

/**
 * Sets (`skip`) or removes (`show`) one exemption and appends the event, in one transaction. A
 * change that is already in place changes nothing and appends nothing. Setting a one-app row needs
 * the app and refuses when the tenant's recorded owner is not `expectedOwnerId`, the owner that
 * the admin saw; a row of another owner, which no longer counts, is bound to this one. Removing a
 * one-app row refuses when the row is bound to another owner than `expectedOwnerId`, the row's
 * owner that the admin saw, so a stale page cannot remove a row that another admin bound since; it
 * does not need the tenant's owner, so a row that no longer counts can go.
 */
export const set = mutation({
  args: {
    target: union(
      object({ scope: literal("every_app") }),
      object({ scope: literal("app"), appId: string(), expectedOwnerId: string() }),
    ),
    skip: boolean(),
    reason: string(),
    adminEmail: string(),
  },
  returns: union(
    object({ ok: literal(true), changed: boolean() }),
    object({ ok: literal(false), error: union(literal("owner_changed"), literal("unknown_app")) }),
  ),
  handler: async (ctx, args) => {
    const event = async (action: "skip" | "show", target: Infer<typeof vSignInPageTarget>) => {
      await ctx.db.insert("events", {
        kind: "sign_in_page_change",
        action,
        target,
        reason: args.reason,
        adminEmail: args.adminEmail,
        at: Date.now(),
      });
      return { ok: true as const, changed: true };
    };
    const unchanged = { ok: true as const, changed: false };

    if (args.target.scope === "every_app") {
      const row = await everyAppRow(ctx);
      if (args.skip === (row !== null)) {
        return unchanged;
      }
      const target = { scope: "every_app" as const };
      if (row === null) {
        await ctx.db.insert("signInPageExemptions", { target, reason: args.reason });
      } else {
        await ctx.db.delete("signInPageExemptions", row._id);
      }
      return await event(args.skip ? "skip" : "show", target);
    }

    const { appId, expectedOwnerId } = args.target;
    const row = await appRow(ctx, appId);
    if (!args.skip) {
      if (row === null) {
        return unchanged;
      }
      if (row.target.scope !== "app" || row.target.ownerId !== expectedOwnerId) {
        return { ok: false as const, error: "owner_changed" as const };
      }
      await ctx.db.delete("signInPageExemptions", row._id);
      return await event("show", row.target);
    }
    const app = await ctx.db
      .query("apps")
      .withIndex("by_app_id", (q) => q.eq("appId", appId))
      .unique();
    if (app === null) {
      return { ok: false as const, error: "unknown_app" as const };
    }
    if ((await tenantRow(ctx, app.tenantId))?.ownerId !== expectedOwnerId) {
      return { ok: false as const, error: "owner_changed" as const };
    }
    const target = { scope: "app" as const, appId, ownerId: expectedOwnerId };
    if (row === null) {
      await ctx.db.insert("signInPageExemptions", { target, reason: args.reason });
    } else if (row.target.scope === "app" && row.target.ownerId === expectedOwnerId) {
      return unchanged;
    } else {
      await ctx.db.patch("signInPageExemptions", row._id, { target, reason: args.reason });
    }
    return await event("skip", target);
  },
});
