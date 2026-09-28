import { describe, expect, it } from "vite-plus/test";
import {
  getLogoPresentationTiltTransitionAlpha,
  getPointerLogoPresentationTiltTarget,
  getRadialPointerLogoPresentationTiltTarget,
  NEUTRAL_LOGO_PRESENTATION_TILT_TARGET,
  resolveLogoPresentationTiltTarget,
} from "@/logo/logoPresentationTilt";

const BOUNDS = {
  bottom: 300,
  height: 200,
  left: 100,
  right: 300,
  top: 100,
  width: 200,
};

describe("logo presentation tilt", () => {
  it("eases toward every target without allowing distant targets to jump", () => {
    expect(getLogoPresentationTiltTransitionAlpha({ deltaSeconds: 0, remainingDegrees: 6 })).toBe(
      0,
    );

    const frameAlpha = getLogoPresentationTiltTransitionAlpha({
      deltaSeconds: 1 / 60,
      remainingDegrees: 6,
    });
    expect(frameAlpha).toBeGreaterThan(0);
    expect(frameAlpha).toBeLessThan(1);

    const distantFrameAlpha = getLogoPresentationTiltTransitionAlpha({
      deltaSeconds: 1 / 60,
      remainingDegrees: 180,
    });
    expect(distantFrameAlpha * 180).toBeCloseTo(2);

    const resumedFrameAlpha = getLogoPresentationTiltTransitionAlpha({
      deltaSeconds: 1,
      remainingDegrees: 180,
    });
    expect(resumedFrameAlpha * 180).toBeCloseTo(7.68);
  });

  it("stays neutral everywhere inside the grab surface", () => {
    expect(
      getPointerLogoPresentationTiltTarget({
        bounds: BOUNDS,
        clientX: 300,
        clientY: 100,
      }),
    ).toBe(NEUTRAL_LOGO_PRESENTATION_TILT_TARGET);
    expect(
      getPointerLogoPresentationTiltTarget({
        bounds: BOUNDS,
        clientX: 200,
        clientY: 200,
      }),
    ).toBe(NEUTRAL_LOGO_PRESENTATION_TILT_TARGET);
  });

  it("adds twelve degrees per 1.25 shortest-side distances without a cap", () => {
    const near = getPointerLogoPresentationTiltTarget({
      bounds: BOUNDS,
      clientX: 550,
      clientY: 200,
    });
    const far = getPointerLogoPresentationTiltTarget({
      bounds: BOUNDS,
      clientX: 800,
      clientY: 200,
    });

    expect(near.vertical).toBe(0);
    expect(near.horizontal).toBeCloseTo(12);
    expect(far).toEqual({ horizontal: 24, vertical: 0 });
  });

  it("preserves direction while allowing diagonal strength beyond twenty-four degrees", () => {
    const target = getPointerLogoPresentationTiltTarget({
      bounds: BOUNDS,
      clientX: 800,
      clientY: -400,
    });

    expect(target.horizontal).toBeCloseTo(24);
    expect(target.vertical).toBeCloseTo(24);
    expect(Math.hypot(target.horizontal, target.vertical)).toBeGreaterThan(24);
  });

  it("starts radial tilt outside the cube-relative neutral circle", () => {
    expect(
      getRadialPointerLogoPresentationTiltTarget({
        baseRadius: 100,
        centerX: 200,
        centerY: 200,
        clientX: 300,
        clientY: 200,
        radiusScale: 1,
        strengthScale: 1,
      }),
    ).toBe(NEUTRAL_LOGO_PRESENTATION_TILT_TARGET);

    const east = getRadialPointerLogoPresentationTiltTarget({
      baseRadius: 100,
      centerX: 200,
      centerY: 200,
      clientX: 325,
      clientY: 200,
      radiusScale: 1,
      strengthScale: 1,
    });
    expect(east.horizontal).toBeCloseTo(1.2);
    expect(east.vertical).toBe(0);
    const north = getRadialPointerLogoPresentationTiltTarget({
      baseRadius: 100,
      centerX: 200,
      centerY: 200,
      clientX: 200,
      clientY: 75,
      radiusScale: 1,
      strengthScale: 1,
    });
    expect(north.horizontal).toBe(0);
    expect(north.vertical).toBeCloseTo(1.2);

    const diagonal = getRadialPointerLogoPresentationTiltTarget({
      baseRadius: 100,
      centerX: 200,
      centerY: 200,
      clientX: 200 + 125 / Math.sqrt(2),
      clientY: 200 - 125 / Math.sqrt(2),
      radiusScale: 1,
      strengthScale: 1,
    });
    expect(diagonal.horizontal).toBeCloseTo(1.2 / Math.sqrt(2));
    expect(diagonal.vertical).toBeCloseTo(1.2 / Math.sqrt(2));
  });

  it("changes only the radial neutral threshold when its scale changes", () => {
    expect(
      getRadialPointerLogoPresentationTiltTarget({
        baseRadius: 100,
        centerX: 200,
        centerY: 200,
        clientX: 310,
        clientY: 200,
        radiusScale: 1.2,
        strengthScale: 1,
      }),
    ).toBe(NEUTRAL_LOGO_PRESENTATION_TILT_TARGET);
    const active = getRadialPointerLogoPresentationTiltTarget({
      baseRadius: 100,
      centerX: 200,
      centerY: 200,
      clientX: 330,
      clientY: 200,
      radiusScale: 1.2,
      strengthScale: 1,
    });
    expect(active.horizontal).toBeCloseTo(0.48);
    expect(active.vertical).toBe(0);
  });

  it("changes only the radial target angle when its strength changes", () => {
    const doubleStrength = getRadialPointerLogoPresentationTiltTarget({
      baseRadius: 100,
      centerX: 200,
      centerY: 200,
      clientX: 325,
      clientY: 200,
      radiusScale: 1,
      strengthScale: 2,
    });
    expect(doubleStrength.horizontal).toBeCloseTo(2.4);
    expect(doubleStrength.vertical).toBe(0);
    expect(
      getRadialPointerLogoPresentationTiltTarget({
        baseRadius: 100,
        centerX: 200,
        centerY: 200,
        clientX: 325,
        clientY: 200,
        radiusScale: 1,
        strengthScale: 0,
      }),
    ).toBe(NEUTRAL_LOGO_PRESENTATION_TILT_TARGET);
  });

  it("resolves interchangeable degree inputs to the renderer contract", () => {
    expect(resolveLogoPresentationTiltTarget(undefined)).toBe(
      NEUTRAL_LOGO_PRESENTATION_TILT_TARGET,
    );
    expect(resolveLogoPresentationTiltTarget({ horizontal: 3, vertical: 4 })).toEqual({
      horizontal: 3,
      vertical: 4,
    });
    expect(resolveLogoPresentationTiltTarget({ horizontal: Number.NaN, vertical: 0 })).toBe(
      NEUTRAL_LOGO_PRESENTATION_TILT_TARGET,
    );
  });
});
