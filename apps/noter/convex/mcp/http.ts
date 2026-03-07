import { getAuthUserId } from "@convex-dev/auth/server";
import { asRecord } from "../jsonUtils";
import { internal } from "../_generated/api";
import { httpAction } from "../_generated/server";
import { randomToken } from "../oauthUtils";
import {
  createAccessTokenValue,
  createAuthorizationCodeValue,
  createRefreshTokenValue,
  MCP_ACCESS_TOKEN_TTL_MS,
  MCP_AUTHORIZATION_CODE_TTL_MS,
  MCP_REFRESH_TOKEN_TTL_MS,
  sha256Hex,
} from "./tokens";
import {
  buildMcpAuthorizationServerMetadata,
  buildMcpProtectedResourceMetadata,
  type McpProtocolValidationOptions,
  readBearerTokenFromAuthorizationHeader,
  redirectUriMatchesRegistered,
  validateAuthorizeRequestFromUrl,
  validateDynamicClientRegistrationPayload,
  validateJsonRpcRequestPayload,
  validateTokenRequestFromSearchParams,
} from "./protocol";

const MCP_PROVISIONAL_CLIENT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MCP_AUTH_REQUEST_TTL_MS = 10 * 60 * 1000;
const MCP_PROTOCOL_VERSION = "2025-03-26";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function oauthErrorResponse(args: {
  status: number;
  error: string;
  errorDescription: string;
}): Response {
  return jsonResponse(
    {
      error: args.error,
      error_description: args.errorDescription,
    },
    args.status,
  );
}

function parseOrigin(request: Request): string {
  return new URL(request.url).origin;
}

function hasJsonContentType(request: Request): boolean {
  const contentType = request.headers.get("content-type");
  if (!contentType) {
    return false;
  }
  return contentType.toLowerCase().startsWith("application/json");
}

function hasFormUrlEncodedContentType(request: Request): boolean {
  const contentType = request.headers.get("content-type");
  if (!contentType) {
    return false;
  }
  return contentType
    .toLowerCase()
    .startsWith("application/x-www-form-urlencoded");
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "[::1]"
  );
}

function getProtocolValidationOptions(
  request: Request,
): McpProtocolValidationOptions {
  const requestUrl = new URL(request.url);
  return {
    allowLoopbackHttpRedirectUris: isLoopbackHostname(requestUrl.hostname),
  };
}

function jsonRpcSuccessResponse(args: {
  id?: string | number | null;
  result: unknown;
}): Response {
  return jsonResponse({
    jsonrpc: "2.0",
    id: args.id,
    result: args.result,
  });
}

function jsonRpcErrorResponse(args: {
  id?: string | number | null;
  code: number;
  message: string;
  status?: number;
}): Response {
  return jsonResponse(
    {
      jsonrpc: "2.0",
      id: args.id,
      error: {
        code: args.code,
        message: args.message,
      },
    },
    args.status ?? 400,
  );
}

function hasScope(grantedScope: string, requiredScope: string): boolean {
  const scopeTokens = grantedScope
    .split(" ")
    .map((scope) => scope.trim())
    .filter((scope) => scope.length > 0);
  return scopeTokens.includes(requiredScope);
}

function buildMcpToolList(): {
  tools: {
    name: string;
    description: string;
    inputSchema: {
      type: "object";
      properties: Record<string, never>;
      additionalProperties: false;
    };
  }[];
} {
  return {
    tools: [
      {
        name: "vaults.list",
        description:
          "List vault repositories available to the authenticated Noter user.",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
      },
    ],
  };
}

export const getMcpOauthProtectedResourceMetadata = httpAction(
  async (_ctx, request) => {
    const origin = parseOrigin(request);
    return jsonResponse(buildMcpProtectedResourceMetadata(origin), 200);
  },
);

export const getMcpOauthAuthorizationServerMetadata = httpAction(
  async (_ctx, request) => {
    const origin = parseOrigin(request);
    return jsonResponse(buildMcpAuthorizationServerMetadata(origin), 200);
  },
);

export const registerMcpOauthClient = httpAction(async (ctx, request) => {
  if (!hasJsonContentType(request)) {
    return oauthErrorResponse({
      status: 415,
      error: "invalid_request",
      errorDescription: "content-type must be application/json",
    });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return oauthErrorResponse({
      status: 400,
      error: "invalid_request",
      errorDescription: "Request body must be valid JSON.",
    });
  }

  const validation = validateDynamicClientRegistrationPayload(
    payload,
    getProtocolValidationOptions(request),
  );
  if (!validation.ok) {
    return oauthErrorResponse({
      status: validation.status,
      error: "invalid_client_metadata",
      errorDescription: validation.error,
    });
  }

  const now = Date.now();
  const clientId = `mcpc_${randomToken(24)}`;
  const provisionalExpiresAt = now + MCP_PROVISIONAL_CLIENT_TTL_MS;

  await ctx.runMutation(internal.mcp.oauth.registerDynamicClient, {
    clientId,
    clientName: validation.value.clientName ?? undefined,
    redirectUris: validation.value.redirectUris,
    grantTypes: validation.value.grantTypes,
    responseTypes: validation.value.responseTypes,
    tokenEndpointAuthMethod: validation.value.tokenEndpointAuthMethod,
    provisionalExpiresAt,
    createdAt: now,
    updatedAt: now,
    metadataJson: JSON.stringify(payload),
  });

  return jsonResponse(
    {
      client_id: clientId,
      client_id_issued_at: Math.floor(now / 1000),
      client_name: validation.value.clientName ?? undefined,
      redirect_uris: validation.value.redirectUris,
      grant_types: validation.value.grantTypes,
      response_types: validation.value.responseTypes,
      token_endpoint_auth_method: validation.value.tokenEndpointAuthMethod,
    },
    201,
  );
});

export const authorizeMcpOauthRequest = httpAction(async (ctx, request) => {
  const now = Date.now();
  const protocolValidationOptions = getProtocolValidationOptions(request);
  const url = new URL(request.url);
  const validation = validateAuthorizeRequestFromUrl(
    url,
    protocolValidationOptions,
  );
  if (!validation.ok) {
    return oauthErrorResponse({
      status: validation.status,
      error: "invalid_request",
      errorDescription: validation.error,
    });
  }

  const client = await ctx.runQuery(internal.mcp.oauth.getClientByClientId, {
    clientId: validation.value.clientId,
  });
  if (!client) {
    return oauthErrorResponse({
      status: 400,
      error: "invalid_client",
      errorDescription: "Unknown client_id.",
    });
  }

  if (
    client.registrationStatus === "expired" ||
    client.registrationStatus === "disabled" ||
    (typeof client.provisionalExpiresAt === "number" &&
      client.provisionalExpiresAt <= now)
  ) {
    return oauthErrorResponse({
      status: 400,
      error: "invalid_client",
      errorDescription: "Client is not active.",
    });
  }

  if (
    !redirectUriMatchesRegistered({
      requestedRedirectUri: validation.value.redirectUri,
      registeredRedirectUris: client.redirectUris,
      options: protocolValidationOptions,
    })
  ) {
    return oauthErrorResponse({
      status: 400,
      error: "invalid_request",
      errorDescription: "redirect_uri is not registered for this client.",
    });
  }

  const expectedResource = `${parseOrigin(request)}/mcp`;
  if (validation.value.resource !== expectedResource) {
    return oauthErrorResponse({
      status: 400,
      error: "invalid_target",
      errorDescription: "resource must target this MCP server.",
    });
  }

  const requestId = `mcpar_${randomToken(24)}`;
  const userId = await getAuthUserId(ctx);
  await ctx.runMutation(internal.mcp.oauth.createAuthRequest, {
    requestId,
    clientId: validation.value.clientId,
    redirectUri: validation.value.redirectUri,
    resource: validation.value.resource,
    scope: validation.value.scopes.join(" "),
    state: validation.value.state ?? undefined,
    codeChallenge: validation.value.codeChallenge,
    codeChallengeMethod: validation.value.codeChallengeMethod,
    userId: userId ?? undefined,
    createdAt: now,
    expiresAt: now + MCP_AUTH_REQUEST_TTL_MS,
  });

  if (!userId) {
    const consentUrl = new URL("/", parseOrigin(request));
    consentUrl.searchParams.set("mcp_consent_request", requestId);
    consentUrl.searchParams.set("mcp_login_required", "1");
    return Response.redirect(consentUrl.toString(), 302);
  }

  const hasExistingGrant = await ctx.runQuery(
    internal.mcp.oauth.hasActiveGrantForAuthRequest,
    {
      requestId,
      userId,
    },
  );
  if (!hasExistingGrant) {
    const consentUrl = new URL("/", parseOrigin(request));
    consentUrl.searchParams.set("mcp_consent_request", requestId);
    return Response.redirect(consentUrl.toString(), 302);
  }

  const authorizationCode = createAuthorizationCodeValue();
  const authorizationCodeHash = await sha256Hex(authorizationCode);
  const issueResult = await ctx.runMutation(
    internal.mcp.oauth.issueAuthorizationCodeForAuthRequest,
    {
      requestId,
      userId,
      codeHash: authorizationCodeHash,
      codeExpiresAt: now + MCP_AUTHORIZATION_CODE_TTL_MS,
      now,
    },
  );
  if (!issueResult.ok) {
    return oauthErrorResponse({
      status: issueResult.status,
      error: issueResult.error,
      errorDescription: issueResult.errorDescription,
    });
  }

  const redirectUrl = new URL(issueResult.redirectUri);
  redirectUrl.searchParams.set("code", authorizationCode);
  if (issueResult.state) {
    redirectUrl.searchParams.set("state", issueResult.state);
  }

  return Response.redirect(redirectUrl.toString(), 302);
});

export const exchangeMcpOauthToken = httpAction(async (ctx, request) => {
  if (!hasFormUrlEncodedContentType(request)) {
    return oauthErrorResponse({
      status: 415,
      error: "invalid_request",
      errorDescription:
        "content-type must be application/x-www-form-urlencoded",
    });
  }

  const rawBody = await request.text();
  const params = new URLSearchParams(rawBody);
  const now = Date.now();
  const protocolValidationOptions = getProtocolValidationOptions(request);
  const validation = validateTokenRequestFromSearchParams(
    params,
    protocolValidationOptions,
  );
  if (!validation.ok) {
    return oauthErrorResponse({
      status: validation.status,
      error: "invalid_request",
      errorDescription: validation.error,
    });
  }

  const client = await ctx.runQuery(internal.mcp.oauth.getClientByClientId, {
    clientId: validation.value.clientId,
  });
  if (!client) {
    return oauthErrorResponse({
      status: 400,
      error: "invalid_client",
      errorDescription: "Unknown client_id.",
    });
  }

  if (
    client.registrationStatus === "expired" ||
    client.registrationStatus === "disabled" ||
    (typeof client.provisionalExpiresAt === "number" &&
      client.provisionalExpiresAt <= now)
  ) {
    return oauthErrorResponse({
      status: 400,
      error: "invalid_client",
      errorDescription: "Client is not active.",
    });
  }

  const accessToken = createAccessTokenValue();
  const refreshToken = createRefreshTokenValue();
  const accessTokenHash = await sha256Hex(accessToken);
  const refreshTokenHash = await sha256Hex(refreshToken);

  if (validation.value.grantType === "authorization_code") {
    if (
      !redirectUriMatchesRegistered({
        requestedRedirectUri: validation.value.redirectUri,
        registeredRedirectUris: client.redirectUris,
        options: protocolValidationOptions,
      })
    ) {
      return oauthErrorResponse({
        status: 400,
        error: "invalid_request",
        errorDescription: "redirect_uri is not registered for this client.",
      });
    }

    const codeHash = await sha256Hex(validation.value.code);
    const exchangeResult = await ctx.runMutation(
      internal.mcp.oauth.exchangeAuthorizationCode,
      {
        codeHash,
        clientId: validation.value.clientId,
        redirectUri: validation.value.redirectUri,
        codeVerifier: validation.value.codeVerifier,
        accessTokenHash,
        refreshTokenHash,
        accessTokenExpiresAt: now + MCP_ACCESS_TOKEN_TTL_MS,
        refreshTokenExpiresAt: now + MCP_REFRESH_TOKEN_TTL_MS,
        now,
      },
    );

    if (!exchangeResult.ok) {
      return oauthErrorResponse({
        status: exchangeResult.status,
        error: exchangeResult.error,
        errorDescription: exchangeResult.errorDescription,
      });
    }

    return jsonResponse({
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: Math.floor(MCP_ACCESS_TOKEN_TTL_MS / 1000),
      refresh_token: refreshToken,
      scope: exchangeResult.scope,
      resource: exchangeResult.resource,
    });
  }

  const oldRefreshTokenHash = await sha256Hex(validation.value.refreshToken);
  const refreshResult = await ctx.runMutation(
    internal.mcp.oauth.exchangeRefreshToken,
    {
      refreshTokenHash: oldRefreshTokenHash,
      clientId: validation.value.clientId,
      accessTokenHash,
      newRefreshTokenHash: refreshTokenHash,
      accessTokenExpiresAt: now + MCP_ACCESS_TOKEN_TTL_MS,
      refreshTokenExpiresAt: now + MCP_REFRESH_TOKEN_TTL_MS,
      now,
    },
  );

  if (!refreshResult.ok) {
    return oauthErrorResponse({
      status: refreshResult.status,
      error: refreshResult.error,
      errorDescription: refreshResult.errorDescription,
    });
  }

  return jsonResponse({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: Math.floor(MCP_ACCESS_TOKEN_TTL_MS / 1000),
    refresh_token: refreshToken,
    scope: refreshResult.scope,
    resource: refreshResult.resource,
  });
});

export const handleMcpRequest = httpAction(async (ctx, request) => {
  if (!hasJsonContentType(request)) {
    return oauthErrorResponse({
      status: 415,
      error: "invalid_request",
      errorDescription: "content-type must be application/json",
    });
  }

  const bearerValidation = readBearerTokenFromAuthorizationHeader(
    request.headers.get("authorization"),
  );
  if (!bearerValidation.ok) {
    const response = oauthErrorResponse({
      status: bearerValidation.status,
      error: "invalid_token",
      errorDescription: bearerValidation.error,
    });
    response.headers.set(
      "WWW-Authenticate",
      'Bearer error="invalid_token", error_description="Invalid or missing bearer token."',
    );
    return response;
  }

  const now = Date.now();
  const accessTokenHash = await sha256Hex(bearerValidation.value);
  const tokenValidation = await ctx.runMutation(
    internal.mcp.oauth.validateAccessToken,
    {
      tokenHash: accessTokenHash,
      now,
    },
  );
  if (!tokenValidation.ok) {
    const response = oauthErrorResponse({
      status: tokenValidation.status,
      error: tokenValidation.error,
      errorDescription: tokenValidation.errorDescription,
    });
    response.headers.set(
      "WWW-Authenticate",
      'Bearer error="invalid_token", error_description="Access token rejected."',
    );
    return response;
  }

  const expectedResource = `${parseOrigin(request)}/mcp`;
  if (tokenValidation.resource !== expectedResource) {
    return oauthErrorResponse({
      status: 403,
      error: "invalid_target",
      errorDescription: "Token resource does not match this MCP endpoint.",
    });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonRpcErrorResponse({
      id: null,
      code: -32700,
      message: "Parse error",
    });
  }

  const jsonRpcValidation = validateJsonRpcRequestPayload(payload);
  if (!jsonRpcValidation.ok) {
    return jsonRpcErrorResponse({
      id: null,
      code: -32600,
      message: jsonRpcValidation.error,
    });
  }

  const rpcRequest = jsonRpcValidation.value;

  if (rpcRequest.method === "notifications/initialized") {
    return new Response(null, { status: 202 });
  }

  if (rpcRequest.method === "initialize") {
    return jsonRpcSuccessResponse({
      id: rpcRequest.id,
      result: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: "noter",
          version: "0.1.0",
        },
      },
    });
  }

  if (rpcRequest.method === "tools/list") {
    if (!hasScope(tokenValidation.scope, "vaults.read")) {
      return jsonRpcErrorResponse({
        id: rpcRequest.id,
        code: -32001,
        message: "Insufficient scope for tools/list.",
        status: 403,
      });
    }
    return jsonRpcSuccessResponse({
      id: rpcRequest.id,
      result: buildMcpToolList(),
    });
  }

  if (rpcRequest.method === "tools/call") {
    const params = asRecord(rpcRequest.params);
    const toolNameValue = params.name;
    const toolName =
      typeof toolNameValue === "string" ? toolNameValue.trim() : "";

    if (toolName === "vaults.list") {
      if (!hasScope(tokenValidation.scope, "vaults.read")) {
        return jsonRpcErrorResponse({
          id: rpcRequest.id,
          code: -32001,
          message: "Insufficient scope for vaults.list.",
          status: 403,
        });
      }

      const vaults = await ctx.runQuery(internal.mcp.tools.listVaultsForUser, {
        userId: tokenValidation.userId,
      });
      const structuredContent = {
        vaults: vaults.map((vault) => ({
          id: vault.vaultId,
          repositoryFullName: vault.repositoryFullName,
          state: vault.state,
          isNoterManaged: vault.isNoterManaged,
          commitSha: vault.commitSha,
          hostingProvider: vault.hostingProvider,
        })),
      };

      return jsonRpcSuccessResponse({
        id: rpcRequest.id,
        result: {
          content: [
            {
              type: "text",
              text: JSON.stringify(structuredContent, null, 2),
            },
          ],
          structuredContent,
        },
      });
    }

    return jsonRpcSuccessResponse({
      id: rpcRequest.id,
      result: {
        content: [
          {
            type: "text",
            text: `Unknown tool: ${toolName || "missing name"}`,
          },
        ],
        isError: true,
      },
    });
  }

  return jsonRpcErrorResponse({
    id: rpcRequest.id,
    code: -32601,
    message: `Method not found: ${rpcRequest.method}`,
  });
});
