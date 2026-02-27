import { v } from "convex/values";
import { httpAction, internalMutation, mutation } from "./_generated/server";
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
import { isRecord, readStringOrNumber, type JsonRecord } from "./jsonUtils";

const CONVEX_AUTHORIZE_URL =
  "https://dashboard.convex.dev/oauth/authorize/team";
const CONVEX_TOKEN_URL = "https://api.convex.dev/oauth/token";
const CONVEX_TOKEN_DETAILS_URL = "https://api.convex.dev/v1/token_details";
const DEFAULT_OAUTH_TIMEOUT_MS = 10_000;

type OAuthContext = ActionCtx | MutationCtx;

function readNestedStringOrNumber(
  record: JsonRecord,
  key: string,
  field: string,
): string | undefined {
  const nested = record[key];
  if (!isRecord(nested)) return undefined;
  return readStringOrNumber(nested, field);
}

function resolveField(
  record: JsonRecord,
  keys: string[],
  nested?: { key: string; field: string },
): string | undefined {
  for (const key of keys) {
    const value = readStringOrNumber(record, key);
    if (value !== undefined) return value;
  }
  if (nested) {
    const nestedValue = readNestedStringOrNumber(
      record,
      nested.key,
      nested.field,
    );
    if (nestedValue !== undefined) return nestedValue;
  }
  return undefined;
}

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
      throw new Error(`Convex OAuth request timed out after ${timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function buildConvexOAuthUrl(
  ctx: OAuthContext,
  userId: Id<"users">,
): Promise<string> {
  const clientId = readRequiredEnv("PROVIDER_CONVEX_OAUTH_CLIENT_ID");
  const redirectUri = readRequiredEnv("PROVIDER_CONVEX_OAUTH_REDIRECT_URL");

  const state = randomToken();
  const codeVerifier = randomToken(64);
  const codeChallenge = await createCodeChallenge(codeVerifier);

  const now = Date.now();
  await ctx.runMutation(internal.oauthState.createOauthState, {
    provider: "convex",
    userId,
    state,
    codeVerifier,
    createdAt: now,
    expiresAt: now + OAUTH_STATE_TTL_MS,
  });

  const authorizeUrl = new URL(CONVEX_AUTHORIZE_URL);
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("code_challenge", codeChallenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");

  return authorizeUrl.toString();
}

async function exchangeConvexOAuthCode(args: {
  code: string;
  codeVerifier: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<{
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
}> {
  const payload = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: args.clientId,
    client_secret: args.clientSecret,
    code: args.code,
    code_verifier: args.codeVerifier,
    redirect_uri: args.redirectUri,
  });

  const response = await fetchWithTimeout(CONVEX_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: payload.toString(),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || !data || typeof data.access_token !== "string") {
    throw new Error(
      `Failed to exchange Convex OAuth code (${response.status}).`,
    );
  }

  return {
    accessToken: data.access_token,
    refreshToken:
      typeof data.refresh_token === "string" ? data.refresh_token : undefined,
    expiresIn:
      typeof data.expires_in === "number" ? data.expires_in : undefined,
  };
}

async function fetchConvexTokenDetails(accessToken: string): Promise<{
  teamId?: string;
  teamSlug?: string;
  teamName?: string;
  userId?: string;
}> {
  const response = await fetchWithTimeout(CONVEX_TOKEN_DETAILS_URL, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || !data) {
    throw new Error(
      `Failed to fetch Convex token details (${response.status}).`,
    );
  }

  const record = isRecord(data) ? data : {};
  const teamId = resolveField(record, ["teamId", "team_id"], {
    key: "team",
    field: "id",
  });
  const teamSlug = resolveField(record, ["teamSlug", "team_slug"], {
    key: "team",
    field: "slug",
  });
  const teamName = resolveField(record, ["name"], {
    key: "team",
    field: "name",
  });
  const userId = resolveField(record, ["userId", "user_id"], {
    key: "user",
    field: "id",
  });

  return {
    teamId,
    teamSlug,
    teamName,
    userId,
  };
}

export const storeConvexOauthTokens = internalMutation({
  args: {
    userId: v.id("users"),
    accessToken: v.string(),
    refreshToken: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    teamId: v.string(),
    teamSlug: v.optional(v.string()),
    oauthStateId: v.id("oauthStates"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.providerConnections.upsertConvex, {
      userId: args.userId,
      auth: {
        method: "oauth",
        credential: args.accessToken,
        refreshCredential: args.refreshToken,
        credentialExpiresAt: args.expiresAt,
      },
      teamId: args.teamId,
      teamSlug: args.teamSlug,
    });
    await ctx.db.delete(args.oauthStateId);
    return null;
  },
});

export const getConvexOAuthUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("User not authenticated");
    }

    return await buildConvexOAuthUrl(ctx, userId);
  },
});

export const startConvexOAuth = httpAction(async (ctx) => {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const authorizeUrl = await buildConvexOAuthUrl(ctx, userId);
  return Response.redirect(authorizeUrl, 302);
});

export const finishConvexOAuth = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) {
    return new Response("Missing OAuth parameters", { status: 400 });
  }

  const oauthState = await ctx.runQuery(
    internal.oauthState.getOauthStateByState,
    {
      provider: "convex",
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

  if (!oauthState.codeVerifier) {
    await ctx.runMutation(internal.oauthState.deleteOauthState, {
      id: oauthState._id,
    });
    return new Response("OAuth state missing code verifier", { status: 400 });
  }

  const clientId = readRequiredEnv("PROVIDER_CONVEX_OAUTH_CLIENT_ID");
  const clientSecret = readRequiredEnv("PROVIDER_CONVEX_OAUTH_CLIENT_SECRET");
  const redirectUri = readRequiredEnv("PROVIDER_CONVEX_OAUTH_REDIRECT_URL");

  try {
    const token = await exchangeConvexOAuthCode({
      code,
      codeVerifier: oauthState.codeVerifier,
      clientId,
      clientSecret,
      redirectUri,
    });

    const details = await fetchConvexTokenDetails(token.accessToken);
    if (!details.teamId) {
      throw new Error("Convex OAuth token missing team access");
    }
    const expiresAt =
      typeof token.expiresIn === "number"
        ? Date.now() + token.expiresIn * 1000
        : undefined;

    await ctx.runMutation(internal.convexOAuth.storeConvexOauthTokens, {
      userId: oauthState.userId,
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      expiresAt,
      teamId: details.teamId,
      teamSlug: details.teamSlug,
      oauthStateId: oauthState._id,
    });
  } catch (error) {
    await ctx.runMutation(internal.oauthState.deleteOauthState, {
      id: oauthState._id,
    });
    throw error;
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
    <title>Convex OAuth</title>
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
              window.opener.postMessage({ type: "convex-oauth-complete" }, returnOrigin);
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
