import { v, type Infer } from "convex/values";
import { calculatePKCECodeChallenge } from "oauth4webapi";
import { MINUTE, RateLimiter } from "@convex-dev/rate-limiter";
import { components } from "./_generated/api";
// oxlint-disable-next-line samebase/no-raw-public-convex-function-builders -- Component entrypoints are internal to the host; host functions enforce access.
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { isSuspended } from "./apps";
import { clientWithApp, vClientWithApp } from "./clients";
import { refusalOf, usableConnectors, vPolicyDecision } from "./policy";
import { used } from "./registration";
import { vAuthRequest, vTokenEndpointAuthMethod, vUpstreamIdentity } from "./schema";
import { exchangeResourceCode, vResourceExchange } from "./resourceRequests";

const { array, boolean, literal, number, object, optional, string, union } = v;

/** Where the user goes back to once a request fails or finishes: the client's exact redirect URI. */
const vReturn = object({ redirectUri: string(), state: optional(string()) });

const vTransitionResult = union(
  object({ ok: literal(true), ...vReturn.fields }),
  object({
    ok: literal(false),
    /** `refused`: the connector is outside what the request may use now, or the policy stops it. */
    error: union(literal("expired"), literal("wrong_status"), literal("refused")),
    ...vReturn.fields,
  }),
  object({ ok: literal(false), error: literal("not_found") }),
);
type TransitionResult = Infer<typeof vTransitionResult>;

async function findByRequestId(ctx: MutationCtx, requestId: string) {
  return await ctx.db
    .query("authRequests")
    .withIndex("by_request_id", (q) => q.eq("requestId", requestId))
    .unique();
}

/** The client and the app of a request, read in the transaction that decides on it. */
async function rowsOf(ctx: QueryCtx, request: Doc<"authRequests">) {
  const client = await ctx.db
    .query("clients")
    .withIndex("by_client_id", (q) => q.eq("clientId", request.clientId))
    .unique();
  const app = await ctx.db
    .query("apps")
    .withIndex("by_app_id", (q) => q.eq("appId", request.appId))
    .unique();
  return client === null || app === null ? null : { client, app };
}

/**
 * Whether `connector` may go on for `request` under `decision`: the client and app exist, the
 * connector is in the request's set, the enrollment, and the decision, the tenant is not stopped,
 * and the decision still applies. Every mutation that moves a sign-in on decides this again.
 */
async function allowed(
  ctx: QueryCtx,
  request: Doc<"authRequests">,
  connector: string,
  decision: Infer<typeof vPolicyDecision>,
): Promise<boolean> {
  const rows = await rowsOf(ctx, request);
  return (
    rows !== null &&
    usableConnectors(request, rows.client, decision).includes(connector) &&
    !(await isSuspended(ctx, rows.app.tenantId)) &&
    (await refusalOf(ctx, decision, rows.app.tenantId)) === null
  );
}

/**
 * The sign-ins of one tenant. Anyone can start a sign-in for a public client id, so this budget stops
 * a flood at one tenant from reaching the others. It does not protect that tenant: a limit by source
 * in front of the hub does.
 */
const limits = new RateLimiter(components.rateLimiter, {
  tenantSignIn: { kind: "token bucket", rate: 120, period: MINUTE, capacity: 240, shards: 4 },
});

/**
 * Stores a validated /authorize request. The caller has already checked the client, the redirect
 * URI, and the policy. The budget of the tenant and its blocks are read in this mutation, so a
 * refused request writes no row.
 */
export const create = mutation({
  args: {
    /** The tenant of the app, whose budget this request spends. */
    tenantId: string(),
    requestId: string(),
    appId: string(),
    clientId: string(),
    redirectUri: string(),
    scope: string(),
    state: optional(string()),
    nonce: optional(string()),
    codeChallenge: string(),
    connectors: array(string()),
    freshLogin: boolean(),
    txnCookieHash: string(),
    createdAt: number(),
    expiresAt: number(),
  },
  returns: union(
    object({ ok: literal(true) }),
    object({ ok: literal(false), error: union(literal("rate_limited"), literal("suspended")) }),
  ),
  handler: async (ctx, args) => {
    if (await isSuspended(ctx, args.tenantId)) {
      return { ok: false as const, error: "suspended" as const };
    }
    const { ok } = await limits.limit(ctx, "tenantSignIn", { key: args.tenantId });
    if (!ok) {
      return { ok: false as const, error: "rate_limited" as const };
    }
    await ctx.db.insert("authRequests", {
      status: "pending",
      requestId: args.requestId,
      appId: args.appId,
      clientId: args.clientId,
      redirectUri: args.redirectUri,
      scope: args.scope,
      ...optionalField("state", args.state),
      ...optionalField("nonce", args.nonce),
      codeChallenge: args.codeChallenge,
      connectors: args.connectors,
      freshLogin: args.freshLogin,
      txnCookieHash: args.txnCookieHash,
      createdAt: args.createdAt,
      expiresAt: args.expiresAt,
    });
    return { ok: true as const };
  },
});

export const get = query({
  args: { requestId: string() },
  returns: union(vAuthRequest, v.null()),
  handler: async (ctx, args) => {
    const request = await ctx.db
      .query("authRequests")
      .withIndex("by_request_id", (q) => q.eq("requestId", args.requestId))
      .unique();
    if (request === null) {
      return null;
    }
    const { _id, _creationTime, ...fields } = request;
    return fields;
  },
});

/**
 * The user chose an OAuth or OIDC connector; the request now waits for that connector's callback.
 * The connector must be one the request may use under `policy`, read again here.
 */
export const startUpstream = mutation({
  args: {
    requestId: string(),
    connector: string(),
    upstreamStateHash: string(),
    upstreamCodeVerifier: string(),
    upstreamNonce: optional(string()),
    policy: vPolicyDecision,
    now: number(),
  },
  returns: vTransitionResult,
  handler: async (ctx, args): Promise<TransitionResult> => {
    const request = await findByRequestId(ctx, args.requestId);
    if (request === null) {
      return { ok: false, error: "not_found" };
    }
    const back = returnTo(request);
    if (request.expiresAt <= args.now) {
      return { ok: false, error: "expired", ...back };
    }
    // A chooser page can be reloaded, so a pending request may start upstream more than once; the
    // newest state hash wins. Any other status means the flow already moved on.
    if (request.status !== "pending" && request.status !== "upstream") {
      return { ok: false, error: "wrong_status", ...back };
    }
    if (!(await allowed(ctx, request, args.connector, args.policy))) {
      return { ok: false, error: "refused", ...back };
    }
    await ctx.db.replace("authRequests", request._id, {
      status: "upstream",
      ...baseFields(request),
      connector: args.connector,
      upstreamStateHash: args.upstreamStateHash,
      upstreamCodeVerifier: args.upstreamCodeVerifier,
      ...optionalField("upstreamNonce", args.upstreamNonce),
    });
    return { ok: true, ...back };
  },
});

/**
 * The client of the request that waits for the callback with this state, with its app and policy
 * facts, so the host decides the policy before it claims the request. Null when no request waits
 * for that state, or its client is gone.
 */
export const upstreamClient = query({
  args: { upstreamStateHash: string() },
  returns: union(vClientWithApp, v.null()),
  handler: async (ctx, args) => {
    const request = await ctx.db
      .query("authRequests")
      .withIndex("by_upstream_state_hash", (q) => q.eq("upstreamStateHash", args.upstreamStateHash))
      .unique();
    if (request === null || request.status !== "upstream") {
      return null;
    }
    const client = await ctx.db
      .query("clients")
      .withIndex("by_client_id", (q) => q.eq("clientId", request.clientId))
      .unique();
    return client === null ? null : await clientWithApp(ctx, client);
  },
});

const vClaimResult = union(
  object({
    status: literal("claimed"),
    requestId: string(),
    connector: string(),
    upstreamCodeVerifier: string(),
    upstreamNonce: optional(string()),
    freshLogin: boolean(),
    /** When /authorize stored the request: an upstream `auth_time` before it is an old session. */
    createdAt: number(),
    ...vReturn.fields,
  }),
  object({ status: literal("expired"), requestId: string(), ...vReturn.fields }),
  /** The policy stops the sign-in now; the request is deleted. */
  object({ status: literal("refused"), requestId: string(), ...vReturn.fields }),
  object({ status: literal("unbound") }),
  object({ status: literal("missing") }),
);
type ClaimResult = Infer<typeof vClaimResult>;

/**
 * The callback of `connector` arrived with its state. Claiming moves the request to `claimed` in
 * the same mutation that finds it, so a replayed or raced callback finds nothing to claim. A
 * request started for another connector is not claimed: its state cannot finish elsewhere. A
 * request is claimed only from the browser that holds its transaction cookie; any other browser
 * gets `unbound` and the request keeps waiting. A request that `policy` stops now is deleted
 * instead of claimed: the provider's code is never redeemed.
 */
export const claimUpstream = mutation({
  args: {
    upstreamStateHash: string(),
    connector: string(),
    /** SHA-256 hex of each transaction cookie the callback request carried. */
    txnCookieHashes: array(string()),
    policy: vPolicyDecision,
    now: number(),
  },
  returns: vClaimResult,
  handler: async (ctx, args): Promise<ClaimResult> => {
    const request = await ctx.db
      .query("authRequests")
      .withIndex("by_upstream_state_hash", (q) => q.eq("upstreamStateHash", args.upstreamStateHash))
      .unique();
    if (request === null || request.status !== "upstream" || request.connector !== args.connector) {
      return { status: "missing" };
    }
    if (!args.txnCookieHashes.includes(request.txnCookieHash)) {
      return { status: "unbound" };
    }
    const back = returnTo(request);
    if (request.expiresAt <= args.now) {
      await ctx.db.delete("authRequests", request._id);
      return { status: "expired", requestId: request.requestId, ...back };
    }
    if (!(await allowed(ctx, request, request.connector, args.policy))) {
      await ctx.db.delete("authRequests", request._id);
      return { status: "refused", requestId: request.requestId, ...back };
    }
    await ctx.db.replace("authRequests", request._id, {
      status: "claimed",
      ...baseFields(request),
      connector: request.connector,
    });
    return {
      status: "claimed",
      requestId: request.requestId,
      connector: request.connector,
      upstreamCodeVerifier: request.upstreamCodeVerifier,
      ...optionalField("upstreamNonce", request.upstreamNonce),
      freshLogin: request.freshLogin,
      createdAt: request.createdAt,
      ...back,
    };
  },
});

/** The connector attested the identity after a claim; the authorization code can be handed out. */
export const complete = mutation({
  args: {
    requestId: string(),
    identity: vUpstreamIdentity,
    authTime: number(),
    codeHash: string(),
    codeExpiresAt: number(),
    now: number(),
  },
  returns: vTransitionResult,
  handler: async (ctx, args): Promise<TransitionResult> => {
    const request = await findByRequestId(ctx, args.requestId);
    if (request === null) {
      return { ok: false, error: "not_found" };
    }
    const back = returnTo(request);
    if (request.expiresAt <= args.now) {
      return { ok: false, error: "expired", ...back };
    }
    if (request.status !== "claimed") {
      return { ok: false, error: "wrong_status", ...back };
    }
    await ctx.db.replace("authRequests", request._id, {
      status: "completed",
      ...baseFields(request),
      expiresAt: completedExpiresAt(request, args.codeExpiresAt),
      identity: args.identity,
      authTime: args.authTime,
    });
    await ctx.db.insert("authorizationCodes", {
      codeHash: args.codeHash,
      authRequestId: request._id,
      clientId: request.clientId,
      expiresAt: args.codeExpiresAt,
    });
    return { ok: true, ...back };
  },
});

/** Deletes a request the user abandoned at the hub, such as a declined consent. */
export const abandon = mutation({
  args: { requestId: string() },
  returns: union(vReturn, v.null()),
  handler: async (ctx, args) => {
    const request = await findByRequestId(ctx, args.requestId);
    if (request === null) {
      return null;
    }
    await ctx.db.delete("authRequests", request._id);
    return returnTo(request);
  },
});

const vExchangeResult = union(
  vResourceExchange,
  object({
    ok: literal(true),
    appId: string(),
    clientId: string(),
    scope: string(),
    nonce: optional(string()),
    identity: vUpstreamIdentity,
    authTime: number(),
  }),
  object({
    ok: literal(false),
    error: union(literal("invalid_client"), literal("invalid_grant"), literal("invalid_target")),
    description: string(),
  }),
);
type ExchangeResult = Infer<typeof vExchangeResult>;

/**
 * Authenticates the client and redeems an authorization code: single use, bound to the client, the
 * redirect URI and the PKCE challenge of its request (OAuth 2.1 section 4.1.3). The client and its
 * app are read in this transaction, so a client that fails authentication leaves the code as it
 * was, and deleting the client or its app commits wholly before the redemption or after it. The
 * same holds for a suspension or a pause: one that commits first refuses the code. On success the
 * code is marked used and the request is gone. The client's `lastSignInAt` and removal date move in
 * this transaction, so neither `cleanup` nor a cap can delete a client that has just signed someone
 * in.
 */
export const exchangeCode = mutation({
  args: {
    clientId: string(),
    /** SHA-256 hex of the client secret the token request carried. */
    clientSecretHash: string(),
    /** How the token request carried the credentials; it must be the method the client registered. */
    tokenEndpointAuthMethod: vTokenEndpointAuthMethod,
    codeHash: string(),
    redirectUri: optional(string()),
    codeVerifier: string(),
    resource: optional(string()),
    refreshTokenHash: string(),
    policy: vPolicyDecision,
    now: number(),
  },
  returns: vExchangeResult,
  handler: async (ctx, args): Promise<ExchangeResult> => {
    const client = await ctx.db
      .query("clients")
      .withIndex("by_client_id", (q) => q.eq("clientId", args.clientId))
      .unique();
    const app =
      client === null
        ? null
        : await ctx.db
            .query("apps")
            .withIndex("by_app_id", (q) => q.eq("appId", client.appId))
            .unique();
    // A client whose app is deleted is refused at once: deleteApp deletes the app row first and
    // the app's clients in later batches.
    if (
      client === null ||
      app === null ||
      client.tokenEndpointAuthMethod !== args.tokenEndpointAuthMethod ||
      client.secretHash !== args.clientSecretHash ||
      (await isSuspended(ctx, app.tenantId))
    ) {
      return { ok: false, error: "invalid_client", description: "Client authentication failed." };
    }
    const refusal = await refusalOf(ctx, args.policy, app.tenantId);
    if (refusal !== null) {
      return {
        ok: false,
        error: "invalid_client",
        description:
          refusal === "paused" ? "This client is paused." : "Client authentication failed.",
      };
    }
    const code = await ctx.db
      .query("authorizationCodes")
      .withIndex("by_code_hash", (q) => q.eq("codeHash", args.codeHash))
      .unique();
    if (code === null) {
      return {
        ok: false,
        error: "invalid_grant",
        description: "The authorization code is unknown.",
      };
    }
    if (code.clientId !== args.clientId) {
      return {
        ok: false,
        error: "invalid_grant",
        description: "The authorization code belongs to another client.",
      };
    }
    if (code.usedAt !== undefined) {
      // Replay: the code and its request are revoked (RFC 6749 section 4.1.2).
      await ctx.db.delete("authorizationCodes", code._id);
      if ("resourceRequestId" in code) {
        if (
          code.refreshGrantId !== undefined &&
          (await ctx.db.get("refreshGrants", code.refreshGrantId)) !== null
        ) {
          await ctx.db.delete("refreshGrants", code.refreshGrantId);
        }
      } else {
        const request = await ctx.db.get("authRequests", code.authRequestId);
        if (request !== null) await ctx.db.delete("authRequests", request._id);
      }
      return {
        ok: false,
        error: "invalid_grant",
        description: "The authorization code was already used.",
      };
    }
    if (code.expiresAt <= args.now) {
      return { ok: false, error: "invalid_grant", description: "The authorization code expired." };
    }
    if ("resourceRequestId" in code) {
      return await exchangeResourceCode(ctx, code, {
        client,
        codeVerifier: args.codeVerifier,
        ...(args.redirectUri === undefined ? {} : { redirectUri: args.redirectUri }),
        ...(args.resource === undefined ? {} : { resource: args.resource }),
        allowedResources: args.policy.resources,
        refreshTokenHash: args.refreshTokenHash,
        now: args.now,
      });
    }
    if (args.resource !== undefined) {
      return {
        ok: false,
        error: "invalid_target",
        description: "This authorization did not grant an API resource.",
      };
    }
    const request = await ctx.db.get("authRequests", code.authRequestId);
    if (request === null || request.status !== "completed") {
      return {
        ok: false,
        error: "invalid_grant",
        description: "The authorization request is gone.",
      };
    }
    if (args.redirectUri !== undefined && args.redirectUri !== request.redirectUri) {
      return {
        ok: false,
        error: "invalid_grant",
        description: "redirect_uri does not match the authorization request.",
      };
    }
    if ((await calculatePKCECodeChallenge(args.codeVerifier)) !== request.codeChallenge) {
      return {
        ok: false,
        error: "invalid_grant",
        description: "code_verifier does not match code_challenge.",
      };
    }
    if (!usableConnectors(request, client, args.policy).includes(request.identity.connector)) {
      return {
        ok: false,
        error: "invalid_grant",
        description: "This client cannot sign in through that connector.",
      };
    }
    await ctx.db.patch("authorizationCodes", code._id, { usedAt: args.now });
    await ctx.db.delete("authRequests", request._id);
    await ctx.db.patch("clients", client._id, used(client, args.now));
    return {
      ok: true,
      appId: request.appId,
      clientId: request.clientId,
      scope: request.scope,
      ...optionalField("nonce", request.nonce),
      identity: request.identity,
      authTime: request.authTime,
    };
  },
});

function optionalField<K extends string, T>(key: K, value: T | undefined) {
  return value === undefined ? {} : ({ [key]: value } as { [P in K]: T });
}

/**
 * A completed request outlives its authorization code by a minute, so `lifecycle.cleanup` never
 * deletes the request while its code can still be redeemed.
 */
function completedExpiresAt(request: Doc<"authRequests">, codeExpiresAt: number) {
  return Math.max(request.expiresAt, codeExpiresAt + 60 * 1000);
}

function returnTo(request: Doc<"authRequests">) {
  return { redirectUri: request.redirectUri, ...optionalField("state", request.state) };
}

/**
 * The fields shared by every status, taken from a stored request. `replace` needs the whole
 * document, and the status-specific fields of the old status must not leak into the new one.
 */
function baseFields(request: Doc<"authRequests">) {
  return {
    requestId: request.requestId,
    appId: request.appId,
    clientId: request.clientId,
    redirectUri: request.redirectUri,
    scope: request.scope,
    ...optionalField("state", request.state),
    ...optionalField("nonce", request.nonce),
    codeChallenge: request.codeChallenge,
    connectors: request.connectors,
    freshLogin: request.freshLogin,
    txnCookieHash: request.txnCookieHash,
    createdAt: request.createdAt,
    expiresAt: request.expiresAt,
  };
}
