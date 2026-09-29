import {
  keyLight,
  landingTones,
  orbitCamera,
  palettes,
  smoothstep,
  type Vector3,
} from "../samebase-film-v3/filmV3Timeline";
import type { IllusionStudyFrame } from "./illusionStudyRenderer";

export const endlessPullbackFps = 60;
export const endlessPullbackSeconds = 14;

/** Seconds for each threefold zoom out once the zoom runs at full speed. */
export const pullbackPeriod = 2.4;
/** The zoom speeds up from rest over this long. */
const speedUpSeconds = 2.4;

/** The cube is the (-x, +y, -z) corner cell of a sponge that runs on without end in +x, -y, +z. */
const corner: Vector3 = [-1, 1, -1];
const octant: Vector3 = [1, -1, 1];
/**
The outermost cell of the rendered sponge. The depth haze hides everything past a small part of
it at the largest render scale, so its outer faces never show.
*/
const spongeHalfSize = 3 ** 5;
/** Orthographic, in a three-quarter view with lit faces, framed on the first cube. */
const view = { elevation: 20, halfHeight: 2.6, yaw: -120 };

/**
Depth haze behind the focal plane, in zoom scale units: it starts past `start`, turns even over
`width`, and thickens by `density` per unit. In this view the corner is the nearest point, so the
haze thickens away from it on every side.
*/
const depthHaze = { density: 0.3, start: 1.5, width: 1.5 };

/**
The clearing around the first cube. At the first frame a thick veil hides everything outside the
cube. The veil thins while the zoom log runs over `lift`, so the whole structure comes out of the
haze together. The wide fade radius, in zoom scale units, is `10 ^ (widen.start + widen.growth *
(zoomLog - widen.from) ^ 1.5)` past `widen.from`. Past `clearingGoneAt` the fade is far wider than
the depth haze reach, and the clearing is dropped, so the zoom repeats exactly.
*/
const lift = { from: 0.35, to: 1.9, veil: 8 };
const widen = { from: 1.2, growth: 2.5, start: 0.5 };
/** The veil edge, in first cube sizes: it keeps the cube outline antialiased. */
const veilEdge = 0.04;
export const clearingGoneAt = 2.8;

/**
Log base 3 of the zoom scale. The speed rises from 0 by a smoothstep over `speedUpSeconds` and then
stays at one threefold zoom out per period.
*/
export function readZoomLog(time: number): number {
  if (time >= speedUpSeconds) {
    return (time - speedUpSeconds / 2) / pullbackPeriod;
  }
  return (time ** 3 / speedUpSeconds ** 2 - time ** 4 / (2 * speedUpSeconds ** 3)) / pullbackPeriod;
}

/**
The orthographic camera at zoom scale `scale`. The frame and the target scale about the corner, so
the corner stays in place on screen. The sponge is the same after a threefold scale about the corner,
so the picture at `scale` and at `3 * scale` is the same.
*/
function cameraAt(scale: number) {
  return orbitCamera(
    {
      elevation: view.elevation,
      halfHeight: view.halfHeight * scale,
      tan: 0,
      target: [corner[0] + scale, corner[1] - scale, corner[2] + scale],
      yaw: view.yaw,
    },
    120 * scale,
  );
}

/**
The frame at `time`. The render scale stays between 1 and 3: the frame drops the whole number of
threefold zooms, the same one for the shutter open and close, so the zoom can run on with no loss of
precision. The first cube shrinks by the same factor in the render frame. The shutter is half a
frame long and centered on `time`.
*/
export function readEndlessPullbackFrame(time: number, sampleGrid: number): IllusionStudyFrame {
  const halfShutter = 0.25 / endlessPullbackFps;
  const zoomLog = readZoomLog(time);
  const wholePeriods = Math.floor(zoomLog);
  const renderScale = (at: number) => 3 ** (readZoomLog(at) - wholePeriods);
  const scale = renderScale(time);
  const camera = cameraAt(scale);
  const light = keyLight(camera, 0.045 * scale, 1);
  const cubeScale = 3 ** -wholePeriods;
  const gone = zoomLog >= clearingGoneAt;
  const widening = Math.max(zoomLog - widen.from, 0) ** 1.5;
  const veil = lift.veil * (1 - smoothstep(lift.from, lift.to, zoomLog));
  return {
    cameras: [cameraAt(renderScale(time - halfShutter)), cameraAt(renderScale(time + halfShutter))],
    grain: 0.024,
    grainStep: Math.floor(Math.round(time * 30) / 2),
    haze: {
      clearing: {
        center: [corner[0] + cubeScale, corner[1] - cubeScale, corner[2] + cubeScale],
        edge: veilEdge * 2 * cubeScale,
        halfSize: cubeScale,
        radius: gone ? 1e9 : 10 ** (widen.start + widen.growth * widening) * scale,
        veil: gone ? 0 : veil,
      },
      density: depthHaze.density / scale,
      // The rays start `rayStart` in front of the focal plane.
      start: camera.rayStart + depthHaze.start * scale,
      width: depthHaze.width * scale,
    },
    light: {
      ambient: light.ambient,
      aoScale: light.aoScale,
      aoStrength: 1,
      direction: light.direction,
      key: light.key,
      // As in the film: no limit below the brightest possible shade.
      shadeLimit: light.ambient + light.key,
      shadowStrength: 1,
    },
    lines: { ink: palettes.haze.ink, strength: 0 },
    sampleGrid,
    scene: { corner, halfSize: spongeHalfSize, kind: "sponge", octant },
    sky: palettes.haze.sky,
    tones: landingTones,
  };
}
