import { v, type Infer } from "convex/values";
import { calculatePKCECodeChallenge } from "oauth4webapi";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
// oxlint-disable-next-line samebase/no-raw-public-convex-function-builders -- Component functions are called only by the host's authenticated OAuth endpoints.
import { mutation, internalMutation, type MutationCtx } from "./_generated/server";
import { used } from "./registration";
import { resourceRequestFields, vResourceTokens } from "./resourceSchema";
import { vTokenEndpointAuthMethod } from "./schema";

const { array, boolean, literal, number, object, optional, string, union } = v;
const REFRESH_IDLE_MS = 90 * 24 * 60 * 60 * 1000;
/** Above the upstream timeout of `refreshResourceToken`, so a claim outlives its attempt. */
const REFRESH_ATTEMPT_MS = 60 * 1000;
const CLEANUP_BATCH = 200;

/** Publicly registered clients have never been authorized to receive the team's API credentials. */
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
  return app?.firstParty ? client : null;
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

export const create = mutation({
  args: {
    ...resourceRequestFields,
    upstreamStateHash: string(),
    upstreamCodeVerifier: string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("resourceRequests", { status: "upstream", ...args });
    return null;
  },
});

const vClaim = union(
  object({
    status: literal("claimed"),
    ...resourceRequestFields,
    upstreamCodeVerifier: string(),
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
      return { status: "missing" };
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

export const complete = mutation({
  args: {
    requestId: string(),
    tokens: vResourceTokens,
    codeHash: string(),
    codeExpiresAt: number(),
    now: number(),
  },
  returns: boolean(),
  handler: async (ctx, args) => {
    const request = await ctx.db
      .query("resourceRequests")
      .withIndex("by_request_id", (q) => q.eq("requestId", args.requestId))
      .unique();
    if (request === null || request.status !== "claimed" || request.expiresAt <= args.now)
      return false;
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
    return true;
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

/** Called after the shared code redemption has authenticated the client and checked code lifetime. */
export async function exchangeResourceCode(
  ctx: MutationCtx,
  code: Extract<Doc<"authorizationCodes">, { resourceRequestId: unknown }>,
  args: {
    client: Doc<"clients">;
    redirectUri?: string;
    codeVerifier: string;
    resource?: string;
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
    resource: string(),
    upstreamRefreshToken: string(),
  }),
);

export const claimRefresh = mutation({
  args: {
    clientId: string(),
    clientSecretHash: string(),
    tokenEndpointAuthMethod: vTokenEndpointAuthMethod,
    tokenHash: string(),
    resource: optional(string()),
    now: number(),
  },
  returns: vRefreshClaim,
  handler: async (ctx, args): Promise<Infer<typeof vRefreshClaim>> => {
    const client = await authenticate(ctx, args);
    if (client === null)
      return { ok: false, error: "invalid_client", description: "Client authentication failed." };
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
      resource: grant.resource,
      upstreamRefreshToken: grant.upstreamRefreshToken,
    };
  },
});

export const finishRefresh = mutation({
  args: { grantId: v.id("refreshGrants"), tokens: vResourceTokens, now: number() },
  returns: boolean(),
  handler: async (ctx, args) => {
    const grant = await ctx.db.get("refreshGrants", args.grantId);
    if (grant === null) return false;
    await ctx.db.patch("refreshGrants", grant._id, {
      upstreamRefreshToken: args.tokens.refreshToken ?? grant.upstreamRefreshToken,
      expiresAt: args.now + REFRESH_IDLE_MS,
      refreshStartedAt: undefined,
    });
    return true;
  },
});

export const failRefresh = mutation({
  args: { grantId: v.id("refreshGrants"), rejected: boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const grant = await ctx.db.get("refreshGrants", args.grantId);
    if (grant === null) return null;
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
    const client = await authenticate(ctx, args);
    if (client === null) return false;
    const grant = await ctx.db
      .query("refreshGrants")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", args.tokenHash))
      .unique();
    if (grant !== null && grant.clientId === client.clientId)
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
