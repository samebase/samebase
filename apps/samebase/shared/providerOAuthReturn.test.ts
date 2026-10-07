import { describe, expect, it } from "vite-plus/test";

import {
  buildProviderOAuthCompletionUrl,
  buildProviderOAuthDefaultReturnUrl,
  readProviderOAuthAppOrigin,
  readProviderOAuthCompletionFragment,
} from "./providerOAuthReturn";

const appOrigin = new URL("https://samebase.com");

describe("buildProviderOAuthDefaultReturnUrl", () => {
  it("returns the organization providers page on the configured app origin", () => {
    expect(
      buildProviderOAuthDefaultReturnUrl({
        appOrigin,
        githubOwnerLogin: "Samebase",
      }),
    ).toBe("https://samebase.com/org/samebase/providers");
  });

  it("encodes the normalized owner as one path segment", () => {
    expect(
      buildProviderOAuthDefaultReturnUrl({
        appOrigin,
        githubOwnerLogin: " Owner/Name ",
      }),
    ).toBe("https://samebase.com/org/owner%2Fname/providers");
  });

  it("keeps query and hash values from the exact initiating Providers page", () => {
    expect(
      buildProviderOAuthDefaultReturnUrl({
        appOrigin,
        githubOwnerLogin: "samebase",
        returnToPath: "/org/samebase/providers?prod-ui#connections",
      }),
    ).toBe("https://samebase.com/org/samebase/providers?prod-ui#connections");
  });

  it("keeps query and hash values when the owner path uses display casing", () => {
    expect(
      buildProviderOAuthDefaultReturnUrl({
        appOrigin,
        githubOwnerLogin: "Samebase",
        returnToPath: "/org/Samebase/providers?prod-ui#connections",
      }),
    ).toBe("https://samebase.com/org/Samebase/providers?prod-ui#connections");
  });

  it("removes authorization response and secret query values from the return URL", () => {
    const returnUrl = new URL(
      buildProviderOAuthDefaultReturnUrl({
        appOrigin,
        githubOwnerLogin: "samebase",
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
          appOrigin,
          githubOwnerLogin: "samebase",
          returnToPath,
        }),
      ).toBe("https://samebase.com/org/samebase/providers");
    }
  });
});

describe("readProviderOAuthAppOrigin", () => {
  it("uses the configured app origin", () => {
    expect(
      readProviderOAuthAppOrigin({
        configuredAppUrl: "https://samebase.com",
        requestUrl: "https://api.samebase.com/oauth/cloudflare/callback?code=abc",
      }).href,
    ).toBe("https://samebase.com/");
  });

  it("falls back to the callback origin when the app origin is unavailable", () => {
    expect(
      readProviderOAuthAppOrigin({
        configuredAppUrl: undefined,
        requestUrl: "https://samebase.convex.site/oauth/convex/callback?code=abc",
      }).href,
    ).toBe("https://samebase.convex.site/");
  });

  it("rejects an unsafe configured app URL instead of redirecting to it", () => {
    expect(() =>
      readProviderOAuthAppOrigin({
        configuredAppUrl: "http://attacker.example/app",
        requestUrl: "https://api.samebase.com/oauth/cloudflare/callback?code=abc",
      }),
    ).toThrow("SITE_URL must use https");
  });
});

describe("provider OAuth completion URL", () => {
  it("carries the authorization only in the fragment of the app completion page", () => {
    const completionUrl = new URL(
      buildProviderOAuthCompletionUrl({
        appOrigin,
        completion: { provider: "cloudflare_mcp", state: "state value", code: "code/value" },
      }),
    );

    expect(completionUrl.origin).toBe("https://samebase.com");
    expect(completionUrl.pathname).toBe("/oauth/provider-complete");
    expect(completionUrl.search).toBe("");
    expect(readProviderOAuthCompletionFragment(completionUrl.hash)).toEqual({
      provider: "cloudflare_mcp",
      state: "state value",
      code: "code/value",
    });
  });

  it("rejects an incomplete or unknown fragment", () => {
    for (const hash of [
      "",
      "#provider=convex&state=state-value",
      "#provider=convex&code=code-value",
      "#provider=github&state=state-value&code=code-value",
      "#provider=convex&state=&code=code-value",
      "#provider=convex&state=a&state=b&code=code-value",
    ]) {
      expect(readProviderOAuthCompletionFragment(hash)).toBeNull();
    }
  });
});
