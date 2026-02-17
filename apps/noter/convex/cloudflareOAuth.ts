import { v } from "convex/values";
import { httpAction, internalMutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import {
  createCodeChallenge,
  OAUTH_STATE_TTL_MS,
  randomToken,
  readRequiredEnv,
} from "./oauthUtils";

const CLOUDFLARE_AUTHORIZE_URL = "https://dash.cloudflare.com/oauth2/auth";
const CLOUDFLARE_TOKEN_URL = "https://dash.cloudflare.com/oauth2/token";
const CLOUDFLARE_API_BASE = "https://api.cloudflare.com/client/v4";

type JsonRecord = Record<string, unknown>;

type CloudflareAccount = {
  id: string;
  name: string;
  isDefault: boolean;
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

function parseScopes(): string[] {
  const raw = process.env.CLOUDFLARE_OAUTH_SCOPES;
  if (raw && raw.trim()) {
    return raw.split(/[\s,]+/).map((scope) => scope.trim()).filter(Boolean);
  }
  return ["account:read", "pages:write"];
}

function buildScopeParam(scopes: string[]): string {
  const scopeSet = new Set(scopes);
  scopeSet.add("offline_access");
  return Array.from(scopeSet).join(" ");
}

async function exchangeCloudflareOAuthCode(args: {
  code: string;
  codeVerifier: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<{
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  scope?: string;
}> {
  const payload = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: args.clientId,
    client_secret: args.clientSecret,
    code: args.code,
    code_verifier: args.codeVerifier,
    redirect_uri: args.redirectUri,
  });

  const response = await fetch(CLOUDFLARE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: payload.toString(),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || !data || typeof data.access_token !== "string") {
    const error =
      data && typeof data.error_description === "string"
        ? data.error_description
        : data && typeof data.error === "string"
          ? data.error
          : response.status;
    throw new Error(`Failed to exchange Cloudflare OAuth code (${error}).`);
  }

  return {
    accessToken: data.access_token,
    refreshToken:
      typeof data.refresh_token === "string" ? data.refresh_token : undefined,
    expiresIn: typeof data.expires_in === "number" ? data.expires_in : undefined,
    scope: typeof data.scope === "string" ? data.scope : undefined,
  };
}

async function fetchCloudflareAccounts(
  accessToken: string,
): Promise<CloudflareAccount[]> {
  const response = await fetch(`${CLOUDFLARE_API_BASE}/accounts`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data = await response.json().catch(() => null);
  const record = asRecord(data);
  const success =
    typeof record.success === "boolean" ? record.success : response.ok;

  if (!response.ok || !success) {
    throw new Error(
      `Failed to fetch Cloudflare accounts (${response.status}).`,
    );
  }

  const resultRaw = record.result;
  const result = Array.isArray(resultRaw) ? resultRaw : [];
  const accounts: CloudflareAccount[] = [];

  for (const entry of result) {
    const entryRecord = asRecord(entry);
    const id = readString(entryRecord, "id");
    const name = readString(entryRecord, "name");
    if (!id || !name) {
      continue;
    }
    const isDefault =
      readBoolean(entryRecord, "is_default") ??
      readBoolean(entryRecord, "isDefault") ??
      false;
    accounts.push({ id, name, isDefault });
  }

  return accounts;
}

function selectCloudflareAccount(accounts: CloudflareAccount[]): CloudflareAccount {
  if (accounts.length === 0) {
    throw new Error("No Cloudflare accounts available for this user.");
  }
  return accounts.find((account) => account.isDefault) ?? accounts[0];
}

export const storeCloudflareOauthTokens = internalMutation({
  args: {
    userId: v.id("users"),
    accessToken: v.string(),
    refreshToken: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    accountId: v.string(),
    accountName: v.string(),
    oauthStateId: v.id("oauthStates"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      cloudflareAccessToken: args.accessToken,
      cloudflareRefreshToken: args.refreshToken,
      cloudflareExpiresAt: args.expiresAt,
      cloudflareAccountId: args.accountId,
      cloudflareAccountName: args.accountName,
    });
    await ctx.db.delete(args.oauthStateId);
    return null;
  },
});

export const startCloudflareOAuth = httpAction(async (ctx) => {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const clientId = readRequiredEnv("CLOUDFLARE_OAUTH_CLIENT_ID");
  const redirectUri = readRequiredEnv("CLOUDFLARE_OAUTH_REDIRECT_URL");

  const state = randomToken();
  const codeVerifier = randomToken(64);
  const codeChallenge = await createCodeChallenge(codeVerifier);

  const now = Date.now();
  await ctx.runMutation(internal.oauthState.createOauthState, {
    provider: "cloudflare",
    userId,
    state,
    codeVerifier,
    createdAt: now,
    expiresAt: now + OAUTH_STATE_TTL_MS,
  });

  const authorizeUrl = new URL(CLOUDFLARE_AUTHORIZE_URL);
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("code_challenge", codeChallenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");
  authorizeUrl.searchParams.set("scope", buildScopeParam(parseScopes()));

  return Response.redirect(authorizeUrl.toString(), 302);
});

export const finishCloudflareOAuth = httpAction(async (ctx, request) => {
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
          provider: "cloudflare",
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
      provider: "cloudflare",
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

  const clientId = readRequiredEnv("CLOUDFLARE_OAUTH_CLIENT_ID");
  const clientSecret = readRequiredEnv("CLOUDFLARE_OAUTH_CLIENT_SECRET");
  const redirectUri = readRequiredEnv("CLOUDFLARE_OAUTH_REDIRECT_URL");

  try {
    const token = await exchangeCloudflareOAuthCode({
      code,
      codeVerifier: oauthState.codeVerifier,
      clientId,
      clientSecret,
      redirectUri,
    });

    const accounts = await fetchCloudflareAccounts(token.accessToken);
    const selectedAccount = selectCloudflareAccount(accounts);
    const expiresAt =
      typeof token.expiresIn === "number"
        ? Date.now() + token.expiresIn * 1000
        : undefined;

    await ctx.runMutation(internal.cloudflareOAuth.storeCloudflareOauthTokens, {
      userId: oauthState.userId,
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      expiresAt,
      accountId: selectedAccount.id,
      accountName: selectedAccount.name,
      oauthStateId: oauthState._id,
    });
  } catch (err) {
    await ctx.runMutation(internal.oauthState.deleteOauthState, {
      id: oauthState._id,
    });
    throw err;
  }

  const returnTo =
    process.env.SITE_URL ??
    process.env.CONVEX_SITE_URL ??
    new URL(request.url).origin;

  return Response.redirect(returnTo, 302);
});
