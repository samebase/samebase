export const mengerDiveFps = 30;
export const mengerDiveDurationInFrames = 150;
/** One 3x zoom. The clip length equals one period, so frame 150 repeats frame 0. */
export const mengerDiveZoomPeriodSeconds = 5;

/**
The dive approaches the world origin, which is the midpoint of a sponge edge that runs along x.
Every level of the unbounded lattice centers its x cells on the origin and puts a y and z cell
corner on it, so scaling by 3 about the origin maps the sponge onto itself.

In the x = 0 plane, the only solid points are the Cantor dust where neither y nor z has a ternary
digit 1. The radial ray at this angle from the y axis keeps a clearance of about 4.5 percent of its
distance to the origin at every scale. A numerical search over all radial directions found no ray
with more clearance, and no clear ray at all toward a sponge corner.
*/
const diveAngleRadians = (30.066 * Math.PI) / 180;
/** Unit vector from the fixed point to the camera. */
const diveDirection = [0, Math.cos(diveAngleRadians), Math.sin(diveAngleRadians)] as const;
/**
Levels coarser than the camera level that the shader still evaluates. A level with tunnel width L
removes nothing within distance L of the fixed point, and rays stop at
`mengerDiveMaximumRayDistanceScale` camera distances, so level widths above 25 camera distances
cannot change a frame.
*/
const coarseLevelMargin = 3;

export const mengerDiveMaximumRayDistanceScale = 24;

export type MengerDiveVector = readonly [number, number, number];

export type MengerDiveCamera = {
  /** Width of the largest tunnel cell period that the shader evaluates. */
  coarsestPeriod: number;
  /** Camera distance to the fixed point. Every other scene length is relative to it. */
  distanceToFixedPoint: number;
  forward: MengerDiveVector;
  position: MengerDiveVector;
  right: MengerDiveVector;
  up: MengerDiveVector;
};

export function readMengerDiveCamera(timeInSeconds: number): MengerDiveCamera {
  const zoomExponent = timeInSeconds / mengerDiveZoomPeriodSeconds;
  const distanceToFixedPoint = 3 ** -zoomExponent;
  const coarsestLevel = Math.floor(zoomExponent) - coarseLevelMargin;
  const [, directionY, directionZ] = diveDirection;

  return {
    // Level k has tunnel width 3^-k in a cell period of 3^(1 - k).
    coarsestPeriod: 3 ** (1 - coarsestLevel),
    distanceToFixedPoint,
    forward: [0, -directionY, -directionZ],
    position: [0, directionY * distanceToFixedPoint, directionZ * distanceToFixedPoint],
    right: [1, 0, 0],
    // right x forward keeps a right-handed camera basis.
    up: [0, directionZ, -directionY],
  };
}
