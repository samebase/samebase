// The command boundary on Convex: one mutation runs any command as one transaction. Arguments and
// result cross as JSON text, as on the other hosts, so Convex's value rules (no `undefined` in
// arrays, no `$` or `_` keys) never meet a command's data.
import { mutationGeneric } from "convex/server";
import { v } from "convex/values";
import { Schema } from "effect";
import { decodeArgs, decodeName, runStepAsync } from "../../../store/commands.ts";
import { convexTx } from "../tx.ts";

const parseJson = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Unknown));

export const run = mutationGeneric({
  args: { name: v.string(), args: v.string(), now: v.number() },
  returns: v.string(),
  handler: async (ctx, input) => {
    const name = decodeName(input.name);
    const args = decodeArgs(name, parseJson(input.args));
    return JSON.stringify(await runStepAsync(name, args, input.now, convexTx(ctx.db)));
  },
});
