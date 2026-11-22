// The argument and result schemas of the core's commands. Plain JSON on both sides of the boundary.
import { Schema } from "effect";
import { TokenEndpointAuthMethod, UpstreamIdentity } from "./tables.ts";

const Str = Schema.String;
const Num = Schema.Finite;
const Bool = Schema.Boolean;
const Strs = Schema.Array(Str);
const opt = Schema.optionalKey;

/** The hub's configured connector names, in the order discovery names them. */
const configured = Strs;

/**
 * A namespace of card gates that a layer owns, with the gates of it that the hub has now: a card
 * with a gate that starts with `prefix` and is not in `live` is refused, as a stop on that gate
 * refuses it. A gate outside every prefix is not affected.
 */
export const GateNamespace = Schema.Struct({ prefix: Str, live: Strs });
export type GateNamespace = typeof GateNamespace.Type;
const liveGates = Schema.Array(GateNamespace);

/** Where the user goes back to once a request fails or finishes: the client's exact redirect URI. */
export const Return = Schema.Struct({ redirectUri: Str, state: opt(Str) });
export type Return = typeof Return.Type;

/**
 * The return address of a refusal, given only when the step read it on the client's card. Absent:
 * the card is gone or no longer holds the address, and the hub sends the user nowhere (RFC 6749
 * section 4.1.2.1).
 */
const back = Schema.optionalKey(Return);

/** The `back` field of a result: absent, never `undefined`, when there is no return address. */
export const backField = (address: Return | undefined) =>
  address === undefined ? {} : { back: address };

export const TransitionResult = Schema.Union([
  /** The step read the return address on the card. */
  Schema.Struct({ ok: Schema.Literal(true), back: Return }),
  Schema.Struct({
    ok: Schema.Literal(false),
    error: Schema.Literals(["expired", "wrong_status", "refused"]),
    back,
  }),
  Schema.Struct({ ok: Schema.Literal(false), error: Schema.Literal("not_found") }),
]);
export type TransitionResult = typeof TransitionResult.Type;

// authRequests

export const CreateArgs = Schema.Struct({
  requestId: Str,
  clientId: Str,
  redirectUri: Str,
  scope: Str,
  state: opt(Str),
  nonce: opt(Str),
  codeChallenge: Str,
  /** The connectors the request named; none named: every connector of the card. */
  requested: Strs,
  configured,
  liveGates,
  freshLogin: Bool,
  txnCookieHash: Str,
  createdAt: Num,
  expiresAt: Num,
});
export const CreateResult = Schema.Union([
  /** The stored set, and whether the page before the provider is shown. */
  Schema.Struct({ ok: Schema.Literal(true), connectors: Strs, confirm: Bool }),
  Schema.Struct({
    ok: Schema.Literal(false),
    error: Schema.Literals(["unknown_client", "stopped", "redirect_uri", "off", "rate_limited"]),
  }),
]);

export const RequestIdArgs = Schema.Struct({ requestId: Str });

/** What the continue handler reads of a request: no upstream state, verifier or identity. */
export const GetResult = Schema.NullOr(
  Schema.Struct({
    requestId: Str,
    status: Schema.Literals(["pending", "upstream", "claimed", "completed"]),
    clientId: Str,
    back,
    connectors: Strs,
    freshLogin: Bool,
    txnCookieHash: Str,
  }),
);

export const StartUpstreamArgs = Schema.Struct({
  requestId: Str,
  connector: Str,
  upstreamStateHash: Str,
  upstreamCodeVerifier: Str,
  upstreamNonce: opt(Str),
  configured,
  liveGates,
  now: Num,
});

export const ClaimUpstreamArgs = Schema.Struct({
  upstreamStateHash: Str,
  connector: Str,
  /** SHA-256 hex of each transaction cookie the callback request carried. */
  txnCookieHashes: Strs,
  configured,
  liveGates,
  now: Num,
});
export const ClaimResult = Schema.Union([
  Schema.Struct({
    status: Schema.Literal("claimed"),
    requestId: Str,
    connector: Str,
    upstreamCodeVerifier: Str,
    upstreamNonce: opt(Str),
    freshLogin: Bool,
    /** When /authorize stored the request: an upstream `auth_time` before it is an old session. */
    createdAt: Num,
  }),
  Schema.Struct({ status: Schema.Literal("expired"), requestId: Str, back }),
  /** The request may not go on now; it is deleted. */
  Schema.Struct({ status: Schema.Literal("refused"), requestId: Str, back }),
  Schema.Struct({ status: Schema.Literal("unbound") }),
  Schema.Struct({ status: Schema.Literal("missing") }),
]);
export type ClaimResult = typeof ClaimResult.Type;

export const CompleteArgs = Schema.Struct({
  requestId: Str,
  identity: UpstreamIdentity,
  authTime: Num,
  codeHash: Str,
  codeExpiresAt: Num,
  configured,
  liveGates,
  now: Num,
});

/** The deleted request's return address when the card holds it; null when it does not, or no request. */
export const AbandonResult = Schema.NullOr(Return);

export const ExchangeCodeArgs = Schema.Struct({
  clientId: Str,
  /** SHA-256 hex of the client secret the token request carried. */
  clientSecretHash: Str,
  /** How the token request carried the credentials; it must be the method on the card. */
  tokenEndpointAuthMethod: TokenEndpointAuthMethod,
  codeHash: Str,
  /** The address the token request names, which must be the one the authorization request named. */
  redirectUri: Str,
  /** The S256 challenge of the submitted `code_verifier`, computed by the core. */
  codeChallengeOfVerifier: Str,
  /** The `resource` parameter of the token request. A sign-in code grants none. */
  resource: opt(Str),
  configured,
  liveGates,
  now: Num,
});
export const ExchangeResult = Schema.Union([
  Schema.Struct({
    ok: Schema.Literal(true),
    clientId: Str,
    /** The card's `ref`, for the sign-in record and the log line. */
    ref: Str,
    scope: Str,
    nonce: opt(Str),
    identity: UpstreamIdentity,
    /** Only for a request that asked for a fresh login: the provider's time of that login. */
    authTime: opt(Num),
  }),
  Schema.Struct({
    ok: Schema.Literal(false),
    error: Schema.Literals(["invalid_client", "invalid_grant", "invalid_target"]),
    description: Str,
  }),
]);
export type ExchangeResult = typeof ExchangeResult.Type;

// clients

export const ClientIdArgs = Schema.Struct({ clientId: Str });
export const ClientResult = Schema.NullOr(
  Schema.Struct({ clientId: Str, ref: Str, redirectUris: Strs, connectors: Strs, confirm: Bool }),
);

// signIns

export const RecordArgs = Schema.Struct({
  clientId: Str,
  ref: Str,
  connector: Str,
  sub: Str,
  at: Num,
});

// lifecycle

export const CleanupArgs = Schema.Struct({ now: Num, signInRetentionMs: Num });
export const CleanupResult = Schema.Struct({
  authRequests: Num,
  authorizationCodes: Num,
  clients: Num,
  signIns: Num,
  /** A category filled its batch: call again with the same arguments. */
  more: Bool,
});
