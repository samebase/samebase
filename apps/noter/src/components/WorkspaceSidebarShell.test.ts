import { describe, expect, it } from "vitest";

import { getSettledMobilePane } from "@/lib/workspaceSidebar";

describe("getSettledMobilePane", () => {
  it("keeps the main pane sticky when a left-sidebar swipe lightly overshoots", () => {
    expect(getSettledMobilePane("left", 430, true, 280, true, 280, 0.8)).toBe(
      "main",
    );
  });

  it("allows a direct cross-sidebar jump after a deep swipe", () => {
    expect(getSettledMobilePane("left", 540, true, 280, true, 280)).toBe(
      "right",
    );
  });

  it("allows a direct cross-sidebar jump for a fast fling", () => {
    expect(getSettledMobilePane("left", 450, true, 280, true, 280, 1.5)).toBe(
      "right",
    );
  });

  it("keeps the behavior symmetric from the right sidebar", () => {
    expect(getSettledMobilePane("right", 130, true, 280, true, 280, 0.7)).toBe(
      "main",
    );
    expect(getSettledMobilePane("right", 100, true, 280, true, 280, 1.45)).toBe(
      "left",
    );
    expect(getSettledMobilePane("right", 20, true, 280, true, 280)).toBe(
      "left",
    );
    expect(getSettledMobilePane("right", 80, true, 280, true, 280)).toBe(
      "main",
    );
  });

  it("still uses nearest-pane settling when the swipe starts from main", () => {
    expect(getSettledMobilePane("main", 430, true, 280, true, 280)).toBe(
      "right",
    );
  });
});
