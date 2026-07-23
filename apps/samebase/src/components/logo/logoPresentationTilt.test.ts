import { describe, expect, it } from "vite-plus/test";
import {
  getLogoPresentationTiltTransitionAlpha,
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

  it("adds ten degrees per 1.25 shortest-side distances without a cap", () => {
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
    expect(near.horizontal).toBeCloseTo(10);
    expect(far).toEqual({ horizontal: 20, vertical: 0 });
  });

  it("preserves direction while allowing diagonal strength beyond twenty degrees", () => {
    const target = getPointerLogoPresentationTiltTarget({
      bounds: BOUNDS,
      clientX: 800,
      clientY: -400,
    });

    expect(target.horizontal).toBeCloseTo(20);
    expect(target.vertical).toBeCloseTo(20);
    expect(Math.hypot(target.horizontal, target.vertical)).toBeGreaterThan(20);
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
