import { Infer, v } from "convex/values";
import {
  action,
  httpAction,
  internalAction,
  internalMutation,
} from "./_generated/server";
import type { ActionCtx, MutationCtx } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  createCodeChallenge,
  OAUTH_STATE_TTL_MS,
  randomToken,
  readRequiredEnv,
} from "./oauthUtils";
import { asRecord, readNumber, readString } from "./jsonUtils";
import {
  deriveMcpTokenStatusFromExpiry,
  vMcpTokenHealth,
} from "./mcpTokenHealth";

const CLOUDFLARE_MCP_OAUTH_ISSUER = "https://mcp.cloudflare.com";
const CLOUDFLARE_MCP_AUTHORIZATION_URL = `${CLOUDFLARE_MCP_OAUTH_ISSUER}/authorize`;
const CLOUDFLARE_MCP_TOKEN_URL = `${CLOUDFLARE_MCP_OAUTH_ISSUER}/token`;
const CLOUDFLARE_MCP_REGISTRATION_URL = `${CLOUDFLARE_MCP_OAUTH_ISSUER}/register`;
const CLOUDFLARE_MCP_SERVER_URL = `${CLOUDFLARE_MCP_OAUTH_ISSUER}/mcp`;
const DEFAULT_OAUTH_TIMEOUT_MS = 10_000;
const {
  boolean,
  id,
  literal,
  null: nullValue,
  number,
  object,
  optional,
  string,
  union,
} = v;

type OAuthContext = ActionCtx | MutationCtx;

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
      throw new Error(
        `Cloudflare OAuth request timed out after ${timeoutMs}ms.`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function registerCloudflareMcpClient(args: {
  redirectUri: string;
}): Promise<{ clientId: string }> {
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
      client_name: "noter",
    }),
  });

  const payload = await response.json().catch(() => null);
  const record = asRecord(payload);
  const clientId = readString(record, "client_id");

  if (!response.ok || !clientId) {
    throw new Error(
      `Failed to register Cloudflare OAuth client (${response.status}).`,
    );
  }

  logCloudflareMcpEvent("cloudflare:mcp_oauth:client_registered", {
    redirectUri: args.redirectUri,
    clientIdLength: clientId.length,
  });

  return { clientId };
}

async function exchangeCloudflareMcpOAuthCode(args: {
  code: string;
  codeVerifier: string;
  clientId: string;
  redirectUri: string;
}): Promise<{
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
}> {
  const payload = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: args.clientId,
    code: args.code,
    redirect_uri: args.redirectUri,
    code_verifier: args.codeVerifier,
  });

  const response = await fetchWithTimeout(CLOUDFLARE_MCP_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: payload.toString(),
  });

  const data = await response.json().catch(() => null);
  const record = asRecord(data);
  const accessToken = readString(record, "access_token");

  if (!response.ok || !accessToken) {
    throw new Error(
      `Failed to exchange Cloudflare OAuth code (${response.status}).`,
    );
  }

  return {
    accessToken,
    refreshToken: readString(record, "refresh_token"),
    expiresIn: readNumber(record, "expires_in"),
  };
}

function logCloudflareMcpEvent(
  event: string,
  fields: Record<string, unknown>,
): void {
  console.log(event, fields);
}

export function resolveCloudflareMcpRefreshClient(args: {
  clientId?: string;
}): { clientId: string | null; source: "stored_auth" | "missing" } {
  const clientId = args.clientId?.trim() ?? "";
  if (clientId.length > 0) {
    return { clientId, source: "stored_auth" };
  }
  return { clientId: null, source: "missing" };
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
  const message = (error instanceof Error ? error.message : String(error))
    .toLowerCase()
    .trim();
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
}): Promise<{
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
}> {
  const payload = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: args.clientId,
    refresh_token: args.refreshToken,
  });

  const response = await fetchWithTimeout(CLOUDFLARE_MCP_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: payload.toString(),
  });

  const data = await response.json().catch(() => null);
  const record = asRecord(data);
  const accessToken = readString(record, "access_token");

  if (!response.ok || !accessToken) {
    throw new Error(
      `Failed to refresh Cloudflare OAuth token (${response.status}).`,
    );
  }

  return {
    accessToken,
    refreshToken: readString(record, "refresh_token"),
    expiresIn: readNumber(record, "expires_in"),
  };
}

async function buildCloudflareMcpOAuthUrl(
  ctx: OAuthContext,
  userId: Id<"users">,
): Promise<string> {
  const redirectUri = readRequiredEnv("PROVIDER_CLOUDFLARE_MCP_REDIRECT_URL");

  const state = randomToken();
  const codeVerifier = randomToken(64);
  const codeChallenge = await createCodeChallenge(codeVerifier);
  const { clientId } = await registerCloudflareMcpClient({ redirectUri });

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

  logCloudflareMcpEvent("cloudflare:mcp_oauth:url_built", {
    userId,
    redirectUri,
    clientIdLength: clientId.length,
    oauthStateExpiresAt: now + OAUTH_STATE_TTL_MS,
  });

  const authorizeUrl = new URL(CLOUDFLARE_MCP_AUTHORIZATION_URL);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("code_challenge", codeChallenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");

  return authorizeUrl.toString();
}

const storeCloudflareMcpOauthConnectionArgs = {
  userId: id("users"),
  accessToken: string(),
  refreshToken: optional(string()),
  expiresAt: optional(number()),
  clientId: string(),
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
        mcpServerUrl: CLOUDFLARE_MCP_SERVER_URL,
      },
      accountId: undefined,
      tokenHealth: {
        status: deriveMcpTokenStatusFromExpiry(args.expiresAt, checkedAt),
        checkedAt,
        expiresAt: args.expiresAt,
        source: "expiry_metadata",
      },
    });
    logCloudflareMcpEvent("cloudflare:mcp_oauth:connection_stored", {
      userId: args.userId,
      clientIdLength: args.clientId.length,
      expiresAt: args.expiresAt,
      hasRefreshToken: typeof args.refreshToken === "string",
    });
    await ctx.db.delete(args.oauthStateId);
    return null;
  },
});

const cloudflareMcpOauthAuthValidator = object({
  method: literal("mcp_oauth"),
  credential: string(),
  refreshCredential: optional(string()),
  credentialExpiresAt: optional(number()),
  clientId: optional(string()),
  mcpServerUrl: string(),
});
const cloudflareApiKeyAuthValidator = object({
  method: literal("api_key"),
  credential: string(),
  credentialExpiresAt: optional(number()),
});
const resolvedCloudflareConnectionValidator = object({
  auth: union(cloudflareMcpOauthAuthValidator, cloudflareApiKeyAuthValidator),
  accountId: optional(string()),
  tokenHealth: optional(vMcpTokenHealth),
});
const resolveConnectionForUserResultValidator = union(
  resolvedCloudflareConnectionValidator,
  nullValue(),
);
const getCloudflareMcpOAuthUrlResultValidator = string();
type ResolvedCloudflareConnection = Infer<
  typeof resolvedCloudflareConnectionValidator
>;

export const resolveConnectionForUser = internalAction({
  args: {
    userId: id("users"),
    forceRefresh: optional(boolean()),
  },
  returns: resolveConnectionForUserResultValidator,
  handler: async (ctx, args): Promise<ResolvedCloudflareConnection | null> => {
    const connection = await ctx.runQuery(
      internal.providerConnections.getByUserAndKind,
      {
        userId: args.userId,
        kind: "cloudflare",
      },
    );
    if (connection?.kind !== "cloudflare") {
      return null;
    }

    if (connection.auth.method !== "mcp_oauth") {
      return {
        auth: connection.auth,
        accountId: connection.accountId,
      };
    }

    const expiresAt = connection.auth.credentialExpiresAt;
    const checkedAt = Date.now();
    const refreshClient = resolveCloudflareMcpRefreshClient({
      clientId: connection.auth.clientId,
    });
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
    logCloudflareMcpEvent("cloudflare:mcp_token:status_query", {
      userId: args.userId,
      forceRefresh: args.forceRefresh === true,
      derivedStatus: derivedTokenHealth.status,
      effectiveStatus: effectiveTokenHealth.status,
      expiresAt,
      checkedAt,
      hasStoredTokenHealth: connection.tokenHealth !== undefined,
      shouldRefresh,
      hasStoredClientId: refreshClient.source === "stored_auth",
    });
    if (!shouldRefresh) {
      return {
        auth: connection.auth,
        accountId: connection.accountId,
        tokenHealth: effectiveTokenHealth,
      };
    }

    const refreshToken = connection.auth.refreshCredential?.trim() ?? "";
    if (!refreshToken) {
      const message =
        "Cloudflare OAuth refresh token is missing. Reconnect Cloudflare and retry.";
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
        accountId: connection.accountId,
        tokenHealth,
      });
      logCloudflareMcpEvent("cloudflare:mcp_token:refresh_failed", {
        userId: args.userId,
        reason: "missing_refresh_token",
        derivedStatus: derivedTokenHealth.status,
        expiresAt,
      });
      throw new Error(message);
    }

    const clientId = refreshClient.clientId;
    const clientIdSource = refreshClient.source;
    if (!clientId) {
      const message =
        "Cloudflare OAuth client ID is missing. Reconnect Cloudflare and retry.";
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
        accountId: connection.accountId,
        tokenHealth,
      });
      logCloudflareMcpEvent("cloudflare:mcp_token:refresh_failed", {
        userId: args.userId,
        reason: "missing_client_metadata",
        derivedStatus: derivedTokenHealth.status,
        expiresAt,
        clientIdSource,
      });
      throw new Error(message);
    }

    logCloudflareMcpEvent("cloudflare:mcp_token:refresh_start", {
      userId: args.userId,
      derivedStatus: derivedTokenHealth.status,
      expiresAt,
      clientIdSource,
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
      logCloudflareMcpEvent("cloudflare:mcp_token:refresh_failed", {
        userId: args.userId,
        reason: "refresh_request_failed",
        derivedStatus: derivedTokenHealth.status,
        expiresAt,
        invalidToken,
        clientIdSource,
        errorMessage: tokenHealth.errorMessage,
      });
      await ctx.runMutation(internal.providerConnections.upsertCloudflare, {
        userId: args.userId,
        auth: connection.auth,
        accountId: connection.accountId,
        tokenHealth,
      });
      throw error;
    }
    const nextExpiresAt =
      typeof refreshed.expiresIn === "number"
        ? Date.now() + refreshed.expiresIn * 1000
        : undefined;
    const refreshedAuth: Infer<typeof cloudflareMcpOauthAuthValidator> = {
      method: "mcp_oauth",
      credential: refreshed.accessToken,
      refreshCredential:
        refreshed.refreshToken ?? connection.auth.refreshCredential,
      credentialExpiresAt: nextExpiresAt,
      clientId,
      mcpServerUrl: connection.auth.mcpServerUrl,
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
      accountId: connection.accountId,
      tokenHealth: refreshedTokenHealth,
    });
    logCloudflareMcpEvent("cloudflare:mcp_token:refresh_success", {
      userId: args.userId,
      previousExpiresAt: expiresAt,
      nextExpiresAt,
      clientIdSource,
      returnedRefreshToken: refreshed.refreshToken !== undefined,
    });

    return {
      auth: refreshedAuth,
      accountId: connection.accountId,
      tokenHealth: refreshedTokenHealth,
    };
  },
});

export const getCloudflareMcpOAuthUrl = action({
  args: {},
  returns: getCloudflareMcpOAuthUrlResultValidator,
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("User not authenticated");
    }
    return await buildCloudflareMcpOAuthUrl(ctx, userId);
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
    logCloudflareMcpEvent("cloudflare:mcp_oauth:callback_provider_error", {
      statePresent: state !== null,
      error,
      errorDescription: errorDescription ?? undefined,
    });
    if (state) {
      const oauthState = await ctx.runQuery(
        internal.oauthState.getOauthStateByState,
        {
          provider: "cloudflare_mcp",
          state,
        },
      );
      if (oauthState) {
        await ctx.runMutation(internal.oauthState.deleteOauthState, {
          id: oauthState._id,
        });
      }
    }
    return new Response(
      `Cloudflare OAuth error: ${errorDescription ?? error}`,
      { status: 400 },
    );
  }

  if (!code || !state) {
    logCloudflareMcpEvent("cloudflare:mcp_oauth:callback_missing_params", {
      hasCode: code !== null,
      hasState: state !== null,
    });
    return new Response("Missing OAuth parameters", { status: 400 });
  }

  const oauthState = await ctx.runQuery(
    internal.oauthState.getOauthStateByState,
    {
      provider: "cloudflare_mcp",
      state,
    },
  );

  if (!oauthState) {
    logCloudflareMcpEvent("cloudflare:mcp_oauth:callback_invalid_state", {
      stateLength: state.length,
    });
    return new Response("Invalid OAuth state", { status: 400 });
  }

  if (oauthState.expiresAt < Date.now()) {
    await ctx.runMutation(internal.oauthState.deleteOauthState, {
      id: oauthState._id,
    });
    logCloudflareMcpEvent("cloudflare:mcp_oauth:callback_state_expired", {
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
    logCloudflareMcpEvent("cloudflare:mcp_oauth:callback_missing_pkce", {
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

    const expiresAt =
      typeof token.expiresIn === "number"
        ? Date.now() + token.expiresIn * 1000
        : undefined;

    await ctx.runMutation(
      internal.cloudflareMcpOAuth.storeCloudflareMcpOauthConnection,
      {
        userId: oauthState.userId,
        accessToken: token.accessToken,
        refreshToken: token.refreshToken,
        expiresAt,
        clientId,
        oauthStateId: oauthState._id,
      },
    );
    logCloudflareMcpEvent("cloudflare:mcp_oauth:exchange_succeeded", {
      userId: oauthState.userId,
      expiresIn: token.expiresIn,
      expiresAt,
      clientIdLength: clientId.length,
      hasRefreshToken: typeof token.refreshToken === "string",
    });
  } catch (err) {
    await ctx.runMutation(internal.oauthState.deleteOauthState, {
      id: oauthState._id,
    });
    const message = err instanceof Error ? err.message : String(err);
    logCloudflareMcpEvent("cloudflare:mcp_oauth:exchange_failed", {
      userId: oauthState.userId,
      clientIdLength: clientId.length,
      hasCodeVerifier: codeVerifier.length > 0,
      message,
    });
    return new Response("Cloudflare OAuth exchange failed", { status: 400 });
  }

  const returnTo =
    process.env.SITE_URL ??
    process.env.CONVEX_SITE_URL ??
    new URL(request.url).origin;
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
