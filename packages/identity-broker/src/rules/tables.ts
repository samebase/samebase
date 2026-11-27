// The tables of the core, declared once as data, and the core's `Tx`: the view of a step that
// reaches these tables only. A layer adds its own tables and its own fields of a card in
// src/store/tables.ts, which the adapters and hosts use; the core never reads them.
import { Context, Schema } from "effect";
import { n, s, type TxShape } from "../store/Tx.ts";

/** A stored number. JSON has no NaN or infinity, so a stored number is finite. */
const Num = Schema.Finite;
const Str = Schema.String;
const opt = Schema.optionalKey;

export const TokenEndpointAuthMethod = Schema.Literals([
  "client_secret_post",
  "client_secret_basic",
]);

/** What a connector attested about the user. */
export const UpstreamIdentity = Schema.Struct({
  connector: Str,
  upstreamId: Str,
  email: opt(Str),
  emailVerified: opt(Schema.Boolean),
  name: opt(Str),
  picture: opt(Str),
});

/** A client id that is the https address of the client's metadata document. */
export const UrlClientId = Str.check(Schema.isPattern(/^https:\/\//));

/**
 * The fields of every client card: everything a sign-in step reads about a client. A layer writes
 * it; the core reads it and moves only `lastSignInAt` and `removeAt`. A card row can hold a layer's
 * own fields beside these: a write of the core spreads the stored document, so they stay.
 */
const sharedCardFields = {
  /** The exact return addresses, sorted and unique. */
  redirectUris: Schema.Array(Str),
  /** The connectors this client may use now, as its layer last computed them. */
  connectors: Schema.Array(Str),
  /**
   * The integrations this client may use now, as its layer last computed them. Sign-in never
   * reads it; the integrations part (src/integrations/) does.
   */
  connections: Schema.Array(Str),
  /** Opaque keys: a row of `stops` with one of them refuses the client. */
  gates: Schema.Array(Str),
  /** The page before the provider is shown. */
  confirm: Schema.Boolean,
  /** The key of the sign-in start limit (`signInBudgets`), set by the layer's server code. */
  budget: Str,
  /** The layer's own reference, namespaced (`<layer>:<id>`). Opaque to the core. */
  ref: Str,
  /** Set: a temporary card, which `lifecycle.cleanup` deletes after this time. */
  removeAt: opt(Num),
  createdAt: Num,
  lastSignInAt: opt(Num),
};

/** A card whose client proves itself at `/token` with its secret: every card of 0.44.0. */
export const secretCardFields = {
  tokenEndpointAuthMethod: TokenEndpointAuthMethod,
  /** Random, made by the broker. */
  clientId: Str,
  /** The SHA-256 hex of the client's secret. */
  secretHash: Schema.NonEmptyString,
  ...sharedCardFields,
};

/** A card whose client has no secret: a token request names it and sends no authentication. */
export const publicCardFields = {
  tokenEndpointAuthMethod: Schema.Literal("none"),
  clientId: UrlClientId,
  secretHash: Schema.Null,
  ...sharedCardFields,
};

export const cardIndexes = {
  by_client_id: [s("clientId")],
  by_ref: [s("ref")],
  by_remove_at: [n("removeAt")],
};

/** The fields every authorization request carries from `/authorize` until it is deleted. */
const authRequestFields = {
  requestId: Str,
  clientId: Str,
  redirectUri: Str,
  scope: Str,
  state: opt(Str),
  nonce: opt(Str),
  codeChallenge: Str,
  /** The connectors stored at `/authorize`: a later step goes on only with one of these. */
  connectors: Schema.Array(Str),
  /** A forced login: `prompt=login` or `max_age=0`. */
  freshLogin: Schema.Boolean,
  /** A positive `max_age`, in seconds. */
  maxAge: opt(Num),
  txnCookieHash: Str,
  createdAt: Num,
  expiresAt: Num,
};

export const AuthRequest = Schema.Union([
  Schema.Struct({ status: Schema.Literal("pending"), ...authRequestFields }),
  Schema.Struct({
    status: Schema.Literal("upstream"),
    ...authRequestFields,
    connector: Str,
    upstreamStateHash: Str,
    upstreamCodeVerifier: Str,
    upstreamNonce: opt(Str),
  }),
  Schema.Struct({ status: Schema.Literal("claimed"), ...authRequestFields, connector: Str }),
  Schema.Struct({
    status: Schema.Literal("completed"),
    ...authRequestFields,
    identity: UpstreamIdentity,
    authTime: Num,
  }),
]);

export const coreTables = {
  clients: {
    schema: Schema.Union([Schema.Struct(secretCardFields), Schema.Struct(publicCardFields)]),
    indexes: cardIndexes,
  },
  /** One row per stopped key. A card with that key in its `gates` is refused from the commit on. */
  stops: {
    schema: Schema.Struct({ key: Str, at: Num }),
    indexes: { by_key: [s("key")] },
  },
  authRequests: {
    schema: AuthRequest,
    indexes: {
      by_request_id: [s("requestId")],
      by_upstream_state_hash: [s("upstreamStateHash")],
      by_expires_at: [n("expiresAt")],
    },
  },
  /** A code links to its request by the request's `requestId`, found by `by_request_id`. */
  authorizationCodes: {
    schema: Schema.Struct({
      codeHash: Str,
      requestId: Str,
      clientId: Str,
      expiresAt: Num,
      usedAt: opt(Num),
    }),
    indexes: { by_code_hash: [s("codeHash")], by_expires_at: [n("expiresAt")] },
  },
  /** One row per issued id_token, kept 90 days: no email, no name, no token. */
  signIns: {
    schema: Schema.Struct({ clientId: Str, ref: Str, connector: Str, sub: Str, at: Num }),
    indexes: { by_at: [n("at")] },
  },
  /**
   * The token bucket of one key: a card's `budget`, or a layer's own key such as
   * `cimd:fetches`. `tokens` as of `at` (milliseconds).
   */
  signInBudgets: {
    schema: Schema.Struct({ key: Str, tokens: Num, at: Num }),
    indexes: { by_key: [s("key")] },
  },
} as const;

export type CoreTables = typeof coreTables;

/** The core's view of a step: the core tables only. */
export class Tx extends Context.Service<Tx, TxShape<CoreTables>>()("identity-broker/rules/Tx") {}
