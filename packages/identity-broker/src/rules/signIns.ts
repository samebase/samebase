import { Effect } from "effect";
import type { RecordArgs } from "./schemas.ts";
import { Tx } from "./tables.ts";

/** One audit row per issued id_token: no email, no name, no token. */
export const record = Effect.fnUntraced(function* (args: typeof RecordArgs.Type) {
  const tx = yield* Tx;
  yield* tx.insert("signIns", {
    clientId: args.clientId,
    ref: args.ref,
    connector: args.connector,
    sub: args.sub,
    at: args.at,
  });
  return null;
});
