import { describe, expect, it } from "vitest";
import {
  buildMcpAuthorizationServerMetadata,
  buildMcpProtectedResourceMetadata,
  readBearerTokenFromAuthorizationHeader,
  validateAuthorizeRequestFromUrl,
  validateDynamicClientRegistrationPayload,
  validateJsonRpcRequestPayload,
  validateTokenRequestFromSearchParams,
} from "./protocol";

describe("buildMcpProtectedResourceMetadata", () => {
  it("returns canonical same-origin metadata for /mcp", () => {
    const metadata = buildMcpProtectedResourceMetadata("https://noter.md/");

    expect(metadata.resource).toBe("https://noter.md/mcp");
    expect(metadata.authorization_servers).toEqual(["https://noter.md"]);
    expect(metadata.bearer_methods_supported).toEqual(["header"]);
    expect(metadata.scopes_supported).toContain("vaults.read");
  });
});

describe("buildMcpAuthorizationServerMetadata", () => {
  it("returns oauth metadata endpoints for v1", () => {
    const metadata = buildMcpAuthorizationServerMetadata("https://noter.md");

    expect(metadata.issuer).toBe("https://noter.md");
    expect(metadata.authorization_endpoint).toBe(
      "https://noter.md/oauth/mcp/authorize",
    );
    expect(metadata.registration_endpoint).toBe(
      "https://noter.md/oauth/mcp/register",
    );
    expect(metadata.token_endpoint_auth_methods_supported).toEqual(["none"]);
    expect(metadata.code_challenge_methods_supported).toEqual(["S256"]);
  });
});

describe("validateDynamicClientRegistrationPayload", () => {
  it("accepts a valid v1 public-client payload", () => {
    const result = validateDynamicClientRegistrationPayload({
      client_name: "Noter Manual Test",
      redirect_uris: ["https://example.com/callback"],
      contacts: ["founders@noter.md"],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tokenEndpointAuthMethod).toBe("none");
      expect(result.value.redirectUris).toHaveLength(1);
      expect(result.value.contacts).toEqual(["founders@noter.md"]);
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
      expect(result.error).toContain(
        'token_endpoint_auth_method must be "none"',
      );
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
    const url = new URL("https://noter.md/oauth/mcp/authorize");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", "client_123");
    url.searchParams.set("redirect_uri", "https://example.com/callback");
    url.searchParams.set("resource", "https://noter.md/mcp");
    url.searchParams.set("scope", "vaults.read files.read");
    url.searchParams.set("state", "state_abc");
    url.searchParams.set(
      "code_challenge",
      "0123456789012345678901234567890123456789012",
    );
    url.searchParams.set("code_challenge_method", "S256");

    const result = validateAuthorizeRequestFromUrl(url);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.clientId).toBe("client_123");
      expect(result.value.scopes).toEqual(["vaults.read", "files.read"]);
      expect(result.value.codeChallengeMethod).toBe("S256");
    }
  });

  it("rejects unsupported scopes", () => {
    const url = new URL("https://noter.md/oauth/mcp/authorize");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", "client_123");
    url.searchParams.set("redirect_uri", "https://example.com/callback");
    url.searchParams.set("resource", "https://noter.md/mcp");
    url.searchParams.set("scope", "admin");
    url.searchParams.set(
      "code_challenge",
      "0123456789012345678901234567890123456789012",
    );
    url.searchParams.set("code_challenge_method", "S256");

    const result = validateAuthorizeRequestFromUrl(url);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Unsupported scope");
    }
  });

  it("rejects loopback redirect_uri when development mode is disabled", () => {
    const url = new URL("https://noter.md/oauth/mcp/authorize");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", "client_123");
    url.searchParams.set("redirect_uri", "http://localhost:5174/callback");
    url.searchParams.set("resource", "https://noter.md/mcp");
    url.searchParams.set("scope", "vaults.read");
    url.searchParams.set(
      "code_challenge",
      "0123456789012345678901234567890123456789012",
    );
    url.searchParams.set("code_challenge_method", "S256");

    const result = validateAuthorizeRequestFromUrl(url);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("redirect_uri");
    }
  });

  it("accepts loopback redirect_uri when development mode is enabled", () => {
    const url = new URL("https://noter.md/oauth/mcp/authorize");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", "client_123");
    url.searchParams.set("redirect_uri", "http://localhost:5174/callback");
    url.searchParams.set("resource", "https://noter.md/mcp");
    url.searchParams.set("scope", "vaults.read");
    url.searchParams.set(
      "code_challenge",
      "0123456789012345678901234567890123456789012",
    );
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
      code_verifier:
        "0123456789012345678901234567890123456789012345678901234567890123",
    });

    const result = validateTokenRequestFromSearchParams(params);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.grantType).toBe("authorization_code");
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
    });

    const result = validateTokenRequestFromSearchParams(params);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.grantType).toBe("refresh_token");
      if (result.value.grantType === "refresh_token") {
        expect(result.value.refreshToken).toBe("mcprt_example");
      }
    }
  });

  it("rejects unsupported grant_type values", () => {
    const params = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: "client_123",
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
      code_verifier:
        "0123456789012345678901234567890123456789012345678901234567890123",
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
      code_verifier:
        "0123456789012345678901234567890123456789012345678901234567890123",
    });

    const result = validateTokenRequestFromSearchParams(params, {
      allowLoopbackHttpRedirectUris: true,
    });
    expect(result.ok).toBe(true);
  });
});

describe("readBearerTokenFromAuthorizationHeader", () => {
  it("extracts bearer token", () => {
    const result = readBearerTokenFromAuthorizationHeader(
      "Bearer mcpat_example",
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe("mcpat_example");
    }
  });

  it("accepts lowercase bearer scheme", () => {
    const result = readBearerTokenFromAuthorizationHeader(
      "bearer mcpat_example",
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe("mcpat_example");
    }
  });

  it("accepts mixed-case bearer scheme", () => {
    const result = readBearerTokenFromAuthorizationHeader(
      "BeArEr mcpat_example",
    );
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
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.method).toBe("initialize");
      expect(result.value.id).toBe(1);
    }
  });

  it('rejects non-"2.0" JSON-RPC version', () => {
    const result = validateJsonRpcRequestPayload({
      jsonrpc: "1.0",
      id: 1,
      method: "initialize",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("jsonrpc");
    }
  });

  it("keeps id undefined when omitted (notification shape)", () => {
    const result = validateJsonRpcRequestPayload({
      jsonrpc: "2.0",
      method: "notifications/initialized",
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
      method: "initialize",
      params: {},
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("id");
    }
  });
});
