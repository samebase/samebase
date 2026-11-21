// The client card as the sign-in steps read it: the card of a client id, its stops, and the one
// rule of whether a request may go on with a connector now.
import { Effect } from "effect";
import { first, unique, type Row } from "../store/Tx.ts";
import type { ClientIdArgs, GateNamespace } from "./schemas.ts";
import { Tx, type CoreTables } from "./tables.ts";

/** How long a temporary card lives after its last sign-in. */
export const LEASE_MS = 14 * 24 * 60 * 60 * 1000;

type Card = Row<CoreTables, "clients">["doc"];

export const cardRow = Effect.fnUntraced(function* (clientId: string) {
  return yield* unique(yield* Tx, "clients", "by_client_id", [clientId]);
});

/**
 * Whether one of the card's gates refuses it: a row of `stops` holds the gate, or the gate is in a
 * namespace of `liveGates` and not among that namespace's live gates.
 */
export const isStopped = Effect.fnUntraced(function* (
  card: Card,
  liveGates: ReadonlyArray<GateNamespace>,
) {
  const tx = yield* Tx;
  for (const key of card.gates) {
    if (
      liveGates.some(
        (namespace) => key.startsWith(namespace.prefix) && !namespace.live.includes(key),
      )
    ) {
      return true;
    }
    if ((yield* first(tx, "stops", "by_key", [key])) !== undefined) {
      return true;
    }
  }
  return false;
});

/** What every sign-in step knows of the hub: its configured connectors and its live gates. */
type HubNow = {
  readonly configured: ReadonlyArray<string>;
  readonly liveGates: ReadonlyArray<GateNamespace>;
};

/**
 * The card of `request`'s client when the request may go on with `connector` now: the card exists,
 * no gate refuses it (`isStopped`), the request's return address is still on it, and the connector
 * is in the request's stored set, on the card, and among the hub's `configured` connectors.
 * Undefined otherwise.
 */
export const usableCard = Effect.fnUntraced(function* (
  request: {
    readonly clientId: string;
    readonly redirectUri: string;
    readonly connectors: ReadonlyArray<string>;
  },
  connector: string,
  hub: HubNow,
) {
  const row = yield* cardRow(request.clientId);
  if (
    row === undefined ||
    (yield* isStopped(row.doc, hub.liveGates)) ||
    !row.doc.redirectUris.includes(request.redirectUri) ||
    !request.connectors.includes(connector) ||
    !row.doc.connectors.includes(connector) ||
    !hub.configured.includes(connector)
  ) {
    return undefined;
  }
  return row;
});

/** What a sign-in writes on the card it used: a temporary card then lives `LEASE_MS` from now. */
export const used = (card: Card, now: number): Card => ({
  ...card,
  lastSignInAt: now,
  ...(card.removeAt === undefined ? {} : { removeAt: now + LEASE_MS }),
});

/** What `/authorize` and UserInfo read of a card. */
export const get = Effect.fnUntraced(function* (args: typeof ClientIdArgs.Type) {
  const row = yield* cardRow(args.clientId);
  if (row === undefined) {
    return null;
  }
  return {
    clientId: row.doc.clientId,
    ref: row.doc.ref,
    redirectUris: row.doc.redirectUris,
    connectors: row.doc.connectors,
    confirm: row.doc.confirm,
  };
});
