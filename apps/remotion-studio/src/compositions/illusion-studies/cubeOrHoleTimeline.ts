import {
  easeInOutSine,
  isometricElevation,
  landingTones,
  orbitCamera,
  palettes,
  progress,
} from "../samebase-film-v3/filmV3Timeline";
import type { IllusionStudyFrame } from "./illusionStudyRenderer";

export const cubeOrHoleFps = 60;

/**
Two scenes that look the same in the key view, an orthographic isometric view:

- The hole: a block of half size 2 with the cube of half size 1 at its corner (+x, -y, +z) cut
  away, seen from below. The notch shows the landing mark hexagon: white on top, cyan lower left,
  slate lower right. The eye reads it as a cube in a room corner.
- The cube: that reading made real: an upright cube in front of the far corner of a room of the
  same size, seen from above. The cube floats out of the corner along the key view, which does not
  change the key view picture, so any turn shows it as a separate solid with its own shadow.

Each scene turns about its own vertical, and the two turns go opposite ways on screen. The camera
rests at the key view between them, and the swap happens on that rest, where both pictures are the
same.
*/
const hole = { elevation: -isometricElevation, target: [0, 0, 0], yaw: 45 } as const;
const cube = { elevation: isometricElevation, target: [-2, 2, 2], yaw: -45 } as const;
const halfHeight = 4.4;

/**
The swing, in degrees: positive angles show the hole and negative angles the cube. The hole side
goes past the corner octant (yaw 45 + 45), so the block shows its far side and the notch as a step
in its outline. The cube side stays inside the octant, where the room corner reads naturally.
*/
const holeSwing = 83;
const cubeSwing = 40;
/** How far the cube floats out of the room corner, on every axis. */
const cubeLift = 1;
/** Seconds of the clip. It ends where it starts, so it loops. */
export const cubeOrHoleBeats = {
  toHole: 0.5,
  atHole: 3.8,
  holeBack: 4.3,
  restAtKey: 7.1,
  toCube: 7.5,
  atCube: 10.5,
  cubeBack: 11,
  home: 13.8,
  end: 14.2,
} as const;

/** The last frame of the hole: the middle of the rest at the key view. */
export const swapFrame = 438;

export function readSwing(time: number): number {
  const beats = cubeOrHoleBeats;
  const ease = (start: number, end: number) => easeInOutSine(progress(time, start, end));
  return (
    holeSwing * (ease(beats.toHole, beats.atHole) - ease(beats.holeBack, beats.restAtKey)) -
    cubeSwing * (ease(beats.toCube, beats.atCube) - ease(beats.cubeBack, beats.home))
  );
}

/** The elevation change with the swing: toward eye level on both sides. */
function readLift(swing: number): number {
  return swing >= 0 ? 21 * (swing / holeSwing) ** 2 : 20 * (swing / cubeSwing) ** 2;
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

/**
The cube camera. Its angles are mirrored, so at swing 0 it gives the hole key view picture, and a
negative swing turns the picture the other way than a positive swing of the hole.
*/
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
  const scene: IllusionStudyFrame["scene"] = inCube
    ? {
        center: [-2, 2, 2],
        halfSize: 2,
        kind: "room",
        lift: cubeLift,
        signs: [-1, 1, 1],
        wall: 0.1,
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
      aoScale: 0.09,
      aoStrength: 0,
      // Fixed in the scene along the key view, so in the key view every shadow lies behind the cube
      // that casts it, and each face of the key view gets 0.6 + key / sqrt(3), exactly its tone.
      // A hard edge keeps the shadow from showing a soft rim around the cube in the key view.
      direction: keyView.back,
      key: 0.4 * Math.sqrt(3),
      shadeLimit: 1,
      shadowHardness: 400,
      shadowStrength: 1,
    },
    sampleGrid,
    scene,
    sky: palettes.haze.sky,
    tones: landingTones,
  };
}
