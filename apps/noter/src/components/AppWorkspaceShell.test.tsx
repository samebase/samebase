import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import { AppWorkspaceShell } from "./AppWorkspaceShell";

describe("AppWorkspaceShell", () => {
  it("server-renders only the exact client workspace shell", () => {
    const markup = renderToStaticMarkup(
      <AppWorkspaceShell>
        <div data-testid="workspace-route-content">workspace route content</div>
      </AppWorkspaceShell>,
    );

    expect(markup).toContain('data-testid="app-workspace-client-shell"');
    expect(markup).not.toContain("data-workspace-layout-v2");
    expect(markup).not.toContain("workspace-route-content");
  });
});
