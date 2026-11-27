// Cleanup of what has run out, one bounded batch per call.
import { Effect } from "effect";
import { unique } from "../store/Tx.ts";
import type { CleanupArgs } from "./schemas.ts";
import { Tx } from "./tables.ts";

/** How many rows one batch deletes per category, so a batch stays well inside one step. */
export const BATCH = 200;

const BUDGET_IDLE_MS = 60 * 60 * 1000;

/**
 * Deletes one batch of what has run out: expired requests and codes, cards past their removal date
 * (a layer's fields of a card are on its row and go with it) with the budget row of each card when
 * nothing spent from it for an hour, and every row of `signIns`, which nothing writes since
 * 0.47.0. A category that filled its batch may hold more: `more` asks the host for another call
 * with the same arguments. The cutoff never moves, so the calls end.
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
    // A bucket that no one spent from for an hour is full, so its row holds nothing.
    const budget = yield* unique(tx, "signInBudgets", "by_key", [client.doc.budget]);
    if (budget !== undefined && budget.doc.at < args.now - BUDGET_IDLE_MS) {
      yield* tx.delete("signInBudgets", budget.id);
    }
  }
  const signIns = yield* tx.query("signIns", "by_at", { eq: [], order: "asc", limit: BATCH });
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
