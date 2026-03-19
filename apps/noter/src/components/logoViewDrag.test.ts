import { describe, expect, it } from "vitest";

import { resolveDraggedAngleDegrees } from "@/components/logoViewDrag";

const EXACT_ISOMETRIC_ELEVATION_DEGREES = 35.26438968;

describe("resolveDraggedAngleDegrees", () => {
  it("quantizes drag output to whole degrees", () => {
    expect(
      resolveDraggedAngleDegrees({
        stepDegrees: 1,
        value: 12.6,
      }),
    ).toBe(13);
  });

  it("snaps to the exact isometric elevation when the quantized value is nearby", () => {
    expect(
      resolveDraggedAngleDegrees({
        snapDegrees: [30, EXACT_ISOMETRIC_ELEVATION_DEGREES, 45],
        snapThresholdDegrees: 2,
        stepDegrees: 1,
        value: 35.6,
      }),
    ).toBe(EXACT_ISOMETRIC_ELEVATION_DEGREES);
  });

  it("keeps the quantized value when no snap target is within range", () => {
    expect(
      resolveDraggedAngleDegrees({
        snapDegrees: [30, EXACT_ISOMETRIC_ELEVATION_DEGREES, 45],
        snapThresholdDegrees: 2,
        stepDegrees: 1,
        value: 38.6,
      }),
    ).toBe(39);
  });

  it("supports wraparound snaps near zero degrees", () => {
    expect(
      resolveDraggedAngleDegrees({
        snapDegrees: [0, 15],
        snapThresholdDegrees: 2,
        stepDegrees: 1,
        value: 359.4,
      }),
    ).toBe(0);
  });

  it("lets modifier keys bypass snapping while keeping whole-degree movement", () => {
    expect(
      resolveDraggedAngleDegrees({
        disableSnap: true,
        snapDegrees: [EXACT_ISOMETRIC_ELEVATION_DEGREES],
        snapThresholdDegrees: 2,
        stepDegrees: 1,
        value: 35.6,
      }),
    ).toBe(36);
  });
});
