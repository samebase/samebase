import { describe, expect, it } from "vite-plus/test";

import {
  formatCloudflareOAuthEndpointError,
  resolveCloudflareMcpRefreshClient,
} from "./cloudflareMcpOAuth";

describe("resolveCloudflareMcpRefreshClient", () => {
  it("uses the persisted Cloudflare OAuth client id for refresh", () => {
    expect(
      resolveCloudflareMcpRefreshClient({
        clientId: " 4L50pCGEnfQ9zea4 ",
      }),
    ).toEqual({
      clientId: "4L50pCGEnfQ9zea4",
      source: "stored_auth",
    });
  });

  it("treats legacy connections without stored client metadata as reconnect-required", () => {
    expect(
      resolveCloudflareMcpRefreshClient({
        clientId: undefined,
      }),
    ).toEqual({
      clientId: null,
      source: "missing",
    });
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
    ).toBe(
      "invalid_request: redirect_uri includes ?code=<redacted>&state=<redacted>",
    );
  });
});
