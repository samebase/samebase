import { type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import { DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX } from "@/lib/workspacePaneSizes";
import { WorkspaceLayoutV2FullPage } from "./WorkspaceLayoutV2FullPage";
import { WorkspaceLayoutV2MemorySidebarProvider } from "./WorkspaceLayoutV2MemorySidebarProvider";
import { WorkspaceLayoutV2PaneFrame } from "./WorkspaceLayoutV2PaneFrame";
import { WorkspaceLayoutV2ResizeHandle } from "./WorkspaceLayoutV2ResizeHandle";

const OMIT_HEADER = Symbol("omit-header");

function WorkspaceLayoutV2TestSidebarProvider({
  children,
  rightOpen = false,
}: {
  children: ReactNode;
  rightOpen?: boolean;
}) {
  return (
    <WorkspaceLayoutV2MemorySidebarProvider
      initialState={{
        leftDesktopOpen: true,
        leftDesktopWidthPx: DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX,
        leftMobileWidthPx: DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX,
        mobilePane: "main",
        mobileSurface: { kind: "unmerged" },
        rightDesktopOpen: rightOpen,
        rightDesktopWidthPx: DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX,
        rightMobileWidthPx: DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX,
      }}
    >
      {children}
    </WorkspaceLayoutV2MemorySidebarProvider>
  );
}

function renderFullPageMarkup({
  includeLeftPane = true,
  includeRightPane = true,
  mainHeader = OMIT_HEADER,
}: {
  includeLeftPane?: boolean;
  includeRightPane?: boolean;
  mainHeader?: ReactNode | typeof OMIT_HEADER;
}) {
  const mainProps =
    mainHeader === OMIT_HEADER
      ? {
          headerTestId: "main-header-row",
          content: <div>main pane</div>,
        }
      : {
          header: mainHeader,
          headerTestId: "main-header-row",
          content: <div>main pane</div>,
        };

  return renderToStaticMarkup(
    <WorkspaceLayoutV2TestSidebarProvider rightOpen>
      <WorkspaceLayoutV2FullPage
        left={
          includeLeftPane
            ? {
                content: <div>left pane</div>,
              }
            : undefined
        }
        main={mainProps}
        right={
          includeRightPane
            ? {
                content: <div>right pane</div>,
              }
            : undefined
        }
      />
    </WorkspaceLayoutV2TestSidebarProvider>,
  );
}

describe("WorkspaceLayoutV2FullPage", () => {
  it("server-renders one responsive pane tree instead of mobile and desktop branches", () => {
    const markup = renderFullPageMarkup({});

    expect(markup).toContain('data-workspace-layout-v2="responsive"');
    expect(markup).not.toContain('data-workspace-layout-v2="mobile"');
    expect(markup).not.toContain('data-workspace-layout-v2="desktop"');
    expect((markup.match(/data-testid="workspace-layout-v2-pane-left"/g) ?? []).length).toBe(1);
    expect((markup.match(/data-testid="workspace-layout-v2-pane-main"/g) ?? []).length).toBe(1);
    expect((markup.match(/data-testid="workspace-layout-v2-pane-right"/g) ?? []).length).toBe(1);
    expect(markup).toContain("workspace-layout-v2-responsive-viewport");
    expect(markup).toContain("workspace-layout-v2-responsive-left-pane");
    expect(markup).toContain("workspace-layout-v2-responsive-main-pane");
    expect(markup).toContain("workspace-layout-v2-responsive-right-pane");
    expect(markup).toContain('style="width:100vw"');
    expect((markup.match(/style="width:0px"/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("keeps main header content rendered while sidebar toggles stay desktop-only", () => {
    const markup = renderToStaticMarkup(
      <WorkspaceLayoutV2TestSidebarProvider>
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
      </WorkspaceLayoutV2TestSidebarProvider>,
    );

    expect(markup).toContain('data-testid="main-header-actions"');
    expect(markup).toContain("/machines");
    expect(markup).not.toContain("hidden justify-between md:flex");
    expect((markup.match(/hidden h-8 w-8 md:inline-flex/g) ?? []).length).toBe(2);
  });

  it("omits the right pane and right toggle when a route does not provide a right pane", () => {
    const markup = renderToStaticMarkup(
      <WorkspaceLayoutV2TestSidebarProvider>
        <WorkspaceLayoutV2FullPage
          left={{
            content: <div>left pane</div>,
          }}
          main={{
            header: <div data-testid="main-header-actions">/landing</div>,
            content: <div>main pane</div>,
          }}
        />
      </WorkspaceLayoutV2TestSidebarProvider>,
    );

    expect(markup).toContain('aria-label="Toggle Left Sidebar"');
    expect(markup).not.toContain("right pane");
    expect(markup).not.toContain('data-testid="workspace-layout-v2-pane-right"');
    expect(markup).not.toContain('aria-label="Toggle Right Sidebar"');
    expect((markup.match(/hidden h-8 w-8 md:inline-flex/g) ?? []).length).toBe(1);
  });

  it("omits the left pane and left toggle when a route does not provide a left pane", () => {
    const markup = renderFullPageMarkup({ includeLeftPane: false });

    expect(markup).toContain("main pane");
    expect(markup).toContain("right pane");
    expect(markup).not.toContain("left pane");
    expect(markup).not.toContain('data-testid="workspace-layout-v2-pane-left"');
    expect(markup).not.toContain('aria-label="Toggle Left Sidebar"');
    expect(markup).toContain('aria-label="Toggle Right Sidebar"');
  });

  it("keeps the desktop header shell even when a route omits main header content", () => {
    const markup = renderFullPageMarkup({});

    expect(markup).toContain("main pane");
    expect(markup).toContain('aria-label="Toggle Left Sidebar"');
    expect(markup).toContain('aria-label="Toggle Right Sidebar"');
    expect(markup).toContain('data-testid="main-header-row"');
  });

  it("can hide the left toggle and collapse an otherwise empty header row", () => {
    const markup = renderToStaticMarkup(
      <WorkspaceLayoutV2TestSidebarProvider>
        <WorkspaceLayoutV2FullPage
          left={{
            content: <div>left pane</div>,
          }}
          main={{
            content: <div>main pane</div>,
          }}
          leftToggleVisibility="hidden"
        />
      </WorkspaceLayoutV2TestSidebarProvider>,
    );

    expect(markup).toContain("main pane");
    expect(markup).not.toContain('aria-label="Toggle Left Sidebar"');
    expect(markup).not.toContain('class="h-8 shrink-0"');
  });

  it("can hide the right toggle and collapse an otherwise empty header row", () => {
    const markup = renderToStaticMarkup(
      <WorkspaceLayoutV2TestSidebarProvider rightOpen>
        <WorkspaceLayoutV2FullPage
          left={{
            content: <div>left pane</div>,
          }}
          main={{
            content: <div>main pane</div>,
          }}
          right={{
            content: <div>right pane</div>,
          }}
          leftToggleVisibility="hidden"
          rightToggleVisibility="hidden"
        />
      </WorkspaceLayoutV2TestSidebarProvider>,
    );

    expect(markup).toContain("right pane");
    expect(markup).not.toContain('aria-label="Toggle Left Sidebar"');
    expect(markup).not.toContain('aria-label="Toggle Right Sidebar"');
    expect(markup).not.toContain('class="h-8 shrink-0"');
  });

  it("treats omitted and null main headers the same outside mobile mode", () => {
    const omittedHeaderMarkup = renderFullPageMarkup({});
    const nullHeaderMarkup = renderFullPageMarkup({ mainHeader: null });

    expect(omittedHeaderMarkup).toBe(nullHeaderMarkup);
  });

  it("disables the shared bottom-panel close button when panel closure is blocked", () => {
    const markup = renderToStaticMarkup(
      <WorkspaceLayoutV2TestSidebarProvider>
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
      </WorkspaceLayoutV2TestSidebarProvider>,
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
    expect(markup).toContain("data-workspace-layout-v2-resize-grip-dots");
    expect(markup).toContain("text-foreground/70");
    expect(markup).toContain("h-[3px] w-[3px]");
    expect(markup).not.toContain("border-border");
    expect(markup).not.toContain("bg-background");
  });

  it("keeps mobile sidebar grip tracks centered while offsetting dots", () => {
    const leftMarkup = renderToStaticMarkup(
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
    const rightMarkup = renderToStaticMarkup(
      <WorkspaceLayoutV2ResizeHandle
        currentSizePx={280}
        dataTestId="workspace-layout-v2-right-resize"
        maxSizePx={480}
        minSizePx={160}
        onSizeChange={() => {}}
        pointerTarget="grip"
        positionPx={120}
        resizeFrom="right"
      />,
    );

    expect(leftMarkup).toContain("inset-y-0 w-8 -translate-x-1/2");
    expect(leftMarkup).toContain("translate-x-0.5");
    expect(leftMarkup).not.toContain("-translate-x-0.5");
    expect(rightMarkup).toContain("inset-y-0 w-8 -translate-x-1/2");
    expect(rightMarkup).toContain("-translate-x-0.5");
  });
});
