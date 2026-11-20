// The tables of the connections part and its view of a step. A connection request lives from
// `/authorize` to the code exchange; its code is the part's own; a grant holds the provider's
// refresh token behind the hub's own refresh token. A hub that does not mount the part keeps
// these tables empty.
import { Context, Schema } from "effect";
import type { Tables } from "../store/tables.ts";
import { n, s, type TxShape } from "../store/Tx.ts";

const Num = Schema.Finite;
const Str = Schema.String;
const opt = Schema.optionalKey;

/** What the provider's token endpoint gave at the code exchange (RFC 6749 section 5.1). */
export const ProviderTokens = Schema.Struct({
  accessToken: Str,
  /** The granted scope: the provider's answer, else the scope the hub asked for. */
  scope: Str,
  expiresAt: opt(Num),
  refreshToken: opt(Str),
});

/** The fields every connection request carries from `/authorize` until it is deleted. */
const requestFields = {
  requestId: Str,
  clientId: Str,
  redirectUri: Str,
  /** The exact resource URL of the provider (RFC 8707); Cloudflare's keeps its final slash. */
  resource: Str,
  state: opt(Str),
  codeChallenge: Str,
  txnCookieHash: Str,
  expiresAt: Num,
};

/**
 * `upstream` until the provider's callback claims it, `claimed` while the hub redeems the
 * provider's code, and `completed` with the provider's tokens until the client redeems the hub's
 * code. There is no page before the provider, so no `pending`.
 */
export const ConnectionRequest = Schema.Union([
  Schema.Struct({
    status: Schema.Literal("upstream"),
    ...requestFields,
    upstreamStateHash: Str,
    upstreamCodeVerifier: Str,
  }),
  Schema.Struct({ status: Schema.Literal("claimed"), ...requestFields }),
  Schema.Struct({ status: Schema.Literal("completed"), ...requestFields, tokens: ProviderTokens }),
]);

export const connectionTables = {
  connectionRequests: {
    schema: ConnectionRequest,
    indexes: {
      by_request_id: [s("requestId")],
      by_upstream_state_hash: [s("upstreamStateHash")],
      by_expires_at: [n("expiresAt")],
    },
  },
  /**
   * A code of a connection, linked to its request by `requestId`. A used code keeps the hash of
   * the grant it issued, so a replay deletes that grant (RFC 6749 section 4.1.2).
   */
  connectionCodes: {
    schema: Schema.Struct({
      codeHash: Str,
      requestId: Str,
      clientId: Str,
      expiresAt: Num,
      usedAt: opt(Num),
      grantTokenHash: opt(Str),
    }),
    indexes: { by_code_hash: [s("codeHash")], by_expires_at: [n("expiresAt")] },
  },
  /**
   * The hub's refresh grant of one connection. `tokenHash` is the SHA-256 hex of the hub's own
   * refresh token, which stays the same for the grant's life; the provider's refresh token
   * rotates behind it. `attempt` counts the refreshes that took the lease, and
   * `refreshStartedAt` is set while one attempt holds it.
   */
  connectionGrants: {
    schema: Schema.Struct({
      tokenHash: Str,
      clientId: Str,
      resource: Str,
      upstreamRefreshToken: Str,
      /** The grant ends after this time without a refresh. */
      expiresAt: Num,
      attempt: Num,
      refreshStartedAt: opt(Num),
    }),
    indexes: {
      by_token_hash: [s("tokenHash")],
      by_client_id: [s("clientId")],
      by_expires_at: [n("expiresAt")],
    },
  },
} as const;

/** The part's view of a step: every table of the hub. Its rules read cards through the core's `Tx`. */
export class ConnectionsTx extends Context.Service<ConnectionsTx, TxShape<Tables>>()(
  "identity-broker-effect/connections/ConnectionsTx",
) {}
