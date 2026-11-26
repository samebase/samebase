// The cards that the metadata layer writes, each in the command that writes it: the step before a
// fetch of a document, the card from a document, its removal, and the stop of a site. The id is
// the one fact a card is computed from: its host gives the card's gate and budget, `site:<host>`.
import { Effect, Schema } from "effect";
import { spendBudget } from "../../rules/authRequests.ts";
import type { Step } from "../../rules/commands.ts";
import { UrlClientId } from "../../rules/tables.ts";
import { first, unique } from "../../store/Tx.ts";
import { readSiteClientId } from "./policy.ts";
import { MetadataTx } from "./tables.ts";

const Str = Schema.String;
const Strs = Schema.Array(Str);

/** A card that nobody signed in with is removed this long after its last good check. */
export const UNUSED_MS = 24 * 60 * 60 * 1000;

/** The broker-wide budgets of the layer: rows of `signInBudgets` under these keys. */
export const FETCH_BUDGET = "metadata:fetches";
export const NEW_CARD_BUDGET = "metadata:new-cards";

/** The gate and the sign-in budget of every card of `host`, and the key of its stop. */
export const siteKey = (host: string) => `site:${host}`;

const Limits = Schema.Struct({
  rate: Schema.Finite,
  periodMs: Schema.Finite,
  capacity: Schema.Finite,
});

export const BeginArgs = Schema.Struct({
  clientId: UrlClientId,
  redirectUri: Str,
  /** The layer's connectors of now: a card with others is read again. */
  connectors: Strs,
  fetches: Limits,
});
export const BeginResult = Schema.Union([
  Schema.Struct({ next: Schema.Literals(["stopped", "fresh", "limited"]) }),
  Schema.Struct({ next: Schema.Literal("fetch"), fetchStartedAt: Schema.Finite }),
]);

export const PutArgs = Schema.Struct({
  clientId: UrlClientId,
  fetchStartedAt: Schema.Finite,
  freshUntil: Schema.Finite,
  redirectUris: Strs,
  connectors: Strs,
  newCards: Limits,
});
export const PutResult = Schema.Literals(["inserted", "replaced", "older", "stopped", "limited"]);

export const RemoveArgs = Schema.Struct({ clientId: UrlClientId, fetchStartedAt: Schema.Finite });
export const RemoveResult = Schema.Struct({ removed: Schema.Boolean });

export const SiteArgs = Schema.Struct({ host: Str });
export const SiteResult = Schema.Struct({ changed: Schema.Boolean });

/** The host of an id that the policy takes. Any other id is a defect of the caller. */
const hostOf = (clientId: string) => {
  const id = readSiteClientId(clientId);
  return id._tag === "ClientId"
    ? Effect.succeed(id.host)
    : Effect.die(new Error(`Not a client id of the metadata layer: ${id.code}`));
};

const isStopped = Effect.fnUntraced(function* (host: string) {
  return (yield* first(yield* MetadataTx, "stops", "by_key", [siteKey(host)])) !== undefined;
});

/** The card of `clientId`, which is a public card when there is one. */
const cardOf = Effect.fnUntraced(function* (clientId: string) {
  const row = yield* unique(yield* MetadataTx, "clients", "by_client_id", [clientId]);
  if (row === undefined) {
    return undefined;
  }
  const { id, doc } = row;
  return doc.tokenEndpointAuthMethod === "none"
    ? // A card that no fetch of the layer wrote is older than any fetch, and never fresh.
      { id, doc, fetched: doc.metadata ?? { fetchStartedAt: 0, freshUntil: 0 } }
    : yield* Effect.die(new Error("A secret card has an https client id"));
});

const sameSet = (a: ReadonlyArray<string>, b: ReadonlyArray<string>) =>
  a.length === b.length && a.every((name) => b.includes(name));

/**
 * The step before a fetch: a stopped site stops here; a card that is fresh, that holds the
 * request's return address and the layer's connectors of now is used as it is; else the fetch
 * takes a token of the broker-wide fetch budget, and its start is the step clock.
 */
export const begin = Effect.fnUntraced(function* (args: typeof BeginArgs.Type, step: Step) {
  const host = yield* hostOf(args.clientId);
  if (yield* isStopped(host)) {
    return { next: "stopped" as const };
  }
  const card = yield* cardOf(args.clientId);
  if (
    card !== undefined &&
    card.fetched.freshUntil > step.now &&
    card.doc.redirectUris.includes(args.redirectUri) &&
    sameSet(card.doc.connectors, args.connectors)
  ) {
    return { next: "fresh" as const };
  }
  if (!(yield* spendBudget(FETCH_BUDGET, step.now, args.fetches))) {
    return { next: "limited" as const };
  }
  return { next: "fetch" as const, fetchStartedAt: step.now };
});

/**
 * The card from a document that the layer accepted. With no card of the id, a token of the
 * new-card budget makes one. A card is replaced only by a fetch that started after the fetch that
 * it holds: an older, slower fetch changes nothing. The stop and the id are checked again here,
 * so no other path writes a public card of a stopped site or of another kind of id.
 */
export const put = Effect.fnUntraced(function* (args: typeof PutArgs.Type, step: Step) {
  const tx = yield* MetadataTx;
  const host = yield* hostOf(args.clientId);
  if (yield* isStopped(host)) {
    return "stopped" as const;
  }
  const metadata = { fetchStartedAt: args.fetchStartedAt, freshUntil: args.freshUntil };
  const card = yield* cardOf(args.clientId);
  if (card === undefined) {
    if (!(yield* spendBudget(NEW_CARD_BUDGET, step.now, args.newCards))) {
      return "limited" as const;
    }
    yield* tx.insert("clients", {
      tokenEndpointAuthMethod: "none",
      clientId: args.clientId,
      secretHash: null,
      redirectUris: args.redirectUris,
      connectors: args.connectors,
      connections: [],
      gates: [siteKey(host)],
      confirm: true,
      budget: siteKey(host),
      ref: `site:${args.clientId}`,
      removeAt: step.now + UNUSED_MS,
      createdAt: step.now,
      metadata,
    });
    return "inserted" as const;
  }
  if (card.fetched.fetchStartedAt >= args.fetchStartedAt) {
    return "older" as const;
  }
  yield* tx.replace("clients", card.id, {
    ...card.doc,
    redirectUris: args.redirectUris,
    connectors: args.connectors,
    // The lease of a sign-in (`used` of src/rules/clients.ts) can be the later one.
    removeAt: Math.max(card.doc.removeAt ?? 0, step.now + UNUSED_MS),
    metadata,
  });
  return "replaced" as const;
});

/** A fetch whose document is gone or refused deletes the card, when it started after the card's. */
export const remove = Effect.fnUntraced(function* (args: typeof RemoveArgs.Type) {
  const card = yield* cardOf(args.clientId);
  if (card === undefined || card.fetched.fetchStartedAt >= args.fetchStartedAt) {
    return { removed: false };
  }
  yield* (yield* MetadataTx).delete("clients", card.id);
  return { removed: true };
});

/** Stops every card of `host` at once (its gate), and every new one (`begin` and `put`). */
export const stop = Effect.fnUntraced(function* (args: typeof SiteArgs.Type, step: Step) {
  const tx = yield* MetadataTx;
  if ((yield* first(tx, "stops", "by_key", [siteKey(args.host)])) !== undefined) {
    return { changed: false };
  }
  yield* tx.insert("stops", { key: siteKey(args.host), at: step.now });
  return { changed: true };
});

/** Releases the stop of `host`. */
export const release = Effect.fnUntraced(function* (args: typeof SiteArgs.Type) {
  const tx = yield* MetadataTx;
  const row = yield* first(tx, "stops", "by_key", [siteKey(args.host)]);
  if (row === undefined) {
    return { changed: false };
  }
  yield* tx.delete("stops", row.id);
  return { changed: true };
});
