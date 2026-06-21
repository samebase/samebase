import { v } from "convex/values";
import { httpAction, internalMutation } from "./_generated/server";
import type { ActionCtx, MutationCtx } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, mutation } from "./functions";
import { OAUTH_STATE_TTL_MS, randomToken, readRequiredEnv } from "./oauthUtils";
import {
  GITHUB_OAUTH_POPUP_NAME,
  getGitHubOAuthScopeRequirements,
  isSafeGithubOAuthReturnToPath,
} from "../shared/githubOAuth";
import { CODESPACES_ENABLED } from "../shared/featureFlags";
import { buildUrlWithSearchParams, createUrlSearchParams } from "../shared/urlSearchParams";

const GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_API_BASE = "https://api.github.com";
const GITHUB_API_USER_URL = `${GITHUB_API_BASE}/user`;
const DEFAULT_OAUTH_TIMEOUT_MS = 10_000;

type OAuthContext = ActionCtx | MutationCtx;
type GithubOAuthAuthorizeSearchParams = {
  client_id: string;
  redirect_uri: string;
  scope: string;
  state: string;
};
type GithubOAuthTokenSearchParams = {
  client_id: string;
  client_secret: string;
  code: string;
  redirect_uri: string;
};

function buildGithubOAuthAuthorizeSearchParams(args: {
  clientId: string;
  redirectUri: string;
  state: string;
}): GithubOAuthAuthorizeSearchParams {
  const requiredScopes = getGitHubOAuthScopeRequirements().map(
    (scopeRequirement) => scopeRequirement.scope,
  );
  return {
    client_id: args.clientId,
    redirect_uri: args.redirectUri,
    scope: [...requiredScopes, ...(CODESPACES_ENABLED ? ["codespace"] : [])].join(" "),
    state: args.state,
  };
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
      throw new Error(`GitHub OAuth request timed out after ${timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function buildGithubOAuthUrl(
  ctx: OAuthContext,
  userId: Id<"users">,
  returnToPath?: string,
): Promise<string> {
  const clientId = readRequiredEnv("PROVIDER_GITHUB_OAUTH_CLIENT_ID");
  const redirectUri = readRequiredEnv("PROVIDER_GITHUB_OAUTH_REDIRECT_URL");
  const state = randomToken();
  const normalizedReturnToPath =
    typeof returnToPath === "string" && isSafeGithubOAuthReturnToPath(returnToPath)
      ? returnToPath
      : undefined;

  const now = Date.now();
  await ctx.runMutation(internal.oauthState.createOauthState, {
    provider: "github",
    userId,
    state,
    returnToPath: normalizedReturnToPath,
    createdAt: now,
    expiresAt: now + OAUTH_STATE_TTL_MS,
  });

  return buildUrlWithSearchParams(
    GITHUB_AUTHORIZE_URL,
    buildGithubOAuthAuthorizeSearchParams({ clientId, redirectUri, state }),
  );
}

async function exchangeGithubOAuthCode(args: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<{
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
}> {
  const payload = createUrlSearchParams({
    client_id: args.clientId,
    client_secret: args.clientSecret,
    code: args.code,
    redirect_uri: args.redirectUri,
  } satisfies GithubOAuthTokenSearchParams);

  const response = await fetchWithTimeout(GITHUB_TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: payload.toString(),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || !data || typeof data.access_token !== "string") {
    throw new Error(`Failed to exchange GitHub OAuth code (${response.status}).`);
  }

  return {
    accessToken: data.access_token,
    refreshToken: typeof data.refresh_token === "string" ? data.refresh_token : undefined,
    expiresIn: typeof data.expires_in === "number" ? data.expires_in : undefined,
  };
}

async function fetchGithubUser(accessToken: string): Promise<{ username: string }> {
  const response = await fetchWithTimeout(GITHUB_API_USER_URL, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "samebase-app",
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || typeof payload.login !== "string") {
    throw new Error(`Failed to fetch GitHub user profile (${response.status}).`);
  }
  return { username: payload.login };
}

function base64Encode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  if (typeof btoa === "function") {
    let binary = "";
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    return btoa(binary);
  }
  return Buffer.from(bytes).toString("base64");
}

async function revokeGithubOAuthGrant(accessToken: string): Promise<void> {
  const clientId = readRequiredEnv("PROVIDER_GITHUB_OAUTH_CLIENT_ID");
  const clientSecret = readRequiredEnv("PROVIDER_GITHUB_OAUTH_CLIENT_SECRET");
  const response = await fetchWithTimeout(
    `${GITHUB_API_BASE}/applications/${encodeURIComponent(clientId)}/grant`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Basic ${base64Encode(`${clientId}:${clientSecret}`)}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": "samebase-app",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({ access_token: accessToken }),
    },
  );

  if (response.status === 204 || response.status === 404) {
    return;
  }

  throw new Error(`Failed to revoke GitHub OAuth grant (${response.status}).`);
}

export const storeGithubOauthConnection = internalMutation({
  args: {
    userId: v.id("users"),
    accessToken: v.string(),
    refreshToken: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    username: v.string(),
    oauthStateId: v.id("oauthStates"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.providerConnections.upsertGithub, {
      userId: args.userId,
      auth: {
        method: "oauth",
        credential: args.accessToken,
        refreshCredential: args.refreshToken,
        credentialExpiresAt: args.expiresAt,
      },
      username: args.username,
    });
    await ctx.db.delete(args.oauthStateId);
    return null;
  },
});

export const getGithubOAuthUrl = mutation({
  access: "access_provider_connections",
  args: {
    returnToPath: v.optional(v.string()),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    return await buildGithubOAuthUrl(ctx, ctx.viewer.userId, args.returnToPath);
  },
});

export const reauthorizeGithubOAuth = action({
  access: "access_provider_connections",
  args: {
    returnToPath: v.optional(v.string()),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const connection = await ctx.runQuery(internal.providerConnections.getByUserAndKind, {
      userId: ctx.viewer.userId,
      kind: "github",
    });
    if (connection?.kind !== "github" || connection.auth.method !== "oauth") {
      throw new Error("GitHub OAuth is not connected.");
    }

    const authorizeUrl = await buildGithubOAuthUrl(ctx, ctx.viewer.userId, args.returnToPath);
    await revokeGithubOAuthGrant(connection.auth.credential);
    await ctx.runMutation(internal.providerConnections.removeByUserAndKind, {
      userId: ctx.viewer.userId,
      kind: "github",
    });

    return authorizeUrl;
  },
});

export const startGithubOAuth = httpAction(async (ctx) => {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }
  const authorizeUrl = await buildGithubOAuthUrl(ctx, userId);
  return Response.redirect(authorizeUrl, 302);
});

export const finishGithubOAuth = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) {
    return new Response("Missing OAuth parameters", { status: 400 });
  }

  const oauthState = await ctx.runQuery(internal.oauthState.getOauthStateByState, {
    provider: "github",
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

  const clientId = readRequiredEnv("PROVIDER_GITHUB_OAUTH_CLIENT_ID");
  const clientSecret = readRequiredEnv("PROVIDER_GITHUB_OAUTH_CLIENT_SECRET");
  const redirectUri = readRequiredEnv("PROVIDER_GITHUB_OAUTH_REDIRECT_URL");

  try {
    const token = await exchangeGithubOAuthCode({
      code,
      clientId,
      clientSecret,
      redirectUri,
    });
    const githubUser = await fetchGithubUser(token.accessToken);
    const expiresAt =
      typeof token.expiresIn === "number" ? Date.now() + token.expiresIn * 1000 : undefined;

    await ctx.runMutation(internal.githubOAuth.storeGithubOauthConnection, {
      userId: oauthState.userId,
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      expiresAt,
      username: githubUser.username,
      oauthStateId: oauthState._id,
    });
  } catch (error) {
    await ctx.runMutation(internal.oauthState.deleteOauthState, {
      id: oauthState._id,
    });
    throw error;
  }

  const defaultReturnTo =
    process.env.SITE_URL ?? process.env.CONVEX_SITE_URL ?? new URL(request.url).origin;
  const baseOrigin = new URL(request.url).origin;
  const fallbackReturnUrl = new URL(defaultReturnTo, baseOrigin).toString();
  const returnUrl =
    typeof oauthState.returnToPath === "string" &&
    isSafeGithubOAuthReturnToPath(oauthState.returnToPath)
      ? new URL(oauthState.returnToPath, fallbackReturnUrl).toString()
      : fallbackReturnUrl;

  // GitHub popups clear `window.opener` before leaving our origin, so the
  // callback relies on the server-stored return path and lets popup windows
  // close themselves based on their retained `window.name`.
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>GitHub OAuth</title>
  </head>
  <body>
    <script>
      (function () {
        const returnTo = ${JSON.stringify(returnUrl)};
        const popupName = ${JSON.stringify(GITHUB_OAUTH_POPUP_NAME)};

        if (window.name === popupName) {
          window.close();
          window.setTimeout(function () {
            window.location.replace(returnTo);
          }, 100);
          return;
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
