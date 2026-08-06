import { v } from "convex/values";
import { httpAction, internalMutation } from "./_generated/server";
import type { ActionCtx, MutationCtx } from "./_generated/server";
import { z } from "zod";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { mutation } from "./functions";
import { requireOrganizationOwnerAccessContext } from "./organizationAccess";
import { getSelectedProviderConnectionForOrganization } from "./providerConnections";
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
import { buildProviderOAuthDefaultReturnUrl } from "../shared/providerOAuthReturn";
import { buildUrlWithSearchParams, createUrlSearchParams } from "../shared/urlSearchParams";

const CONVEX_AUTHORIZE_URL = "https://dashboard.convex.dev/oauth/authorize/team";
const DEFAULT_OAUTH_TIMEOUT_MS = 10_000;

type OAuthContext = ActionCtx | MutationCtx;
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

const convexOAuthNonEmptyString = z.string().min(1);
const convexOAuthRedirectUri = convexOAuthNonEmptyString.url();
const convexOAuthAuthorizeRequestSchema = z.strictObject({
  client_id: convexOAuthNonEmptyString,
  redirect_uri: convexOAuthRedirectUri,
  response_type: z.literal("code"),
  state: convexOAuthNonEmptyString,
  code_challenge: convexOAuthNonEmptyString,
  code_challenge_method: z.literal("S256"),
});
const convexOAuthTokenRequestSchema = z.strictObject({
  grant_type: z.literal("authorization_code"),
  client_id: convexOAuthNonEmptyString,
  client_secret: convexOAuthNonEmptyString,
  code: convexOAuthNonEmptyString,
  code_verifier: convexOAuthNonEmptyString,
  redirect_uri: convexOAuthRedirectUri,
});
type ConvexOAuthAuthorizeRequest = z.infer<typeof convexOAuthAuthorizeRequestSchema>;
type ConvexOAuthTokenRequest = z.infer<typeof convexOAuthTokenRequestSchema>;

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
  args: {
    userId: Id<"users">;
    organizationId: Id<"organizations">;
    providerConnectionId?: Id<"providerConnections">;
  },
): Promise<string> {
  const clientId = readRequiredEnv("PROVIDER_CONVEX_OAUTH_CLIENT_ID");
  const redirectUri = readRequiredEnv("PROVIDER_CONVEX_OAUTH_REDIRECT_URL");

  const state = randomToken();
  const codeVerifier = randomToken(64);
  const codeChallenge = await createCodeChallenge(codeVerifier);

  const now = Date.now();
  await ctx.runMutation(internal.oauthState.createOauthState, {
    provider: "convex",
    userId: args.userId,
    organizationId: args.organizationId,
    providerConnectionId: args.providerConnectionId,
    state,
    codeVerifier,
    createdAt: now,
    expiresAt: now + OAUTH_STATE_TTL_MS,
  });

  return encodeConvexOAuthAuthorizeUrl({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
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
    throw new Error(`Failed to call Convex OAuth endpoint ${endpoint.path} (${response.status}).`);
  }
  return endpoint.parseResponse(tokenPayload);
}

function encodeConvexOAuthTokenRequest(request: ConvexOAuthTokenRequest): string {
  return createUrlSearchParams(convexOAuthTokenRequestSchema.parse(request)).toString();
}

function encodeConvexOAuthAuthorizeUrl(request: ConvexOAuthAuthorizeRequest): string {
  return buildUrlWithSearchParams(
    CONVEX_AUTHORIZE_URL,
    convexOAuthAuthorizeRequestSchema.parse(request),
  );
}

export const storeConvexOauthTokens = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    connectedByUserId: v.id("users"),
    providerConnectionId: v.optional(v.id("providerConnections")),
    accessToken: v.string(),
    teamId: v.string(),
    oauthStateId: v.id("providerOAuthCallbackStates"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = {
      kind: "convex" as const,
      auth: {
        method: "oauth" as const,
        credential: args.accessToken,
      },
      teamId: args.teamId,
    };
    if (args.providerConnectionId !== undefined) {
      await ctx.runMutation(internal.providerConnections.reauthorizeConnected, {
        organizationId: args.organizationId,
        connectedByUserId: args.connectedByUserId,
        providerConnectionId: args.providerConnectionId,
        connection,
      });
    } else {
      await ctx.runMutation(internal.providerConnections.createConnected, {
        organizationId: args.organizationId,
        connectedByUserId: args.connectedByUserId,
        connection,
      });
    }
    await ctx.db.delete(args.oauthStateId);
    return null;
  },
});

export const getConvexOAuthUrl = mutation({
  access: "access_provider_connections",
  args: {
    organizationId: v.id("organizations"),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const { organizationId } = await requireOrganizationOwnerAccessContext(ctx.db, {
      userId: ctx.viewer.userId,
      organizationId: args.organizationId,
    });
    const connection = await getSelectedProviderConnectionForOrganization(ctx.db, {
      organizationId,
      kind: "convex",
    });
    return await buildConvexOAuthUrl(ctx, {
      userId: ctx.viewer.userId,
      organizationId,
      providerConnectionId: connection?._id,
    });
  },
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
      organizationId: oauthState.organizationId,
      connectedByUserId: oauthState.userId,
      providerConnectionId: oauthState.providerConnectionId,
      accessToken: token.accessToken,
      teamId: details.teamId,
      oauthStateId: oauthState._id,
    });
  } catch (error) {
    await ctx.runMutation(internal.oauthState.deleteOauthState, {
      id: oauthState._id,
    });
    console.error("convex:oauth:exchange_failed", {
      organizationId: oauthState.organizationId,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return new Response("Convex OAuth exchange failed", { status: 400 });
  }

  const returnUrl = buildProviderOAuthDefaultReturnUrl({
    configuredAppUrl: process.env["SITE_URL"] ?? process.env["CONVEX_SITE_URL"],
    requestUrl: request.url,
  });
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
