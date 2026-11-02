import {
  buildResourceOAuthUrl,
  exchangeResourceOAuthCode,
  refreshResourceOAuthToken,
  expiringResourceTokens,
  revokeHubRefreshToken,
} from "./hubResourceOAuth";
import { ResponseBodyError } from "oauth4webapi";
import { Infer, v } from "convex/values";

import { internal } from "./_generated/api";
import { internalAction, internalMutation } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { action } from "./functions";
import { refreshCloudflareMcpOAuthToken } from "./cloudflareMcpOAuth";
import {
  deriveMcpTokenStatusFromExpiry,
  vMcpTokenHealth,
  type McpTokenHealth,
} from "./mcpTokenHealth";
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
import { buildAuthorizationErrorUrl } from "../shared/authorizationError";
import { buildProviderOAuthStoreReturnUrl } from "./authorizationCompletion";
import {
  vRepositoryProviderWorkflowAuthority,
  type RepositoryProviderWorkflowAuthority,
} from "./repositoryWorkflowAuthority";

const { boolean, id, number, object, optional, string, union } = v;

type CloudflareOAuthAuth = Exclude<Infer<typeof vCloudflareProviderAuth>, { method: "api_key" }>;
type CloudflareProviderAuth = Infer<typeof vCloudflareProviderAuth>;
type CloudflareConnectionAuthority =
  | {
      kind: "user";
      organizationId: Id<"organizations">;
      userId: Id<"users">;
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
  if (error instanceof ResponseBodyError) {
    return error.error === "invalid_grant";
  }
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
      ? { method: credential.auth.method }
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
          const refreshed = expiringResourceTokens(
            await refreshResourceOAuthToken("cloudflare", refreshToken),
            refreshToken,
          );
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
      console.error("cloudflare:oauth_token:refresh_failed", {
        organizationId,
        method: credential.auth.method,
        derivedStatus: derivedTokenHealth.status,
        expiresAt,
        invalidToken,
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
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
    return await buildResourceOAuthUrl(ctx, {
      provider: "cloudflare",
      userId: ctx.viewer.userId,
      organizationId,
      returnToPath: args.returnToPath,
    });
  },
});

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
  let unsavedRefreshToken: string | undefined;
  try {
    const response = await exchangeResourceOAuthCode({
      provider: "cloudflare",
      code,
      codeVerifier: oauthState.codeVerifier,
    });
    unsavedRefreshToken = response.refresh_token;
    const token = expiringResourceTokens(response);
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
    if (storeResult.status === "stored") unsavedRefreshToken = undefined;
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
      { errorName: err instanceof Error ? err.name : "UnknownError" },
    );
    completionReturnUrl = buildAuthorizationErrorUrl(returnUrl, {
      provider: "cloudflare",
      code: "failed",
    });
  } finally {
    if (unsavedRefreshToken !== undefined) {
      await revokeHubRefreshToken(unsavedRefreshToken);
    }
  }

  return completionReturnUrl;
}
