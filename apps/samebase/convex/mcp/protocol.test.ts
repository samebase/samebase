import { describe, expect, it } from "vite-plus/test";
import {
  buildMcpAuthorizationServerMetadata,
  buildMcpProtectedResourceMetadata,
  MCP_PROTOCOL_VERSION,
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

describe("buildMcpProtectedResourceMetadata", () => {
  it("returns canonical same-origin metadata for /mcp", () => {
    const metadata = buildMcpProtectedResourceMetadata("https://samebase.com/");

    expect(metadata.resource).toBe("https://samebase.com/mcp");
    expect(metadata.authorization_servers).toEqual(["https://samebase.com"]);
    expect(metadata.bearer_methods_supported).toEqual(["header"]);
    expect(metadata.scopes_supported).toEqual([
      "access_dashboard",
      "access_provider_connections",
      "access_app_create",
      "access_repo_connect",
      "access_feedback_submit",
      "access_browser_login_handoff",
    ]);
  });
});

describe("buildMcpAuthorizationServerMetadata", () => {
  it("returns oauth metadata endpoints for v1", () => {
    const metadata = buildMcpAuthorizationServerMetadata("https://samebase.com");

    expect(metadata.issuer).toBe("https://samebase.com");
    expect(metadata.authorization_endpoint).toBe("https://samebase.com/oauth/mcp/authorize");
    expect(metadata.registration_endpoint).toBe("https://samebase.com/oauth/mcp/register");
    expect(metadata.authorization_response_iss_parameter_supported).toBe(true);
    expect(metadata.token_endpoint_auth_methods_supported).toEqual(["none"]);
    expect(metadata.code_challenge_methods_supported).toEqual(["S256"]);
  });
});

describe("validateDynamicClientRegistrationPayload", () => {
  it("accepts a valid v1 public-client payload", () => {
    const result = validateDynamicClientRegistrationPayload({
      client_name: "Samebase Manual Test",
      redirect_uris: ["https://example.com/callback"],
      contacts: ["founders@samebase.com"],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tokenEndpointAuthMethod).toBe("none");
      expect(result.value.redirectUris).toHaveLength(1);
      expect(result.value.contacts).toEqual(["founders@samebase.com"]);
    }
  });

  it("accepts loopback http redirect_uris when development mode is explicitly enabled", () => {
    const result = validateDynamicClientRegistrationPayload(
      {
        redirect_uris: ["http://localhost:5174/callback"],
      },
      { allowLoopbackHttpRedirectUris: true },
    );

    expect(result.ok).toBe(true);
  });

  it("rejects unsupported token endpoint auth methods", () => {
    const result = validateDynamicClientRegistrationPayload({
      redirect_uris: ["https://example.com/callback"],
      token_endpoint_auth_method: "client_secret_post",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('token_endpoint_auth_method must be "none"');
    }
  });

  it("rejects non-string token endpoint auth method values", () => {
    const result = validateDynamicClientRegistrationPayload({
      redirect_uris: ["https://example.com/callback"],
      token_endpoint_auth_method: 123,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('token_endpoint_auth_method must be "none"');
    }
  });

  it("rejects insecure redirect uris outside loopback exceptions", () => {
    const result = validateDynamicClientRegistrationPayload({
      redirect_uris: ["http://example.com/callback"],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("redirect_uris");
    }
  });

  it("rejects redirect URIs with fragments", () => {
    const result = validateDynamicClientRegistrationPayload({
      redirect_uris: ["https://example.com/callback#fragment"],
    });

    expect(result.ok).toBe(false);
  });

  it("rejects loopback http redirect_uris when development mode is disabled", () => {
    const result = validateDynamicClientRegistrationPayload({
      redirect_uris: ["http://localhost:5174/callback"],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("redirect_uris");
    }
  });
});

describe("validateAuthorizeRequestFromUrl", () => {
  it("accepts valid authorization request params", () => {
    const url = new URL("https://samebase.com/oauth/mcp/authorize");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", "client_123");
    url.searchParams.set("redirect_uri", "https://example.com/callback");
    url.searchParams.set("resource", "https://samebase.com/mcp");
    url.searchParams.set("scope", "access_app_create");
    url.searchParams.set("state", "state_abc");
    url.searchParams.set("code_challenge", "0123456789012345678901234567890123456789012");
    url.searchParams.set("code_challenge_method", "S256");

    const result = validateAuthorizeRequestFromUrl(url);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.clientId).toBe("client_123");
      expect(result.value.scopes).toEqual(["access_app_create"]);
      expect(result.value.codeChallengeMethod).toBe("S256");
    }
  });

  it("accepts OpenAI Platform relay state values longer than 500 characters", () => {
    const url = new URL("https://samebase.com/oauth/mcp/authorize");
    const relayPrefix = "openai_platform_oauth_relay__";
    const state = `${relayPrefix}${"a".repeat(525 - relayPrefix.length)}`;
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", "client_123");
    url.searchParams.set("redirect_uri", "https://chatgpt.com/connector/oauth/callback");
    url.searchParams.set("resource", "https://samebase.com/mcp");
    url.searchParams.set("scope", "access_app_create access_dashboard");
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", "0123456789012345678901234567890123456789012");
    url.searchParams.set("code_challenge_method", "S256");

    const result = validateAuthorizeRequestFromUrl(url);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.state).toBe(state);
    }
  });

  it("accepts multiple supported scopes", () => {
    const url = new URL("https://samebase.com/oauth/mcp/authorize");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", "client_123");
    url.searchParams.set("redirect_uri", "https://example.com/callback");
    url.searchParams.set("resource", "https://samebase.com/mcp");
    url.searchParams.set("scope", "ACCESS_APP_CREATE access_dashboard");
    url.searchParams.set("code_challenge", "0123456789012345678901234567890123456789012");
    url.searchParams.set("code_challenge_method", "S256");

    const result = validateAuthorizeRequestFromUrl(url);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.scopes).toEqual(["access_app_create", "access_dashboard"]);
    }
  });

  it("rejects a missing resource", () => {
    const url = new URL("https://samebase.com/oauth/mcp/authorize");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", "client_123");
    url.searchParams.set("redirect_uri", "https://example.com/callback");
    url.searchParams.set("scope", "access_app_create");
    url.searchParams.set("code_challenge", "0123456789012345678901234567890123456789012");
    url.searchParams.set("code_challenge_method", "S256");

    const result = validateAuthorizeRequestFromUrl(url);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("resource is required.");
    }
  });

  it("rejects a blank resource", () => {
    const url = new URL("https://samebase.com/oauth/mcp/authorize");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", "client_123");
    url.searchParams.set("redirect_uri", "https://example.com/callback");
    url.searchParams.set("resource", "   ");
    url.searchParams.set("scope", "access_app_create");
    url.searchParams.set("code_challenge", "0123456789012345678901234567890123456789012");
    url.searchParams.set("code_challenge_method", "S256");

    const result = validateAuthorizeRequestFromUrl(url);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("resource is required.");
    }
  });
  it("defaults missing scope to the published plugin surface", () => {
    const url = new URL("https://samebase.com/oauth/mcp/authorize");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", "client_123");
    url.searchParams.set("redirect_uri", "https://example.com/callback");
    url.searchParams.set("resource", "https://samebase.com/mcp");
    url.searchParams.set("code_challenge", "0123456789012345678901234567890123456789012");
    url.searchParams.set("code_challenge_method", "S256");

    const result = validateAuthorizeRequestFromUrl(url);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.scopes).toEqual([
        "access_app_create",
        "access_dashboard",
        "access_feedback_submit",
      ]);
    }
  });

  it("defaults blank scope to the published plugin surface", () => {
    const url = new URL("https://samebase.com/oauth/mcp/authorize");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", "client_123");
    url.searchParams.set("redirect_uri", "https://example.com/callback");
    url.searchParams.set("resource", "https://samebase.com/mcp");
    url.searchParams.set("scope", "   ");
    url.searchParams.set("code_challenge", "0123456789012345678901234567890123456789012");
    url.searchParams.set("code_challenge_method", "S256");

    const result = validateAuthorizeRequestFromUrl(url);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.scopes).toEqual([
        "access_app_create",
        "access_dashboard",
        "access_feedback_submit",
      ]);
    }
  });
  it("rejects unsupported scopes", () => {
    const url = new URL("https://samebase.com/oauth/mcp/authorize");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", "client_123");
    url.searchParams.set("redirect_uri", "https://example.com/callback");
    url.searchParams.set("resource", "https://samebase.com/mcp");
    url.searchParams.set("scope", "admin");
    url.searchParams.set("code_challenge", "0123456789012345678901234567890123456789012");
    url.searchParams.set("code_challenge_method", "S256");

    const result = validateAuthorizeRequestFromUrl(url);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Unsupported scope");
    }
  });

  it("rejects loopback redirect_uri when development mode is disabled", () => {
    const url = new URL("https://samebase.com/oauth/mcp/authorize");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", "client_123");
    url.searchParams.set("redirect_uri", "http://localhost:5174/callback");
    url.searchParams.set("resource", "https://samebase.com/mcp");
    url.searchParams.set("scope", "access_app_create");
    url.searchParams.set("code_challenge", "0123456789012345678901234567890123456789012");
    url.searchParams.set("code_challenge_method", "S256");

    const result = validateAuthorizeRequestFromUrl(url);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("redirect_uri");
    }
  });

  it("accepts loopback redirect_uri when development mode is enabled", () => {
    const url = new URL("https://samebase.com/oauth/mcp/authorize");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", "client_123");
    url.searchParams.set("redirect_uri", "http://localhost:5174/callback");
    url.searchParams.set("resource", "https://samebase.com/mcp");
    url.searchParams.set("scope", "access_app_create");
    url.searchParams.set("code_challenge", "0123456789012345678901234567890123456789012");
    url.searchParams.set("code_challenge_method", "S256");

    const result = validateAuthorizeRequestFromUrl(url, {
      allowLoopbackHttpRedirectUris: true,
    });
    expect(result.ok).toBe(true);
  });
});

describe("validateTokenRequestFromSearchParams", () => {
  it("accepts authorization_code grant with PKCE verifier", () => {
    const params = new URLSearchParams({
      grant_type: "authorization_code",
      code: "mcpac_example",
      client_id: "client_123",
      redirect_uri: "https://example.com/callback",
      code_verifier: "0123456789012345678901234567890123456789012345678901234567890123",
      resource: "https://samebase.com/mcp",
    });

    const result = validateTokenRequestFromSearchParams(params);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.grantType).toBe("authorization_code");
      expect(result.value.resource).toBe("https://samebase.com/mcp");
      if (result.value.grantType === "authorization_code") {
        expect(result.value.clientId).toBe("client_123");
        expect(result.value.redirectUri).toBe("https://example.com/callback");
      }
    }
  });

  it("accepts refresh_token grant", () => {
    const params = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: "mcprt_example",
      client_id: "client_123",
      resource: "https://samebase.com/mcp",
    });

    const result = validateTokenRequestFromSearchParams(params);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.grantType).toBe("refresh_token");
      expect(result.value.resource).toBe("https://samebase.com/mcp");
      if (result.value.grantType === "refresh_token") {
        expect(result.value.refreshToken).toBe("mcprt_example");
      }
    }
  });

  it("rejects unsupported grant_type values", () => {
    const params = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: "client_123",
      resource: "https://samebase.com/mcp",
    });

    const result = validateTokenRequestFromSearchParams(params);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("grant_type");
    }
  });

  it("rejects loopback redirect_uri when development mode is disabled", () => {
    const params = new URLSearchParams({
      grant_type: "authorization_code",
      code: "mcpac_example",
      client_id: "client_123",
      redirect_uri: "http://localhost:5174/callback",
      code_verifier: "0123456789012345678901234567890123456789012345678901234567890123",
      resource: "https://samebase.com/mcp",
    });

    const result = validateTokenRequestFromSearchParams(params);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("redirect_uri");
    }
  });

  it("accepts loopback redirect_uri when development mode is enabled", () => {
    const params = new URLSearchParams({
      grant_type: "authorization_code",
      code: "mcpac_example",
      client_id: "client_123",
      redirect_uri: "http://localhost:5174/callback",
      code_verifier: "0123456789012345678901234567890123456789012345678901234567890123",
      resource: "https://samebase.com/mcp",
    });

    const result = validateTokenRequestFromSearchParams(params, {
      allowLoopbackHttpRedirectUris: true,
    });
    expect(result.ok).toBe(true);
  });

  it("rejects a missing resource", () => {
    const result = validateTokenRequestFromSearchParams(
      // eslint-disable-next-line no-restricted-globals -- This test exercises an OAuth form boundary.
      new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: "mcprt_example",
        client_id: "client_123",
      }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("resource is required.");
    }
  });

  it("rejects a resource URI with a fragment", () => {
    const result = validateTokenRequestFromSearchParams(
      // eslint-disable-next-line no-restricted-globals -- This test exercises an OAuth form boundary.
      new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: "mcprt_example",
        client_id: "client_123",
        resource: "https://samebase.com/mcp#fragment",
      }),
    );

    expect(result.ok).toBe(false);
  });
});

describe("redirectUriMatchesRegistered", () => {
  it("requires an exact registered redirect URI", () => {
    expect(
      redirectUriMatchesRegistered({
        requestedRedirectUri: "https://example.com/callback",
        registeredRedirectUris: ["https://example.com/callback"],
      }),
    ).toBe(true);
    expect(
      redirectUriMatchesRegistered({
        requestedRedirectUri: "https://example.com:443/callback",
        registeredRedirectUris: ["https://example.com/callback"],
      }),
    ).toBe(false);
    expect(
      redirectUriMatchesRegistered({
        requestedRedirectUri: " https://example.com/callback ",
        registeredRedirectUris: ["https://example.com/callback"],
      }),
    ).toBe(false);
  });
});

describe("readBearerTokenFromAuthorizationHeader", () => {
  it("extracts bearer token", () => {
    const result = readBearerTokenFromAuthorizationHeader("Bearer mcpat_example");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe("mcpat_example");
    }
  });

  it("accepts lowercase bearer scheme", () => {
    const result = readBearerTokenFromAuthorizationHeader("bearer mcpat_example");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe("mcpat_example");
    }
  });

  it("accepts mixed-case bearer scheme", () => {
    const result = readBearerTokenFromAuthorizationHeader("BeArEr mcpat_example");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe("mcpat_example");
    }
  });

  it("rejects missing bearer token", () => {
    const result = readBearerTokenFromAuthorizationHeader(null);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Authorization");
    }
  });
});

describe("validateJsonRpcRequestPayload", () => {
  it("accepts a valid JSON-RPC request envelope", () => {
    const result = validateJsonRpcRequestPayload({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {},
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.method).toBe("tools/list");
      expect(result.value.id).toBe(1);
    }
  });

  it('rejects non-"2.0" JSON-RPC version', () => {
    const result = validateJsonRpcRequestPayload({
      jsonrpc: "1.0",
      id: 1,
      method: "tools/list",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("jsonrpc");
      expect(result.id).toBe(1);
    }
  });

  it("keeps id undefined when omitted (notification shape)", () => {
    const result = validateJsonRpcRequestPayload({
      jsonrpc: "2.0",
      method: "tools/list",
      params: {},
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.id).toBeUndefined();
    }
  });

  it("rejects non-scalar JSON-RPC ids", () => {
    const result = validateJsonRpcRequestPayload({
      jsonrpc: "2.0",
      id: { nested: "not-valid" },
      method: "tools/list",
      params: {},
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("id");
      expect(result.id).toBeUndefined();
    }
  });

  it("rejects fractional numeric JSON-RPC ids", () => {
    const result = validateJsonRpcRequestPayload({
      jsonrpc: "2.0",
      id: 1.5,
      method: "tools/list",
      params: {},
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("integer");
      expect(result.id).toBeUndefined();
    }
  });
});

describe("validateMcpRequestParams", () => {
  function request(method: string, params?: unknown) {
    const result = validateJsonRpcRequestPayload({
      jsonrpc: "2.0",
      id: 1,
      method,
      ...(params !== undefined ? { params } : {}),
    });
    if (!result.ok) {
      throw new Error(result.error);
    }
    return result.value;
  }

  it("accepts legacy requests without 2026 headers or metadata", () => {
    expect(validateMcpRequestParams(request("tools/list"))).toEqual({ ok: true });
    expect(
      validateMcpRequestParams(
        request("initialize", {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: { elicitation: {} },
          clientInfo: {
            name: "codex-mcp-client",
            title: "Codex",
            version: "0.53.0",
          },
        }),
      ),
    ).toEqual({ ok: true });
  });

  it("accepts omitted or object ping params", () => {
    expect(validateMcpRequestParams(request("ping"))).toEqual({ ok: true });
    expect(validateMcpRequestParams(request("ping", {}))).toEqual({ ok: true });
  });

  it("rejects malformed ping params", () => {
    for (const params of [null, [], "invalid", 1]) {
      expect(validateMcpRequestParams(request("ping", params))).toEqual({
        ok: false,
        kind: "invalid_params",
        error: "ping params must be an object when provided.",
      });
    }
  });

  it("rejects malformed initialize params", () => {
    const validClientInfo = { name: "codex-mcp-client", version: "0.53.0" };
    const cases = [
      undefined,
      null,
      { protocolVersion: "", capabilities: {}, clientInfo: validClientInfo },
      {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: [],
        clientInfo: validClientInfo,
      },
      {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "codex-mcp-client", version: "" },
      },
    ];

    for (const params of cases) {
      expect(validateMcpRequestParams(request("initialize", params))).toMatchObject({
        ok: false,
        kind: "invalid_params",
      });
    }
  });

  it("rejects every supplied tools/list cursor", () => {
    expect(validateMcpRequestParams(request("tools/list", { cursor: 123 }))).toMatchObject({
      ok: false,
      kind: "invalid_params",
      error: expect.stringContaining("must be a string"),
    });
    expect(validateMcpRequestParams(request("tools/list", { cursor: "next-page" }))).toMatchObject({
      ok: false,
      kind: "invalid_params",
      error: expect.stringContaining("must be omitted"),
    });
  });
});

describe("validateMcpProtocolVersionHeader", () => {
  it("accepts only the 2025-06-18 protocol version", () => {
    expect(
      validateMcpProtocolVersionHeader(
        new Headers({ "MCP-Protocol-Version": MCP_PROTOCOL_VERSION }),
      ),
    ).toEqual({ ok: true });
    expect(validateMcpProtocolVersionHeader(new Headers())).toEqual({
      ok: false,
      kind: "missing",
    });
    expect(
      validateMcpProtocolVersionHeader(new Headers({ "MCP-Protocol-Version": "2025-03-26" })),
    ).toEqual({
      ok: false,
      kind: "unsupported",
      requested: "2025-03-26",
    });
  });
});

describe("parseMcpToolCallParams", () => {
  it("returns one validated tool-call shape", () => {
    expect(parseMcpToolCallParams({ name: "tool" })).toEqual({
      ok: true,
      value: { name: "tool", arguments: {} },
    });
    expect(parseMcpToolCallParams({ name: "", arguments: {} })).toMatchObject({
      ok: false,
      error: expect.stringContaining("non-empty"),
    });
    expect(parseMcpToolCallParams({ name: "tool", arguments: "invalid" })).toMatchObject({
      ok: false,
      error: expect.stringContaining("arguments"),
    });
    expect(parseMcpToolCallParams(undefined)).toMatchObject({
      ok: false,
      error: expect.stringContaining("object"),
    });
  });
});
