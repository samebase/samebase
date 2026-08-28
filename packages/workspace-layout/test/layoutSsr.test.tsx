import { type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import { WorkspaceLayoutV2 } from "../src/WorkspaceLayoutV2.tsx";
import type { WorkspaceLayoutV2MobileMinResizeBehavior } from "../src/WorkspaceLayoutV2Geometry.ts";
import { WorkspaceLayoutV2PaneFrame } from "../src/WorkspaceLayoutV2PaneFrame.tsx";
import type { WorkspaceSidebarState } from "../src/WorkspaceLayoutV2State.ts";
import { WorkspaceLayoutV2MemorySidebarProvider } from "../src/WorkspaceLayoutV2Testing.tsx";

const TEST_SIDEBAR_WIDTH_PX = 240;
const TEST_STATE = {
  leftDesktopOpen: true,
  leftDesktopWidthPx: TEST_SIDEBAR_WIDTH_PX,
  leftMobileWidthPx: TEST_SIDEBAR_WIDTH_PX,
  mobilePane: "main",
  mobileSurface: { kind: "unmerged" },
  rightDesktopOpen: true,
  rightDesktopWidthPx: TEST_SIDEBAR_WIDTH_PX,
  rightMobileWidthPx: TEST_SIDEBAR_WIDTH_PX,
} satisfies WorkspaceSidebarState;

function renderLayoutMarkup({
  left = <div>left pane</div>,
  mobileMinResizeBehavior,
  right = <div>right pane</div>,
}: {
  left?: ReactNode;
  mobileMinResizeBehavior?: WorkspaceLayoutV2MobileMinResizeBehavior;
  right?: ReactNode;
}) {
  return renderToStaticMarkup(
    <WorkspaceLayoutV2MemorySidebarProvider initialState={TEST_STATE}>
      <WorkspaceLayoutV2
        addressChrome={<div>/test</div>}
        left={left ? <div>{left}</div> : undefined}
        main={<div>main pane</div>}
        mobileMinResizeBehavior={mobileMinResizeBehavior}
        resizeHandleLabels={{
          left: "Resize left pane",
          right: "Resize right pane",
        }}
        right={right ? <div>{right}</div> : undefined}
      />
    </WorkspaceLayoutV2MemorySidebarProvider>,
  );
}

describe("WorkspaceLayoutV2 server markup", () => {
  it("renders one responsive pane tree", () => {
    const markup = renderLayoutMarkup({});

    expect(markup).toContain('data-workspace-layout-part="viewport"');
    expect(markup).toContain('data-mobile-min-resize-behavior="min_resize_to_merge"');
    expect((markup.match(/data-pane-side="left"/g) ?? []).length).toBe(1);
    expect((markup.match(/data-pane-side="main"/g) ?? []).length).toBe(1);
    expect((markup.match(/data-pane-side="right"/g) ?? []).length).toBe(1);
    expect(markup).toContain('data-workspace-layout-part="carousel"');
    expect(markup).toContain('style="width:var(--workspace-layout-v2-left-mobile-width, 0px)"');
    expect(markup).toContain('style="width:var(--workspace-layout-v2-main-mobile-width, 100%)"');
    expect(markup).toContain('style="width:var(--workspace-layout-v2-right-mobile-width, 0px)"');
  });

  it("omits absent side panes and their resize handles", () => {
    const markup = renderLayoutMarkup({ left: null, right: null });

    expect(markup).toContain("main pane");
    expect(markup).not.toContain('data-pane-side="left"');
    expect(markup).not.toContain('data-pane-side="right"');
    expect(markup).not.toContain('data-workspace-layout-part="resize-handle"');
  });

  it("marks explicit slide behavior on the canonical viewport", () => {
    const markup = renderLayoutMarkup({ mobileMinResizeBehavior: "min_resize_to_slide" });

    expect(markup).toContain('data-mobile-min-resize-behavior="min_resize_to_slide"');
  });

  it("omits an empty pane-frame header", () => {
    const markup = renderToStaticMarkup(
      <WorkspaceLayoutV2PaneFrame content={<div>public pane</div>} />,
    );

    expect(markup).toContain("public pane");
    expect(markup).toContain('data-workspace-layout-part="pane-frame"');
    expect(markup).not.toContain('data-workspace-layout-part="pane-header"');
    expect(markup).toContain('data-workspace-layout-part="pane-scrollport"');
  });
});
