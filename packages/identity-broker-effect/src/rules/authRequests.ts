// The authorization request machine: create (pending), start (upstream), claim (claimed), complete
// (completed plus an unused code), exchange (request deleted, code marked used), and the replay that
// removes the used code. Every step that moves a sign-in on decides the policy fences again.
import { Effect } from "effect";
import type { Doc } from "../store/tables.ts";
import { Tx, unique } from "../store/Tx.ts";
import { appRow, isSuspended, tenantRow } from "./apps.ts";
import { clientRow, clientWithApp } from "./clients.ts";
import type { Step } from "./commands.ts";
import { grantedTo } from "./connectorGrants.ts";
import { refusalOf, usableConnectors } from "./policy.ts";
import { used } from "./registration.ts";
import type {
  ClaimResult,
  ClaimUpstreamArgs,
  CompleteArgs,
  CreateArgs,
  ExchangeCodeArgs,
  ExchangeResult,
  PolicyDecision,
  RequestIdArgs,
  StartUpstreamArgs,
  TransitionResult,
  UpstreamClientArgs,
} from "./schemas.ts";

type AuthRequest = Doc<"authRequests">;

const findByRequestId = (requestId: string) => unique("authRequests", "by_request_id", [requestId]);

/** Where the user goes back to: the client's exact redirect URI, with the app's state. */
const returnTo = (request: AuthRequest) => ({
  redirectUri: request.redirectUri,
  ...(request.state === undefined ? {} : { state: request.state }),
});

/**
 * The fields shared by every status, taken from a stored request. `replace` writes the whole
 * document, so the fields of the old status do not leak into the new one.
 */
const baseFields = (request: AuthRequest) => ({
  requestId: request.requestId,
  appId: request.appId,
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

/** The client and the app of a request, read in the step that decides on it. */
const rowsOf = Effect.fnUntraced(function* (request: AuthRequest) {
  const client = yield* clientRow(request.clientId);
  const app = yield* appRow(request.appId);
  return client === undefined || app === undefined ? null : { client: client.doc, app: app.doc };
});

/**
 * Whether `connector` may go on for `request` under `decision`: the client and app exist, the
 * connector is in the request's set, the enrollment, and the decision, the tenant is not stopped,
 * and the decision still applies.
 */
const allowed = Effect.fnUntraced(function* (
  request: AuthRequest,
  connector: string,
  decision: PolicyDecision,
) {
  const rows = yield* rowsOf(request);
  if (rows === null) {
    return false;
  }
  const granted = yield* grantedTo({
    tenantId: rows.app.tenantId,
    tenantOwnerId: (yield* tenantRow(rows.app.tenantId))?.doc.ownerId,
    clientOwnerId: rows.client.registeredBy.githubOwnerId,
  });
  return (
    usableConnectors(request, rows.client, decision, granted).includes(connector) &&
    !(yield* isSuspended(rows.app.tenantId)) &&
    (yield* refusalOf(decision, rows.app.tenantId)) === null
  );
});

/** The sign-in budget of a tenant: 120 per minute, at most 240 saved. */
const BUDGET_RATE = 120;
const BUDGET_PERIOD_MS = 60_000;
const BUDGET_CAPACITY = 240;

/**
 * Takes one sign-in from the tenant's token bucket at `now`, or answers false and writes nothing.
 * The bucket's time never moves back, so a step with an older clock refills nothing.
 */
const spendBudget = Effect.fnUntraced(function* (tenantId: string, now: number) {
  const tx = yield* Tx;
  const row = yield* unique("signInBudgets", "by_tenant_id", [tenantId]);
  const at = row === undefined ? now : Math.max(row.doc.at, now);
  const saved = row === undefined ? BUDGET_CAPACITY : row.doc.tokens;
  const elapsed = row === undefined ? 0 : at - row.doc.at;
  const tokens = Math.min(BUDGET_CAPACITY, saved + (elapsed * BUDGET_RATE) / BUDGET_PERIOD_MS);
  if (tokens < 1) {
    return false;
  }
  if (row === undefined) {
    yield* tx.insert("signInBudgets", { tenantId, tokens: tokens - 1, at });
  } else {
    yield* tx.replace("signInBudgets", row.id, { tenantId, tokens: tokens - 1, at });
  }
  return true;
});

/**
 * Stores a validated /authorize request. The grants are read here again, so the stored set is the
 * set of the connectors the client may use now; `off` when none is left. The budget of the tenant
 * and its blocks are read in this step too, so a refused request writes no row.
 */
export const create = Effect.fnUntraced(function* (args: typeof CreateArgs.Type, step: Step) {
  const tx = yield* Tx;
  if (yield* isSuspended(args.tenantId)) {
    return { ok: false as const, error: "suspended" as const };
  }
  const client = yield* clientRow(args.clientId);
  const connectors =
    client === undefined
      ? []
      : usableConnectors(
          { connectors: args.connectors },
          client.doc,
          args.policy,
          yield* grantedTo({
            tenantId: args.tenantId,
            tenantOwnerId: (yield* tenantRow(args.tenantId))?.doc.ownerId,
            clientOwnerId: client.doc.registeredBy.githubOwnerId,
          }),
        );
  if (connectors.length === 0) {
    return { ok: false as const, error: "off" as const };
  }
  if (!(yield* spendBudget(args.tenantId, step.now))) {
    return { ok: false as const, error: "rate_limited" as const };
  }
  yield* tx.insert("authRequests", {
    status: "pending",
    requestId: args.requestId,
    appId: args.appId,
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
  return { ok: true as const, connectors };
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
    ...returnTo(request),
    connectors: request.connectors,
    freshLogin: request.freshLogin,
    txnCookieHash: request.txnCookieHash,
  };
});

/**
 * The user chose an OAuth or OIDC connector; the request now waits for that connector's callback.
 * The connector must be one the request may use under `policy`, read again here.
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
  const back = returnTo(request);
  if (request.expiresAt <= args.now) {
    return { ok: false, error: "expired", ...back };
  }
  // A chooser page can be reloaded, so a pending request may start upstream more than once; the
  // newest state hash wins. Any other status means the flow already moved on.
  if (request.status !== "pending" && request.status !== "upstream") {
    return { ok: false, error: "wrong_status", ...back };
  }
  if (!(yield* allowed(request, args.connector, args.policy))) {
    return { ok: false, error: "refused", ...back };
  }
  yield* tx.replace("authRequests", row.id, {
    status: "upstream",
    ...baseFields(request),
    connector: args.connector,
    upstreamStateHash: args.upstreamStateHash,
    upstreamCodeVerifier: args.upstreamCodeVerifier,
    ...(args.upstreamNonce === undefined ? {} : { upstreamNonce: args.upstreamNonce }),
  });
  return { ok: true, ...back };
});

/**
 * The request that waits for the callback with this state: where it goes back to and its cookie
 * hash, and its client with the policy facts, so the core decides the policy before it claims the
 * request. Null when no request waits for that state; `client` is null when the client is gone.
 */
export const upstreamClient = Effect.fnUntraced(function* (args: typeof UpstreamClientArgs.Type) {
  const row = yield* unique("authRequests", "by_upstream_state_hash", [args.upstreamStateHash]);
  if (row === undefined || row.doc.status !== "upstream") {
    return null;
  }
  const request = row.doc;
  const client = yield* clientRow(request.clientId);
  return {
    request: {
      requestId: request.requestId,
      txnCookieHash: request.txnCookieHash,
      ...returnTo(request),
    },
    client: client === undefined ? null : yield* clientWithApp(client),
  };
});

/**
 * The callback of `connector` arrived with its state. Claiming moves the request to `claimed` in
 * the step that finds it, so a replayed or raced callback finds nothing to claim. A request started
 * for another connector is not claimed. A request is claimed only from the browser that holds its
 * transaction cookie; any other browser gets `unbound` and the request keeps waiting. A request
 * that `policy` stops now is deleted instead of claimed.
 */
export const claimUpstream = Effect.fnUntraced(function* (
  args: typeof ClaimUpstreamArgs.Type,
): Effect.fn.Return<ClaimResult, never, Tx> {
  const tx = yield* Tx;
  const row = yield* unique("authRequests", "by_upstream_state_hash", [args.upstreamStateHash]);
  if (row === undefined || row.doc.status !== "upstream" || row.doc.connector !== args.connector) {
    return { status: "missing" };
  }
  const request = row.doc;
  if (!args.txnCookieHashes.includes(request.txnCookieHash)) {
    return { status: "unbound" };
  }
  const back = returnTo(request);
  if (request.expiresAt <= args.now) {
    yield* tx.delete("authRequests", row.id);
    return { status: "expired", requestId: request.requestId, ...back };
  }
  if (!(yield* allowed(request, request.connector, args.policy))) {
    yield* tx.delete("authRequests", row.id);
    return { status: "refused", requestId: request.requestId, ...back };
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
    ...back,
  };
});

/**
 * The connector attested the identity after a claim; the authorization code can be handed out,
 * unless `policy`, decided after the provider answered, no longer allows the request's connector,
 * or a block, a changed owner, or a pause committed while the provider answered: the request is
 * then deleted and nothing is issued.
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
  const back = returnTo(request);
  if (request.expiresAt <= args.now) {
    return { ok: false, error: "expired", ...back };
  }
  if (request.status !== "claimed") {
    return { ok: false, error: "wrong_status", ...back };
  }
  if (!(yield* allowed(request, request.connector, args.policy))) {
    yield* tx.delete("authRequests", row.id);
    return { ok: false, error: "refused", ...back };
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
  return { ok: true, ...back };
});

/** Deletes a request the user abandoned at the hub, such as a declined consent. */
export const abandon = Effect.fnUntraced(function* (args: typeof RequestIdArgs.Type) {
  const tx = yield* Tx;
  const row = yield* findByRequestId(args.requestId);
  if (row === undefined) {
    return null;
  }
  yield* tx.delete("authRequests", row.id);
  return returnTo(row.doc);
});

const invalid = (
  error: "invalid_client" | "invalid_grant" | "invalid_target",
  description: string,
) => ({ ok: false, error, description }) satisfies ExchangeResult;

/**
 * Authenticates the client and redeems an authorization code: single use, bound to the client, the
 * redirect URI and the PKCE challenge of its request (OAuth 2.1 section 4.1.3). The client and its
 * app are read in this step, so a client that fails authentication leaves the code as it was. A
 * suspension or a pause that commits first refuses the code. On success the code is marked used,
 * the request is gone, and the client's `lastSignInAt` and removal date move in this step.
 * `codeChallengeOfVerifier` is the core's S256 of the submitted verifier.
 */
/** The authenticated client with its app, or the `invalid_client` answer. */
const authenticated = Effect.fnUntraced(function* (args: typeof ExchangeCodeArgs.Type) {
  const client = yield* clientRow(args.clientId);
  const app = client === undefined ? undefined : yield* appRow(client.doc.appId);
  // A client whose app is deleted is refused at once.
  if (
    client === undefined ||
    app === undefined ||
    client.doc.tokenEndpointAuthMethod !== args.tokenEndpointAuthMethod ||
    client.doc.secretHash !== args.clientSecretHash ||
    (yield* isSuspended(app.doc.tenantId))
  ) {
    return invalid("invalid_client", "Client authentication failed.");
  }
  const refusal = yield* refusalOf(args.policy, app.doc.tenantId);
  if (refusal !== null) {
    return invalid(
      "invalid_client",
      refusal === "paused" ? "This client is paused." : "Client authentication failed.",
    );
  }
  return { client, app };
});

export const exchangeCode = Effect.fnUntraced(function* (
  args: typeof ExchangeCodeArgs.Type,
): Effect.fn.Return<ExchangeResult, never, Tx> {
  const tx = yield* Tx;
  const caller = yield* authenticated(args);
  if ("ok" in caller) {
    return caller;
  }
  const { client, app } = caller;
  const code = yield* unique("authorizationCodes", "by_code_hash", [args.codeHash]);
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
  const granted = yield* grantedTo({
    tenantId: app.doc.tenantId,
    tenantOwnerId: (yield* tenantRow(app.doc.tenantId))?.doc.ownerId,
    clientOwnerId: client.doc.registeredBy.githubOwnerId,
  });
  if (
    !usableConnectors(request, client.doc, args.policy, granted).includes(
      request.identity.connector,
    )
  ) {
    return invalid("invalid_grant", "This client cannot sign in through that connector.");
  }
  yield* tx.replace("authorizationCodes", code.id, { ...code.doc, usedAt: args.now });
  yield* tx.delete("authRequests", row.id);
  yield* tx.replace("clients", client.id, used(client.doc, args.now));
  return {
    ok: true,
    appId: request.appId,
    clientId: request.clientId,
    scope: request.scope,
    ...(request.nonce === undefined ? {} : { nonce: request.nonce }),
    identity: request.identity,
    authTime: request.authTime,
  };
});
