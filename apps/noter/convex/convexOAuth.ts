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
import { fetchConvexTeamTokenDetails } from "./convexManagementApi/client";
import {
  parseConvexOAuthTokenResponse,
  type ConvexOAuthTokenResponse,
} from "./convexManagementApi/oauthToken";

const CONVEX_AUTHORIZE_URL =
  "https://dashboard.convex.dev/oauth/authorize/team";
const DEFAULT_OAUTH_TIMEOUT_MS = 10_000;

type OAuthContext = ActionCtx | MutationCtx;
type ConvexOAuthTokenRequest = {
  grant_type: "authorization_code";
  client_id: string;
  client_secret: string;
  code: string;
  code_verifier: string;
  redirect_uri: string;
};
type ConvexOAuthTokenEndpoint = {
  path: "/oauth/token";
  url: string;
  method: "POST";
  requestContentType: "application/x-www-form-urlencoded";
  encodeRequest(request: ConvexOAuthTokenRequest): string;
  parseResponse(payload: unknown): ConvexOAuthTokenResponse;
};
type ConvexOAuthCodeExchangeResult = {
  accessToken: string;
};

const CONVEX_OAUTH_TOKEN_ENDPOINT = {
  path: "/oauth/token",
  url: "https://api.convex.dev/oauth/token",
  method: "POST",
  requestContentType: "application/x-www-form-urlencoded",
  encodeRequest: encodeConvexOAuthTokenRequest,
  parseResponse: parseConvexOAuthTokenResponse,
} satisfies ConvexOAuthTokenEndpoint;

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
}): Promise<ConvexOAuthCodeExchangeResult> {
  const tokenRequest: ConvexOAuthTokenRequest = {
    grant_type: "authorization_code",
    client_id: args.clientId,
    client_secret: args.clientSecret,
    code: args.code,
    code_verifier: args.codeVerifier,
    redirect_uri: args.redirectUri,
  };
  const data = await requestConvexOAuthToken(tokenRequest);

  return {
    accessToken: data.access_token,
  };
}

async function requestConvexOAuthToken(
  request: ConvexOAuthTokenRequest,
): Promise<ConvexOAuthTokenResponse> {
  const endpoint = CONVEX_OAUTH_TOKEN_ENDPOINT;
  const response = await fetchWithTimeout(endpoint.url, {
    method: endpoint.method,
    headers: {
      "Content-Type": endpoint.requestContentType,
    },
    body: endpoint.encodeRequest(request),
  });

  const tokenPayload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      `Failed to call Convex OAuth endpoint ${endpoint.path} (${response.status}).`,
    );
  }
  return endpoint.parseResponse(tokenPayload);
}

function encodeConvexOAuthTokenRequest(
  request: ConvexOAuthTokenRequest,
): string {
  const body = new URLSearchParams();
  body.set("grant_type", request.grant_type);
  body.set("client_id", request.client_id);
  body.set("client_secret", request.client_secret);
  body.set("code", request.code);
  body.set("code_verifier", request.code_verifier);
  body.set("redirect_uri", request.redirect_uri);
  return body.toString();
}

export const storeConvexOauthTokens = internalMutation({
  args: {
    userId: v.id("users"),
    accessToken: v.string(),
    teamId: v.string(),
    oauthStateId: v.id("oauthStates"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.providerConnections.upsertConvex, {
      userId: args.userId,
      auth: {
        method: "oauth",
        credential: args.accessToken,
      },
      teamId: args.teamId,
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

    const details = await fetchConvexTeamTokenDetails(token.accessToken);

    await ctx.runMutation(internal.convexOAuth.storeConvexOauthTokens, {
      userId: oauthState.userId,
      accessToken: token.accessToken,
      teamId: details.teamId,
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
