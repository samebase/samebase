import { describe, expect, it } from "vitest";
import {
  applyMcpDenyErrorParamsToRedirectUrl,
  MCP_OAUTH_DENY_ERROR_DESCRIPTION,
} from "../../shared/mcpOAuth";

describe("applyMcpDenyErrorParamsToRedirectUrl", () => {
  it("preserves the exact underscore error_description token in serialized redirect URLs", () => {
    const redirectUrl = new URL("http://127.0.0.1:62000/callback");

    applyMcpDenyErrorParamsToRedirectUrl(redirectUrl, "state_123");

    expect(redirectUrl.searchParams.get("error")).toBe("access_denied");
    expect(redirectUrl.searchParams.get("error_description")).toBe(
      MCP_OAUTH_DENY_ERROR_DESCRIPTION,
    );
    expect(redirectUrl.toString()).toContain(
      "error_description=authorization_denied_by_user",
    );
    expect(redirectUrl.toString()).not.toContain(
      "error_description=authorization+denied+by+user",
    );
    expect(redirectUrl.searchParams.get("state")).toBe("state_123");
  });
});
