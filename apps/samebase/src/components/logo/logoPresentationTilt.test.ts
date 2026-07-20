import { describe, expect, it } from "vite-plus/test";
import {
  getLogoPresentationTiltDampingAlpha,
  getPointerLogoPresentationTiltTarget,
  NEUTRAL_LOGO_PRESENTATION_TILT_TARGET,
  resolveLogoPresentationTiltTarget,
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

  it("adds six degrees per 1.25 shortest-side distances without a cap", () => {
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
    expect(near.horizontal).toBeCloseTo(6);
    expect(far).toEqual({ horizontal: 12, vertical: 0 });
  });

  it("preserves direction while allowing diagonal strength beyond twelve degrees", () => {
    const target = getPointerLogoPresentationTiltTarget({
      bounds: BOUNDS,
      clientX: 800,
      clientY: -400,
    });

    expect(target.horizontal).toBeCloseTo(12);
    expect(target.vertical).toBeCloseTo(12);
    expect(Math.hypot(target.horizontal, target.vertical)).toBeGreaterThan(12);
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
