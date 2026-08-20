import { includes } from "@samebase/dependent/main";
import { asRecord, isRecord } from "../jsonUtils";
import { actionContracts } from "../toolRuntime/actionCatalog";
import { submitFeedbackContract } from "./contracts/submitFeedback";
import { createRepositoryContract } from "../vault/contracts/createRepository";
import { getUserVaultsContract } from "../vault/contracts/getUserVaults";
import type { AccessKey } from "../../shared/accessModel";
import { parseScopeTokens } from "./scopes";

const DEFAULT_GRANT_TYPES = ["authorization_code", "refresh_token"] as const;
const DEFAULT_RESPONSE_TYPES = ["code"] as const;
const SUPPORTED_TOKEN_ENDPOINT_AUTH_METHOD = "none";
const CODE_CHALLENGE_METHOD = "S256";

export const MCP_PROTOCOL_VERSION = "2026-07-28";
export const MCP_SUPPORTED_PROTOCOL_VERSIONS = [MCP_PROTOCOL_VERSION] as const;

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
  getUserVaultsContract.access,
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

export type McpHttpRequestValidationResult =
  | { ok: true }
  | {
      ok: false;
      kind: "invalid_params";
      error: string;
    }
  | {
      ok: false;
      kind: "header_mismatch";
      error: string;
    }
  | {
      ok: false;
      kind: "unsupported_protocol_version";
      requested: string;
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

function isPlainMcpHeaderValue(value: string): boolean {
  if (value.length === 0) {
    return false;
  }

  const firstCode = value.charCodeAt(0);
  const lastCode = value.charCodeAt(value.length - 1);
  if (firstCode < 0x21 || firstCode > 0x7e || lastCode < 0x21 || lastCode > 0x7e) {
    return false;
  }

  for (let index = 1; index < value.length - 1; index += 1) {
    const code = value.charCodeAt(index);
    if (code !== 0x09 && (code < 0x20 || code > 0x7e)) {
      return false;
    }
  }

  return true;
}

function decodeMcpHeaderValue(value: string): ValidationResult<string> {
  const base64Prefix = "=?base64?";
  const base64Suffix = "?=";
  const hasEncodedShape = value.startsWith(base64Prefix) && value.endsWith(base64Suffix);
  if (!hasEncodedShape) {
    if (!isPlainMcpHeaderValue(value)) {
      return { ok: false, status: 400, error: "Plain header value is malformed." };
    }
    return { ok: true, value };
  }
  const encoded = value.slice(base64Prefix.length, -base64Suffix.length);
  if (
    encoded.length === 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)
  ) {
    return { ok: false, status: 400, error: "Base64 header value is malformed." };
  }

  try {
    const binary = atob(encoded);
    if (btoa(binary) !== encoded) {
      return { ok: false, status: 400, error: "Base64 header value is malformed." };
    }
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return {
      ok: true,
      value: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    };
  } catch {
    return { ok: false, status: 400, error: "Base64 header value is malformed." };
  }
}

function invalidMcpParams(error: string): McpHttpRequestValidationResult {
  return { ok: false, kind: "invalid_params", error };
}

function mcpHeaderMismatch(error: string): McpHttpRequestValidationResult {
  return { ok: false, kind: "header_mismatch", error };
}

function readMcpNameSourceField(method: string): "name" | "uri" | null {
  if (method === "tools/call" || method === "prompts/get") {
    return "name";
  }
  if (method === "resources/read") {
    return "uri";
  }
  return null;
}

export function validateMcpHttpRequest(
  rpcRequest: JsonRpcRequestPayload,
  headers: Headers,
): McpHttpRequestValidationResult {
  const protocolVersionHeader = headers.get("MCP-Protocol-Version");
  if (!protocolVersionHeader) {
    return mcpHeaderMismatch("MCP-Protocol-Version header is required.");
  }
  if (!isPlainMcpHeaderValue(protocolVersionHeader)) {
    return mcpHeaderMismatch("MCP-Protocol-Version header is malformed.");
  }

  const methodHeader = headers.get("Mcp-Method");
  if (!methodHeader) {
    return mcpHeaderMismatch("Mcp-Method header is required.");
  }
  if (!isPlainMcpHeaderValue(methodHeader)) {
    return mcpHeaderMismatch("Mcp-Method header is malformed.");
  }

  const nameSourceField = readMcpNameSourceField(rpcRequest.method);
  const nameHeader = headers.get("Mcp-Name");
  if (nameSourceField && !nameHeader) {
    return mcpHeaderMismatch(`Mcp-Name header is required for ${rpcRequest.method}.`);
  }

  if (!isRecord(rpcRequest.params)) {
    return invalidMcpParams("params must be an object with per-request metadata.");
  }
  const metadata = rpcRequest.params["_meta"];
  if (!isRecord(metadata)) {
    return invalidMcpParams("params._meta must be an object.");
  }

  const protocolVersion = metadata["io.modelcontextprotocol/protocolVersion"];
  if (typeof protocolVersion !== "string" || protocolVersion.length === 0) {
    return invalidMcpParams(
      "params._meta.io.modelcontextprotocol/protocolVersion must be a non-empty string.",
    );
  }

  const clientCapabilities = metadata["io.modelcontextprotocol/clientCapabilities"];
  if (!isRecord(clientCapabilities)) {
    return invalidMcpParams(
      "params._meta.io.modelcontextprotocol/clientCapabilities must be an object.",
    );
  }

  const clientInfo = metadata["io.modelcontextprotocol/clientInfo"];
  if (clientInfo !== undefined) {
    if (!isRecord(clientInfo)) {
      return invalidMcpParams(
        "params._meta.io.modelcontextprotocol/clientInfo must be an object when provided.",
      );
    }
    if (
      typeof clientInfo["name"] !== "string" ||
      clientInfo["name"].length === 0 ||
      typeof clientInfo["version"] !== "string" ||
      clientInfo["version"].length === 0
    ) {
      return invalidMcpParams(
        "params._meta.io.modelcontextprotocol/clientInfo must include name and version.",
      );
    }
  }

  if (protocolVersionHeader !== protocolVersion) {
    return mcpHeaderMismatch(
      `MCP-Protocol-Version header value '${protocolVersionHeader}' does not match body value '${protocolVersion}'.`,
    );
  }
  if (protocolVersion !== MCP_PROTOCOL_VERSION) {
    return {
      ok: false,
      kind: "unsupported_protocol_version",
      requested: protocolVersion,
    };
  }

  if (methodHeader !== rpcRequest.method) {
    return mcpHeaderMismatch(
      `Mcp-Method header value '${methodHeader}' does not match body value '${rpcRequest.method}'.`,
    );
  }

  if (nameSourceField) {
    const sourceValue = rpcRequest.params[nameSourceField];
    if (typeof sourceValue !== "string" || sourceValue.length === 0) {
      return invalidMcpParams(
        `${rpcRequest.method} params.${nameSourceField} must be a non-empty string.`,
      );
    }
    const decodedNameHeader = decodeMcpHeaderValue(nameHeader ?? "");
    if (!decodedNameHeader.ok) {
      return mcpHeaderMismatch("Mcp-Name header is malformed.");
    }
    if (decodedNameHeader.value !== sourceValue) {
      return mcpHeaderMismatch(
        `Mcp-Name header value '${decodedNameHeader.value}' does not match body value '${sourceValue}'.`,
      );
    }
  }

  if (
    rpcRequest.method === "tools/call" &&
    rpcRequest.params["arguments"] !== undefined &&
    !isRecord(rpcRequest.params["arguments"])
  ) {
    return invalidMcpParams("tools/call params.arguments must be an object when provided.");
  }

  if (rpcRequest.method === "tools/list" && rpcRequest.params["cursor"] !== undefined) {
    if (typeof rpcRequest.params["cursor"] !== "string") {
      return invalidMcpParams("tools/list params.cursor must be a string when provided.");
    }
    return invalidMcpParams("tools/list params.cursor is not supported and must be omitted.");
  }

  return { ok: true };
}
