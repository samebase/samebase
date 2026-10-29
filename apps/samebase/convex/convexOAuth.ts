import { v } from "convex/values";
import { httpAction, internalMutation } from "./_generated/server";
import type { ActionCtx, MutationCtx } from "./_generated/server";
import { z } from "zod";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation } from "./functions";
import { requireOrganizationOwnerAccessContext } from "./organizationAccess";
import { connectConvexCredential } from "./organizationProviderCredentials";
import { organizationProviderCredentialAad } from "./organization/providerCredentialModel";
import { sealSecret, vSealedSecret } from "./sealedSecret";
import { vProviderOAuthStoreResult, type ProviderOAuthStoreResult } from "./oauthState";
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
import {
  buildProviderOAuthCompletionUrl,
  buildProviderOAuthDefaultReturnUrl,
  readProviderOAuthAppOrigin,
} from "../shared/providerOAuthReturn";
import { buildUrlWithSearchParams, createUrlSearchParams } from "../shared/urlSearchParams";
import { buildAuthorizationErrorUrl } from "../shared/authorizationError";
import {
  buildAuthorizationCompletionResponse,
  buildProviderOAuthStoreReturnUrl,
  classifyAuthorizationCallbackError,
} from "./authorizationCompletion";

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
    returnToPath?: string;
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
    returnToPath: args.returnToPath,
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
    expectedProviderSnapshotHash: v.string(),
    accessToken: vSealedSecret,
    teamId: v.string(),
    oauthStateId: v.id("providerOAuthCallbackStates"),
    oauthState: v.string(),
  },
  returns: vProviderOAuthStoreResult,
  handler: async (ctx, args) => {
    return await connectConvexCredential(ctx, {
      organizationId: args.organizationId,
      connectedByUserId: args.connectedByUserId,
      expectedProviderSnapshotHash: args.expectedProviderSnapshotHash,
      auth: {
        method: "oauth",
        credential: args.accessToken,
      },
      teamId: args.teamId,
      oauthStateId: args.oauthStateId,
      oauthState: args.oauthState,
    });
  },
});

export const getConvexOAuthUrl = mutation({
  access: "access_provider_connections",
  args: {
    organizationId: v.id("organizations"),
    returnToPath: v.optional(v.string()),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const { organizationId } = await requireOrganizationOwnerAccessContext(ctx.db, {
      userId: ctx.viewer.userId,
      organizationId: args.organizationId,
    });
    return await buildConvexOAuthUrl(ctx, {
      userId: ctx.viewer.userId,
      organizationId,
      returnToPath: args.returnToPath,
    });
  },
});

export const finishConvexOAuth = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (state === null) {
    return new Response("Missing OAuth parameters", { status: 400 });
  }

  const oauthState = await ctx.runQuery(internal.oauthState.getOauthStateByState, {
    provider: "convex",
    state,
  });

  if (!oauthState) {
    return new Response("Invalid OAuth state", { status: 400 });
  }
  if (oauthState.provider !== "convex") {
    return new Response("Invalid OAuth state", { status: 400 });
  }

  let appOrigin: URL;
  let returnUrl: string;
  try {
    const githubOwnerLogin: string = await ctx.runQuery(
      internal.organizations.getExternalReturnOwnerLogin,
      {
        organizationId: oauthState.organizationId,
      },
    );
    appOrigin = readProviderOAuthAppOrigin({
      configuredAppUrl: process.env["SITE_URL"] ?? process.env["CONVEX_SITE_URL"],
      requestUrl: request.url,
    });
    returnUrl = buildProviderOAuthDefaultReturnUrl({
      appOrigin,
      githubOwnerLogin,
      returnToPath: oauthState.returnToPath,
    });
  } catch {
    await ctx.runMutation(internal.oauthState.deleteOauthState, {
      id: oauthState._id,
    });
    return new Response("Organization unavailable", { status: 400 });
  }

  if (oauthState.expiresAt < Date.now()) {
    await ctx.runMutation(internal.oauthState.deleteOauthState, {
      id: oauthState._id,
    });
    console.log("convex:oauth:callback_completed", {
      organizationId: oauthState.organizationId,
      outcome: "expired",
    });
    return buildAuthorizationCompletionResponse({
      eventType: "convex-oauth-complete",
      returnUrl: buildAuthorizationErrorUrl(returnUrl, {
        provider: "convex",
        code: "expired",
      }),
      title: "Convex OAuth",
    });
  }

  if (error !== null) {
    const errorCode = classifyAuthorizationCallbackError(error);
    await ctx.runMutation(internal.oauthState.deleteOauthState, {
      id: oauthState._id,
    });
    console.log("convex:oauth:callback_completed", {
      organizationId: oauthState.organizationId,
      outcome: errorCode,
    });
    return buildAuthorizationCompletionResponse({
      eventType: "convex-oauth-complete",
      returnUrl: buildAuthorizationErrorUrl(returnUrl, {
        provider: "convex",
        code: errorCode,
      }),
      title: "Convex OAuth",
    });
  }

  if (code === null) {
    await ctx.runMutation(internal.oauthState.deleteOauthState, {
      id: oauthState._id,
    });
    return buildAuthorizationCompletionResponse({
      eventType: "convex-oauth-complete",
      returnUrl: buildAuthorizationErrorUrl(returnUrl, {
        provider: "convex",
        code: "failed",
      }),
      title: "Convex OAuth",
    });
  }

  // This origin has no app session. The app completion page links the credential
  // only for the signed-in user who started this authorization.
  return buildAuthorizationCompletionResponse({
    eventType: "convex-oauth-complete",
    returnUrl: buildProviderOAuthCompletionUrl({
      appOrigin,
      completion: { provider: "convex", state, code },
    }),
    title: "Convex OAuth",
  });
});

/**
Exchanges a Convex authorization code for the owner who started `oauthState`
and stores the team token for that organization. The caller has already
checked that the signed-in user is `oauthState.userId`. Returns `returnUrl`
with the outcome for the Providers page.
*/
export async function completeConvexOAuth(
  ctx: ActionCtx,
  args: {
    code: string;
    oauthState: Extract<Doc<"providerOAuthCallbackStates">, { provider: "convex" }>;
    returnUrl: string;
  },
): Promise<string> {
  const { code, oauthState, returnUrl } = args;

  if (!oauthState.codeVerifier) {
    await ctx.runMutation(internal.oauthState.deleteOauthState, {
      id: oauthState._id,
    });
    return buildAuthorizationErrorUrl(returnUrl, {
      provider: "convex",
      code: "failed",
    });
  }

  try {
    await ctx.runQuery(internal.organizationAccess.requireOrganizationOwnerIdForUser, {
      userId: oauthState.userId,
      organizationId: oauthState.organizationId,
    });
  } catch {
    await ctx.runMutation(internal.oauthState.deleteOauthState, {
      id: oauthState._id,
    });
    console.log("convex:oauth:callback_completed", {
      organizationId: oauthState.organizationId,
      outcome: "access-changed",
    });
    return buildAuthorizationErrorUrl(returnUrl, {
      provider: "convex",
      code: "access-changed",
    });
  }

  let completionReturnUrl = returnUrl;
  try {
    const clientId = readRequiredEnv("PROVIDER_CONVEX_OAUTH_CLIENT_ID");
    const clientSecret = readRequiredEnv("PROVIDER_CONVEX_OAUTH_CLIENT_SECRET");
    const redirectUri = readRequiredEnv("PROVIDER_CONVEX_OAUTH_REDIRECT_URL");
    const token = await exchangeConvexOAuthCode({
      code,
      codeVerifier: oauthState.codeVerifier,
      clientId,
      clientSecret,
      redirectUri,
    });

    const details = await fetchConvexTeamTokenDetails(token.accessToken);

    const storeResult: ProviderOAuthStoreResult = await ctx.runMutation(
      internal.convexOAuth.storeConvexOauthTokens,
      {
        organizationId: oauthState.organizationId,
        connectedByUserId: oauthState.userId,
        expectedProviderSnapshotHash: oauthState.expectedProviderSnapshotHash,
        accessToken: await sealSecret(ctx, {
          plaintext: token.accessToken,
          aad: organizationProviderCredentialAad(
            oauthState.organizationId,
            "convex.auth.credential",
          ),
        }),
        teamId: details.teamId,
        oauthStateId: oauthState._id,
        oauthState: oauthState.state,
      },
    );
    completionReturnUrl = buildProviderOAuthStoreReturnUrl({
      provider: "convex",
      returnUrl,
      storeResult,
    });
    if (storeResult.status !== "stored") {
      console.log("convex:oauth:callback_completed", {
        organizationId: oauthState.organizationId,
        outcome: storeResult.status,
      });
    }
  } catch (error) {
    await ctx.runMutation(internal.oauthState.deleteOauthState, {
      id: oauthState._id,
    });
    console.error("convex:oauth:exchange_failed", {
      organizationId: oauthState.organizationId,
      outcome: "failed",
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    completionReturnUrl = buildAuthorizationErrorUrl(returnUrl, {
      provider: "convex",
      code: "failed",
    });
  }

  return completionReturnUrl;
}
