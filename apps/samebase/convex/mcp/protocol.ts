import { includes } from "@samebase/dependent/main";
import { asRecord, isRecord, type JsonRecord } from "../lib/json";
import { actionContracts } from "../toolRuntime/actionCatalog";
import { submitFeedbackContract } from "./contracts/submitFeedback";
import { createRepositoryContract } from "../repository/contracts/createRepository";
import { getUserRepositoriesContract } from "../repository/contracts/getUserRepositories";
import type { AccessKey } from "../../shared/accessModel";
import { parseScopeTokens } from "./scopes";

const DEFAULT_GRANT_TYPES = ["authorization_code", "refresh_token"] as const;
const DEFAULT_RESPONSE_TYPES = ["code"] as const;
const SUPPORTED_TOKEN_ENDPOINT_AUTH_METHOD = "none";
const CODE_CHALLENGE_METHOD = "S256";

export const MCP_PROTOCOL_VERSION = "2025-06-18";

const MAX_REDIRECT_URIS = 8;
const MAX_REDIRECT_URI_LENGTH = 2048;
const MAX_CLIENT_NAME_LENGTH = 120;
const MAX_CONTACTS = 8;
const MAX_CONTACT_LENGTH = 320;
const MAX_STATE_LENGTH = 4096;

const pkceValuePattern = /^[A-Za-z0-9\-._~]{43,128}$/;

// The v1 MCP OAuth scope vocabulary is the unique non-public access keys
// behind the action catalog (rfcs/093), in catalog presentation order: one
// scope per distinct protected access key a cataloged tool requires, not one
// scope per tool. Public tools are allowed independently at dispatch.
export const MCP_V1_SUPPORTED_SCOPES: readonly AccessKey[] = Array.from(
  new Set(actionContracts.map((contract) => contract.access)),
).filter((access) => access !== "access_public");
// Some MCP clients, including the published Samebase plugin, cannot request
// scopes. The default includes its app surface and the approved-feedback
// write. Existing grants keep their stored scopes. A new authorization uses
// this exact string, so oauth.ts requires consent when the default changes.
// Other newer non-public scopes have to be requested explicitly. Token order
// is load-bearing because grant reuse compares the exact string.
const DEFAULT_MCP_SCOPE = [
  createRepositoryContract.access,
  getUserRepositoriesContract.access,
  submitFeedbackContract.access,
].join(" ");

type McpSupportedScope = AccessKey;

export type DynamicClientRegistrationInput = {
  clientName: string | null;
  redirectUris: string[];
  contacts: string[];
  grantTypes: string[];
  responseTypes: string[];
  tokenEndpointAuthMethod: "none";
};

type ValidationOk<T> = {
  ok: true;
  value: T;
};

type ValidationError = {
  ok: false;
  status: number;
  error: string;
};

type ValidationResult<T> = ValidationOk<T> | ValidationError;

export type AuthorizeRequestInput = {
  clientId: string;
  redirectUri: string;
  resource: string;
  scopes: McpSupportedScope[];
  state: string | null;
  codeChallenge: string;
  codeChallengeMethod: "S256";
};

type AuthorizationCodeTokenRequestInput = {
  grantType: "authorization_code";
  clientId: string;
  code: string;
  redirectUri: string;
  codeVerifier: string;
  resource: string;
};

type RefreshTokenRequestInput = {
  grantType: "refresh_token";
  clientId: string;
  refreshToken: string;
  resource: string;
};

export type TokenRequestInput = AuthorizationCodeTokenRequestInput | RefreshTokenRequestInput;

export type JsonRpcRequestPayload = {
  jsonrpc: "2.0";
  method: string;
  id?: string | number;
  params: unknown;
};

type JsonRpcRequestValidationResult =
  | ValidationOk<JsonRpcRequestPayload>
  | {
      ok: false;
      status: number;
      error: string;
      id?: string | number;
    };

type McpRequestParamsValidationResult =
  | { ok: true }
  | {
      ok: false;
      kind: "invalid_params";
      error: string;
    };

type McpProtocolVersionHeaderValidationResult =
  | { ok: true }
  | { ok: false; kind: "missing" }
  | { ok: false; kind: "unsupported"; requested: string };

type McpToolCallParamsValidationResult =
  | {
      ok: true;
      value: {
        name: string;
        arguments: JsonRecord;
      };
    }
  | {
      ok: false;
      error: string;
    };

export type McpProtocolValidationOptions = {
  allowLoopbackHttpRedirectUris?: boolean;
};

export function getDefaultMcpProtocolValidationOptions(): McpProtocolValidationOptions {
  return {
    // Native/desktop MCP clients use loopback callbacks over http://127.0.0.1:*.
    allowLoopbackHttpRedirectUris: true,
  };
}

function trimTrailingSlash(url: string): string {
  if (url.endsWith("/")) {
    return url.slice(0, -1);
  }
  return url;
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "[::1]"
  );
}

function parseAndValidateUri(
  uri: string,
  args: {
    forRedirect: boolean;
    allowLoopbackHttpRedirectUris: boolean;
  },
): URL | null {
  try {
    const parsed = new URL(uri);
    if (parsed.hash.length > 0) {
      return null;
    }
    if (args.forRedirect) {
      if (parsed.protocol === "https:") {
        return parsed;
      }
      if (
        args.allowLoopbackHttpRedirectUris &&
        parsed.protocol === "http:" &&
        isLoopbackHost(parsed.hostname)
      ) {
        return parsed;
      }
      return null;
    }
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed : null;
  } catch {
    return null;
  }
}

function resolveAllowLoopbackHttpRedirectUris(options?: McpProtocolValidationOptions): boolean {
  return options?.allowLoopbackHttpRedirectUris === true;
}

export function redirectUriMatchesRegistered(args: {
  requestedRedirectUri: string;
  registeredRedirectUris: string[];
  options?: McpProtocolValidationOptions;
}): boolean {
  const allowLoopbackHttpRedirectUris = resolveAllowLoopbackHttpRedirectUris(args.options);
  const requested = parseAndValidateUri(args.requestedRedirectUri, {
    forRedirect: true,
    allowLoopbackHttpRedirectUris,
  });
  if (!requested) {
    return false;
  }
  return args.registeredRedirectUris.some((registeredRedirectUri) => {
    const parsedRegistered = parseAndValidateUri(registeredRedirectUri, {
      forRedirect: true,
      allowLoopbackHttpRedirectUris,
    });
    if (!parsedRegistered) {
      return false;
    }
    return registeredRedirectUri === args.requestedRedirectUri;
  });
}

function readStringArray(value: unknown, maxItems: number, maxLength: number): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  if (value.length === 0 || value.length > maxItems) {
    return null;
  }
  const entries: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") {
      return null;
    }
    const trimmed = item.trim();
    if (trimmed.length === 0 || trimmed.length > maxLength) {
      return null;
    }
    entries.push(trimmed);
  }
  return entries;
}

function readOptionalStringArray(
  value: unknown,
  maxItems: number,
  maxLength: number,
): string[] | null {
  if (value === undefined) {
    return [];
  }
  return readStringArray(value, maxItems, maxLength);
}

function validateGrantTypes(grantTypes: string[]): boolean {
  const allowed = new Set<string>(DEFAULT_GRANT_TYPES);
  if (grantTypes.length === 0 || grantTypes.length > DEFAULT_GRANT_TYPES.length) {
    return false;
  }
  if (!grantTypes.every((grantType) => allowed.has(grantType))) {
    return false;
  }
  return grantTypes.includes("authorization_code");
}

function validateResponseTypes(responseTypes: string[]): boolean {
  return responseTypes.length === 1 && responseTypes[0] === DEFAULT_RESPONSE_TYPES[0];
}

export function buildMcpProtectedResourceMetadata(baseUrl: string): {
  resource: string;
  authorization_servers: string[];
  bearer_methods_supported: string[];
  scopes_supported: readonly McpSupportedScope[];
} {
  const origin = trimTrailingSlash(baseUrl);
  return {
    resource: `${origin}/mcp`,
    authorization_servers: [origin],
    bearer_methods_supported: ["header"],
    scopes_supported: MCP_V1_SUPPORTED_SCOPES,
  };
}

export function buildMcpAuthorizationServerMetadata(baseUrl: string): {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint: string;
  authorization_response_iss_parameter_supported: true;
  response_types_supported: readonly string[];
  grant_types_supported: readonly string[];
  code_challenge_methods_supported: readonly string[];
  token_endpoint_auth_methods_supported: readonly string[];
  scopes_supported: readonly McpSupportedScope[];
} {
  const origin = trimTrailingSlash(baseUrl);
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/mcp/authorize`,
    token_endpoint: `${origin}/oauth/mcp/token`,
    registration_endpoint: `${origin}/oauth/mcp/register`,
    authorization_response_iss_parameter_supported: true,
    response_types_supported: DEFAULT_RESPONSE_TYPES,
    grant_types_supported: DEFAULT_GRANT_TYPES,
    code_challenge_methods_supported: [CODE_CHALLENGE_METHOD],
    token_endpoint_auth_methods_supported: [SUPPORTED_TOKEN_ENDPOINT_AUTH_METHOD],
    scopes_supported: MCP_V1_SUPPORTED_SCOPES,
  };
}

export function validateDynamicClientRegistrationPayload(
  payload: unknown,
  options?: McpProtocolValidationOptions,
): ValidationResult<DynamicClientRegistrationInput> {
  const record = asRecord(payload);
  const allowLoopbackHttpRedirectUris = resolveAllowLoopbackHttpRedirectUris(options);

  const clientNameValue = record["client_name"];
  let clientName: string | null = null;
  if (clientNameValue !== undefined) {
    if (typeof clientNameValue !== "string") {
      return {
        ok: false,
        status: 400,
        error: "client_name must be a string when provided.",
      };
    }
    const trimmed = clientNameValue.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_CLIENT_NAME_LENGTH) {
      return {
        ok: false,
        status: 400,
        error: `client_name must be between 1 and ${MAX_CLIENT_NAME_LENGTH} characters.`,
      };
    }
    clientName = trimmed;
  }

  const redirectUris = readStringArray(
    record["redirect_uris"],
    MAX_REDIRECT_URIS,
    MAX_REDIRECT_URI_LENGTH,
  );
  if (redirectUris === null) {
    return {
      ok: false,
      status: 400,
      error: "redirect_uris must be a non-empty array of valid redirect URI strings.",
    };
  }

  for (const redirectUri of redirectUris) {
    const parsed = parseAndValidateUri(redirectUri, {
      forRedirect: true,
      allowLoopbackHttpRedirectUris,
    });
    if (parsed === null) {
      return {
        ok: false,
        status: 400,
        error: allowLoopbackHttpRedirectUris
          ? "redirect_uris must use https, except loopback http redirect URIs."
          : "redirect_uris must use https.",
      };
    }
  }

  const contacts = readOptionalStringArray(record["contacts"], MAX_CONTACTS, MAX_CONTACT_LENGTH);
  if (contacts === null) {
    return {
      ok: false,
      status: 400,
      error: `contacts must contain 1-${MAX_CONTACTS} non-empty strings when provided.`,
    };
  }

  const grantTypes =
    record["grant_types"] === undefined
      ? [...DEFAULT_GRANT_TYPES]
      : readStringArray(record["grant_types"], DEFAULT_GRANT_TYPES.length, 64);
  if (grantTypes === null || !validateGrantTypes(grantTypes)) {
    return {
      ok: false,
      status: 400,
      error: "grant_types must contain supported values and include authorization_code.",
    };
  }

  const responseTypes =
    record["response_types"] === undefined
      ? [...DEFAULT_RESPONSE_TYPES]
      : readStringArray(record["response_types"], DEFAULT_RESPONSE_TYPES.length, 16);
  if (responseTypes === null || !validateResponseTypes(responseTypes)) {
    return {
      ok: false,
      status: 400,
      error: 'response_types must be exactly ["code"] for v1.',
    };
  }

  const tokenEndpointAuthMethodValue = record["token_endpoint_auth_method"];
  if (
    tokenEndpointAuthMethodValue !== undefined &&
    typeof tokenEndpointAuthMethodValue !== "string"
  ) {
    return {
      ok: false,
      status: 400,
      error: 'token_endpoint_auth_method must be "none" in v1.',
    };
  }
  const tokenEndpointAuthMethod =
    tokenEndpointAuthMethodValue?.trim() ?? SUPPORTED_TOKEN_ENDPOINT_AUTH_METHOD;

  if (tokenEndpointAuthMethod !== SUPPORTED_TOKEN_ENDPOINT_AUTH_METHOD) {
    return {
      ok: false,
      status: 400,
      error: 'token_endpoint_auth_method must be "none" in v1.',
    };
  }

  return {
    ok: true,
    value: {
      clientName,
      redirectUris,
      contacts,
      grantTypes,
      responseTypes,
      tokenEndpointAuthMethod: SUPPORTED_TOKEN_ENDPOINT_AUTH_METHOD,
    },
  };
}

export function validateAuthorizeRequestFromUrl(
  url: URL,
  options?: McpProtocolValidationOptions,
): ValidationResult<AuthorizeRequestInput> {
  const allowLoopbackHttpRedirectUris = resolveAllowLoopbackHttpRedirectUris(options);
  const responseType = url.searchParams.get("response_type");
  if (responseType !== "code") {
    return {
      ok: false,
      status: 400,
      error: 'response_type must be "code".',
    };
  }

  const clientId = url.searchParams.get("client_id")?.trim() ?? "";
  if (clientId.length === 0) {
    return {
      ok: false,
      status: 400,
      error: "client_id is required.",
    };
  }

  const redirectUriRaw = url.searchParams.get("redirect_uri") ?? "";
  if (redirectUriRaw.length === 0) {
    return {
      ok: false,
      status: 400,
      error: "redirect_uri is required.",
    };
  }

  const redirectUri = parseAndValidateUri(redirectUriRaw, {
    forRedirect: true,
    allowLoopbackHttpRedirectUris,
  });
  if (redirectUri === null) {
    return {
      ok: false,
      status: 400,
      error: "redirect_uri is invalid.",
    };
  }

  const resourceRaw = url.searchParams.get("resource")?.trim() ?? "";
  if (resourceRaw.length === 0) {
    return {
      ok: false,
      status: 400,
      error: "resource is required.",
    };
  }
  const resource = parseAndValidateUri(resourceRaw, {
    forRedirect: false,
    allowLoopbackHttpRedirectUris,
  });
  if (resource === null) {
    return {
      ok: false,
      status: 400,
      error: "resource must be an absolute URL.",
    };
  }

  // Codex/native MCP OAuth clients may omit `scope` on authorize requests.
  // OAuth allows server-defined defaults, so use the scopes that back this
  // MCP server's public tool surface.
  const scopeRaw = url.searchParams.get("scope")?.trim() || DEFAULT_MCP_SCOPE;
  const scopes = parseScopeTokens(scopeRaw).map((scope) => scope.toLowerCase());

  const supportedScopes: McpSupportedScope[] = [];
  for (const scope of scopes) {
    if (!includes(MCP_V1_SUPPORTED_SCOPES, scope)) {
      return {
        ok: false,
        status: 400,
        error: `Unsupported scope requested: ${scope}`,
      };
    }
    supportedScopes.push(scope);
  }

  const state = url.searchParams.get("state");
  if (state !== null && state.length > MAX_STATE_LENGTH) {
    return {
      ok: false,
      status: 400,
      error: `state must be <= ${MAX_STATE_LENGTH} characters.`,
    };
  }

  const codeChallenge = url.searchParams.get("code_challenge")?.trim() ?? "";
  if (!pkceValuePattern.test(codeChallenge)) {
    return {
      ok: false,
      status: 400,
      error: "code_challenge must be 43-128 URL-safe characters.",
    };
  }

  const codeChallengeMethod = url.searchParams.get("code_challenge_method");
  if (codeChallengeMethod !== CODE_CHALLENGE_METHOD) {
    return {
      ok: false,
      status: 400,
      error: 'code_challenge_method must be "S256".',
    };
  }

  return {
    ok: true,
    value: {
      clientId,
      redirectUri: redirectUriRaw,
      resource: resource.toString(),
      scopes: supportedScopes,
      state,
      codeChallenge,
      codeChallengeMethod: CODE_CHALLENGE_METHOD,
    },
  };
}

export function validateTokenRequestFromSearchParams(
  params: URLSearchParams,
  options?: McpProtocolValidationOptions,
): ValidationResult<TokenRequestInput> {
  const allowLoopbackHttpRedirectUris = resolveAllowLoopbackHttpRedirectUris(options);
  const resourceRaw = params.get("resource")?.trim() ?? "";
  if (resourceRaw.length === 0) {
    return {
      ok: false,
      status: 400,
      error: "resource is required.",
    };
  }
  const resource = parseAndValidateUri(resourceRaw, {
    forRedirect: false,
    allowLoopbackHttpRedirectUris,
  });
  if (resource === null) {
    return {
      ok: false,
      status: 400,
      error: "resource must be an absolute URL.",
    };
  }

  const grantType = params.get("grant_type")?.trim() ?? "";
  if (grantType === "authorization_code") {
    const code = params.get("code")?.trim() ?? "";
    if (code.length === 0) {
      return {
        ok: false,
        status: 400,
        error: "code is required for authorization_code grant.",
      };
    }

    const clientId = params.get("client_id")?.trim() ?? "";
    if (clientId.length === 0) {
      return {
        ok: false,
        status: 400,
        error: "client_id is required.",
      };
    }

    const redirectUriRaw = params.get("redirect_uri") ?? "";
    if (redirectUriRaw.length === 0) {
      return {
        ok: false,
        status: 400,
        error: "redirect_uri is required.",
      };
    }
    const redirectUri = parseAndValidateUri(redirectUriRaw, {
      forRedirect: true,
      allowLoopbackHttpRedirectUris,
    });
    if (redirectUri === null) {
      return {
        ok: false,
        status: 400,
        error: "redirect_uri is invalid.",
      };
    }

    const codeVerifier = params.get("code_verifier")?.trim() ?? "";
    if (!pkceValuePattern.test(codeVerifier)) {
      return {
        ok: false,
        status: 400,
        error: "code_verifier must be 43-128 URL-safe characters.",
      };
    }

    return {
      ok: true,
      value: {
        grantType: "authorization_code",
        clientId,
        code,
        redirectUri: redirectUriRaw,
        codeVerifier,
        resource: resource.toString(),
      },
    };
  }

  if (grantType === "refresh_token") {
    const clientId = params.get("client_id")?.trim() ?? "";
    if (clientId.length === 0) {
      return {
        ok: false,
        status: 400,
        error: "client_id is required.",
      };
    }

    const refreshToken = params.get("refresh_token")?.trim() ?? "";
    if (refreshToken.length === 0) {
      return {
        ok: false,
        status: 400,
        error: "refresh_token is required for refresh_token grant.",
      };
    }

    return {
      ok: true,
      value: {
        grantType: "refresh_token",
        clientId,
        refreshToken,
        resource: resource.toString(),
      },
    };
  }

  return {
    ok: false,
    status: 400,
    error: "grant_type must be authorization_code or refresh_token.",
  };
}

export function readBearerTokenFromAuthorizationHeader(
  authorization: string | null,
): ValidationResult<string> {
  if (!authorization) {
    return {
      ok: false,
      status: 401,
      error: "Authorization header must be provided.",
    };
  }

  const match = authorization.trim().match(/^bearer\s+(.+)$/i);
  if (!match) {
    return {
      ok: false,
      status: 401,
      error: "Authorization header must use Bearer scheme.",
    };
  }

  const token = match[1].trim();
  if (token.length === 0) {
    return {
      ok: false,
      status: 401,
      error: "Bearer token is required.",
    };
  }

  return {
    ok: true,
    value: token,
  };
}

export function validateJsonRpcRequestPayload(payload: unknown): JsonRpcRequestValidationResult {
  const record = asRecord(payload);
  const idValue = record["id"];
  const readableId =
    typeof idValue === "string" || (typeof idValue === "number" && Number.isInteger(idValue))
      ? idValue
      : undefined;

  if (record["jsonrpc"] !== "2.0") {
    return {
      ok: false,
      status: 400,
      error: 'jsonrpc must be "2.0".',
      ...(readableId !== undefined ? { id: readableId } : {}),
    };
  }

  if (typeof record["method"] !== "string" || record["method"].trim().length === 0) {
    return {
      ok: false,
      status: 400,
      error: "method must be a non-empty string.",
      ...(readableId !== undefined ? { id: readableId } : {}),
    };
  }

  if (idValue !== undefined && readableId === undefined) {
    return {
      ok: false,
      status: 400,
      error: "id must be a string, integer, or omitted.",
    };
  }

  return {
    ok: true,
    value: {
      jsonrpc: "2.0",
      method: record["method"],
      id: readableId,
      params: record["params"],
    },
  };
}

function invalidMcpParams(error: string): McpRequestParamsValidationResult {
  return { ok: false, kind: "invalid_params", error };
}

export function validateMcpProtocolVersionHeader(
  headers: Headers,
): McpProtocolVersionHeaderValidationResult {
  const requested = headers.get("MCP-Protocol-Version");
  if (requested === null || requested.length === 0) {
    return { ok: false, kind: "missing" };
  }
  if (requested !== MCP_PROTOCOL_VERSION) {
    return { ok: false, kind: "unsupported", requested };
  }
  return { ok: true };
}

export function parseMcpToolCallParams(params: unknown): McpToolCallParamsValidationResult {
  if (!isRecord(params)) {
    return { ok: false, error: "tools/call params must be an object." };
  }
  const name = params["name"];
  if (typeof name !== "string" || name.length === 0) {
    return { ok: false, error: "tools/call params.name must be a non-empty string." };
  }
  const toolArguments = params["arguments"];
  if (toolArguments !== undefined && !isRecord(toolArguments)) {
    return {
      ok: false,
      error: "tools/call params.arguments must be an object when provided.",
    };
  }
  return {
    ok: true,
    value: {
      name,
      arguments: toolArguments ?? {},
    },
  };
}

export function validateMcpRequestParams(
  rpcRequest: JsonRpcRequestPayload,
): McpRequestParamsValidationResult {
  if (rpcRequest.method === "initialize") {
    if (!isRecord(rpcRequest.params)) {
      return invalidMcpParams("initialize params must be an object.");
    }
    if (
      typeof rpcRequest.params["protocolVersion"] !== "string" ||
      rpcRequest.params["protocolVersion"].length === 0
    ) {
      return invalidMcpParams("initialize params.protocolVersion must be a non-empty string.");
    }
    if (!isRecord(rpcRequest.params["capabilities"])) {
      return invalidMcpParams("initialize params.capabilities must be an object.");
    }
    const clientInfo = rpcRequest.params["clientInfo"];
    if (!isRecord(clientInfo)) {
      return invalidMcpParams("initialize params.clientInfo must be an object.");
    }
    if (
      typeof clientInfo["name"] !== "string" ||
      clientInfo["name"].length === 0 ||
      typeof clientInfo["version"] !== "string" ||
      clientInfo["version"].length === 0
    ) {
      return invalidMcpParams(
        "initialize params.clientInfo must include non-empty name and version strings.",
      );
    }
  }

  if (
    rpcRequest.method === "ping" &&
    rpcRequest.params !== undefined &&
    !isRecord(rpcRequest.params)
  ) {
    return invalidMcpParams("ping params must be an object when provided.");
  }

  if (rpcRequest.method === "tools/list") {
    if (rpcRequest.params === undefined) {
      return { ok: true };
    }
    if (!isRecord(rpcRequest.params)) {
      return invalidMcpParams("tools/list params must be an object when provided.");
    }
    if (rpcRequest.params["cursor"] !== undefined) {
      if (typeof rpcRequest.params["cursor"] !== "string") {
        return invalidMcpParams("tools/list params.cursor must be a string when provided.");
      }
      return invalidMcpParams("tools/list params.cursor is not supported and must be omitted.");
    }
  }

  return { ok: true };
}
