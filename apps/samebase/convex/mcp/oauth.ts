import { Infer, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx } from "../_generated/server";
import { action, query } from "../functions";
import { randomToken } from "../oauthUtils";
import {
  applyMcpDenyErrorParamsToRedirectUrl,
  buildMcpAuthorizationSuccessRedirectUrl,
} from "../../shared/mcpOAuth";
import { isMcpOauthClientInactive } from "./client";
import { vMcpAuthRequestStatus, vMcpOauthClientRegistrationStatus } from "./model";
import { getDefaultMcpProtocolValidationOptions, redirectUriMatchesRegistered } from "./protocol";
import { revokeActiveMcpGrant } from "./grants";
import { parseScopeTokens } from "./scopes";
import { readActiveUser } from "../identity/lifecycle";
import {
  createAuthorizationCodeValue,
  MCP_AUTHORIZATION_CODE_TTL_MS,
  sha256Hex,
  verifyPkceS256,
} from "./tokens";

const { array, boolean, id, literal, number, object, optional, string, union } = v;

const registerDynamicClientArgsValidator = object({
  clientId: string(),
  clientName: optional(string()),
  redirectUris: array(string()),
  grantTypes: array(string()),
  responseTypes: array(string()),
  tokenEndpointAuthMethod: literal("none"),
  provisionalExpiresAt: number(),
  createdAt: number(),
  updatedAt: number(),
  metadataJson: string(),
});
type RegisterDynamicClientArgs = Infer<typeof registerDynamicClientArgsValidator>;

const getClientByClientIdResultValidator = union(
  object({
    redirectUris: array(string()),
    registrationStatus: vMcpOauthClientRegistrationStatus,
    provisionalExpiresAt: optional(number()),
  }),
  v.null(),
);
type GetClientByClientIdResult = Infer<typeof getClientByClientIdResultValidator>;

const createAuthRequestArgsValidator = object({
  requestId: string(),
  clientId: string(),
  redirectUri: string(),
  resource: string(),
  scope: string(),
  state: optional(string()),
  codeChallenge: string(),
  codeChallengeMethod: literal("S256"),
  userId: optional(id("users")),
  createdAt: number(),
  expiresAt: number(),
});
type CreateAuthRequestArgs = Infer<typeof createAuthRequestArgsValidator>;

const mcpOauthErrorValidator = object({
  ok: literal(false),
  status: number(),
  error: string(),
  errorDescription: string(),
});
type McpOauthError = Infer<typeof mcpOauthErrorValidator>;

const issueAuthorizationCodeForAuthRequestArgsValidator = object({
  requestId: string(),
  userId: id("users"),
  codeHash: string(),
  codeExpiresAt: number(),
  grantMode: union(literal("create_or_reuse"), literal("reuse_only")),
  allowLoopbackHttpRedirectUris: optional(boolean()),
  now: number(),
});
type IssueAuthorizationCodeForAuthRequestArgs = Infer<
  typeof issueAuthorizationCodeForAuthRequestArgsValidator
>;

const issueAuthorizationCodeForAuthRequestResultValidator = union(
  object({
    ok: literal(true),
    redirectUri: string(),
    resource: string(),
    state: optional(string()),
  }),
  mcpOauthErrorValidator,
);
type IssueAuthorizationCodeForAuthRequestResult = Infer<
  typeof issueAuthorizationCodeForAuthRequestResultValidator
>;

const completeAuthorizationRequestArgsValidator = object({
  requestId: string(),
});
type CompleteAuthorizationRequestArgs = Infer<typeof completeAuthorizationRequestArgsValidator>;

const completeAuthorizationRequestResultValidator = object({
  redirectUrl: string(),
});
type CompleteAuthorizationRequestResult = Infer<typeof completeAuthorizationRequestResultValidator>;

const denyAuthorizationRequestForCurrentUserArgsValidator = object({
  requestId: string(),
});
type DenyAuthorizationRequestForCurrentUserArgs = Infer<
  typeof denyAuthorizationRequestForCurrentUserArgsValidator
>;

const denyAuthorizationRequestForCurrentUserResultValidator = object({
  redirectUrl: string(),
});
type DenyAuthorizationRequestForCurrentUserResult = Infer<
  typeof denyAuthorizationRequestForCurrentUserResultValidator
>;

const denyAuthorizationRequestArgsValidator = object({
  requestId: string(),
  userId: id("users"),
  now: number(),
});
type DenyAuthorizationRequestArgs = Infer<typeof denyAuthorizationRequestArgsValidator>;

const denyAuthorizationRequestResultValidator = union(
  object({
    ok: literal(true),
    redirectUri: string(),
    resource: string(),
    state: optional(string()),
  }),
  mcpOauthErrorValidator,
);
type DenyAuthorizationRequestResult = Infer<typeof denyAuthorizationRequestResultValidator>;

const getAuthorizationRequestForCurrentUserArgsValidator = object({
  requestId: string(),
});
type GetAuthorizationRequestForCurrentUserArgs = Infer<
  typeof getAuthorizationRequestForCurrentUserArgsValidator
>;

const getAuthorizationRequestForCurrentUserResultValidator = union(
  object({
    requestId: string(),
    clientId: string(),
    clientName: optional(string()),
    scope: string(),
    scopes: array(string()),
    resource: string(),
    status: vMcpAuthRequestStatus,
    dynamicallyRegistered: boolean(),
    createdAt: number(),
    expiresAt: number(),
  }),
  v.null(),
);
type GetAuthorizationRequestForCurrentUserResult = Infer<
  typeof getAuthorizationRequestForCurrentUserResultValidator
>;

const exchangeAuthorizationCodeArgsValidator = object({
  codeHash: string(),
  clientId: string(),
  redirectUri: string(),
  resource: string(),
  codeVerifier: string(),
  allowLoopbackHttpRedirectUris: optional(boolean()),
  accessTokenHash: string(),
  refreshTokenHash: string(),
  accessTokenExpiresAt: number(),
  refreshTokenExpiresAt: number(),
  now: number(),
});
type ExchangeAuthorizationCodeArgs = Infer<typeof exchangeAuthorizationCodeArgsValidator>;

const tokenExchangeSuccessValidator = object({
  ok: literal(true),
  grantId: string(),
  userId: id("users"),
  clientId: string(),
  scope: string(),
  resource: string(),
  refreshTokenIssued: boolean(),
});

const tokenExchangeResultValidator = union(tokenExchangeSuccessValidator, mcpOauthErrorValidator);
type TokenExchangeResult = Infer<typeof tokenExchangeResultValidator>;

const exchangeRefreshTokenArgsValidator = object({
  refreshTokenHash: string(),
  clientId: string(),
  resource: string(),
  accessTokenHash: string(),
  newRefreshTokenHash: string(),
  accessTokenExpiresAt: number(),
  refreshTokenExpiresAt: number(),
  now: number(),
});
type ExchangeRefreshTokenArgs = Infer<typeof exchangeRefreshTokenArgsValidator>;

const validateAccessTokenArgsValidator = object({
  tokenHash: string(),
  now: number(),
});
type ValidateAccessTokenArgs = Infer<typeof validateAccessTokenArgsValidator>;

const validateAccessTokenResultValidator = union(
  object({
    ok: literal(true),
    grantId: string(),
    userId: id("users"),
    clientId: string(),
    scope: string(),
    resource: string(),
  }),
  mcpOauthErrorValidator,
);
type ValidateAccessTokenResult = Infer<typeof validateAccessTokenResultValidator>;

const MCP_LAST_USED_WRITE_THROTTLE_MS = 60 * 1000;

function oauthError(args: {
  status: number;
  error: string;
  errorDescription: string;
}): McpOauthError {
  return {
    ok: false,
    status: args.status,
    error: args.error,
    errorDescription: args.errorDescription,
  };
}

async function readPendingAuthorizationRequestForUser(
  ctx: Pick<MutationCtx, "db">,
  args: Pick<DenyAuthorizationRequestArgs, "requestId" | "userId" | "now">,
) {
  const authRequest = await ctx.db
    .query("mcpAuthorizationRequests")
    .withIndex("by_request_id", (q) => q.eq("requestId", args.requestId))
    .first();
  if (!authRequest) {
    return oauthError({
      status: 400,
      error: "invalid_request",
      errorDescription: "Unknown authorization request.",
    });
  }

  if (authRequest.status !== "pending") {
    return oauthError({
      status: 400,
      error: "invalid_request",
      errorDescription: "Authorization request is no longer pending.",
    });
  }

  if (authRequest.expiresAt <= args.now) {
    await ctx.db.patch(authRequest._id, {
      status: "expired" satisfies Infer<typeof vMcpAuthRequestStatus>,
    });
    return oauthError({
      status: 400,
      error: "invalid_request",
      errorDescription: "Authorization request expired.",
    });
  }

  if (authRequest.userId && authRequest.userId !== args.userId) {
    return oauthError({
      status: 403,
      error: "invalid_request",
      errorDescription: "Authorization request belongs to a different user.",
    });
  }

  return { ok: true, authRequest } as const;
}

export const registerDynamicClient = internalMutation({
  args: registerDynamicClientArgsValidator,
  returns: id("mcpOauthClients"),
  handler: async (ctx, args: RegisterDynamicClientArgs) => {
    return await ctx.db.insert("mcpOauthClients", {
      clientId: args.clientId,
      clientName: args.clientName,
      redirectUris: args.redirectUris,
      grantTypes: args.grantTypes,
      responseTypes: args.responseTypes,
      tokenEndpointAuthMethod: args.tokenEndpointAuthMethod,
      createdAt: args.createdAt,
      updatedAt: args.updatedAt,
      createdBy: "dynamic_registration",
      registrationStatus: "provisional",
      provisionalExpiresAt: args.provisionalExpiresAt,
      metadataJson: args.metadataJson,
    });
  },
});

export const getClientByClientId = internalQuery({
  args: { clientId: string() },
  returns: getClientByClientIdResultValidator,
  handler: async (ctx, args): Promise<GetClientByClientIdResult> => {
    const client = await ctx.db
      .query("mcpOauthClients")
      .withIndex("by_client_id", (q) => q.eq("clientId", args.clientId))
      .first();
    if (!client) {
      return null;
    }
    return {
      redirectUris: client.redirectUris,
      registrationStatus: client.registrationStatus,
      provisionalExpiresAt: client.provisionalExpiresAt,
    };
  },
});

export const createAuthRequest = internalMutation({
  args: createAuthRequestArgsValidator,
  returns: id("mcpAuthorizationRequests"),
  handler: async (ctx, args: CreateAuthRequestArgs) => {
    if (args.userId) {
      const user = await ctx.db.get(args.userId);

      if (!user || readActiveUser(user) === null) {
        throw new Error("Account deletion is in progress.");
      }
    }

    return await ctx.db.insert("mcpAuthorizationRequests", {
      requestId: args.requestId,
      clientId: args.clientId,
      redirectUri: args.redirectUri,
      resource: args.resource,
      scope: args.scope,
      state: args.state,
      codeChallenge: args.codeChallenge,
      codeChallengeMethod: args.codeChallengeMethod,
      userId: args.userId,
      status: "pending",
      createdAt: args.createdAt,
      expiresAt: args.expiresAt,
    });
  },
});

export const getAuthorizationRequestForCurrentUser = query({
  access: "access_mcp",
  args: getAuthorizationRequestForCurrentUserArgsValidator,
  returns: getAuthorizationRequestForCurrentUserResultValidator,
  handler: async (
    ctx,
    args: GetAuthorizationRequestForCurrentUserArgs,
  ): Promise<GetAuthorizationRequestForCurrentUserResult> => {
    const authRequest = await ctx.db
      .query("mcpAuthorizationRequests")
      .withIndex("by_request_id", (q) => q.eq("requestId", args.requestId))
      .first();
    if (!authRequest) {
      return null;
    }
    if (authRequest.userId && authRequest.userId !== ctx.viewer.userId) {
      return null;
    }

    const client = await ctx.db
      .query("mcpOauthClients")
      .withIndex("by_client_id", (q) => q.eq("clientId", authRequest.clientId))
      .first();
    const effectiveStatus =
      authRequest.status === "pending" && authRequest.expiresAt <= Date.now()
        ? ("expired" satisfies Infer<typeof vMcpAuthRequestStatus>)
        : authRequest.status;

    return {
      requestId: authRequest.requestId,
      clientId: authRequest.clientId,
      clientName: client?.clientName,
      scope: authRequest.scope,
      scopes: parseScopeTokens(authRequest.scope),
      resource: authRequest.resource,
      status: effectiveStatus,
      dynamicallyRegistered: client?.createdBy === "dynamic_registration",
      createdAt: authRequest.createdAt,
      expiresAt: authRequest.expiresAt,
    };
  },
});

export const issueAuthorizationCodeForAuthRequest = internalMutation({
  args: issueAuthorizationCodeForAuthRequestArgsValidator,
  returns: issueAuthorizationCodeForAuthRequestResultValidator,
  handler: async (
    ctx,
    args: IssueAuthorizationCodeForAuthRequestArgs,
  ): Promise<IssueAuthorizationCodeForAuthRequestResult> => {
    const allowLoopbackHttpRedirectUris = args.allowLoopbackHttpRedirectUris === true;
    const authRequestResult = await readPendingAuthorizationRequestForUser(ctx, args);
    if (!authRequestResult.ok) {
      return authRequestResult;
    }
    const { authRequest } = authRequestResult;

    const user = await ctx.db.get(args.userId);
    if (!user || readActiveUser(user) === null) {
      return oauthError({
        status: 400,
        error: "invalid_grant",
        errorDescription: "Grant is no longer active.",
      });
    }

    const client = await ctx.db
      .query("mcpOauthClients")
      .withIndex("by_client_id", (q) => q.eq("clientId", authRequest.clientId))
      .first();
    if (!client) {
      return oauthError({
        status: 400,
        error: "invalid_client",
        errorDescription: "Unknown client_id.",
      });
    }

    if (
      isMcpOauthClientInactive({
        client,
        now: args.now,
      })
    ) {
      return oauthError({
        status: 400,
        error: "invalid_client",
        errorDescription: "Client is not active.",
      });
    }

    if (
      !redirectUriMatchesRegistered({
        requestedRedirectUri: authRequest.redirectUri,
        registeredRedirectUris: client.redirectUris,
        options: {
          allowLoopbackHttpRedirectUris,
        },
      })
    ) {
      return oauthError({
        status: 400,
        error: "invalid_request",
        errorDescription: "Authorization request redirect_uri is not registered.",
      });
    }

    let existingGrant: Doc<"mcpGrants"> | null = null;
    for await (const grant of ctx.db
      .query("mcpGrants")
      .withIndex("by_user_id_and_status", (query) =>
        query.eq("userId", args.userId).eq("status", "active"),
      )) {
      if (
        grant.clientId === authRequest.clientId &&
        grant.resource === authRequest.resource &&
        grant.scope === authRequest.scope
      ) {
        existingGrant = grant;
        break;
      }
    }

    if (existingGrant === null && args.grantMode === "reuse_only") {
      return oauthError({
        status: 403,
        error: "consent_required",
        errorDescription: "Authorization consent is required.",
      });
    }

    const grantId = existingGrant?.grantId ?? `mcpg_${randomToken(24)}`;
    if (existingGrant === null) {
      await ctx.db.insert("mcpGrants", {
        grantId,
        userId: args.userId,
        clientId: authRequest.clientId,
        resource: authRequest.resource,
        scope: authRequest.scope,
        status: "active",
        createdAt: args.now,
        updatedAt: args.now,
      });
    } else {
      await ctx.db.patch(existingGrant._id, { updatedAt: args.now });
    }

    await ctx.db.insert("mcpAuthorizationCodes", {
      codeHash: args.codeHash,
      requestId: authRequest.requestId,
      grantId,
      clientId: authRequest.clientId,
      userId: args.userId,
      redirectUri: authRequest.redirectUri,
      resource: authRequest.resource,
      scope: authRequest.scope,
      expiresAt: args.codeExpiresAt,
    });

    await ctx.db.patch(authRequest._id, {
      status: "approved" satisfies Infer<typeof vMcpAuthRequestStatus>,
      userId: args.userId,
    });

    await ctx.db.insert("audit_mcpAccess_events", {
      grantId,
      clientId: authRequest.clientId,
      userId: args.userId,
      action: "authorization_code_issued",
      createdAt: args.now,
      detailsJson: JSON.stringify({
        requestId: authRequest.requestId,
      }),
    });

    return {
      ok: true,
      redirectUri: authRequest.redirectUri,
      resource: authRequest.resource,
      state: authRequest.state,
    };
  },
});

export const denyAuthorizationRequest = internalMutation({
  args: denyAuthorizationRequestArgsValidator,
  returns: denyAuthorizationRequestResultValidator,
  handler: async (
    ctx,
    args: DenyAuthorizationRequestArgs,
  ): Promise<DenyAuthorizationRequestResult> => {
    const authRequestResult = await readPendingAuthorizationRequestForUser(ctx, args);
    if (!authRequestResult.ok) {
      return authRequestResult;
    }
    const { authRequest } = authRequestResult;

    await ctx.db.patch(authRequest._id, {
      status: "denied" satisfies Infer<typeof vMcpAuthRequestStatus>,
      userId: args.userId,
    });

    await ctx.db.insert("audit_mcpAccess_events", {
      clientId: authRequest.clientId,
      userId: args.userId,
      action: "authorization_denied",
      createdAt: args.now,
      detailsJson: JSON.stringify({
        requestId: authRequest.requestId,
      }),
    });

    return {
      ok: true,
      redirectUri: authRequest.redirectUri,
      resource: authRequest.resource,
      state: authRequest.state,
    };
  },
});

export const completeAuthorizationRequestForCurrentUser = action({
  access: "access_mcp",
  args: completeAuthorizationRequestArgsValidator,
  returns: completeAuthorizationRequestResultValidator,
  handler: async (
    ctx,
    args: CompleteAuthorizationRequestArgs,
  ): Promise<CompleteAuthorizationRequestResult> => {
    const now = Date.now();
    const authorizationCode = createAuthorizationCodeValue();
    const authorizationCodeHash = await sha256Hex(authorizationCode);
    const protocolValidationOptions = getDefaultMcpProtocolValidationOptions();
    const issueResult = await ctx.runMutation(
      internal.mcp.oauth.issueAuthorizationCodeForAuthRequest,
      {
        requestId: args.requestId,
        userId: ctx.viewer.userId,
        codeHash: authorizationCodeHash,
        codeExpiresAt: now + MCP_AUTHORIZATION_CODE_TTL_MS,
        grantMode: "create_or_reuse",
        allowLoopbackHttpRedirectUris:
          protocolValidationOptions.allowLoopbackHttpRedirectUris === true,
        now,
      },
    );
    if (!issueResult.ok) {
      throw new Error(`${issueResult.error}: ${issueResult.errorDescription}`);
    }

    return {
      redirectUrl: buildMcpAuthorizationSuccessRedirectUrl(issueResult.redirectUri, {
        code: authorizationCode,
        iss: new URL(issueResult.resource).origin,
        state: issueResult.state,
      }),
    };
  },
});

export const denyAuthorizationRequestForCurrentUser = action({
  access: "access_mcp",
  args: denyAuthorizationRequestForCurrentUserArgsValidator,
  returns: denyAuthorizationRequestForCurrentUserResultValidator,
  handler: async (
    ctx,
    args: DenyAuthorizationRequestForCurrentUserArgs,
  ): Promise<DenyAuthorizationRequestForCurrentUserResult> => {
    const now = Date.now();
    const denyResult = await ctx.runMutation(internal.mcp.oauth.denyAuthorizationRequest, {
      requestId: args.requestId,
      userId: ctx.viewer.userId,
      now,
    });
    if (!denyResult.ok) {
      throw new Error(`${denyResult.error}: ${denyResult.errorDescription}`);
    }

    const redirectUrl = new URL(denyResult.redirectUri);
    applyMcpDenyErrorParamsToRedirectUrl(
      redirectUrl,
      denyResult.state,
      new URL(denyResult.resource).origin,
    );

    return { redirectUrl: redirectUrl.toString() };
  },
});

export const exchangeAuthorizationCode = internalMutation({
  args: exchangeAuthorizationCodeArgsValidator,
  returns: tokenExchangeResultValidator,
  handler: async (ctx, args: ExchangeAuthorizationCodeArgs): Promise<TokenExchangeResult> => {
    const allowLoopbackHttpRedirectUris = args.allowLoopbackHttpRedirectUris === true;
    const authorizationCode = await ctx.db
      .query("mcpAuthorizationCodes")
      .withIndex("by_code_hash", (q) => q.eq("codeHash", args.codeHash))
      .first();
    if (!authorizationCode) {
      return oauthError({
        status: 400,
        error: "invalid_grant",
        errorDescription: "Authorization code is invalid.",
      });
    }

    if (typeof authorizationCode.usedAt === "number") {
      return oauthError({
        status: 400,
        error: "invalid_grant",
        errorDescription: "Authorization code was already used.",
      });
    }

    if (authorizationCode.expiresAt <= args.now) {
      return oauthError({
        status: 400,
        error: "invalid_grant",
        errorDescription: "Authorization code expired.",
      });
    }

    if (
      authorizationCode.clientId !== args.clientId ||
      authorizationCode.redirectUri !== args.redirectUri
    ) {
      return oauthError({
        status: 400,
        error: "invalid_grant",
        errorDescription: "Authorization code does not match client binding.",
      });
    }

    if (authorizationCode.resource !== args.resource) {
      return oauthError({
        status: 400,
        error: "invalid_target",
        errorDescription: "resource does not match the authorization code.",
      });
    }

    const user = await ctx.db.get(authorizationCode.userId);
    if (!user || readActiveUser(user) === null) {
      return oauthError({
        status: 400,
        error: "invalid_grant",
        errorDescription: "Grant is no longer active.",
      });
    }

    const authRequest = await ctx.db
      .query("mcpAuthorizationRequests")
      .withIndex("by_request_id", (q) => q.eq("requestId", authorizationCode.requestId))
      .first();
    if (!authRequest) {
      return oauthError({
        status: 400,
        error: "invalid_grant",
        errorDescription: "Authorization request could not be resolved.",
      });
    }

    const pkceValid = await verifyPkceS256({
      codeVerifier: args.codeVerifier,
      expectedCodeChallenge: authRequest.codeChallenge,
    });
    if (!pkceValid) {
      return oauthError({
        status: 400,
        error: "invalid_grant",
        errorDescription: "PKCE code_verifier mismatch.",
      });
    }

    const client = await ctx.db
      .query("mcpOauthClients")
      .withIndex("by_client_id", (q) => q.eq("clientId", args.clientId))
      .first();
    if (!client) {
      return oauthError({
        status: 400,
        error: "invalid_client",
        errorDescription: "Unknown client_id.",
      });
    }

    if (
      isMcpOauthClientInactive({
        client,
        now: args.now,
      })
    ) {
      return oauthError({
        status: 400,
        error: "invalid_client",
        errorDescription: "Client is not active.",
      });
    }

    if (
      !redirectUriMatchesRegistered({
        requestedRedirectUri: args.redirectUri,
        registeredRedirectUris: client.redirectUris,
        options: {
          allowLoopbackHttpRedirectUris,
        },
      })
    ) {
      return oauthError({
        status: 400,
        error: "invalid_request",
        errorDescription: "redirect_uri is not registered for this client.",
      });
    }
    const supportsRefreshToken = client.grantTypes.includes("refresh_token");

    const grant = await ctx.db
      .query("mcpGrants")
      .withIndex("by_grant_id", (q) => q.eq("grantId", authorizationCode.grantId))
      .first();
    if (!grant || grant.status !== "active") {
      return oauthError({
        status: 400,
        error: "invalid_grant",
        errorDescription: "Grant is no longer active.",
      });
    }

    await ctx.db.patch(authorizationCode._id, {
      usedAt: args.now,
    });

    const refreshTokensForGrant = await ctx.db
      .query("mcpRefreshTokens")
      .withIndex("by_grant_id", (q) => q.eq("grantId", grant.grantId))
      .collect();
    await Promise.all(
      refreshTokensForGrant
        .filter((token) => token.status === "active")
        .map(async (token) => {
          await ctx.db.patch(token._id, {
            status: "revoked",
            rotatedAt: args.now,
          });
        }),
    );

    await ctx.db.insert("mcpAccessTokens", {
      tokenHash: args.accessTokenHash,
      grantId: grant.grantId,
      clientId: grant.clientId,
      userId: grant.userId,
      resource: grant.resource,
      scope: grant.scope,
      createdAt: args.now,
      expiresAt: args.accessTokenExpiresAt,
    });

    if (supportsRefreshToken) {
      await ctx.db.insert("mcpRefreshTokens", {
        grantId: grant.grantId,
        clientId: grant.clientId,
        userId: grant.userId,
        tokenHash: args.refreshTokenHash,
        status: "active",
        createdAt: args.now,
        expiresAt: args.refreshTokenExpiresAt,
      });
    }

    await ctx.db.patch(grant._id, {
      updatedAt: args.now,
      lastUsedAt: args.now,
    });

    await ctx.db.patch(client._id, {
      registrationStatus: "active",
      provisionalExpiresAt: undefined,
      firstTokenExchangedAt: client.firstTokenExchangedAt ?? args.now,
      updatedAt: args.now,
    });

    await ctx.db.insert("audit_mcpAccess_events", {
      grantId: grant.grantId,
      clientId: grant.clientId,
      userId: grant.userId,
      action: "access_token_issued",
      createdAt: args.now,
      detailsJson: JSON.stringify({
        flow: "authorization_code",
      }),
    });

    return {
      ok: true,
      grantId: grant.grantId,
      userId: grant.userId,
      clientId: grant.clientId,
      scope: grant.scope,
      resource: grant.resource,
      refreshTokenIssued: supportsRefreshToken,
    };
  },
});

export const exchangeRefreshToken = internalMutation({
  args: exchangeRefreshTokenArgsValidator,
  returns: tokenExchangeResultValidator,
  handler: async (ctx, args: ExchangeRefreshTokenArgs): Promise<TokenExchangeResult> => {
    const refreshToken = await ctx.db
      .query("mcpRefreshTokens")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", args.refreshTokenHash))
      .first();
    if (!refreshToken) {
      return oauthError({
        status: 400,
        error: "invalid_grant",
        errorDescription: "Refresh token is invalid.",
      });
    }

    const user = await ctx.db.get(refreshToken.userId);
    if (!user || readActiveUser(user) === null) {
      return oauthError({
        status: 400,
        error: "invalid_grant",
        errorDescription: "Grant is no longer active.",
      });
    }

    if (refreshToken.status === "rotated") {
      const grant = await ctx.db
        .query("mcpGrants")
        .withIndex("by_grant_id", (q) => q.eq("grantId", refreshToken.grantId))
        .first();
      if (
        grant &&
        grant.clientId === refreshToken.clientId &&
        grant.userId === refreshToken.userId
      ) {
        await revokeActiveMcpGrant(ctx, {
          action: "refresh_token_replay_detected",
          detailsJson: JSON.stringify({ outcome: "grant_revoked" }),
          grant,
          now: args.now,
        });
      }
    }

    if (refreshToken.status !== "active") {
      return oauthError({
        status: 400,
        error: "invalid_grant",
        errorDescription: "Refresh token is no longer active.",
      });
    }

    if (typeof refreshToken.expiresAt === "number" && refreshToken.expiresAt <= args.now) {
      await ctx.db.patch(refreshToken._id, {
        status: "expired",
      });
      return oauthError({
        status: 400,
        error: "invalid_grant",
        errorDescription: "Refresh token expired.",
      });
    }

    if (refreshToken.clientId !== args.clientId) {
      return oauthError({
        status: 400,
        error: "invalid_grant",
        errorDescription: "Refresh token does not match client_id.",
      });
    }

    const grant = await ctx.db
      .query("mcpGrants")
      .withIndex("by_grant_id", (q) => q.eq("grantId", refreshToken.grantId))
      .first();
    if (!grant || grant.status !== "active") {
      return oauthError({
        status: 400,
        error: "invalid_grant",
        errorDescription: "Grant is no longer active.",
      });
    }
    if (grant.resource !== args.resource) {
      return oauthError({
        status: 400,
        error: "invalid_target",
        errorDescription: "resource does not match the authorization grant.",
      });
    }
    const client = await ctx.db
      .query("mcpOauthClients")
      .withIndex("by_client_id", (q) => q.eq("clientId", grant.clientId))
      .first();
    if (!client) {
      return oauthError({
        status: 400,
        error: "invalid_client",
        errorDescription: "Unknown client_id.",
      });
    }
    if (
      isMcpOauthClientInactive({
        client,
        now: args.now,
      })
    ) {
      return oauthError({
        status: 400,
        error: "invalid_client",
        errorDescription: "Client is not active.",
      });
    }
    if (!client.grantTypes.includes("refresh_token")) {
      return oauthError({
        status: 400,
        error: "unauthorized_client",
        errorDescription: "Client is not allowed to use refresh_token.",
      });
    }

    await ctx.db.patch(refreshToken._id, {
      status: "rotated",
      rotatedAt: args.now,
      replacedByTokenHash: args.newRefreshTokenHash,
    });

    await ctx.db.insert("mcpRefreshTokens", {
      grantId: grant.grantId,
      clientId: grant.clientId,
      userId: grant.userId,
      tokenHash: args.newRefreshTokenHash,
      status: "active",
      createdAt: args.now,
      expiresAt: args.refreshTokenExpiresAt,
    });

    await ctx.db.insert("mcpAccessTokens", {
      tokenHash: args.accessTokenHash,
      grantId: grant.grantId,
      clientId: grant.clientId,
      userId: grant.userId,
      resource: grant.resource,
      scope: grant.scope,
      createdAt: args.now,
      expiresAt: args.accessTokenExpiresAt,
    });

    await ctx.db.patch(grant._id, {
      updatedAt: args.now,
      lastUsedAt: args.now,
    });

    await ctx.db.insert("audit_mcpAccess_events", {
      grantId: grant.grantId,
      clientId: grant.clientId,
      userId: grant.userId,
      action: "access_token_issued",
      createdAt: args.now,
      detailsJson: JSON.stringify({
        flow: "refresh_token",
      }),
    });

    return {
      ok: true,
      grantId: grant.grantId,
      userId: grant.userId,
      clientId: grant.clientId,
      scope: grant.scope,
      resource: grant.resource,
      refreshTokenIssued: true,
    };
  },
});

export const validateAccessToken = internalMutation({
  args: validateAccessTokenArgsValidator,
  returns: validateAccessTokenResultValidator,
  handler: async (ctx, args: ValidateAccessTokenArgs): Promise<ValidateAccessTokenResult> => {
    const accessToken = await ctx.db
      .query("mcpAccessTokens")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", args.tokenHash))
      .first();
    if (!accessToken) {
      return oauthError({
        status: 401,
        error: "invalid_token",
        errorDescription: "Access token is invalid.",
      });
    }

    if (typeof accessToken.revokedAt === "number") {
      return oauthError({
        status: 401,
        error: "invalid_token",
        errorDescription: "Access token is revoked.",
      });
    }

    if (accessToken.expiresAt <= args.now) {
      return oauthError({
        status: 401,
        error: "invalid_token",
        errorDescription: "Access token expired.",
      });
    }

    const user = await ctx.db.get(accessToken.userId);
    if (!user || readActiveUser(user) === null) {
      return oauthError({
        status: 401,
        error: "invalid_token",
        errorDescription: "Grant is no longer active.",
      });
    }

    const grant = await ctx.db
      .query("mcpGrants")
      .withIndex("by_grant_id", (q) => q.eq("grantId", accessToken.grantId))
      .first();
    if (!grant || grant.status !== "active") {
      return oauthError({
        status: 401,
        error: "invalid_token",
        errorDescription: "Grant is no longer active.",
      });
    }
    const client = await ctx.db
      .query("mcpOauthClients")
      .withIndex("by_client_id", (q) => q.eq("clientId", grant.clientId))
      .first();
    if (!client) {
      return oauthError({
        status: 401,
        error: "invalid_token",
        errorDescription: "Client for access token is unknown.",
      });
    }
    if (
      isMcpOauthClientInactive({
        client,
        now: args.now,
      })
    ) {
      return oauthError({
        status: 401,
        error: "invalid_token",
        errorDescription: "Client for access token is not active.",
      });
    }

    const shouldUpdateAccessTokenLastUsedAt =
      typeof accessToken.lastUsedAt !== "number" ||
      args.now - accessToken.lastUsedAt >= MCP_LAST_USED_WRITE_THROTTLE_MS;
    const shouldUpdateGrantLastUsedAt =
      typeof grant.lastUsedAt !== "number" ||
      args.now - grant.lastUsedAt >= MCP_LAST_USED_WRITE_THROTTLE_MS;

    await Promise.all([
      shouldUpdateAccessTokenLastUsedAt
        ? ctx.db.patch(accessToken._id, {
            lastUsedAt: args.now,
          })
        : Promise.resolve(),
      shouldUpdateGrantLastUsedAt
        ? ctx.db.patch(grant._id, {
            updatedAt: args.now,
            lastUsedAt: args.now,
          })
        : Promise.resolve(),
    ]);

    return {
      ok: true,
      grantId: grant.grantId,
      userId: grant.userId,
      clientId: grant.clientId,
      scope: grant.scope,
      resource: grant.resource,
    };
  },
});
