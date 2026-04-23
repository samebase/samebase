import { describe, expect, it } from "vite-plus/test";

import {
  resolveDraggedAngleDegrees,
  resolveLogoViewState,
} from "@/components/logoViewDrag";
import { PUBLIC_LANDING_LOGO_VIEW_DRAG_CONFIG } from "@/lib/publicLandingLogo";

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

  it("snaps to the nearest 45-degree rotation target", () => {
    expect(
      resolveDraggedAngleDegrees({
        snapDegrees: [0, 45, 90],
        snapThresholdDegrees: 2,
        stepDegrees: 1,
        value: 43.6,
      }),
    ).toBe(45);
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

describe("resolveLogoViewState", () => {
  it("applies the shared landing snap config to arbitrary view state", () => {
    expect(
      resolveLogoViewState({
        config: PUBLIC_LANDING_LOGO_VIEW_DRAG_CONFIG,
        view: {
          elevationDegrees: 359.1,
          rotationDegrees: 14.3,
        },
      }),
    ).toEqual({
      elevationDegrees: 0,
      rotationDegrees: 14,
    });
  });

  it("uses the diagonal elevation snap family for diagonal rotations", () => {
    expect(
      resolveLogoViewState({
        config: PUBLIC_LANDING_LOGO_VIEW_DRAG_CONFIG,
        view: {
          elevationDegrees: 35.6,
          rotationDegrees: 43.6,
        },
      }),
    ).toEqual({
      elevationDegrees: EXACT_ISOMETRIC_ELEVATION_DEGREES,
      rotationDegrees: 45,
    });
  });

  it("keeps the shared cardinal elevation snaps for diagonal rotations", () => {
    expect(
      resolveLogoViewState({
        config: PUBLIC_LANDING_LOGO_VIEW_DRAG_CONFIG,
        view: {
          elevationDegrees: 359.1,
          rotationDegrees: 43.6,
        },
      }),
    ).toEqual({
      elevationDegrees: 0,
      rotationDegrees: 45,
    });
  });

  it("does not use the diagonal elevation snap family for orthographic rotations", () => {
    expect(
      resolveLogoViewState({
        config: PUBLIC_LANDING_LOGO_VIEW_DRAG_CONFIG,
        view: {
          elevationDegrees: 35.6,
          rotationDegrees: 1.2,
        },
      }),
    ).toEqual({
      elevationDegrees: 36,
      rotationDegrees: 0,
    });
  });

  it("preserves arbitrary values when no snap config is provided", () => {
    expect(
      resolveLogoViewState({
        view: {
          elevationDegrees: 359.1,
          rotationDegrees: 14.3,
        },
      }),
    ).toEqual({
      elevationDegrees: 359.1,
      rotationDegrees: 14.3,
    });
  });
});
