import { describe, expect, it } from "vite-plus/test";
import {
  getLogoPresentationTiltDampingAlpha,
  getPointerLogoPresentationTiltTarget,
  NEUTRAL_LOGO_PRESENTATION_TILT_TARGET,
  normalizeLogoPresentationTiltTarget,
} from "@/components/logo/logoPresentationTilt";

const BOUNDS = {
  bottom: 300,
  height: 200,
  left: 100,
  right: 300,
  top: 100,
  width: 200,
};

describe("logo presentation tilt", () => {
  it("eases toward a changed target instead of applying it in one frame", () => {
    expect(getLogoPresentationTiltDampingAlpha(0)).toBe(0);

    const frameAlpha = getLogoPresentationTiltDampingAlpha(1 / 60);
    expect(frameAlpha).toBeGreaterThan(0);
    expect(frameAlpha).toBeLessThan(1);
    expect(getLogoPresentationTiltDampingAlpha(1)).toBeGreaterThan(frameAlpha);
    expect(getLogoPresentationTiltDampingAlpha(1)).toBeLessThan(1);
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

  it("grows smoothly with distance outside the grab surface", () => {
    const near = getPointerLogoPresentationTiltTarget({
      bounds: BOUNDS,
      clientX: 350,
      clientY: 200,
    });
    const far = getPointerLogoPresentationTiltTarget({
      bounds: BOUNDS,
      clientX: 550,
      clientY: 200,
    });

    expect(near.vertical).toBe(0);
    expect(near.horizontal).toBeGreaterThan(0);
    expect(near.horizontal).toBeLessThan(far.horizontal);
    expect(far).toEqual({ horizontal: 1, vertical: 0 });
  });

  it("preserves direction while capping diagonal strength", () => {
    const target = getPointerLogoPresentationTiltTarget({
      bounds: BOUNDS,
      clientX: 600,
      clientY: -200,
    });

    expect(target.horizontal).toBeCloseTo(Math.SQRT1_2);
    expect(target.vertical).toBeCloseTo(Math.SQRT1_2);
    expect(Math.hypot(target.horizontal, target.vertical)).toBeCloseTo(1);
  });

  it("normalizes interchangeable input sources to the renderer contract", () => {
    expect(normalizeLogoPresentationTiltTarget(undefined)).toBe(
      NEUTRAL_LOGO_PRESENTATION_TILT_TARGET,
    );
    expect(normalizeLogoPresentationTiltTarget({ horizontal: 3, vertical: 4 })).toEqual({
      horizontal: 0.6,
      vertical: 0.8,
    });
    expect(normalizeLogoPresentationTiltTarget({ horizontal: Number.NaN, vertical: 0 })).toBe(
      NEUTRAL_LOGO_PRESENTATION_TILT_TARGET,
    );
  });
});
