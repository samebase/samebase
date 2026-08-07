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
    expect(readAuthorizationError({ "authorization-error": "failed" })).toBeNull();
  });

  it("clears only the one-time authorization values", () => {
    expect(
      clearAuthorizationErrorSearch({
        "authorization-provider": "convex" as const,
        "authorization-error": "target-mismatch" as const,
        "prod-ui": true as const,
        devtools: true as const,
      }),
    ).toEqual({ "prod-ui": true, devtools: true });
  });
});
