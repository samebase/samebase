import {
  easeInOutSine,
  isometricElevation,
  landingTones,
  orbitCamera,
  palettes,
  progress,
  smoothstep,
} from "../samebase-film-v3/filmV3Timeline";
import type { IllusionStudyFrame } from "./illusionStudyRenderer";

export const cubeOrHoleFps = 60;

/**
Two scenes that look the same in the key view, an orthographic isometric view:

- The hole: a block of half size 2 with the cube of half size 1 at its corner (+x, -y, +z) cut
  away, seen from below. The notch shows the landing mark hexagon: white on top, cyan lower left,
  slate lower right. The eye reads it as a cube in a room corner.
- The cube: that reading made real: an upright cube resting in the far corner of a room of the
  same size, seen from above. It is the depth inversion of the hole.

Each scene turns about its own vertical. Turning the hole by an angle gives the same picture as
turning the cube by the mirrored angles, as long as the camera stays in the corner octant, so one
swing through the key view turns on smoothly from the hole to the cube. The swap happens on the
frame that is exactly at the key view, where both pictures are the same.
*/
const hole = { elevation: -isometricElevation, target: [0, 0, 0], yaw: 45 } as const;
const cube = { elevation: isometricElevation, target: [-2, 2, 2], yaw: -45 } as const;
const halfHeight = 4.4;

/**
The swing, in degrees: positive angles show the hole and negative angles the cube. The hole side
goes just past the corner octant (yaw 45 + 45), so the block shows the notch as a step in its
outline. The cube side goes almost to the edge of the octant, where a room wall turns edge on: past
it the wall would hide the cube.
*/
const holeSwing = 58;
/** Seconds of the clip. It ends where it starts, so it loops. */
export const cubeOrHoleBeats = {
  toHole: 0.8,
  atHole: 3.8,
  throughKey: 4.3,
  atCube: 8.6,
  /** The camera holds on the cube side, where the cube is plain to see. */
  backToKey: 10.1,
  home: 12.9,
  end: 13.3,
} as const;

/** The last frame of the hole: the swing passes the key view exactly on it. */
export const swapFrame = 400;

/** The cube side swing, chosen so that the swing back from the hole passes 0 exactly at `swapFrame`. */
const cubeSwing = (() => {
  const beats = cubeOrHoleBeats;
  const eased = easeInOutSine(progress(swapFrame / cubeOrHoleFps, beats.throughKey, beats.atCube));
  return holeSwing / eased - holeSwing;
})();

export function readSwing(time: number): number {
  const beats = cubeOrHoleBeats;
  const ease = (start: number, end: number) => easeInOutSine(progress(time, start, end));
  return (
    holeSwing * ease(beats.toHole, beats.atHole) -
    (holeSwing + cubeSwing) * ease(beats.throughKey, beats.atCube) +
    cubeSwing * ease(beats.backToKey, beats.home)
  );
}

/**
The elevation change with the swing: toward eye level on both sides. It grows with the square of the
swing, so the camera path is smooth through the key view.
*/
function readLift(swing: number): number {
  return swing >= 0 ? 14 * (swing / holeSwing) ** 2 : 18 * (swing / cubeSwing) ** 2;
}

function holeCamera(swing: number) {
  return orbitCamera(
    {
      elevation: hole.elevation + readLift(swing),
      halfHeight,
      tan: 0,
      target: hole.target,
      yaw: hole.yaw + swing,
    },
    12,
  );
}

/** The cube camera for the same picture as the hole camera at `swing`: its angles are mirrored. */
function cubeCamera(swing: number) {
  return orbitCamera(
    {
      elevation: cube.elevation - readLift(swing),
      halfHeight,
      tan: 0,
      target: cube.target,
      yaw: cube.yaw - swing,
    },
    12,
  );
}

/** Shows the cube from the frame after `swapFrame` to the end; the loop start shows the hole. */
export function showsCube(time: number): boolean {
  return time * cubeOrHoleFps > swapFrame + 0.5;
}

export type CubeOrHoleScene = "cube" | "hole";

export function readCubeOrHoleFrame(time: number, sampleGrid: number): IllusionStudyFrame {
  return frameAt(time, showsCube(time) ? "cube" : "hole", sampleGrid);
}

/** The key view of one scene, for the proof that both scenes give the same picture. */
export function readCubeOrHoleKeyFrame(
  scene: CubeOrHoleScene,
  sampleGrid: number,
): IllusionStudyFrame {
  return frameAt(0, scene, sampleGrid);
}

function frameAt(time: number, shown: CubeOrHoleScene, sampleGrid: number): IllusionStudyFrame {
  const halfShutter = 0.25 / cubeOrHoleFps;
  const inCube = shown === "cube";
  const cameraAt = (at: number) => (inCube ? cubeCamera : holeCamera)(readSwing(at));
  const keyView = inCube ? cubeCamera(0) : holeCamera(0);
  const swing = readSwing(time);
  const scene: IllusionStudyFrame["scene"] = inCube
    ? {
        center: [-2, 2, 2],
        halfSize: 2,
        kind: "room",
        signs: [-1, 1, 1],
        // Under half a pixel, so a wall edge never shows as a strip.
        wall: 0.003,
      }
    : { blockHalf: 2, kind: "notch", notchCenter: [1, -1, 1], notchHalf: 1 };
  return {
    cameras: [cameraAt(time - halfShutter), cameraAt(time + halfShutter)],
    grain: 0.024,
    grainStep: Math.floor(Math.round(time * 30) / 2),
    haze: {
      clearing: { center: [0, 0, 0], edge: 1, halfSize: 2, radius: 1e9, veil: 0 },
      density: 0,
      start: 0,
      width: 1,
    },
    light: {
      ambient: 0.6,
      aoScale: 0.12,
      // Occlusion darkens the notch creases on the hole side and the room corner and the cube
      // contacts on the cube side. The two scenes have different creases, so it fades in as the
      // camera leaves the key view and is zero on the swap frame.
      aoStrength: smoothstep(0, 12, Math.abs(swing)),
      // Fixed in the scene along the key view, so every face keeps one flat tone while the camera
      // turns: each face of the key view gets 0.6 + key / sqrt(3), which is exactly its tone. Both
      // scenes cast their shadows along the key view: the notch is open to the light, and the cube
      // shadow falls under the cube, so the key view pictures stay the same.
      direction: keyView.back,
      key: 0.4 * Math.sqrt(3),
      shadeLimit: 1,
      shadowStrength: 1,
    },
    // Both scenes have the same outlines and creases in the key view, so the lines match there.
    lines: { ink: palettes.haze.ink, strength: 0.85 },
    sampleGrid,
    scene,
    sky: palettes.haze.sky,
    tones: landingTones,
  };
}
