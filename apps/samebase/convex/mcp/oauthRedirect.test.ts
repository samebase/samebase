import { describe, expect, it } from "vite-plus/test";
import {
  applyMcpDenyErrorParamsToRedirectUrl,
  buildMcpAuthorizationSuccessRedirectUrl,
  MCP_OAUTH_DENY_ERROR_DESCRIPTION,
} from "../../shared/mcpOAuth";

describe("applyMcpDenyErrorParamsToRedirectUrl", () => {
  it("preserves the exact underscore error_description token in serialized redirect URLs", () => {
    const redirectUrl = new URL("http://127.0.0.1:62000/callback");

    applyMcpDenyErrorParamsToRedirectUrl(redirectUrl, "state_123", "https://samebase.com");

    expect(redirectUrl.searchParams.get("error")).toBe("access_denied");
    expect(redirectUrl.searchParams.get("error_description")).toBe(
      MCP_OAUTH_DENY_ERROR_DESCRIPTION,
    );
    expect(redirectUrl.toString()).toContain("error_description=authorization_denied_by_user");
    expect(redirectUrl.toString()).not.toContain("error_description=authorization+denied+by+user");
    expect(redirectUrl.searchParams.get("state")).toBe("state_123");
    expect(redirectUrl.searchParams.get("iss")).toBe("https://samebase.com");
  });

  it("omits the state query param when state is undefined", () => {
    const redirectUrl = new URL("http://127.0.0.1:62000/callback");

    applyMcpDenyErrorParamsToRedirectUrl(redirectUrl, undefined, "https://samebase.com");

    expect(redirectUrl.searchParams.get("error")).toBe("access_denied");
    expect(redirectUrl.searchParams.get("error_description")).toBe(
      MCP_OAUTH_DENY_ERROR_DESCRIPTION,
    );
    expect(redirectUrl.searchParams.has("state")).toBe(false);
  });
});

describe("buildMcpAuthorizationSuccessRedirectUrl", () => {
  it("adds the authorization-server issuer to the redirect", () => {
    const redirectUrl = buildMcpAuthorizationSuccessRedirectUrl("http://127.0.0.1:62000/callback", {
      code: "authorization-code",
      iss: "https://samebase.com",
      state: "state_123",
    });

    expect(new URL(redirectUrl).searchParams).toEqual(
      // eslint-disable-next-line no-restricted-globals -- This test verifies OAuth response parameters.
      new URLSearchParams({
        code: "authorization-code",
        iss: "https://samebase.com",
        state: "state_123",
      }),
    );
  });
});
