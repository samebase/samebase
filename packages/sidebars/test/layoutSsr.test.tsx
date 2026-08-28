import { type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import { SidebarLayout } from "../src/SidebarLayout.tsx";
import type { SidebarLayoutMobileMinResizeBehavior } from "../src/SidebarLayoutGeometryInternal.ts";
import { PaneFrame } from "../src/PaneFrame.tsx";
import type { SidebarLayoutState } from "../src/SidebarLayoutState.ts";
import { SidebarLayoutMemoryProvider } from "../src/SidebarLayoutTesting.tsx";

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
} satisfies SidebarLayoutState;

function renderLayoutMarkup({
  left = <div>left pane</div>,
  mobileMinResizeBehavior,
  right = <div>right pane</div>,
}: {
  left?: ReactNode;
  mobileMinResizeBehavior?: SidebarLayoutMobileMinResizeBehavior;
  right?: ReactNode;
}) {
  return renderToStaticMarkup(
    <SidebarLayoutMemoryProvider initialState={TEST_STATE}>
      <SidebarLayout
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
    </SidebarLayoutMemoryProvider>,
  );
}

describe("SidebarLayout server markup", () => {
  it("renders one responsive pane tree", () => {
    const markup = renderLayoutMarkup({});

    expect(markup).toContain('data-sidebar-layout-part="viewport"');
    expect(markup).toContain('data-mobile-min-resize-behavior="min_resize_to_merge"');
    expect((markup.match(/data-pane-side="left"/g) ?? []).length).toBe(1);
    expect((markup.match(/data-pane-side="main"/g) ?? []).length).toBe(1);
    expect((markup.match(/data-pane-side="right"/g) ?? []).length).toBe(1);
    expect(markup).toContain('data-sidebar-layout-part="carousel"');
    expect(markup).toContain('style="width:var(--sidebar-layout-left-mobile-width, 0px)"');
    expect(markup).toContain('style="width:var(--sidebar-layout-main-mobile-width, 100%)"');
    expect(markup).toContain('style="width:var(--sidebar-layout-right-mobile-width, 0px)"');
  });

  it("omits absent side panes and their resize handles", () => {
    const markup = renderLayoutMarkup({ left: null, right: null });

    expect(markup).toContain("main pane");
    expect(markup).not.toContain('data-pane-side="left"');
    expect(markup).not.toContain('data-pane-side="right"');
    expect(markup).not.toContain('data-sidebar-layout-part="resize-handle"');
  });

  it("marks explicit slide behavior on the canonical viewport", () => {
    const markup = renderLayoutMarkup({ mobileMinResizeBehavior: "min_resize_to_slide" });

    expect(markup).toContain('data-mobile-min-resize-behavior="min_resize_to_slide"');
  });

  it("omits an empty pane-frame header", () => {
    const markup = renderToStaticMarkup(<PaneFrame content={<div>public pane</div>} />);

    expect(markup).toContain("public pane");
    expect(markup).toContain('data-sidebar-layout-part="pane-frame"');
    expect(markup).not.toContain('data-sidebar-layout-part="pane-header"');
    expect(markup).toContain('data-sidebar-layout-part="pane-scrollport"');
  });
});
