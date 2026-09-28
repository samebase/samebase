import { describe, expect, it } from "vite-plus/test";
import { renderToStaticMarkup } from "react-dom/server";
import { McpConsentSignInView } from "./McpConsentSignInView";

describe("McpConsentSignInView", () => {
  it("tells signed-out users to sign in from the sidebar", () => {
    const markup = renderToStaticMarkup(<McpConsentSignInView />);

    expect(markup).toContain("Sign in to continue");
    expect(markup).toContain("Use the account sidebar to sign in");
    expect(markup).not.toContain("Google");
    expect(markup).not.toContain("Password sign in");
    expect(markup).not.toContain("https://x.com/samebasecom");
  });
});
