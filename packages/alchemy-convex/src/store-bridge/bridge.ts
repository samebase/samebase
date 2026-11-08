// The module `bridge` of the alchemyState component in the bridge root (see bridgeRoot in
// src/State.ts): the cleanup that makes the output rows of store version 6 and older match the
// strict schema of store version 8. Only the bridge has it; store version 8 has no such module.
import {
  type DataModelFromSchemaDefinition,
  type MutationBuilder,
  mutationGeneric,
} from "convex/server";
import { v } from "convex/values";
import schema from "./schema.ts";

/** The component mutation builder over the schema of the bridge, as `_generated/server` makes it. */
const mutation: MutationBuilder<
  DataModelFromSchemaDefinition<typeof schema>,
  "public"
> = mutationGeneric;

/** A document holds at most 1 MiB, so one page reads less than the 16 MiB of one function. */
const CLEANUP_PAGE = 10;

/** One page of a cleanup: the cursor of the next page, true after the last page, and the rows deleted. */
export const cleanupReply = v.object({
  cursor: v.string(),
  done: v.boolean(),
  removed: v.number(),
});

/**
 * One page of the outputs in table order. A row without `value` is deleted, and a row with
 * `currentRun` keeps only its stack, stage, and value. The page reads and writes its rows in one
 * transaction, so a write of a run in the meantime is kept. A sweep can start again at the first
 * page: a row that an earlier sweep changed needs no change.
 */
export const cleanup = mutation({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: cleanupReply,
  handler: async (ctx, args) => {
    const { page, continueCursor, isDone } = await ctx.db
      .query("outputs")
      .paginate({ cursor: args.cursor, numItems: CLEANUP_PAGE });
    let removed = 0;
    for (const row of page) {
      if (row.value === undefined) {
        await ctx.db.delete("outputs", row._id);
        removed += 1;
      } else if (row.currentRun !== undefined) {
        await ctx.db.replace("outputs", row._id, {
          stack: row.stack,
          stage: row.stage,
          value: row.value,
        });
      }
    }
    return { cursor: continueCursor, done: isDone, removed };
  },
});
