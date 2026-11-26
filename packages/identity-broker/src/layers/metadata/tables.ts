// The metadata layer's field of a public card (`metadata`) and its view of a step. The layer has no
// tables of its own: its cards are rows of `clients`, its stops rows of `stops`, and its two
// broker-wide budgets rows of `signInBudgets`.
import { Context, Schema } from "effect";
import type { Tables } from "../../store/tables.ts";
import type { TxShape } from "../../store/Tx.ts";

/** What only this layer reads about a client: the fetch that the card holds. */
export const MetadataCard = Schema.Struct({
  /** The step clock when the fetch of the document started: a later fetch replaces the card. */
  fetchStartedAt: Schema.Finite,
  /** Until when the document is fresh; after it, a new sign-in reads the document again. */
  freshUntil: Schema.Finite,
});

/**
 * Optional, as a layer's field of a card is: the core's code and the integrations part write a card
 * of the core's fields with the stored fields spread in. The layer writes it on each of its cards.
 */
export const cardFields = { metadata: Schema.optionalKey(MetadataCard) };

/** The layer's view of a step: every table of the broker, with the cards' `metadata` fields. */
export class MetadataTx extends Context.Service<MetadataTx, TxShape<Tables>>()(
  "identity-broker/layers/metadata/MetadataTx",
) {}
