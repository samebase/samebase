import { describe, expect, it } from "vite-plus/test";
import { validateMcpConsentRouteSearch } from "./mcpConsent";

describe("mcpConsent route search", () => {
  it("trims the MCP consent request id", () => {
    expect(
      validateMcpConsentRouteSearch({
        mcp_consent_request: "  mcpar_test  ",
        mcp_login_required: "1",
      }),
    ).toEqual({
      mcp_consent_request: "mcpar_test",
      mcp_login_required: true,
    });
    expect(
      validateMcpConsentRouteSearch({
        mcp_consent_request: "   ",
        mcp_login_required: undefined,
      }),
    ).toEqual({});
  });
});
