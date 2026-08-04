import { describe, expect, it } from "vite-plus/test";

import {
  buildProviderOAuthDefaultReturnUrl,
  buildProviderOAuthReturnUrl,
  isSafeProviderOAuthReturnToPath,
} from "./providerOAuthReturn";

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

  it("rejects an unsafe configured app URL instead of redirecting to it", () => {
    expect(() =>
      buildProviderOAuthDefaultReturnUrl({
        configuredAppUrl: "http://attacker.example/app",
        requestUrl: "https://api.samebase.com/oauth/cloudflare/callback?code=abc",
      }),
    ).toThrow("SITE_URL must use https");
  });
});

describe("isSafeProviderOAuthReturnToPath", () => {
  it("accepts a root-relative path with organization search and a hash", () => {
    expect(
      isSafeProviderOAuthReturnToPath("/providers?organization=organization_123#connections"),
    ).toBe(true);
  });

  it.each([
    "providers",
    "https://attacker.example/providers",
    "//attacker.example/providers",
    "/\\attacker.example/providers",
  ])("rejects unsafe return path %s", (returnToPath) => {
    expect(isSafeProviderOAuthReturnToPath(returnToPath)).toBe(false);
  });
});

describe("buildProviderOAuthReturnUrl", () => {
  it("restores the safe path on the configured app origin", () => {
    expect(
      buildProviderOAuthReturnUrl({
        configuredAppUrl: "https://samebase.com",
        requestUrl: "https://api.samebase.com/oauth/convex/callback?code=abc",
        returnToPath: "/providers?organization=organization_123#connections",
      }),
    ).toBe("https://samebase.com/providers?organization=organization_123#connections");
  });

  it.each(["https://attacker.example/providers", "//attacker.example/providers"])(
    "uses the providers page for invalid stored return path %s",
    (returnToPath) => {
      expect(
        buildProviderOAuthReturnUrl({
          configuredAppUrl: "https://samebase.com",
          requestUrl: "https://api.samebase.com/oauth/cloudflare/callback?code=abc",
          returnToPath,
        }),
      ).toBe("https://samebase.com/providers");
    },
  );
});
