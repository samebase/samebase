import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import { AppWorkspaceShell } from "./AppWorkspaceShell";
import { TestRouterProvider } from "@/test/TestRouterProvider";

describe("AppWorkspaceShell", () => {
  it("server-renders route content inside the client shell before workspace layout mounts", () => {
    const markup = renderToStaticMarkup(
      <TestRouterProvider initialEntries={["/machines"]}>
        <AppWorkspaceShell>
          <div data-testid="workspace-route-content">workspace route content</div>
        </AppWorkspaceShell>
      </TestRouterProvider>,
    );

    expect(markup).toContain('data-testid="app-workspace-client-shell"');
    expect(markup).not.toContain("data-workspace-layout-v2");
    expect(markup).toContain("workspace route content");
  });
});
