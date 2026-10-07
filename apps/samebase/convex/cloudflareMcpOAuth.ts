import { v } from "convex/values";
import { httpAction, internalMutation } from "./_generated/server";
import type { ActionCtx, MutationCtx } from "./_generated/server";
import { z } from "zod";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action } from "./functions";
import {
  createCodeChallenge,
  OAUTH_STATE_TTL_MS,
  randomToken,
  readRequiredEnv,
} from "./oauthUtils";
import { isRecord } from "./jsonUtils";
import { deriveMcpTokenStatusFromExpiry } from "./mcpTokenHealth";
import { vProviderOAuthStoreResult, type ProviderOAuthStoreResult } from "./oauthState";
import { connectCloudflareCredential } from "./organizationProviderCredentials";
import {
  listCloudflareAccountsForToken,
  resolveCloudflareAccountAfterAuthorization,
  vCloudflareAccount,
} from "./cloudflareAccountDiscovery";
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

const CLOUDFLARE_MCP_OAUTH_ISSUER = "https://mcp.cloudflare.com";
const CLOUDFLARE_MCP_AUTHORIZATION_URL = `${CLOUDFLARE_MCP_OAUTH_ISSUER}/authorize`;
const CLOUDFLARE_MCP_TOKEN_URL = `${CLOUDFLARE_MCP_OAUTH_ISSUER}/token`;
const CLOUDFLARE_MCP_REGISTRATION_URL = `${CLOUDFLARE_MCP_OAUTH_ISSUER}/register`;
const DEFAULT_OAUTH_TIMEOUT_MS = 10_000;
/**
 * Samebase needs the Cloudflare MCP Code Mode scopes that cover account
 * discovery, Worker management, and Workers Builds setup without the full
 * access template.
 *
 * Cloudflare MCP scope registry:
 * https://github.com/cloudflare/mcp/blob/main/src/auth/scopes.ts
 */
export const CLOUDFLARE_MCP_OAUTH_SCOPES = [
  "user:read",
  "account:read",
  "offline_access",
  "workers:read",
  "workers:write",
  "workers_scripts:write",
  "workers_builds:read",
  "workers_builds:write",
] as const;
const CLOUDFLARE_OAUTH_ERROR_MESSAGE_KEYS = [
  "error",
  "error_description",
  "message",
  "detail",
  "statusText",
] as const;
const { id, number, optional, string, union } = v;

type OAuthContext = ActionCtx | MutationCtx;
export type CloudflareOAuthTokenOperation =
  | "exchange Cloudflare OAuth code"
  | "refresh Cloudflare OAuth token";
type CloudflareMcpAuthorizeSearchParams = {
  response_type: "code";
  client_id: string;
  redirect_uri: string;
  state: string;
  code_challenge: string;
  code_challenge_method: "S256";
  scope: string;
};
type CloudflareMcpTokenExchangeSearchParams = {
  grant_type: "authorization_code";
  client_id: string;
  code: string;
  redirect_uri: string;
  code_verifier: string;
};
type CloudflareMcpTokenRefreshSearchParams = {
  grant_type: "refresh_token";
  client_id: string;
  refresh_token: string;
};
const nonEmptyString = z.string().min(1);
const cloudflareMcpClientRegistrationResponseSchema = z.object({
  client_id: nonEmptyString,
});
const cloudflareMcpTokenResponseSchema = z.object({
  access_token: nonEmptyString,
  refresh_token: nonEmptyString,
  expires_in: z.number(),
});
type CloudflareMcpTokenResponse = z.infer<typeof cloudflareMcpTokenResponseSchema>;

export async function fetchWithTimeout(
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
      throw new Error(`Cloudflare OAuth request timed out after ${timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function redactCloudflareOAuthErrorDetail(value: string): string {
  return value
    .replace(
      /((?:^|[?&])(?:access_token|code|code_verifier|refresh_token|state)=)[^&\s]+/gi,
      "$1<redacted>",
    )
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "<redacted>");
}

/**
 * Formats provider-owned OAuth endpoint errors for logs without leaking
 * credentials: known message fields are deduped, OAuth-bearing values are
 * redacted, long output is bounded, and empty records return no detail.
 */
export function formatCloudflareOAuthEndpointError(payload: unknown): string | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }

  const segments: string[] = [];
  for (const key of CLOUDFLARE_OAUTH_ERROR_MESSAGE_KEYS) {
    const value = payload[key];
    if (typeof value !== "string") {
      continue;
    }
    const segment = value.trim();
    if (segment && !segments.includes(segment)) {
      segments.push(segment);
    }
  }

  if (segments.length === 0) {
    return undefined;
  }

  const detail = redactCloudflareOAuthErrorDetail(segments.join(": "));
  if (detail.length <= 240) {
    return detail;
  }
  return `${detail.slice(0, 237)}...`;
}

export function formatCloudflareOAuthRequestFailure(args: {
  operation: CloudflareOAuthTokenOperation;
  status: number;
  payload: unknown;
}): Error {
  const detail = formatCloudflareOAuthEndpointError(args.payload);
  const message = `Failed to ${args.operation} (${args.status})`;
  if (!detail) {
    return new Error(`${message}.`);
  }
  return new Error(`${message}: ${detail}.`);
}

function parseCloudflareMcpTokenResponse(
  payload: unknown,
  operation: CloudflareOAuthTokenOperation,
): CloudflareMcpTokenResponse {
  const result = cloudflareMcpTokenResponseSchema.safeParse(payload);
  if (!result.success) {
    throw new Error(
      `Failed to ${operation}: Cloudflare token response failed schema validation: ${z.prettifyError(result.error)}`,
    );
  }
  return result.data;
}

export function buildCloudflareMcpAuthorizeSearchParams(args: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): CloudflareMcpAuthorizeSearchParams {
  return {
    response_type: "code",
    client_id: args.clientId,
    redirect_uri: args.redirectUri,
    state: args.state,
    code_challenge: args.codeChallenge,
    code_challenge_method: "S256",
    scope: CLOUDFLARE_MCP_OAUTH_SCOPES.join(" "),
  };
}

export function buildCloudflareMcpAuthorizeUrl(args: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  return buildUrlWithSearchParams(
    CLOUDFLARE_MCP_AUTHORIZATION_URL,
    buildCloudflareMcpAuthorizeSearchParams(args),
  );
}

async function registerCloudflareMcpClient(args: { redirectUri: string }) {
  const response = await fetchWithTimeout(CLOUDFLARE_MCP_REGISTRATION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      redirect_uris: [args.redirectUri],
      token_endpoint_auth_method: "none",
      response_types: ["code"],
      grant_types: ["authorization_code", "refresh_token"],
      client_name: "Samebase",
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`Failed to register Cloudflare OAuth client (${response.status}).`);
  }
  const registration = cloudflareMcpClientRegistrationResponseSchema.safeParse(payload);
  if (!registration.success) {
    throw new Error(
      `Failed to register Cloudflare OAuth client: response failed schema validation: ${z.prettifyError(registration.error)}`,
    );
  }

  console.log("cloudflare:mcp_oauth:client_registered", {
    redirectUri: args.redirectUri,
    clientIdLength: registration.data.client_id.length,
  });

  return registration.data;
}

async function exchangeCloudflareMcpOAuthCode(args: {
  code: string;
  codeVerifier: string;
  clientId: string;
  redirectUri: string;
}): Promise<CloudflareMcpTokenResponse> {
  const payload = createUrlSearchParams({
    grant_type: "authorization_code",
    client_id: args.clientId,
    code: args.code,
    redirect_uri: args.redirectUri,
    code_verifier: args.codeVerifier,
  } satisfies CloudflareMcpTokenExchangeSearchParams);

  const response = await fetchWithTimeout(CLOUDFLARE_MCP_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: payload.toString(),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw formatCloudflareOAuthRequestFailure({
      operation: "exchange Cloudflare OAuth code",
      status: response.status,
      payload: data,
    });
  }

  return parseCloudflareMcpTokenResponse(data, "exchange Cloudflare OAuth code");
}

export async function refreshCloudflareMcpOAuthToken(args: {
  refreshToken: string;
  clientId: string;
}): Promise<CloudflareMcpTokenResponse> {
  const payload = createUrlSearchParams({
    grant_type: "refresh_token",
    client_id: args.clientId,
    refresh_token: args.refreshToken,
  } satisfies CloudflareMcpTokenRefreshSearchParams);

  const response = await fetchWithTimeout(CLOUDFLARE_MCP_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: payload.toString(),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw formatCloudflareOAuthRequestFailure({
      operation: "refresh Cloudflare OAuth token",
      status: response.status,
      payload: data,
    });
  }

  return parseCloudflareMcpTokenResponse(data, "refresh Cloudflare OAuth token");
}

async function buildCloudflareMcpOAuthUrl(
  ctx: OAuthContext,
  args: {
    userId: Id<"users">;
    organizationId: Id<"organizations">;
    returnToPath?: string;
  },
): Promise<string> {
  const redirectUri = readRequiredEnv("PROVIDER_CLOUDFLARE_MCP_REDIRECT_URL");

  const state = randomToken();
  const codeVerifier = randomToken(64);
  const codeChallenge = await createCodeChallenge(codeVerifier);
  const registeredClient = await registerCloudflareMcpClient({ redirectUri });
  const clientId = registeredClient.client_id;

  const now = Date.now();
  await ctx.runMutation(internal.oauthState.createOauthState, {
    provider: "cloudflare_mcp",
    userId: args.userId,
    organizationId: args.organizationId,
    returnToPath: args.returnToPath,
    state,
    codeVerifier,
    clientId,
    createdAt: now,
    expiresAt: now + OAUTH_STATE_TTL_MS,
  });

  console.log("cloudflare:mcp_oauth:url_built", {
    organizationId: args.organizationId,
    redirectUri,
    clientIdLength: clientId.length,
    oauthStateExpiresAt: now + OAUTH_STATE_TTL_MS,
  });

  return buildCloudflareMcpAuthorizeUrl({
    clientId,
    redirectUri,
    state,
    codeChallenge,
  });
}

const storeCloudflareMcpOauthConnectionArgs = {
  organizationId: id("organizations"),
  connectedByUserId: id("users"),
  expectedProviderSnapshotHash: string(),
  accessToken: string(),
  refreshToken: string(),
  expiresAt: number(),
  clientId: string(),
  account: union(vCloudflareAccount, v.null()),
  oauthStateId: id("providerOAuthCallbackStates"),
  oauthState: string(),
} as const;
export const storeCloudflareMcpOauthConnection = internalMutation({
  args: storeCloudflareMcpOauthConnectionArgs,
  returns: vProviderOAuthStoreResult,
  handler: async (ctx, args) => {
    const checkedAt = Date.now();
    const result = await connectCloudflareCredential(ctx, {
      organizationId: args.organizationId,
      connectedByUserId: args.connectedByUserId,
      expectedProviderSnapshotHash: args.expectedProviderSnapshotHash,
      auth: {
        method: "mcp_oauth",
        credential: args.accessToken,
        refreshCredential: args.refreshToken,
        credentialExpiresAt: args.expiresAt,
        clientId: args.clientId,
      },
      account: args.account,
      tokenHealth: {
        status: deriveMcpTokenStatusFromExpiry(args.expiresAt, checkedAt),
        checkedAt,
        expiresAt: args.expiresAt,
        source: "expiry_metadata",
      },
      oauthStateId: args.oauthStateId,
      oauthState: args.oauthState,
    });
    if (result.status === "stored") {
      console.log("cloudflare:mcp_oauth:connection_stored", {
        organizationId: args.organizationId,
        clientIdLength: args.clientId.length,
        expiresAt: args.expiresAt,
      });
    }
    return result;
  },
});

export const getCloudflareMcpOAuthUrl = action({
  access: "access_provider_connections",
  args: {
    organizationId: id("organizations"),
    returnToPath: optional(string()),
  },
  returns: string(),
  handler: async (ctx, args): Promise<string> => {
    const organizationId = await ctx.runQuery(
      internal.organizationAccess.requireOrganizationOwnerIdForUser,
      {
        userId: ctx.viewer.userId,
        organizationId: args.organizationId,
      },
    );
    return await buildCloudflareMcpOAuthUrl(ctx, {
      userId: ctx.viewer.userId,
      organizationId,
      returnToPath: args.returnToPath,
    });
  },
});

export const finishCloudflareMcpOAuth = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (error !== null) {
    console.log("cloudflare:mcp_oauth:callback_provider_error", {
      statePresent: state !== null,
      errorPresent: error.length > 0,
      errorDescriptionPresent: errorDescription !== null,
    });
  }

  if (state === null) {
    console.log("cloudflare:mcp_oauth:callback_missing_params", {
      hasCode: code !== null,
      hasState: false,
    });
    return new Response("Missing OAuth parameters", { status: 400 });
  }

  const oauthState = await ctx.runQuery(internal.oauthState.getOauthStateByState, {
    provider: "cloudflare_mcp",
    state,
  });

  if (!oauthState) {
    console.log("cloudflare:mcp_oauth:callback_invalid_state", {
      stateLength: state.length,
    });
    return new Response("Invalid OAuth state", { status: 400 });
  }
  if (oauthState.provider !== "cloudflare_mcp") {
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
    console.log("cloudflare:mcp_oauth:callback_completed", {
      organizationId: oauthState.organizationId,
      outcome: "expired",
    });
    return buildAuthorizationCompletionResponse({
      eventType: "cloudflare-mcp-oauth-complete",
      returnUrl: buildAuthorizationErrorUrl(returnUrl, {
        provider: "cloudflare",
        code: "expired",
      }),
      title: "Cloudflare OAuth",
    });
  }

  if (error !== null) {
    const errorCode = classifyAuthorizationCallbackError(error);
    await ctx.runMutation(internal.oauthState.deleteOauthState, {
      id: oauthState._id,
    });
    console.log("cloudflare:mcp_oauth:callback_completed", {
      organizationId: oauthState.organizationId,
      outcome: errorCode,
    });
    return buildAuthorizationCompletionResponse({
      eventType: "cloudflare-mcp-oauth-complete",
      returnUrl: buildAuthorizationErrorUrl(returnUrl, {
        provider: "cloudflare",
        code: errorCode,
      }),
      title: "Cloudflare OAuth",
    });
  }

  if (code === null) {
    await ctx.runMutation(internal.oauthState.deleteOauthState, {
      id: oauthState._id,
    });
    return buildAuthorizationCompletionResponse({
      eventType: "cloudflare-mcp-oauth-complete",
      returnUrl: buildAuthorizationErrorUrl(returnUrl, {
        provider: "cloudflare",
        code: "failed",
      }),
      title: "Cloudflare OAuth",
    });
  }

  // This origin has no app session. The app completion page links the credential
  // only for the signed-in user who started this authorization.
  return buildAuthorizationCompletionResponse({
    eventType: "cloudflare-mcp-oauth-complete",
    returnUrl: buildProviderOAuthCompletionUrl({
      appOrigin,
      completion: { provider: "cloudflare_mcp", state, code },
    }),
    title: "Cloudflare OAuth",
  });
});

/**
Exchanges a Cloudflare MCP authorization code for the owner who started
`oauthState` and stores the grant for that organization. The caller has already
checked that the signed-in user is `oauthState.userId`. Returns `returnUrl`
with the outcome for the Providers page.
*/
export async function completeCloudflareMcpOAuth(
  ctx: ActionCtx,
  args: {
    code: string;
    oauthState: Extract<Doc<"providerOAuthCallbackStates">, { provider: "cloudflare_mcp" }>;
    returnUrl: string;
  },
): Promise<string> {
  const { code, oauthState, returnUrl } = args;
  const clientId = oauthState.clientId;
  const codeVerifier = oauthState.codeVerifier;

  try {
    await ctx.runQuery(internal.organizationAccess.requireOrganizationOwnerIdForUser, {
      userId: oauthState.userId,
      organizationId: oauthState.organizationId,
    });
  } catch {
    await ctx.runMutation(internal.oauthState.deleteOauthState, {
      id: oauthState._id,
    });
    console.log("cloudflare:mcp_oauth:callback_completed", {
      organizationId: oauthState.organizationId,
      outcome: "access-changed",
    });
    return buildAuthorizationErrorUrl(returnUrl, {
      provider: "cloudflare",
      code: "access-changed",
    });
  }

  let completionReturnUrl = returnUrl;
  try {
    const redirectUri = readRequiredEnv("PROVIDER_CLOUDFLARE_MCP_REDIRECT_URL");
    const token = await exchangeCloudflareMcpOAuthCode({
      code,
      codeVerifier,
      clientId,
      redirectUri,
    });
    const expiresAt = Date.now() + token.expires_in * 1000;
    const currentAccount = await ctx.runQuery(
      internal.organizationProviderCredentials.loadCloudflareAccountForOAuthCallback,
      { organizationId: oauthState.organizationId },
    );
    const accounts = await listCloudflareAccountsForToken({
      token: token.access_token,
      transport: "mcp",
    });
    const account = resolveCloudflareAccountAfterAuthorization(
      accounts,
      currentAccount ?? undefined,
    );

    const storeResult: ProviderOAuthStoreResult = await ctx.runMutation(
      internal.cloudflareMcpOAuth.storeCloudflareMcpOauthConnection,
      {
        organizationId: oauthState.organizationId,
        connectedByUserId: oauthState.userId,
        expectedProviderSnapshotHash: oauthState.expectedProviderSnapshotHash,
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        expiresAt,
        clientId,
        account,
        oauthStateId: oauthState._id,
        oauthState: oauthState.state,
      },
    );
    completionReturnUrl = buildProviderOAuthStoreReturnUrl({
      provider: "cloudflare",
      returnUrl,
      storeResult,
    });
    if (storeResult.status !== "stored") {
      console.log("cloudflare:mcp_oauth:callback_completed", {
        organizationId: oauthState.organizationId,
        outcome: storeResult.status,
      });
    } else {
      console.log("cloudflare:mcp_oauth:exchange_succeeded", {
        organizationId: oauthState.organizationId,
        expiresIn: token.expires_in,
        expiresAt,
        clientIdLength: clientId.length,
      });
    }
  } catch (err) {
    await ctx.runMutation(internal.oauthState.deleteOauthState, {
      id: oauthState._id,
    });
    console.error(
      "cloudflare:mcp_oauth:exchange_failed",
      {
        organizationId: oauthState.organizationId,
        outcome: "failed",
        clientIdLength: clientId.length,
        hasCodeVerifier: codeVerifier.length > 0,
      },
      err,
    );
    completionReturnUrl = buildAuthorizationErrorUrl(returnUrl, {
      provider: "cloudflare",
      code: "failed",
    });
  }

  return completionReturnUrl;
}
