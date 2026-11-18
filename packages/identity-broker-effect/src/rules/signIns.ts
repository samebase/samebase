import { Effect } from "effect";
import { Tx } from "../store/Tx.ts";
import type { RecordArgs } from "./schemas.ts";

/** One audit row per issued id_token: no email, no name, no token. */
export const record = Effect.fnUntraced(function* (args: typeof RecordArgs.Type) {
  const tx = yield* Tx;
  yield* tx.insert("signIns", {
    appId: args.appId,
    clientId: args.clientId,
    connector: args.connector,
    sub: args.sub,
    at: args.at,
  });
  return null;
});
