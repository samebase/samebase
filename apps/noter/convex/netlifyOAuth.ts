import { v } from "convex/values";
import { action, httpAction, internalMutation, mutation } from "./_generated/server";
import type { ActionCtx, MutationCtx } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import { OAUTH_STATE_TTL_MS, randomToken, readRequiredEnv } from "./oauthUtils";
import type { Id } from "./_generated/dataModel";

const NETLIFY_AUTHORIZE_URL = "https://app.netlify.com/authorize";
const NETLIFY_TOKEN_URL = "https://api.netlify.com/oauth/token";
const NETLIFY_API_BASE = "https://api.netlify.com/api/v1";
const DEFAULT_OAUTH_TIMEOUT_MS = 10_000;

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
      throw new Error(`Netlify OAuth request timed out after ${timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

type JsonRecord = Record<string, unknown>;

type NetlifyAccount = {
  id: string;
  slug?: string;
  name?: string;
  type?: string;
  isDefault?: boolean;
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function readString(record: JsonRecord, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function readBoolean(record: JsonRecord, key: string): boolean | undefined {
  const value = record[key];
  return typeof value === "boolean" ? value : undefined;
}

async function exchangeNetlifyOAuthCode(args: {
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
    client_id: args.clientId,
    client_secret: args.clientSecret,
    code: args.code,
    redirect_uri: args.redirectUri,
  });

  const response = await fetchWithTimeout(NETLIFY_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: payload.toString(),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || !data || typeof data.access_token !== "string") {
    throw new Error(`Failed to exchange Netlify OAuth code (${response.status}).`);
  }

  return {
    accessToken: data.access_token,
    refreshToken: typeof data.refresh_token === "string" ? data.refresh_token : undefined,
    expiresIn: typeof data.expires_in === "number" ? data.expires_in : undefined,
  };
}

async function fetchNetlifyUser(accessToken: string): Promise<{ userId?: string }> {
  const response = await fetchWithTimeout(`${NETLIFY_API_BASE}/user`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || !data) {
    throw new Error(`Failed to fetch Netlify user (${response.status}).`);
  }

  const record = asRecord(data);
  const userId = readString(record, "id");

  return { userId };
}

async function fetchNetlifyAccounts(accessToken: string): Promise<NetlifyAccount[]> {
  const response = await fetchWithTimeout(`${NETLIFY_API_BASE}/accounts`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || !data) {
    throw new Error(`Failed to fetch Netlify teams (${response.status}).`);
  }

  const rawAccounts = Array.isArray(data) ? data : [];
  const accounts: NetlifyAccount[] = [];

  for (const entry of rawAccounts) {
    const record = asRecord(entry);
    const id = readString(record, "id");
    if (!id) continue;
    const isDefault =
      readBoolean(record, "is_default") ??
      readBoolean(record, "isDefault") ??
      readBoolean(record, "default");
    accounts.push({
      id,
      slug: readString(record, "slug"),
      name: readString(record, "name"),
      type: readString(record, "type"),
      isDefault,
    });
  }

  return accounts;
}

function selectNetlifyAccount(accounts: NetlifyAccount[]): NetlifyAccount {
  if (accounts.length === 0) {
    throw new Error("No Netlify teams available for this user.");
  }

  const defaultAccount = accounts.find((account) => account.isDefault);
  if (defaultAccount) return defaultAccount;

  const teamAccount = accounts.find((account) => account.type === "team");
  return teamAccount ?? accounts[0];
}

async function buildNetlifyOAuthUrl(
  ctx: OAuthContext,
  userId: Id<"users">,
): Promise<string> {
  const clientId = readRequiredEnv("NETLIFY_OAUTH_CLIENT_ID");
  const redirectUri = readRequiredEnv("NETLIFY_OAUTH_REDIRECT_URL");

  const state = randomToken();

  const now = Date.now();
  await ctx.runMutation(internal.oauthState.createOauthState, {
    provider: "netlify",
    userId,
    state,
    createdAt: now,
    expiresAt: now + OAUTH_STATE_TTL_MS,
  });

  const authorizeUrl = new URL(NETLIFY_AUTHORIZE_URL);
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("state", state);

  return authorizeUrl.toString();
}

export const storeNetlifyOauthTokens = internalMutation({
  args: {
    userId: v.id("users"),
    accessToken: v.string(),
    refreshToken: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    teamId: v.optional(v.string()),
    teamSlug: v.optional(v.string()),
    providerUserId: v.optional(v.string()),
    oauthStateId: v.id("oauthStates"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      netlifyAccessToken: args.accessToken,
      netlifyRefreshToken: args.refreshToken,
      netlifyExpiresAt: args.expiresAt,
      netlifyUserId: args.providerUserId,
      netlifyTeamId: args.teamId,
      netlifyTeamSlug: args.teamSlug,
    });
    await ctx.db.delete(args.oauthStateId);
    return null;
  },
});

export const getNetlifyOAuthUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("User not authenticated");
    }

    return await buildNetlifyOAuthUrl(ctx, userId);
  },
});

export const finishNetlifyOAuth = action({
  args: {
    code: v.string(),
    state: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("User not authenticated");
    }

    const oauthState = await ctx.runQuery(internal.oauthState.getOauthStateByState, {
      provider: "netlify",
      state: args.state,
    });

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

    const clientId = readRequiredEnv("NETLIFY_OAUTH_CLIENT_ID");
    const clientSecret = readRequiredEnv("NETLIFY_OAUTH_CLIENT_SECRET");
    const redirectUri = readRequiredEnv("NETLIFY_OAUTH_REDIRECT_URL");

    try {
      const token = await exchangeNetlifyOAuthCode({
        code: args.code,
        clientId,
        clientSecret,
        redirectUri,
      });

      const user = await fetchNetlifyUser(token.accessToken);
      const accounts = await fetchNetlifyAccounts(token.accessToken);
      const account = selectNetlifyAccount(accounts);

      const expiresAt =
        typeof token.expiresIn === "number"
          ? Date.now() + token.expiresIn * 1000
          : undefined;

      await ctx.runMutation(internal.netlifyOAuth.storeNetlifyOauthTokens, {
        userId: oauthState.userId,
        accessToken: token.accessToken,
        refreshToken: token.refreshToken,
        expiresAt,
        teamId: account.id,
        teamSlug: account.slug,
        providerUserId: user.userId,
        oauthStateId: oauthState._id,
      });
    } catch (err) {
      await ctx.runMutation(internal.oauthState.deleteOauthState, {
        id: oauthState._id,
      });
      throw err;
    }

    return null;
  },
});

export const startNetlifyOAuth = httpAction(async (ctx) => {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const authorizeUrl = await buildNetlifyOAuthUrl(ctx, userId);
  return Response.redirect(authorizeUrl, 302);
});

export const finishNetlifyOAuthCallback = httpAction(async (ctx, request) => {
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
          provider: "netlify",
          state,
        },
      );
      if (oauthState) {
        await ctx.runMutation(internal.oauthState.deleteOauthState, {
          id: oauthState._id,
        });
      }
    }

    return new Response(`Netlify OAuth error: ${errorDescription ?? error}`, {
      status: 400,
    });
  }

  if (!code || !state) {
    return new Response("Missing OAuth parameters", { status: 400 });
  }

  const oauthState = await ctx.runQuery(internal.oauthState.getOauthStateByState, {
    provider: "netlify",
    state,
  });

  if (!oauthState) {
    return new Response("Invalid OAuth state", { status: 400 });
  }

  if (oauthState.expiresAt < Date.now()) {
    await ctx.runMutation(internal.oauthState.deleteOauthState, {
      id: oauthState._id,
    });
    return new Response("OAuth state expired", { status: 400 });
  }

  const clientId = readRequiredEnv("NETLIFY_OAUTH_CLIENT_ID");
  const clientSecret = readRequiredEnv("NETLIFY_OAUTH_CLIENT_SECRET");
  const redirectUri = readRequiredEnv("NETLIFY_OAUTH_REDIRECT_URL");

  try {
    const token = await exchangeNetlifyOAuthCode({
      code,
      clientId,
      clientSecret,
      redirectUri,
    });

    const user = await fetchNetlifyUser(token.accessToken);
    const accounts = await fetchNetlifyAccounts(token.accessToken);
    const account = selectNetlifyAccount(accounts);

    const expiresAt =
      typeof token.expiresIn === "number"
        ? Date.now() + token.expiresIn * 1000
        : undefined;

    await ctx.runMutation(internal.netlifyOAuth.storeNetlifyOauthTokens, {
      userId: oauthState.userId,
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      expiresAt,
      teamId: account.id,
      teamSlug: account.slug,
      providerUserId: user.userId,
      oauthStateId: oauthState._id,
    });
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
      "SITE_URL is not set; falling back to Convex origin for Netlify OAuth redirect.",
      { fallbackReturnTo },
    );
  }

  const returnTo = siteUrl ?? fallbackReturnTo;

  return Response.redirect(returnTo, 302);
});
