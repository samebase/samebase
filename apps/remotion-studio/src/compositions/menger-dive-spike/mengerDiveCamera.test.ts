import { d } from "typegpu";
import { describe, expect, test } from "vitest";

import { mengerDiveZoomPeriodSeconds, readMengerDiveCamera } from "./mengerDiveCamera";
import { mengerDiveDistance } from "./mengerDiveDistance";

describe("Menger dive camera", () => {
  test("repeats its pose one zoom period later at one third of the scale", () => {
    const start = readMengerDiveCamera(0.7);
    const nextPeriod = readMengerDiveCamera(0.7 + mengerDiveZoomPeriodSeconds);

    for (const axis of [0, 1, 2] as const) {
      expect(nextPeriod.position[axis]).toBeCloseTo(start.position[axis] / 3, 12);
      expect(nextPeriod.forward[axis]).toBe(start.forward[axis]);
      expect(nextPeriod.right[axis]).toBe(start.right[axis]);
      expect(nextPeriod.up[axis]).toBe(start.up[axis]);
    }
    expect(nextPeriod.distanceToFixedPoint).toBeCloseTo(start.distanceToFixedPoint / 3, 12);
    expect(nextPeriod.coarsestPeriod).toBe(start.coarsestPeriod / 3);
  });

  test("stays in empty space with clearance of at least 4 percent of its scale", () => {
    const sampleCount = 1_500;
    let minimumRelativeClearance = Number.POSITIVE_INFINITY;
    for (let sample = 0; sample <= sampleCount; sample += 1) {
      const camera = readMengerDiveCamera((sample / sampleCount) * 2 * mengerDiveZoomPeriodSeconds);
      // A closed tunnel width of zero evaluates every level down to the finest one.
      const clearance = mengerDiveDistance(d.vec3f(...camera.position), camera.coarsestPeriod, 0);
      minimumRelativeClearance = Math.min(
        minimumRelativeClearance,
        clearance / camera.distanceToFixedPoint,
      );
    }

    expect(minimumRelativeClearance).toBeGreaterThan(0.04);
  });
});
