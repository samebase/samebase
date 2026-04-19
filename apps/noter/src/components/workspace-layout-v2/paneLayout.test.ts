import { describe, expect, it } from "vitest";
import {
  getWorkspaceLayoutV2PaneStartPx,
  getWorkspaceLayoutV2PaneVisibleStartPx,
  getWorkspaceLayoutV2SettledPane,
  getWorkspaceLayoutV2VisibleStartPx,
  type WorkspaceLayoutV2Metrics,
} from "./paneLayout";

const TEST_METRICS = {
  leftWidthPx: 304,
  mainWidthPx: 358,
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
      TEST_METRICS.leftWidthPx +
        TEST_METRICS.mainWidthPx +
        TEST_METRICS.rightWidthPx -
        TEST_METRICS.viewportWidthPx,
    );
    const rightVisibleStartPx = getWorkspaceLayoutV2VisibleStartPx({
      currentPane: "right",
      dragOffsetPx: 0,
      metrics: TEST_METRICS,
    });
    expect(rightVisibleStartPx).toBe(
      TEST_METRICS.leftWidthPx +
        TEST_METRICS.mainWidthPx +
        TEST_METRICS.rightWidthPx -
        TEST_METRICS.viewportWidthPx,
    );
    expect(
      getWorkspaceLayoutV2PaneStartPx("right", TEST_METRICS) -
        rightVisibleStartPx,
    ).toBe(TEST_METRICS.viewportWidthPx - TEST_METRICS.rightWidthPx);
  });

  it("splits the mobile side peek around the main pane", () => {
    const mainVisibleStartPx = getWorkspaceLayoutV2PaneVisibleStartPx(
      "main",
      TEST_METRICS,
    );
    const expectedLeftPeekPx = Math.floor(
      (TEST_METRICS.viewportWidthPx - TEST_METRICS.mainWidthPx) / 2,
    );

    expect(mainVisibleStartPx).toBe(
      TEST_METRICS.leftWidthPx - expectedLeftPeekPx,
    );
    expect(
      getWorkspaceLayoutV2PaneStartPx("main", TEST_METRICS) -
        mainVisibleStartPx,
    ).toBe(expectedLeftPeekPx);
    expect(
      mainVisibleStartPx +
        TEST_METRICS.viewportWidthPx -
        (getWorkspaceLayoutV2PaneStartPx("main", TEST_METRICS) +
          TEST_METRICS.mainWidthPx),
    ).toBe(expectedLeftPeekPx);
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
    ).toBe(
      TEST_METRICS.leftWidthPx +
        TEST_METRICS.mainWidthPx +
        TEST_METRICS.rightWidthPx -
        TEST_METRICS.viewportWidthPx,
    );
  });
});
