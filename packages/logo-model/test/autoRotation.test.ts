import { describe, expect, it } from "vite-plus/test";
import {
  advanceLogoAutoRotation,
  normalizeLogoAutoRotateDegreesPerSecond,
} from "../src/autoRotation.ts";

describe("advanceLogoAutoRotation", () => {
  it("advances at the logo rotation rate", () => {
    expect(advanceLogoAutoRotation(45, 1)).toBe(57);
  });

  it("wraps and applies the speed multiplier", () => {
    expect(advanceLogoAutoRotation(359, 0.5, { speedMultiplier: 0.5 })).toBe(2);
  });

  it("uses a supplied degrees-per-second rate", () => {
    expect(advanceLogoAutoRotation(45, 1, { degreesPerSecond: 24 })).toBe(69);
  });
});

describe("normalizeLogoAutoRotateDegreesPerSecond", () => {
  it("keeps finite non-negative speeds", () => {
    expect(normalizeLogoAutoRotateDegreesPerSecond(24.5)).toBe(24.5);
  });

  it("uses zero for negative speeds and the default for non-finite speeds", () => {
    expect(normalizeLogoAutoRotateDegreesPerSecond(-1)).toBe(0);
    expect(normalizeLogoAutoRotateDegreesPerSecond(Number.NaN)).toBe(12);
  });
});
