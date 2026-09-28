import {
  keyLight,
  landingTones,
  mix,
  orbitCamera,
  palettes,
  smoothstep,
  type Vector3,
} from "../samebase-film-v3/filmV3Timeline";
import type { IllusionStudyFrame } from "./illusionStudyRenderer";

export const endlessPullbackFps = 60;
export const endlessPullbackSeconds = 14;

/** Seconds for each threefold pull back once the dolly runs at full speed. */
export const pullbackPeriod = 2.4;
/** The dolly speeds up from rest over this long. */
const speedUpSeconds = 2.4;
/** From this many threefold pull backs on, the haze stays the same relative to the camera. */
export const hazeLiftPeriods = 2;

/** The cube is the (-x, +y, -z) corner cell of a sponge that runs on without end in +x, -y, +z. */
const corner: Vector3 = [-1, 1, -1];
const octant: Vector3 = [1, -1, 1];
/**
The outermost cell of the rendered sponge. The haze hides everything past half of it at the largest
render scale, so its outer faces never show.
*/
const spongeHalfSize = 3 ** 5;
/** The camera looks at the corner from outside it, in a three-quarter view with lit faces. */
const view = { elevation: 20, halfHeight: 2.6, tan: 0.45, yaw: -120 };
/** After the first pull back the target sits this fraction of the way from the corner to the cube center. */
const targetToCube = 0.35;

/**
Haze at the first frame and after the lift, in camera scale units: the air is clear out to
`clearTo`, the haze turns even over the next two `width`s, and it thickens by `density` per unit.
At the first frame the haze hides the sponge a little past the cube.
*/
const firstHaze = { clearTo: 6.3, density: 2, width: 0.35 };
const liftedHaze = { clearTo: 6, density: 0.1, width: 3 };

/**
Log base 3 of the dolly scale. The speed rises from 0 by a smoothstep over `speedUpSeconds` and then
stays at one threefold pull back per period.
*/
export function readPullbackLog(time: number): number {
  if (time >= speedUpSeconds) {
    return (time - speedUpSeconds / 2) / pullbackPeriod;
  }
  return (time ** 3 / speedUpSeconds ** 2 - time ** 4 / (2 * speedUpSeconds ** 3)) / pullbackPeriod;
}

/**
The camera at dolly scale `scale`. The camera and its target scale about the corner, so the corner
stays in place on screen. The sponge is the same after a threefold scale about the corner, so the
picture at `scale` and at `3 * scale` is the same.
*/
function cameraAt(scale: number, scaleLog: number) {
  // The target starts at the cube center and moves toward the corner during the first pull back, so
  // the corner, which stays in place on screen, ends near the frame center.
  const toCube = mix(1, targetToCube, smoothstep(0, 1, scaleLog)) * scale;
  return orbitCamera(
    {
      elevation: view.elevation,
      halfHeight: view.halfHeight * scale,
      tan: view.tan,
      target: [corner[0] + toCube, corner[1] - toCube, corner[2] + toCube],
      yaw: view.yaw,
    },
    120 * scale,
  );
}

/**
The frame at `time`. The render scale stays between 1 and 3: the frame drops the whole number of
threefold pull backs, the same one for the shutter open and close, so the move can run on with no
loss of precision. The shutter is half a frame long and centered on `time`.
*/
export function readEndlessPullbackFrame(time: number, sampleGrid: number): IllusionStudyFrame {
  const halfShutter = 0.25 / endlessPullbackFps;
  const scaleLog = readPullbackLog(time);
  const wholePeriods = Math.floor(scaleLog);
  const cameraAtTime = (at: number) =>
    cameraAt(3 ** (readPullbackLog(at) - wholePeriods), readPullbackLog(at));
  const scale = 3 ** (scaleLog - wholePeriods);
  const camera = cameraAtTime(time);
  const lift = smoothstep(0, hazeLiftPeriods, scaleLog);
  const light = keyLight(camera, 0.045 * scale, 1);
  const width = mix(firstHaze.width, liftedHaze.width, lift);
  return {
    cameras: [cameraAtTime(time - halfShutter), cameraAtTime(time + halfShutter)],
    grain: 0.024,
    grainStep: Math.floor(Math.round(time * 30) / 2),
    haze: {
      // The density falls by the same factor in equal steps of the lift, so the haze thins evenly.
      density: (firstHaze.density * (liftedHaze.density / firstHaze.density) ** lift) / scale,
      start: (mix(firstHaze.clearTo, liftedHaze.clearTo, lift) + 2 * width) * scale,
      width: width * scale,
    },
    light: {
      ambient: light.ambient,
      aoScale: light.aoScale,
      aoStrength: 1,
      direction: light.direction,
      key: light.key,
      shadowStrength: 1,
    },
    sampleGrid,
    scene: { corner, halfSize: spongeHalfSize, kind: "sponge", octant },
    sky: palettes.haze.sky,
    tones: landingTones,
  };
}
