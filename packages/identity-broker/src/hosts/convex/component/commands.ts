// The command boundary on Convex: one mutation runs any command as one transaction. Arguments and
// result cross as JSON text, as on the other hosts, so Convex's value rules (no `undefined` in
// arrays, no `$` or `_` keys) never meet a command's data.
import { mutationGeneric } from "convex/server";
import { v } from "convex/values";
import { Schema } from "effect";
import { decodeCommand } from "../../../index.ts";
import { convexTx } from "../tx.ts";

const parseJson = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Unknown));

export const run = mutationGeneric({
  args: { name: v.string(), args: v.string(), now: v.number() },
  returns: v.string(),
  handler: async (ctx, input) =>
    JSON.stringify(
      await decodeCommand(input.name, parseJson(input.args)).runAsync(input.now, convexTx(ctx.db)),
    ),
});
