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

const CLOUDFLARE_MCP_OAUTH_ISSUER = "https://mcp.cloudflare.com";
const CLOUDFLARE_MCP_AUTHORIZATION_URL = `${CLOUDFLARE_MCP_OAUTH_ISSUER}/authorize`;
const CLOUDFLARE_MCP_TOKEN_URL = `${CLOUDFLARE_MCP_OAUTH_ISSUER}/token`;
const CLOUDFLARE_MCP_REGISTRATION_URL = `${CLOUDFLARE_MCP_OAUTH_ISSUER}/register`;
const CLOUDFLARE_MCP_SERVER_URL = `${CLOUDFLARE_MCP_OAUTH_ISSUER}/mcp`;
const DEFAULT_OAUTH_TIMEOUT_MS = 10_000;
const MCP_EXPIRING_SOON_MS = 15 * 60 * 1000;

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
      `Failed to register Cloudflare MCP OAuth client (${response.status}).`,
    );
  }

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

function parseCloudflareMcpClientId(token: string): string | null {
  const prefix = token.split(":", 1)[0]?.trim() ?? "";
  return prefix.length > 0 ? prefix : null;
}

function deriveMcpTokenStatusFromExpiry(
  expiresAt: number | undefined,
  now: number = Date.now(),
): "valid" | "expiring_soon" | "expired" | "unknown" {
  if (typeof expiresAt !== "number") {
    return "unknown";
  }
  if (expiresAt <= now) {
    return "expired";
  }
  if (expiresAt <= now + MCP_EXPIRING_SOON_MS) {
    return "expiring_soon";
  }
  return "valid";
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
    message.includes("unauthorized") ||
    message.includes("invalid_token") ||
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
  userId: v.id("users"),
  accessToken: v.string(),
  refreshToken: v.optional(v.string()),
  expiresAt: v.optional(v.number()),
  oauthStateId: v.id("oauthStates"),
} as const;

export const storeCloudflareMcpOauthConnection = internalMutation({
  args: storeCloudflareMcpOauthConnectionArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    const checkedAt = Date.now();
    await ctx.runMutation(internal.providerConnections.upsertCloudflare, {
      userId: args.userId,
      auth: {
        method: "mcp_oauth",
        credential: args.accessToken,
        refreshCredential: args.refreshToken,
        credentialExpiresAt: args.expiresAt,
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
    await ctx.db.delete(args.oauthStateId);
    return null;
  },
});

const cloudflareMcpOauthAuthValidator = v.object({
  method: v.literal("mcp_oauth"),
  credential: v.string(),
  refreshCredential: v.optional(v.string()),
  credentialExpiresAt: v.optional(v.number()),
  mcpServerUrl: v.string(),
});
const cloudflareApiKeyAuthValidator = v.object({
  method: v.literal("api_key"),
  credential: v.string(),
  credentialExpiresAt: v.optional(v.number()),
});
const mcpTokenHealthStatusValidator = v.union(
  v.literal("valid"),
  v.literal("expiring_soon"),
  v.literal("expired"),
  v.literal("invalid"),
  v.literal("unknown"),
);
const mcpTokenHealthSourceValidator = v.union(
  v.literal("expiry_metadata"),
  v.literal("refresh_attempt"),
  v.literal("active_probe"),
  v.literal("runtime_error"),
);
const mcpTokenHealthValidator = v.object({
  status: mcpTokenHealthStatusValidator,
  checkedAt: v.number(),
  expiresAt: v.optional(v.number()),
  source: mcpTokenHealthSourceValidator,
  errorMessage: v.optional(v.string()),
});
const resolvedCloudflareConnectionValidator = v.object({
  auth: v.union(cloudflareMcpOauthAuthValidator, cloudflareApiKeyAuthValidator),
  accountId: v.optional(v.string()),
  tokenHealth: v.optional(mcpTokenHealthValidator),
});
type ResolvedCloudflareConnection = Infer<
  typeof resolvedCloudflareConnectionValidator
>;

export const resolveConnectionForUser = internalAction({
  args: {
    userId: v.id("users"),
    forceRefresh: v.optional(v.boolean()),
  },
  returns: v.union(resolvedCloudflareConnectionValidator, v.null()),
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
    const derivedTokenHealth: Infer<typeof mcpTokenHealthValidator> = {
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
      const tokenHealth: Infer<typeof mcpTokenHealthValidator> = {
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
      throw new Error(message);
    }

    const clientId =
      parseCloudflareMcpClientId(refreshToken) ??
      parseCloudflareMcpClientId(connection.auth.credential);
    if (!clientId) {
      const message =
        "Cloudflare OAuth client metadata is missing. Reconnect Cloudflare and retry.";
      const tokenHealth: Infer<typeof mcpTokenHealthValidator> = {
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
      throw new Error(message);
    }

    let refreshed: {
      accessToken: string;
      refreshToken?: string;
      expiresIn?: number;
    };
    try {
      refreshed = await refreshCloudflareMcpOAuthToken({
        refreshToken,
        clientId,
      });
    } catch (error) {
      const invalidToken = isLikelyInvalidCloudflareTokenError(error);
      const tokenHealth: Infer<typeof mcpTokenHealthValidator> = {
        status: invalidToken ? "invalid" : derivedTokenHealth.status,
        checkedAt: Date.now(),
        expiresAt,
        source: invalidToken ? "refresh_attempt" : "runtime_error",
        errorMessage: sanitizeTokenHealthError(error),
      };
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
      mcpServerUrl: connection.auth.mcpServerUrl,
    };
    const refreshedTokenHealth: Infer<typeof mcpTokenHealthValidator> = {
      status: deriveMcpTokenStatusFromExpiry(nextExpiresAt, Date.now()),
      checkedAt: Date.now(),
      expiresAt: nextExpiresAt,
      source: "refresh_attempt",
    };

    await ctx.runMutation(internal.providerConnections.upsertCloudflare, {
      userId: args.userId,
      auth: refreshedAuth,
      accountId: connection.accountId,
      tokenHealth: refreshedTokenHealth,
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
  returns: v.string(),
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
    return new Response("Invalid OAuth state", { status: 400 });
  }

  if (oauthState.expiresAt < Date.now()) {
    await ctx.runMutation(internal.oauthState.deleteOauthState, {
      id: oauthState._id,
    });
    return new Response("OAuth state expired", { status: 400 });
  }

  const clientId = oauthState.clientId;
  const codeVerifier = oauthState.codeVerifier;
  if (!clientId || !codeVerifier) {
    await ctx.runMutation(internal.oauthState.deleteOauthState, {
      id: oauthState._id,
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
        oauthStateId: oauthState._id,
      },
    );
  } catch (err) {
    await ctx.runMutation(internal.oauthState.deleteOauthState, {
      id: oauthState._id,
    });
    const message = err instanceof Error ? err.message : String(err);
    console.error("cloudflare-mcp-oauth:exchange_failed", { message });
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
