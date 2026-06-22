import { v } from "convex/values";
import { Octokit } from "@octokit/rest";
import { RequestError } from "@octokit/request-error";
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
import { utf8ToBase64 } from "../shared/base64";
import { buildUrlWithSearchParams, createUrlSearchParams } from "../shared/urlSearchParams";

const GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
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

async function runGithubOAuthRequestWithTimeout<T>(
  request: (signal: AbortSignal) => Promise<T>,
  timeoutMs = DEFAULT_OAUTH_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await request(controller.signal);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`GitHub OAuth request timed out after ${timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function createGitHubOctokit(accessToken: string): Octokit {
  return new Octokit({
    auth: accessToken,
    userAgent: "samebase-app",
  });
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
  };
}

async function fetchGithubUser(accessToken: string): Promise<{ username: string }> {
  try {
    const response = await runGithubOAuthRequestWithTimeout((signal) =>
      createGitHubOctokit(accessToken).rest.users.getAuthenticated({
        request: { signal },
      }),
    );
    if (!response.data.login) {
      throw new Error("Failed to fetch GitHub user profile.");
    }
    return { username: response.data.login };
  } catch (error) {
    if (error instanceof RequestError) {
      throw new Error(`Failed to fetch GitHub user profile (${error.status}).`);
    }
    throw error;
  }
}

async function revokeGithubOAuthGrant(accessToken: string): Promise<void> {
  const clientId = readRequiredEnv("PROVIDER_GITHUB_OAUTH_CLIENT_ID");
  const clientSecret = readRequiredEnv("PROVIDER_GITHUB_OAUTH_CLIENT_SECRET");
  const octokit = new Octokit({ userAgent: "samebase-app" });
  try {
    await runGithubOAuthRequestWithTimeout((signal) =>
      octokit.request("DELETE /applications/{client_id}/grant", {
        client_id: clientId,
        access_token: accessToken,
        headers: {
          authorization: `Basic ${utf8ToBase64(`${clientId}:${clientSecret}`)}`,
        },
        request: { signal },
      }),
    );
  } catch (error) {
    if (error instanceof RequestError) {
      if (error.status === 404) {
        return;
      }
      throw new Error(`Failed to revoke GitHub OAuth grant (${error.status}).`);
    }
    throw error;
  }
}

export const storeGithubOauthConnection = internalMutation({
  args: {
    userId: v.id("users"),
    accessToken: v.string(),
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

    await ctx.runMutation(internal.githubOAuth.storeGithubOauthConnection, {
      userId: oauthState.userId,
      accessToken: token.accessToken,
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
