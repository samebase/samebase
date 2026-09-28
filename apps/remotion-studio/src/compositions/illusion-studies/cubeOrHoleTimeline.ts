import {
  easeInOutSine,
  isometricElevation,
  landingTones,
  mix,
  orbitCamera,
  palettes,
  progress,
  smoothstep,
  type Vector3,
} from "../samebase-film-v3/filmV3Timeline";
import type { IllusionStudyFrame } from "./illusionStudyRenderer";

export const cubeOrHoleFps = 60;

export type CubeOrHoleBlock = "mark" | "plain";
export type CubeOrHoleNotch = "cube" | "hole";

/**
The key view: orthographic and isometric from below. The camera looks up at the block's corner
(+x, -y, +z), and the white bottom face lies at the bottom of the picture. The notch in that corner
then shows the landing mark hexagon: white on top, cyan lower left, slate lower right. The eye reads
it as an upright cube in a room corner.
*/
const keyView = { elevation: -isometricElevation, yaw: 45 };
const keyAxis: Vector3 = [1 / Math.sqrt(3), -1 / Math.sqrt(3), 1 / Math.sqrt(3)];

/** The block half size and the frame half height for each block. The notch is one cube of half size 1. */
const blocks = {
  mark: { blockHalf: 3, halfHeight: 6.4 },
  plain: { blockHalf: 2, halfHeight: 4.4 },
} as const satisfies Record<CubeOrHoleBlock, { blockHalf: number; halfHeight: number }>;

/** Times of the clip, in seconds. The clip loops: it ends where it starts. */
export const cubeOrHoleBeats = {
  /** The first small orbit: the hole seems to turn the wrong way. */
  firstSway: 0.5,
  reveal: 3.5,
  revealed: 6.1,
  back: 6.9,
  /** The camera rests at the key view, and the hole becomes a real cube halfway through the rest. */
  rest: 9.1,
  swap: 9.35,
  /** The second small orbit: the real cube turns the right way. */
  secondSway: 9.6,
  end: 12.9,
} as const;
const swaySeconds = 2.8;
const swayDegrees = 14;
/**
The moves have a little perspective, so the block reads as a solid and the hole shows reverse
perspective. The camera is orthographic while it rests at the key view, where the swap happens.
*/
const movingTan = 0.32;
const perspectiveRamp = 0.7;

/**
Yaw and elevation offsets from the key view, the tangent of half the field of view, and the key light
sweep from 0 (head on) to 1.
*/
function readMove(time: number) {
  const beats = cubeOrHoleBeats;
  const sway = (start: number) =>
    swayDegrees * (1 - Math.cos(2 * Math.PI * progress(time, start, start + swaySeconds))) * 0.5;
  const reveal =
    easeInOutSine(progress(time, beats.reveal, beats.revealed)) -
    easeInOutSine(progress(time, beats.back, beats.rest));
  const window = (start: number, end: number) =>
    smoothstep(start, start + perspectiveRamp, time) *
    (1 - smoothstep(end - perspectiveRamp, end, time));
  return {
    elevation: 25 * reveal,
    sweep: reveal,
    tan:
      movingTan *
      (window(beats.firstSway, beats.rest) +
        window(beats.secondSway, beats.secondSway + swaySeconds)),
    yaw: sway(beats.firstSway) + sway(beats.secondSway) + 50 * reveal,
  };
}

function notchScene(block: CubeOrHoleBlock, notch: CubeOrHoleNotch) {
  const { blockHalf } = blocks[block];
  const notchCenter: Vector3 = [blockHalf - 1, 1 - blockHalf, blockHalf - 1];
  // A third of the cube diagonal toward the camera puts the turned cube in front of the notch walls
  // in every pixel of the hexagon. Twice that makes it float clear of the notch, so a small orbit
  // shows the open notch behind it and not a sliver of it.
  const lift = 4 / Math.sqrt(3);
  const cubeCenter: Vector3 = [
    notchCenter[0] + keyAxis[0] * lift,
    notchCenter[1] + keyAxis[1] * lift,
    notchCenter[2] + keyAxis[2] * lift,
  ];
  return {
    block,
    blockHalf,
    cubeCenter,
    keyAxis,
    kind: "notch",
    notch,
    notchCenter,
    notchHalf: 1,
  } as const;
}

function cameraAt(block: CubeOrHoleBlock, yaw: number, elevation: number, tan: number) {
  return orbitCamera(
    {
      elevation: keyView.elevation + elevation,
      halfHeight: blocks[block].halfHeight,
      tan,
      target: [0, 0, 0],
      yaw: keyView.yaw + yaw,
    },
    12,
  );
}

/**
The key light is camera fixed. Head on it gives every face of the key view the same light, so each
face shows its own tone and a hole and a cube turned half a turn about the view axis look the same.
The sweep turns it to the film key light, upper left, and brings in the cast shadows.
*/
function lightAt(camera: ReturnType<typeof cameraAt>, sweep: number) {
  const local: Vector3 = [-0.5 * sweep, 0.78 * sweep, mix(1, 0.58, sweep)];
  const length = Math.hypot(...local);
  const toWorld = (axis: 0 | 1 | 2) =>
    (camera.right[axis] * local[0] + camera.up[axis] * local[1] + camera.back[axis] * local[2]) /
    length;
  return {
    ambient: 0.6,
    aoScale: 0.09,
    aoStrength: 0,
    direction: [toWorld(0), toWorld(1), toWorld(2)] as const,
    // Head on, each face of the key view gets 0.6 + key / sqrt(3), which is exactly its tone.
    key: 0.4 * Math.sqrt(3),
    shadowStrength: sweep,
  };
}

function frameAt(
  time: number,
  block: CubeOrHoleBlock,
  notch: CubeOrHoleNotch,
  sampleGrid: number,
): IllusionStudyFrame {
  const halfShutter = 0.25 / cubeOrHoleFps;
  const cameraAtTime = (at: number) => {
    const move = readMove(at);
    return cameraAt(block, move.yaw, move.elevation, move.tan);
  };
  const camera = cameraAtTime(time);
  return {
    cameras: [cameraAtTime(time - halfShutter), cameraAtTime(time + halfShutter)],
    grain: 0.024,
    grainStep: Math.floor(Math.round(time * 30) / 2),
    haze: { density: 0, start: 0, width: 1 },
    light: lightAt(camera, readMove(time).sweep),
    sampleGrid,
    scene: notchScene(block, notch),
    sky: palettes.haze.sky,
    tones: landingTones,
  };
}

/** The clip: the hole, the reveal, the swap to a real cube at the key view, and back to the hole. */
export function readCubeOrHoleFrame(
  time: number,
  block: CubeOrHoleBlock,
  sampleGrid: number,
): IllusionStudyFrame {
  return frameAt(time, block, time < cubeOrHoleBeats.swap ? "hole" : "cube", sampleGrid);
}

/** A still at the key view. */
export function readCubeOrHoleStill(
  block: CubeOrHoleBlock,
  notch: CubeOrHoleNotch,
  sampleGrid: number,
): IllusionStudyFrame {
  return frameAt(0, block, notch, sampleGrid);
}
