import { v } from "convex/values";
import { httpAction, internalMutation, mutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import {
  createCodeChallenge,
  OAUTH_STATE_TTL_MS,
  randomToken,
  readRequiredEnv,
} from "./oauthUtils";

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

  const response = await fetch("https://api.convex.dev/oauth/token", {
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
    refreshToken: typeof data.refresh_token === "string" ? data.refresh_token : undefined,
    expiresIn: typeof data.expires_in === "number" ? data.expires_in : undefined,
  };
}

async function fetchConvexTokenDetails(accessToken: string): Promise<{
  teamId?: string;
  teamSlug?: string;
  teamName?: string;
  userId?: string;
}> {
  const response = await fetch("https://api.convex.dev/v1/token_details", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || !data) {
    throw new Error(`Failed to fetch Convex token details (${response.status}).`);
  }

  const teamId =
    typeof data.teamId === "string"
      ? data.teamId
      : typeof data.teamId === "number"
        ? String(data.teamId)
      : typeof data.team_id === "string"
        ? data.team_id
        : typeof data.team_id === "number"
          ? String(data.team_id)
        : typeof data.team?.id === "string"
          ? data.team.id
          : typeof data.team?.id === "number"
            ? String(data.team.id)
          : undefined;

  const teamSlug =
    typeof data.teamSlug === "string"
      ? data.teamSlug
      : typeof data.team_slug === "string"
        ? data.team_slug
        : typeof data.team?.slug === "string"
          ? data.team.slug
          : undefined;

  const teamName =
    typeof data.name === "string"
      ? data.name
      : typeof data.team?.name === "string"
        ? data.team.name
        : undefined;

  const userId =
    typeof data.userId === "string"
      ? data.userId
      : typeof data.user_id === "string"
        ? data.user_id
        : typeof data.user?.id === "string"
          ? data.user.id
          : undefined;

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
    teamId: v.optional(v.string()),
    teamSlug: v.optional(v.string()),
    providerUserId: v.optional(v.string()),
    oauthStateId: v.id("oauthStates"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      convexAccessToken: args.accessToken,
      convexRefreshToken: args.refreshToken,
      convexExpiresAt: args.expiresAt,
      convexTeamId: args.teamId,
      convexTeamSlug: args.teamSlug,
      convexUserId: args.providerUserId,
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

    const clientId = readRequiredEnv("CONVEX_OAUTH_CLIENT_ID");
    const redirectUri = readRequiredEnv("CONVEX_OAUTH_REDIRECT_URL");

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

    const authorizeUrl = new URL(
      "https://dashboard.convex.dev/oauth/authorize/team",
    );
    authorizeUrl.searchParams.set("client_id", clientId);
    authorizeUrl.searchParams.set("redirect_uri", redirectUri);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("state", state);
    authorizeUrl.searchParams.set("code_challenge", codeChallenge);
    authorizeUrl.searchParams.set("code_challenge_method", "S256");

    return authorizeUrl.toString();
  },
});

export const startConvexOAuth = httpAction(async (ctx) => {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const clientId = readRequiredEnv("CONVEX_OAUTH_CLIENT_ID");
  const redirectUri = readRequiredEnv("CONVEX_OAUTH_REDIRECT_URL");

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

  const authorizeUrl = new URL(
    "https://dashboard.convex.dev/oauth/authorize/team",
  );
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("code_challenge", codeChallenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");

  return Response.redirect(authorizeUrl.toString(), 302);
});

export const finishConvexOAuth = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) {
    return new Response("Missing OAuth parameters", { status: 400 });
  }

  const oauthState = await ctx.runQuery(internal.oauthState.getOauthStateByState, {
    provider: "convex",
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

  if (!oauthState.codeVerifier) {
    await ctx.runMutation(internal.oauthState.deleteOauthState, {
      id: oauthState._id,
    });
    return new Response("OAuth state missing code verifier", { status: 400 });
  }

  const clientId = readRequiredEnv("CONVEX_OAUTH_CLIENT_ID");
  const clientSecret = readRequiredEnv("CONVEX_OAUTH_CLIENT_SECRET");
  const redirectUri = readRequiredEnv("CONVEX_OAUTH_REDIRECT_URL");

  try {
    const token = await exchangeConvexOAuthCode({
      code,
      codeVerifier: oauthState.codeVerifier,
      clientId,
      clientSecret,
      redirectUri,
    });

    const details = await fetchConvexTokenDetails(token.accessToken);
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
      teamSlug: details.teamSlug ?? details.teamName,
      providerUserId: details.userId,
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
