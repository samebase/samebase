import { describe, expect, it } from "vite-plus/test";
import { renderToStaticMarkup } from "react-dom/server";
import { McpConsentSignInNotice } from "./McpConsentSignInView";

describe("McpConsentSignInNotice", () => {
  it("tells signed-out users to be logged into this browser before authenticating from Codex", () => {
    const markup = renderToStaticMarkup(<McpConsentSignInNotice />);

    expect(markup).toContain("Temporary MCP sign-in note");
    expect(markup).toContain("already signed in to Noter in this same browser");
    expect(markup).toContain("click Authenticate in Codex");
    expect(markup).toContain("press Authenticate again");
  });
});
