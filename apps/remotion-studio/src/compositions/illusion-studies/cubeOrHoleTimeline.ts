import {
  easeInOutSine,
  isometricElevation,
  landingTones,
  orbitCamera,
  palettes,
  progress,
  type Vector3,
} from "../samebase-film-v3/filmV3Timeline";
import type { IllusionStudyFrame } from "./illusionStudyRenderer";

export const cubeOrHoleFps = 60;

export type CubeOrHoleBlock = "mark" | "plain";

/**
The key view: orthographic and isometric from below. The camera looks up at the block's corner
(+x, -y, +z), and the white bottom face lies at the bottom of the picture. The notch in that corner
then shows the landing mark hexagon: white on top, cyan lower left, slate lower right. The eye reads
it as an upright cube in a room corner.
*/
const keyView = { elevation: -isometricElevation, yaw: 45 };

/**
The view that shows the hole. Every view with yaw between 0 and 90 degrees and a negative elevation
sees the notch walls whole and reads the same way as the key view, so the "cube" only seems to turn
the wrong way. Past yaw 90 the +z face and the notch wall in its plane turn away, and the block shows
its far side and the notch as a step in its outline.
*/
const revealView = { elevation: -14, yaw: 128 };

/** The block half size and the frame half height for each block. The notch is one cube of half size 1. */
const blocks = {
  mark: { blockHalf: 3, halfHeight: 6.4 },
  plain: { blockHalf: 2, halfHeight: 4.4 },
} as const satisfies Record<CubeOrHoleBlock, { blockHalf: number; halfHeight: number }>;

/** Times of the clip, in seconds. The clip ends where it starts, so it loops. */
export const cubeOrHoleBeats = {
  orbitOut: 1.2,
  revealed: 8.2,
  orbitBack: 9.4,
  home: 14.2,
  end: 14.4,
} as const;

/** 0 at the key view and 1 at the reveal view. */
function readOrbit(time: number): number {
  const beats = cubeOrHoleBeats;
  return (
    easeInOutSine(progress(time, beats.orbitOut, beats.revealed)) -
    easeInOutSine(progress(time, beats.orbitBack, beats.home))
  );
}

function cameraAt(block: CubeOrHoleBlock, time: number) {
  const orbit = readOrbit(time);
  return orbitCamera(
    {
      elevation: keyView.elevation + (revealView.elevation - keyView.elevation) * orbit,
      halfHeight: blocks[block].halfHeight,
      tan: 0,
      target: [0, 0, 0],
      yaw: keyView.yaw + (revealView.yaw - keyView.yaw) * orbit,
    },
    12,
  );
}

/**
The clip: one slow orbit from the key view to the reveal view and back. The key light is head on
for the whole clip, so it casts no shadow and every face of the key view shows its own tone. The
block is always the same notched block: nothing changes but the view.
*/
export function readCubeOrHoleFrame(
  time: number,
  block: CubeOrHoleBlock,
  sampleGrid: number,
): IllusionStudyFrame {
  const halfShutter = 0.25 / cubeOrHoleFps;
  const camera = cameraAt(block, time);
  const { blockHalf } = blocks[block];
  const notchCenter: Vector3 = [blockHalf - 1, 1 - blockHalf, blockHalf - 1];
  return {
    cameras: [cameraAt(block, time - halfShutter), cameraAt(block, time + halfShutter)],
    grain: 0.024,
    grainStep: Math.floor(Math.round(time * 30) / 2),
    haze: {
      clearing: { center: [0, 0, 0], edge: 1, halfSize: blockHalf, radius: 1e9, veil: 0 },
      density: 0,
      start: 0,
      width: 1,
    },
    light: {
      ambient: 0.6,
      aoScale: 0.09,
      aoStrength: 0,
      direction: camera.back,
      // Each face of the key view gets 0.6 + key / sqrt(3), which is exactly its tone.
      key: 0.4 * Math.sqrt(3),
      // A face that turns toward the camera keeps its tone and does not wash out.
      shadeLimit: 1,
      shadowStrength: 0,
    },
    sampleGrid,
    scene: { block, blockHalf, kind: "notch", notchCenter, notchHalf: 1 },
    sky: palettes.haze.sky,
    tones: landingTones,
  };
}
