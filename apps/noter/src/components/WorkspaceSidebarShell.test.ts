import { describe, expect, it } from "vitest";

import { getSettledMobilePane } from "@/lib/workspaceSidebar";

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

  it("still uses nearest-pane settling when the swipe starts from main", () => {
    expect(getSettledMobilePane("main", 430, true, 280, true, 280)).toBe(
      "right",
    );
  });
});
