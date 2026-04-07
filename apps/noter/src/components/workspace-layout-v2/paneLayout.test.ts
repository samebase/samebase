import { describe, expect, it } from "vite-plus/test";
import {
  getWorkspaceLayoutV2PaneStartPx,
  getWorkspaceLayoutV2PaneVisibleStartPx,
  getWorkspaceLayoutV2SettledPane,
  getWorkspaceLayoutV2VisibleStartPx,
  type WorkspaceLayoutV2Metrics,
} from "./paneLayout";

const TEST_METRICS = {
  leftWidthPx: 304,
  rightWidthPx: 320,
  viewportWidthPx: 390,
} satisfies WorkspaceLayoutV2Metrics;

describe("workspaceLayoutV2 pane layout", () => {
  it("opens the left pane from main when the drag is deliberate", () => {
    expect(
      getWorkspaceLayoutV2SettledPane({
        currentPane: "main",
        dragOffsetPx: 140,
        metrics: TEST_METRICS,
        velocityPxPerMs: 0.1,
      }),
    ).toBe("left");
  });

  it("returns from the left pane to main with a lighter closing drag", () => {
    expect(
      getWorkspaceLayoutV2SettledPane({
        currentPane: "left",
        dragOffsetPx: -100,
        metrics: TEST_METRICS,
        velocityPxPerMs: 0.1,
      }),
    ).toBe("main");
  });

  it("never jumps directly from left to right in one release", () => {
    expect(
      getWorkspaceLayoutV2SettledPane({
        currentPane: "left",
        dragOffsetPx: -900,
        metrics: TEST_METRICS,
        velocityPxPerMs: 1.2,
      }),
    ).toBe("main");
  });

  it("anchors the right pane to the track's right edge instead of its left edge", () => {
    expect(getWorkspaceLayoutV2PaneVisibleStartPx("right", TEST_METRICS)).toBe(
      TEST_METRICS.leftWidthPx + TEST_METRICS.rightWidthPx,
    );
    const rightVisibleStartPx = getWorkspaceLayoutV2VisibleStartPx({
      currentPane: "right",
      dragOffsetPx: 0,
      metrics: TEST_METRICS,
    });
    expect(rightVisibleStartPx).toBe(
      TEST_METRICS.leftWidthPx + TEST_METRICS.rightWidthPx,
    );
    expect(
      getWorkspaceLayoutV2PaneStartPx("right", TEST_METRICS) -
        rightVisibleStartPx,
    ).toBe(TEST_METRICS.viewportWidthPx - TEST_METRICS.rightWidthPx);
  });

  it("clamps the visible range so an open sidebar can only drag back toward main", () => {
    expect(
      getWorkspaceLayoutV2VisibleStartPx({
        currentPane: "left",
        dragOffsetPx: 120,
        metrics: TEST_METRICS,
      }),
    ).toBe(0);
    expect(
      getWorkspaceLayoutV2VisibleStartPx({
        currentPane: "right",
        dragOffsetPx: -120,
        metrics: TEST_METRICS,
      }),
    ).toBe(TEST_METRICS.leftWidthPx + TEST_METRICS.rightWidthPx);
  });
});
