import { describe, expect, it } from "vite-plus/test";
import {
  SIDEBAR_LAYOUT_DESKTOP_SIDEBAR_MIN_WIDTH_PX,
  SIDEBAR_LAYOUT_MOBILE_MAIN_MIN_WIDTH_PX,
  getDesktopSidebarMaxWidthPx,
  getDesktopSidebarWidthPx,
  getMergedMobileMainWidthPx,
  getMobilePaneFromScrollLeft,
  getMobilePaneScrollLeftPx,
  getMobileSidebarMaxWidthPx,
  getMobileSidebarMinWidthPx,
} from "../src/SidebarLayoutGeometryInternal.ts";

describe("sidebar layout geometry", () => {
  it("keeps a valid stored desktop width and closes an absent pane", () => {
    expect(
      getDesktopSidebarWidthPx({
        isOpen: true,
        storedWidthPx: 280,
        viewportWidthPx: 1200,
      }),
    ).toBe(280);
    expect(
      getDesktopSidebarWidthPx({
        isOpen: false,
        storedWidthPx: 280,
        viewportWidthPx: 1200,
      }),
    ).toBe(0);
  });

  it("clamps an open desktop pane to the package width range", () => {
    const viewportWidthPx = 1200;

    expect(
      getDesktopSidebarWidthPx({
        isOpen: true,
        storedWidthPx: 20,
        viewportWidthPx,
      }),
    ).toBe(SIDEBAR_LAYOUT_DESKTOP_SIDEBAR_MIN_WIDTH_PX);
    expect(
      getDesktopSidebarWidthPx({
        isOpen: true,
        storedWidthPx: 1000,
        viewportWidthPx,
      }),
    ).toBe(getDesktopSidebarMaxWidthPx(viewportWidthPx));
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
