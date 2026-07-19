import { describe, expect, it } from "vite-plus/test";
import { advanceLogoAutoRotation } from "../src/autoRotation.ts";

describe("advanceLogoAutoRotation", () => {
  it("advances at the logo rotation rate", () => {
    expect(advanceLogoAutoRotation(45, 1)).toBe(57);
  });

  it("wraps and applies the speed multiplier", () => {
    expect(advanceLogoAutoRotation(359, 0.5, 0.5)).toBe(2);
  });
});
