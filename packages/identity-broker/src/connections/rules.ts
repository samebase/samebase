// The rules of the connections part, each one all-or-nothing step: the request machine (create
// `upstream`, claim, complete with the provider's tokens, abandon), the code exchange, the
// admission of a refresh, the client authentication of a revocation, and cleanup. Every step reads
// the client's card in its own transaction, with the same two forms of stop as sign-in: a row of
// `stops`, and a gate that the registration layer no longer has (`isStopped`). A connection goes
// on only while its provider is in the card's `connections` and among the hub's configured
// providers. The hub keeps no provider token after the code exchange: the client holds them.
import { Effect, Schema } from "effect";
import { spendBudget } from "../rules/authRequests.ts";
import { cardRow, isStopped, used } from "../rules/clients.ts";
import { GateNamespace, Return } from "../rules/schemas.ts";
import { TokenEndpointAuthMethod, type Tx } from "../rules/tables.ts";
import type { Doc } from "../store/tables.ts";
import { unique } from "../store/Tx.ts";
import { ConnectionsTx, ProviderTokens } from "./tables.ts";

const Str = Schema.String;
const Num = Schema.Finite;
const Strs = Schema.Array(Str);
const opt = Schema.optionalKey;

/** The views of a step that the part's rules read: cards through the core's, its own tables. */
type Views = Tx | ConnectionsTx;

/** How many rows one cleanup batch deletes per category. */
export const BATCH = 200;

/** A configured provider, as a step knows it: its name on cards and its resource URL. */
const Provider = Schema.Struct({ name: Str, resource: Str });

/** What every connection step knows of the hub now. */
const hubNow = { providers: Schema.Array(Provider), liveGates: Schema.Array(GateNamespace) };
type HubNow = {
  readonly providers: ReadonlyArray<typeof Provider.Type>;
  readonly liveGates: ReadonlyArray<GateNamespace>;
};

const back = Schema.optional(Return);

type ConnectionRequest = Doc<"connectionRequests">;

/**
 * A refusal of the card, a stop or a gate, the card's `connections`, or a limit, for the route's
 * `hub_event` line. `ref` is null when the card is gone.
 */
export const Refused = Schema.Struct({
  reason: Schema.Literals(["card", "stopped", "connections", "rate_limited"]),
  clientId: Str,
  ref: Schema.NullOr(Str),
  resource: Str,
});
type Refused = typeof Refused.Type;

const refused = (
  reason: Refused["reason"],
  card: { readonly clientId: string; readonly ref: string | null },
  resource: string,
): Refused => ({ reason, clientId: card.clientId, ref: card.ref, resource });

/** Whether the card may use the provider of `resource`: configured, and in its `connections`. */
const offers = (card: Doc<"clients">, resource: string, hub: HubNow) => {
  const provider = hub.providers.find((candidate) => candidate.resource === resource);
  return provider !== undefined && card.connections.includes(provider.name);
};

/**
 * Whether `request` may go on now: the card exists and holds the return address, no gate refuses
 * it, and it offers the provider. `back` is the return address when the card holds it.
 */
const admission = Effect.fnUntraced(function* (request: ConnectionRequest, hub: HubNow) {
  const back = yield* returnTo(request);
  const card = yield* cardRow(request.clientId);
  if (card === undefined) {
    const gone = { clientId: request.clientId, ref: null };
    return { ok: false, back, refused: refused("card", gone, request.resource) } as const;
  }
  if (back === undefined) {
    return { ok: false, back, refused: refused("card", card.doc, request.resource) } as const;
  }
  if (yield* isStopped(card.doc, hub.liveGates)) {
    return { ok: false, back, refused: refused("stopped", card.doc, request.resource) } as const;
  }
  if (!offers(card.doc, request.resource, hub)) {
    return {
      ok: false,
      back,
      refused: refused("connections", card.doc, request.resource),
    } as const;
  }
  return { ok: true, back } as const;
});

/** The request's return address when the card holds it in this step, else undefined. */
const returnTo = Effect.fnUntraced(function* (request: ConnectionRequest) {
  const card = yield* cardRow(request.clientId);
  return card !== undefined && card.doc.redirectUris.includes(request.redirectUri)
    ? {
        redirectUri: request.redirectUri,
        ...(request.state === undefined ? {} : { state: request.state }),
      }
    : undefined;
});

const requestOf = Effect.fnUntraced(function* (requestId: string) {
  return yield* unique(yield* ConnectionsTx, "connectionRequests", "by_request_id", [requestId]);
});

/** The fields shared by every status. `replace` writes the whole document. */
const baseFields = (request: ConnectionRequest) => ({
  requestId: request.requestId,
  clientId: request.clientId,
  redirectUri: request.redirectUri,
  resource: request.resource,
  ...(request.state === undefined ? {} : { state: request.state }),
  codeChallenge: request.codeChallenge,
  txnCookieHash: request.txnCookieHash,
  expiresAt: request.expiresAt,
});

/** The client authenticates with its card's method and secret. */
const ClientAuth = {
  clientId: Str,
  /** SHA-256 hex of the client secret the request carried. */
  clientSecretHash: Str,
  tokenEndpointAuthMethod: TokenEndpointAuthMethod,
};

const authenticated = Effect.fnUntraced(function* (args: {
  readonly clientId: string;
  readonly clientSecretHash: string;
  readonly tokenEndpointAuthMethod: string;
}) {
  const card = yield* cardRow(args.clientId);
  return card !== undefined &&
    card.doc.secretHash === args.clientSecretHash &&
    card.doc.tokenEndpointAuthMethod === args.tokenEndpointAuthMethod
    ? card
    : undefined;
});

// create

export const CreateArgs = Schema.Struct({
  requestId: Str,
  clientId: Str,
  redirectUri: Str,
  resource: Str,
  state: opt(Str),
  codeChallenge: Str,
  txnCookieHash: Str,
  upstreamStateHash: Str,
  upstreamCodeVerifier: Str,
  ...hubNow,
  now: Num,
  expiresAt: Num,
});
export const CreateResult = Schema.Union([
  Schema.Struct({ ok: Schema.Literal(true) }),
  Schema.Struct({
    ok: Schema.Literal(false),
    error: Schema.Literals([
      "unknown_client",
      "redirect_uri",
      "stopped",
      "refused",
      "rate_limited",
    ]),
    /** Null when no card holds the request's client and return address. */
    refused: Schema.NullOr(Refused),
  }),
]);

/**
 * Stores a connection that goes to the provider, from the card as it is in this step: the card
 * exists, holds the return address, no gate refuses it, and it offers the provider. The start
 * spends the card's `budget`, as a sign-in does. A refused request writes nothing.
 */
export const create = Effect.fnUntraced(function* (
  args: typeof CreateArgs.Type,
): Effect.fn.Return<typeof CreateResult.Type, never, Views> {
  const card = yield* cardRow(args.clientId);
  if (card === undefined) {
    return { ok: false, error: "unknown_client", refused: null };
  }
  if (!card.doc.redirectUris.includes(args.redirectUri)) {
    return { ok: false, error: "redirect_uri", refused: null };
  }
  if (yield* isStopped(card.doc, args.liveGates)) {
    return { ok: false, error: "stopped", refused: refused("stopped", card.doc, args.resource) };
  }
  if (!offers(card.doc, args.resource, args)) {
    return {
      ok: false,
      error: "refused",
      refused: refused("connections", card.doc, args.resource),
    };
  }
  if (!(yield* spendBudget(card.doc.budget, args.now))) {
    return {
      ok: false,
      error: "rate_limited",
      refused: refused("rate_limited", card.doc, args.resource),
    };
  }
  yield* (yield* ConnectionsTx).insert("connectionRequests", {
    status: "upstream",
    requestId: args.requestId,
    clientId: args.clientId,
    redirectUri: args.redirectUri,
    resource: args.resource,
    ...(args.state === undefined ? {} : { state: args.state }),
    codeChallenge: args.codeChallenge,
    txnCookieHash: args.txnCookieHash,
    expiresAt: args.expiresAt,
    upstreamStateHash: args.upstreamStateHash,
    upstreamCodeVerifier: args.upstreamCodeVerifier,
  });
  return { ok: true };
});

// claim

export const ClaimArgs = Schema.Struct({
  upstreamStateHash: Str,
  resource: Str,
  /** SHA-256 hex of each transaction cookie the callback carried. */
  txnCookieHashes: Strs,
  ...hubNow,
  now: Num,
});
export const ClaimResult = Schema.Union([
  Schema.Struct({ status: Schema.Literal("claimed"), requestId: Str, upstreamCodeVerifier: Str }),
  /** The request ran out, or may not go on now; it is deleted. */
  Schema.Struct({ status: Schema.Literal("expired"), requestId: Str, back }),
  Schema.Struct({ status: Schema.Literal("refused"), requestId: Str, back, refused: Refused }),
  Schema.Struct({ status: Schema.Literal("unbound") }),
  Schema.Struct({ status: Schema.Literal("missing") }),
]);

/**
 * The provider's callback arrived with its state. The request moves to `claimed` in the step that
 * finds it, so a replayed or raced callback finds nothing to claim, and only the browser that
 * holds the request's cookie claims it (RFC 9700 section 4.7.1). A request that may not go on now
 * is deleted.
 */
export const claim = Effect.fnUntraced(function* (
  args: typeof ClaimArgs.Type,
): Effect.fn.Return<typeof ClaimResult.Type, never, Views> {
  const tx = yield* ConnectionsTx;
  const row = yield* unique(tx, "connectionRequests", "by_upstream_state_hash", [
    args.upstreamStateHash,
  ]);
  if (row === undefined || row.doc.status !== "upstream" || row.doc.resource !== args.resource) {
    return { status: "missing" };
  }
  const request = row.doc;
  if (!args.txnCookieHashes.includes(request.txnCookieHash)) {
    return { status: "unbound" };
  }
  const admitted = yield* admission(request, args);
  if (request.expiresAt <= args.now) {
    yield* tx.delete("connectionRequests", row.id);
    return { status: "expired", requestId: request.requestId, back: admitted.back };
  }
  if (!admitted.ok) {
    yield* tx.delete("connectionRequests", row.id);
    return {
      status: "refused",
      requestId: request.requestId,
      back: admitted.back,
      refused: admitted.refused,
    };
  }
  yield* tx.replace("connectionRequests", row.id, { status: "claimed", ...baseFields(request) });
  return {
    status: "claimed",
    requestId: request.requestId,
    upstreamCodeVerifier: request.upstreamCodeVerifier,
  };
});

// complete

export const CompleteArgs = Schema.Struct({
  requestId: Str,
  tokens: ProviderTokens,
  codeHash: Str,
  codeExpiresAt: Num,
  ...hubNow,
  now: Num,
});
export const CompleteResult = Schema.Union([
  Schema.Struct({ ok: Schema.Literal(true), back: Return }),
  Schema.Struct({ ok: Schema.Literal(false), error: Schema.Literal("gone"), back }),
  Schema.Struct({
    ok: Schema.Literal(false),
    error: Schema.Literal("refused"),
    back,
    refused: Refused,
  }),
]);

/**
 * The provider gave its tokens after a claim: the hub's code can be handed out, unless the
 * connection may no longer go on (a stop, a card change, or a removed return address committed
 * while the provider answered): the request is then deleted and nothing is issued.
 */
export const complete = Effect.fnUntraced(function* (
  args: typeof CompleteArgs.Type,
): Effect.fn.Return<typeof CompleteResult.Type, never, Views> {
  const tx = yield* ConnectionsTx;
  const row = yield* requestOf(args.requestId);
  if (row === undefined) {
    return { ok: false, error: "gone" };
  }
  const request = row.doc;
  const admitted = yield* admission(request, args);
  if (request.status !== "claimed" || request.expiresAt <= args.now) {
    return { ok: false, error: "gone", back: admitted.back };
  }
  if (!admitted.ok) {
    yield* tx.delete("connectionRequests", row.id);
    return { ok: false, error: "refused", back: admitted.back, refused: admitted.refused };
  }
  yield* tx.replace("connectionRequests", row.id, {
    status: "completed",
    ...baseFields(request),
    // The request outlives its code, so cleanup never deletes it while the code can be redeemed.
    expiresAt: Math.max(request.expiresAt, args.codeExpiresAt + 60 * 1000),
    tokens: args.tokens,
  });
  yield* tx.insert("connectionCodes", {
    codeHash: args.codeHash,
    requestId: request.requestId,
    clientId: request.clientId,
    expiresAt: args.codeExpiresAt,
  });
  return { ok: true, back: admitted.back };
});

// abandon

export const RequestIdArgs = Schema.Struct({ requestId: Str });
export const AbandonResult = Schema.NullOr(Return);

/** Deletes a request, such as after a failed provider exchange; answers its return address. */
export const abandon = Effect.fnUntraced(function* (args: typeof RequestIdArgs.Type) {
  const row = yield* requestOf(args.requestId);
  if (row === undefined) {
    return null;
  }
  yield* (yield* ConnectionsTx).delete("connectionRequests", row.id);
  return (yield* returnTo(row.doc)) ?? null;
});

// exchangeCode

export const ExchangeArgs = Schema.Struct({
  ...ClientAuth,
  codeHash: Str,
  redirectUri: Str,
  /** The S256 challenge of the submitted `code_verifier`, computed by the handler. */
  codeChallengeOfVerifier: Str,
  /** The `resource` of the token request: optional, as in the Convex broker (RFC 8707). */
  resource: opt(Str),
  ...hubNow,
  now: Num,
});
const Refusal = Schema.Struct({
  ok: Schema.Literal(false),
  error: Schema.Literals(["invalid_client", "invalid_grant", "invalid_target"]),
  description: Str,
  /** Null for a refusal of the request itself, such as a wrong verifier. */
  refused: Schema.NullOr(Refused),
});
export const ExchangeResult = Schema.Union([
  /** The code is not a connection's: the core's sign-in redeems it, or refuses it. */
  Schema.Struct({ ok: Schema.Literal(false), error: Schema.Literal("not_found") }),
  Refusal,
  /** The provider's tokens, which the hub no longer holds, and the card's `ref`. */
  Schema.Struct({ ok: Schema.Literal(true), tokens: ProviderTokens, ref: Str, resource: Str }),
]);
type ExchangeResult = typeof ExchangeResult.Type;

const refuse = (
  error: "invalid_client" | "invalid_grant" | "invalid_target",
  description: string,
  refusal: Refused | null = null,
): ExchangeResult => ({ ok: false, error, description, refused: refusal });

/**
 * Redeems a connection's code: single use, bound to the client, its return address and its PKCE
 * challenge (RFC 6749 section 4.1.3, RFC 7636), and to the request's resource (RFC 8707). The code
 * is looked up first, so a sign-in code is left to the core untouched. On success the code and the
 * request are deleted, so the hub keeps no provider token and a replay finds no code; the
 * provider's tokens go to the client, and a temporary card lives on.
 */
export const exchangeCode = Effect.fnUntraced(function* (
  args: typeof ExchangeArgs.Type,
): Effect.fn.Return<ExchangeResult, never, Views> {
  const tx = yield* ConnectionsTx;
  const code = yield* unique(tx, "connectionCodes", "by_code_hash", [args.codeHash]);
  if (code === undefined) {
    return { ok: false, error: "not_found" };
  }
  const card = yield* authenticated(args);
  if (card === undefined) {
    return refuse("invalid_client", "Client authentication failed.");
  }
  // Read before the stop, which then names the request's provider.
  const row = yield* requestOf(code.doc.requestId);
  if (yield* isStopped(card.doc, args.liveGates)) {
    return refuse(
      "invalid_client",
      "Client authentication failed.",
      row === undefined ? null : refused("stopped", card.doc, row.doc.resource),
    );
  }
  if (code.doc.clientId !== args.clientId) {
    return refuse("invalid_grant", "The authorization code belongs to another client.");
  }
  if (code.doc.expiresAt <= args.now) {
    return refuse("invalid_grant", "The authorization code expired.");
  }
  if (row === undefined || row.doc.status !== "completed") {
    return refuse("invalid_grant", "The authorization is unavailable.");
  }
  const request = row.doc;
  if (args.resource !== undefined && args.resource !== request.resource) {
    return refuse("invalid_target", "The resource does not match the authorization.");
  }
  if (!offers(card.doc, request.resource, args)) {
    return refuse(
      "invalid_target",
      "This client cannot use that API resource.",
      refused("connections", card.doc, request.resource),
    );
  }
  if (
    args.redirectUri !== request.redirectUri ||
    args.codeChallengeOfVerifier !== request.codeChallenge
  ) {
    return refuse("invalid_grant", "The redirect URI or PKCE verifier does not match.");
  }
  if (!card.doc.redirectUris.includes(request.redirectUri)) {
    return refuse(
      "invalid_grant",
      "This client cannot finish this connection now.",
      refused("card", card.doc, request.resource),
    );
  }
  yield* tx.delete("connectionCodes", code.id);
  yield* tx.delete("connectionRequests", row.id);
  yield* tx.replace("clients", card.id, used(card.doc, args.now));
  return { ok: true, tokens: request.tokens, ref: card.doc.ref, resource: request.resource };
});

// admitRefresh

export const AdmitRefreshArgs = Schema.Struct({
  ...ClientAuth,
  /** Required on refresh: the hub keeps no grant that knows it. */
  resource: Str,
  ...hubNow,
  now: Num,
});
export const AdmitRefreshResult = Schema.Union([
  Schema.Struct({ ok: Schema.Literal(true), ref: Str }),
  Schema.Struct({
    ok: Schema.Literal(false),
    error: Schema.Literals(["invalid_client", "invalid_target"]),
    description: Str,
    /** Null when the client authentication failed. */
    refused: Schema.NullOr(Refused),
  }),
]);

/**
 * The admission of a refresh (RFC 6749 section 6), before the hub forwards the client's refresh
 * token to the provider: the client authenticates, no gate refuses it, and it may use the
 * provider of `resource` now. An admitted refresh renews a temporary card. The token itself is
 * the provider's to judge.
 */
export const admitRefresh = Effect.fnUntraced(function* (
  args: typeof AdmitRefreshArgs.Type,
): Effect.fn.Return<typeof AdmitRefreshResult.Type, never, Views> {
  const card = yield* authenticated(args);
  const failed = "Client authentication failed.";
  if (card === undefined) {
    return { ok: false, error: "invalid_client", description: failed, refused: null };
  }
  if (yield* isStopped(card.doc, args.liveGates)) {
    return {
      ok: false,
      error: "invalid_client",
      description: failed,
      refused: refused("stopped", card.doc, args.resource),
    };
  }
  if (!offers(card.doc, args.resource, args)) {
    return {
      ok: false,
      error: "invalid_target",
      description: "This client cannot use that API resource.",
      refused: refused("connections", card.doc, args.resource),
    };
  }
  yield* (yield* ConnectionsTx).replace("clients", card.id, used(card.doc, args.now));
  return { ok: true, ref: card.doc.ref };
});

// authenticate

export const AuthenticateArgs = Schema.Struct(ClientAuth);
/** The card's `ref`, or null when the client authentication failed. */
export const AuthenticateResult = Schema.NullOr(Str);

/**
 * The client authentication of a revocation (RFC 7009 section 2.1). A stopped client may still
 * revoke: a revocation only takes access away.
 */
export const authenticate = Effect.fnUntraced(function* (args: typeof AuthenticateArgs.Type) {
  return (yield* authenticated(args))?.doc.ref ?? null;
});

// cleanup

export const CleanupArgs = Schema.Struct({ now: Num });
export const CleanupResult = Schema.Struct({
  connectionRequests: Num,
  connectionCodes: Num,
  /** A category filled its batch: call again with the same arguments. */
  more: Schema.Boolean,
});

/**
 * One batch of what has run out: expired requests and codes. A host runs it beside the core's
 * cleanup until it reports no `more`. The cutoff never moves, so the calls end.
 */
export const cleanup = Effect.fnUntraced(function* (args: typeof CleanupArgs.Type) {
  const tx = yield* ConnectionsTx;
  const expired = {
    eq: [],
    range: [{ op: "lt" as const, value: args.now }],
    order: "asc" as const,
    limit: BATCH,
  };
  const requests = yield* tx.query("connectionRequests", "by_expires_at", expired);
  for (const request of requests) {
    yield* tx.delete("connectionRequests", request.id);
  }
  const codes = yield* tx.query("connectionCodes", "by_expires_at", expired);
  for (const code of codes) {
    yield* tx.delete("connectionCodes", code.id);
  }
  return {
    connectionRequests: requests.length,
    connectionCodes: codes.length,
    more: requests.length === BATCH || codes.length === BATCH,
  };
});
