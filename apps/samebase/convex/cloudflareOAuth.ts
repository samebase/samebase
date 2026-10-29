import { Infer, v } from "convex/values";
import { z } from "zod";

import { internal } from "./_generated/api";
import { httpAction, internalAction, internalMutation } from "./_generated/server";
import type { ActionCtx, MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { action } from "./functions";
import {
  fetchWithTimeout,
  formatCloudflareOAuthRequestFailure,
  refreshCloudflareMcpOAuthToken,
  type CloudflareOAuthTokenOperation,
} from "./cloudflareMcpOAuth";
import {
  deriveMcpTokenStatusFromExpiry,
  vMcpTokenHealth,
  type McpTokenHealth,
} from "./mcpTokenHealth";
import { OAUTH_STATE_TTL_MS, randomToken, readRequiredEnv } from "./oauthUtils";
import { vProviderOAuthStoreResult, type ProviderOAuthStoreResult } from "./oauthState";
import { requireCloudflareAuthUsableDuringRefresh, vCloudflareProviderAuth } from "./providerAuth";
import { connectCloudflareCredential } from "./organizationProviderCredentials";
import { vOrganizationCloudflareAccount } from "./organization/model";
import {
  organizationProviderCredentialAad,
  vCloudflareTokenRefreshLease,
} from "./organization/providerCredentialModel";
import { openSecret, sealSecret, vSealedSecret } from "./sealedSecret";
import {
  listCloudflareAccountsForToken,
  resolveCloudflareAccountAfterAuthorization,
  vCloudflareAccount,
} from "./cloudflareAccountDiscovery";
import { utf8ToBase64 } from "../shared/base64";
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
import {
  vRepositoryProviderWorkflowAuthority,
  type RepositoryProviderWorkflowAuthority,
} from "./repositoryWorkflowAuthority";

const CLOUDFLARE_OAUTH_AUTHORIZATION_URL = "https://dash.cloudflare.com/oauth2/auth";
const CLOUDFLARE_OAUTH_TOKEN_URL = "https://dash.cloudflare.com/oauth2/token";
const { boolean, id, number, object, optional, string, union } = v;

type OAuthContext = ActionCtx | MutationCtx;
type CloudflareOAuthAuthorizeSearchParams = {
  response_type: "code";
  client_id: string;
  redirect_uri: string;
  scope: string;
  state: string;
};
type CloudflareOAuthTokenExchangeSearchParams = {
  grant_type: "authorization_code";
  code: string;
  redirect_uri: string;
};
type CloudflareOAuthTokenRefreshSearchParams = {
  grant_type: "refresh_token";
  refresh_token: string;
};
type CloudflareOAuthTokenResponse = {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
};
type CloudflareOAuthAuth = Exclude<Infer<typeof vCloudflareProviderAuth>, { method: "api_key" }>;
type CloudflareProviderAuth = Infer<typeof vCloudflareProviderAuth>;
type CloudflareConnectionAuthority =
  | {
      kind: "user";
      organizationId: Id<"organizations">;
      userId: Id<"users">;
    }
  | {
      kind: "manual_provider_write";
      organizationId: Id<"organizations">;
      repositoryId: Id<"repositories">;
      userId: Id<"users">;
      actionId: string;
    }
  | {
      kind: "repository_workflow";
      authority: RepositoryProviderWorkflowAuthority;
    };
type CloudflareTokenRefreshLease = Infer<typeof vCloudflareTokenRefreshLease>;
const vCloudflareRefreshLease = object({
  auth: vCloudflareProviderAuth,
  tokenRefreshLease: vCloudflareTokenRefreshLease,
});
type CloudflareRefreshLease = Infer<typeof vCloudflareRefreshLease>;

export const CLOUDFLARE_OAUTH_SCOPES = [
  "workers-ci.read",
  "workers-ci.write",
  "workers-scripts.read",
  "workers-scripts.write",
  "account-settings.read",
  // Cloudflare does not list protocol scopes from GET /oauth/scopes, but live
  // token exchange omits refresh_token unless offline_access is requested.
  "offline_access",
] as const;

const nonEmptyString = z.string().min(1);
const cloudflareOauthTokenResponseSchema = z.object({
  access_token: nonEmptyString,
  refresh_token: nonEmptyString.optional(),
  expires_in: z.number().positive(),
});

function parseCloudflareOAuthTokenResponse(
  payload: unknown,
  operation: CloudflareOAuthTokenOperation,
): CloudflareOAuthTokenResponse {
  const result = cloudflareOauthTokenResponseSchema.safeParse(payload);
  if (!result.success) {
    throw new Error(
      `Failed to ${operation}: Cloudflare token response failed schema validation: ${z.prettifyError(result.error)}`,
    );
  }
  return {
    accessToken: result.data.access_token,
    refreshToken: result.data.refresh_token,
    expiresIn: result.data.expires_in,
  };
}

function buildCloudflareOAuthClientAuthHeader(args: {
  clientId: string;
  clientSecret: string;
}): string {
  return `Basic ${utf8ToBase64(`${args.clientId}:${args.clientSecret}`)}`;
}

export function buildCloudflareOAuthAuthorizeSearchParams(args: {
  clientId: string;
  redirectUri: string;
  state: string;
}): CloudflareOAuthAuthorizeSearchParams {
  return {
    response_type: "code",
    client_id: args.clientId,
    redirect_uri: args.redirectUri,
    scope: CLOUDFLARE_OAUTH_SCOPES.join(" "),
    state: args.state,
  };
}

export function buildCloudflareOAuthAuthorizeUrl(args: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  return buildUrlWithSearchParams(
    CLOUDFLARE_OAUTH_AUTHORIZATION_URL,
    buildCloudflareOAuthAuthorizeSearchParams(args),
  );
}

async function requestCloudflareOAuthToken(args: {
  clientId: string;
  clientSecret: string;
  operation: CloudflareOAuthTokenOperation;
  body: string;
}): Promise<CloudflareOAuthTokenResponse> {
  const response = await fetchWithTimeout(CLOUDFLARE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: buildCloudflareOAuthClientAuthHeader(args),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: args.body,
  });
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw formatCloudflareOAuthRequestFailure({
      operation: args.operation,
      status: response.status,
      payload: data,
    });
  }

  return parseCloudflareOAuthTokenResponse(data, args.operation);
}

async function exchangeCloudflareOAuthCode(args: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<CloudflareOAuthTokenResponse & { refreshToken: string }> {
  const payload = createUrlSearchParams({
    grant_type: "authorization_code",
    code: args.code,
    redirect_uri: args.redirectUri,
  } satisfies CloudflareOAuthTokenExchangeSearchParams);
  const token = await requestCloudflareOAuthToken({
    clientId: args.clientId,
    clientSecret: args.clientSecret,
    operation: "exchange Cloudflare OAuth code",
    body: payload.toString(),
  });
  if (!token.refreshToken) {
    throw new Error(
      "Cloudflare OAuth response did not include a refresh token. Enable the refresh_token grant on the Cloudflare OAuth client and reconnect.",
    );
  }
  return {
    ...token,
    refreshToken: token.refreshToken,
  };
}

async function refreshCloudflareOAuthToken(args: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}): Promise<CloudflareOAuthTokenResponse & { refreshToken: string }> {
  const payload = createUrlSearchParams({
    grant_type: "refresh_token",
    refresh_token: args.refreshToken,
  } satisfies CloudflareOAuthTokenRefreshSearchParams);
  const token = await requestCloudflareOAuthToken({
    clientId: args.clientId,
    clientSecret: args.clientSecret,
    operation: "refresh Cloudflare OAuth token",
    body: payload.toString(),
  });
  return {
    ...token,
    refreshToken: token.refreshToken ?? args.refreshToken,
  };
}

async function buildCloudflareOAuthUrl(
  ctx: OAuthContext,
  args: {
    userId: Id<"users">;
    organizationId: Id<"organizations">;
    returnToPath?: string;
  },
): Promise<string> {
  const clientId = readRequiredEnv("PROVIDER_CLOUDFLARE_OAUTH_CLIENT_ID");
  const redirectUri = readRequiredEnv("PROVIDER_CLOUDFLARE_OAUTH_REDIRECT_URL");
  const state = randomToken();
  const now = Date.now();

  await ctx.runMutation(internal.oauthState.createOauthState, {
    provider: "cloudflare",
    userId: args.userId,
    organizationId: args.organizationId,
    returnToPath: args.returnToPath,
    state,
    createdAt: now,
    expiresAt: now + OAUTH_STATE_TTL_MS,
  });

  console.log("cloudflare:oauth:url_built", {
    organizationId: args.organizationId,
    redirectUri,
    oauthStateExpiresAt: now + OAUTH_STATE_TTL_MS,
  });

  return buildCloudflareOAuthAuthorizeUrl({
    clientId,
    redirectUri,
    state,
  });
}

const storeCloudflareOauthConnectionArgs = {
  organizationId: id("organizations"),
  connectedByUserId: id("users"),
  expectedProviderSnapshotHash: string(),
  accessToken: vSealedSecret,
  refreshToken: vSealedSecret,
  expiresAt: number(),
  account: union(vCloudflareAccount, v.null()),
  oauthStateId: id("providerOAuthCallbackStates"),
  oauthState: string(),
} as const;

export const storeCloudflareOauthConnection = internalMutation({
  args: storeCloudflareOauthConnectionArgs,
  returns: vProviderOAuthStoreResult,
  handler: async (ctx, args) => {
    const checkedAt = Date.now();
    const result = await connectCloudflareCredential(ctx, {
      organizationId: args.organizationId,
      connectedByUserId: args.connectedByUserId,
      expectedProviderSnapshotHash: args.expectedProviderSnapshotHash,
      auth: {
        method: "oauth",
        credential: args.accessToken,
        refreshCredential: args.refreshToken,
        credentialExpiresAt: args.expiresAt,
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
      console.log("cloudflare:oauth:connection_stored", {
        organizationId: args.organizationId,
        expiresAt: args.expiresAt,
      });
    }
    return result;
  },
});

async function loadCloudflareProviderConfiguration(
  ctx: Pick<ActionCtx, "runQuery">,
  authority: CloudflareConnectionAuthority,
  refreshLease?: CloudflareRefreshLease,
) {
  switch (authority.kind) {
    case "user":
      return {
        organizationId: authority.organizationId,
        configuration:
          refreshLease === undefined
            ? await ctx.runQuery(internal.organizationProviderCredentials.loadForOrganization, {
                organizationId: authority.organizationId,
                userId: authority.userId,
              })
            : await ctx.runQuery(
                internal.organizationProviderCredentials.loadCloudflareTokenRefreshContinuation,
                {
                  organizationId: authority.organizationId,
                  expectedAuth: refreshLease.auth,
                  expectedTokenRefreshLease: refreshLease.tokenRefreshLease,
                },
              ),
      };
    case "manual_provider_write":
      return {
        organizationId: authority.organizationId,
        configuration: await ctx.runQuery(
          internal.organizationProviderCredentials.loadForManualCloudflareProviderWrite,
          {
            organizationId: authority.organizationId,
            repositoryId: authority.repositoryId,
            userId: authority.userId,
            actionId: authority.actionId,
          },
        ),
      };
    case "repository_workflow":
      return await ctx.runQuery(
        internal.organizationProviderCredentials.loadForRepositoryProviderWorkflow,
        { authority: authority.authority },
      );
    default:
      authority satisfies never;
      throw new Error("Cloudflare connection authority is invalid.");
  }
}

async function replaceCloudflareCredentialForAuthority(
  ctx: Pick<ActionCtx, "runMutation">,
  authority: CloudflareConnectionAuthority,
  organizationId: Id<"organizations">,
  args: {
    expectedAuth: CloudflareProviderAuth;
    auth: CloudflareProviderAuth;
    tokenHealth: McpTokenHealth;
    expectedTokenRefreshLease?: CloudflareTokenRefreshLease;
  },
) {
  switch (authority.kind) {
    case "user":
      return await ctx.runMutation(
        internal.organizationProviderCredentials.replaceCloudflareCredential,
        {
          organizationId,
          userId: authority.userId,
          expectedAuth: args.expectedAuth,
          auth: args.auth,
          tokenHealth: args.tokenHealth,
          expectedTokenRefreshLease: args.expectedTokenRefreshLease,
        },
      );
    case "manual_provider_write":
      return await ctx.runMutation(
        internal.organizationProviderCredentials.replaceCloudflareCredentialForManualProviderWrite,
        {
          organizationId,
          repositoryId: authority.repositoryId,
          userId: authority.userId,
          actionId: authority.actionId,
          expectedAuth: args.expectedAuth,
          auth: args.auth,
          tokenHealth: args.tokenHealth,
          expectedTokenRefreshLease: args.expectedTokenRefreshLease,
        },
      );
    case "repository_workflow":
      return await ctx.runMutation(
        internal.organizationProviderCredentials.replaceCloudflareCredentialForRepositoryWorkflow,
        {
          authority: authority.authority,
          expectedAuth: args.expectedAuth,
          auth: args.auth,
          tokenHealth: args.tokenHealth,
          expectedTokenRefreshLease: args.expectedTokenRefreshLease,
        },
      );
    default:
      authority satisfies never;
      throw new Error("Cloudflare connection authority is invalid.");
  }
}

async function claimCloudflareTokenRefreshForAuthority(
  ctx: Pick<ActionCtx, "runMutation">,
  authority: CloudflareConnectionAuthority,
  organizationId: Id<"organizations">,
  args: {
    expectedAuth: CloudflareProviderAuth;
    force?: boolean;
  },
) {
  switch (authority.kind) {
    case "user":
      return await ctx.runMutation(
        internal.organizationProviderCredentials.claimCloudflareTokenRefresh,
        {
          organizationId,
          userId: authority.userId,
          expectedAuth: args.expectedAuth,
          force: args.force,
        },
      );
    case "manual_provider_write":
      return await ctx.runMutation(
        internal.organizationProviderCredentials.claimCloudflareTokenRefreshForManualProviderWrite,
        {
          organizationId,
          repositoryId: authority.repositoryId,
          userId: authority.userId,
          actionId: authority.actionId,
          expectedAuth: args.expectedAuth,
          force: args.force,
        },
      );
    case "repository_workflow":
      return await ctx.runMutation(
        internal.organizationProviderCredentials.claimCloudflareTokenRefreshForRepositoryWorkflow,
        {
          authority: authority.authority,
          expectedAuth: args.expectedAuth,
          force: args.force,
        },
      );
    default:
      authority satisfies never;
      throw new Error("Cloudflare connection authority is invalid.");
  }
}

async function releaseCloudflareTokenRefreshForAuthority(
  ctx: Pick<ActionCtx, "runMutation">,
  authority: CloudflareConnectionAuthority,
  organizationId: Id<"organizations">,
  args: {
    expectedTokenRefreshLease: CloudflareTokenRefreshLease;
    recordLastTokenRefreshAt?: boolean;
  },
) {
  switch (authority.kind) {
    case "user":
      return await ctx.runMutation(
        internal.organizationProviderCredentials.releaseCloudflareTokenRefresh,
        {
          organizationId,
          expectedTokenRefreshLease: args.expectedTokenRefreshLease,
          recordLastTokenRefreshAt: args.recordLastTokenRefreshAt,
        },
      );
    case "manual_provider_write":
      return await ctx.runMutation(
        internal.organizationProviderCredentials
          .releaseCloudflareTokenRefreshForManualProviderWrite,
        {
          organizationId,
          repositoryId: authority.repositoryId,
          userId: authority.userId,
          actionId: authority.actionId,
          expectedTokenRefreshLease: args.expectedTokenRefreshLease,
          recordLastTokenRefreshAt: args.recordLastTokenRefreshAt,
        },
      );
    case "repository_workflow":
      return await ctx.runMutation(
        internal.organizationProviderCredentials.releaseCloudflareTokenRefreshForRepositoryWorkflow,
        {
          authority: authority.authority,
          expectedTokenRefreshLease: args.expectedTokenRefreshLease,
          recordLastTokenRefreshAt: args.recordLastTokenRefreshAt,
        },
      );
    default:
      authority satisfies never;
      throw new Error("Cloudflare connection authority is invalid.");
  }
}

const resolvedCloudflareConnectionValidator = object({
  auth: vCloudflareProviderAuth,
  account: vOrganizationCloudflareAccount,
  tokenHealth: optional(vMcpTokenHealth),
});
const resolveConnectionForOrganizationResultValidator = union(
  resolvedCloudflareConnectionValidator,
  v.null(),
);
export type ResolvedCloudflareConnection = Infer<typeof resolvedCloudflareConnectionValidator>;

function isLikelyInvalidCloudflareTokenError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase().trim();
  if (message.length === 0) {
    return false;
  }
  return (
    message.includes("401") ||
    message.includes("400") ||
    message.includes("unauthorized") ||
    message.includes("invalid_token") ||
    message.includes("invalid_grant") ||
    message.includes("invalid grant") ||
    message.includes("invalid refresh token") ||
    message.includes("refresh token is missing") ||
    message.includes("client metadata is missing")
  );
}

async function resolveConnectionForAuthority(
  ctx: ActionCtx,
  authority: CloudflareConnectionAuthority,
  args: {
    forceRefresh?: boolean;
    refreshLease?: CloudflareRefreshLease;
  },
): Promise<ResolvedCloudflareConnection | null> {
  const loaded = await loadCloudflareProviderConfiguration(ctx, authority, args.refreshLease);
  const { configuration, organizationId } = loaded;
  const credential = configuration.cloudflareCredential;
  if (credential === undefined) {
    return null;
  }
  const account = configuration.cloudflareAccount;
  if (account === undefined) {
    throw new Error("Cloudflare credential has no configured account.");
  }

  if (credential.auth.method === "api_key") {
    return {
      auth: credential.auth,
      account,
    };
  }

  const expiresAt = credential.auth.credentialExpiresAt;
  const checkedAt = Date.now();
  const derivedTokenHealth: Infer<typeof vMcpTokenHealth> = {
    status: deriveMcpTokenStatusFromExpiry(expiresAt, checkedAt),
    checkedAt,
    expiresAt,
    source: "expiry_metadata",
  };
  const effectiveTokenHealth = credential.tokenHealth ?? derivedTokenHealth;
  const shouldRefresh =
    args.forceRefresh === true ||
    derivedTokenHealth.status === "expiring_soon" ||
    derivedTokenHealth.status === "expired";
  if (!shouldRefresh) {
    return {
      auth: credential.auth,
      account,
      tokenHealth: effectiveTokenHealth,
    };
  }

  const refreshToken = (
    await openSecret({
      sealed: credential.auth.refreshCredential,
      aad: organizationProviderCredentialAad(organizationId, "cloudflare.auth.refreshCredential"),
    })
  ).trim();
  let metadataError: string | undefined;
  if (!refreshToken) {
    metadataError = "Cloudflare OAuth refresh token is empty. Reconnect Cloudflare and retry.";
  } else if (credential.auth.method === "mcp_oauth" && !credential.auth.clientId.trim()) {
    metadataError = "Cloudflare OAuth client ID is empty. Reconnect Cloudflare and retry.";
  }
  if (metadataError) {
    const tokenHealth: Infer<typeof vMcpTokenHealth> = {
      status: "invalid",
      checkedAt: Date.now(),
      expiresAt,
      source: "refresh_attempt",
      errorMessage: metadataError,
    };
    await replaceCloudflareCredentialForAuthority(ctx, authority, organizationId, {
      expectedAuth: credential.auth,
      expectedTokenRefreshLease: args.refreshLease?.tokenRefreshLease,
      auth: credential.auth,
      tokenHealth,
    });
    throw new Error(metadataError);
  }

  const client =
    credential.auth.method === "oauth"
      ? {
          method: credential.auth.method,
          clientId: readRequiredEnv("PROVIDER_CLOUDFLARE_OAUTH_CLIENT_ID"),
          clientSecret: readRequiredEnv("PROVIDER_CLOUDFLARE_OAUTH_CLIENT_SECRET"),
        }
      : { method: credential.auth.method, clientId: credential.auth.clientId.trim() };

  let refreshLease: CloudflareTokenRefreshLease;
  if (args.refreshLease === undefined) {
    const claim = await claimCloudflareTokenRefreshForAuthority(ctx, authority, organizationId, {
      expectedAuth: credential.auth,
      force: args.forceRefresh,
    });
    if (!claim.claimed) {
      const current = (await loadCloudflareProviderConfiguration(ctx, authority)).configuration;
      if (current.cloudflareCredential === undefined) {
        return null;
      }
      if (current.cloudflareAccount === undefined) {
        throw new Error("Cloudflare credential has no configured account.");
      }
      requireCloudflareAuthUsableDuringRefresh(current.cloudflareCredential.auth, Date.now());
      return {
        auth: current.cloudflareCredential.auth,
        account: current.cloudflareAccount,
        tokenHealth: current.cloudflareCredential.tokenHealth,
      };
    }
    refreshLease = claim.tokenRefreshLease;
  } else {
    refreshLease = args.refreshLease.tokenRefreshLease;
  }

  let recordLastTokenRefreshAt = false;
  try {
    let refreshedAuth: CloudflareOAuthAuth;
    try {
      switch (client.method) {
        case "oauth": {
          const refreshed = await refreshCloudflareOAuthToken({
            refreshToken,
            clientId: client.clientId,
            clientSecret: client.clientSecret,
          });
          refreshedAuth = {
            method: "oauth",
            credential: await sealSecret(ctx, {
              plaintext: refreshed.accessToken,
              aad: organizationProviderCredentialAad(organizationId, "cloudflare.auth.credential"),
            }),
            refreshCredential: await sealSecret(ctx, {
              plaintext: refreshed.refreshToken,
              aad: organizationProviderCredentialAad(
                organizationId,
                "cloudflare.auth.refreshCredential",
              ),
            }),
            credentialExpiresAt: Date.now() + refreshed.expiresIn * 1000,
          };
          break;
        }
        case "mcp_oauth": {
          const refreshed = await refreshCloudflareMcpOAuthToken({
            refreshToken,
            clientId: client.clientId,
          });
          refreshedAuth = {
            method: "mcp_oauth",
            credential: await sealSecret(ctx, {
              plaintext: refreshed.access_token,
              aad: organizationProviderCredentialAad(organizationId, "cloudflare.auth.credential"),
            }),
            refreshCredential: await sealSecret(ctx, {
              plaintext: refreshed.refresh_token,
              aad: organizationProviderCredentialAad(
                organizationId,
                "cloudflare.auth.refreshCredential",
              ),
            }),
            credentialExpiresAt: Date.now() + refreshed.expires_in * 1000,
            clientId: client.clientId,
          };
          break;
        }
        default:
          client satisfies never;
          throw new Error("Cloudflare OAuth method is invalid.");
      }
    } catch (error) {
      const invalidToken = isLikelyInvalidCloudflareTokenError(error);
      const tokenHealth: Infer<typeof vMcpTokenHealth> = {
        status: invalidToken ? "invalid" : derivedTokenHealth.status,
        checkedAt: Date.now(),
        expiresAt,
        source: invalidToken ? "refresh_attempt" : "runtime_error",
        errorMessage: error instanceof Error ? "Cloudflare token refresh failed." : undefined,
      };
      console.error(
        "cloudflare:oauth_token:refresh_failed",
        {
          organizationId,
          method: credential.auth.method,
          derivedStatus: derivedTokenHealth.status,
          expiresAt,
          invalidToken,
        },
        error,
      );
      await replaceCloudflareCredentialForAuthority(ctx, authority, organizationId, {
        expectedAuth: credential.auth,
        expectedTokenRefreshLease: refreshLease,
        auth: credential.auth,
        tokenHealth,
      });
      throw error;
    }

    const nextExpiresAt = refreshedAuth.credentialExpiresAt;
    const nowAfterRefresh = Date.now();
    const refreshedTokenHealth: Infer<typeof vMcpTokenHealth> = {
      status: deriveMcpTokenStatusFromExpiry(nextExpiresAt, nowAfterRefresh),
      checkedAt: nowAfterRefresh,
      expiresAt: nextExpiresAt,
      source: "refresh_attempt",
    };

    await replaceCloudflareCredentialForAuthority(ctx, authority, organizationId, {
      expectedAuth: credential.auth,
      expectedTokenRefreshLease: refreshLease,
      auth: refreshedAuth,
      tokenHealth: refreshedTokenHealth,
    });
    recordLastTokenRefreshAt = true;
    if (authority.kind === "user") {
      const current = (await loadCloudflareProviderConfiguration(ctx, authority)).configuration;
      if (current.cloudflareCredential === undefined) {
        return null;
      }
      if (current.cloudflareAccount === undefined) {
        throw new Error("Cloudflare credential has no configured account.");
      }
      return {
        auth: current.cloudflareCredential.auth,
        account: current.cloudflareAccount,
        tokenHealth: current.cloudflareCredential.tokenHealth,
      };
    }

    return {
      auth: refreshedAuth,
      account,
      tokenHealth: refreshedTokenHealth,
    };
  } finally {
    if (args.refreshLease === undefined) {
      await releaseCloudflareTokenRefreshForAuthority(ctx, authority, organizationId, {
        expectedTokenRefreshLease: refreshLease,
        recordLastTokenRefreshAt,
      });
    }
  }
}

export const resolveConnectionForOrganization = internalAction({
  args: {
    organizationId: id("organizations"),
    userId: id("users"),
    forceRefresh: optional(boolean()),
    refreshLease: optional(vCloudflareRefreshLease),
  },
  returns: resolveConnectionForOrganizationResultValidator,
  handler: async (ctx, args): Promise<ResolvedCloudflareConnection | null> =>
    await resolveConnectionForAuthority(
      ctx,
      { kind: "user", organizationId: args.organizationId, userId: args.userId },
      { forceRefresh: args.forceRefresh, refreshLease: args.refreshLease },
    ),
});

export const resolveConnectionForManualProviderWrite = internalAction({
  args: {
    organizationId: id("organizations"),
    repositoryId: id("repositories"),
    userId: id("users"),
    actionId: string(),
    forceRefresh: optional(boolean()),
  },
  returns: resolveConnectionForOrganizationResultValidator,
  handler: async (ctx, args): Promise<ResolvedCloudflareConnection | null> =>
    await resolveConnectionForAuthority(
      ctx,
      {
        kind: "manual_provider_write",
        organizationId: args.organizationId,
        repositoryId: args.repositoryId,
        userId: args.userId,
        actionId: args.actionId,
      },
      { forceRefresh: args.forceRefresh },
    ),
});

export const resolveConnectionForRepositoryWorkflow = internalAction({
  args: {
    authority: vRepositoryProviderWorkflowAuthority,
    forceRefresh: optional(boolean()),
  },
  returns: resolveConnectionForOrganizationResultValidator,
  handler: async (ctx, args): Promise<ResolvedCloudflareConnection | null> =>
    await resolveConnectionForAuthority(
      ctx,
      { kind: "repository_workflow", authority: args.authority },
      { forceRefresh: args.forceRefresh },
    ),
});

export const getCloudflareOAuthUrl = action({
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
    return await buildCloudflareOAuthUrl(ctx, {
      userId: ctx.viewer.userId,
      organizationId,
      returnToPath: args.returnToPath,
    });
  },
});

export const finishCloudflareOAuth = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (error !== null) {
    console.log("cloudflare:oauth:callback_provider_error", {
      statePresent: state !== null,
      errorPresent: error.length > 0,
      errorDescriptionPresent: errorDescription !== null,
    });
  }

  if (state === null) {
    console.log("cloudflare:oauth:callback_missing_params", {
      hasCode: code !== null,
      hasState: false,
    });
    return new Response("Missing OAuth parameters", { status: 400 });
  }

  const oauthState = await ctx.runQuery(internal.oauthState.getOauthStateByState, {
    provider: "cloudflare",
    state,
  });
  if (!oauthState) {
    console.log("cloudflare:oauth:callback_invalid_state", {
      stateLength: state.length,
    });
    return new Response("Invalid OAuth state", { status: 400 });
  }
  if (oauthState.provider !== "cloudflare") {
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
    console.log("cloudflare:oauth:callback_completed", {
      organizationId: oauthState.organizationId,
      outcome: "expired",
    });
    return buildAuthorizationCompletionResponse({
      eventType: "cloudflare-oauth-complete",
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
    console.log("cloudflare:oauth:callback_completed", {
      organizationId: oauthState.organizationId,
      outcome: errorCode,
    });
    return buildAuthorizationCompletionResponse({
      eventType: "cloudflare-oauth-complete",
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
      eventType: "cloudflare-oauth-complete",
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
    eventType: "cloudflare-oauth-complete",
    returnUrl: buildProviderOAuthCompletionUrl({
      appOrigin,
      completion: { provider: "cloudflare", state, code },
    }),
    title: "Cloudflare OAuth",
  });
});

/**
Exchanges a Cloudflare authorization code for the owner who started
`oauthState` and stores the grant for that organization. The caller has already
checked that the signed-in user is `oauthState.userId`. Returns `returnUrl`
with the outcome for the Providers page.
*/
export async function completeCloudflareOAuth(
  ctx: ActionCtx,
  args: {
    code: string;
    oauthState: Extract<Doc<"providerOAuthCallbackStates">, { provider: "cloudflare" }>;
    returnUrl: string;
  },
): Promise<string> {
  const { code, oauthState, returnUrl } = args;

  try {
    await ctx.runQuery(internal.organizationAccess.requireOrganizationOwnerIdForUser, {
      userId: oauthState.userId,
      organizationId: oauthState.organizationId,
    });
  } catch {
    await ctx.runMutation(internal.oauthState.deleteOauthState, {
      id: oauthState._id,
    });
    console.log("cloudflare:oauth:callback_completed", {
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
    const clientId = readRequiredEnv("PROVIDER_CLOUDFLARE_OAUTH_CLIENT_ID");
    const clientSecret = readRequiredEnv("PROVIDER_CLOUDFLARE_OAUTH_CLIENT_SECRET");
    const redirectUri = readRequiredEnv("PROVIDER_CLOUDFLARE_OAUTH_REDIRECT_URL");
    const token = await exchangeCloudflareOAuthCode({
      code,
      clientId,
      clientSecret,
      redirectUri,
    });
    const expiresAt = Date.now() + token.expiresIn * 1000;
    const currentAccount = await ctx.runQuery(
      internal.organizationProviderCredentials.loadCloudflareAccountForOAuthCallback,
      { organizationId: oauthState.organizationId },
    );
    const accounts = await listCloudflareAccountsForToken({
      token: token.accessToken,
      transport: "direct",
    });
    const account = resolveCloudflareAccountAfterAuthorization(
      accounts,
      currentAccount ?? undefined,
    );

    const storeResult: ProviderOAuthStoreResult = await ctx.runMutation(
      internal.cloudflareOAuth.storeCloudflareOauthConnection,
      {
        organizationId: oauthState.organizationId,
        connectedByUserId: oauthState.userId,
        expectedProviderSnapshotHash: oauthState.expectedProviderSnapshotHash,
        accessToken: await sealSecret(ctx, {
          plaintext: token.accessToken,
          aad: organizationProviderCredentialAad(
            oauthState.organizationId,
            "cloudflare.auth.credential",
          ),
        }),
        refreshToken: await sealSecret(ctx, {
          plaintext: token.refreshToken,
          aad: organizationProviderCredentialAad(
            oauthState.organizationId,
            "cloudflare.auth.refreshCredential",
          ),
        }),
        expiresAt,
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
      console.log("cloudflare:oauth:callback_completed", {
        organizationId: oauthState.organizationId,
        outcome: storeResult.status,
      });
    } else {
      console.log("cloudflare:oauth:exchange_succeeded", {
        organizationId: oauthState.organizationId,
        expiresIn: token.expiresIn,
        expiresAt,
      });
    }
  } catch (err) {
    await ctx.runMutation(internal.oauthState.deleteOauthState, {
      id: oauthState._id,
    });
    console.error(
      "cloudflare:oauth:exchange_failed",
      {
        organizationId: oauthState.organizationId,
        outcome: "failed",
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
