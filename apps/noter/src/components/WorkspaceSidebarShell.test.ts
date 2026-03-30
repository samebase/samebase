import { describe, expect, it } from "vitest";

import { getSettledMobilePane } from "@/lib/workspaceSidebar";

describe("getSettledMobilePane", () => {
  it("keeps a left-originated swipe on main when it finishes nearest to main", () => {
    expect(getSettledMobilePane(360, true, 280, true, 280)).toBe("main");
  });

  it("keeps a left-originated far swipe on the right pane when it finishes nearest there", () => {
    expect(getSettledMobilePane(450, true, 280, true, 280)).toBe("right");
  });

  it("keeps the behavior symmetric from the right sidebar", () => {
    expect(getSettledMobilePane(200, true, 280, true, 280)).toBe("main");
    expect(getSettledMobilePane(120, true, 280, true, 280)).toBe("left");
  });

  it("still uses nearest-pane settling when the swipe starts from main", () => {
    expect(getSettledMobilePane(430, true, 280, true, 280)).toBe("right");
  });
});
