import { describe, expect, it } from "vite-plus/test";

import {
  getTailwindColorHex,
  getTailwindColorTokenForSelection,
  isTailwindColorToken,
} from "@/components/logoTailwindColors";

describe("logoTailwindColors", () => {
  it("converts Tailwind OKLCH palette colors to renderer-safe hex", () => {
    expect(getTailwindColorHex("red-500")).toBe("#fb2c36");
    expect(getTailwindColorHex("lime-50")).toBe("#f7fee7");
    expect(getTailwindColorHex("stone-950")).toBe("#0c0a09");
  });

  it("keeps explicit hex colors unchanged", () => {
    expect(getTailwindColorHex("#abc")).toBe("#abc");
    expect(getTailwindColorHex("#aabbcc")).toBe("#aabbcc");
  });

  it("detects palette tokens separately from custom colors", () => {
    expect(isTailwindColorToken("red-500")).toBe(true);
    expect(isTailwindColorToken("#fb2c36")).toBe(false);
  });

  it("uses a visible family swatch when the previous shade is not available", () => {
    expect(
      getTailwindColorTokenForSelection("Red", "base", "secondary-base"),
    ).toBe("red-500");
  });
});
