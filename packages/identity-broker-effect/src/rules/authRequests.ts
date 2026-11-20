// The authorization request machine: create (pending), start (upstream), claim (claimed), complete
// (completed plus an unused code), exchange (request deleted, code marked used), and the replay that
// removes the used code. Every step reads the client's card in its own transaction and refuses when
// the card is gone, a stop or a gate that is not live refuses it, the request's return address left
// it, or the connector is not in the request's stored set, the card's set and the hub's configured
// set.
import { Effect } from "effect";
import { unique, type Row } from "../store/Tx.ts";
import { cardRow, isStopped, usableCard, used } from "./clients.ts";
import type { Step } from "./commands.ts";
import type {
  ClaimResult,
  ClaimUpstreamArgs,
  CompleteArgs,
  CreateArgs,
  CreateResult,
  ExchangeCodeArgs,
  ExchangeResult,
  RequestIdArgs,
  Return,
  StartUpstreamArgs,
  TransitionResult,
} from "./schemas.ts";
import { Tx, type CoreTables } from "./tables.ts";

type AuthRequest = Row<CoreTables, "authRequests">["doc"];

const findByRequestId = Effect.fnUntraced(function* (requestId: string) {
  return yield* unique(yield* Tx, "authRequests", "by_request_id", [requestId]);
});

/** Where the user goes back to: the client's exact redirect URI, with the app's state. */
const returnOf = (request: AuthRequest): Return => ({
  redirectUri: request.redirectUri,
  ...(request.state === undefined ? {} : { state: request.state }),
});

/**
 * The request's return address when the client's card holds it in this step, else undefined: the
 * hub never sends the user to an address that is not on the card.
 */
const returnTo = Effect.fnUntraced(function* (request: AuthRequest) {
  const card = yield* cardRow(request.clientId);
  return card !== undefined && card.doc.redirectUris.includes(request.redirectUri)
    ? returnOf(request)
    : undefined;
});

/**
 * The fields shared by every status, taken from a stored request. `replace` writes the whole
 * document, so the fields of the old status do not leak into the new one.
 */
const baseFields = (request: AuthRequest) => ({
  requestId: request.requestId,
  clientId: request.clientId,
  redirectUri: request.redirectUri,
  scope: request.scope,
  ...(request.state === undefined ? {} : { state: request.state }),
  ...(request.nonce === undefined ? {} : { nonce: request.nonce }),
  codeChallenge: request.codeChallenge,
  connectors: request.connectors,
  freshLogin: request.freshLogin,
  txnCookieHash: request.txnCookieHash,
  createdAt: request.createdAt,
  expiresAt: request.expiresAt,
});

/**
 * A completed request outlives its authorization code by a minute, so `lifecycle.cleanup` never
 * deletes the request while its code can still be redeemed.
 */
const completedExpiresAt = (request: AuthRequest, codeExpiresAt: number) =>
  Math.max(request.expiresAt, codeExpiresAt + 60 * 1000);

/** The sign-in budget of one key: 120 per minute, at most 240 saved. */
const BUDGET_RATE = 120;
const BUDGET_PERIOD_MS = 60_000;
const BUDGET_CAPACITY = 240;

/**
 * Takes one sign-in from the token bucket of `key` at `now`, or answers false and writes nothing.
 * The bucket's time never moves back, so a step with an older clock refills nothing.
 */
const spendBudget = Effect.fnUntraced(function* (key: string, now: number) {
  const tx = yield* Tx;
  const row = yield* unique(tx, "signInBudgets", "by_key", [key]);
  const at = row === undefined ? now : Math.max(row.doc.at, now);
  const saved = row === undefined ? BUDGET_CAPACITY : row.doc.tokens;
  const elapsed = row === undefined ? 0 : at - row.doc.at;
  const tokens = Math.min(BUDGET_CAPACITY, saved + (elapsed * BUDGET_RATE) / BUDGET_PERIOD_MS);
  if (tokens < 1) {
    return false;
  }
  if (row === undefined) {
    yield* tx.insert("signInBudgets", { key, tokens: tokens - 1, at });
  } else {
    yield* tx.replace("signInBudgets", row.id, { key, tokens: tokens - 1, at });
  }
  return true;
});

/**
 * Stores a validated /authorize request, from the card as it is in this step: the card must exist,
 * be refused by no gate (`isStopped`) and hold the return address. The stored set is what the request named
 * (none named: every connector of the card), of those on the card and configured; `off` when none
 * is left. The answer carries the card's `confirm` of this step, and the start spends the card's
 * `budget`. A refused request writes no row.
 */
export const create = Effect.fnUntraced(function* (
  args: typeof CreateArgs.Type,
  step: Step,
): Effect.fn.Return<typeof CreateResult.Type, never, Tx> {
  const tx = yield* Tx;
  const card = yield* cardRow(args.clientId);
  if (card === undefined) {
    return { ok: false, error: "unknown_client" };
  }
  if (yield* isStopped(card.doc, args.liveGates)) {
    return { ok: false, error: "stopped" };
  }
  if (!card.doc.redirectUris.includes(args.redirectUri)) {
    return { ok: false, error: "redirect_uri" };
  }
  const connectors = (args.requested.length === 0 ? card.doc.connectors : args.requested).filter(
    (name) => card.doc.connectors.includes(name) && args.configured.includes(name),
  );
  if (connectors.length === 0) {
    return { ok: false, error: "off" };
  }
  if (!(yield* spendBudget(card.doc.budget, step.now))) {
    return { ok: false, error: "rate_limited" };
  }
  yield* tx.insert("authRequests", {
    status: "pending",
    requestId: args.requestId,
    clientId: args.clientId,
    redirectUri: args.redirectUri,
    scope: args.scope,
    ...(args.state === undefined ? {} : { state: args.state }),
    ...(args.nonce === undefined ? {} : { nonce: args.nonce }),
    codeChallenge: args.codeChallenge,
    connectors,
    freshLogin: args.freshLogin,
    txnCookieHash: args.txnCookieHash,
    createdAt: args.createdAt,
    expiresAt: args.expiresAt,
  });
  return { ok: true, connectors, confirm: card.doc.confirm };
});

/** What the continue handler needs of a request: no upstream state, verifier, or identity. */
export const get = Effect.fnUntraced(function* (args: typeof RequestIdArgs.Type) {
  const row = yield* findByRequestId(args.requestId);
  if (row === undefined) {
    return null;
  }
  const request = row.doc;
  return {
    requestId: request.requestId,
    status: request.status,
    clientId: request.clientId,
    back: yield* returnTo(request),
    connectors: request.connectors,
    freshLogin: request.freshLogin,
    txnCookieHash: request.txnCookieHash,
  };
});

/**
 * The user chose an OAuth or OIDC connector; the request now waits for that connector's callback.
 * The request must still be usable with that connector (`usableCard`).
 */
export const startUpstream = Effect.fnUntraced(function* (
  args: typeof StartUpstreamArgs.Type,
): Effect.fn.Return<TransitionResult, never, Tx> {
  const tx = yield* Tx;
  const row = yield* findByRequestId(args.requestId);
  if (row === undefined) {
    return { ok: false, error: "not_found" };
  }
  const request = row.doc;
  if (request.expiresAt <= args.now) {
    return { ok: false, error: "expired", back: yield* returnTo(request) };
  }
  // A chooser page can be reloaded, so a pending request may start upstream more than once; the
  // newest state hash wins. Any other status means the flow already moved on.
  if (request.status !== "pending" && request.status !== "upstream") {
    return { ok: false, error: "wrong_status", back: yield* returnTo(request) };
  }
  if ((yield* usableCard(request, args.connector, args)) === undefined) {
    return { ok: false, error: "refused", back: yield* returnTo(request) };
  }
  yield* tx.replace("authRequests", row.id, {
    status: "upstream",
    ...baseFields(request),
    connector: args.connector,
    upstreamStateHash: args.upstreamStateHash,
    upstreamCodeVerifier: args.upstreamCodeVerifier,
    ...(args.upstreamNonce === undefined ? {} : { upstreamNonce: args.upstreamNonce }),
  });
  return { ok: true, back: returnOf(request) };
});

/**
 * The callback of `connector` arrived with its state. Claiming moves the request to `claimed` in
 * the step that finds it, so a replayed or raced callback finds nothing to claim. A request started
 * for another connector is not claimed. A request is claimed only from the browser that holds its
 * transaction cookie; any other browser gets `unbound` and the request keeps waiting. A request
 * that may not go on now is deleted instead of claimed.
 */
export const claimUpstream = Effect.fnUntraced(function* (
  args: typeof ClaimUpstreamArgs.Type,
): Effect.fn.Return<ClaimResult, never, Tx> {
  const tx = yield* Tx;
  const row = yield* unique(tx, "authRequests", "by_upstream_state_hash", [args.upstreamStateHash]);
  if (row === undefined || row.doc.status !== "upstream" || row.doc.connector !== args.connector) {
    return { status: "missing" };
  }
  const request = row.doc;
  if (!args.txnCookieHashes.includes(request.txnCookieHash)) {
    return { status: "unbound" };
  }
  if (request.expiresAt <= args.now) {
    yield* tx.delete("authRequests", row.id);
    return { status: "expired", requestId: request.requestId, back: yield* returnTo(request) };
  }
  if ((yield* usableCard(request, request.connector, args)) === undefined) {
    yield* tx.delete("authRequests", row.id);
    return { status: "refused", requestId: request.requestId, back: yield* returnTo(request) };
  }
  yield* tx.replace("authRequests", row.id, {
    status: "claimed",
    ...baseFields(request),
    connector: request.connector,
  });
  return {
    status: "claimed",
    requestId: request.requestId,
    connector: request.connector,
    upstreamCodeVerifier: request.upstreamCodeVerifier,
    ...(request.upstreamNonce === undefined ? {} : { upstreamNonce: request.upstreamNonce }),
    freshLogin: request.freshLogin,
    createdAt: request.createdAt,
  };
});

/**
 * The connector attested the identity after a claim; the authorization code can be handed out,
 * unless the request may no longer go on with its connector (a stop, a card change, or a removed
 * return address committed while the provider answered): the request is then deleted and nothing
 * is issued.
 */
export const complete = Effect.fnUntraced(function* (
  args: typeof CompleteArgs.Type,
): Effect.fn.Return<TransitionResult, never, Tx> {
  const tx = yield* Tx;
  const row = yield* findByRequestId(args.requestId);
  if (row === undefined) {
    return { ok: false, error: "not_found" };
  }
  const request = row.doc;
  if (request.expiresAt <= args.now) {
    return { ok: false, error: "expired", back: yield* returnTo(request) };
  }
  if (request.status !== "claimed") {
    return { ok: false, error: "wrong_status", back: yield* returnTo(request) };
  }
  if ((yield* usableCard(request, request.connector, args)) === undefined) {
    yield* tx.delete("authRequests", row.id);
    return { ok: false, error: "refused", back: yield* returnTo(request) };
  }
  yield* tx.replace("authRequests", row.id, {
    status: "completed",
    ...baseFields(request),
    expiresAt: completedExpiresAt(request, args.codeExpiresAt),
    identity: args.identity,
    authTime: args.authTime,
  });
  yield* tx.insert("authorizationCodes", {
    codeHash: args.codeHash,
    requestId: request.requestId,
    clientId: request.clientId,
    expiresAt: args.codeExpiresAt,
  });
  return { ok: true, back: returnOf(request) };
});

/**
 * Deletes a request the user abandoned at the hub, such as a failed provider sign-in. Answers its
 * return address when the card holds it in this step, else null.
 */
export const abandon = Effect.fnUntraced(function* (args: typeof RequestIdArgs.Type) {
  const tx = yield* Tx;
  const row = yield* findByRequestId(args.requestId);
  if (row === undefined) {
    return null;
  }
  yield* tx.delete("authRequests", row.id);
  return (yield* returnTo(row.doc)) ?? null;
});

const invalid = (
  error: "invalid_client" | "invalid_grant" | "invalid_target",
  description: string,
) => ({ ok: false, error, description }) satisfies ExchangeResult;

/**
 * Authenticates the client and redeems an authorization code: single use, bound to the client, the
 * redirect URI and the PKCE challenge of its request (OAuth 2.1 section 4.1.3). The card is read in
 * this step, so a client that fails authentication leaves the code as it was, and a stop that
 * commits first refuses the client. The request's return address must still be on the card, and
 * its connector usable (`usableCard`). On success the code is marked used, the request is gone, and
 * the card's `lastSignInAt` and removal date move in this step. `codeChallengeOfVerifier` is the
 * core's S256 of the submitted verifier.
 */
export const exchangeCode = Effect.fnUntraced(function* (
  args: typeof ExchangeCodeArgs.Type,
): Effect.fn.Return<ExchangeResult, never, Tx> {
  const tx = yield* Tx;
  const card = yield* cardRow(args.clientId);
  if (
    card === undefined ||
    card.doc.tokenEndpointAuthMethod !== args.tokenEndpointAuthMethod ||
    card.doc.secretHash !== args.clientSecretHash ||
    (yield* isStopped(card.doc, args.liveGates))
  ) {
    return invalid("invalid_client", "Client authentication failed.");
  }
  const code = yield* unique(tx, "authorizationCodes", "by_code_hash", [args.codeHash]);
  if (code === undefined) {
    return invalid("invalid_grant", "The authorization code is unknown.");
  }
  if (code.doc.clientId !== args.clientId) {
    return invalid("invalid_grant", "The authorization code belongs to another client.");
  }
  if (code.doc.usedAt !== undefined) {
    // Replay: the code and its request are revoked (RFC 6749 section 4.1.2).
    yield* tx.delete("authorizationCodes", code.id);
    const linked = yield* findByRequestId(code.doc.requestId);
    if (linked !== undefined) {
      yield* tx.delete("authRequests", linked.id);
    }
    return invalid("invalid_grant", "The authorization code was already used.");
  }
  if (code.doc.expiresAt <= args.now) {
    return invalid("invalid_grant", "The authorization code expired.");
  }
  if (args.resource !== undefined) {
    return invalid("invalid_target", "This authorization did not grant an API resource.");
  }
  const row = yield* findByRequestId(code.doc.requestId);
  if (row === undefined || row.doc.status !== "completed") {
    return invalid("invalid_grant", "The authorization request is gone.");
  }
  const request = row.doc;
  if (args.redirectUri !== request.redirectUri) {
    return invalid("invalid_grant", "redirect_uri does not match the authorization request.");
  }
  if (args.codeChallengeOfVerifier !== request.codeChallenge) {
    return invalid("invalid_grant", "code_verifier does not match code_challenge.");
  }
  if ((yield* usableCard(request, request.identity.connector, args)) === undefined) {
    return invalid("invalid_grant", "This client cannot finish this sign-in now.");
  }
  yield* tx.replace("authorizationCodes", code.id, { ...code.doc, usedAt: args.now });
  yield* tx.delete("authRequests", row.id);
  yield* tx.replace("clients", card.id, used(card.doc, args.now));
  return {
    ok: true,
    clientId: request.clientId,
    ref: card.doc.ref,
    scope: request.scope,
    ...(request.nonce === undefined ? {} : { nonce: request.nonce }),
    identity: request.identity,
    // The hub keeps no session, so it knows when the user logged in only when it asked the
    // provider for a login in this request. Otherwise the provider may have reused its session,
    // and the token names no time.
    ...(request.freshLogin ? { authTime: request.authTime } : {}),
  };
});
