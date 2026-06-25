import { describe, expect, it, vi } from "vite-plus/test";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("./SignInForm", () => ({
  SignInForm: ({ authPlacement }: { authPlacement: string }) => (
    <div data-auth-placement={authPlacement}>Sign in form</div>
  ),
}));

import { McpConsentSignInNotice, McpConsentSignInView } from "./McpConsentSignInView";

describe("McpConsentSignInNotice", () => {
  it("tells signed-out users to be logged into this browser before authenticating from Codex", () => {
    const markup = renderToStaticMarkup(<McpConsentSignInNotice />);

    expect(markup).toContain("Temporary MCP sign-in note");
    expect(markup).toContain("already signed in to Samebase in this same browser");
    expect(markup).toContain("click Authenticate in Codex");
    expect(markup).toContain("press Authenticate again");
  });

  it("leaves MCP sign-in controls in the sidebar", () => {
    const markup = renderToStaticMarkup(<McpConsentSignInView />);

    expect(markup).toContain('data-auth-placement="sidebar"');
    expect(markup).not.toContain('data-auth-placement="inline"');
  });
});
