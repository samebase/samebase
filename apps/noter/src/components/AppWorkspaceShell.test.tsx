import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import { AppWorkspaceShell } from "./AppWorkspaceShell";
import { TestRouterProvider } from "@/test/TestRouterProvider";

describe("AppWorkspaceShell", () => {
  it("server-renders only the exact client workspace shell for workspace routes", () => {
    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/machines"]}>
        <AppWorkspaceShell>
          <div data-testid="workspace-route-content">workspace route content</div>
        </AppWorkspaceShell>
      </TestRouterProvider>,
    );

    expect(markup).toContain('data-testid="app-workspace-client-shell"');
    expect(markup).not.toContain("data-workspace-layout-v2");
    expect(markup).not.toContain("workspace-route-content");
  });

  it("server-renders public landing content inside the client shell", () => {
    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/"]}>
        <AppWorkspaceShell>
          <div data-testid="public-landing-content">public landing content</div>
        </AppWorkspaceShell>
      </TestRouterProvider>,
    );

    expect(markup).toContain('data-testid="app-workspace-client-shell"');
    expect(markup).not.toContain("data-workspace-layout-v2");
    expect(markup).toContain("public landing content");
  });
});
