import { describe, expect, it } from "vite-plus/test";

import {
  DEFAULT_LOGO_ISOMETRIC_CUBE_SIDE_PX,
  MAX_LOGO_ISOMETRIC_CUBE_SIDE_PX,
  MIN_LOGO_ISOMETRIC_CUBE_SIDE_PX,
  getLogoIsometricFrameMetrics,
  normalizeLogoIsometricCubeSidePixels,
} from "@/components/logo/logoIsometricRenderer";

describe("normalizeLogoIsometricCubeSidePixels", () => {
  it("rounds incoming values to the nearest supported even pixel step", () => {
    expect(normalizeLogoIsometricCubeSidePixels(15)).toBe(16);
    expect(normalizeLogoIsometricCubeSidePixels(17)).toBe(18);
  });

  it("clamps values to the supported cube side range", () => {
    expect(normalizeLogoIsometricCubeSidePixels(1)).toBe(
      MIN_LOGO_ISOMETRIC_CUBE_SIDE_PX,
    );
    expect(normalizeLogoIsometricCubeSidePixels(999)).toBe(
      MAX_LOGO_ISOMETRIC_CUBE_SIDE_PX,
    );
  });

  it("returns the default for non-finite input", () => {
    expect(normalizeLogoIsometricCubeSidePixels(Number.NaN)).toBe(
      DEFAULT_LOGO_ISOMETRIC_CUBE_SIDE_PX,
    );
    expect(normalizeLogoIsometricCubeSidePixels(Number.POSITIVE_INFINITY)).toBe(
      DEFAULT_LOGO_ISOMETRIC_CUBE_SIDE_PX,
    );
    expect(normalizeLogoIsometricCubeSidePixels(Number.NEGATIVE_INFINITY)).toBe(
      DEFAULT_LOGO_ISOMETRIC_CUBE_SIDE_PX,
    );
  });
});

describe("getLogoIsometricFrameMetrics", () => {
  it("keeps the legacy geometry for the default cube side", () => {
    expect(getLogoIsometricFrameMetrics()).toMatchObject({
      canvasHeight: 105,
      canvasWidth: 105,
      cubeSidePixels: DEFAULT_LOGO_ISOMETRIC_CUBE_SIDE_PX,
      tileHalfHeight: 8,
      tileHalfWidth: 16,
      voxelScreenHeight: 16,
    });
  });

  it("scales raster dimensions with the exact frame cube side length", () => {
    expect(getLogoIsometricFrameMetrics(17)).toMatchObject({
      canvasHeight: 111,
      canvasWidth: 111,
      cubeSidePixels: 17,
      tileHalfHeight: 8.5,
      tileHalfWidth: 17,
      voxelScreenHeight: 17,
    });
  });

  it("scales raster dimensions with recursive grid size", () => {
    expect(getLogoIsometricFrameMetrics(16, 9)).toMatchObject({
      canvasHeight: 297,
      canvasWidth: 297,
      cubeSidePixels: 16,
      tileHalfHeight: 8,
      tileHalfWidth: 16,
      voxelScreenHeight: 16,
    });
  });
});
