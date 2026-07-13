import { describe, expect, it } from "vite-plus/test";
import { advanceLogoAutoRotation } from "@/components/logo/logoAutoRotation";

describe("advanceLogoAutoRotation", () => {
  it("rotates at 12 degrees per second", () => {
    expect(advanceLogoAutoRotation(45, 1)).toBe(57);
  });

  it("applies resume speed and wraps the result", () => {
    expect(advanceLogoAutoRotation(359, 0.5, 0.5)).toBe(2);
  });
});
