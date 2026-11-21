// The stack layer's field of a card (`stack`) and its view of a step. The layer has no tables of
// its own: it writes cards, whose rows are in every hub's `clients` (src/store/tables.ts).
import { Context, Schema } from "effect";
import type { Tables } from "../../store/tables.ts";
import type { TxShape } from "../../store/Tx.ts";

const Str = Schema.String;

/** What only this layer reads about a client: the RFC 7592 read and delete read it. */
export const StackClient = Schema.Struct({
  /** The name of the key that registered the client, as the hub's settings name it. */
  key: Str,
  /** The client's name, such as its stage. */
  name: Str,
  softwareId: Str,
  softwareVersion: Str,
  /** SHA-256 hex of the client's own RFC 7592 registration access token. */
  registrationTokenHash: Str,
  /** The connectors the registration enrolled in: the card's `connectors` are a part of these. */
  enrollment: Schema.Array(Str),
});

export const cardFields = { stack: Schema.optionalKey(StackClient) };

/** The layer's view of a step: every table of the hub, with the cards' `stack` fields. */
export class StackTx extends Context.Service<StackTx, TxShape<Tables>>()(
  "identity-broker/layers/stack/StackTx",
) {}
