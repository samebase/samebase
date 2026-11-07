import { v, type Infer } from "convex/values";
import { calculatePKCECodeChallenge } from "oauth4webapi";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
// oxlint-disable-next-line samebase/no-raw-public-convex-function-builders -- Component functions are called only by the host's authenticated OAuth endpoints.
import { mutation, internalMutation, type MutationCtx } from "./_generated/server";
import { isSuspended } from "./apps";
import { refusalOf, vPolicyDecision } from "./policy";
import { used } from "./registration";
import { resourceRequestFields, vResourceTokens } from "./resourceSchema";
import { vTokenEndpointAuthMethod } from "./schema";

const { array, boolean, literal, number, object, optional, string, union } = v;
const REFRESH_IDLE_MS = 90 * 24 * 60 * 60 * 1000;
/** Above the upstream timeout of `refreshResourceToken`, so a claim outlives its attempt. */
const REFRESH_ATTEMPT_MS = 60 * 1000;
const CLEANUP_BATCH = 200;

/** The client and its app, when the client authenticates and its app exists. */
async function authenticate(
  ctx: MutationCtx,
  args: {
    clientId: string;
    clientSecretHash: string;
    tokenEndpointAuthMethod: Infer<typeof vTokenEndpointAuthMethod>;
  },
) {
  const client = await ctx.db
    .query("clients")
    .withIndex("by_client_id", (q) => q.eq("clientId", args.clientId))
    .unique();
  if (
    client === null ||
    client.secretHash !== args.clientSecretHash ||
    client.tokenEndpointAuthMethod !== args.tokenEndpointAuthMethod
  )
    return null;
  const app = await ctx.db
    .query("apps")
    .withIndex("by_app_id", (q) => q.eq("appId", client.appId))
    .unique();
  return app === null ? null : { client, app };
}

/** The app of a client, for the policy's tenant check; null when either is gone. */
async function appOfClient(ctx: MutationCtx, clientId: string) {
  const client = await ctx.db
    .query("clients")
    .withIndex("by_client_id", (q) => q.eq("clientId", clientId))
    .unique();
  return client === null
    ? null
    : await ctx.db
        .query("apps")
        .withIndex("by_app_id", (q) => q.eq("appId", client.appId))
        .unique();
}

function fields(request: Doc<"resourceRequests">) {
  return {
    requestId: request.requestId,
    clientId: request.clientId,
    redirectUri: request.redirectUri,
    resource: request.resource,
    ...(request.state === undefined ? {} : { state: request.state }),
    codeChallenge: request.codeChallenge,
    txnCookieHash: request.txnCookieHash,
    expiresAt: request.expiresAt,
  };
}

/**
 * Stores an API authorization that goes to the provider. The policy's resources, the blocks, and
 * the pause are read here, so a refused request writes nothing: false, and the host answers with
 * an error page.
 */
export const create = mutation({
  args: {
    ...resourceRequestFields,
    upstreamStateHash: string(),
    upstreamCodeVerifier: string(),
    policy: vPolicyDecision,
  },
  returns: boolean(),
  handler: async (ctx, args) => {
    const app = await appOfClient(ctx, args.clientId);
    if (
      app === null ||
      !args.policy.resources.includes(args.resource) ||
      (await isSuspended(ctx, app.tenantId)) ||
      (await refusalOf(ctx, args.policy, app.tenantId)) !== null
    ) {
      return false;
    }
    await ctx.db.insert("resourceRequests", {
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
    return true;
  },
});

const vClaim = union(
  object({
    status: literal("claimed"),
    ...resourceRequestFields,
    upstreamCodeVerifier: string(),
  }),
  /** The bound browser came back too late; the request is deleted, and the app learns of it. */
  object({
    status: literal("expired"),
    requestId: string(),
    redirectUri: string(),
    state: optional(string()),
  }),
  object({ status: literal("missing") }),
  object({ status: literal("unbound") }),
);

export const claim = mutation({
  args: { stateHash: string(), resource: string(), cookieHashes: array(string()), now: number() },
  returns: vClaim,
  handler: async (ctx, args): Promise<Infer<typeof vClaim>> => {
    const request = await ctx.db
      .query("resourceRequests")
      .withIndex("by_upstream_state_hash", (q) => q.eq("upstreamStateHash", args.stateHash))
      .unique();
    if (request === null || request.status !== "upstream" || request.resource !== args.resource)
      return { status: "missing" };
    if (!args.cookieHashes.includes(request.txnCookieHash)) return { status: "unbound" };
    if (request.expiresAt <= args.now) {
      await ctx.db.delete("resourceRequests", request._id);
      return {
        status: "expired",
        requestId: request.requestId,
        redirectUri: request.redirectUri,
        ...(request.state === undefined ? {} : { state: request.state }),
      };
    }
    await ctx.db.replace("resourceRequests", request._id, {
      status: "claimed",
      ...fields(request),
    });
    return {
      status: "claimed",
      ...fields(request),
      upstreamCodeVerifier: request.upstreamCodeVerifier,
    };
  },
});

/**
 * The provider answered after a claim; the authorization code can be handed out, unless `policy`,
 * decided after the provider answered, no longer gives the client the resource, or a block, a
 * changed owner, or a pause committed while the provider answered (`refused`: the request is
 * deleted). `gone`: the request is not waiting, or expired.
 */
export const complete = mutation({
  args: {
    requestId: string(),
    tokens: vResourceTokens,
    codeHash: string(),
    codeExpiresAt: number(),
    policy: vPolicyDecision,
    now: number(),
  },
  returns: union(literal("completed"), literal("refused"), literal("gone")),
  handler: async (ctx, args) => {
    const request = await ctx.db
      .query("resourceRequests")
      .withIndex("by_request_id", (q) => q.eq("requestId", args.requestId))
      .unique();
    if (request === null || request.status !== "claimed" || request.expiresAt <= args.now)
      return "gone" as const;
    const app = await appOfClient(ctx, request.clientId);
    if (
      app === null ||
      !args.policy.resources.includes(request.resource) ||
      (await isSuspended(ctx, app.tenantId)) ||
      (await refusalOf(ctx, args.policy, app.tenantId)) !== null
    ) {
      await ctx.db.delete("resourceRequests", request._id);
      return "refused" as const;
    }
    await ctx.db.replace("resourceRequests", request._id, {
      status: "completed",
      ...fields(request),
      expiresAt: args.codeExpiresAt + 60_000,
      tokens: args.tokens,
    });
    await ctx.db.insert("authorizationCodes", {
      codeHash: args.codeHash,
      resourceRequestId: request._id,
      clientId: request.clientId,
      expiresAt: args.codeExpiresAt,
    });
    return "completed" as const;
  },
});

export const abandon = mutation({
  args: { requestId: string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const request = await ctx.db
      .query("resourceRequests")
      .withIndex("by_request_id", (q) => q.eq("requestId", args.requestId))
      .unique();
    if (request !== null) await ctx.db.delete("resourceRequests", request._id);
    return null;
  },
});

export const vResourceExchange = object({
  ok: literal(true),
  kind: literal("resource"),
  accessToken: string(),
  scope: string(),
  expiresAt: optional(number()),
  refresh: boolean(),
});

const vError = object({
  ok: literal(false),
  error: union(literal("invalid_client"), literal("invalid_grant"), literal("invalid_target")),
  description: string(),
});

/**
 * Called after the shared code redemption has authenticated the client, checked the policy's
 * pause and owner, and checked the code's lifetime. `allowedResources` is what the policy gives
 * the client now: a resource withdrawn since the authorization refuses the code.
 */
export async function exchangeResourceCode(
  ctx: MutationCtx,
  code: Extract<Doc<"authorizationCodes">, { resourceRequestId: unknown }>,
  args: {
    client: Doc<"clients">;
    redirectUri?: string;
    codeVerifier: string;
    resource?: string;
    allowedResources: string[];
    refreshTokenHash: string;
    now: number;
  },
): Promise<Infer<typeof vResourceExchange> | Infer<typeof vError>> {
  const request = await ctx.db.get("resourceRequests", code.resourceRequestId);
  if (request === null || request.status !== "completed") {
    return {
      ok: false,
      error: "invalid_grant",
      description: "The resource authorization is unavailable.",
    };
  }
  if (args.resource !== undefined && args.resource !== request.resource) {
    return {
      ok: false,
      error: "invalid_target",
      description: "The resource does not match the authorization.",
    };
  }
  if (!args.allowedResources.includes(request.resource)) {
    return {
      ok: false,
      error: "invalid_target",
      description: "This client cannot use that API resource.",
    };
  }
  if (
    args.redirectUri !== request.redirectUri ||
    (await calculatePKCECodeChallenge(args.codeVerifier)) !== request.codeChallenge
  ) {
    return {
      ok: false,
      error: "invalid_grant",
      description: "The redirect URI or PKCE verifier does not match.",
    };
  }
  const { tokens } = request;
  const refreshGrantId =
    tokens.refreshToken === undefined
      ? undefined
      : await ctx.db.insert("refreshGrants", {
          clientId: request.clientId,
          resource: request.resource,
          tokenHash: args.refreshTokenHash,
          upstreamRefreshToken: tokens.refreshToken,
          expiresAt: args.now + REFRESH_IDLE_MS,
        });
  await ctx.db.patch("authorizationCodes", code._id, {
    usedAt: args.now,
    ...(refreshGrantId === undefined ? {} : { refreshGrantId }),
  });
  await ctx.db.delete("resourceRequests", request._id);
  await ctx.db.patch("clients", args.client._id, used(args.client, args.now));
  return {
    ok: true,
    kind: "resource",
    accessToken: tokens.accessToken,
    scope: tokens.scope,
    ...(tokens.expiresAt === undefined ? {} : { expiresAt: tokens.expiresAt }),
    refresh: refreshGrantId !== undefined,
  };
}

const vRefreshClaim = union(
  vError,
  object({ ok: literal(false), error: literal("temporarily_unavailable"), description: string() }),
  object({
    ok: literal(true),
    grantId: v.id("refreshGrants"),
    /** This attempt's claim: only the attempt that holds it can finish or fail the grant. */
    attempt: number(),
    resource: string(),
    upstreamRefreshToken: string(),
  }),
);

/**
 * The admission of a refresh: the client authenticates, its tenant is not stopped, the policy
 * still applies and keeps the grant's resource, and no other attempt holds the grant. Every
 * refusal is before the provider is called and writes nothing but an expired grant's deletion.
 */
export const claimRefresh = mutation({
  args: {
    clientId: string(),
    clientSecretHash: string(),
    tokenEndpointAuthMethod: vTokenEndpointAuthMethod,
    tokenHash: string(),
    resource: optional(string()),
    policy: vPolicyDecision,
    now: number(),
  },
  returns: vRefreshClaim,
  handler: async (ctx, args): Promise<Infer<typeof vRefreshClaim>> => {
    const authenticated = await authenticate(ctx, args);
    // A blocked or suspended tenant stops provider access here, as it stops a code exchange.
    if (
      authenticated === null ||
      (await isSuspended(ctx, authenticated.app.tenantId)) ||
      (await refusalOf(ctx, args.policy, authenticated.app.tenantId)) !== null
    )
      return { ok: false, error: "invalid_client", description: "Client authentication failed." };
    const { client } = authenticated;
    const grant = await ctx.db
      .query("refreshGrants")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", args.tokenHash))
      .unique();
    if (grant === null || grant.clientId !== args.clientId)
      return { ok: false, error: "invalid_grant", description: "The refresh token is invalid." };
    if (grant.expiresAt <= args.now) {
      await ctx.db.delete("refreshGrants", grant._id);
      return { ok: false, error: "invalid_grant", description: "The grant expired." };
    }
    if (args.resource !== undefined && args.resource !== grant.resource) {
      return {
        ok: false,
        error: "invalid_target",
        description: "The resource does not match the grant.",
      };
    }
    if (!args.policy.resources.includes(grant.resource)) {
      return {
        ok: false,
        error: "invalid_target",
        description: "This client cannot use that API resource.",
      };
    }
    if (
      grant.refreshStartedAt !== undefined &&
      grant.refreshStartedAt + REFRESH_ATTEMPT_MS > args.now
    )
      return {
        ok: false,
        error: "temporarily_unavailable",
        description: "A refresh is already running. Retry shortly.",
      };
    await ctx.db.patch("refreshGrants", grant._id, { refreshStartedAt: args.now });
    await ctx.db.patch("clients", client._id, used(client, args.now));
    return {
      ok: true,
      grantId: grant._id,
      attempt: args.now,
      resource: grant.resource,
      upstreamRefreshToken: grant.upstreamRefreshToken,
    };
  },
});

/**
 * The release of a refresh: saves the provider's answer to the attempt that still holds the claim,
 * then decides whether the new access token may go out. `stale`: the claim expired and another
 * attempt holds the grant now, so this answer changes nothing. `refused`: the rotation is saved, so
 * the grant works again once the block, the pause, or the policy lifts, but a block, a client
 * delete, a pause, a changed owner, or a withdrawn resource committed while the provider answered
 * keeps the token from the caller. `gone`: the grant was deleted.
 */
export const finishRefresh = mutation({
  args: {
    grantId: v.id("refreshGrants"),
    attempt: number(),
    tokens: vResourceTokens,
    /** The decision the host made after the provider answered. Null: its policy failed, so refuse. */
    policy: union(vPolicyDecision, v.null()),
    now: number(),
  },
  returns: union(literal("released"), literal("refused"), literal("stale"), literal("gone")),
  handler: async (ctx, args) => {
    const grant = await ctx.db.get("refreshGrants", args.grantId);
    if (grant === null) return "gone" as const;
    if (grant.refreshStartedAt !== args.attempt) return "stale" as const;
    await ctx.db.patch("refreshGrants", grant._id, {
      upstreamRefreshToken: args.tokens.refreshToken ?? grant.upstreamRefreshToken,
      expiresAt: args.now + REFRESH_IDLE_MS,
      refreshStartedAt: undefined,
    });
    const app = await appOfClient(ctx, grant.clientId);
    return app === null ||
      args.policy === null ||
      !args.policy.resources.includes(grant.resource) ||
      (await isSuspended(ctx, app.tenantId)) ||
      (await refusalOf(ctx, args.policy, app.tenantId)) !== null
      ? ("refused" as const)
      : ("released" as const);
  },
});

/** Ends this attempt after a provider error. An attempt whose claim was taken over changes nothing. */
export const failRefresh = mutation({
  args: { grantId: v.id("refreshGrants"), attempt: number(), rejected: boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const grant = await ctx.db.get("refreshGrants", args.grantId);
    if (grant === null || grant.refreshStartedAt !== args.attempt) return null;
    if (args.rejected) await ctx.db.delete("refreshGrants", grant._id);
    else await ctx.db.patch("refreshGrants", grant._id, { refreshStartedAt: undefined });
    return null;
  },
});

/** RFC 7009: only the authenticating client can revoke its token; unknown tokens also succeed. */
export const revoke = mutation({
  args: {
    clientId: string(),
    clientSecretHash: string(),
    tokenEndpointAuthMethod: vTokenEndpointAuthMethod,
    tokenHash: string(),
  },
  returns: boolean(),
  handler: async (ctx, args) => {
    // A blocked client can still revoke its own token.
    const authenticated = await authenticate(ctx, args);
    if (authenticated === null) return false;
    const grant = await ctx.db
      .query("refreshGrants")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", args.tokenHash))
      .unique();
    if (grant !== null && grant.clientId === authenticated.client.clientId)
      await ctx.db.delete("refreshGrants", grant._id);
    return true;
  },
});

/** Client deletion disables refresh immediately; these bounded batches also erase the upstream secret. */
export async function removeClientGrants(ctx: MutationCtx, clientId: string): Promise<void> {
  const grants = await ctx.db
    .query("refreshGrants")
    .withIndex("by_client_id", (q) => q.eq("clientId", clientId))
    .take(CLEANUP_BATCH);
  for (const grant of grants) await ctx.db.delete("refreshGrants", grant._id);
  if (grants.length === CLEANUP_BATCH)
    await ctx.scheduler.runAfter(0, internal.resourceRequests.continueRemoveClientGrants, {
      clientId,
    });
}

export const continueRemoveClientGrants = internalMutation({
  args: { clientId: string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await removeClientGrants(ctx, args.clientId);
    return null;
  },
});
