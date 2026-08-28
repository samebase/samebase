import { describe, expect, it } from "vite-plus/test";
import {
  WORKSPACE_LAYOUT_V2_MOBILE_MAIN_MIN_WIDTH_PX,
  getMergedMobileMainWidthPx,
  getMobilePaneFromScrollLeft,
  getMobilePaneScrollLeftPx,
  getMobileSidebarMaxWidthPx,
  getMobileSidebarMinWidthPx,
} from "../src/WorkspaceLayoutV2Geometry.ts";

describe("workspace layout geometry", () => {
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
        mainMinWidthPx: WORKSPACE_LAYOUT_V2_MOBILE_MAIN_MIN_WIDTH_PX,
        sideMinWidthPx: 120,
        viewportWidthPx: 300,
      }),
    ).toBeNull();
  });
});
