import { asRecord } from "../jsonUtils";

const DEFAULT_GRANT_TYPES = ["authorization_code", "refresh_token"] as const;
const DEFAULT_RESPONSE_TYPES = ["code"] as const;
const SUPPORTED_TOKEN_ENDPOINT_AUTH_METHOD = "none";
const CODE_CHALLENGE_METHOD = "S256";

const MAX_REDIRECT_URIS = 8;
const MAX_REDIRECT_URI_LENGTH = 2048;
const MAX_CLIENT_NAME_LENGTH = 120;
const MAX_CONTACTS = 8;
const MAX_CONTACT_LENGTH = 320;
const MAX_STATE_LENGTH = 500;

const codeChallengePattern = /^[A-Za-z0-9\-._~]{43,128}$/;
const codeVerifierPattern = /^[A-Za-z0-9\-._~]{43,128}$/;

export const MCP_V1_SUPPORTED_SCOPES = [
  "vaults.read",
  "files.read",
  "files.write",
  "commits.propose",
  "prod.read.propose",
] as const;
const mcpSupportedScopeSet = new Set<string>(MCP_V1_SUPPORTED_SCOPES);

type McpSupportedScope = (typeof MCP_V1_SUPPORTED_SCOPES)[number];

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
};

type RefreshTokenRequestInput = {
  grantType: "refresh_token";
  clientId: string;
  refreshToken: string;
};

export type TokenRequestInput =
  | AuthorizationCodeTokenRequestInput
  | RefreshTokenRequestInput;

export type JsonRpcRequestPayload = {
  jsonrpc: "2.0";
  method: string;
  id?: string | number | null;
  params: unknown;
};

export type McpProtocolValidationOptions = {
  allowLoopbackHttpRedirectUris?: boolean;
};

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
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function resolveAllowLoopbackHttpRedirectUris(
  options?: McpProtocolValidationOptions,
): boolean {
  return options?.allowLoopbackHttpRedirectUris === true;
}

function normalizeUriForComparison(parsed: URL): string {
  parsed.protocol = parsed.protocol.toLowerCase();
  parsed.hostname = parsed.hostname.toLowerCase();
  if (
    (parsed.protocol === "https:" && parsed.port === "443") ||
    (parsed.protocol === "http:" && parsed.port === "80")
  ) {
    parsed.port = "";
  }
  if (parsed.pathname.length === 0) {
    parsed.pathname = "/";
  }
  return parsed.toString();
}

export function redirectUriMatchesRegistered(args: {
  requestedRedirectUri: string;
  registeredRedirectUris: string[];
  options?: McpProtocolValidationOptions;
}): boolean {
  const allowLoopbackHttpRedirectUris = resolveAllowLoopbackHttpRedirectUris(
    args.options,
  );
  const requested = parseAndValidateUri(args.requestedRedirectUri, {
    forRedirect: true,
    allowLoopbackHttpRedirectUris,
  });
  if (!requested) {
    return false;
  }
  const normalizedRequested = normalizeUriForComparison(requested);
  return args.registeredRedirectUris.some((registeredRedirectUri) => {
    const parsedRegistered = parseAndValidateUri(registeredRedirectUri, {
      forRedirect: true,
      allowLoopbackHttpRedirectUris,
    });
    if (!parsedRegistered) {
      return false;
    }
    return normalizeUriForComparison(parsedRegistered) === normalizedRequested;
  });
}

function readStringArray(
  value: unknown,
  maxItems: number,
  maxLength: number,
): string[] | null {
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
  if (
    grantTypes.length === 0 ||
    grantTypes.length > DEFAULT_GRANT_TYPES.length
  ) {
    return false;
  }
  if (!grantTypes.every((grantType) => allowed.has(grantType))) {
    return false;
  }
  return grantTypes.includes("authorization_code");
}

function validateResponseTypes(responseTypes: string[]): boolean {
  return (
    responseTypes.length === 1 && responseTypes[0] === DEFAULT_RESPONSE_TYPES[0]
  );
}

function normalizeScopeToken(scope: string): string {
  return scope.trim().toLowerCase();
}

function isMcpSupportedScope(value: string): value is McpSupportedScope {
  return mcpSupportedScopeSet.has(value);
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
    response_types_supported: DEFAULT_RESPONSE_TYPES,
    grant_types_supported: DEFAULT_GRANT_TYPES,
    code_challenge_methods_supported: [CODE_CHALLENGE_METHOD],
    token_endpoint_auth_methods_supported: [
      SUPPORTED_TOKEN_ENDPOINT_AUTH_METHOD,
    ],
    scopes_supported: MCP_V1_SUPPORTED_SCOPES,
  };
}

export function validateDynamicClientRegistrationPayload(
  payload: unknown,
  options?: McpProtocolValidationOptions,
): ValidationResult<DynamicClientRegistrationInput> {
  const record = asRecord(payload);
  const allowLoopbackHttpRedirectUris =
    resolveAllowLoopbackHttpRedirectUris(options);

  const clientNameValue = record.client_name;
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
    record.redirect_uris,
    MAX_REDIRECT_URIS,
    MAX_REDIRECT_URI_LENGTH,
  );
  if (redirectUris === null) {
    return {
      ok: false,
      status: 400,
      error:
        "redirect_uris must be a non-empty array of valid redirect URI strings.",
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

  const contacts = readOptionalStringArray(
    record.contacts,
    MAX_CONTACTS,
    MAX_CONTACT_LENGTH,
  );
  if (contacts === null) {
    return {
      ok: false,
      status: 400,
      error: `contacts must contain 1-${MAX_CONTACTS} non-empty strings when provided.`,
    };
  }

  const grantTypes =
    record.grant_types === undefined
      ? [...DEFAULT_GRANT_TYPES]
      : readStringArray(record.grant_types, DEFAULT_GRANT_TYPES.length, 64);
  if (grantTypes === null || !validateGrantTypes(grantTypes)) {
    return {
      ok: false,
      status: 400,
      error:
        "grant_types must contain supported values and include authorization_code.",
    };
  }

  const responseTypes =
    record.response_types === undefined
      ? [...DEFAULT_RESPONSE_TYPES]
      : readStringArray(
          record.response_types,
          DEFAULT_RESPONSE_TYPES.length,
          16,
        );
  if (responseTypes === null || !validateResponseTypes(responseTypes)) {
    return {
      ok: false,
      status: 400,
      error: 'response_types must be exactly ["code"] for v1.',
    };
  }

  const tokenEndpointAuthMethodValue = record.token_endpoint_auth_method;
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
    tokenEndpointAuthMethodValue?.trim() ??
    SUPPORTED_TOKEN_ENDPOINT_AUTH_METHOD;

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
  const allowLoopbackHttpRedirectUris =
    resolveAllowLoopbackHttpRedirectUris(options);
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

  const redirectUriRaw = url.searchParams.get("redirect_uri")?.trim() ?? "";
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

  // Some native MCP clients (including Codex desktop) omit `resource`.
  // Defaulting to same-origin `/mcp` keeps OAuth interop while remaining
  // bounded to this MCP server origin.
  const resourceRaw =
    url.searchParams.get("resource")?.trim() || `${url.origin}/mcp`;
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
  // OAuth allows server-defined defaults, so use the minimum read scope that
  // keeps discovery/tool listing functional instead of failing early.
  const scopeRaw = url.searchParams.get("scope")?.trim() || "vaults.read";
  const scopes = scopeRaw
    .split(" ")
    .map(normalizeScopeToken)
    .filter((scope) => scope.length > 0);

  const supportedScopes: McpSupportedScope[] = [];
  for (const scope of scopes) {
    if (!isMcpSupportedScope(scope)) {
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
  if (!codeChallengePattern.test(codeChallenge)) {
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
      redirectUri: redirectUri.toString(),
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
  const allowLoopbackHttpRedirectUris =
    resolveAllowLoopbackHttpRedirectUris(options);
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

    const redirectUriRaw = params.get("redirect_uri")?.trim() ?? "";
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
    if (!codeVerifierPattern.test(codeVerifier)) {
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
        redirectUri: redirectUri.toString(),
        codeVerifier,
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

export function validateJsonRpcRequestPayload(
  payload: unknown,
): ValidationResult<JsonRpcRequestPayload> {
  const record = asRecord(payload);

  if (record.jsonrpc !== "2.0") {
    return {
      ok: false,
      status: 400,
      error: 'jsonrpc must be "2.0".',
    };
  }

  if (typeof record.method !== "string" || record.method.trim().length === 0) {
    return {
      ok: false,
      status: 400,
      error: "method must be a non-empty string.",
    };
  }

  const idValue = record.id;
  let id: string | number | null | undefined;
  if (idValue === undefined) {
    id = undefined;
  } else if (
    typeof idValue === "string" ||
    typeof idValue === "number" ||
    idValue === null
  ) {
    id = idValue;
  } else {
    return {
      ok: false,
      status: 400,
      error: "id must be a string, number, null, or omitted.",
    };
  }

  return {
    ok: true,
    value: {
      jsonrpc: "2.0",
      method: record.method,
      id,
      params: record.params,
    },
  };
}
