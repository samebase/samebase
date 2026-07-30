import { getAuthUserId } from "@convex-dev/auth/server";
import { object, optional, string, unknown as unknownValue } from "@samebase/sure";
import { asRecord, type JsonRecord } from "../jsonUtils";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
  normalizeAccountEmail,
  resolveAccountPresentation,
} from "../../shared/accountPresentation";
import { httpAction, type ActionCtx } from "../_generated/server";
import { randomToken } from "../oauthUtils";
import {
  convexArgsToToolInputSchema,
  convexValidatorToToolOutputSchema,
} from "../toolRuntime/convexSchemas";
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
import { cloudflareListAccountsContract } from "../vault/contracts/cloudflareListAccounts";
import {
  cloudflareAttachWorkersContract,
  cloudflareDiscoverWorkersContract,
} from "../vault/contracts/cloudflareAttachments";
import {
  convexAttachProjectsContract,
  convexDiscoverProjectsContract,
} from "../vault/contracts/convexAttachments";
import { cloudflareConfigureWorkersBuildsForGitHubContract } from "../vault/contracts/cloudflareConfigureWorkersBuildsForGitHub";
import { cloudflareRotateConvexDeployKeysForWorkersBuildsContract } from "../vault/contracts/cloudflareRotateConvexDeployKeysForWorkersBuilds";
import { retryInfrastructureProvisioningContract } from "../vault/contracts/retryInfrastructureProvisioning";
import { createBrowserHandoffContract } from "../agentBrowserHandoff/contracts/createBrowserHandoff";
import {
  MCP_CONSENT_APP_PATH,
  type McpAuthorizationSuccessSearchParams,
} from "../../shared/mcpOAuth";
import { canAccess, type AccessKey } from "../../shared/accessModel";
import { buildUrlWithSearchParams } from "../../shared/urlSearchParams";
import { parseSiteOrigin } from "../../shared/siteOrigin";
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
import { parseScopeTokens } from "./scopes";

const MCP_PROVISIONAL_CLIENT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MCP_AUTH_REQUEST_TTL_MS = 10 * 60 * 1000;
const MCP_PROTOCOL_VERSION = "2025-03-26";
const MCP_SERVER_INSTRUCTIONS = `Samebase is only for repository-backed apps and explicit attachments to user-owned Convex and Cloudflare resources. Never use Samebase for unrelated Git work or standalone provider resources.

For managed app creation, use only this closed sequence: read ${getUserVaultsContract.mcp.name}, call ${createRepositoryContract.mcp.name} directly, then poll ${getUserVaultsContract.mcp.name}. Do not call ${cloudflareListAccountsContract.mcp.name} first. ${createRepositoryContract.mcp.name} does not accept an accountId and uses the connected Cloudflare provider.

For other writes, read ${getUserVaultsContract.mcp.name} whenever a repository may already be connected, and reuse the returned vault and attachment identifiers. After ${createRepositoryContract.mcp.name}, poll ${getUserVaultsContract.mcp.name} until source setup is ready or failed. Once source setup is ready, treat provider setup as an independent ready, failed, or not-applicable axis. A connected repository remains usable while provider setup continues or fails. A started provisioning run, requested build, or successful Git push is not proof of a successful deployment.

Inventory reports Samebase-owned workflow state and stable resource IDs. Read current provider existence, configuration, deployment state, and logs from provider-native tools unless an explicit Samebase action exposes that live read. Match the required IDs to an explicit action contract, call that action, then reread inventory.

Make code changes, run setup and validation, and commit or push in the returned GitHub repository. Use provider-native tools for logs, general environment values, migrations, custom domains, and terminal build state when Samebase does not expose that read. The current action and provider-boundary docs are indexed at https://samebase.com/llms.txt.`;
const mcpToolCallParams = object({
  name: string,
  arguments: optional(unknownValue),
});

async function readMcpViewer(ctx: ActionCtx, userId: Id<"users">) {
  return await ctx.runQuery(internal.functions.resolveViewerForUserId, { userId });
}

type McpResolvedViewer = Awaited<ReturnType<typeof readMcpViewer>>;

export type McpToolInvocation = {
  clientId: string;
  grantId: string;
  input: JsonRecord;
  userId: Id<"users">;
  grantedScopes: string[];
  viewer: McpResolvedViewer;
};

export function buildMcpToolInvocationArgs(invocation: McpToolInvocation) {
  const input = { ...invocation.input };
  delete input.userId;
  delete input.grantedScopes;
  delete input.grantId;
  delete input.clientId;
  return {
    ...input,
    userId: invocation.userId,
    grantedScopes: invocation.grantedScopes,
  };
}

function callGetAuthenticationStatusMcpTool(_ctx: ActionCtx, invocation: McpToolInvocation) {
  const viewerUser = invocation.viewer.user;
  if (viewerUser === null) {
    const authentication: McpAuthenticationStatus = {
      authenticated: false,
      user: null,
      role: invocation.viewer.role,
      accessKeys: invocation.viewer.accessKeys,
      grantedScopes: invocation.grantedScopes,
    };
    return {
      status: "ok",
      text: "MCP token is valid, but its Samebase account is no longer active.",
      structuredContent: { authentication },
    };
  }

  const normalizedEmail = normalizeAccountEmail(viewerUser.email);
  const authentication: McpAuthenticationStatus = {
    authenticated: true,
    user: {
      name: viewerUser.name,
      email: normalizedEmail,
    },
    role: invocation.viewer.role,
    accessKeys: invocation.viewer.accessKeys,
    grantedScopes: invocation.grantedScopes,
  };
  const accountLabel = resolveAccountPresentation({
    displayName: viewerUser.displayName,
    email: normalizedEmail,
  }).label;
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

async function callConvexDiscoverProjectsMcpTool(ctx: ActionCtx, invocation: McpToolInvocation) {
  return await ctx.runAction(
    internal.toolRuntime.runtime.convexDiscoverProjectsTool,
    // @ts-expect-error Raw MCP arguments intentionally flow to Convex action validation.
    buildMcpToolInvocationArgs(invocation),
  );
}

async function callCloudflareListAccountsMcpTool(ctx: ActionCtx, invocation: McpToolInvocation) {
  return await ctx.runAction(
    internal.toolRuntime.runtime.cloudflareListAccountsTool,
    buildMcpToolInvocationArgs(invocation),
  );
}

async function callCloudflareDiscoverWorkersMcpTool(ctx: ActionCtx, invocation: McpToolInvocation) {
  return await ctx.runAction(
    internal.toolRuntime.runtime.cloudflareDiscoverWorkersTool,
    // @ts-expect-error Raw MCP arguments intentionally flow to Convex action validation.
    buildMcpToolInvocationArgs(invocation),
  );
}

async function callConvexAttachProjectsMcpTool(ctx: ActionCtx, invocation: McpToolInvocation) {
  return await ctx.runAction(
    internal.toolRuntime.runtime.convexAttachProjectsTool,
    // @ts-expect-error Raw MCP arguments intentionally flow to Convex action validation.
    buildMcpToolInvocationArgs(invocation),
  );
}

async function callCloudflareAttachWorkersMcpTool(ctx: ActionCtx, invocation: McpToolInvocation) {
  return await ctx.runAction(
    internal.toolRuntime.runtime.cloudflareAttachWorkersTool,
    // @ts-expect-error Raw MCP arguments intentionally flow to Convex action validation.
    buildMcpToolInvocationArgs(invocation),
  );
}

async function callCloudflareConfigureWorkersBuildsForGitHubMcpTool(
  ctx: ActionCtx,
  invocation: McpToolInvocation,
) {
  return await ctx.runAction(
    internal.toolRuntime.runtime.cloudflareConfigureWorkersBuildsForGitHubTool,
    // @ts-expect-error Raw MCP arguments intentionally flow to Convex action validation.
    buildMcpToolInvocationArgs(invocation),
  );
}

async function callCloudflareRotateConvexDeployKeysForWorkersBuildsMcpTool(
  ctx: ActionCtx,
  invocation: McpToolInvocation,
) {
  return await ctx.runAction(
    internal.toolRuntime.runtime.cloudflareRotateConvexDeployKeysForWorkersBuildsTool,
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

async function callCreateBrowserHandoffMcpTool(ctx: ActionCtx, invocation: McpToolInvocation) {
  return await ctx.runAction(internal.toolRuntime.runtime.createBrowserHandoffTool, {
    ...buildMcpToolInvocationArgs(invocation),
    grantId: invocation.grantId,
    clientId: invocation.clientId,
  });
}

const mcpToolCatalog = [
  {
    access: getUserVaultsContract.access,
    title: getUserVaultsContract.mcp.title,
    name: getUserVaultsContract.mcp.name,
    description: getUserVaultsContract.mcp.description,
    annotations: getUserVaultsContract.mcp.annotations,
    inputSchema: convexArgsToToolInputSchema(
      getUserVaultsContract.args,
      getUserVaultsContract.mcp.inputDescriptions,
    ),
    outputSchema: convexValidatorToToolOutputSchema(getUserVaultsContract.structuredContent),
    call: callGetUserVaultsMcpTool,
  },
  {
    access: createRepositoryContract.access,
    title: createRepositoryContract.mcp.title,
    name: createRepositoryContract.mcp.name,
    description: createRepositoryContract.mcp.description,
    annotations: createRepositoryContract.mcp.annotations,
    inputSchema: convexArgsToToolInputSchema(
      createRepositoryContract.args,
      createRepositoryContract.mcp.inputDescriptions,
    ),
    outputSchema: convexValidatorToToolOutputSchema(createRepositoryContract.structuredContent),
    call: callCreateRepositoryMcpTool,
  },
  {
    access: connectRepositoryContract.access,
    title: connectRepositoryContract.mcp.title,
    name: connectRepositoryContract.mcp.name,
    description: connectRepositoryContract.mcp.description,
    annotations: connectRepositoryContract.mcp.annotations,
    inputSchema: convexArgsToToolInputSchema(
      connectRepositoryContract.args,
      connectRepositoryContract.mcp.inputDescriptions,
    ),
    outputSchema: convexValidatorToToolOutputSchema(connectRepositoryContract.structuredContent),
    call: callConnectRepositoryMcpTool,
  },
  {
    access: convexDiscoverProjectsContract.access,
    title: convexDiscoverProjectsContract.mcp.title,
    name: convexDiscoverProjectsContract.mcp.name,
    description: convexDiscoverProjectsContract.mcp.description,
    annotations: convexDiscoverProjectsContract.mcp.annotations,
    inputSchema: convexArgsToToolInputSchema(
      convexDiscoverProjectsContract.args,
      convexDiscoverProjectsContract.mcp.inputDescriptions,
    ),
    outputSchema: convexValidatorToToolOutputSchema(
      convexDiscoverProjectsContract.structuredContent,
    ),
    call: callConvexDiscoverProjectsMcpTool,
  },
  {
    access: cloudflareListAccountsContract.access,
    title: cloudflareListAccountsContract.mcp.title,
    name: cloudflareListAccountsContract.mcp.name,
    description: cloudflareListAccountsContract.mcp.description,
    annotations: cloudflareListAccountsContract.mcp.annotations,
    inputSchema: convexArgsToToolInputSchema(
      cloudflareListAccountsContract.args,
      cloudflareListAccountsContract.mcp.inputDescriptions,
    ),
    outputSchema: convexValidatorToToolOutputSchema(
      cloudflareListAccountsContract.structuredContent,
    ),
    call: callCloudflareListAccountsMcpTool,
  },
  {
    access: cloudflareDiscoverWorkersContract.access,
    title: cloudflareDiscoverWorkersContract.mcp.title,
    name: cloudflareDiscoverWorkersContract.mcp.name,
    description: cloudflareDiscoverWorkersContract.mcp.description,
    annotations: cloudflareDiscoverWorkersContract.mcp.annotations,
    inputSchema: convexArgsToToolInputSchema(
      cloudflareDiscoverWorkersContract.args,
      cloudflareDiscoverWorkersContract.mcp.inputDescriptions,
    ),
    outputSchema: convexValidatorToToolOutputSchema(
      cloudflareDiscoverWorkersContract.structuredContent,
    ),
    call: callCloudflareDiscoverWorkersMcpTool,
  },
  {
    access: convexAttachProjectsContract.access,
    title: convexAttachProjectsContract.mcp.title,
    name: convexAttachProjectsContract.mcp.name,
    description: convexAttachProjectsContract.mcp.description,
    annotations: convexAttachProjectsContract.mcp.annotations,
    inputSchema: convexArgsToToolInputSchema(
      convexAttachProjectsContract.args,
      convexAttachProjectsContract.mcp.inputDescriptions,
    ),
    outputSchema: convexValidatorToToolOutputSchema(convexAttachProjectsContract.structuredContent),
    call: callConvexAttachProjectsMcpTool,
  },
  {
    access: cloudflareAttachWorkersContract.access,
    title: cloudflareAttachWorkersContract.mcp.title,
    name: cloudflareAttachWorkersContract.mcp.name,
    description: cloudflareAttachWorkersContract.mcp.description,
    annotations: cloudflareAttachWorkersContract.mcp.annotations,
    inputSchema: convexArgsToToolInputSchema(
      cloudflareAttachWorkersContract.args,
      cloudflareAttachWorkersContract.mcp.inputDescriptions,
    ),
    outputSchema: convexValidatorToToolOutputSchema(
      cloudflareAttachWorkersContract.structuredContent,
    ),
    call: callCloudflareAttachWorkersMcpTool,
  },
  {
    access: cloudflareConfigureWorkersBuildsForGitHubContract.access,
    title: cloudflareConfigureWorkersBuildsForGitHubContract.mcp.title,
    name: cloudflareConfigureWorkersBuildsForGitHubContract.mcp.name,
    description: cloudflareConfigureWorkersBuildsForGitHubContract.mcp.description,
    annotations: cloudflareConfigureWorkersBuildsForGitHubContract.mcp.annotations,
    inputSchema: convexArgsToToolInputSchema(
      cloudflareConfigureWorkersBuildsForGitHubContract.args,
      cloudflareConfigureWorkersBuildsForGitHubContract.mcp.inputDescriptions,
    ),
    outputSchema: undefined,
    call: callCloudflareConfigureWorkersBuildsForGitHubMcpTool,
  },
  {
    access: cloudflareRotateConvexDeployKeysForWorkersBuildsContract.access,
    title: cloudflareRotateConvexDeployKeysForWorkersBuildsContract.mcp.title,
    name: cloudflareRotateConvexDeployKeysForWorkersBuildsContract.mcp.name,
    description: cloudflareRotateConvexDeployKeysForWorkersBuildsContract.mcp.description,
    annotations: cloudflareRotateConvexDeployKeysForWorkersBuildsContract.mcp.annotations,
    inputSchema: convexArgsToToolInputSchema(
      cloudflareRotateConvexDeployKeysForWorkersBuildsContract.args,
      cloudflareRotateConvexDeployKeysForWorkersBuildsContract.mcp.inputDescriptions,
    ),
    outputSchema: undefined,
    call: callCloudflareRotateConvexDeployKeysForWorkersBuildsMcpTool,
  },
  {
    access: retryInfrastructureProvisioningContract.access,
    title: retryInfrastructureProvisioningContract.mcp.title,
    name: retryInfrastructureProvisioningContract.mcp.name,
    description: retryInfrastructureProvisioningContract.mcp.description,
    annotations: retryInfrastructureProvisioningContract.mcp.annotations,
    inputSchema: convexArgsToToolInputSchema(
      retryInfrastructureProvisioningContract.args,
      retryInfrastructureProvisioningContract.mcp.inputDescriptions,
    ),
    outputSchema: undefined,
    call: callRetryInfrastructureProvisioningMcpTool,
  },
  {
    access: createBrowserHandoffContract.access,
    title: createBrowserHandoffContract.mcp.title,
    name: createBrowserHandoffContract.mcp.name,
    description: createBrowserHandoffContract.mcp.description,
    annotations: createBrowserHandoffContract.mcp.annotations,
    inputSchema: convexArgsToToolInputSchema(
      createBrowserHandoffContract.args,
      createBrowserHandoffContract.mcp.inputDescriptions,
    ),
    outputSchema: convexValidatorToToolOutputSchema(createBrowserHandoffContract.structuredContent),
    call: callCreateBrowserHandoffMcpTool,
  },
  {
    access: getAuthenticationStatusContract.access,
    title: getAuthenticationStatusContract.mcp.title,
    name: getAuthenticationStatusContract.mcp.name,
    description: getAuthenticationStatusContract.mcp.description,
    annotations: getAuthenticationStatusContract.mcp.annotations,
    inputSchema: convexArgsToToolInputSchema(
      getAuthenticationStatusContract.args,
      getAuthenticationStatusContract.mcp.inputDescriptions,
    ),
    outputSchema: convexValidatorToToolOutputSchema(
      getAuthenticationStatusContract.structuredContent,
    ),
    call: callGetAuthenticationStatusMcpTool,
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
      title: tool.title,
      name: tool.name,
      description: tool.description,
      annotations: tool.annotations,
      inputSchema: tool.inputSchema,
      ...(tool.outputSchema === undefined ? {} : { outputSchema: tool.outputSchema }),
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

  // MCP consent intentionally requires SITE_URL and does not fall back to CONVEX_SITE_URL.
  try {
    return parseSiteOrigin(configuredSiteUrl);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown SITE_URL validation error";
    console.error("SITE_URL must be a secure app origin for MCP OAuth consent.", {
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
      errorDescription: "SITE_URL must be a secure app origin for MCP OAuth consent.",
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
  if (toolName === cloudflareListAccountsContract.mcp.name) {
    return "vault_cloudflare_listAccounts";
  }
  if (toolName === convexDiscoverProjectsContract.mcp.name) {
    return "vault_convex_discoverProjects";
  }
  if (toolName === cloudflareDiscoverWorkersContract.mcp.name) {
    return "vault_cloudflare_discoverWorkers";
  }
  if (toolName === convexAttachProjectsContract.mcp.name) {
    return "vault_convex_attachProjects";
  }
  if (toolName === cloudflareAttachWorkersContract.mcp.name) {
    return "vault_cloudflare_attachWorkers";
  }
  if (toolName === cloudflareConfigureWorkersBuildsForGitHubContract.mcp.name) {
    return "vault_cloudflare_configureWorkersBuildsForGitHub";
  }
  if (toolName === cloudflareRotateConvexDeployKeysForWorkersBuildsContract.mcp.name) {
    return "vault_cloudflare_rotateConvexDeployKeysForWorkersBuilds";
  }
  if (toolName === retryInfrastructureProvisioningContract.mcp.name) {
    return "vault_actions_retryInfrastructureProvisioning";
  }
  if (toolName === createBrowserHandoffContract.mcp.name) {
    return "create_browser_handoff";
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
          name: "Samebase",
          version: "0.1.0",
        },
        instructions: MCP_SERVER_INSTRUCTIONS,
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
        clientId: tokenValidation.clientId,
        grantId: tokenValidation.grantId,
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
