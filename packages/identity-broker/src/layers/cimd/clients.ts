// The cards that the CIMD layer writes, each in the command that writes it: the step before a
// fetch of a document, the card from a document, its removal, and the block of a host. The id is
// the one fact a card is computed from: its host gives the card's gate and budget,
// `cimd:host:<host>`.
import { Effect, Schema } from "effect";
import { spendBudget } from "../../rules/authRequests.ts";
import type { Step } from "../../rules/commands.ts";
import { UrlClientId } from "../../rules/tables.ts";
import { first, unique } from "../../store/Tx.ts";
import { readClientId } from "./policy.ts";
import { CimdTx } from "./tables.ts";

const Str = Schema.String;
const Strs = Schema.Array(Str);

/** A card that nobody signed in with is removed this long after its last good check. */
export const UNUSED_MS = 24 * 60 * 60 * 1000;

/** The broker-wide budgets of the layer: rows of `signInBudgets` under these keys. */
export const FETCH_BUDGET = "cimd:fetches";
export const NEW_CLIENT_BUDGET = "cimd:new-clients";

/** The gate and the sign-in budget of every card of `host`, and the key of its stop. */
export const hostKey = (host: string) => `cimd:host:${host}`;

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
  Schema.Struct({ next: Schema.Literals(["stopped", "fresh", "rate_limited"]) }),
  Schema.Struct({ next: Schema.Literal("fetch"), fetchStartedAt: Schema.Finite }),
]);

export const PutArgs = Schema.Struct({
  clientId: UrlClientId,
  /** The return address of the sign-in that read the document. */
  redirectUri: Str,
  fetchStartedAt: Schema.Finite,
  freshUntil: Schema.Finite,
  redirectUris: Strs,
  connectors: Strs,
  newClients: Limits,
});
export const PutResult = Schema.Literals([
  "inserted",
  "replaced",
  "older",
  "stopped",
  "rate_limited",
  "not_listed",
]);

export const RemoveArgs = Schema.Struct({ clientId: UrlClientId, fetchStartedAt: Schema.Finite });
export const RemoveResult = Schema.Struct({ removed: Schema.Boolean });

export const HostArgs = Schema.Struct({ host: Str });
export const HostResult = Schema.Struct({ changed: Schema.Boolean });

/** The host of an id that the policy takes. Any other id is a defect of the caller. */
const hostOf = (clientId: string) => {
  const id = readClientId(clientId);
  return id._tag === "ClientId"
    ? Effect.succeed(id.hostname)
    : Effect.die(new Error(`Not a client id of the CIMD layer: ${id.code}`));
};

const isStopped = Effect.fnUntraced(function* (host: string) {
  return (yield* first(yield* CimdTx, "stops", "by_key", [hostKey(host)])) !== undefined;
});

/** The card of `clientId`, which is a public card when there is one. */
const cardOf = Effect.fnUntraced(function* (clientId: string) {
  const row = yield* unique(yield* CimdTx, "clients", "by_client_id", [clientId]);
  if (row === undefined) {
    return undefined;
  }
  const { id, doc } = row;
  return doc.tokenEndpointAuthMethod === "none"
    ? // A card that no fetch of the layer wrote is older than any fetch, and never fresh.
      { id, doc, fetched: doc.cimd ?? { fetchStartedAt: 0, freshUntil: 0 } }
    : yield* Effect.die(new Error("A secret card has an https client id"));
});

const sameSet = (a: ReadonlyArray<string>, b: ReadonlyArray<string>) =>
  a.length === b.length && a.every((name) => b.includes(name));

/**
 * The step before a fetch: a blocked host stops here; a card that is fresh, that holds the
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
    return { next: "rate_limited" as const };
  }
  return { next: "fetch" as const, fetchStartedAt: step.now };
});

/**
 * The card from a document that the layer accepted. With no card of the id, a token of the
 * new-client budget makes one. A card is replaced only by a fetch that started after the fetch that
 * it holds: an older, slower fetch changes nothing. A document that does not list the sign-in's
 * address still replaces a card, but makes none, and the answer is `not_listed`. The block and the
 * id are checked again here, so no other path writes a public card of a blocked host or of another
 * kind of id.
 */
export const put = Effect.fnUntraced(function* (args: typeof PutArgs.Type, step: Step) {
  const tx = yield* CimdTx;
  const host = yield* hostOf(args.clientId);
  if (yield* isStopped(host)) {
    return "stopped" as const;
  }
  const listed = args.redirectUris.includes(args.redirectUri);
  const cimd = { fetchStartedAt: args.fetchStartedAt, freshUntil: args.freshUntil };
  const card = yield* cardOf(args.clientId);
  if (card === undefined) {
    if (!listed) {
      return "not_listed" as const;
    }
    if (!(yield* spendBudget(NEW_CLIENT_BUDGET, step.now, args.newClients))) {
      return "rate_limited" as const;
    }
    yield* tx.insert("clients", {
      tokenEndpointAuthMethod: "none",
      clientId: args.clientId,
      secretHash: null,
      redirectUris: args.redirectUris,
      connectors: args.connectors,
      connections: [],
      gates: [hostKey(host)],
      confirm: true,
      budget: hostKey(host),
      ref: `cimd:${args.clientId}`,
      removeAt: step.now + UNUSED_MS,
      createdAt: step.now,
      cimd,
    });
    return "inserted" as const;
  }
  if (card.fetched.fetchStartedAt >= args.fetchStartedAt) {
    return listed ? ("older" as const) : ("not_listed" as const);
  }
  yield* tx.replace("clients", card.id, {
    ...card.doc,
    redirectUris: args.redirectUris,
    connectors: args.connectors,
    // The lease of a sign-in (`used` of src/rules/clients.ts) can be the later one.
    removeAt: Math.max(card.doc.removeAt ?? 0, step.now + UNUSED_MS),
    cimd,
  });
  return listed ? ("replaced" as const) : ("not_listed" as const);
});

/**
 * A fetch whose document is gone or refused deletes the card, when it started after the card's,
 * and the budget row of the card's host.
 */
export const remove = Effect.fnUntraced(function* (args: typeof RemoveArgs.Type) {
  const tx = yield* CimdTx;
  const card = yield* cardOf(args.clientId);
  if (card === undefined || card.fetched.fetchStartedAt >= args.fetchStartedAt) {
    return { removed: false };
  }
  yield* tx.delete("clients", card.id);
  const budget = yield* unique(tx, "signInBudgets", "by_key", [card.doc.budget]);
  if (budget !== undefined) {
    yield* tx.delete("signInBudgets", budget.id);
  }
  return { removed: true };
});

/** Blocks every card of `host` at once (its gate), and every new one (`begin` and `put`). */
export const blockHost = Effect.fnUntraced(function* (args: typeof HostArgs.Type, step: Step) {
  const tx = yield* CimdTx;
  if ((yield* first(tx, "stops", "by_key", [hostKey(args.host)])) !== undefined) {
    return { changed: false };
  }
  yield* tx.insert("stops", { key: hostKey(args.host), at: step.now });
  return { changed: true };
});

/** Removes the block of `host`. */
export const unblockHost = Effect.fnUntraced(function* (args: typeof HostArgs.Type) {
  const tx = yield* CimdTx;
  const row = yield* first(tx, "stops", "by_key", [hostKey(args.host)]);
  if (row === undefined) {
    return { changed: false };
  }
  yield* tx.delete("stops", row.id);
  return { changed: true };
});
