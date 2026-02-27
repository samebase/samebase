import { v } from "convex/values";
import {
  action,
  httpAction,
  internalMutation,
  mutation,
} from "./_generated/server";
import type { ActionCtx, MutationCtx } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import { OAUTH_STATE_TTL_MS, randomToken, readRequiredEnv } from "./oauthUtils";
import type { Id } from "./_generated/dataModel";
import { asRecord, readString } from "./jsonUtils";

const RAILWAY_AUTHORIZE_URL = "https://backboard.railway.com/oauth/auth";
const RAILWAY_TOKEN_URL = "https://backboard.railway.com/oauth/token";
const RAILWAY_ME_URL = "https://backboard.railway.com/oauth/me";
const RAILWAY_OAUTH_SCOPES =
  "openid email profile offline_access workspace:member";
const DEFAULT_OAUTH_TIMEOUT_MS = 10_000;

type OAuthContext = ActionCtx | MutationCtx;
type OAuthStateReference = {
  _id: Id<"oauthStates">;
  userId: Id<"users">;
};
const { id, null: vNull, number, optional, string } = v;
const nullResultValidator = vNull();
const oauthUrlResultValidator = string();

function encodeBase64(value: string): string {
  if (typeof btoa === "function") {
    return btoa(value);
  }
  if (typeof Buffer !== "undefined") {
    return Buffer.from(value, "utf-8").toString("base64");
  }
  throw new Error("Unable to encode Railway OAuth client credentials.");
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
      throw new Error(`Railway OAuth request timed out after ${timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function exchangeRailwayOAuthCode(args: {
  code: string;
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
    code: args.code,
    redirect_uri: args.redirectUri,
  });
  const basicAuth = `Basic ${encodeBase64(`${args.clientId}:${args.clientSecret}`)}`;

  const response = await fetchWithTimeout(RAILWAY_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: basicAuth,
    },
    body: payload.toString(),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || !data || typeof data.access_token !== "string") {
    throw new Error(
      `Failed to exchange Railway OAuth code (${response.status}).`,
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

async function fetchRailwayProfile(args: { accessToken: string }): Promise<{
  accountId: string;
  email?: string;
  name?: string;
}> {
  const response = await fetchWithTimeout(RAILWAY_ME_URL, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${args.accessToken}`,
    },
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || !data) {
    throw new Error(`Failed to fetch Railway profile (${response.status}).`);
  }

  const profile = asRecord(data);
  const accountId = readString(profile, "sub");
  if (!accountId) {
    throw new Error("Railway profile response is missing account ID.");
  }

  return {
    accountId,
    email: readString(profile, "email"),
    name: readString(profile, "name"),
  };
}

async function buildRailwayOAuthUrl(
  ctx: OAuthContext,
  userId: Id<"users">,
): Promise<string> {
  const clientId = readRequiredEnv("PROVIDER_RAILWAY_OAUTH_CLIENT_ID");
  const redirectUri = readRequiredEnv("PROVIDER_RAILWAY_OAUTH_REDIRECT_URL");

  const state = randomToken();

  const now = Date.now();
  await ctx.runMutation(internal.oauthState.createOauthState, {
    provider: "railway",
    userId,
    state,
    createdAt: now,
    expiresAt: now + OAUTH_STATE_TTL_MS,
  });

  const authorizeUrl = new URL(RAILWAY_AUTHORIZE_URL);
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", RAILWAY_OAUTH_SCOPES);
  // Required to reliably receive refresh tokens when requesting offline_access.
  authorizeUrl.searchParams.set("prompt", "consent");
  authorizeUrl.searchParams.set("state", state);

  return authorizeUrl.toString();
}

async function completeRailwayOAuth(
  ctx: OAuthContext,
  oauthState: OAuthStateReference,
  code: string,
): Promise<void> {
  const clientId = readRequiredEnv("PROVIDER_RAILWAY_OAUTH_CLIENT_ID");
  const clientSecret = readRequiredEnv("PROVIDER_RAILWAY_OAUTH_CLIENT_SECRET");
  const redirectUri = readRequiredEnv("PROVIDER_RAILWAY_OAUTH_REDIRECT_URL");

  const token = await exchangeRailwayOAuthCode({
    code,
    clientId,
    clientSecret,
    redirectUri,
  });
  const profile = await fetchRailwayProfile({
    accessToken: token.accessToken,
  });
  const expiresAt =
    typeof token.expiresIn === "number"
      ? Date.now() + token.expiresIn * 1000
      : undefined;

  await ctx.runMutation(internal.railwayOAuth.storeRailwayOauthTokens, {
    userId: oauthState.userId,
    accessToken: token.accessToken,
    refreshToken: token.refreshToken,
    expiresAt,
    accountId: profile.accountId,
    email: profile.email,
    name: profile.name,
    oauthStateId: oauthState._id,
  });
}

export const storeRailwayOauthTokens = internalMutation({
  args: {
    userId: id("users"),
    accessToken: string(),
    refreshToken: optional(string()),
    expiresAt: optional(number()),
    accountId: string(),
    email: optional(string()),
    name: optional(string()),
    oauthStateId: id("oauthStates"),
  },
  returns: nullResultValidator,
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.providerConnections.upsertRailway, {
      userId: args.userId,
      auth: {
        method: "oauth",
        credential: args.accessToken,
        refreshCredential: args.refreshToken,
        credentialExpiresAt: args.expiresAt,
      },
      accountId: args.accountId,
      email: args.email,
      name: args.name,
    });
    await ctx.db.delete(args.oauthStateId);
    return null;
  },
});

export const getRailwayOAuthUrl = mutation({
  args: {},
  returns: oauthUrlResultValidator,
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("User not authenticated");
    }
    return await buildRailwayOAuthUrl(ctx, userId);
  },
});

export const finishRailwayOAuth = action({
  args: {
    code: string(),
    state: string(),
  },
  returns: nullResultValidator,
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("User not authenticated");
    }

    const oauthState = await ctx.runQuery(
      internal.oauthState.getOauthStateByState,
      {
        provider: "railway",
        state: args.state,
      },
    );
    if (!oauthState) {
      throw new Error("Invalid OAuth state");
    }
    if (oauthState.userId !== userId) {
      throw new Error("OAuth state does not match current user");
    }
    if (oauthState.expiresAt < Date.now()) {
      await ctx.runMutation(internal.oauthState.deleteOauthState, {
        id: oauthState._id,
      });
      throw new Error("OAuth state expired");
    }

    try {
      await completeRailwayOAuth(ctx, oauthState, args.code);
    } catch (error) {
      await ctx.runMutation(internal.oauthState.deleteOauthState, {
        id: oauthState._id,
      });
      throw error;
    }

    return null;
  },
});

export const startRailwayOAuth = httpAction(async (ctx) => {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }
  const authorizeUrl = await buildRailwayOAuthUrl(ctx, userId);
  return Response.redirect(authorizeUrl, 302);
});

export const finishRailwayOAuthCallback = httpAction(async (ctx, request) => {
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
          provider: "railway",
          state,
        },
      );
      if (oauthState) {
        await ctx.runMutation(internal.oauthState.deleteOauthState, {
          id: oauthState._id,
        });
      }
    }
    return new Response(`Railway OAuth error: ${errorDescription ?? error}`, {
      status: 400,
    });
  }

  if (!code || !state) {
    return new Response("Missing OAuth parameters", { status: 400 });
  }

  const oauthState = await ctx.runQuery(
    internal.oauthState.getOauthStateByState,
    {
      provider: "railway",
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

  try {
    await completeRailwayOAuth(ctx, oauthState, code);
  } catch (err) {
    await ctx.runMutation(internal.oauthState.deleteOauthState, {
      id: oauthState._id,
    });
    throw err;
  }

  const siteUrl = process.env.SITE_URL;
  const fallbackReturnTo =
    process.env.CONVEX_SITE_URL ?? new URL(request.url).origin;

  if (!siteUrl) {
    console.warn(
      "SITE_URL is not set; falling back to Convex origin for Railway OAuth redirect.",
      { fallbackReturnTo },
    );
  }

  const returnTo = siteUrl ?? fallbackReturnTo;
  return Response.redirect(returnTo, 302);
});
