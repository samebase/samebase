// The keys of the store: one row that names the current key, which wraps new data keys. The keys
// themselves are variables of the deployment, and a component cannot read them.
import { v } from "convex/values";
import type { QueryCtx } from "./_generated/server.js";
// oxlint-disable-next-line samebase/no-raw-public-convex-function-builders -- Store entrypoints have no app wrapper; the deploy key enforces access.
import { mutation, query } from "./_generated/server.js";

const rowOf = (ctx: QueryCtx) => ctx.db.query("keys").first();

/** The current key, or null for a store with no key. */
export const sealing = query({
  args: {},
  returns: v.object({ current: v.union(v.string(), v.null()) }),
  handler: async (ctx) => ({ current: (await rowOf(ctx))?.current ?? null }),
});

/** Makes `keyId` the current key of a store with no key, and answers the current key. */
export const choose = mutation({
  args: { keyId: v.string() },
  returns: v.string(),
  handler: async (ctx, args) => {
    const row = await rowOf(ctx);
    if (row !== null) return row.current;
    await ctx.db.insert("keys", { current: args.keyId, generation: 1 });
    return args.keyId;
  },
});

/** Makes `keyId` the current key, in a new generation. */
export const rotate = mutation({
  args: { keyId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await rowOf(ctx);
    if (row === null) await ctx.db.insert("keys", { current: args.keyId, generation: 1 });
    else {
      await ctx.db.patch("keys", row._id, {
        current: args.keyId,
        generation: row.generation + 1,
      });
    }
    return null;
  },
});
