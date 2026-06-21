import { describe, expect, it } from "vite-plus/test";

import {
  buildCloudflareMcpAuthorizeUrl,
  CLOUDFLARE_MCP_OAUTH_SCOPES,
  formatCloudflareOAuthEndpointError,
} from "./cloudflareMcpOAuth";

describe("buildCloudflareMcpAuthorizeUrl", () => {
  it("requests the Cloudflare MCP scopes needed for Samebase provisioning", () => {
    const url = new URL(
      buildCloudflareMcpAuthorizeUrl({
        clientId: "client-id",
        redirectUri: "https://samebase.com/api/auth/cloudflare/callback",
        state: "state-token",
        codeChallenge: "code-challenge",
      }),
    );

    expect(`${url.origin}${url.pathname}`).toBe("https://mcp.cloudflare.com/authorize");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://samebase.com/api/auth/cloudflare/callback",
    );
    expect(url.searchParams.get("state")).toBe("state-token");
    expect(url.searchParams.get("code_challenge")).toBe("code-challenge");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("scope")).toBe(CLOUDFLARE_MCP_OAUTH_SCOPES.join(" "));
  });

  it("keeps the Cloudflare MCP grant narrower than full Workers platform access", () => {
    expect(CLOUDFLARE_MCP_OAUTH_SCOPES).toEqual([
      "user:read",
      "account:read",
      "offline_access",
      "workers:read",
      "workers:write",
      "workers_scripts:write",
      "workers_builds:read",
      "workers_builds:write",
    ]);
    expect(CLOUDFLARE_MCP_OAUTH_SCOPES).not.toContain("workers_kv:write");
    expect(CLOUDFLARE_MCP_OAUTH_SCOPES).not.toContain("workers_routes:write");
    expect(CLOUDFLARE_MCP_OAUTH_SCOPES).not.toContain("r2_catalog:write");
    expect(CLOUDFLARE_MCP_OAUTH_SCOPES).not.toContain("pages:write");
    expect(CLOUDFLARE_MCP_OAUTH_SCOPES).not.toContain("d1:write");
  });
});

describe("formatCloudflareOAuthEndpointError", () => {
  it("formats Cloudflare OAuth error fields", () => {
    expect(
      formatCloudflareOAuthEndpointError({
        error: "invalid_grant",
        error_description: "authorization code is invalid",
      }),
    ).toBe("invalid_grant: authorization code is invalid");
  });

  it("redacts OAuth-bearing values from endpoint details", () => {
    expect(
      formatCloudflareOAuthEndpointError({
        error: "invalid_request",
        error_description:
          "redirect_uri includes ?code=abcdefghijklmnopqrstuvwxyz1234567890&state=abcdefghijklmnopqrstuvwxyz1234567890",
      }),
    ).toBe("invalid_request: redirect_uri includes ?code=<redacted>&state=<redacted>");
  });

  it("redacts leading OAuth-bearing values from endpoint details", () => {
    expect(
      formatCloudflareOAuthEndpointError({
        error_description: "code=short-code-value&state=short-state-value failed",
      }),
    ).toBe("code=<redacted>&state=<redacted> failed");
  });
});
