// Cleanup of what has run out, one bounded batch per call.
import { Effect } from "effect";
import { Tx, type Row } from "../store/Tx.ts";
import type { CleanupArgs } from "./schemas.ts";

/** How many rows one batch deletes per category, so a batch stays well inside one step. */
export const BATCH = 200;

/**
 * At most one batch of the preview clients idle since before `cutoff`: a client that never signed
 * in counts from its creation, and any other from its last sign-in. Both reads stop at the batch.
 */
const idlePreviewClients = (cutoff: number) =>
  Effect.gen(function* () {
    const tx = yield* Tx;
    const neverUsed = yield* tx.query("clients", "by_deployment_type_and_activity", {
      eq: ["preview", undefined],
      range: [{ op: "lt", value: cutoff }],
      order: "asc",
      limit: BATCH,
    });
    if (neverUsed.length === BATCH) {
      return neverUsed;
    }
    const used = yield* tx.query("clients", "by_deployment_type_and_activity", {
      eq: ["preview"],
      range: [
        { op: "gt", value: undefined },
        { op: "lt", value: cutoff },
      ],
      order: "asc",
      limit: BATCH - neverUsed.length,
    });
    return [...neverUsed, ...used];
  });

/**
 * Deletes one batch of what has run out: expired requests and codes, preview clients nobody used
 * for `previewClientMaxAgeMs` when the host passes it, clients past their removal date, and audit
 * rows older than `signInRetentionMs`. A category that filled its batch may hold more: `more` asks
 * the host for another call with the same arguments. The cutoff never moves, so the calls end.
 */
export const cleanup = (args: typeof CleanupArgs.Type) =>
  Effect.gen(function* () {
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
    const { previewClientMaxAgeMs } = args;
    const previewClients =
      previewClientMaxAgeMs === undefined
        ? []
        : yield* idlePreviewClients(args.now - previewClientMaxAgeMs);
    const expiredClients = yield* tx.query("clients", "by_remove_at", {
      eq: [],
      range: [
        { op: "gt", value: undefined },
        { op: "lt", value: args.now },
      ],
      order: "asc",
      limit: BATCH,
    });
    // A row can be in both lists.
    const clients = new Map<string, Row<"clients">>(
      [...previewClients, ...expiredClients].map((client) => [client.id.key, client]),
    );
    for (const client of clients.values()) {
      yield* tx.delete("clients", client.id);
    }
    const signIns = yield* tx.query("signIns", "by_at", expired(args.now - args.signInRetentionMs));
    for (const signIn of signIns) {
      yield* tx.delete("signIns", signIn.id);
    }
    const counts = {
      authRequests: requests.length,
      authorizationCodes: codes.length,
      previewClients: previewClients.length,
      expiredClients: expiredClients.length,
      signIns: signIns.length,
    };
    return { ...counts, more: Object.values(counts).some((count) => count === BATCH) };
  });
