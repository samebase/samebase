import { SidebarProvider } from "@/components/sidebar";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import { WorkspaceLayoutV2FullPage } from "./WorkspaceLayoutV2";
import { WorkspaceLayoutV2PaneFrame } from "./WorkspaceLayoutV2PaneFrame";
import { WorkspaceLayoutV2ResizeHandle } from "./WorkspaceLayoutV2ResizeHandle";

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

  it("omits the right toggle when a route does not provide a right pane", () => {
    const markup = renderToStaticMarkup(
      <SidebarProvider>
        <WorkspaceLayoutV2FullPage
          left={{
            content: <div>left pane</div>,
          }}
          main={{
            header: <div data-testid="main-header-actions">/landing</div>,
            content: <div>main pane</div>,
          }}
        />
      </SidebarProvider>,
    );

    expect(markup).toContain('aria-label="Toggle Left Sidebar"');
    expect(markup).not.toContain('aria-label="Toggle Right Sidebar"');
    expect((markup.match(/hidden h-8 w-8 md:inline-flex/g) ?? []).length).toBe(
      1,
    );
  });

  it("disables the shared bottom-panel close button when panel closure is blocked", () => {
    const markup = renderToStaticMarkup(
      <SidebarProvider>
        <WorkspaceLayoutV2FullPage
          left={{
            content: <div>left pane</div>,
          }}
          main={{
            header: <div>/chat</div>,
            content: <div>main pane</div>,
          }}
          panel={{
            closeDisabled: true,
            content: <div>chat panel</div>,
            header: <div>Chat</div>,
          }}
          right={{
            content: <div>right pane</div>,
          }}
        />
      </SidebarProvider>,
    );

    expect(markup).toContain('aria-label="Close bottom panel"');
    expect(markup).toContain("disabled");
  });

  it("can skip the reserved header row when a pane intentionally has no header", () => {
    const markup = renderToStaticMarkup(
      <WorkspaceLayoutV2PaneFrame content={<div>public pane</div>} />,
    );

    expect(markup).toContain("public pane");
    expect(markup).not.toContain('class="h-8 shrink-0"');
  });

  it("keeps idle grip handles visually unobtrusive", () => {
    const markup = renderToStaticMarkup(
      <WorkspaceLayoutV2ResizeHandle
        currentSizePx={280}
        dataTestId="workspace-layout-v2-left-resize"
        maxSizePx={480}
        minSizePx={160}
        onSizeChange={() => {}}
        pointerTarget="grip"
        positionPx={280}
        resizeFrom="left"
      />,
    );

    expect(markup).toContain('data-testid="workspace-layout-v2-left-resize"');
    expect(markup).toContain("h-16 w-8");
    expect(markup).not.toContain("border-border");
    expect(markup).not.toContain("bg-background");
  });
});
