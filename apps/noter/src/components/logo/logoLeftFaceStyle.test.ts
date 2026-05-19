import { describe, expect, it } from "vite-plus/test";
import {
  getLogoLeftFaceStripeBasisScale,
  normalizeLogoLeftFaceStyle,
} from "@/components/logo/logoLeftFaceStyle";

describe("logoLeftFaceStyle", () => {
  it("converts cross-section stripe measures to perpendicular shader scale", () => {
    expect(
      getLogoLeftFaceStripeBasisScale({
        stripeAngleDegrees: 45,
        stripeBasis: "horizontal",
      }),
    ).toBeCloseTo(Math.SQRT1_2);
    expect(
      getLogoLeftFaceStripeBasisScale({
        stripeAngleDegrees: 45,
        stripeBasis: "vertical",
      }),
    ).toBeCloseTo(Math.SQRT1_2);
    expect(
      getLogoLeftFaceStripeBasisScale({
        stripeAngleDegrees: 22.5,
        stripeBasis: "raw",
      }),
    ).toBe(1);
  });

  it("keeps auto stripe basis away from horizontal and vertical singularities", () => {
    expect(
      getLogoLeftFaceStripeBasisScale({
        stripeAngleDegrees: 0,
        stripeBasis: "horizontal",
      }),
    ).toBe(0);
    expect(
      getLogoLeftFaceStripeBasisScale({
        stripeAngleDegrees: 0,
        stripeBasis: "auto",
      }),
    ).toBe(1);
    expect(
      getLogoLeftFaceStripeBasisScale({
        stripeAngleDegrees: 90,
        stripeBasis: "vertical",
      }),
    ).toBe(0);
    expect(
      getLogoLeftFaceStripeBasisScale({
        stripeAngleDegrees: 90,
        stripeBasis: "auto",
      }),
    ).toBe(1);
  });

  it("normalizes striped left-face styles without changing the selected basis", () => {
    expect(
      normalizeLogoLeftFaceStyle({
        kind: "striped",
        stripeAngleDegrees: 45,
        stripeBasis: "vertical",
        stripeGap: 0.2,
        stripeGapLinked: false,
        stripeOffset: 0,
        stripeWidth: 0.16,
      }),
    ).toMatchObject({
      kind: "striped",
      stripeBasis: "vertical",
    });
  });
});
