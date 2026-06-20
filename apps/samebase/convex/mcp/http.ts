import { getAuthUserId } from "@convex-dev/auth/server";
import { asRecord } from "../jsonUtils";
import { internal } from "../_generated/api";
import { httpAction } from "../_generated/server";
import { randomToken } from "../oauthUtils";
import {
  buildMcpToolInputSchema,
  findToolInCatalog,
  listCatalogToolsForSurface,
} from "../toolRuntime/catalog";
import type { ToolJsonSchema } from "../toolRuntime/types";
import { normalizeOptionalString } from "../toolRuntime/utils";
import { MCP_CONSENT_APP_PATH } from "../../shared/mcpOAuth";
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
  getDefaultMcpProtocolValidationOptions,
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

function resolveAppUrl(request: Request): URL | null {
  const requestOrigin = parseOrigin(request);
  const configuredSiteUrl = process.env.SITE_URL;
  if (!configuredSiteUrl) {
    console.error("SITE_URL is not set; cannot redirect MCP OAuth consent to the React app.", {
      requestOrigin,
    });
    return null;
  }

  // Reject relative/malformed values so consent redirects always target the app origin.
  // MCP consent intentionally requires SITE_URL and does not fall back to CONVEX_SITE_URL.
  try {
    const appUrl = new URL(configuredSiteUrl);
    if (appUrl.protocol !== "https:" && appUrl.protocol !== "http:") {
      throw new Error(`Unsupported protocol: ${appUrl.protocol}`);
    }
    return appUrl;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown SITE_URL validation error";
    console.error("SITE_URL must be an absolute http(s) URL for MCP OAuth consent.", {
      configuredSiteUrl,
      requestOrigin,
      errorMessage,
    });
    return null;
  }
}

function buildMcpConsentRedirectUrl(args: {
  request: Request;
  requestId: string;
  loginRequired: boolean;
}): { ok: true; value: string } | { ok: false; errorDescription: string } {
  // Consent/login UX must happen in the React app origin. Convex HTTP routes do
  // not serve "/" on convex.site, so redirecting there yields "No matching routes found".
  const consentUrl = resolveAppUrl(args.request);
  if (consentUrl === null) {
    return {
      ok: false,
      errorDescription: "SITE_URL must be an absolute http(s) URL for MCP OAuth consent.",
    };
  }
  consentUrl.pathname = MCP_CONSENT_APP_PATH;
  consentUrl.search = "";
  consentUrl.hash = "";
  consentUrl.searchParams.set("mcp_consent_request", args.requestId);
  if (args.loginRequired) {
    consentUrl.searchParams.set("mcp_login_required", "1");
  }
  return {
    ok: true,
    value: consentUrl.toString(),
  };
}

function getProtocolValidationOptions(): McpProtocolValidationOptions {
  return getDefaultMcpProtocolValidationOptions();
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
  return contentType.toLowerCase().startsWith("application/x-www-form-urlencoded");
}

function jsonRpcSuccessResponse(args: { id?: string | number | null; result: unknown }): Response {
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

function parseScopeTokens(grantedScope: string): string[] {
  return grantedScope
    .split(" ")
    .map((scope) => scope.trim())
    .filter((scope) => scope.length > 0);
}

function buildMcpToolList(grantedScope: string): {
  tools: {
    name: string;
    description: string;
    inputSchema: ToolJsonSchema;
  }[];
} {
  const tools = listCatalogToolsForSurface({
    surface: "mcp",
    grantedScopes: parseScopeTokens(grantedScope),
  });
  return {
    tools: tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: buildMcpToolInputSchema(tool),
    })),
  };
}

function parseToolArguments(value: unknown): Record<string, unknown> {
  const record = asRecord(value);
  return record;
}

function parseStructuredContent(value: string | undefined): unknown {
  if (typeof value !== "string") {
    return undefined;
  }
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

export const getMcpOauthProtectedResourceMetadata = httpAction(async (_ctx, request) => {
  const origin = parseOrigin(request);
  return jsonResponse(buildMcpProtectedResourceMetadata(origin), 200);
});

export const getMcpOauthAuthorizationServerMetadata = httpAction(async (_ctx, request) => {
  const origin = parseOrigin(request);
  return jsonResponse(buildMcpAuthorizationServerMetadata(origin), 200);
});

export const getMcpOauthAuthorizationServerMetadataForMcpPath = httpAction(
  async (_ctx, request) => {
    const origin = parseOrigin(request);
    const metadata = buildMcpAuthorizationServerMetadata(origin);
    return jsonResponse(
      {
        ...metadata,
        issuer: `${origin}/mcp`,
      },
      200,
    );
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
    getProtocolValidationOptions(),
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
  const protocolValidationOptions = getProtocolValidationOptions();
  const url = new URL(request.url);
  const validation = validateAuthorizeRequestFromUrl(url, protocolValidationOptions);
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
    (typeof client.provisionalExpiresAt === "number" && client.provisionalExpiresAt <= now)
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
    const consentRedirect = buildMcpConsentRedirectUrl({
      request,
      requestId,
      loginRequired: true,
    });
    if (!consentRedirect.ok) {
      return oauthErrorResponse({
        status: 500,
        error: "server_error",
        errorDescription: consentRedirect.errorDescription,
      });
    }
    return Response.redirect(consentRedirect.value, 302);
  }

  const hasExistingGrant = await ctx.runQuery(internal.mcp.oauth.hasActiveGrantForAuthRequest, {
    requestId,
    userId,
  });
  if (!hasExistingGrant) {
    const consentRedirect = buildMcpConsentRedirectUrl({
      request,
      requestId,
      loginRequired: false,
    });
    if (!consentRedirect.ok) {
      return oauthErrorResponse({
        status: 500,
        error: "server_error",
        errorDescription: consentRedirect.errorDescription,
      });
    }
    return Response.redirect(consentRedirect.value, 302);
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
      allowLoopbackHttpRedirectUris:
        protocolValidationOptions.allowLoopbackHttpRedirectUris === true,
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
  if (issueResult.state !== undefined) {
    redirectUrl.searchParams.set("state", issueResult.state);
  }

  return Response.redirect(redirectUrl.toString(), 302);
});

export const exchangeMcpOauthToken = httpAction(async (ctx, request) => {
  if (!hasFormUrlEncodedContentType(request)) {
    return oauthErrorResponse({
      status: 415,
      error: "invalid_request",
      errorDescription: "content-type must be application/x-www-form-urlencoded",
    });
  }

  const rawBody = await request.text();
  const params = new URLSearchParams(rawBody);
  const now = Date.now();
  const protocolValidationOptions = getProtocolValidationOptions();
  const validation = validateTokenRequestFromSearchParams(params, protocolValidationOptions);
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
    (typeof client.provisionalExpiresAt === "number" && client.provisionalExpiresAt <= now)
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
    const exchangeResult = await ctx.runMutation(internal.mcp.oauth.exchangeAuthorizationCode, {
      codeHash,
      clientId: validation.value.clientId,
      redirectUri: validation.value.redirectUri,
      codeVerifier: validation.value.codeVerifier,
      allowLoopbackHttpRedirectUris:
        protocolValidationOptions.allowLoopbackHttpRedirectUris === true,
      accessTokenHash,
      refreshTokenHash,
      accessTokenExpiresAt: now + MCP_ACCESS_TOKEN_TTL_MS,
      refreshTokenExpiresAt: now + MCP_REFRESH_TOKEN_TTL_MS,
      now,
    });

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
      scope: exchangeResult.scope,
      resource: exchangeResult.resource,
      ...(exchangeResult.refreshTokenIssued ? { refresh_token: refreshToken } : {}),
    });
  }

  const oldRefreshTokenHash = await sha256Hex(validation.value.refreshToken);
  const refreshResult = await ctx.runMutation(internal.mcp.oauth.exchangeRefreshToken, {
    refreshTokenHash: oldRefreshTokenHash,
    clientId: validation.value.clientId,
    accessTokenHash,
    newRefreshTokenHash: refreshTokenHash,
    accessTokenExpiresAt: now + MCP_ACCESS_TOKEN_TTL_MS,
    refreshTokenExpiresAt: now + MCP_REFRESH_TOKEN_TTL_MS,
    now,
  });

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
    scope: refreshResult.scope,
    resource: refreshResult.resource,
    ...(refreshResult.refreshTokenIssued ? { refresh_token: refreshToken } : {}),
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
  const tokenValidation = await ctx.runMutation(internal.mcp.oauth.validateAccessToken, {
    tokenHash: accessTokenHash,
    now,
  });
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
  const isNotification = rpcRequest.id === undefined;

  if (rpcRequest.method === "notifications/initialized") {
    return new Response(null, { status: 202 });
  }

  if (rpcRequest.method === "initialize") {
    if (isNotification) {
      return new Response(null, { status: 202 });
    }
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
    if (isNotification) {
      return new Response(null, { status: 202 });
    }
    return jsonRpcSuccessResponse({
      id: rpcRequest.id,
      result: buildMcpToolList(tokenValidation.scope),
    });
  }

  if (rpcRequest.method === "tools/call") {
    if (isNotification) {
      return new Response(null, { status: 202 });
    }

    const grantedScopes = parseScopeTokens(tokenValidation.scope);
    const params = asRecord(rpcRequest.params);
    const toolName = normalizeOptionalString(params.name) ?? "";
    if (toolName.length === 0) {
      return jsonRpcSuccessResponse({
        id: rpcRequest.id,
        result: {
          content: [
            {
              type: "text",
              text: "Missing tool name.",
            },
          ],
          isError: true,
        },
      });
    }

    const tool = findToolInCatalog({ name: toolName });
    if (!tool) {
      return jsonRpcSuccessResponse({
        id: rpcRequest.id,
        result: {
          content: [
            {
              type: "text",
              text: `Unknown tool: ${toolName}`,
            },
          ],
          isError: true,
        },
      });
    }

    const args = parseToolArguments(params.arguments);
    const toolInput: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(args)) {
      if (key !== "vaultId" && key !== "branch" && key !== "threadId") {
        toolInput[key] = value;
      }
    }

    const result = await ctx.runAction(internal.toolRuntime.runtime.runTool, {
      toolName: tool.name,
      inputJson: JSON.stringify(toolInput),
      surface: "mcp",
      userId: tokenValidation.userId,
      grantedScopes,
      ...(tool.requiresVaultContext ? { vaultId: normalizeOptionalString(args.vaultId) } : {}),
      ...(tool.requiresBranchContext ? { branch: normalizeOptionalString(args.branch) } : {}),
      ...(tool.requiresThreadContext ? { threadId: normalizeOptionalString(args.threadId) } : {}),
      ...(rpcRequest.id !== undefined && rpcRequest.id !== null
        ? { requestId: String(rpcRequest.id) }
        : {}),
    });

    const structuredContent = parseStructuredContent(result.structuredContentJson);

    return jsonRpcSuccessResponse({
      id: rpcRequest.id,
      result: {
        content: [
          {
            type: "text",
            text: result.text,
          },
        ],
        ...(structuredContent !== undefined ? { structuredContent } : {}),
        ...(result.status !== "ok" ? { isError: true } : {}),
      },
    });
  }

  if (isNotification) {
    return new Response(null, { status: 202 });
  }
  return jsonRpcErrorResponse({
    id: rpcRequest.id,
    code: -32601,
    message: `Method not found: ${rpcRequest.method}`,
  });
});
