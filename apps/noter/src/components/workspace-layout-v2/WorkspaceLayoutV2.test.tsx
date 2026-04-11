import { SidebarProvider } from "@/components/sidebar";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WorkspaceLayoutV2FullPage } from "./WorkspaceLayoutV2";

describe("WorkspaceLayoutV2FullPage", () => {
  it("keeps main header content rendered while sidebar toggles stay desktop-only", () => {
    const markup = renderToStaticMarkup(
      <SidebarProvider>
        <WorkspaceLayoutV2FullPage
          left={{
            content: <div>left pane</div>,
          }}
          main={{
            header: <div data-testid="main-header-actions">/machines</div>,
            content: <div>main pane</div>,
          }}
          right={{
            content: <div>right pane</div>,
          }}
        />
      </SidebarProvider>,
    );

    expect(markup).toContain('data-testid="main-header-actions"');
    expect(markup).toContain("/machines");
    expect(markup).not.toContain("hidden justify-between md:flex");
    expect((markup.match(/hidden h-8 w-8 md:inline-flex/g) ?? []).length).toBe(
      2,
    );
  });
});
