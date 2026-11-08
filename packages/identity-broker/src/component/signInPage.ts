import { v, type Infer } from "convex/values";
// oxlint-disable-next-line samebase/no-raw-public-convex-function-builders -- Component entrypoints are internal to the host; host functions enforce access.
import { mutation, query, type QueryCtx } from "./_generated/server";
import { repositoryIdOf, tenantIdOf, tenantRow } from "./apps";
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
  /** A row of the client's repository exists, bound to the tenant's recorded owner and the client's. */
  repository: boolean(),
});
export type Exemption = Infer<typeof vExemption>;

async function everyAppRow(ctx: QueryCtx) {
  return await ctx.db
    .query("signInPageExemptions")
    .withIndex("by_target", (q) => q.eq("target.scope", "every_app"))
    .unique();
}

/** The repository row of `ownerId`. Rows of other owners of the repository are left alone. */
async function repositoryRow(ctx: QueryCtx, tenantId: string, ownerId: string) {
  const rows = await ctx.db
    .query("signInPageExemptions")
    .withIndex("by_target", (q) =>
      q.eq("target.scope", "repository").eq("target.tenantId", tenantId),
    )
    .collect();
  return rows.find((row) => row.target.scope === "repository" && row.target.ownerId === ownerId);
}

/**
 * The exemptions of a client of the repository `tenantId`. The repository's row counts only while
 * the tenant's recorded owner and the owner that registered the client are the row's owner: a
 * transfer to another owner stops it, and an old client of a previous owner never gets it. The row
 * counts again if the repository comes back to the same owner.
 */
export async function exemptionOf(
  ctx: QueryCtx,
  args: { tenantId: string | undefined; tenantOwnerId: string | undefined; clientOwnerId: string },
): Promise<Exemption> {
  return {
    everyApp: (await everyAppRow(ctx)) !== null,
    repository:
      args.tenantId !== undefined &&
      args.tenantOwnerId === args.clientOwnerId &&
      (await repositoryRow(ctx, args.tenantId, args.clientOwnerId)) !== undefined,
  };
}

const vRepositoryExemption = object({
  repositoryId: string(),
  /** The owner the row is bound to. */
  ownerId: string(),
  /** False once the hub has recorded another owner of the repository: the row then covers nothing. */
  active: boolean(),
  reason: string(),
});

/** The "every app" row with its reason, and every repository row, by repository and owner. */
export const list = query({
  args: {},
  returns: object({
    everyApp: union(object({ reason: string() }), v.null()),
    repositories: array(vRepositoryExemption),
  }),
  handler: async (ctx) => {
    const everyApp = await everyAppRow(ctx);
    const rows = await ctx.db
      .query("signInPageExemptions")
      .withIndex("by_target", (q) => q.eq("target.scope", "repository"))
      .collect();
    const repositories = [];
    for (const { target, reason } of rows) {
      const repositoryId =
        target.scope === "repository" ? repositoryIdOf(target.tenantId) : undefined;
      if (repositoryId === undefined || target.scope !== "repository") {
        continue;
      }
      const recordedOwnerId = (await tenantRow(ctx, target.tenantId))?.ownerId;
      repositories.push({
        repositoryId,
        ownerId: target.ownerId,
        active: recordedOwnerId === undefined || recordedOwnerId === target.ownerId,
        reason,
      });
    }
    return {
      everyApp: everyApp === null ? null : { reason: everyApp.reason },
      repositories: repositories.sort(
        (a, b) =>
          a.repositoryId.localeCompare(b.repositoryId) || a.ownerId.localeCompare(b.ownerId),
      ),
    };
  },
});

/**
 * Sets (`skip`) or removes (`show`) one exemption and appends the event, in one transaction. A
 * change that is already in place changes nothing and appends nothing. A repository row needs no
 * app, client, or tenant: it can come before the repository's first registration. Setting one
 * refuses (`owner_changed`) when the hub has recorded another owner of the repository. Removing one
 * removes the row of `expectedOwnerId` only, so it never touches another owner's row.
 */
export const set = mutation({
  args: {
    target: union(
      object({ scope: literal("every_app") }),
      object({ scope: literal("repository"), repositoryId: string(), expectedOwnerId: string() }),
    ),
    skip: boolean(),
    reason: string(),
    adminEmail: string(),
  },
  returns: union(
    object({ ok: literal(true), changed: boolean() }),
    object({ ok: literal(false), error: literal("owner_changed") }),
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

    const tenantId = tenantIdOf(args.target.repositoryId);
    const ownerId = args.target.expectedOwnerId;
    const row = await repositoryRow(ctx, tenantId, ownerId);
    const target = { scope: "repository" as const, tenantId, ownerId };
    if (!args.skip) {
      if (row === undefined) {
        return unchanged;
      }
      await ctx.db.delete("signInPageExemptions", row._id);
      return await event("show", target);
    }
    const recordedOwnerId = (await tenantRow(ctx, tenantId))?.ownerId;
    if (recordedOwnerId !== undefined && recordedOwnerId !== ownerId) {
      return { ok: false as const, error: "owner_changed" as const };
    }
    if (row !== undefined) {
      return unchanged;
    }
    await ctx.db.insert("signInPageExemptions", { target, reason: args.reason });
    return await event("skip", target);
  },
});
