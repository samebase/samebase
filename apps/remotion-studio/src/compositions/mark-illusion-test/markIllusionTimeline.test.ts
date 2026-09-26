import { describe, expect, test } from "vitest";

import {
  markIllusionDurationInFrames,
  markIllusionFps,
  readMarkIllusionFrame,
} from "./markIllusionTimeline";

describe("mark illusion timeline", () => {
  test("keeps the side widths at 360 degrees in every frame", () => {
    for (let frame = 0; frame < markIllusionDurationInFrames; frame += 1) {
      const { sideWidthsDegrees } = readMarkIllusionFrame(frame / markIllusionFps, {
        forceWarp: false,
      }).warp;
      const total = sideWidthsDegrees.reduce((sum, width) => sum + width, 0);
      expect(total).toBeCloseTo(360, 9);
      expect(Math.min(...sideWidthsDegrees)).toBeGreaterThanOrEqual(0);
    }
  });

  test("switches the warp on and off only at the identity cube sides", () => {
    for (const time of [5.7, 8.8]) {
      const { warp } = readMarkIllusionFrame(time, { forceWarp: false });
      expect(warp.sideWidthsDegrees).toEqual([120, 120, 0, 0, 120]);
      expect(warp.clampPixels).toBe(0);
    }
    expect(readMarkIllusionFrame(5.69, { forceWarp: false }).warp.enabled).toBe(false);
    expect(readMarkIllusionFrame(5.7, { forceWarp: false }).warp.enabled).toBe(true);
    expect(readMarkIllusionFrame(8.8, { forceWarp: false }).warp.enabled).toBe(false);
  });

  test("reaches the exact isometric orthographic flat view before the hold", () => {
    const { camera, flatness } = readMarkIllusionFrame(5, { forceWarp: false });
    expect(camera.yawRadians).toBeCloseTo(-Math.PI / 4, 12);
    expect(camera.elevationRadians).toBeCloseTo(Math.atan(1 / Math.SQRT2), 12);
    expect(camera.tanHalfFieldOfView).toBe(0);
    expect(flatness).toBe(1);
  });
});
