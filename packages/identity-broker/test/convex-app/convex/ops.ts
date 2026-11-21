// Test-only functions: `reset` and `step` play the adapter tests' operation lists over the Convex
// `Tx` on this app's tables, one step per mutation; `command` calls the component's `run`.
import { mutationGeneric } from "convex/server";
import { v } from "convex/values";
import { Effect, Schema } from "effect";
import { convexTx } from "../../../src/hosts/convex/tx.ts";
import { microtaskScheduler } from "../../../src/store/Store.ts";
import { playStep, StepInput, testTables } from "../../../src/store/testing.ts";
import { components } from "./_generated/api.js";

const decodeStep = Schema.decodeUnknownSync(StepInput);

/** Deletes every row of the tables that the steps use. */
export const reset = mutationGeneric({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    for (const table of testTables) {
      for (const row of await ctx.db.query(table).take(10_000)) {
        await ctx.db.delete(table, row._id);
      }
    }
    return null;
  },
});

/** Plays one step (a `StepInput`, as a Convex value) and returns its `StepOutput`. */
export const step = mutationGeneric({
  args: { step: v.any() },
  handler: (ctx, args) =>
    Effect.runPromise(playStep(convexTx(ctx.db), decodeStep(args.step)), {
      scheduler: microtaskScheduler(),
    }),
});

export const command = mutationGeneric({
  args: { name: v.string(), args: v.string(), now: v.number() },
  returns: v.string(),
  handler: (ctx, args): Promise<string> =>
    ctx.runMutation(components.identityBroker.commands.run, {
      name: args.name,
      args: args.args,
      now: args.now,
    }),
});
