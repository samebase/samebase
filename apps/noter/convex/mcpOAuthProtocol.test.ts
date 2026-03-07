import { describe, expect, it } from "vitest";
import {
  buildMcpAuthorizationServerMetadata,
  buildMcpProtectedResourceMetadata,
  validateAuthorizeRequestFromUrl,
  validateDynamicClientRegistrationPayload,
} from "./mcpOAuthProtocol";

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
      redirect_uris: [
        "https://example.com/callback",
        "http://localhost:5174/callback",
      ],
      contacts: ["founders@noter.md"],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tokenEndpointAuthMethod).toBe("none");
      expect(result.value.redirectUris).toHaveLength(2);
      expect(result.value.contacts).toEqual(["founders@noter.md"]);
    }
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
});
