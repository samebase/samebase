import { Infer, v } from "convex/values";
import { z } from "zod";

import { internal } from "./_generated/api";
import { httpAction, internalAction, internalMutation } from "./_generated/server";
import type { ActionCtx, MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { action } from "./functions";
import {
  formatCloudflareOAuthEndpointError,
  revokeCloudflareMcpOAuthGrant,
} from "./cloudflareMcpOAuth";
import { deriveMcpTokenStatusFromExpiry, vMcpTokenHealth } from "./mcpTokenHealth";
import { OAUTH_STATE_TTL_MS, randomToken, readRequiredEnv } from "./oauthUtils";
import { vProviderOAuthStoreResult, type ProviderOAuthStoreResult } from "./oauthState";
import { findOrganizationMembership } from "./organizationAccess";
import { requireCloudflareAuthUsableDuringRefresh, vCloudflareProviderAuth } from "./providerAuth";
import { vOrganizationCloudflareAccount } from "./organizationModel";
import {
  listCloudflareAccountsForToken,
  resolveCloudflareAccountAfterAuthorization,
  vCloudflareAccount,
} from "./cloudflareAccountDiscovery";
import { utf8ToBase64 } from "../shared/base64";
import { buildProviderOAuthDefaultReturnUrl } from "../shared/providerOAuthReturn";
import { buildUrlWithSearchParams, createUrlSearchParams } from "../shared/urlSearchParams";

const CLOUDFLARE_OAUTH_AUTHORIZATION_URL = "https://dash.cloudflare.com/oauth2/auth";
const CLOUDFLARE_OAUTH_TOKEN_URL = "https://dash.cloudflare.com/oauth2/token";
const CLOUDFLARE_OAUTH_REVOCATION_URL = "https://dash.cloudflare.com/oauth2/revoke";
const DEFAULT_OAUTH_TIMEOUT_MS = 10_000;
const { boolean, id, literal, null: nullValue, number, object, optional, string, union } = v;

type OAuthContext = ActionCtx | MutationCtx;
type CloudflareOAuthTokenOperation =
  | "exchange Cloudflare OAuth code"
  | "refresh Cloudflare OAuth token";
type CloudflareOAuthAuthorizeSearchParams = {
  response_type: "code";
  client_id: string;
  redirect_uri: string;
  scope: string;
  state: string;
};
type CloudflareOAuthTokenExchangeSearchParams = {
  grant_type: "authorization_code";
  code: string;
  redirect_uri: string;
};
type CloudflareOAuthTokenRefreshSearchParams = {
  grant_type: "refresh_token";
  refresh_token: string;
};
type CloudflareOAuthTokenResponse = {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
};

export const CLOUDFLARE_OAUTH_SCOPES = [
  "workers-ci.read",
  "workers-ci.write",
  "workers-scripts.read",
  "workers-scripts.write",
  "account-settings.read",
  // Cloudflare does not list protocol scopes from GET /oauth/scopes, but live
  // token exchange omits refresh_token unless offline_access is requested.
  "offline_access",
] as const;

const nonEmptyString = z.string().min(1);
const cloudflareOauthTokenResponseSchema = z.object({
  access_token: nonEmptyString,
  refresh_token: nonEmptyString.optional(),
  expires_in: z.number().positive(),
});

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = DEFAULT_OAUTH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Cloudflare OAuth request timed out after ${timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function formatCloudflareOAuthRequestFailure(args: {
  operation: CloudflareOAuthTokenOperation;
  status: number;
  payload: unknown;
}): Error {
  const detail = formatCloudflareOAuthEndpointError(args.payload);
  const message = `Failed to ${args.operation} (${args.status})`;
  if (!detail) {
    return new Error(`${message}.`);
  }
  return new Error(`${message}: ${detail}.`);
}

function parseCloudflareOAuthTokenResponse(
  payload: unknown,
  operation: CloudflareOAuthTokenOperation,
): CloudflareOAuthTokenResponse {
  const result = cloudflareOauthTokenResponseSchema.safeParse(payload);
  if (!result.success) {
    throw new Error(
      `Failed to ${operation}: Cloudflare token response failed schema validation: ${z.prettifyError(result.error)}`,
    );
  }
  return {
    accessToken: result.data.access_token,
    refreshToken: result.data.refresh_token,
    expiresIn: result.data.expires_in,
  };
}

function buildCloudflareOAuthClientAuthHeader(args: {
  clientId: string;
  clientSecret: string;
}): string {
  return `Basic ${utf8ToBase64(`${args.clientId}:${args.clientSecret}`)}`;
}

export async function revokeCloudflareOAuthGrant(refreshToken: string): Promise<void> {
  const clientId = readRequiredEnv("PROVIDER_CLOUDFLARE_OAUTH_CLIENT_ID");
  const clientSecret = readRequiredEnv("PROVIDER_CLOUDFLARE_OAUTH_CLIENT_SECRET");
  const body = createUrlSearchParams({
    token: refreshToken,
    token_type_hint: "refresh_token",
  });
  const response = await fetchWithTimeout(CLOUDFLARE_OAUTH_REVOCATION_URL, {
    method: "POST",
    headers: {
      Authorization: buildCloudflareOAuthClientAuthHeader({ clientId, clientSecret }),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  if (!response.ok) {
    throw new Error(`Failed to revoke Cloudflare OAuth grant (${response.status}).`);
  }
}

export function buildCloudflareOAuthAuthorizeSearchParams(args: {
  clientId: string;
  redirectUri: string;
  state: string;
}): CloudflareOAuthAuthorizeSearchParams {
  return {
    response_type: "code",
    client_id: args.clientId,
    redirect_uri: args.redirectUri,
    scope: CLOUDFLARE_OAUTH_SCOPES.join(" "),
    state: args.state,
  };
}

export function buildCloudflareOAuthAuthorizeUrl(args: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  return buildUrlWithSearchParams(
    CLOUDFLARE_OAUTH_AUTHORIZATION_URL,
    buildCloudflareOAuthAuthorizeSearchParams(args),
  );
}

async function requestCloudflareOAuthToken(args: {
  clientId: string;
  clientSecret: string;
  operation: CloudflareOAuthTokenOperation;
  body: string;
}): Promise<CloudflareOAuthTokenResponse> {
  const response = await fetchWithTimeout(CLOUDFLARE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: buildCloudflareOAuthClientAuthHeader(args),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: args.body,
  });
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw formatCloudflareOAuthRequestFailure({
      operation: args.operation,
      status: response.status,
      payload: data,
    });
  }

  return parseCloudflareOAuthTokenResponse(data, args.operation);
}

async function exchangeCloudflareOAuthCode(args: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<CloudflareOAuthTokenResponse & { refreshToken: string }> {
  const payload = createUrlSearchParams({
    grant_type: "authorization_code",
    code: args.code,
    redirect_uri: args.redirectUri,
  } satisfies CloudflareOAuthTokenExchangeSearchParams);
  const token = await requestCloudflareOAuthToken({
    clientId: args.clientId,
    clientSecret: args.clientSecret,
    operation: "exchange Cloudflare OAuth code",
    body: payload.toString(),
  });
  if (!token.refreshToken) {
    throw new Error(
      "Cloudflare OAuth response did not include a refresh token. Enable the refresh_token grant on the Cloudflare OAuth client and reconnect.",
    );
  }
  return {
    ...token,
    refreshToken: token.refreshToken,
  };
}

async function refreshCloudflareOAuthToken(args: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}): Promise<CloudflareOAuthTokenResponse & { refreshToken: string }> {
  const payload = createUrlSearchParams({
    grant_type: "refresh_token",
    refresh_token: args.refreshToken,
  } satisfies CloudflareOAuthTokenRefreshSearchParams);
  const token = await requestCloudflareOAuthToken({
    clientId: args.clientId,
    clientSecret: args.clientSecret,
    operation: "refresh Cloudflare OAuth token",
    body: payload.toString(),
  });
  return {
    ...token,
    refreshToken: token.refreshToken ?? args.refreshToken,
  };
}

async function buildCloudflareOAuthUrl(
  ctx: OAuthContext,
  args: {
    userId: Id<"users">;
    organizationId: Id<"organizations">;
  },
): Promise<string> {
  const clientId = readRequiredEnv("PROVIDER_CLOUDFLARE_OAUTH_CLIENT_ID");
  const redirectUri = readRequiredEnv("PROVIDER_CLOUDFLARE_OAUTH_REDIRECT_URL");
  const state = randomToken();
  const now = Date.now();

  await ctx.runMutation(internal.oauthState.createOauthState, {
    provider: "cloudflare",
    userId: args.userId,
    organizationId: args.organizationId,
    state,
    createdAt: now,
    expiresAt: now + OAUTH_STATE_TTL_MS,
  });

  console.log("cloudflare:oauth:url_built", {
    organizationId: args.organizationId,
    redirectUri,
    oauthStateExpiresAt: now + OAUTH_STATE_TTL_MS,
  });

  return buildCloudflareOAuthAuthorizeUrl({
    clientId,
    redirectUri,
    state,
  });
}

const storeCloudflareOauthConnectionArgs = {
  organizationId: id("organizations"),
  connectedByUserId: id("users"),
  expectedProviderSnapshotHash: string(),
  accessToken: string(),
  refreshToken: string(),
  expiresAt: number(),
  account: union(vCloudflareAccount, nullValue()),
  oauthStateId: id("providerOAuthCallbackStates"),
  oauthState: string(),
} as const;

export const storeCloudflareOauthConnection = internalMutation({
  args: storeCloudflareOauthConnectionArgs,
  returns: vProviderOAuthStoreResult,
  handler: async (ctx, args) => {
    const membership = await findOrganizationMembership(ctx.db, {
      userId: args.connectedByUserId,
      organizationId: args.organizationId,
    });
    if (membership?.role !== "owner") {
      await ctx.db.delete(args.oauthStateId);
      return { status: "access_lost" as const };
    }

    const checkedAt = Date.now();
    await ctx.runMutation(internal.organizationProviderCredentials.connectCloudflare, {
      organizationId: args.organizationId,
      connectedByUserId: args.connectedByUserId,
      expectedProviderSnapshotHash: args.expectedProviderSnapshotHash,
      auth: {
        method: "oauth",
        credential: args.accessToken,
        refreshCredential: args.refreshToken,
        credentialExpiresAt: args.expiresAt,
      },
      account:
        args.account === null
          ? { state: "selection_required" }
          : { state: "selected", ...args.account },
      tokenHealth: {
        status: deriveMcpTokenStatusFromExpiry(args.expiresAt, checkedAt),
        checkedAt,
        expiresAt: args.expiresAt,
        source: "expiry_metadata",
      },
      oauthStateId: args.oauthStateId,
      oauthState: args.oauthState,
    });
    console.log("cloudflare:oauth:connection_stored", {
      organizationId: args.organizationId,
      expiresAt: args.expiresAt,
    });
    return { status: "stored" as const };
  },
});

const cloudflareOauthAuthValidator = object({
  method: literal("oauth"),
  credential: string(),
  refreshCredential: string(),
  credentialExpiresAt: number(),
});
const cloudflareMcpOauthAuthValidator = object({
  method: literal("mcp_oauth"),
  credential: string(),
  refreshCredential: string(),
  credentialExpiresAt: number(),
  clientId: string(),
});
const cloudflareApiKeyAuthValidator = object({
  method: literal("api_key"),
  credential: string(),
});
const resolvedCloudflareConnectionValidator = object({
  auth: union(
    cloudflareOauthAuthValidator,
    cloudflareMcpOauthAuthValidator,
    cloudflareApiKeyAuthValidator,
  ),
  account: optional(vOrganizationCloudflareAccount),
  tokenHealth: optional(vMcpTokenHealth),
});
const resolveConnectionForOrganizationResultValidator = union(
  resolvedCloudflareConnectionValidator,
  nullValue(),
);
type ResolvedCloudflareConnection = Infer<typeof resolvedCloudflareConnectionValidator>;

function sanitizeTokenHealthError(error: unknown): string | undefined {
  return error instanceof Error ? "Cloudflare token refresh failed." : undefined;
}

function isLikelyInvalidCloudflareTokenError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase().trim();
  if (message.length === 0) {
    return false;
  }
  return (
    message.includes("401") ||
    message.includes("400") ||
    message.includes("unauthorized") ||
    message.includes("invalid_token") ||
    message.includes("invalid_grant") ||
    message.includes("invalid grant") ||
    message.includes("invalid refresh token") ||
    message.includes("refresh token is missing")
  );
}

export const resolveConnectionForOrganization = internalAction({
  args: {
    organizationId: id("organizations"),
    userId: id("users"),
    forceRefresh: optional(boolean()),
  },
  returns: resolveConnectionForOrganizationResultValidator,
  handler: async (ctx, args): Promise<ResolvedCloudflareConnection | null> => {
    const configuration = await ctx.runQuery(
      internal.organizationProviderCredentials.loadForOrganization,
      {
        organizationId: args.organizationId,
        userId: args.userId,
      },
    );
    const credential = configuration.cloudflareCredential;
    if (credential === undefined) {
      return null;
    }

    if (credential.auth.method === "mcp_oauth") {
      return await ctx.runAction(
        internal.cloudflareMcpOAuth.resolveConnectionForOrganization,
        args,
      );
    }
    if (credential.auth.method !== "oauth") {
      return {
        auth: credential.auth,
        ...(configuration.cloudflareAccount ? { account: configuration.cloudflareAccount } : {}),
      };
    }

    const expiresAt = credential.auth.credentialExpiresAt;
    const checkedAt = Date.now();
    const derivedTokenHealth: Infer<typeof vMcpTokenHealth> = {
      status: deriveMcpTokenStatusFromExpiry(expiresAt, checkedAt),
      checkedAt,
      expiresAt,
      source: "expiry_metadata",
    };
    const effectiveTokenHealth = credential.tokenHealth ?? derivedTokenHealth;
    const shouldRefresh =
      args.forceRefresh === true ||
      derivedTokenHealth.status === "expiring_soon" ||
      derivedTokenHealth.status === "expired";
    if (!shouldRefresh) {
      return {
        auth: credential.auth,
        ...(configuration.cloudflareAccount ? { account: configuration.cloudflareAccount } : {}),
        tokenHealth: effectiveTokenHealth,
      };
    }

    const refreshToken = credential.auth.refreshCredential.trim();
    if (!refreshToken) {
      const message = "Cloudflare OAuth refresh token is empty. Reconnect Cloudflare and retry.";
      const tokenHealth: Infer<typeof vMcpTokenHealth> = {
        status: "invalid",
        checkedAt: Date.now(),
        expiresAt,
        source: "refresh_attempt",
        errorMessage: message,
      };
      await ctx.runMutation(internal.organizationProviderCredentials.replaceCloudflareCredential, {
        organizationId: args.organizationId,
        userId: args.userId,
        expectedAuth: credential.auth,
        auth: credential.auth,
        tokenHealth,
      });
      throw new Error(message);
    }

    const clientId = readRequiredEnv("PROVIDER_CLOUDFLARE_OAUTH_CLIENT_ID");
    const clientSecret = readRequiredEnv("PROVIDER_CLOUDFLARE_OAUTH_CLIENT_SECRET");
    const claim = await ctx.runMutation(
      internal.organizationProviderCredentials.claimCloudflareTokenRefresh,
      {
        organizationId: args.organizationId,
        userId: args.userId,
        expectedAuth: credential.auth,
        force: args.forceRefresh,
      },
    );
    if (!claim.claimed) {
      const current = await ctx.runQuery(
        internal.organizationProviderCredentials.loadForOrganization,
        {
          organizationId: args.organizationId,
          userId: args.userId,
        },
      );
      if (current.cloudflareCredential === undefined) {
        return null;
      }
      requireCloudflareAuthUsableDuringRefresh(current.cloudflareCredential.auth, Date.now());
      return {
        auth: current.cloudflareCredential.auth,
        ...(current.cloudflareAccount ? { account: current.cloudflareAccount } : {}),
        tokenHealth: current.cloudflareCredential.tokenHealth,
      };
    }
    const refreshLease = claim.tokenRefreshLease;

    let releaseExpectedAuth = credential.auth;
    let recordLastTokenRefreshAt = false;
    try {
      let refreshed: Awaited<ReturnType<typeof refreshCloudflareOAuthToken>>;
      try {
        refreshed = await refreshCloudflareOAuthToken({
          refreshToken,
          clientId,
          clientSecret,
        });
      } catch (error) {
        const invalidToken = isLikelyInvalidCloudflareTokenError(error);
        const tokenHealth: Infer<typeof vMcpTokenHealth> = {
          status: invalidToken ? "invalid" : derivedTokenHealth.status,
          checkedAt: Date.now(),
          expiresAt,
          source: invalidToken ? "refresh_attempt" : "runtime_error",
          errorMessage: sanitizeTokenHealthError(error),
        };
        await ctx.runMutation(
          internal.organizationProviderCredentials.replaceCloudflareCredential,
          {
            organizationId: args.organizationId,
            userId: args.userId,
            expectedAuth: credential.auth,
            expectedTokenRefreshLease: refreshLease,
            auth: credential.auth,
            tokenHealth,
          },
        );
        throw error;
      }

      const nextExpiresAt = Date.now() + refreshed.expiresIn * 1000;
      const refreshedAuth: Infer<typeof cloudflareOauthAuthValidator> = {
        method: "oauth",
        credential: refreshed.accessToken,
        refreshCredential: refreshed.refreshToken,
        credentialExpiresAt: nextExpiresAt,
      };
      const nowAfterRefresh = Date.now();
      const refreshedTokenHealth: Infer<typeof vMcpTokenHealth> = {
        status: deriveMcpTokenStatusFromExpiry(nextExpiresAt, nowAfterRefresh),
        checkedAt: nowAfterRefresh,
        expiresAt: nextExpiresAt,
        source: "refresh_attempt",
      };

      try {
        await ctx.runMutation(
          internal.organizationProviderCredentials.replaceCloudflareCredential,
          {
            organizationId: args.organizationId,
            userId: args.userId,
            expectedAuth: credential.auth,
            expectedTokenRefreshLease: refreshLease,
            auth: refreshedAuth,
            tokenHealth: refreshedTokenHealth,
          },
        );
      } catch (error) {
        if (refreshedAuth.refreshCredential !== credential.auth.refreshCredential) {
          try {
            await revokeCloudflareOAuthGrant(refreshedAuth.refreshCredential);
          } catch {
            // The current Samebase credential was not replaced. Revocation is best effort.
          }
        }
        throw error;
      }
      releaseExpectedAuth = refreshedAuth;
      recordLastTokenRefreshAt = true;

      return {
        auth: refreshedAuth,
        ...(configuration.cloudflareAccount ? { account: configuration.cloudflareAccount } : {}),
        tokenHealth: refreshedTokenHealth,
      };
    } finally {
      await ctx.runMutation(
        internal.organizationProviderCredentials.releaseCloudflareTokenRefresh,
        {
          organizationId: args.organizationId,
          expectedAuth: releaseExpectedAuth,
          expectedTokenRefreshLease: refreshLease,
          recordLastTokenRefreshAt,
        },
      );
    }
  },
});

export const getCloudflareOAuthUrl = action({
  access: "access_provider_connections",
  args: {
    organizationId: id("organizations"),
  },
  returns: string(),
  handler: async (ctx, args): Promise<string> => {
    const organizationId = await ctx.runQuery(
      internal.organizationAccess.requireOrganizationOwnerIdForUser,
      {
        userId: ctx.viewer.userId,
        organizationId: args.organizationId,
      },
    );
    return await buildCloudflareOAuthUrl(ctx, {
      userId: ctx.viewer.userId,
      organizationId,
    });
  },
});

export const revokeCloudflareOAuthForOrganizationConnection = internalAction({
  args: {
    expectedAuth: vCloudflareProviderAuth,
  },
  returns: union(literal("confirmed"), literal("unconfirmed"), literal("not_supported")),
  handler: async (_ctx, args) => {
    if (args.expectedAuth.method === "api_key") {
      return "not_supported" as const;
    }
    try {
      if (args.expectedAuth.method === "oauth") {
        await revokeCloudflareOAuthGrant(args.expectedAuth.refreshCredential);
      } else {
        await revokeCloudflareMcpOAuthGrant({
          clientId: args.expectedAuth.clientId,
          refreshToken: args.expectedAuth.refreshCredential,
        });
      }
      return "confirmed" as const;
    } catch {
      return "unconfirmed" as const;
    }
  },
});

export const finishCloudflareOAuth = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (error !== null) {
    console.log("cloudflare:oauth:callback_provider_error", {
      statePresent: state !== null,
      errorPresent: error.length > 0,
      errorDescriptionPresent: errorDescription !== null,
    });
  }

  if (state === null || (code === null && error === null)) {
    console.log("cloudflare:oauth:callback_missing_params", {
      hasCode: code !== null,
      hasState: state !== null,
    });
    return new Response("Missing OAuth parameters", { status: 400 });
  }

  const oauthState = await ctx.runQuery(internal.oauthState.getOauthStateByState, {
    provider: "cloudflare",
    state,
  });
  if (!oauthState) {
    console.log("cloudflare:oauth:callback_invalid_state", {
      stateLength: state.length,
    });
    return new Response("Invalid OAuth state", { status: 400 });
  }
  if (oauthState.provider !== "cloudflare") {
    return new Response("Invalid OAuth state", { status: 400 });
  }

  if (oauthState.expiresAt < Date.now()) {
    await ctx.runMutation(internal.oauthState.deleteOauthState, {
      id: oauthState._id,
    });
    console.log("cloudflare:oauth:callback_state_expired", {
      organizationId: oauthState.organizationId,
      stateCreatedAt: oauthState.createdAt,
      stateExpiresAt: oauthState.expiresAt,
    });
    return new Response("OAuth state expired", { status: 400 });
  }

  let returnUrl: string;
  try {
    const githubOwnerLogin: string = await ctx.runQuery(
      internal.organizations.getExternalReturnOwnerLogin,
      {
        organizationId: oauthState.organizationId,
      },
    );
    returnUrl = buildProviderOAuthDefaultReturnUrl({
      configuredAppUrl: process.env["SITE_URL"] ?? process.env["CONVEX_SITE_URL"],
      githubOwnerLogin,
      requestUrl: request.url,
    });
  } catch {
    await ctx.runMutation(internal.oauthState.deleteOauthState, {
      id: oauthState._id,
    });
    return new Response("Organization unavailable", { status: 400 });
  }

  if (error !== null) {
    await ctx.runMutation(internal.oauthState.deleteOauthState, {
      id: oauthState._id,
    });
    return Response.redirect(returnUrl, 302);
  }

  if (code === null) {
    return new Response("Missing OAuth parameters", { status: 400 });
  }

  try {
    await ctx.runQuery(internal.organizationAccess.requireOrganizationOwnerIdForUser, {
      userId: oauthState.userId,
      organizationId: oauthState.organizationId,
    });
  } catch {
    await ctx.runMutation(internal.oauthState.deleteOauthState, {
      id: oauthState._id,
    });
    return Response.redirect(returnUrl, 302);
  }

  const clientId = readRequiredEnv("PROVIDER_CLOUDFLARE_OAUTH_CLIENT_ID");
  const clientSecret = readRequiredEnv("PROVIDER_CLOUDFLARE_OAUTH_CLIENT_SECRET");
  const redirectUri = readRequiredEnv("PROVIDER_CLOUDFLARE_OAUTH_REDIRECT_URL");

  let exchangedRefreshToken: string | undefined;
  let trackedRefreshToken: string | undefined;
  try {
    const token = await exchangeCloudflareOAuthCode({
      code,
      clientId,
      clientSecret,
      redirectUri,
    });
    exchangedRefreshToken = token.refreshToken;
    const expiresAt = Date.now() + token.expiresIn * 1000;
    const current = await ctx.runQuery(
      internal.organizationProviderCredentials.loadForOrganization,
      {
        organizationId: oauthState.organizationId,
        userId: oauthState.userId,
      },
    );
    if (current.cloudflareCredential?.auth.method === "oauth") {
      trackedRefreshToken = current.cloudflareCredential.auth.refreshCredential;
    }
    const accounts = await listCloudflareAccountsForToken({
      token: token.accessToken,
      transport: "direct",
      perPage: 100,
    });
    const account = resolveCloudflareAccountAfterAuthorization(accounts, current.cloudflareAccount);

    const storeResult: ProviderOAuthStoreResult = await ctx.runMutation(
      internal.cloudflareOAuth.storeCloudflareOauthConnection,
      {
        organizationId: oauthState.organizationId,
        connectedByUserId: oauthState.userId,
        expectedProviderSnapshotHash: oauthState.expectedProviderSnapshotHash,
        accessToken: token.accessToken,
        refreshToken: token.refreshToken,
        expiresAt,
        account,
        oauthStateId: oauthState._id,
        oauthState: state,
      },
    );
    if (storeResult.status === "access_lost") {
      if (exchangedRefreshToken !== undefined && exchangedRefreshToken !== trackedRefreshToken) {
        try {
          await revokeCloudflareOAuthGrant(exchangedRefreshToken);
        } catch {
          console.log("cloudflare:oauth:access_lost_revocation_failed", {
            organizationId: oauthState.organizationId,
          });
        }
      }
      return Response.redirect(returnUrl, 302);
    }
    exchangedRefreshToken = undefined;
    console.log("cloudflare:oauth:exchange_succeeded", {
      organizationId: oauthState.organizationId,
      expiresIn: token.expiresIn,
      expiresAt,
    });
  } catch (err) {
    let grantRevocationFailed = false;
    if (exchangedRefreshToken !== undefined && exchangedRefreshToken !== trackedRefreshToken) {
      try {
        await revokeCloudflareOAuthGrant(exchangedRefreshToken);
      } catch {
        grantRevocationFailed = true;
      }
    }
    await ctx.runMutation(internal.oauthState.deleteOauthState, {
      id: oauthState._id,
    });
    console.log("cloudflare:oauth:exchange_failed", {
      organizationId: oauthState.organizationId,
      errorName: err instanceof Error ? err.name : "UnknownError",
      grantRevocationFailed,
    });
    return new Response("Cloudflare OAuth exchange failed", { status: 400 });
  }

  const returnOrigin = new URL(returnUrl).origin;

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Cloudflare OAuth</title>
  </head>
  <body>
    <script>
      (function () {
        const returnTo = ${JSON.stringify(returnUrl)};
        const returnOrigin = ${JSON.stringify(returnOrigin)};
        try {
          if (window.opener && !window.opener.closed) {
            try {
              window.opener.location.replace(returnTo);
            } catch (error) {
              window.opener.postMessage(
                { type: "cloudflare-oauth-complete", returnTo },
                returnOrigin
              );
            }
            window.close();
            return;
          }
        } catch (error) {
          // Fall through to redirect.
        }
        window.location.replace(returnTo);
      })();
    </script>
  </body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
});
