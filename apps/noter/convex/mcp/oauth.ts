import { Infer, v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "../_generated/api";
import {
  action,
  internalMutation,
  internalQuery,
  query,
} from "../_generated/server";
import { randomToken } from "../oauthUtils";
import { applyMcpDenyErrorParamsToRedirectUrl } from "../../shared/mcpOAuth";
import {
  McpAuthRequestStatus,
  McpOauthClientRegistrationStatus,
} from "../schema";
import {
  getDefaultMcpProtocolValidationOptions,
  redirectUriMatchesRegistered,
} from "./protocol";
import {
  createAuthorizationCodeValue,
  MCP_AUTHORIZATION_CODE_TTL_MS,
  sha256Hex,
  verifyPkceS256,
} from "./tokens";

const {
  array,
  boolean,
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
type CompleteAuthorizationRequestArgs = Infer<
  typeof completeAuthorizationRequestArgsValidator
>;

const completeAuthorizationRequestResultValidator = object({
  redirectUrl: string(),
});
type CompleteAuthorizationRequestResult = Infer<
  typeof completeAuthorizationRequestResultValidator
>;

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
type DenyAuthorizationRequestArgs = Infer<
  typeof denyAuthorizationRequestArgsValidator
>;

const denyAuthorizationRequestResultValidator = union(
  object({
    ok: literal(true),
    redirectUri: string(),
    state: optional(string()),
  }),
  mcpOauthErrorValidator,
);
type DenyAuthorizationRequestResult = Infer<
  typeof denyAuthorizationRequestResultValidator
>;

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
    status: McpAuthRequestStatus,
    dynamicallyRegistered: boolean(),
    createdAt: number(),
    expiresAt: number(),
  }),
  nullValue(),
);
type GetAuthorizationRequestForCurrentUserResult = Infer<
  typeof getAuthorizationRequestForCurrentUserResultValidator
>;

const exchangeAuthorizationCodeArgsValidator = object({
  codeHash: string(),
  clientId: string(),
  redirectUri: string(),
  codeVerifier: string(),
  allowLoopbackHttpRedirectUris: optional(boolean()),
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
  refreshTokenIssued: boolean(),
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

function isClientInactive(args: {
  client: {
    registrationStatus: Infer<typeof McpOauthClientRegistrationStatus>;
    provisionalExpiresAt?: number;
  };
  now: number;
}): boolean {
  return (
    args.client.registrationStatus === "expired" ||
    args.client.registrationStatus === "disabled" ||
    (typeof args.client.provisionalExpiresAt === "number" &&
      args.client.provisionalExpiresAt <= args.now)
  );
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

export const getAuthorizationRequestForCurrentUser = query({
  args: getAuthorizationRequestForCurrentUserArgsValidator,
  returns: getAuthorizationRequestForCurrentUserResultValidator,
  handler: async (
    ctx,
    args: GetAuthorizationRequestForCurrentUserArgs,
  ): Promise<GetAuthorizationRequestForCurrentUserResult> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return null;
    }

    const authRequest = await ctx.db
      .query("mcpAuthRequests")
      .withIndex("by_request_id", (q) => q.eq("requestId", args.requestId))
      .first();
    if (!authRequest) {
      return null;
    }
    if (authRequest.userId && authRequest.userId !== userId) {
      return null;
    }

    const client = await ctx.db
      .query("mcpOauthClients")
      .withIndex("by_client_id", (q) => q.eq("clientId", authRequest.clientId))
      .first();
    const effectiveStatus =
      authRequest.status === "pending" && authRequest.expiresAt <= Date.now()
        ? ("expired" satisfies Infer<typeof McpAuthRequestStatus>)
        : authRequest.status;

    return {
      requestId: authRequest.requestId,
      clientId: authRequest.clientId,
      clientName: client?.clientName,
      scope: authRequest.scope,
      scopes: authRequest.scope
        .split(" ")
        .map((scope) => scope.trim())
        .filter((scope) => scope.length > 0),
      resource: authRequest.resource,
      status: effectiveStatus,
      dynamicallyRegistered: client?.createdBy === "dynamic_registration",
      createdAt: authRequest.createdAt,
      expiresAt: authRequest.expiresAt,
    };
  },
});

export const hasActiveGrantForAuthRequest = internalQuery({
  args: {
    requestId: string(),
    userId: id("users"),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const authRequest = await ctx.db
      .query("mcpAuthRequests")
      .withIndex("by_request_id", (q) => q.eq("requestId", args.requestId))
      .first();
    if (!authRequest) {
      return false;
    }
    const userGrants = await ctx.db
      .query("mcpGrants")
      .withIndex("by_user_id", (q) => q.eq("userId", args.userId))
      .collect();
    return userGrants.some(
      (grant) =>
        grant.clientId === authRequest.clientId &&
        grant.resource === authRequest.resource &&
        grant.scope === authRequest.scope &&
        grant.status === "active",
    );
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
    const allowLoopbackHttpRedirectUris =
      args.allowLoopbackHttpRedirectUris === true;
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
      isClientInactive({
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

export const denyAuthorizationRequest = internalMutation({
  args: denyAuthorizationRequestArgsValidator,
  returns: denyAuthorizationRequestResultValidator,
  handler: async (
    ctx,
    args: DenyAuthorizationRequestArgs,
  ): Promise<DenyAuthorizationRequestResult> => {
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

    await ctx.db.patch(authRequest._id, {
      status: "denied" satisfies Infer<typeof McpAuthRequestStatus>,
      userId: args.userId,
    });

    await ctx.db.insert("mcpAccessAudit", {
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
      state: authRequest.state,
    };
  },
});

export const completeAuthorizationRequestForCurrentUser = action({
  args: completeAuthorizationRequestArgsValidator,
  returns: completeAuthorizationRequestResultValidator,
  handler: async (
    ctx,
    args: CompleteAuthorizationRequestArgs,
  ): Promise<CompleteAuthorizationRequestResult> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("User not authenticated");
    }

    const now = Date.now();
    const authorizationCode = createAuthorizationCodeValue();
    const authorizationCodeHash = await sha256Hex(authorizationCode);
    const protocolValidationOptions = getDefaultMcpProtocolValidationOptions();
    const issueResult = await ctx.runMutation(
      internal.mcp.oauth.issueAuthorizationCodeForAuthRequest,
      {
        requestId: args.requestId,
        userId,
        codeHash: authorizationCodeHash,
        codeExpiresAt: now + MCP_AUTHORIZATION_CODE_TTL_MS,
        allowLoopbackHttpRedirectUris:
          protocolValidationOptions.allowLoopbackHttpRedirectUris === true,
        now,
      },
    );
    if (!issueResult.ok) {
      throw new Error(`${issueResult.error}: ${issueResult.errorDescription}`);
    }

    const redirectUrl = new URL(issueResult.redirectUri);
    redirectUrl.searchParams.set("code", authorizationCode);
    if (issueResult.state !== undefined) {
      redirectUrl.searchParams.set("state", issueResult.state);
    }

    return { redirectUrl: redirectUrl.toString() };
  },
});

export const denyAuthorizationRequestForCurrentUser = action({
  args: denyAuthorizationRequestForCurrentUserArgsValidator,
  returns: denyAuthorizationRequestForCurrentUserResultValidator,
  handler: async (
    ctx,
    args: DenyAuthorizationRequestForCurrentUserArgs,
  ): Promise<DenyAuthorizationRequestForCurrentUserResult> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("User not authenticated");
    }

    const now = Date.now();
    const denyResult = await ctx.runMutation(
      internal.mcp.oauth.denyAuthorizationRequest,
      {
        requestId: args.requestId,
        userId,
        now,
      },
    );
    if (!denyResult.ok) {
      throw new Error(`${denyResult.error}: ${denyResult.errorDescription}`);
    }

    const redirectUrl = new URL(denyResult.redirectUri);
    applyMcpDenyErrorParamsToRedirectUrl(redirectUrl, denyResult.state);

    return { redirectUrl: redirectUrl.toString() };
  },
});

export const exchangeAuthorizationCode = internalMutation({
  args: exchangeAuthorizationCodeArgsValidator,
  returns: tokenExchangeResultValidator,
  handler: async (
    ctx,
    args: ExchangeAuthorizationCodeArgs,
  ): Promise<TokenExchangeResult> => {
    const allowLoopbackHttpRedirectUris =
      args.allowLoopbackHttpRedirectUris === true;
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
      isClientInactive({
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
      refreshTokenIssued: supportsRefreshToken,
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
      isClientInactive({
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
      refreshTokenIssued: true,
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
      isClientInactive({
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
