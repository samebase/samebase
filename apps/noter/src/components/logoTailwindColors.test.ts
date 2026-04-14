// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import {
  getFaceColorCssValue,
  getTailwindColorHex,
  normalizeFaceColorValue,
} from "@/components/logoTailwindColors";

describe("logoTailwindColors", () => {
  it("converts Tailwind palette values into browser-accurate hex for color-input consumers", () => {
    expect(getTailwindColorHex("blue-700")).toBe("#1447e6");
  });

  it("keeps Tailwind palette values as CSS colors for freeform inputs", () => {
    expect(getFaceColorCssValue("blue-700")).toBe("oklch(48.8% 0.243 264.376)");
  });

  it("normalizes shorthand custom hex colors", () => {
    expect(normalizeFaceColorValue("#ABC")).toBe("#aabbcc");
  });

  it("accepts supported CSS color strings", () => {
    expect(normalizeFaceColorValue("oklch(48.8% 0.243 264.376)")).toBe(
      "oklch(48.8% 0.243 264.376)",
    );
  });
});
