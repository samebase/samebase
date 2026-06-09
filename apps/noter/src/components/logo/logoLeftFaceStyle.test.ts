import { describe, expect, it } from "vite-plus/test";
import {
  LOGO_SINGLE_COLOR_STRIPED_LEFT_FACE_STYLE,
  LOGO_LEFT_FACE_STRIPE,
  getLogoLeftFaceStripeBasisScale,
  normalizeLogoLeftFaceStyle,
} from "@/components/logo/logoLeftFaceStyle";

describe("logoLeftFaceStyle", () => {
  it("defines the canonical single-color stripe treatment as the striped default", () => {
    expect(LOGO_SINGLE_COLOR_STRIPED_LEFT_FACE_STYLE).toEqual({
      kind: "striped",
      stripeAngleDegrees: -45,
      stripeBasis: "vertical",
      stripeGap: 0.25,
      stripeGapLinked: false,
      stripeOffset: 0,
      stripeWidth: 0.25,
    });
    expect(LOGO_LEFT_FACE_STRIPE.angleDegrees.defaultValue).toBe(-45);
    expect(LOGO_LEFT_FACE_STRIPE.basis.defaultValue).toBe("vertical");
    expect(LOGO_LEFT_FACE_STRIPE.gap.defaultValue).toBe(0.25);
    expect(LOGO_LEFT_FACE_STRIPE.offset.defaultValue).toBe(0);
    expect(LOGO_LEFT_FACE_STRIPE.width.defaultValue).toBe(0.25);
  });

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
