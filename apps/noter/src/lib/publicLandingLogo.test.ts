import { describe, expect, it } from "vite-plus/test";

import { shouldRevealPublicLandingLogoLink } from "@/lib/publicLandingLogo";

describe("shouldRevealPublicLandingLogoLink", () => {
  it("reveals for the darker orthographic face and its opposite", () => {
    expect(
      shouldRevealPublicLandingLogoLink({
        elevationDegrees: 0,
        rotationDegrees: 0,
      }),
    ).toBe(true);
    expect(
      shouldRevealPublicLandingLogoLink({
        elevationDegrees: 0,
        rotationDegrees: 180,
      }),
    ).toBe(true);
  });

  it("stays hidden for the lighter side and top-only single-face views", () => {
    expect(
      shouldRevealPublicLandingLogoLink({
        elevationDegrees: 0,
        rotationDegrees: 90,
      }),
    ).toBe(false);
    expect(
      shouldRevealPublicLandingLogoLink({
        elevationDegrees: 90,
        rotationDegrees: 45,
      }),
    ).toBe(false);
    expect(
      shouldRevealPublicLandingLogoLink({
        elevationDegrees: 35.26438968,
        rotationDegrees: 45,
      }),
    ).toBe(false);
  });
});
