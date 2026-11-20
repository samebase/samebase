// Cleanup of what has run out, one bounded batch per call.
import { Effect } from "effect";
import type { CleanupArgs } from "./schemas.ts";
import { Tx } from "./tables.ts";

/** How many rows one batch deletes per category, so a batch stays well inside one step. */
export const BATCH = 200;

/**
 * Deletes one batch of what has run out: expired requests and codes, cards past their removal date
 * (a layer's fields of a card are on its row and go with it), and audit rows older than
 * `signInRetentionMs`. A category that filled its batch may hold more: `more` asks the host for
 * another call with the same arguments. The cutoff never moves, so the calls end.
 */
export const cleanup = Effect.fnUntraced(function* (args: typeof CleanupArgs.Type) {
  const tx = yield* Tx;
  const expired = (to: number) => ({
    eq: [],
    range: [{ op: "lt" as const, value: to }],
    order: "asc" as const,
    limit: BATCH,
  });
  const requests = yield* tx.query("authRequests", "by_expires_at", expired(args.now));
  for (const request of requests) {
    yield* tx.delete("authRequests", request.id);
  }
  const codes = yield* tx.query("authorizationCodes", "by_expires_at", expired(args.now));
  for (const code of codes) {
    yield* tx.delete("authorizationCodes", code.id);
  }
  const clients = yield* tx.query("clients", "by_remove_at", {
    eq: [],
    range: [
      { op: "gt", value: undefined },
      { op: "lt", value: args.now },
    ],
    order: "asc",
    limit: BATCH,
  });
  for (const client of clients) {
    yield* tx.delete("clients", client.id);
  }
  const signIns = yield* tx.query("signIns", "by_at", expired(args.now - args.signInRetentionMs));
  for (const signIn of signIns) {
    yield* tx.delete("signIns", signIn.id);
  }
  const counts = {
    authRequests: requests.length,
    authorizationCodes: codes.length,
    clients: clients.length,
    signIns: signIns.length,
  };
  return { ...counts, more: Object.values(counts).some((count) => count === BATCH) };
});
