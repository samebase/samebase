import { describe, expect, it } from "vite-plus/test";

import { buildProviderOAuthDefaultReturnUrl } from "./providerOAuthReturn";

describe("buildProviderOAuthDefaultReturnUrl", () => {
  it("returns the organization providers page on the configured app origin", () => {
    expect(
      buildProviderOAuthDefaultReturnUrl({
        configuredAppUrl: "https://samebase.com",
        githubOwnerLogin: "Samebase",
        requestUrl: "https://api.samebase.com/oauth/cloudflare/callback?code=abc",
      }),
    ).toBe("https://samebase.com/org/samebase/providers");
  });

  it("falls back to the callback origin when the app origin is unavailable", () => {
    expect(
      buildProviderOAuthDefaultReturnUrl({
        configuredAppUrl: undefined,
        githubOwnerLogin: "samebase",
        requestUrl: "https://samebase.convex.site/oauth/convex/callback?code=abc",
      }),
    ).toBe("https://samebase.convex.site/org/samebase/providers");
  });

  it("encodes the normalized owner as one path segment", () => {
    expect(
      buildProviderOAuthDefaultReturnUrl({
        configuredAppUrl: "https://samebase.com",
        githubOwnerLogin: " Owner/Name ",
        requestUrl: "https://api.samebase.com/oauth/cloudflare/callback?code=abc",
      }),
    ).toBe("https://samebase.com/org/owner%2Fname/providers");
  });

  it("keeps query and hash values from the exact initiating Providers page", () => {
    expect(
      buildProviderOAuthDefaultReturnUrl({
        configuredAppUrl: "https://samebase.com",
        githubOwnerLogin: "samebase",
        requestUrl: "https://api.samebase.com/oauth/convex/callback",
        returnToPath: "/org/samebase/providers?prod-ui#connections",
      }),
    ).toBe("https://samebase.com/org/samebase/providers?prod-ui#connections");
  });

  it("keeps query and hash values when the owner path uses display casing", () => {
    expect(
      buildProviderOAuthDefaultReturnUrl({
        configuredAppUrl: "https://samebase.com",
        githubOwnerLogin: "Samebase",
        requestUrl: "https://api.samebase.com/oauth/convex/callback",
        returnToPath: "/org/Samebase/providers?prod-ui#connections",
      }),
    ).toBe("https://samebase.com/org/Samebase/providers?prod-ui#connections");
  });

  it("removes authorization response and secret query values from the return URL", () => {
    const returnUrl = new URL(
      buildProviderOAuthDefaultReturnUrl({
        configuredAppUrl: "https://samebase.com",
        githubOwnerLogin: "samebase",
        requestUrl: "https://api.samebase.com/oauth/convex/callback",
        returnToPath:
          "/org/samebase/providers?prod-ui&code=code-value&state=state-value&access_token=token-value&authorization-error=failed#connections",
      }),
    );

    expect(Array.from(returnUrl.searchParams.entries())).toEqual([["prod-ui", ""]]);
    expect(returnUrl.hash).toBe("#connections");
  });

  it("ignores a return path for another route or origin", () => {
    for (const returnToPath of [
      "/org/samebase/settings?prod-ui",
      "//evil.example/org/samebase/providers",
      "/\\evil.example/org/samebase/providers",
    ]) {
      expect(
        buildProviderOAuthDefaultReturnUrl({
          configuredAppUrl: "https://samebase.com",
          githubOwnerLogin: "samebase",
          requestUrl: "https://api.samebase.com/oauth/convex/callback",
          returnToPath,
        }),
      ).toBe("https://samebase.com/org/samebase/providers");
    }
  });

  it("rejects an unsafe configured app URL instead of redirecting to it", () => {
    expect(() =>
      buildProviderOAuthDefaultReturnUrl({
        configuredAppUrl: "http://attacker.example/app",
        githubOwnerLogin: "samebase",
        requestUrl: "https://api.samebase.com/oauth/cloudflare/callback?code=abc",
      }),
    ).toThrow("SITE_URL must use https");
  });
});
