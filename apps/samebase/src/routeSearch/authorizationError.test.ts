import { describe, expect, it } from "vite-plus/test";

import { clearAuthorizationErrorSearch, readAuthorizationError } from "./authorizationError";

describe("authorization error search", () => {
  it("reads a complete allowlisted authorization error", () => {
    expect(
      readAuthorizationError({
        "authorization-provider": "cloudflare",
        "authorization-error": "target-mismatch",
      }),
    ).toEqual({ provider: "cloudflare", code: "target-mismatch" });
    expect(
      readAuthorizationError({
        "authorization-provider": "github-sign-in",
        "authorization-error": "account-link-required",
      }),
    ).toEqual({ provider: "github-sign-in", code: "account-link-required" });
    expect(
      readAuthorizationError({
        "authorization-provider": "github-user",
        "authorization-error": "github-sign-in-mismatch",
      }),
    ).toEqual({ provider: "github-user", code: "github-sign-in-mismatch" });
    expect(readAuthorizationError({ "authorization-error": "failed" })).toBeNull();
  });

  it("clears the one-time authorization and signup-return values", () => {
    expect(
      clearAuthorizationErrorSearch({
        "authorization-provider": "convex" as const,
        "authorization-error": "target-mismatch" as const,
        "auth-return": "dashboard" as const,
        "prod-ui": true as const,
        devtools: true as const,
        signup: "github" as const,
      }),
    ).toEqual({ "prod-ui": true, devtools: true });
  });
});
