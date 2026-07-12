import { Infer, v } from "convex/values";
import { httpAction, internalAction, internalMutation } from "./_generated/server";
import type { ActionCtx, MutationCtx } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { z } from "zod";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action } from "./functions";
import {
  createCodeChallenge,
  OAUTH_STATE_TTL_MS,
  randomToken,
  readRequiredEnv,
} from "./oauthUtils";
import { isRecord } from "./jsonUtils";
import { deriveMcpTokenStatusFromExpiry, vMcpTokenHealth } from "./mcpTokenHealth";
import { vCloudflareDefaultAccount } from "./schema";
import { buildProviderOAuthDefaultReturnUrl } from "../shared/providerOAuthReturn";
import { buildUrlWithSearchParams, createUrlSearchParams } from "../shared/urlSearchParams";

const CLOUDFLARE_MCP_OAUTH_ISSUER = "https://mcp.cloudflare.com";
const CLOUDFLARE_MCP_AUTHORIZATION_URL = `${CLOUDFLARE_MCP_OAUTH_ISSUER}/authorize`;
const CLOUDFLARE_MCP_TOKEN_URL = `${CLOUDFLARE_MCP_OAUTH_ISSUER}/token`;
const CLOUDFLARE_MCP_REGISTRATION_URL = `${CLOUDFLARE_MCP_OAUTH_ISSUER}/register`;
const DEFAULT_OAUTH_TIMEOUT_MS = 10_000;
/**
 * Samebase needs the Cloudflare MCP Code Mode scopes that cover account
 * discovery, Worker management, and Workers Builds setup without the full
 * access template.
 *
 * Cloudflare MCP scope registry:
 * https://github.com/cloudflare/mcp/blob/main/src/auth/scopes.ts
 */
export const CLOUDFLARE_MCP_OAUTH_SCOPES = [
  "user:read",
  "account:read",
  "offline_access",
  "workers:read",
  "workers:write",
  "workers_scripts:write",
  "workers_builds:read",
  "workers_builds:write",
] as const;
const CLOUDFLARE_OAUTH_ERROR_MESSAGE_KEYS = [
  "error",
  "error_description",
  "message",
  "detail",
  "statusText",
] as const;
const { boolean, id, literal, null: nullValue, number, object, optional, string, union } = v;

type OAuthContext = ActionCtx | MutationCtx;
type CloudflareOAuthTokenOperation =
  | "exchange Cloudflare OAuth code"
  | "refresh Cloudflare OAuth token";
type CloudflareMcpAuthorizeSearchParams = {
  response_type: "code";
  client_id: string;
  redirect_uri: string;
  state: string;
  code_challenge: string;
  code_challenge_method: "S256";
  scope: string;
};
type CloudflareMcpTokenExchangeSearchParams = {
  grant_type: "authorization_code";
  client_id: string;
  code: string;
  redirect_uri: string;
  code_verifier: string;
};
type CloudflareMcpTokenRefreshSearchParams = {
  grant_type: "refresh_token";
  client_id: string;
  refresh_token: string;
};
type CloudflareMcpTokenRevocationSearchParams = {
  client_id: string;
  token: string;
  token_type_hint: "refresh_token";
};
const nonEmptyString = z.string().min(1);
const cloudflareMcpClientRegistrationResponseSchema = z.object({
  client_id: nonEmptyString,
});
const cloudflareMcpTokenResponseSchema = z.object({
  access_token: nonEmptyString,
  refresh_token: nonEmptyString,
  expires_in: z.number(),
});
type CloudflareMcpTokenResponse = z.infer<typeof cloudflareMcpTokenResponseSchema>;

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

function redactCloudflareOAuthErrorDetail(value: string): string {
  return value
    .replace(
      /((?:^|[?&])(?:access_token|code|code_verifier|refresh_token|state)=)[^&\s]+/gi,
      "$1<redacted>",
    )
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "<redacted>");
}

/**
 * Formats provider-owned OAuth endpoint errors for logs without leaking
 * credentials: known message fields are deduped, OAuth-bearing values are
 * redacted, long output is bounded, and empty records return no detail.
 */
export function formatCloudflareOAuthEndpointError(payload: unknown): string | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }

  const segments: string[] = [];
  for (const key of CLOUDFLARE_OAUTH_ERROR_MESSAGE_KEYS) {
    const value = payload[key];
    if (typeof value !== "string") {
      continue;
    }
    const segment = value.trim();
    if (segment && !segments.includes(segment)) {
      segments.push(segment);
    }
  }

  if (segments.length === 0) {
    return undefined;
  }

  const detail = redactCloudflareOAuthErrorDetail(segments.join(": "));
  if (detail.length <= 240) {
    return detail;
  }
  return `${detail.slice(0, 237)}...`;
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

function parseCloudflareMcpTokenResponse(
  payload: unknown,
  operation: CloudflareOAuthTokenOperation,
): CloudflareMcpTokenResponse {
  const result = cloudflareMcpTokenResponseSchema.safeParse(payload);
  if (!result.success) {
    throw new Error(
      `Failed to ${operation}: Cloudflare token response failed schema validation: ${z.prettifyError(result.error)}`,
    );
  }
  return result.data;
}

export function buildCloudflareMcpAuthorizeSearchParams(args: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): CloudflareMcpAuthorizeSearchParams {
  return {
    response_type: "code",
    client_id: args.clientId,
    redirect_uri: args.redirectUri,
    state: args.state,
    code_challenge: args.codeChallenge,
    code_challenge_method: "S256",
    scope: CLOUDFLARE_MCP_OAUTH_SCOPES.join(" "),
  };
}

export function buildCloudflareMcpAuthorizeUrl(args: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  return buildUrlWithSearchParams(
    CLOUDFLARE_MCP_AUTHORIZATION_URL,
    buildCloudflareMcpAuthorizeSearchParams(args),
  );
}

async function registerCloudflareMcpClient(args: { redirectUri: string }) {
  const response = await fetchWithTimeout(CLOUDFLARE_MCP_REGISTRATION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      redirect_uris: [args.redirectUri],
      token_endpoint_auth_method: "none",
      response_types: ["code"],
      grant_types: ["authorization_code", "refresh_token"],
      client_name: "samebase",
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`Failed to register Cloudflare OAuth client (${response.status}).`);
  }
  const registration = cloudflareMcpClientRegistrationResponseSchema.safeParse(payload);
  if (!registration.success) {
    throw new Error(
      `Failed to register Cloudflare OAuth client: response failed schema validation: ${z.prettifyError(registration.error)}`,
    );
  }

  console.log("cloudflare:mcp_oauth:client_registered", {
    redirectUri: args.redirectUri,
    clientIdLength: registration.data.client_id.length,
  });

  return registration.data;
}

async function exchangeCloudflareMcpOAuthCode(args: {
  code: string;
  codeVerifier: string;
  clientId: string;
  redirectUri: string;
}): Promise<CloudflareMcpTokenResponse> {
  const payload = createUrlSearchParams({
    grant_type: "authorization_code",
    client_id: args.clientId,
    code: args.code,
    redirect_uri: args.redirectUri,
    code_verifier: args.codeVerifier,
  } satisfies CloudflareMcpTokenExchangeSearchParams);

  const response = await fetchWithTimeout(CLOUDFLARE_MCP_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: payload.toString(),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw formatCloudflareOAuthRequestFailure({
      operation: "exchange Cloudflare OAuth code",
      status: response.status,
      payload: data,
    });
  }

  return parseCloudflareMcpTokenResponse(data, "exchange Cloudflare OAuth code");
}

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
    message.includes("refresh token is missing") ||
    message.includes("client metadata is missing")
  );
}

async function refreshCloudflareMcpOAuthToken(args: {
  refreshToken: string;
  clientId: string;
}): Promise<CloudflareMcpTokenResponse> {
  const payload = createUrlSearchParams({
    grant_type: "refresh_token",
    client_id: args.clientId,
    refresh_token: args.refreshToken,
  } satisfies CloudflareMcpTokenRefreshSearchParams);

  const response = await fetchWithTimeout(CLOUDFLARE_MCP_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: payload.toString(),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw formatCloudflareOAuthRequestFailure({
      operation: "refresh Cloudflare OAuth token",
      status: response.status,
      payload: data,
    });
  }

  return parseCloudflareMcpTokenResponse(data, "refresh Cloudflare OAuth token");
}

export async function revokeCloudflareMcpOAuthGrant(args: {
  refreshToken: string;
  clientId: string;
}): Promise<void> {
  const payload = createUrlSearchParams({
    client_id: args.clientId,
    token: args.refreshToken,
    token_type_hint: "refresh_token",
  } satisfies CloudflareMcpTokenRevocationSearchParams);
  const response = await fetchWithTimeout(CLOUDFLARE_MCP_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: payload.toString(),
  });
  if (!response.ok) {
    throw new Error(`Failed to revoke Cloudflare MCP OAuth grant (${response.status}).`);
  }
}

async function buildCloudflareMcpOAuthUrl(ctx: OAuthContext, userId: Id<"users">): Promise<string> {
  const redirectUri = readRequiredEnv("PROVIDER_CLOUDFLARE_MCP_REDIRECT_URL");

  const state = randomToken();
  const codeVerifier = randomToken(64);
  const codeChallenge = await createCodeChallenge(codeVerifier);
  const registeredClient = await registerCloudflareMcpClient({ redirectUri });
  const clientId = registeredClient.client_id;

  const now = Date.now();
  await ctx.runMutation(internal.oauthState.createOauthState, {
    provider: "cloudflare_mcp",
    userId,
    state,
    codeVerifier,
    clientId,
    createdAt: now,
    expiresAt: now + OAUTH_STATE_TTL_MS,
  });

  console.log("cloudflare:mcp_oauth:url_built", {
    userId,
    redirectUri,
    clientIdLength: clientId.length,
    oauthStateExpiresAt: now + OAUTH_STATE_TTL_MS,
  });

  return buildCloudflareMcpAuthorizeUrl({
    clientId,
    redirectUri,
    state,
    codeChallenge,
  });
}

const storeCloudflareMcpOauthConnectionArgs = {
  userId: id("users"),
  accessToken: string(),
  refreshToken: string(),
  expiresAt: number(),
  clientId: string(),
  defaultAccount: vCloudflareDefaultAccount,
  oauthStateId: id("oauthStates"),
} as const;
const storeCloudflareMcpOauthConnectionResultValidator = nullValue();

export const storeCloudflareMcpOauthConnection = internalMutation({
  args: storeCloudflareMcpOauthConnectionArgs,
  returns: storeCloudflareMcpOauthConnectionResultValidator,
  handler: async (ctx, args) => {
    const checkedAt = Date.now();
    await ctx.runMutation(internal.providerConnections.upsertCloudflare, {
      userId: args.userId,
      auth: {
        method: "mcp_oauth",
        credential: args.accessToken,
        refreshCredential: args.refreshToken,
        credentialExpiresAt: args.expiresAt,
        clientId: args.clientId,
      },
      defaultAccount: args.defaultAccount,
      tokenHealth: {
        status: deriveMcpTokenStatusFromExpiry(args.expiresAt, checkedAt),
        checkedAt,
        expiresAt: args.expiresAt,
        source: "expiry_metadata",
      },
    });
    console.log("cloudflare:mcp_oauth:connection_stored", {
      userId: args.userId,
      clientIdLength: args.clientId.length,
      expiresAt: args.expiresAt,
    });
    await ctx.db.delete(args.oauthStateId);
    return null;
  },
});

const cloudflareMcpOauthAuthValidator = object({
  method: literal("mcp_oauth"),
  credential: string(),
  refreshCredential: string(),
  credentialExpiresAt: number(),
  clientId: string(),
});
const cloudflareOauthAuthValidator = object({
  method: literal("oauth"),
  credential: string(),
  refreshCredential: string(),
  credentialExpiresAt: number(),
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
const getCloudflareMcpOAuthUrlResultValidator = string();
type ResolvedCloudflareConnection = Infer<typeof resolvedCloudflareConnectionValidator>;

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

    if (connection.auth.method !== "mcp_oauth") {
      return {
        auth: connection.auth,
        defaultAccount: connection.defaultAccount,
      };
    }

    const expiresAt = connection.auth.credentialExpiresAt;
    const checkedAt = Date.now();
    const derivedTokenHealth: Infer<typeof vMcpTokenHealth> = {
      status: deriveMcpTokenStatusFromExpiry(expiresAt, checkedAt),
      checkedAt,
      expiresAt,
      source: "expiry_metadata",
    };
    const effectiveTokenHealth = connection.tokenHealth ?? derivedTokenHealth;
    const shouldRefresh =
      args.forceRefresh === true ||
      derivedTokenHealth.status === "expiring_soon" ||
      derivedTokenHealth.status === "expired";
    console.log("cloudflare:mcp_token:status_query", {
      userId: args.userId,
      forceRefresh: args.forceRefresh === true,
      derivedStatus: derivedTokenHealth.status,
      effectiveStatus: effectiveTokenHealth.status,
      expiresAt,
      checkedAt,
      hasStoredTokenHealth: connection.tokenHealth !== undefined,
      shouldRefresh,
    });
    if (!shouldRefresh) {
      return {
        auth: connection.auth,
        defaultAccount: connection.defaultAccount,
        tokenHealth: effectiveTokenHealth,
      };
    }

    const refreshToken = connection.auth.refreshCredential.trim();
    if (!refreshToken) {
      const message = "Cloudflare OAuth refresh token is empty. Reconnect Cloudflare and retry.";
      const tokenHealth: Infer<typeof vMcpTokenHealth> = {
        status: "invalid",
        checkedAt: Date.now(),
        expiresAt,
        source: "refresh_attempt",
        errorMessage: message,
      };
      await ctx.runMutation(internal.providerConnections.upsertCloudflare, {
        userId: args.userId,
        auth: connection.auth,
        defaultAccount: connection.defaultAccount,
        tokenHealth,
      });
      console.log("cloudflare:mcp_token:refresh_failed", {
        userId: args.userId,
        reason: "empty_refresh_token",
        derivedStatus: derivedTokenHealth.status,
        expiresAt,
      });
      throw new Error(message);
    }

    const clientId = connection.auth.clientId.trim();
    if (!clientId) {
      const message = "Cloudflare OAuth client ID is empty. Reconnect Cloudflare and retry.";
      const tokenHealth: Infer<typeof vMcpTokenHealth> = {
        status: "invalid",
        checkedAt: Date.now(),
        expiresAt,
        source: "refresh_attempt",
        errorMessage: message,
      };
      await ctx.runMutation(internal.providerConnections.upsertCloudflare, {
        userId: args.userId,
        auth: connection.auth,
        defaultAccount: connection.defaultAccount,
        tokenHealth,
      });
      console.log("cloudflare:mcp_token:refresh_failed", {
        userId: args.userId,
        reason: "empty_client_metadata",
        derivedStatus: derivedTokenHealth.status,
        expiresAt,
      });
      throw new Error(message);
    }

    console.log("cloudflare:mcp_token:refresh_start", {
      userId: args.userId,
      derivedStatus: derivedTokenHealth.status,
      expiresAt,
      clientIdLength: clientId.length,
    });

    let refreshed: Awaited<ReturnType<typeof refreshCloudflareMcpOAuthToken>>;
    try {
      refreshed = await refreshCloudflareMcpOAuthToken({
        refreshToken,
        clientId,
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
      console.log("cloudflare:mcp_token:refresh_failed", {
        userId: args.userId,
        reason: "refresh_request_failed",
        derivedStatus: derivedTokenHealth.status,
        expiresAt,
        invalidToken,
        clientIdLength: clientId.length,
        errorMessage: tokenHealth.errorMessage,
      });
      await ctx.runMutation(internal.providerConnections.upsertCloudflare, {
        userId: args.userId,
        auth: connection.auth,
        defaultAccount: connection.defaultAccount,
        tokenHealth,
      });
      throw error;
    }
    const nextExpiresAt = Date.now() + refreshed.expires_in * 1000;
    const refreshedAuth: Infer<typeof cloudflareMcpOauthAuthValidator> = {
      method: "mcp_oauth",
      credential: refreshed.access_token,
      refreshCredential: refreshed.refresh_token,
      credentialExpiresAt: nextExpiresAt,
      clientId,
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
    console.log("cloudflare:mcp_token:refresh_success", {
      userId: args.userId,
      previousExpiresAt: expiresAt,
      nextExpiresAt,
      clientIdLength: clientId.length,
    });

    return {
      auth: refreshedAuth,
      defaultAccount: connection.defaultAccount,
      tokenHealth: refreshedTokenHealth,
    };
  },
});

export const getCloudflareMcpOAuthUrl = action({
  access: "access_provider_connections",
  args: {},
  returns: getCloudflareMcpOAuthUrlResultValidator,
  handler: async (ctx) => {
    return await buildCloudflareMcpOAuthUrl(ctx, ctx.viewer.userId);
  },
});

export const startCloudflareMcpOAuth = httpAction(async (ctx) => {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }
  const authorizeUrl = await buildCloudflareMcpOAuthUrl(ctx, userId);
  return Response.redirect(authorizeUrl, 302);
});

export const finishCloudflareMcpOAuth = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (error) {
    console.log("cloudflare:mcp_oauth:callback_provider_error", {
      statePresent: state !== null,
      error,
      errorDescription: errorDescription ?? undefined,
    });
    if (state) {
      const oauthState = await ctx.runQuery(internal.oauthState.getOauthStateByState, {
        provider: "cloudflare_mcp",
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
    console.log("cloudflare:mcp_oauth:callback_missing_params", {
      hasCode: code !== null,
      hasState: state !== null,
    });
    return new Response("Missing OAuth parameters", { status: 400 });
  }

  const oauthState = await ctx.runQuery(internal.oauthState.getOauthStateByState, {
    provider: "cloudflare_mcp",
    state,
  });

  if (!oauthState) {
    console.log("cloudflare:mcp_oauth:callback_invalid_state", {
      stateLength: state.length,
    });
    return new Response("Invalid OAuth state", { status: 400 });
  }

  if (oauthState.expiresAt < Date.now()) {
    await ctx.runMutation(internal.oauthState.deleteOauthState, {
      id: oauthState._id,
    });
    console.log("cloudflare:mcp_oauth:callback_state_expired", {
      userId: oauthState.userId,
      stateCreatedAt: oauthState.createdAt,
      stateExpiresAt: oauthState.expiresAt,
    });
    return new Response("OAuth state expired", { status: 400 });
  }

  const clientId = oauthState.clientId;
  const codeVerifier = oauthState.codeVerifier;
  if (!clientId || !codeVerifier) {
    await ctx.runMutation(internal.oauthState.deleteOauthState, {
      id: oauthState._id,
    });
    console.log("cloudflare:mcp_oauth:callback_missing_pkce", {
      userId: oauthState.userId,
      hasClientId: !!clientId,
      hasCodeVerifier: !!codeVerifier,
    });
    return new Response("OAuth state is missing PKCE parameters", {
      status: 400,
    });
  }

  const redirectUri = readRequiredEnv("PROVIDER_CLOUDFLARE_MCP_REDIRECT_URL");

  try {
    const token = await exchangeCloudflareMcpOAuthCode({
      code,
      codeVerifier,
      clientId,
      redirectUri,
    });

    const expiresAt = Date.now() + token.expires_in * 1000;
    const defaultAccount = await ctx.runAction(
      internal.cloudflareAccountDiscovery.resolveDefaultAccountForToken,
      {
        token: token.access_token,
        transport: "mcp",
      },
    );

    await ctx.runMutation(internal.cloudflareMcpOAuth.storeCloudflareMcpOauthConnection, {
      userId: oauthState.userId,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt,
      clientId,
      defaultAccount,
      oauthStateId: oauthState._id,
    });
    console.log("cloudflare:mcp_oauth:exchange_succeeded", {
      userId: oauthState.userId,
      expiresIn: token.expires_in,
      expiresAt,
      clientIdLength: clientId.length,
    });
  } catch (err) {
    await ctx.runMutation(internal.oauthState.deleteOauthState, {
      id: oauthState._id,
    });
    const message = err instanceof Error ? err.message : String(err);
    console.log("cloudflare:mcp_oauth:exchange_failed", {
      userId: oauthState.userId,
      clientIdLength: clientId.length,
      hasCodeVerifier: codeVerifier.length > 0,
      message,
    });
    return new Response("Cloudflare OAuth exchange failed", { status: 400 });
  }

  const returnUrl = buildProviderOAuthDefaultReturnUrl({
    configuredAppUrl: process.env.SITE_URL ?? process.env.CONVEX_SITE_URL,
    requestUrl: request.url,
  });
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
              window.opener.postMessage({ type: "cloudflare-mcp-oauth-complete" }, returnOrigin);
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
