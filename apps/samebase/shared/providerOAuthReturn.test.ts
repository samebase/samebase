import { describe, expect, it } from "vite-plus/test";

import { buildProviderOAuthDefaultReturnUrl } from "./providerOAuthReturn";

describe("buildProviderOAuthDefaultReturnUrl", () => {
  it("returns the providers page on the configured app origin", () => {
    expect(
      buildProviderOAuthDefaultReturnUrl({
        configuredAppUrl: "https://samebase.com",
        requestUrl: "https://api.samebase.com/oauth/cloudflare/callback?code=abc",
      }),
    ).toBe("https://samebase.com/providers");
  });

  it("falls back to the callback origin when the app origin is unavailable", () => {
    expect(
      buildProviderOAuthDefaultReturnUrl({
        configuredAppUrl: undefined,
        requestUrl: "https://samebase.convex.site/oauth/convex/callback?code=abc",
      }),
    ).toBe("https://samebase.convex.site/providers");
  });
});
