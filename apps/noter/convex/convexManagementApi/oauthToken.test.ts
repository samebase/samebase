import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { ConvexApiValidationError } from "./errors";
import { parseConvexOAuthTokenResponse } from "./oauthToken";

describe("parseConvexOAuthTokenResponse", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("accepts the documented Convex OAuth token response", () => {
    expect(
      parseConvexOAuthTokenResponse({
        access_token: "team:my-team|AAAAAA==",
        token_type: "bearer",
      }),
    ).toEqual({
      access_token: "team:my-team|AAAAAA==",
      token_type: "bearer",
    });
  });

  it("warns about extra fields and returns only the documented fields", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(
      parseConvexOAuthTokenResponse({
        access_token: "team:my-team|AAAAAA==",
        token_type: "bearer",
        expires_in: 3600,
        refresh_token: "not-documented",
      }),
    ).toEqual({
      access_token: "team:my-team|AAAAAA==",
      token_type: "bearer",
    });
    expect(warn).toHaveBeenCalledWith("convex:api:unexpected_response_fields", {
      path: "/oauth/token",
      schemaName: "ConvexOAuthTokenResponse",
      fields: ["expires_in", "refresh_token"],
    });
  });

  it("rejects token responses that do not match the documented contract", () => {
    expect(() =>
      parseConvexOAuthTokenResponse({
        access_token: "team:my-team|AAAAAA==",
        token_type: "mac",
      }),
    ).toThrow(ConvexApiValidationError);
  });
});
