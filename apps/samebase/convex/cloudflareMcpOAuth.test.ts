import { describe, expect, it } from "vite-plus/test";

import { formatCloudflareOAuthEndpointError } from "./cloudflareMcpOAuth";

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
