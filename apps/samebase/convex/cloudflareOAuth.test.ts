import { describe, expect, it } from "vite-plus/test";

import {
  CLOUDFLARE_OAUTH_SCOPES,
  buildCloudflareOAuthAuthorizeSearchParams,
  buildCloudflareOAuthAuthorizeUrl,
} from "./cloudflareOAuth";

describe("buildCloudflareOAuthAuthorizeSearchParams", () => {
  it("builds standard Cloudflare OAuth app authorize params", () => {
    expect(
      buildCloudflareOAuthAuthorizeSearchParams({
        clientId: "client-id",
        redirectUri: "https://samebase.com/oauth/cloudflare/callback",
        state: "state-token",
      }),
    ).toEqual({
      response_type: "code",
      client_id: "client-id",
      redirect_uri: "https://samebase.com/oauth/cloudflare/callback",
      scope: CLOUDFLARE_OAUTH_SCOPES.join(" "),
      state: "state-token",
    });
  });

  it("requests offline access so Cloudflare returns a refresh token", () => {
    expect(CLOUDFLARE_OAUTH_SCOPES).toContain("offline_access");
  });
});

describe("buildCloudflareOAuthAuthorizeUrl", () => {
  it("uses the dashboard OAuth endpoint with the standard app scopes", () => {
    const url = new URL(
      buildCloudflareOAuthAuthorizeUrl({
        clientId: "client-id",
        redirectUri: "https://samebase.com/oauth/cloudflare/callback",
        state: "state-token",
      }),
    );

    expect(`${url.origin}${url.pathname}`).toBe("https://dash.cloudflare.com/oauth2/auth");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://samebase.com/oauth/cloudflare/callback",
    );
    expect(url.searchParams.get("state")).toBe("state-token");
    expect(url.searchParams.get("scope")).toBe(CLOUDFLARE_OAUTH_SCOPES.join(" "));
    expect(url.searchParams.has("code_challenge")).toBe(false);
    expect(url.searchParams.has("code_challenge_method")).toBe(false);
  });
});
