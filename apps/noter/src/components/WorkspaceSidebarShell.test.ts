import { describe, expect, it } from "vite-plus/test";

import {
  getSettledMobilePane,
  MOBILE_CROSS_SWIPE_TRAVEL_THRESHOLD_RATIO,
  MOBILE_CROSS_SWIPE_VELOCITY_THRESHOLD_PX_PER_MS,
  MOBILE_SIDEBAR_RETURN_TRAVEL_THRESHOLD_RATIO,
} from "@/lib/workspaceSidebar";

const SIDEBAR_WIDTH_PX = 280;
const MAIN_SCROLL_LEFT_PX = SIDEBAR_WIDTH_PX;
const CROSS_SWIPE_REQUIRED_TRAVEL_PX =
  SIDEBAR_WIDTH_PX * MOBILE_CROSS_SWIPE_TRAVEL_THRESHOLD_RATIO;
const SIDEBAR_RETURN_REQUIRED_TRAVEL_PX =
  SIDEBAR_WIDTH_PX * MOBILE_SIDEBAR_RETURN_TRAVEL_THRESHOLD_RATIO;
const JUST_BELOW_THRESHOLD_DELTA = 0.01;

describe("getSettledMobilePane", () => {
  it("keeps a left-originated swipe on main when it finishes nearest to main", () => {
    expect(getSettledMobilePane("left", 360, true, 280, true, 280)).toBe(
      "main",
    );
  });

  it("keeps a left-originated far swipe on the right pane when it finishes nearest there", () => {
    expect(getSettledMobilePane("left", 450, true, 280, true, 280)).toBe(
      "right",
    );
  });

  it("allows a deliberate fast left-to-right cross swipe even when the browser stops on main", () => {
    expect(
      getSettledMobilePane("left", 280, true, 280, true, 280, {
        releaseFingerVelocityXPxPerMs: -1.5,
        startPane: "left",
        totalFingerDeltaXPx: -250,
      }),
    ).toBe("right");
  });

  it("keeps casual cross-sidebar overshoots on main", () => {
    expect(
      getSettledMobilePane("left", 280, true, 280, true, 280, {
        releaseFingerVelocityXPxPerMs: -0.8,
        startPane: "left",
        totalFingerDeltaXPx: -180,
      }),
    ).toBe("main");
  });

  it("keeps the behavior symmetric from the right sidebar", () => {
    expect(getSettledMobilePane("right", 200, true, 280, true, 280)).toBe(
      "main",
    );
    expect(getSettledMobilePane("right", 120, true, 280, true, 280)).toBe(
      "left",
    );
    expect(
      getSettledMobilePane("right", 280, true, 280, true, 280, {
        releaseFingerVelocityXPxPerMs: 1.5,
        startPane: "right",
        totalFingerDeltaXPx: 250,
      }),
    ).toBe("left");
  });

  it("settles back to main before the midpoint once a sidebar return drag is deliberate", () => {
    expect(
      getSettledMobilePane(
        "left",
        SIDEBAR_RETURN_REQUIRED_TRAVEL_PX + JUST_BELOW_THRESHOLD_DELTA,
        true,
        SIDEBAR_WIDTH_PX,
        true,
        SIDEBAR_WIDTH_PX,
      ),
    ).toBe("main");
    expect(
      getSettledMobilePane(
        "right",
        SIDEBAR_WIDTH_PX * 2 -
          (SIDEBAR_RETURN_REQUIRED_TRAVEL_PX + JUST_BELOW_THRESHOLD_DELTA),
        true,
        SIDEBAR_WIDTH_PX,
        true,
        SIDEBAR_WIDTH_PX,
      ),
    ).toBe("main");
  });

  it("keeps shallower sidebar return drags on the originating sidebar", () => {
    expect(
      getSettledMobilePane(
        "left",
        SIDEBAR_RETURN_REQUIRED_TRAVEL_PX - JUST_BELOW_THRESHOLD_DELTA,
        true,
        SIDEBAR_WIDTH_PX,
        true,
        SIDEBAR_WIDTH_PX,
      ),
    ).toBe("left");
    expect(
      getSettledMobilePane(
        "right",
        SIDEBAR_WIDTH_PX * 2 -
          (SIDEBAR_RETURN_REQUIRED_TRAVEL_PX - JUST_BELOW_THRESHOLD_DELTA),
        true,
        SIDEBAR_WIDTH_PX,
        true,
        SIDEBAR_WIDTH_PX,
      ),
    ).toBe("right");
  });

  it("still uses nearest-pane settling when the swipe starts from main", () => {
    expect(getSettledMobilePane("main", 430, true, 280, true, 280)).toBe(
      "right",
    );
  });

  it("keeps mirrored just-below-threshold cross swipes on main from either sidebar", () => {
    expect(
      getSettledMobilePane(
        "left",
        MAIN_SCROLL_LEFT_PX,
        true,
        SIDEBAR_WIDTH_PX,
        true,
        SIDEBAR_WIDTH_PX,
        {
          releaseFingerVelocityXPxPerMs: -(
            MOBILE_CROSS_SWIPE_VELOCITY_THRESHOLD_PX_PER_MS + 0.01
          ),
          startPane: "left",
          totalFingerDeltaXPx: -(
            CROSS_SWIPE_REQUIRED_TRAVEL_PX - JUST_BELOW_THRESHOLD_DELTA
          ),
        },
      ),
    ).toBe("main");
    expect(
      getSettledMobilePane(
        "right",
        MAIN_SCROLL_LEFT_PX,
        true,
        SIDEBAR_WIDTH_PX,
        true,
        SIDEBAR_WIDTH_PX,
        {
          releaseFingerVelocityXPxPerMs:
            MOBILE_CROSS_SWIPE_VELOCITY_THRESHOLD_PX_PER_MS + 0.01,
          startPane: "right",
          totalFingerDeltaXPx:
            CROSS_SWIPE_REQUIRED_TRAVEL_PX - JUST_BELOW_THRESHOLD_DELTA,
        },
      ),
    ).toBe("main");
  });

  it("promotes mirrored at-threshold cross swipes from either sidebar", () => {
    expect(
      getSettledMobilePane(
        "left",
        MAIN_SCROLL_LEFT_PX,
        true,
        SIDEBAR_WIDTH_PX,
        true,
        SIDEBAR_WIDTH_PX,
        {
          releaseFingerVelocityXPxPerMs:
            -MOBILE_CROSS_SWIPE_VELOCITY_THRESHOLD_PX_PER_MS,
          startPane: "left",
          totalFingerDeltaXPx: -CROSS_SWIPE_REQUIRED_TRAVEL_PX,
        },
      ),
    ).toBe("right");
    expect(
      getSettledMobilePane(
        "right",
        MAIN_SCROLL_LEFT_PX,
        true,
        SIDEBAR_WIDTH_PX,
        true,
        SIDEBAR_WIDTH_PX,
        {
          releaseFingerVelocityXPxPerMs:
            MOBILE_CROSS_SWIPE_VELOCITY_THRESHOLD_PX_PER_MS,
          startPane: "right",
          totalFingerDeltaXPx: CROSS_SWIPE_REQUIRED_TRAVEL_PX,
        },
      ),
    ).toBe("left");
  });
});
