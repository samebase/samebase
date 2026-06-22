import { Infer, v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { z } from "zod";

import { internal } from "./_generated/api";
import { httpAction, internalAction, internalMutation } from "./_generated/server";
import type { ActionCtx, MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { action } from "./functions";
import { formatCloudflareOAuthEndpointError } from "./cloudflareMcpOAuth";
import { deriveMcpTokenStatusFromExpiry, vMcpTokenHealth } from "./mcpTokenHealth";
import { OAUTH_STATE_TTL_MS, randomToken, readRequiredEnv } from "./oauthUtils";
import { vCloudflareDefaultAccount } from "./schema";
import { utf8ToBase64 } from "../shared/base64";
import { buildUrlWithSearchParams, createUrlSearchParams } from "../shared/urlSearchParams";

const CLOUDFLARE_OAUTH_AUTHORIZATION_URL = "https://dash.cloudflare.com/oauth2/auth";
const CLOUDFLARE_OAUTH_TOKEN_URL = "https://dash.cloudflare.com/oauth2/token";
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

async function buildCloudflareOAuthUrl(ctx: OAuthContext, userId: Id<"users">): Promise<string> {
  const clientId = readRequiredEnv("PROVIDER_CLOUDFLARE_OAUTH_CLIENT_ID");
  const redirectUri = readRequiredEnv("PROVIDER_CLOUDFLARE_OAUTH_REDIRECT_URL");
  const state = randomToken();
  const now = Date.now();

  await ctx.runMutation(internal.oauthState.createOauthState, {
    provider: "cloudflare",
    userId,
    state,
    createdAt: now,
    expiresAt: now + OAUTH_STATE_TTL_MS,
  });

  console.log("cloudflare:oauth:url_built", {
    userId,
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
  userId: id("users"),
  accessToken: string(),
  refreshToken: string(),
  expiresAt: number(),
  defaultAccount: vCloudflareDefaultAccount,
  oauthStateId: id("oauthStates"),
} as const;

export const storeCloudflareOauthConnection = internalMutation({
  args: storeCloudflareOauthConnectionArgs,
  returns: nullValue(),
  handler: async (ctx, args) => {
    const checkedAt = Date.now();
    await ctx.runMutation(internal.providerConnections.upsertCloudflare, {
      userId: args.userId,
      auth: {
        method: "oauth",
        credential: args.accessToken,
        refreshCredential: args.refreshToken,
        credentialExpiresAt: args.expiresAt,
      },
      defaultAccount: args.defaultAccount,
      tokenHealth: {
        status: deriveMcpTokenStatusFromExpiry(args.expiresAt, checkedAt),
        checkedAt,
        expiresAt: args.expiresAt,
        source: "expiry_metadata",
      },
    });
    console.log("cloudflare:oauth:connection_stored", {
      userId: args.userId,
      expiresAt: args.expiresAt,
    });
    await ctx.db.delete(args.oauthStateId);
    return null;
  },
});

const cloudflareOauthAuthValidator = object({
  method: literal("oauth"),
  credential: string(),
  refreshCredential: optional(string()),
  credentialExpiresAt: optional(number()),
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
  defaultAccount: vCloudflareDefaultAccount,
  tokenHealth: optional(vMcpTokenHealth),
});
const resolveConnectionForUserResultValidator = union(
  resolvedCloudflareConnectionValidator,
  nullValue(),
);
type ResolvedCloudflareConnection = Infer<typeof resolvedCloudflareConnectionValidator>;

function sanitizeTokenHealthError(error: unknown): string | undefined {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const trimmed = rawMessage.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  if (trimmed.length <= 160) {
    return trimmed;
  }
  return `${trimmed.slice(0, 157)}...`;
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

export const resolveConnectionForUser = internalAction({
  args: {
    userId: id("users"),
    forceRefresh: optional(boolean()),
  },
  returns: resolveConnectionForUserResultValidator,
  handler: async (ctx, args): Promise<ResolvedCloudflareConnection | null> => {
    const connection = await ctx.runQuery(internal.providerConnections.getByUserAndKind, {
      userId: args.userId,
      kind: "cloudflare",
    });
    if (connection?.kind !== "cloudflare") {
      return null;
    }

    if (connection.auth.method === "mcp_oauth") {
      return await ctx.runAction(internal.cloudflareMcpOAuth.resolveConnectionForUser, args);
    }
    if (connection.auth.method !== "oauth") {
      return {
        auth: connection.auth,
        defaultAccount: connection.defaultAccount,
      };
    }

    const expiresAt = connection.auth.credentialExpiresAt;
    const checkedAt = Date.now();
    const derivedTokenHealth =
      typeof expiresAt === "number"
        ? {
            status: deriveMcpTokenStatusFromExpiry(expiresAt, checkedAt),
            checkedAt,
            expiresAt,
            source: "expiry_metadata" as const,
          }
        : undefined;
    const effectiveTokenHealth = connection.tokenHealth ?? derivedTokenHealth;
    const shouldRefresh =
      args.forceRefresh === true ||
      derivedTokenHealth?.status === "expiring_soon" ||
      derivedTokenHealth?.status === "expired";
    if (!shouldRefresh) {
      return {
        auth: connection.auth,
        defaultAccount: connection.defaultAccount,
        ...(effectiveTokenHealth ? { tokenHealth: effectiveTokenHealth } : {}),
      };
    }

    const refreshToken = connection.auth.refreshCredential?.trim();
    if (!refreshToken) {
      const message = "Cloudflare OAuth refresh token is empty. Reconnect Cloudflare and retry.";
      const tokenHealth: Infer<typeof vMcpTokenHealth> = {
        status: "invalid",
        checkedAt: Date.now(),
        ...(typeof expiresAt === "number" ? { expiresAt } : {}),
        source: "refresh_attempt",
        errorMessage: message,
      };
      await ctx.runMutation(internal.providerConnections.upsertCloudflare, {
        userId: args.userId,
        auth: connection.auth,
        defaultAccount: connection.defaultAccount,
        tokenHealth,
      });
      throw new Error(message);
    }

    const clientId = readRequiredEnv("PROVIDER_CLOUDFLARE_OAUTH_CLIENT_ID");
    const clientSecret = readRequiredEnv("PROVIDER_CLOUDFLARE_OAUTH_CLIENT_SECRET");
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
        status: invalidToken ? "invalid" : (derivedTokenHealth?.status ?? "unknown"),
        checkedAt: Date.now(),
        ...(typeof expiresAt === "number" ? { expiresAt } : {}),
        source: invalidToken ? "refresh_attempt" : "runtime_error",
        errorMessage: sanitizeTokenHealthError(error),
      };
      await ctx.runMutation(internal.providerConnections.upsertCloudflare, {
        userId: args.userId,
        auth: connection.auth,
        defaultAccount: connection.defaultAccount,
        tokenHealth,
      });
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

    await ctx.runMutation(internal.providerConnections.upsertCloudflare, {
      userId: args.userId,
      auth: refreshedAuth,
      defaultAccount: connection.defaultAccount,
      tokenHealth: refreshedTokenHealth,
    });

    return {
      auth: refreshedAuth,
      defaultAccount: connection.defaultAccount,
      tokenHealth: refreshedTokenHealth,
    };
  },
});

export const getCloudflareOAuthUrl = action({
  access: "access_provider_connections",
  args: {},
  returns: string(),
  handler: async (ctx) => {
    return await buildCloudflareOAuthUrl(ctx, ctx.viewer.userId);
  },
});

export const startCloudflareOAuth = httpAction(async (ctx) => {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }
  const authorizeUrl = await buildCloudflareOAuthUrl(ctx, userId);
  return Response.redirect(authorizeUrl, 302);
});

export const finishCloudflareOAuth = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (error) {
    console.log("cloudflare:oauth:callback_provider_error", {
      statePresent: state !== null,
      error,
      errorDescription: errorDescription ?? undefined,
    });
    if (state) {
      const oauthState = await ctx.runQuery(internal.oauthState.getOauthStateByState, {
        provider: "cloudflare",
        state,
      });
      if (oauthState) {
        await ctx.runMutation(internal.oauthState.deleteOauthState, {
          id: oauthState._id,
        });
      }
    }
    return new Response(`Cloudflare OAuth error: ${errorDescription ?? error}`, { status: 400 });
  }

  if (!code || !state) {
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

  if (oauthState.expiresAt < Date.now()) {
    await ctx.runMutation(internal.oauthState.deleteOauthState, {
      id: oauthState._id,
    });
    console.log("cloudflare:oauth:callback_state_expired", {
      userId: oauthState.userId,
      stateCreatedAt: oauthState.createdAt,
      stateExpiresAt: oauthState.expiresAt,
    });
    return new Response("OAuth state expired", { status: 400 });
  }

  const clientId = readRequiredEnv("PROVIDER_CLOUDFLARE_OAUTH_CLIENT_ID");
  const clientSecret = readRequiredEnv("PROVIDER_CLOUDFLARE_OAUTH_CLIENT_SECRET");
  const redirectUri = readRequiredEnv("PROVIDER_CLOUDFLARE_OAUTH_REDIRECT_URL");

  try {
    const token = await exchangeCloudflareOAuthCode({
      code,
      clientId,
      clientSecret,
      redirectUri,
    });
    const expiresAt = Date.now() + token.expiresIn * 1000;
    const defaultAccount = await ctx.runAction(
      internal.cloudflareAccountDiscovery.resolveDefaultAccountForToken,
      {
        token: token.accessToken,
        transport: "direct",
      },
    );

    await ctx.runMutation(internal.cloudflareOAuth.storeCloudflareOauthConnection, {
      userId: oauthState.userId,
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      expiresAt,
      defaultAccount,
      oauthStateId: oauthState._id,
    });
    console.log("cloudflare:oauth:exchange_succeeded", {
      userId: oauthState.userId,
      expiresIn: token.expiresIn,
      expiresAt,
    });
  } catch (err) {
    await ctx.runMutation(internal.oauthState.deleteOauthState, {
      id: oauthState._id,
    });
    const message = err instanceof Error ? err.message : String(err);
    console.log("cloudflare:oauth:exchange_failed", {
      userId: oauthState.userId,
      message,
    });
    return new Response("Cloudflare OAuth exchange failed", { status: 400 });
  }

  const returnTo =
    process.env.SITE_URL ?? process.env.CONVEX_SITE_URL ?? new URL(request.url).origin;
  const baseOrigin = new URL(request.url).origin;
  const returnUrl = new URL(returnTo, baseOrigin).toString();
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
              window.opener.location.reload();
            } catch (error) {
              window.opener.postMessage({ type: "cloudflare-oauth-complete" }, returnOrigin);
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
