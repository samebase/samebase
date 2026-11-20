// The rules of the connections part, each one all-or-nothing step: the request machine (create
// `upstream`, claim, complete with the provider's tokens, abandon), the code exchange, the refresh
// lease, revocation and cleanup. Every step reads the client's card in its own transaction, with
// the same two forms of stop as sign-in: a row of `stops`, and a gate that the registration layer
// no longer has (`isStopped`). A connection goes on only while its provider is in the card's
// `connections` and among the hub's configured providers.
import { Effect, Schema } from "effect";
import { spendBudget } from "../rules/authRequests.ts";
import { cardRow, isStopped, used } from "../rules/clients.ts";
import { GateNamespace, Return } from "../rules/schemas.ts";
import { TokenEndpointAuthMethod, type Tx as CoreTx } from "../rules/tables.ts";
import type { Doc } from "../store/tables.ts";
import { unique } from "../store/Tx.ts";
import { ConnectionsTx, ProviderTokens } from "./tables.ts";

const Str = Schema.String;
const Num = Schema.Finite;
const Strs = Schema.Array(Str);
const opt = Schema.optionalKey;

/** The views of a step that the part's rules read: cards through the core's, its own tables. */
type Tx = CoreTx | ConnectionsTx;

/** A grant ends after 90 days without a refresh, as in the Convex broker. */
export const GRANT_IDLE_MS = 90 * 24 * 60 * 60 * 1000;
/**
 * How long one refresh attempt holds a grant. It is longer than the provider call's timeout
 * (`REFRESH_TIMEOUT_MS` of upstream.ts, 30 s) and the commit after it, so an attempt that can
 * still save the provider's answer always holds the lease (design version 2 item 5).
 */
export const REFRESH_LEASE_MS = 90 * 1000;
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
type Grant = Doc<"connectionGrants">;

/** Whether the card may use the provider of `resource`: configured, and in its `connections`. */
const offers = (card: Doc<"clients">, resource: string, hub: HubNow) => {
  const provider = hub.providers.find((candidate) => candidate.resource === resource);
  return provider !== undefined && card.connections.includes(provider.name);
};

/**
 * The card of `clientId` when it may use the provider of `resource` now: the card exists, no gate
 * refuses it, and it offers the provider. Undefined otherwise.
 */
const usableCard = Effect.fnUntraced(function* (clientId: string, resource: string, hub: HubNow) {
  const card = yield* cardRow(clientId);
  return card !== undefined &&
    offers(card.doc, resource, hub) &&
    !(yield* isStopped(card.doc, hub.liveGates))
    ? card
    : undefined;
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

const grantOf = Effect.fnUntraced(function* (tokenHash: string) {
  return yield* unique(yield* ConnectionsTx, "connectionGrants", "by_token_hash", [tokenHash]);
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
  }),
]);

/**
 * Stores a connection that goes to the provider, from the card as it is in this step: the card
 * exists, holds the return address, no gate refuses it, and it offers the provider. The start
 * spends the card's `budget`, as a sign-in does. A refused request writes nothing.
 */
export const create = Effect.fnUntraced(function* (
  args: typeof CreateArgs.Type,
): Effect.fn.Return<typeof CreateResult.Type, never, Tx> {
  const card = yield* cardRow(args.clientId);
  if (card === undefined) {
    return { ok: false, error: "unknown_client" };
  }
  if (!card.doc.redirectUris.includes(args.redirectUri)) {
    return { ok: false, error: "redirect_uri" };
  }
  if (yield* isStopped(card.doc, args.liveGates)) {
    return { ok: false, error: "stopped" };
  }
  if (!offers(card.doc, args.resource, args)) {
    return { ok: false, error: "refused" };
  }
  if (!(yield* spendBudget(card.doc.budget, args.now))) {
    return { ok: false, error: "rate_limited" };
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
  Schema.Struct({ status: Schema.Literal("refused"), requestId: Str, back }),
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
): Effect.fn.Return<typeof ClaimResult.Type, never, Tx> {
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
  const back = yield* returnTo(request);
  if (request.expiresAt <= args.now) {
    yield* tx.delete("connectionRequests", row.id);
    return { status: "expired", requestId: request.requestId, back };
  }
  if (
    back === undefined ||
    (yield* usableCard(request.clientId, request.resource, args)) === undefined
  ) {
    yield* tx.delete("connectionRequests", row.id);
    return { status: "refused", requestId: request.requestId, back };
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
  Schema.Struct({ ok: Schema.Literal(false), error: Schema.Literals(["gone", "refused"]), back }),
]);

/**
 * The provider gave its tokens after a claim: the hub's code can be handed out, unless the
 * connection may no longer go on (a stop, a card change, or a removed return address committed
 * while the provider answered): the request is then deleted and nothing is issued.
 */
export const complete = Effect.fnUntraced(function* (
  args: typeof CompleteArgs.Type,
): Effect.fn.Return<typeof CompleteResult.Type, never, Tx> {
  const tx = yield* ConnectionsTx;
  const row = yield* requestOf(args.requestId);
  if (row === undefined) {
    return { ok: false, error: "gone" };
  }
  const request = row.doc;
  const back = yield* returnTo(request);
  if (request.status !== "claimed" || request.expiresAt <= args.now) {
    return { ok: false, error: "gone", back };
  }
  if (
    back === undefined ||
    (yield* usableCard(request.clientId, request.resource, args)) === undefined
  ) {
    yield* tx.delete("connectionRequests", row.id);
    return { ok: false, error: "refused", back };
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
  return { ok: true, back };
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
  /** SHA-256 hex of the hub refresh token that the handler made for a grant. */
  refreshTokenHash: Str,
  ...hubNow,
  now: Num,
});
const Refusal = Schema.Struct({
  ok: Schema.Literal(false),
  error: Schema.Literals(["invalid_client", "invalid_grant", "invalid_target"]),
  description: Str,
});
export const ExchangeResult = Schema.Union([
  /** The code is not a connection's: the core's sign-in redeems it, or refuses it. */
  Schema.Struct({ ok: Schema.Literal(false), error: Schema.Literal("not_found") }),
  Refusal,
  Schema.Struct({
    ok: Schema.Literal(true),
    accessToken: Str,
    scope: Str,
    expiresAt: opt(Num),
    /** A grant was stored: the handler answers the hub's refresh token. */
    refresh: Schema.Boolean,
  }),
]);
type ExchangeResult = typeof ExchangeResult.Type;

const refuse = (
  error: "invalid_client" | "invalid_grant" | "invalid_target",
  description: string,
): ExchangeResult => ({ ok: false, error, description });

/**
 * Redeems a connection's code: single use, bound to the client, its return address and its PKCE
 * challenge (RFC 6749 section 4.1.3, RFC 7636), and to the request's resource (RFC 8707). The code
 * is looked up first, so a sign-in code is left to the core untouched. A replay deletes the code,
 * its request, and the grant it issued (RFC 6749 section 4.1.2). On success the provider's refresh
 * token, when it gave one, becomes a grant behind `refreshTokenHash`, the request is deleted, and
 * a temporary card lives on (design version 2 item 7).
 */
export const exchangeCode = Effect.fnUntraced(function* (
  args: typeof ExchangeArgs.Type,
): Effect.fn.Return<ExchangeResult, never, Tx> {
  const tx = yield* ConnectionsTx;
  const code = yield* unique(tx, "connectionCodes", "by_code_hash", [args.codeHash]);
  if (code === undefined) {
    return { ok: false, error: "not_found" };
  }
  const card = yield* authenticated(args);
  if (card === undefined || (yield* isStopped(card.doc, args.liveGates))) {
    return refuse("invalid_client", "Client authentication failed.");
  }
  if (code.doc.clientId !== args.clientId) {
    return refuse("invalid_grant", "The authorization code belongs to another client.");
  }
  if (code.doc.usedAt !== undefined) {
    yield* tx.delete("connectionCodes", code.id);
    const request = yield* requestOf(code.doc.requestId);
    if (request !== undefined) {
      yield* tx.delete("connectionRequests", request.id);
    }
    const grant =
      code.doc.grantTokenHash === undefined ? undefined : yield* grantOf(code.doc.grantTokenHash);
    if (grant !== undefined) {
      yield* tx.delete("connectionGrants", grant.id);
    }
    return refuse("invalid_grant", "The authorization code was already used.");
  }
  if (code.doc.expiresAt <= args.now) {
    return refuse("invalid_grant", "The authorization code expired.");
  }
  const row = yield* requestOf(code.doc.requestId);
  if (row === undefined || row.doc.status !== "completed") {
    return refuse("invalid_grant", "The authorization is unavailable.");
  }
  const request = row.doc;
  if (args.resource !== undefined && args.resource !== request.resource) {
    return refuse("invalid_target", "The resource does not match the authorization.");
  }
  if (!offers(card.doc, request.resource, args)) {
    return refuse("invalid_target", "This client cannot use that API resource.");
  }
  if (
    args.redirectUri !== request.redirectUri ||
    args.codeChallengeOfVerifier !== request.codeChallenge
  ) {
    return refuse("invalid_grant", "The redirect URI or PKCE verifier does not match.");
  }
  if (!card.doc.redirectUris.includes(request.redirectUri)) {
    return refuse("invalid_grant", "This client cannot finish this connection now.");
  }
  const { tokens } = request;
  if (tokens.refreshToken !== undefined) {
    yield* tx.insert("connectionGrants", {
      tokenHash: args.refreshTokenHash,
      clientId: request.clientId,
      resource: request.resource,
      upstreamRefreshToken: tokens.refreshToken,
      expiresAt: args.now + GRANT_IDLE_MS,
      attempt: 0,
    });
  }
  yield* tx.replace("connectionCodes", code.id, {
    ...code.doc,
    usedAt: args.now,
    ...(tokens.refreshToken === undefined ? {} : { grantTokenHash: args.refreshTokenHash }),
  });
  yield* tx.delete("connectionRequests", row.id);
  yield* tx.replace("clients", card.id, used(card.doc, args.now));
  return {
    ok: true,
    accessToken: tokens.accessToken,
    scope: tokens.scope,
    ...(tokens.expiresAt === undefined ? {} : { expiresAt: tokens.expiresAt }),
    refresh: tokens.refreshToken !== undefined,
  };
});

// claimRefresh

export const ClaimRefreshArgs = Schema.Struct({
  ...ClientAuth,
  /** SHA-256 hex of the hub's refresh token. */
  tokenHash: Str,
  /** Optional on refresh: the grant knows its resource. */
  resource: opt(Str),
  ...hubNow,
  now: Num,
});
export const ClaimRefreshResult = Schema.Union([
  Refusal,
  Schema.Struct({
    ok: Schema.Literal(false),
    error: Schema.Literal("temporarily_unavailable"),
    description: Str,
  }),
  Schema.Struct({
    ok: Schema.Literal(true),
    /** This attempt's number: only the attempt that holds the grant can save or end it. */
    attempt: Num,
    resource: Str,
    upstreamRefreshToken: Str,
  }),
]);

const leaseHolds = (grant: Grant, now: number) =>
  grant.refreshStartedAt !== undefined && grant.refreshStartedAt + REFRESH_LEASE_MS > now;

/**
 * The admission of a refresh (RFC 6749 section 6), before the provider is called: the client
 * authenticates, no gate refuses it, the grant is its own and not idle too long, and the client
 * may use the grant's provider now. While another attempt holds the lease, the answer is the
 * retryable `temporarily_unavailable`, never `invalid_grant` (design version 2 item 5). An
 * admitted attempt takes the lease with the next attempt number, and a temporary card lives on.
 */
export const claimRefresh = Effect.fnUntraced(function* (
  args: typeof ClaimRefreshArgs.Type,
): Effect.fn.Return<typeof ClaimRefreshResult.Type, never, Tx> {
  const tx = yield* ConnectionsTx;
  const card = yield* authenticated(args);
  if (card === undefined || (yield* isStopped(card.doc, args.liveGates))) {
    return { ok: false, error: "invalid_client", description: "Client authentication failed." };
  }
  const grant = yield* grantOf(args.tokenHash);
  if (grant === undefined || grant.doc.clientId !== args.clientId) {
    return { ok: false, error: "invalid_grant", description: "The refresh token is invalid." };
  }
  if (grant.doc.expiresAt <= args.now) {
    yield* tx.delete("connectionGrants", grant.id);
    return { ok: false, error: "invalid_grant", description: "The grant expired." };
  }
  if (args.resource !== undefined && args.resource !== grant.doc.resource) {
    return {
      ok: false,
      error: "invalid_target",
      description: "The resource does not match the grant.",
    };
  }
  if (!offers(card.doc, grant.doc.resource, args)) {
    return {
      ok: false,
      error: "invalid_target",
      description: "This client cannot use that API resource.",
    };
  }
  if (leaseHolds(grant.doc, args.now)) {
    return {
      ok: false,
      error: "temporarily_unavailable",
      description: "A refresh is already running. Retry shortly.",
    };
  }
  const attempt = grant.doc.attempt + 1;
  yield* tx.replace("connectionGrants", grant.id, {
    ...grant.doc,
    attempt,
    refreshStartedAt: args.now,
  });
  yield* tx.replace("clients", card.id, used(card.doc, args.now));
  return {
    ok: true,
    attempt,
    resource: grant.doc.resource,
    upstreamRefreshToken: grant.doc.upstreamRefreshToken,
  };
});

/** The grant without its lease: the attempt that held it has ended. */
const released = (grant: Grant): Grant => ({
  tokenHash: grant.tokenHash,
  clientId: grant.clientId,
  resource: grant.resource,
  upstreamRefreshToken: grant.upstreamRefreshToken,
  expiresAt: grant.expiresAt,
  attempt: grant.attempt,
});

// finishRefresh

export const FinishRefreshArgs = Schema.Struct({
  tokenHash: Str,
  attempt: Num,
  /** The provider's new refresh token; absent when the provider kept the old one. */
  refreshToken: opt(Str),
  ...hubNow,
  now: Num,
});
export const FinishRefreshResult = Schema.Literals(["released", "refused", "stale", "gone"]);

/**
 * The provider answered the attempt with tokens. In one step (design version 2 item 4): the
 * answer is saved only for the attempt that holds the grant now (`stale` otherwise: nothing is
 * written); the provider's rotated refresh token is saved even when the client is now stopped or
 * may no longer use the provider, so an unstop restores the grant; without a new one the prior
 * token stays. Then the step decides whether the access token goes to the client (`released`) or
 * not (`refused`). A deleted or revoked grant stays gone.
 */
export const finishRefresh = Effect.fnUntraced(function* (
  args: typeof FinishRefreshArgs.Type,
): Effect.fn.Return<typeof FinishRefreshResult.Type, never, Tx> {
  const grant = yield* grantOf(args.tokenHash);
  if (grant === undefined) {
    return "gone";
  }
  if (grant.doc.attempt !== args.attempt) {
    return "stale";
  }
  yield* (yield* ConnectionsTx).replace("connectionGrants", grant.id, {
    ...released(grant.doc),
    upstreamRefreshToken: args.refreshToken ?? grant.doc.upstreamRefreshToken,
    expiresAt: args.now + GRANT_IDLE_MS,
  });
  return (yield* usableCard(grant.doc.clientId, grant.doc.resource, args)) === undefined
    ? "refused"
    : "released";
});

// failRefresh

export const FailRefreshArgs = Schema.Struct({
  tokenHash: Str,
  attempt: Num,
  /** The provider answered `invalid_grant`: the token the hub holds is dead. */
  rejected: Schema.Boolean,
  now: Num,
});
export const FailRefreshResult = Schema.Literals(["rejected", "retry", "gone"]);

/**
 * The provider's call failed. Only the provider's `invalid_grant` for the attempt that holds the
 * grant, while its lease holds, deletes the grant (`rejected`). Any other failure of that attempt
 * frees the lease; a stale attempt's failure writes nothing. Both answer the retryable `retry`
 * (design version 2 item 5).
 */
export const failRefresh = Effect.fnUntraced(function* (
  args: typeof FailRefreshArgs.Type,
): Effect.fn.Return<typeof FailRefreshResult.Type, never, Tx> {
  const tx = yield* ConnectionsTx;
  const grant = yield* grantOf(args.tokenHash);
  if (grant === undefined) {
    return "gone";
  }
  if (grant.doc.attempt !== args.attempt || grant.doc.refreshStartedAt === undefined) {
    return "retry";
  }
  if (!args.rejected) {
    yield* tx.replace("connectionGrants", grant.id, released(grant.doc));
    return "retry";
  }
  if (!leaseHolds(grant.doc, args.now)) {
    return "retry";
  }
  yield* tx.delete("connectionGrants", grant.id);
  return "rejected";
});

// revoke

export const RevokeArgs = Schema.Struct({ ...ClientAuth, tokenHash: Str });

/**
 * RFC 7009 section 2.1: the authenticated client revokes its own grant. An unknown token, or
 * another client's, changes nothing and also succeeds (section 2.2). A stopped client may still
 * revoke. The provider is not called. False: the client did not authenticate.
 */
export const revoke = Effect.fnUntraced(function* (args: typeof RevokeArgs.Type) {
  if ((yield* authenticated(args)) === undefined) {
    return false;
  }
  const grant = yield* grantOf(args.tokenHash);
  if (grant !== undefined && grant.doc.clientId === args.clientId) {
    yield* (yield* ConnectionsTx).delete("connectionGrants", grant.id);
  }
  return true;
});

/**
 * Deletes up to `limit` grants of a client, oldest first, and answers how many it deleted. A
 * layer that deletes a card calls it in the same step.
 */
export const removeClientGrants = Effect.fnUntraced(function* (clientId: string, limit = BATCH) {
  const tx = yield* ConnectionsTx;
  const grants = yield* tx.query("connectionGrants", "by_client_id", {
    eq: [clientId],
    order: "asc",
    limit,
  });
  for (const grant of grants) {
    yield* tx.delete("connectionGrants", grant.id);
  }
  return grants.length;
});

// cleanup

export const CleanupArgs = Schema.Struct({ now: Num });
export const CleanupResult = Schema.Struct({
  connectionRequests: Num,
  connectionCodes: Num,
  connectionGrants: Num,
  /** A category filled its batch: call again with the same arguments. */
  more: Schema.Boolean,
});

/**
 * One batch of what has run out: expired requests and codes, idle grants, and the grants of the
 * cards that the core's next cleanup batch deletes (the first `BATCH` cards past their removal
 * date, in the core's order). A host runs this until it reports no `more`, then the core's batch,
 * so no grant outlives its card. The cutoff never moves, so the calls end.
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
  const idle = yield* tx.query("connectionGrants", "by_expires_at", expired);
  for (const grant of idle) {
    yield* tx.delete("connectionGrants", grant.id);
  }
  // The same query as the core's cleanup of cards (src/rules/lifecycle.ts).
  const cards = yield* tx.query("clients", "by_remove_at", {
    eq: [],
    range: [
      { op: "gt", value: undefined },
      { op: "lt", value: args.now },
    ],
    order: "asc",
    limit: BATCH,
  });
  let ofCards = 0;
  for (const card of cards) {
    ofCards += yield* removeClientGrants(card.doc.clientId, BATCH - ofCards);
    if (ofCards === BATCH) {
      break;
    }
  }
  return {
    connectionRequests: requests.length,
    connectionCodes: codes.length,
    connectionGrants: idle.length + ofCards,
    more: [requests.length, codes.length, idle.length, ofCards].some((count) => count === BATCH),
  };
});
