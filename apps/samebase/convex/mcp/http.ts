import { getAuthUserId } from "@convex-dev/auth/server";
import type { FunctionReference } from "convex/server";
import type { Value } from "convex/values";
import type { JsonRecord } from "../jsonUtils";
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
import { createRepositoryContract } from "../repository/contracts/createRepository";
import { getUserRepositoriesContract } from "../repository/contracts/getUserRepositories";
import { connectRepositoryContract } from "../repository/contracts/connectRepository";
import {
  cloudflareAttachWorkersContract,
  cloudflareCreateWorkerContract,
  cloudflareDiscoverWorkersContract,
} from "../repository/contracts/cloudflareAttachments";
import {
  convexAttachProjectsContract,
  convexDiscoverProjectsContract,
} from "../repository/contracts/convexAttachments";
import { cloudflareConfigureWorkersBuildsForGitHubContract } from "../repository/contracts/cloudflareConfigureWorkersBuildsForGitHub";
import { cloudflareRotateConvexDeployKeysForWorkersBuildsContract } from "../repository/contracts/cloudflareRotateConvexDeployKeysForWorkersBuilds";
import { retryInfrastructureProvisioningContract } from "../repository/contracts/retryInfrastructureProvisioning";
import { createBrowserHandoffContract } from "../agentBrowserHandoff/contracts/createBrowserHandoff";
import { submitFeedbackContract } from "./contracts/submitFeedback";
import { cloudflareListWorkersBuildTokensContract } from "../repository/contracts/cloudflareBuildTokens";
import {
  buildMcpAuthorizationSuccessRedirectUrl,
  MCP_CONSENT_APP_PATH,
} from "../../shared/mcpOAuth";
import { canAccess, type AccessKey } from "../../shared/accessModel";
import { buildUrlWithSearchParams } from "../../shared/urlSearchParams";
import { parseSiteOrigin } from "../../shared/siteOrigin";
import { mcpScopeAllowsAccess } from "../toolRuntime/mcpScopes";
import { actionContracts, type ActionContractMcpName } from "../toolRuntime/actionCatalog";
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
  MCP_PROTOCOL_VERSION,
  MCP_V1_SUPPORTED_SCOPES,
  parseMcpToolCallParams,
  readBearerTokenFromAuthorizationHeader,
  redirectUriMatchesRegistered,
  validateAuthorizeRequestFromUrl,
  validateDynamicClientRegistrationPayload,
  validateJsonRpcRequestPayload,
  validateMcpProtocolVersionHeader,
  validateMcpRequestParams,
  validateTokenRequestFromSearchParams,
} from "./protocol";
import { isMcpOauthClientInactive } from "./client";
import { parseScopeTokens } from "./scopes";
import { publicMcpErrorMessage } from "./publicErrors";

const MCP_PROVISIONAL_CLIENT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MCP_AUTH_REQUEST_TTL_MS = 10 * 60 * 1000;
const MCP_SERVER_INFO = {
  name: "Samebase",
  version: "0.2.0",
} as const;
const MCP_SERVER_INSTRUCTIONS = `Samebase is only for repository-backed apps and explicit attachments to user-owned Convex and Cloudflare resources. The MCP acts as the authenticated Samebase account across every organization that the account can currently access. Never request or send an opaque Samebase organization ID. Never use Samebase for unrelated Git work or standalone provider resources.

For a request to open the Samebase dashboard, call create_browser_handoff directly. Show its returned URL to the user as a clickable link. The private sign-in link works once and expires after five minutes. Use a browser-opening action when the client provides one and the user requested it. Claim that the dashboard opened only when that action confirms it. Do not use authentication status or inventory as a preflight for this request.

Keep repository identities separate. repositoryId is the opaque Samebase repository ID returned by ${getUserRepositoriesContract.mcp.name}. githubRepositoryDatabaseId is GitHub's numeric repository database ID stored as a string. Never substitute one for the other. Do not use or invent githubRepositoryId, repoId, or ghRepoId.

For managed app creation, use only this closed sequence: read ${getUserRepositoriesContract.mcp.name}, call ${cloudflareListWorkersBuildTokensContract.mcp.name} with the human GitHub owner login, call ${createRepositoryContract.mcp.name}, then poll ${getUserRepositoriesContract.mcp.name}. If the user chooses US, pass aws-us-east-1. If the user chooses EU, pass aws-eu-west-1 and first say: "EU usage costs 1.3 times US usage. Included usage for Starter and Professional plans does not apply to EU deployments." Link to https://www.convex.dev/pricing. If the user chooses Canada or Australia, pass the exact listed region value. Otherwise, omit convexDeploymentRegion so Samebase uses the organization default, or US East when no default is saved. A one-project choice does not change the organization default. When the current Workers Builds token list is confirmed empty, pass cloudflareBuildTokenUuid as explicit null. Otherwise, use an available lastUsedBuildTokenUuid without asking, use the only listed token, or ask the user to choose by the displayed name and UUID when several tokens are listed. Pass the selected exact UUID as cloudflareBuildTokenUuid. Ask the user for the GitHub owner login when it is unclear. ${createRepositoryContract.mcp.name} keeps cloudflareBuildTokenUuid required, does not accept an accountId, and uses the organization's configured provider accounts.

After ${createRepositoryContract.mcp.name}, poll ${getUserRepositoriesContract.mcp.name} until source setup is ready or failed. Once source setup is ready, poll until provider setup is ready or failed. When cloudflareBuildTokenUuid was null, the managed run creates the GitHub repository and Convex project but no Cloudflare Worker. In that case, providerSetup status ready means only that the requested managed work finished. It does not mean Cloudflare setup is complete. Confirm that pendingCloudflareSetup identifies the planned Convex attachment and cloudflareWorkers is empty. Use its workerName and rootDirectory for the later Worker create. Keep its convexProjectId to select that same attachment for deploy-key rotation after the Worker is created. Report that Cloudflare setup is pending, and give the user https://samebase.com/docs/cloudflare-setup. The user completes Cloudflare's standard repository setup to create the first account token, then deletes the temporary Worker. After the user completes those steps and asks to finish the app, list tokens again and call ${cloudflareCreateWorkerContract.mcp.name} with a current exact UUID. Reread inventory, then call ${cloudflareRotateConvexDeployKeysForWorkersBuildsContract.mcp.name} with the new Worker and the attached Convex project. Do not attach the temporary Worker or retry the completed managed run.

For other writes, read ${getUserRepositoriesContract.mcp.name} whenever a repository may already be connected, and reuse the returned repository and attachment identifiers. Before a manual Cloudflare Worker create or Builds configuration action, call ${cloudflareListWorkersBuildTokensContract.mcp.name}. If lastUsedBuildTokenUuid is available, use that UUID without asking. If it is unavailable and the list has one result, use that result. If it is unavailable and the list has several results, ask the user to choose by the displayed name and UUID. If the token list is empty, do not call the write. A non-null pendingCloudflareSetup uses the first-app guide and supplies the exact Worker name, root directory, and Convex attachment ID for completing setup. After token setup, call ${cloudflareCreateWorkerContract.mcp.name}, reread inventory, then call ${cloudflareRotateConvexDeployKeysForWorkersBuildsContract.mcp.name}. When a Worker is already attached, keep it. After token setup, list tokens again and call repository_cloudflare_configureWorkersBuildsForGitHub for that attachment. Do not create another Worker. For another manual repository, complete token setup, list tokens again, and continue only with the action that matches the request and current inventory. ${cloudflareCreateWorkerContract.mcp.name} does not install Convex deploy keys. Pass only the selected exact UUID to the write. Never pass null to a manual Worker create or Builds configuration action. For Cloudflare actions on an existing repository, pass that repository's cloudflareAccountId from ${getUserRepositoriesContract.mcp.name}. Do not discover or select another Cloudflare account through Samebase MCP. A connected repository remains usable while provider setup continues or fails. A started provisioning run, requested build, or successful Git push is not proof of a successful deployment.

Inventory reports Samebase-owned workflow state and stable resource IDs. Read current provider existence, configuration, deployment state, and logs from provider-native tools unless an explicit Samebase action exposes that live read. Match the required IDs to an explicit action contract, call that action, then reread inventory.

Make code changes, run setup and validation, and commit or push in the returned GitHub repository. Use provider-native tools for logs, general environment values, migrations, custom domains, and terminal build state when Samebase does not expose that read. The current action and provider-boundary docs are indexed at https://samebase.com/llms.txt.`;
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
  delete input["userId"];
  delete input["grantedScopes"];
  delete input["grantId"];
  delete input["clientId"];
  return {
    ...input,
    userId: invocation.userId,
    grantedScopes: invocation.grantedScopes,
  };
}

type McpToolResult = {
  status: "ok" | "error" | "blocked";
  text: string;
  structuredContent?: Value;
};
type McpToolCall = (
  ctx: ActionCtx,
  invocation: McpToolInvocation,
) => McpToolResult | Promise<McpToolResult>;

function callGetAuthenticationStatusMcpTool(
  _ctx: ActionCtx,
  invocation: McpToolInvocation,
): McpToolResult {
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
  const accountPresentation = resolveAccountPresentation({
    displayName: viewerUser.displayName,
    email: normalizedEmail,
  });
  const authentication: McpAuthenticationStatus = {
    authenticated: true,
    user: {
      ...(accountPresentation.kind === "displayName" ? { name: accountPresentation.label } : {}),
      email: normalizedEmail,
    },
    role: invocation.viewer.role,
    accessKeys: invocation.viewer.accessKeys,
    grantedScopes: invocation.grantedScopes,
  };
  return {
    status: "ok",
    text: `Authenticated as ${accountPresentation.label}.`,
    structuredContent: { authentication },
  };
}

function createMcpRuntimeToolCall<
  Tool extends FunctionReference<"action", "internal", Record<string, Value>, McpToolResult>,
>(tool: Tool): McpToolCall {
  return async (ctx, invocation) =>
    // eslint-disable-next-line samebase/no-forwarded-convex-function-args -- Each registered target action validates its dynamic MCP tool input.
    await ctx.runAction(
      tool,
      // @ts-expect-error Raw MCP arguments intentionally flow to Convex action validation.
      buildMcpToolInvocationArgs(invocation),
    );
}

async function callCreateBrowserHandoffMcpTool(
  ctx: ActionCtx,
  invocation: McpToolInvocation,
): Promise<McpToolResult> {
  // eslint-disable-next-line samebase/no-forwarded-convex-function-args -- The target action validates raw MCP input after reserved fields are replaced.
  return await ctx.runAction(internal.toolRuntime.runtime.createBrowserHandoffTool, {
    ...buildMcpToolInvocationArgs(invocation),
    grantId: invocation.grantId,
    clientId: invocation.clientId,
  });
}

const mcpToolCalls: Record<ActionContractMcpName, McpToolCall> = {
  [getUserRepositoriesContract.mcp.name]: createMcpRuntimeToolCall(
    internal.toolRuntime.runtime.getUserRepositoriesTool,
  ),
  [cloudflareListWorkersBuildTokensContract.mcp.name]: createMcpRuntimeToolCall(
    internal.toolRuntime.runtime.cloudflareListWorkersBuildTokensTool,
  ),
  [createRepositoryContract.mcp.name]: createMcpRuntimeToolCall(
    internal.toolRuntime.runtime.createRepositoryTool,
  ),
  [connectRepositoryContract.mcp.name]: createMcpRuntimeToolCall(
    internal.toolRuntime.runtime.connectRepositoryTool,
  ),
  [convexDiscoverProjectsContract.mcp.name]: createMcpRuntimeToolCall(
    internal.toolRuntime.runtime.convexDiscoverProjectsTool,
  ),
  [cloudflareDiscoverWorkersContract.mcp.name]: createMcpRuntimeToolCall(
    internal.toolRuntime.runtime.cloudflareDiscoverWorkersTool,
  ),
  [convexAttachProjectsContract.mcp.name]: createMcpRuntimeToolCall(
    internal.toolRuntime.runtime.convexAttachProjectsTool,
  ),
  [cloudflareAttachWorkersContract.mcp.name]: createMcpRuntimeToolCall(
    internal.toolRuntime.runtime.cloudflareAttachWorkersTool,
  ),
  [cloudflareCreateWorkerContract.mcp.name]: createMcpRuntimeToolCall(
    internal.toolRuntime.runtime.cloudflareCreateWorkerTool,
  ),
  [cloudflareConfigureWorkersBuildsForGitHubContract.mcp.name]: createMcpRuntimeToolCall(
    internal.toolRuntime.runtime.cloudflareConfigureWorkersBuildsForGitHubTool,
  ),
  [cloudflareRotateConvexDeployKeysForWorkersBuildsContract.mcp.name]: createMcpRuntimeToolCall(
    internal.toolRuntime.runtime.cloudflareRotateConvexDeployKeysForWorkersBuildsTool,
  ),
  [retryInfrastructureProvisioningContract.mcp.name]: createMcpRuntimeToolCall(
    internal.toolRuntime.runtime.retryInfrastructureProvisioningTool,
  ),
  [submitFeedbackContract.mcp.name]: createMcpRuntimeToolCall(
    internal.toolRuntime.runtime.submitFeedbackTool,
  ),
  [createBrowserHandoffContract.mcp.name]: callCreateBrowserHandoffMcpTool,
  [getAuthenticationStatusContract.mcp.name]: callGetAuthenticationStatusMcpTool,
};

const mcpToolCatalog = actionContracts.map((contract) => ({
  access: contract.access,
  title: contract.mcp.title,
  name: contract.mcp.name,
  description: contract.mcp.description,
  annotations: contract.mcp.annotations,
  inputSchema: convexArgsToToolInputSchema(
    "mcpArgs" in contract ? contract.mcpArgs : contract.args,
    contract.mcp.inputDescriptions,
  ),
  outputSchema:
    "structuredContent" in contract
      ? convexValidatorToToolOutputSchema(contract.structuredContent)
      : undefined,
  call: mcpToolCalls[contract.mcp.name],
}));

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

function hasAllowedMcpOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return !origin || origin === parseOrigin(request);
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
  const configuredSiteUrl = process.env["SITE_URL"];
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

function jsonRpcSuccessResponse(args: { id: string | number; result: JsonRecord }): Response {
  return jsonResponse({
    jsonrpc: "2.0",
    id: args.id,
    result: args.result,
  });
}

function jsonRpcErrorResponse(args: {
  id?: string | number;
  code: number;
  message: string;
  status?: number;
}): Response {
  return jsonResponse(
    {
      jsonrpc: "2.0",
      ...(args.id !== undefined ? { id: args.id } : {}),
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
  const toolCallParams = parseMcpToolCallParams(params);
  if (!toolCallParams.ok) {
    return "unknown";
  }

  const toolName = toolCallParams.value.name;
  return mcpToolCatalog.find((tool) => tool.name === toolName)?.name ?? "unknown";
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

  const expectedResource = `${parseOrigin(request)}/mcp`;
  if (validation.value.resource !== expectedResource) {
    return oauthErrorResponse({
      status: 400,
      error: "invalid_target",
      errorDescription: "resource must target this MCP server.",
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

  if (isMcpOauthClientInactive({ client, now })) {
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

  if (userId !== null) {
    const authorizationCode = createAuthorizationCodeValue();
    const authorizationCodeHash = await sha256Hex(authorizationCode);
    const issueResult = await ctx.runMutation(
      internal.mcp.oauth.issueAuthorizationCodeForAuthRequest,
      {
        requestId,
        userId,
        codeHash: authorizationCodeHash,
        codeExpiresAt: now + MCP_AUTHORIZATION_CODE_TTL_MS,
        grantMode: "reuse_only",
        allowLoopbackHttpRedirectUris:
          protocolValidationOptions.allowLoopbackHttpRedirectUris === true,
        now,
      },
    );
    if (issueResult.ok) {
      return Response.redirect(
        buildMcpAuthorizationSuccessRedirectUrl(issueResult.redirectUri, {
          code: authorizationCode,
          iss: new URL(issueResult.resource).origin,
          state: issueResult.state,
        }),
        302,
      );
    }
    if (issueResult.error !== "consent_required") {
      return oauthErrorResponse({
        status: issueResult.status,
        error: issueResult.error,
        errorDescription: issueResult.errorDescription,
      });
    }
  }

  const consentRedirect = buildMcpConsentRedirectUrl({
    request,
    requestId,
    loginRequired: userId === null,
  });
  if (!consentRedirect.ok) {
    return oauthErrorResponse({
      status: 500,
      error: "server_error",
      errorDescription: consentRedirect.errorDescription,
    });
  }
  return Response.redirect(consentRedirect.value, 302);
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

  const expectedResource = `${parseOrigin(request)}/mcp`;
  if (validation.value.resource !== expectedResource) {
    return oauthErrorResponse({
      status: 400,
      error: "invalid_target",
      errorDescription: "resource must target this MCP server.",
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

  if (isMcpOauthClientInactive({ client, now })) {
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
      resource: validation.value.resource,
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
    resource: validation.value.resource,
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
  if (!hasAllowedMcpOrigin(request)) {
    return jsonRpcErrorResponse({
      code: -32600,
      message: "Origin is not allowed.",
      status: 403,
    });
  }

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
    return jsonRpcErrorResponse({
      code: -32700,
      message: "Parse error",
    });
  }

  const jsonRpcValidation = validateJsonRpcRequestPayload(payload);
  if (!jsonRpcValidation.ok) {
    return jsonRpcErrorResponse({
      ...(jsonRpcValidation.id !== undefined ? { id: jsonRpcValidation.id } : {}),
      code: -32600,
      message: jsonRpcValidation.error,
    });
  }

  const rpcRequest = jsonRpcValidation.value;
  if (rpcRequest.method === "server/discover" && rpcRequest.id !== undefined) {
    return jsonRpcErrorResponse({
      id: rpcRequest.id,
      code: -32601,
      message: "Method not found: server/discover",
      status: 200,
    });
  }

  if (rpcRequest.method !== "initialize") {
    const protocolVersionValidation = validateMcpProtocolVersionHeader(request.headers);
    if (!protocolVersionValidation.ok) {
      return jsonRpcErrorResponse({
        id: rpcRequest.id,
        code: protocolVersionValidation.kind === "missing" ? -32020 : -32022,
        message:
          protocolVersionValidation.kind === "missing"
            ? "MCP-Protocol-Version header is required."
            : `Unsupported MCP-Protocol-Version: ${protocolVersionValidation.requested}`,
        status: 400,
      });
    }
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
    const response = oauthErrorResponse({
      status: 401,
      error: "invalid_token",
      errorDescription: "Token resource does not match this MCP endpoint.",
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

  const mcpMethod = readMcpMethodForUsage(rpcRequest.method);
  logMcpHttpUsageContext({
    samebaseUserId: tokenValidation.userId,
    mcpMethod,
    mcpToolName:
      mcpMethod === "tools/call" && rpcRequest.id !== undefined
        ? readMcpToolNameForUsage(rpcRequest.params)
        : null,
    mcpIsNotification: rpcRequest.id === undefined,
  });

  if (rpcRequest.id === undefined) {
    return new Response(null, { status: 202 });
  }
  const requestId = rpcRequest.id;

  const mcpRequestValidation = validateMcpRequestParams(rpcRequest);
  if (!mcpRequestValidation.ok) {
    return jsonRpcErrorResponse({
      id: requestId,
      code: -32602,
      message: mcpRequestValidation.error,
      status: 200,
    });
  }

  if (rpcRequest.method === "initialize") {
    return jsonRpcSuccessResponse({
      id: requestId,
      result: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {
          tools: {},
        },
        serverInfo: MCP_SERVER_INFO,
        instructions: MCP_SERVER_INSTRUCTIONS,
      },
    });
  }

  if (rpcRequest.method === "ping") {
    return jsonRpcSuccessResponse({
      id: requestId,
      result: {},
    });
  }

  if (rpcRequest.method === "tools/list") {
    const grantedScopes = parseScopeTokens(tokenValidation.scope);
    const currentViewer = await readMcpViewer(ctx, tokenValidation.userId);
    return jsonRpcSuccessResponse({
      id: requestId,
      result: {
        tools: listMcpToolsForAccess({
          grantedScopes,
          currentAccessKeys: currentViewer.accessKeys,
        }),
      },
    });
  }

  if (rpcRequest.method === "tools/call") {
    const grantedScopes = parseScopeTokens(tokenValidation.scope);
    const toolCallParams = parseMcpToolCallParams(rpcRequest.params);
    if (!toolCallParams.ok) {
      return jsonRpcErrorResponse({
        id: requestId,
        code: -32602,
        message: toolCallParams.error,
        status: 200,
      });
    }

    const { arguments: input, name: toolName } = toolCallParams.value;
    const tool = mcpToolCatalog.find((entry) => entry.name === toolName);
    if (!tool) {
      return jsonRpcErrorResponse({
        id: requestId,
        code: -32602,
        message: `Unknown tool: ${toolName}`,
        status: 200,
      });
    }

    // Token scopes are granted at consent time; the user's role access can
    // shrink afterwards. tools/list already filters on current access, and
    // execution must enforce the same boundary or a stale token outlives a
    // revoked role.
    const currentViewer = await readMcpViewer(ctx, tokenValidation.userId);
    if (!canAccess(tool.access, currentViewer.accessKeys)) {
      return jsonRpcSuccessResponse({
        id: requestId,
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
        id: requestId,
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
      return jsonRpcSuccessResponse({
        id: requestId,
        result: {
          content: [
            {
              type: "text",
              text: publicMcpErrorMessage(error),
            },
          ],
          isError: true,
        },
      });
    }
  }

  return jsonRpcErrorResponse({
    id: requestId,
    code: -32601,
    message: `Method not found: ${rpcRequest.method}`,
    status: 200,
  });
});

export const rejectMcpUnsupportedTransportMethod = httpAction(async (_ctx, request) => {
  if (!hasAllowedMcpOrigin(request)) {
    return jsonRpcErrorResponse({
      code: -32600,
      message: "Origin is not allowed.",
      status: 403,
    });
  }

  return new Response(null, {
    status: 405,
    headers: {
      Allow: "POST",
      "Cache-Control": "no-store",
    },
  });
});
