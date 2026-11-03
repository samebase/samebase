// @vitest-environment jsdom

import { describe, expect, it } from "vite-plus/test";
import {
  getSidebarLayoutRootState,
  writeSidebarLayoutRootState,
} from "../src/SidebarLayoutRootState.ts";
import type { SidebarLayoutState } from "../src/SidebarLayoutState.ts";

const SAVED_STATE = {
  leftDesktopOpen: true,
  leftDesktopWidthPx: 300,
  leftMobileWidthPx: 300,
  mobilePane: "right",
  mobileSurface: { kind: "merged", mainWidthPx: 240, side: "right" },
  rightDesktopOpen: false,
  rightDesktopWidthPx: 350,
  rightMobileWidthPx: 420,
} satisfies SidebarLayoutState;
const RIGHT_MOBILE_WIDTH =
  "clamp(min(175px, round(down, 100% / 3, 1px)), 420px, calc(100% - 40px))";

describe("getSidebarLayoutRootState", () => {
  it("maps a saved state to the root attributes and the unmeasured CSS widths", () => {
    expect(
      getSidebarLayoutRootState({
        hasLeftPane: true,
        hasRightPane: true,
        mobileMinResizeBehavior: "min_resize_to_merge",
        state: SAVED_STATE,
      }),
    ).toEqual({
      attributes: {
        "data-left-desktop-open": "",
        "data-mobile-pane": "right",
        "data-right-desktop-open": undefined,
        "data-sidebar-layout-mobile-merged-side": "right",
      },
      variables: {
        "--sidebar-layout-left-desktop-width": "min(300px, calc(100% - 160px))",
        "--sidebar-layout-left-mobile-width":
          "clamp(min(175px, round(down, 100% / 3, 1px)), 300px, calc(100% - 40px))",
        "--sidebar-layout-main-mobile-width": `calc(100% - ${RIGHT_MOBILE_WIDTH} + clamp(0px, (214px - (100% - ${RIGHT_MOBILE_WIDTH})) * 1000, ${RIGHT_MOBILE_WIDTH}))`,
        "--sidebar-layout-right-desktop-width": "0px",
        "--sidebar-layout-right-mobile-width": RIGHT_MOBILE_WIDTH,
      },
    });
  });

  it("keeps a saved merge unmerged when the layout slides at the minimum width", () => {
    const { attributes, variables } = getSidebarLayoutRootState({
      hasLeftPane: true,
      hasRightPane: true,
      mobileMinResizeBehavior: "min_resize_to_slide",
      state: SAVED_STATE,
    });

    expect(attributes["data-mobile-pane"]).toBe("right");
    expect(attributes["data-sidebar-layout-mobile-merged-side"]).toBeUndefined();
    expect(variables["--sidebar-layout-main-mobile-width"]).toBe("100%");
  });

  it("falls back to the main pane and no merge when the saved side pane is absent", () => {
    const { attributes, variables } = getSidebarLayoutRootState({
      hasLeftPane: true,
      hasRightPane: false,
      mobileMinResizeBehavior: "min_resize_to_merge",
      state: SAVED_STATE,
    });

    expect(attributes["data-mobile-pane"]).toBe("main");
    expect(attributes["data-sidebar-layout-mobile-merged-side"]).toBeUndefined();
    expect(variables["--sidebar-layout-main-mobile-width"]).toBe("100%");
    expect(variables["--sidebar-layout-right-mobile-width"]).toBe("0px");
    expect(variables["--sidebar-layout-right-desktop-width"]).toBe("0px");
  });
});

describe("writeSidebarLayoutRootState", () => {
  it("writes the state on a rendered root from the panes the root names", () => {
    const root = document.createElement("div");
    root.setAttribute("data-has-left-pane", "");
    root.setAttribute("data-has-right-pane", "");
    root.setAttribute("data-mobile-min-resize-behavior", "min_resize_to_merge");
    root.setAttribute("data-mobile-pane", "main");
    root.setAttribute("data-right-desktop-open", "");

    writeSidebarLayoutRootState(root, SAVED_STATE);

    expect(root.getAttribute("data-mobile-pane")).toBe("right");
    expect(root.hasAttribute("data-left-desktop-open")).toBe(true);
    expect(root.hasAttribute("data-right-desktop-open")).toBe(false);
    expect(root.getAttribute("data-sidebar-layout-mobile-merged-side")).toBe("right");
    expect(root.style.getPropertyValue("--sidebar-layout-left-desktop-width")).toBe(
      "min(300px, calc(100% - 160px))",
    );
    expect(root.style.getPropertyValue("--sidebar-layout-right-mobile-width")).toBe(
      RIGHT_MOBILE_WIDTH,
    );
  });
});
