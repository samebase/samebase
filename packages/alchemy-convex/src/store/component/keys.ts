// The keys of the store: one row that names the current key, and the key under which every secret
// is sealed. The keys themselves are variables of the deployment, and a component cannot read them.
import { v } from "convex/values";
import type { QueryCtx } from "./_generated/server.js";
// oxlint-disable-next-line samebase/no-raw-public-convex-function-builders -- Store entrypoints have no app wrapper; the deploy key enforces access.
import { mutation, query } from "./_generated/server.js";

const rowOf = (ctx: QueryCtx) => ctx.db.query("keys").first();

/** The current key, and true when a reseal under that key finished. */
export const sealing = query({
  args: {},
  returns: v.object({ current: v.union(v.string(), v.null()), sealed: v.boolean() }),
  handler: async (ctx) => {
    const row = await rowOf(ctx);
    return {
      current: row?.current ?? null,
      sealed: row !== null && row.sealedUnder === row.current,
    };
  },
});

/** Makes `keyId` the current key of a store with no key, and answers the current key. */
export const choose = mutation({
  args: { keyId: v.string() },
  returns: v.string(),
  handler: async (ctx, args) => {
    const row = await rowOf(ctx);
    if (row !== null) return row.current;
    await ctx.db.insert("keys", { current: args.keyId });
    return args.keyId;
  },
});

/** Makes `keyId` the current key. The next reseal moves the secrets to it. */
export const rotate = mutation({
  args: { keyId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await rowOf(ctx);
    if (row === null) await ctx.db.insert("keys", { current: args.keyId });
    else await ctx.db.patch("keys", row._id, { current: args.keyId });
    return null;
  },
});

/** Records a finished reseal under `keyId`. It does nothing when the current key changed since. */
export const markSealed = mutation({
  args: { keyId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await rowOf(ctx);
    if (row?.current === args.keyId)
      await ctx.db.patch("keys", row._id, { sealedUnder: args.keyId });
    return null;
  },
});
