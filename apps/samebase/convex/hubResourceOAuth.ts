import * as oauth from "oauth4webapi";

import { internal } from "./_generated/api";
import { httpAction, internalAction, type ActionCtx, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { OAUTH_STATE_TTL_MS, readRequiredEnv } from "./oauthUtils";
import {
  buildAuthorizationCompletionResponse,
  classifyAuthorizationCallbackError,
} from "./authorizationCompletion";
import { buildAuthorizationErrorUrl } from "../shared/authorizationError";
import {
  buildProviderOAuthCompletionUrl,
  buildProviderOAuthDefaultReturnUrl,
  readProviderOAuthAppOrigin,
} from "../shared/providerOAuthReturn";
import { createUrlSearchParams } from "../shared/urlSearchParams";
import { openSecret, vSealedSecret } from "./sealedSecret";
import { organizationProviderCredentialAad } from "./organization/providerCredentialModel";

const resources = {
  convex: "https://api.convex.dev",
  cloudflare: "https://api.cloudflare.com/client/v4/",
} as const;

type ResourceProvider = keyof typeof resources;
type ResourceState = Exclude<Doc<"providerOAuthCallbackStates">, { provider: "cloudflare_mcp" }>;

function configuration() {
  const issuer = readRequiredEnv("RESOURCE_HUB_ISSUER");
  const authorizationServer: oauth.AuthorizationServer = {
    issuer,
    authorization_endpoint: `${issuer}/authorize`,
    token_endpoint: `${issuer}/token`,
    revocation_endpoint: `${issuer}/revoke`,
    authorization_response_iss_parameter_supported: true,
  };
  return {
    authorizationServer,
    client: { client_id: readRequiredEnv("RESOURCE_HUB_CLIENT_ID") },
  };
}

function authenticate() {
  return oauth.ClientSecretPost(readRequiredEnv("RESOURCE_HUB_CLIENT_SECRET"));
}

function callbackUrl() {
  return `${readRequiredEnv("CONVEX_SITE_URL").replace(/\/$/, "")}/oauth/hub/callback`;
}

export async function buildResourceOAuthUrl(
  ctx: Pick<ActionCtx | MutationCtx, "runMutation">,
  args: {
    provider: ResourceProvider;
    userId: Id<"users">;
    organizationId: Id<"organizations">;
    returnToPath?: string;
  },
): Promise<string> {
  const { authorizationServer, client } = configuration();
  const state = oauth.generateRandomState();
  const codeVerifier = oauth.generateRandomCodeVerifier();
  const now = Date.now();
  await ctx.runMutation(internal.oauthState.createOauthState, {
    provider: args.provider,
    userId: args.userId,
    organizationId: args.organizationId,
    returnToPath: args.returnToPath,
    state,
    codeVerifier,
    createdAt: now,
    expiresAt: now + OAUTH_STATE_TTL_MS,
  });
  const url = new URL(`${authorizationServer.issuer}/authorize`);
  url.search = createUrlSearchParams({
    client_id: client.client_id,
    redirect_uri: callbackUrl(),
    response_type: "code",
    state,
    resource: resources[args.provider],
    code_challenge: await oauth.calculatePKCECodeChallenge(codeVerifier),
    code_challenge_method: "S256",
  }).toString();
  return url.toString();
}

/** `finishResourceOAuth` validated the authorization response when the browser came back. */
export async function exchangeResourceOAuthCode(args: { code: string; oauthState: ResourceState }) {
  const { oauthState } = args;
  if (oauthState.codeVerifier === undefined)
    throw new Error("The OAuth request expired. Reconnect the provider.");
  const { authorizationServer, client } = configuration();
  const response = await oauth.genericTokenEndpointRequest(
    authorizationServer,
    client,
    authenticate(),
    "authorization_code",
    {
      code: args.code,
      redirect_uri: callbackUrl(),
      code_verifier: oauthState.codeVerifier,
      resource: resources[oauthState.provider],
    },
    { signal: AbortSignal.timeout(10_000) },
  );
  return await oauth.processGenericTokenEndpointResponse(authorizationServer, client, response);
}

export async function refreshResourceOAuthToken(refreshToken: string) {
  const { authorizationServer, client } = configuration();
  const response = await oauth.refreshTokenGrantRequest(
    authorizationServer,
    client,
    authenticate(),
    refreshToken,
    {
      additionalParameters: { resource: resources.cloudflare },
      signal: AbortSignal.timeout(10_000),
    },
  );
  return await oauth.processRefreshTokenResponse(authorizationServer, client, response);
}

export function cloudflareResourceTokens(
  tokens: oauth.TokenEndpointResponse,
  previousRefreshToken?: string,
) {
  const refreshToken = tokens.refresh_token ?? previousRefreshToken;
  if (refreshToken === undefined || tokens.expires_in === undefined) {
    throw new Error("Cloudflare authorization requires a refresh token and an expiry.");
  }
  return { accessToken: tokens.access_token, refreshToken, expiresIn: tokens.expires_in };
}

/** Revocation cannot prevent local removal or obscure a failed connection attempt. */
export async function revokeCloudflareRefreshToken(args: {
  refreshToken: string;
  organizationId: Id<"organizations">;
}) {
  try {
    const { authorizationServer, client } = configuration();
    const response = await oauth.revocationRequest(
      authorizationServer,
      client,
      authenticate(),
      args.refreshToken,
      {
        additionalParameters: { token_type_hint: "refresh_token" },
        signal: AbortSignal.timeout(10_000),
      },
    );
    await oauth.processRevocationResponse(response);
  } catch {
    console.warn("cloudflare:hub_grant_revocation_failed", { organizationId: args.organizationId });
  }
}

export const revokeCloudflareGrant = internalAction({
  args: { organizationId: v.id("organizations"), refreshCredential: vSealedSecret },
  returns: v.null(),
  handler: async (_ctx, { organizationId, refreshCredential }) => {
    await revokeCloudflareRefreshToken({
      refreshToken: await openSecret({
        sealed: refreshCredential,
        aad: organizationProviderCredentialAad(organizationId, "cloudflare.auth.refreshCredential"),
      }),
      organizationId,
    });
    return null;
  },
});

export const finishResourceOAuth = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  if (state === null) return new Response("Missing OAuth state", { status: 400 });
  const grant = await ctx.runQuery(internal.oauthState.getResourceOauthState, { state });
  if (grant === null) return new Response("Invalid OAuth state", { status: 400 });

  let providerError: string | undefined;
  try {
    const { authorizationServer, client } = configuration();
    oauth.validateAuthResponse(authorizationServer, client, url, grant.state);
  } catch (error) {
    if (error instanceof oauth.AuthorizationResponseError) {
      providerError = error.error;
    } else {
      return new Response("Invalid OAuth authorization response", { status: 400 });
    }
  }

  const appOrigin = readProviderOAuthAppOrigin({
    configuredAppUrl: process.env["SITE_URL"],
    requestUrl: request.url,
  });
  let returnUrl: string;
  try {
    const githubOwnerLogin = await ctx.runQuery(
      internal.organizations.getExternalReturnOwnerLogin,
      { organizationId: grant.organizationId },
    );
    returnUrl = buildProviderOAuthDefaultReturnUrl({
      appOrigin,
      githubOwnerLogin,
      returnToPath: grant.returnToPath,
    });
  } catch {
    await ctx.runMutation(internal.oauthState.deleteOauthState, { id: grant._id });
    return new Response("Organization unavailable", { status: 400 });
  }
  if (providerError !== undefined || grant.expiresAt < Date.now()) {
    await ctx.runMutation(internal.oauthState.deleteOauthState, { id: grant._id });
    returnUrl = buildAuthorizationErrorUrl(returnUrl, {
      provider: grant.provider,
      code:
        providerError === undefined ? "expired" : classifyAuthorizationCallbackError(providerError),
    });
  } else {
    const code = url.searchParams.get("code");
    if (code === null) return new Response("Missing OAuth code", { status: 400 });
    returnUrl = buildProviderOAuthCompletionUrl({
      appOrigin,
      completion: {
        provider: grant.provider,
        state: grant.state,
        code,
      },
    });
  }
  return buildAuthorizationCompletionResponse({
    eventType: grant.provider === "convex" ? "convex-oauth-complete" : "cloudflare-oauth-complete",
    returnUrl,
    title: "Provider authorization",
  });
});
