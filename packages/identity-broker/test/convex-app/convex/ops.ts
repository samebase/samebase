// Test-only functions: `reset` and `step` play the adapter tests' operation lists over the Convex
// `Tx` on this app's tables, one step per mutation; `command` calls a command's function in the
// component by its name.
import { mutationGeneric } from "convex/server";
import { v } from "convex/values";
import { Effect, Schema } from "effect";
import { commandFunctions } from "../../../src/hosts/convex/references.ts";
import { convexTx } from "../../../src/hosts/convex/tx.ts";
import { decodeName } from "../../../src/store/commands.ts";
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

const functions = commandFunctions(components.identityBroker);

export const command = mutationGeneric({
  args: { name: v.string(), args: v.any(), now: v.number() },
  handler: (ctx, input): Promise<unknown> => {
    const command = functions[decodeName(input.name)];
    return command.kind === "query"
      ? ctx.runQuery(command.reference, { args: input.args, now: input.now })
      : ctx.runMutation(command.reference, { args: input.args, now: input.now });
  },
});
