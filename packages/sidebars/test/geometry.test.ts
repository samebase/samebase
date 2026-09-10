import { describe, expect, it } from "vite-plus/test";
import {
  SIDEBAR_LAYOUT_MOBILE_MAIN_MIN_WIDTH_PX,
  getDesktopPaneWidths,
  getMergedMobileMainWidthPx,
  getMobilePaneFromScrollLeft,
  getMobilePaneScrollLeftPx,
  getMobileSidebarMaxWidthPx,
  getMobileSidebarMinWidthPx,
} from "../src/SidebarLayoutGeometryInternal.ts";

describe("sidebar layout geometry", () => {
  it.each([
    {
      name: "wide sidebar",
      viewportWidthPx: 1200,
      leftOpen: true,
      rightOpen: true,
      leftWidthPx: 800,
      rightWidthPx: 200,
      expected: [800, 200, 160],
    },
    {
      name: "minimum widths",
      viewportWidthPx: 1200,
      leftOpen: true,
      rightOpen: true,
      leftWidthPx: 20,
      rightWidthPx: 30,
      expected: [160, 160, 160],
    },
    {
      name: "closed opposite pane",
      viewportWidthPx: 1200,
      leftOpen: true,
      rightOpen: false,
      leftWidthPx: 2000,
      rightWidthPx: 900,
      expected: [1040, 0, 160],
    },
    {
      name: "both closed",
      viewportWidthPx: 1200,
      leftOpen: false,
      rightOpen: false,
      leftWidthPx: 800,
      rightWidthPx: 900,
      expected: [0, 0, 160],
    },
    {
      name: "equal oversized preferences",
      viewportWidthPx: 800,
      leftOpen: true,
      rightOpen: true,
      leftWidthPx: 900,
      rightWidthPx: 900,
      expected: [320, 320, 160],
    },
    {
      name: "unequal oversized preferences",
      viewportWidthPx: 800,
      leftOpen: true,
      rightOpen: true,
      leftWidthPx: 800,
      rightWidthPx: 480,
      expected: [373, 267, 160],
    },
    {
      name: "narrow embedded layout",
      viewportWidthPx: 300,
      leftOpen: true,
      rightOpen: true,
      leftWidthPx: 800,
      rightWidthPx: 480,
      expected: [100, 100, 100],
    },
    {
      name: "unmeasured server layout",
      viewportWidthPx: 0,
      leftOpen: true,
      rightOpen: false,
      leftWidthPx: 800,
      rightWidthPx: 480,
      expected: [800, 0, 160],
    },
  ])("fits $name", ({ expected, ...args }) => {
    const widths = getDesktopPaneWidths({ ...args, mainMinWidthPx: 160, sidebarMinWidthPx: 160 });
    expect([widths.leftWidthPx, widths.rightWidthPx, widths.mainMinWidthPx]).toEqual(expected);
    expect(widths.sidebarMinWidthPx).toBe(widths.mainMinWidthPx);
  });

  it("keeps the main pane reachable beside a mobile sidebar", () => {
    const viewportWidthPx = 390;
    const maxWidthPx = getMobileSidebarMaxWidthPx(viewportWidthPx);
    const minWidthPx = getMobileSidebarMinWidthPx({
      configuredMinWidthPx: 175,
      maxWidthPx,
      viewportWidthPx,
    });

    expect(maxWidthPx).toBe(350);
    expect(minWidthPx).toBe(130);
  });

  it("resolves mobile pane offsets with absent side panes", () => {
    const geometry = {
      hasLeftPane: false,
      hasRightPane: true,
      leftWidthPx: 0,
      mainWidthPx: 390,
      mergedSurfaceSide: null,
      rightWidthPx: 200,
      viewportWidthPx: 390,
    } as const;

    expect(getMobilePaneScrollLeftPx("main", geometry)).toBe(0);
    expect(getMobilePaneScrollLeftPx("right", geometry)).toBe(200);
    expect(getMobilePaneFromScrollLeft({ ...geometry, scrollLeftPx: 190 })).toBe("right");
  });

  it("rejects a merged surface when the viewport cannot fit both panes", () => {
    expect(
      getMergedMobileMainWidthPx({
        mainMaxWidthPx: 300,
        mainMinWidthPx: SIDEBAR_LAYOUT_MOBILE_MAIN_MIN_WIDTH_PX,
        sideMinWidthPx: 120,
        viewportWidthPx: 300,
      }),
    ).toBeNull();
  });
});
