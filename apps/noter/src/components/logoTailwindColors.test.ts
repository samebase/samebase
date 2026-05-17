import { describe, expect, it } from "vite-plus/test";

import {
  getLogoColorCssHsl,
  getLogoColorForegroundCssHsl,
  getTailwindColorHex,
  getTailwindColorTokenForSelection,
  isLogoColorToken,
  isTailwindColorToken,
} from "#src/components/logoTailwindColors.ts";

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
    expect(isLogoColorToken("#fb2c36")).toBe(true);
    expect(isLogoColorToken("not-a-token")).toBe(false);
  });

  it("uses a visible family swatch when the previous shade is not available", () => {
    expect(
      getTailwindColorTokenForSelection("Red", "base", "secondary-base"),
    ).toBe("red-500");
  });

  it("converts logo colors to CSS variable HSL triplets", () => {
    expect(getLogoColorCssHsl("#ffffff")).toBe("0 0% 100%");
    expect(getLogoColorCssHsl("#000")).toBe("0 0% 0%");
    expect(getLogoColorForegroundCssHsl("#000000")).toBe("0 0% 100%");
    expect(getLogoColorForegroundCssHsl("red-500")).toBe("24 9.8% 10%");
    expect(getLogoColorForegroundCssHsl("#ffffff")).toBe("24 9.8% 10%");
  });
});
