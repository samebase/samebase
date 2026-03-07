import { Infer, v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { randomToken } from "../oauthUtils";
import {
  McpAuthRequestStatus,
  McpOauthClientRegistrationStatus,
} from "../schema";
import { verifyPkceS256 } from "./tokens";

const {
  array,
  id,
  literal,
  null: nullValue,
  number,
  object,
  optional,
  string,
  union,
} = v;

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
type RegisterDynamicClientArgs = Infer<
  typeof registerDynamicClientArgsValidator
>;

const getClientByIdResultValidator = union(
  object({
    id: id("mcpOauthClients"),
    clientId: string(),
    clientName: optional(string()),
    redirectUris: array(string()),
    grantTypes: array(string()),
    responseTypes: array(string()),
    tokenEndpointAuthMethod: literal("none"),
    registrationStatus: McpOauthClientRegistrationStatus,
    provisionalExpiresAt: optional(number()),
    firstTokenExchangedAt: optional(number()),
    createdAt: number(),
    updatedAt: number(),
    metadataJson: string(),
  }),
  nullValue(),
);
type GetClientByIdResult = Infer<typeof getClientByIdResultValidator>;

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
  now: number(),
});
type IssueAuthorizationCodeForAuthRequestArgs = Infer<
  typeof issueAuthorizationCodeForAuthRequestArgsValidator
>;

const issueAuthorizationCodeForAuthRequestResultValidator = union(
  object({
    ok: literal(true),
    redirectUri: string(),
    state: optional(string()),
  }),
  mcpOauthErrorValidator,
);
type IssueAuthorizationCodeForAuthRequestResult = Infer<
  typeof issueAuthorizationCodeForAuthRequestResultValidator
>;

const exchangeAuthorizationCodeArgsValidator = object({
  codeHash: string(),
  clientId: string(),
  redirectUri: string(),
  codeVerifier: string(),
  accessTokenHash: string(),
  refreshTokenHash: string(),
  accessTokenExpiresAt: number(),
  refreshTokenExpiresAt: number(),
  now: number(),
});
type ExchangeAuthorizationCodeArgs = Infer<
  typeof exchangeAuthorizationCodeArgsValidator
>;

const tokenExchangeSuccessValidator = object({
  ok: literal(true),
  grantId: string(),
  userId: id("users"),
  clientId: string(),
  scope: string(),
  resource: string(),
});

const tokenExchangeResultValidator = union(
  tokenExchangeSuccessValidator,
  mcpOauthErrorValidator,
);
type TokenExchangeResult = Infer<typeof tokenExchangeResultValidator>;

const exchangeRefreshTokenArgsValidator = object({
  refreshTokenHash: string(),
  clientId: string(),
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
type ValidateAccessTokenResult = Infer<
  typeof validateAccessTokenResultValidator
>;

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
  returns: getClientByIdResultValidator,
  handler: async (ctx, args): Promise<GetClientByIdResult> => {
    const client = await ctx.db
      .query("mcpOauthClients")
      .withIndex("by_client_id", (q) => q.eq("clientId", args.clientId))
      .first();
    if (!client) {
      return null;
    }
    return {
      id: client._id,
      clientId: client.clientId,
      clientName: client.clientName,
      redirectUris: client.redirectUris,
      grantTypes: client.grantTypes,
      responseTypes: client.responseTypes,
      tokenEndpointAuthMethod: client.tokenEndpointAuthMethod,
      registrationStatus: client.registrationStatus,
      provisionalExpiresAt: client.provisionalExpiresAt,
      firstTokenExchangedAt: client.firstTokenExchangedAt,
      createdAt: client.createdAt,
      updatedAt: client.updatedAt,
      metadataJson: client.metadataJson,
    };
  },
});

export const createAuthRequest = internalMutation({
  args: createAuthRequestArgsValidator,
  returns: id("mcpAuthRequests"),
  handler: async (ctx, args: CreateAuthRequestArgs) => {
    return await ctx.db.insert("mcpAuthRequests", {
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

export const expireAuthRequest = internalMutation({
  args: {
    authRequestId: id("mcpAuthRequests"),
  },
  returns: nullValue(),
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.authRequestId);
    if (!existing) {
      return null;
    }
    await ctx.db.patch(args.authRequestId, {
      status: "expired" satisfies Infer<typeof McpAuthRequestStatus>,
    });
    return null;
  },
});

export const issueAuthorizationCodeForAuthRequest = internalMutation({
  args: issueAuthorizationCodeForAuthRequestArgsValidator,
  returns: issueAuthorizationCodeForAuthRequestResultValidator,
  handler: async (
    ctx,
    args: IssueAuthorizationCodeForAuthRequestArgs,
  ): Promise<IssueAuthorizationCodeForAuthRequestResult> => {
    const authRequest = await ctx.db
      .query("mcpAuthRequests")
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
        status: "expired" satisfies Infer<typeof McpAuthRequestStatus>,
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
      client.registrationStatus === "expired" ||
      client.registrationStatus === "disabled"
    ) {
      return oauthError({
        status: 400,
        error: "invalid_client",
        errorDescription: "Client is not active.",
      });
    }

    if (!client.redirectUris.includes(authRequest.redirectUri)) {
      return oauthError({
        status: 400,
        error: "invalid_request",
        errorDescription:
          "Authorization request redirect_uri is not registered.",
      });
    }

    const userGrants = await ctx.db
      .query("mcpGrants")
      .withIndex("by_user_id", (q) => q.eq("userId", args.userId))
      .collect();
    const existingGrant = userGrants.find(
      (grant) =>
        grant.clientId === authRequest.clientId &&
        grant.resource === authRequest.resource &&
        grant.scope === authRequest.scope &&
        grant.status === "active",
    );

    const grantId = existingGrant?.grantId ?? `mcpg_${randomToken(24)}`;
    if (existingGrant) {
      await ctx.db.patch(existingGrant._id, {
        updatedAt: args.now,
      });
    } else {
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
      status: "approved" satisfies Infer<typeof McpAuthRequestStatus>,
      userId: args.userId,
    });

    await ctx.db.insert("mcpAccessAudit", {
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
      state: authRequest.state,
    };
  },
});

export const exchangeAuthorizationCode = internalMutation({
  args: exchangeAuthorizationCodeArgsValidator,
  returns: tokenExchangeResultValidator,
  handler: async (
    ctx,
    args: ExchangeAuthorizationCodeArgs,
  ): Promise<TokenExchangeResult> => {
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

    const authRequest = await ctx.db
      .query("mcpAuthRequests")
      .withIndex("by_request_id", (q) =>
        q.eq("requestId", authorizationCode.requestId),
      )
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
      client.registrationStatus === "expired" ||
      client.registrationStatus === "disabled"
    ) {
      return oauthError({
        status: 400,
        error: "invalid_client",
        errorDescription: "Client is not active.",
      });
    }

    if (!client.redirectUris.includes(args.redirectUri)) {
      return oauthError({
        status: 400,
        error: "invalid_request",
        errorDescription: "redirect_uri is not registered for this client.",
      });
    }

    const grant = await ctx.db
      .query("mcpGrants")
      .withIndex("by_grant_id", (q) =>
        q.eq("grantId", authorizationCode.grantId),
      )
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

    await ctx.db.insert("mcpRefreshTokens", {
      grantId: grant.grantId,
      clientId: grant.clientId,
      userId: grant.userId,
      tokenHash: args.refreshTokenHash,
      status: "active",
      createdAt: args.now,
      expiresAt: args.refreshTokenExpiresAt,
    });

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

    await ctx.db.insert("mcpAccessAudit", {
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
    };
  },
});

export const exchangeRefreshToken = internalMutation({
  args: exchangeRefreshTokenArgsValidator,
  returns: tokenExchangeResultValidator,
  handler: async (
    ctx,
    args: ExchangeRefreshTokenArgs,
  ): Promise<TokenExchangeResult> => {
    const refreshToken = await ctx.db
      .query("mcpRefreshTokens")
      .withIndex("by_token_hash", (q) =>
        q.eq("tokenHash", args.refreshTokenHash),
      )
      .first();
    if (!refreshToken) {
      return oauthError({
        status: 400,
        error: "invalid_grant",
        errorDescription: "Refresh token is invalid.",
      });
    }

    if (refreshToken.status !== "active") {
      return oauthError({
        status: 400,
        error: "invalid_grant",
        errorDescription: "Refresh token is no longer active.",
      });
    }

    if (
      typeof refreshToken.expiresAt === "number" &&
      refreshToken.expiresAt <= args.now
    ) {
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

    await ctx.db.insert("mcpAccessAudit", {
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
    };
  },
});

export const validateAccessToken = internalMutation({
  args: validateAccessTokenArgsValidator,
  returns: validateAccessTokenResultValidator,
  handler: async (
    ctx,
    args: ValidateAccessTokenArgs,
  ): Promise<ValidateAccessTokenResult> => {
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

    await ctx.db.patch(accessToken._id, {
      lastUsedAt: args.now,
    });
    await ctx.db.patch(grant._id, {
      updatedAt: args.now,
      lastUsedAt: args.now,
    });

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
