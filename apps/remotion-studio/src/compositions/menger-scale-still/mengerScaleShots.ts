export const mengerScaleStillFps = 30;
/** Each still is frame 0. The short clip shows the slow drift that the still implies. */
export const mengerScaleStillDurationInFrames = 90;

type Vector = readonly [number, number, number];

export type MengerScaleShotId = 1 | 2 | 3;

export type MengerScaleShot = {
  /** Camera position at frame 0 and at the last frame, in sponge half-sizes. */
  drift: readonly [Vector, Vector];
  /** Distance at which the haze covers 63 percent of a surface. */
  hazeDistance: number;
  /** Vertical field of view in degrees. */
  fieldOfViewDegrees: number;
  /** Shows the flat mark at logo size in the foreground. */
  showsMark: boolean;
  sunDirection: Vector;
  target: Vector;
};

/** The sponge is the depth-7 Menger sponge with half-size 1 around the origin. */
export const mengerScaleShots = {
  // Low angle up one vertical edge, like a cliff or a tower that goes into the haze.
  1: {
    drift: [
      [1.16, -1.03, 1.34],
      [1.15, -1.01, 1.32],
    ],
    fieldOfViewDegrees: 62,
    hazeDistance: 1.5,
    showsMark: false,
    sunDirection: [-0.35, 0.8, 0.5],
    target: [0.97, -0.25, 0.99],
  },
  // One top corner in front of the haze; the rest of the sponge disappears behind it.
  2: {
    drift: [
      [1.3, 1.22, 1.46],
      [1.28, 1.21, 1.44],
    ],
    fieldOfViewDegrees: 44,
    hazeDistance: 0.95,
    showsMark: false,
    sunDirection: [-0.45, 0.75, 0.3],
    target: [0.7, 0.82, 0.68],
  },
  // Just above the top face, which fills the lower frame to a hazy horizon.
  3: {
    drift: [
      [-0.12, 1.0028, 0.985],
      [-0.12, 1.0028, 0.975],
    ],
    fieldOfViewDegrees: 50,
    hazeDistance: 0.75,
    showsMark: true,
    sunDirection: [0.5, 0.55, -0.65],
    // An 8 degree downward view puts the horizon in the upper third.
    target: [-0.08, 0.72, -1],
  },
} satisfies Record<MengerScaleShotId, MengerScaleShot>;
