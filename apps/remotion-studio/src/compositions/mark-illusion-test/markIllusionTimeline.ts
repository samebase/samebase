export const markIllusionFps = 30;
export const markIllusionDurationInFrames = 300;

/** The camera looks at the (-1, 1, 1) cube corner, so the mark face (+z) is the right face. */
const isometricYawRadians = (-45 * Math.PI) / 180;
const isometricElevationRadians = Math.atan(1 / Math.SQRT2);
/** tan(22.5 degrees): a 45 degree vertical field of view at the most perspective moment. */
const perspectiveTanHalfFieldOfView = Math.tan(Math.PI / 8);

/**
Five warp sides in counterclockwise order from the top side. Width 0 hides a side. The top, left,
and right sides are the three isometric cube faces. The two middle sides open from the bottom line.
*/
export type MarkIllusionSideWidths = readonly [number, number, number, number, number];

const sideIndices = [0, 1, 2, 3, 4] as const;
const cubeSides: MarkIllusionSideWidths = [120, 120, 0, 0, 120];
const anticipationSides: MarkIllusionSideWidths = [108, 126, 0, 0, 126];
const fourSides: MarkIllusionSideWidths = [90, 90, 90, 0, 90];
const fiveSides: MarkIllusionSideWidths = [72, 72, 72, 72, 72];

export type MarkIllusionFrame = {
  camera: {
    elevationRadians: number;
    /** 0 is orthographic. The frustum keeps `halfHeight` at the cube center plane. */
    tanHalfFieldOfView: number;
    yawRadians: number;
  };
  /** 0 shows the lit 3D cube and 1 shows one flat tone for each face direction. */
  flatness: number;
  /** Horizontal and vertical scale of the flat mark about its center. */
  squash: readonly [number, number];
  warp: {
    /** Pixels that each warped side keeps away from its source face edges. 0 keeps the identity. */
    clampPixels: number;
    enabled: boolean;
    sideWidthsDegrees: MarkIllusionSideWidths;
  };
};

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

function progress(time: number, start: number, end: number): number {
  return clamp01((time - start) / (end - start));
}

function easeInOutCubic(value: number): number {
  return value < 0.5 ? 4 * value ** 3 : 1 - (-2 * value + 2) ** 3 / 2;
}

function easeInOutSine(value: number): number {
  return -(Math.cos(Math.PI * value) - 1) / 2;
}

/** Ends at 1 after an overshoot of about 6 percent. */
function easeOutBack(value: number): number {
  const overshoot = 1.4;
  return 1 + (overshoot + 1) * (value - 1) ** 3 + overshoot * (value - 1) ** 2;
}

function mixSides(
  from: MarkIllusionSideWidths,
  to: MarkIllusionSideWidths,
  amount: number,
): MarkIllusionSideWidths {
  const mix = (index: (typeof sideIndices)[number]) =>
    from[index] + (to[index] - from[index]) * amount;
  return [mix(0), mix(1), mix(2), mix(3), mix(4)];
}

function readSideWidths(time: number): MarkIllusionSideWidths {
  if (time < 6.05) {
    return mixSides(cubeSides, anticipationSides, easeInOutSine(progress(time, 5.7, 6.05)));
  }
  if (time < 7) {
    return mixSides(anticipationSides, fourSides, easeOutBack(progress(time, 6.05, 6.75)));
  }
  if (time < 8) {
    return mixSides(fourSides, fiveSides, easeOutBack(progress(time, 7, 7.6)));
  }
  return mixSides(fiveSides, cubeSides, easeInOutCubic(progress(time, 8, 8.8)));
}

/** One damped squash and stretch of the flat mark on the beat at 1.1 s. */
function readSquash(time: number): readonly [number, number] {
  const duration = 1;
  const elapsed = time - 1.1;
  if (elapsed <= 0 || elapsed >= duration) {
    return [1, 1];
  }
  const window = (1 - elapsed / duration) ** 2;
  const amount = 0.08 * Math.sin(2 * Math.PI * 1.6 * elapsed) * Math.exp(-3 * elapsed) * window;
  return [1 + amount, 1 - amount];
}

export function readMarkIllusionFrame(
  timeInSeconds: number,
  options: { forceWarp: boolean },
): MarkIllusionFrame {
  const time = timeInSeconds;
  const orbit = easeInOutCubic(progress(time, 2.5, 5));
  const turn = easeInOutCubic(progress(time, 8.8, 10));
  const perspective =
    easeInOutCubic(progress(time, 2.5, 3.3)) * (1 - easeInOutCubic(progress(time, 4, 5)));
  const lighting =
    easeInOutCubic(progress(time, 2.5, 3.1)) * (1 - easeInOutCubic(progress(time, 4, 5)));
  const sideWidthsDegrees = readSideWidths(time);
  const deviationDegrees = Math.max(
    ...sideIndices.map((index) => Math.abs(sideWidthsDegrees[index] - cubeSides[index])),
  );

  return {
    camera: {
      elevationRadians: isometricElevationRadians * orbit,
      tanHalfFieldOfView: perspectiveTanHalfFieldOfView * perspective,
      yawRadians: isometricYawRadians * orbit + (-90 * Math.PI * turn) / 180,
    },
    flatness: 1 - lighting,
    squash: readSquash(time),
    warp: {
      clampPixels: clamp01(deviationDegrees / 3),
      enabled: options.forceWarp || (time >= 5.7 && time < 8.8),
      sideWidthsDegrees,
    },
  };
}
