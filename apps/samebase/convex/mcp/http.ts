import { getAuthUserId } from "@convex-dev/auth/server";
import { object, optional, string, unknown as unknownValue } from "@samebase/sure";
import { asRecord, type JsonRecord } from "../jsonUtils";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { httpAction, type ActionCtx } from "../_generated/server";
import { randomToken } from "../oauthUtils";
import { convexArgsToToolInputSchema } from "../toolRuntime/convexSchemas";
import {
  logMcpHttpUsageContext,
  type SamebaseUsageMcpMethod,
  type SamebaseUsageMcpToolName,
} from "../usageAttribution";
import {
  getAuthenticationStatusContract,
  type McpAuthenticationStatus,
} from "./contracts/getAuthenticationStatus";
import { createRepositoryContract } from "../vault/contracts/createRepository";
import { getUserVaultsContract } from "../vault/contracts/getUserVaults";
import { connectRepositoryContract } from "../vault/contracts/connectRepository";
import { convexListProjectsContract } from "../vault/contracts/convexListProjects";
import { cloudflareListAccountsContract } from "../vault/contracts/cloudflareListAccounts";
import { cloudflareListWorkersContract } from "../vault/contracts/cloudflareListWorkers";
import { convexConnectExistingProjectContract } from "../vault/contracts/convexConnectExistingProject";
import { cloudflareConnectExistingWorkerContract } from "../vault/contracts/cloudflareConnectExistingWorker";
import { cloudflareWireBuildsContract } from "../vault/contracts/cloudflareWireBuilds";
import { cloudflareWireConvexBuildAccessContract } from "../vault/contracts/cloudflareWireConvexBuildAccess";
import { cloudflareVerifyInfrastructureContract } from "../vault/contracts/cloudflareVerifyInfrastructure";
import { retryInfrastructureProvisioningContract } from "../vault/contracts/retryInfrastructureProvisioning";
import {
  MCP_CONSENT_APP_PATH,
  type McpAuthorizationSuccessSearchParams,
} from "../../shared/mcpOAuth";
import { canAccess, type AccessKey } from "../../shared/accessModel";
import { buildUrlWithSearchParams } from "../../shared/urlSearchParams";
import { mcpScopeAllowsAccess } from "../toolRuntime/mcpScopes";
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
  MCP_V1_SUPPORTED_SCOPES,
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
const mcpToolCallParams = object({
  name: string,
  arguments: optional(unknownValue),
});

async function readMcpViewer(ctx: ActionCtx, userId: Id<"users">) {
  return await ctx.runQuery(internal.functions.resolveViewerForUserId, { userId });
}

type McpResolvedViewer = Awaited<ReturnType<typeof readMcpViewer>>;

export type McpToolInvocation = {
  input: JsonRecord;
  userId: Id<"users">;
  grantedScopes: string[];
  viewer: McpResolvedViewer;
};

export function buildMcpToolInvocationArgs(invocation: McpToolInvocation) {
  const input = { ...invocation.input };
  delete input.userId;
  delete input.grantedScopes;
  return {
    ...input,
    userId: invocation.userId,
    grantedScopes: invocation.grantedScopes,
  };
}

function callGetAuthenticationStatusMcpTool(_ctx: ActionCtx, invocation: McpToolInvocation) {
  const authentication: McpAuthenticationStatus =
    invocation.viewer.user === null
      ? {
          authenticated: false,
          user: null,
          role: invocation.viewer.role,
          accessKeys: invocation.viewer.accessKeys,
          grantedScopes: invocation.grantedScopes,
        }
      : {
          authenticated: true,
          user: {
            userId: invocation.viewer.user._id,
            name: invocation.viewer.user.name,
            email: invocation.viewer.user.email,
          },
          role: invocation.viewer.role,
          accessKeys: invocation.viewer.accessKeys,
          grantedScopes: invocation.grantedScopes,
        };

  if (authentication.user === null) {
    return {
      status: "ok",
      text: "MCP token is valid, but its Samebase account is no longer active.",
      structuredContent: { authentication },
    };
  }

  const accountLabel =
    authentication.user.email ?? authentication.user.name ?? authentication.user.userId;
  return {
    status: "ok",
    text: `Authenticated as ${accountLabel}.`,
    structuredContent: { authentication },
  };
}

async function callCreateRepositoryMcpTool(ctx: ActionCtx, invocation: McpToolInvocation) {
  return await ctx.runAction(
    internal.toolRuntime.runtime.createRepositoryTool,
    // @ts-expect-error Raw MCP arguments intentionally flow to Convex action validation.
    buildMcpToolInvocationArgs(invocation),
  );
}

async function callGetUserVaultsMcpTool(ctx: ActionCtx, invocation: McpToolInvocation) {
  return await ctx.runAction(
    internal.toolRuntime.runtime.getUserVaultsTool,
    buildMcpToolInvocationArgs(invocation),
  );
}

async function callConnectRepositoryMcpTool(ctx: ActionCtx, invocation: McpToolInvocation) {
  return await ctx.runAction(
    internal.toolRuntime.runtime.connectRepositoryTool,
    // @ts-expect-error Raw MCP arguments intentionally flow to Convex action validation.
    buildMcpToolInvocationArgs(invocation),
  );
}

async function callConvexListProjectsMcpTool(ctx: ActionCtx, invocation: McpToolInvocation) {
  return await ctx.runAction(
    internal.toolRuntime.runtime.convexListProjectsTool,
    buildMcpToolInvocationArgs(invocation),
  );
}

async function callCloudflareListAccountsMcpTool(ctx: ActionCtx, invocation: McpToolInvocation) {
  return await ctx.runAction(
    internal.toolRuntime.runtime.cloudflareListAccountsTool,
    buildMcpToolInvocationArgs(invocation),
  );
}

async function callCloudflareListWorkersMcpTool(ctx: ActionCtx, invocation: McpToolInvocation) {
  return await ctx.runAction(
    internal.toolRuntime.runtime.cloudflareListWorkersTool,
    // @ts-expect-error Raw MCP arguments intentionally flow to Convex action validation.
    buildMcpToolInvocationArgs(invocation),
  );
}

async function callConvexConnectExistingProjectMcpTool(
  ctx: ActionCtx,
  invocation: McpToolInvocation,
) {
  return await ctx.runAction(
    internal.toolRuntime.runtime.convexConnectExistingProjectTool,
    // @ts-expect-error Raw MCP arguments intentionally flow to Convex action validation.
    buildMcpToolInvocationArgs(invocation),
  );
}

async function callCloudflareConnectExistingWorkerMcpTool(
  ctx: ActionCtx,
  invocation: McpToolInvocation,
) {
  return await ctx.runAction(
    internal.toolRuntime.runtime.cloudflareConnectExistingWorkerTool,
    // @ts-expect-error Raw MCP arguments intentionally flow to Convex action validation.
    buildMcpToolInvocationArgs(invocation),
  );
}

async function callCloudflareWireBuildsMcpTool(ctx: ActionCtx, invocation: McpToolInvocation) {
  return await ctx.runAction(
    internal.toolRuntime.runtime.cloudflareWireBuildsTool,
    // @ts-expect-error Raw MCP arguments intentionally flow to Convex action validation.
    buildMcpToolInvocationArgs(invocation),
  );
}

async function callCloudflareWireConvexBuildAccessMcpTool(
  ctx: ActionCtx,
  invocation: McpToolInvocation,
) {
  return await ctx.runAction(
    internal.toolRuntime.runtime.cloudflareWireConvexBuildAccessTool,
    // @ts-expect-error Raw MCP arguments intentionally flow to Convex action validation.
    buildMcpToolInvocationArgs(invocation),
  );
}

async function callCloudflareVerifyInfrastructureMcpTool(
  ctx: ActionCtx,
  invocation: McpToolInvocation,
) {
  return await ctx.runAction(
    internal.toolRuntime.runtime.cloudflareVerifyInfrastructureTool,
    // @ts-expect-error Raw MCP arguments intentionally flow to Convex action validation.
    buildMcpToolInvocationArgs(invocation),
  );
}

async function callRetryInfrastructureProvisioningMcpTool(
  ctx: ActionCtx,
  invocation: McpToolInvocation,
) {
  return await ctx.runAction(
    internal.toolRuntime.runtime.retryInfrastructureProvisioningTool,
    // @ts-expect-error Raw MCP arguments intentionally flow to Convex action validation.
    buildMcpToolInvocationArgs(invocation),
  );
}

const mcpToolCatalog = [
  {
    access: getAuthenticationStatusContract.access,
    name: getAuthenticationStatusContract.mcp.name,
    description: getAuthenticationStatusContract.mcp.description,
    annotations: getAuthenticationStatusContract.mcp.annotations,
    inputSchema: convexArgsToToolInputSchema(
      getAuthenticationStatusContract.args,
      getAuthenticationStatusContract.mcp.inputDescriptions,
    ),
    call: callGetAuthenticationStatusMcpTool,
  },
  {
    access: getUserVaultsContract.access,
    name: getUserVaultsContract.mcp.name,
    description: getUserVaultsContract.mcp.description,
    annotations: getUserVaultsContract.mcp.annotations,
    inputSchema: convexArgsToToolInputSchema(
      getUserVaultsContract.args,
      getUserVaultsContract.mcp.inputDescriptions,
    ),
    call: callGetUserVaultsMcpTool,
  },
  {
    access: createRepositoryContract.access,
    name: createRepositoryContract.mcp.name,
    description: createRepositoryContract.mcp.description,
    annotations: createRepositoryContract.mcp.annotations,
    inputSchema: convexArgsToToolInputSchema(
      createRepositoryContract.args,
      createRepositoryContract.mcp.inputDescriptions,
    ),
    call: callCreateRepositoryMcpTool,
  },
  {
    access: connectRepositoryContract.access,
    name: connectRepositoryContract.mcp.name,
    description: connectRepositoryContract.mcp.description,
    annotations: connectRepositoryContract.mcp.annotations,
    inputSchema: convexArgsToToolInputSchema(
      connectRepositoryContract.args,
      connectRepositoryContract.mcp.inputDescriptions,
    ),
    call: callConnectRepositoryMcpTool,
  },
  {
    access: convexListProjectsContract.access,
    name: convexListProjectsContract.mcp.name,
    description: convexListProjectsContract.mcp.description,
    annotations: convexListProjectsContract.mcp.annotations,
    inputSchema: convexArgsToToolInputSchema(
      convexListProjectsContract.args,
      convexListProjectsContract.mcp.inputDescriptions,
    ),
    call: callConvexListProjectsMcpTool,
  },
  {
    access: cloudflareListAccountsContract.access,
    name: cloudflareListAccountsContract.mcp.name,
    description: cloudflareListAccountsContract.mcp.description,
    annotations: cloudflareListAccountsContract.mcp.annotations,
    inputSchema: convexArgsToToolInputSchema(
      cloudflareListAccountsContract.args,
      cloudflareListAccountsContract.mcp.inputDescriptions,
    ),
    call: callCloudflareListAccountsMcpTool,
  },
  {
    access: cloudflareListWorkersContract.access,
    name: cloudflareListWorkersContract.mcp.name,
    description: cloudflareListWorkersContract.mcp.description,
    annotations: cloudflareListWorkersContract.mcp.annotations,
    inputSchema: convexArgsToToolInputSchema(
      cloudflareListWorkersContract.args,
      cloudflareListWorkersContract.mcp.inputDescriptions,
    ),
    call: callCloudflareListWorkersMcpTool,
  },
  {
    access: convexConnectExistingProjectContract.access,
    name: convexConnectExistingProjectContract.mcp.name,
    description: convexConnectExistingProjectContract.mcp.description,
    annotations: convexConnectExistingProjectContract.mcp.annotations,
    inputSchema: convexArgsToToolInputSchema(
      convexConnectExistingProjectContract.args,
      convexConnectExistingProjectContract.mcp.inputDescriptions,
    ),
    call: callConvexConnectExistingProjectMcpTool,
  },
  {
    access: cloudflareConnectExistingWorkerContract.access,
    name: cloudflareConnectExistingWorkerContract.mcp.name,
    description: cloudflareConnectExistingWorkerContract.mcp.description,
    annotations: cloudflareConnectExistingWorkerContract.mcp.annotations,
    inputSchema: convexArgsToToolInputSchema(
      cloudflareConnectExistingWorkerContract.args,
      cloudflareConnectExistingWorkerContract.mcp.inputDescriptions,
    ),
    call: callCloudflareConnectExistingWorkerMcpTool,
  },
  {
    access: cloudflareWireBuildsContract.access,
    name: cloudflareWireBuildsContract.mcp.name,
    description: cloudflareWireBuildsContract.mcp.description,
    annotations: cloudflareWireBuildsContract.mcp.annotations,
    inputSchema: convexArgsToToolInputSchema(
      cloudflareWireBuildsContract.args,
      cloudflareWireBuildsContract.mcp.inputDescriptions,
    ),
    call: callCloudflareWireBuildsMcpTool,
  },
  {
    access: cloudflareWireConvexBuildAccessContract.access,
    name: cloudflareWireConvexBuildAccessContract.mcp.name,
    description: cloudflareWireConvexBuildAccessContract.mcp.description,
    annotations: cloudflareWireConvexBuildAccessContract.mcp.annotations,
    inputSchema: convexArgsToToolInputSchema(
      cloudflareWireConvexBuildAccessContract.args,
      cloudflareWireConvexBuildAccessContract.mcp.inputDescriptions,
    ),
    call: callCloudflareWireConvexBuildAccessMcpTool,
  },
  {
    access: cloudflareVerifyInfrastructureContract.access,
    name: cloudflareVerifyInfrastructureContract.mcp.name,
    description: cloudflareVerifyInfrastructureContract.mcp.description,
    annotations: cloudflareVerifyInfrastructureContract.mcp.annotations,
    inputSchema: convexArgsToToolInputSchema(
      cloudflareVerifyInfrastructureContract.args,
      cloudflareVerifyInfrastructureContract.mcp.inputDescriptions,
    ),
    call: callCloudflareVerifyInfrastructureMcpTool,
  },
  {
    access: retryInfrastructureProvisioningContract.access,
    name: retryInfrastructureProvisioningContract.mcp.name,
    description: retryInfrastructureProvisioningContract.mcp.description,
    annotations: retryInfrastructureProvisioningContract.mcp.annotations,
    inputSchema: convexArgsToToolInputSchema(
      retryInfrastructureProvisioningContract.args,
      retryInfrastructureProvisioningContract.mcp.inputDescriptions,
    ),
    call: callRetryInfrastructureProvisioningMcpTool,
  },
] as const;

export function listMcpToolsForAccess(args: {
  grantedScopes: string[];
  currentAccessKeys: readonly AccessKey[];
}) {
  return mcpToolCatalog
    .filter(
      (tool) =>
        mcpScopeAllowsAccess(tool.access, args.grantedScopes) &&
        canAccess(tool.access, args.currentAccessKeys),
    )
    .map((tool) => ({
      name: tool.name,
      description: tool.description,
      annotations: tool.annotations,
      inputSchema: tool.inputSchema,
    }));
}

type McpConsentRedirectSearchParams = {
  mcp_consent_request: string;
  mcp_login_required: "1" | undefined;
};

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

function buildMcpProtectedResourceMetadataUrl(request: Request): string {
  return `${parseOrigin(request)}/.well-known/oauth-protected-resource/mcp`;
}

function quoteWwwAuthenticateValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function buildMcpBearerChallenge(args: {
  request: Request;
  error: "invalid_token";
  errorDescription: string;
}): string {
  return [
    ["resource_metadata", buildMcpProtectedResourceMetadataUrl(args.request)],
    ["scope", MCP_V1_SUPPORTED_SCOPES.join(" ")],
    ["error", args.error],
    ["error_description", args.errorDescription],
  ]
    .map(([key, value]) => `${key}="${quoteWwwAuthenticateValue(value)}"`)
    .join(", ");
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
  return {
    ok: true,
    value: buildUrlWithSearchParams(consentUrl, {
      mcp_consent_request: args.requestId,
      mcp_login_required: args.loginRequired ? "1" : undefined,
    } satisfies McpConsentRedirectSearchParams),
  };
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

export function readMcpMethodForUsage(method: string): SamebaseUsageMcpMethod {
  if (
    method === "initialize" ||
    method === "notifications/initialized" ||
    method === "tools/list" ||
    method === "tools/call"
  ) {
    return method;
  }

  return "other";
}

export function readMcpToolNameForUsage(params: unknown): SamebaseUsageMcpToolName {
  const [hasParams, toolCallParams] = mcpToolCallParams(params);
  if (!hasParams) {
    return "unknown";
  }

  const toolName = toolCallParams.name.trim();
  if (toolName === getAuthenticationStatusContract.mcp.name) {
    return "samebase_auth_getAuthenticationStatus";
  }
  if (toolName === createRepositoryContract.mcp.name) {
    return "vault_actions_createRepository";
  }
  if (toolName === getUserVaultsContract.mcp.name) {
    return "vault_dashboard_getUserVaults";
  }
  if (toolName === connectRepositoryContract.mcp.name) {
    return "vault_actions_connectRepository";
  }
  if (toolName === convexListProjectsContract.mcp.name) {
    return "vault_convex_listProjects";
  }
  if (toolName === cloudflareListAccountsContract.mcp.name) {
    return "vault_cloudflare_listAccounts";
  }
  if (toolName === cloudflareListWorkersContract.mcp.name) {
    return "vault_cloudflare_listWorkers";
  }
  if (toolName === convexConnectExistingProjectContract.mcp.name) {
    return "vault_convex_connectExistingProject";
  }
  if (toolName === cloudflareConnectExistingWorkerContract.mcp.name) {
    return "vault_cloudflare_connectExistingWorker";
  }
  if (toolName === cloudflareWireBuildsContract.mcp.name) {
    return "vault_cloudflare_wireBuilds";
  }
  if (toolName === cloudflareWireConvexBuildAccessContract.mcp.name) {
    return "vault_cloudflare_wireConvexBuildAccess";
  }
  if (toolName === cloudflareVerifyInfrastructureContract.mcp.name) {
    return "vault_cloudflare_verifyInfrastructure";
  }
  if (toolName === retryInfrastructureProvisioningContract.mcp.name) {
    return "vault_actions_retryInfrastructureProvisioning";
  }
  return "unknown";
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
    getDefaultMcpProtocolValidationOptions(),
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
  const protocolValidationOptions = getDefaultMcpProtocolValidationOptions();
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

  return Response.redirect(
    buildUrlWithSearchParams(issueResult.redirectUri, {
      code: authorizationCode,
      state: issueResult.state,
    } satisfies McpAuthorizationSuccessSearchParams),
    302,
  );
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
  const protocolValidationOptions = getDefaultMcpProtocolValidationOptions();
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
      `Bearer ${buildMcpBearerChallenge({
        request,
        error: "invalid_token",
        errorDescription: "Invalid or missing bearer token.",
      })}`,
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
      `Bearer ${buildMcpBearerChallenge({
        request,
        error: "invalid_token",
        errorDescription: "Access token rejected.",
      })}`,
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
  const mcpMethod = readMcpMethodForUsage(rpcRequest.method);
  logMcpHttpUsageContext({
    samebaseUserId: tokenValidation.userId,
    mcpMethod,
    mcpToolName:
      mcpMethod === "tools/call" && !isNotification
        ? readMcpToolNameForUsage(rpcRequest.params)
        : null,
    mcpIsNotification: isNotification,
  });

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
          name: "samebase",
          version: "0.1.0",
        },
      },
    });
  }

  if (rpcRequest.method === "tools/list") {
    if (isNotification) {
      return new Response(null, { status: 202 });
    }
    const grantedScopes = parseScopeTokens(tokenValidation.scope);
    const currentViewer = await readMcpViewer(ctx, tokenValidation.userId);
    return jsonRpcSuccessResponse({
      id: rpcRequest.id,
      result: {
        tools: listMcpToolsForAccess({
          grantedScopes,
          currentAccessKeys: currentViewer.accessKeys,
        }),
      },
    });
  }

  if (rpcRequest.method === "tools/call") {
    if (isNotification) {
      return new Response(null, { status: 202 });
    }

    const grantedScopes = parseScopeTokens(tokenValidation.scope);
    const [hasParams, params] = mcpToolCallParams(rpcRequest.params);
    if (!hasParams) {
      return jsonRpcSuccessResponse({
        id: rpcRequest.id,
        result: {
          content: [
            {
              type: "text",
              text: "Invalid tool call params.",
            },
          ],
          isError: true,
        },
      });
    }

    const toolName = params.name.trim();
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

    const input = asRecord(params.arguments);
    const tool = mcpToolCatalog.find((entry) => entry.name === toolName);
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

    // Token scopes are granted at consent time; the user's role access can
    // shrink afterwards. tools/list already filters on current access, and
    // execution must enforce the same boundary or a stale token outlives a
    // revoked role.
    const currentViewer = await readMcpViewer(ctx, tokenValidation.userId);
    if (!canAccess(tool.access, currentViewer.accessKeys)) {
      return jsonRpcSuccessResponse({
        id: rpcRequest.id,
        result: {
          content: [
            {
              type: "text",
              text: `Insufficient access for ${toolName}.`,
            },
          ],
          isError: true,
        },
      });
    }

    try {
      const result = await tool.call(ctx, {
        input,
        userId: tokenValidation.userId,
        grantedScopes,
        viewer: currentViewer,
      });
      return jsonRpcSuccessResponse({
        id: rpcRequest.id,
        result: {
          content: [
            {
              type: "text",
              text: result.text,
            },
          ],
          ...(result.structuredContent !== undefined
            ? { structuredContent: result.structuredContent }
            : {}),
          ...(result.status !== "ok" ? { isError: true } : {}),
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Tool execution failed.";
      return jsonRpcSuccessResponse({
        id: rpcRequest.id,
        result: {
          content: [
            {
              type: "text",
              text: message,
            },
          ],
          isError: true,
        },
      });
    }
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
