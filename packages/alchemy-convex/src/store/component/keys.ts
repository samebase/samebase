// The keys of the store: one row that names the current key, and the key under which every secret
// is sealed. The keys themselves are variables of the deployment, and a component cannot read them.
import { v } from "convex/values";
import type { QueryCtx } from "./_generated/server.js";
// oxlint-disable-next-line samebase/no-raw-public-convex-function-builders -- Store entrypoints have no app wrapper; the deploy key enforces access.
import { mutation, query } from "./_generated/server.js";

const rowOf = (ctx: QueryCtx) => ctx.db.query("keys").first();

/** The generation of the current key, read in the transaction of the caller. */
export const generationOf = async (ctx: QueryCtx) => (await rowOf(ctx))?.generation ?? null;

/**
 * The current key, its generation, and true when a reseal of that generation finished. Each
 * rotation is a new generation, also when a key comes back, so a sweep that a rotation overtook can
 * never pass for the current one.
 */
export const sealing = query({
  args: {},
  returns: v.object({
    current: v.union(v.string(), v.null()),
    generation: v.number(),
    sealed: v.boolean(),
  }),
  handler: async (ctx) => {
    const row = await rowOf(ctx);
    if (row === null) return { current: null, generation: 0, sealed: false };
    const { current, generation, sealedGeneration } = row;
    return { current, generation, sealed: sealedGeneration === generation };
  },
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

/** Makes `keyId` the current key, in a new generation. The next reseal moves the secrets to it. */
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

/** Records a finished reseal. It does nothing when a rotation came after the sweep started. */
export const markSealed = mutation({
  args: { generation: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await rowOf(ctx);
    if (row?.generation === args.generation) {
      await ctx.db.patch("keys", row._id, { sealedGeneration: args.generation });
    }
    return null;
  },
});
