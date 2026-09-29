import {
  easeLogoShuffleProgress,
  LOGO_SHUFFLE_MOVE_DURATION_MS,
  LOGO_SHUFFLE_MOVE_STAGGER_MS,
} from "@samebase/logo-model/shuffle";

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

export const shuffleCubeOrHoleFps = 60;

/**
The two forms of the same key view picture: real cubes in a room corner, or holes in a box. The
shuffle runs with the cubes. Run with the holes, a sliding hole is partly buried in the box, so the
picture breaks up and does not read as a sliding cube.
*/
export type ShuffleForm = "cubes" | "holes";

/**
Cells are (x, y, z) indices in a box of 4 cells a side, from the far corner of the room, with y up
in the room. The rest arrangement is a plane partition, heights [[2, 1, 1], [1, 1], [1]]: every
cube stands on the floor or on a cube, and toward both walls every cell is filled. That is the
condition under which the room scene and the box scene give the same key view picture.
*/
type Cell = readonly [number, number, number];
const restCells: readonly Cell[] = [
  [0, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
  [0, 0, 2],
  [1, 0, 0],
  [1, 0, 1],
  [2, 0, 0],
];
const boxHalf = 4;

/**
The landing shuffle: one cube slides one cell along an axis into a free cell where it stands on the
floor or on a cube, with the landing timing and ease. The last two moves undo the first two, so the
shuffle ends at rest where it started.
*/
type Move = { at: number; from: Cell; to: Cell };
const moveSeconds = LOGO_SHUFFLE_MOVE_DURATION_MS / 1000;
const staggerSeconds = LOGO_SHUFFLE_MOVE_STAGGER_MS / 1000;
const moves: readonly Move[] = [
  { at: 0.8, from: [2, 0, 0], to: [2, 0, 1] },
  { at: 0.8 + staggerSeconds, from: [0, 1, 0], to: [1, 1, 0] },
  { at: 3.8, from: [1, 1, 0], to: [0, 1, 0] },
  { at: 3.8 + staggerSeconds, from: [2, 0, 1], to: [2, 0, 0] },
];

/** Seconds of the clip. It ends where it starts, so it loops. */
export const shuffleBeats = {
  settled: 3.8 + staggerSeconds + moveSeconds,
  orbitOut: 6.6,
  atHole: 9.4,
  orbitBack: 10.4,
  home: 13,
  end: 13.4,
} as const;

/** Frames at which the room scene becomes the box scene and back, while the camera rests. */
export const swapFrames = { toBox: 390, toRoom: 792 } as const;

function sameCell(a: Cell, b: Cell): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

/** Cell centers in box coordinates at `time`: each moving cube slides from its cell to the next. */
export function readCells(time: number): readonly Vector3[] {
  let cells: readonly Cell[] = restCells;
  const positions = new Map<number, Vector3>();
  for (const move of moves) {
    const index = cells.findIndex((cell) => sameCell(cell, move.from));
    const amount = easeLogoShuffleProgress(progress(time, move.at, move.at + moveSeconds));
    const [fromX, fromY, fromZ] = move.from;
    const [toX, toY, toZ] = move.to;
    positions.set(index, [
      fromX + (toX - fromX) * amount,
      fromY + (toY - fromY) * amount,
      fromZ + (toZ - fromZ) * amount,
    ]);
    if (amount >= 1) {
      cells = cells.map((cell, cellIndex) => (cellIndex === index ? move.to : cell));
    }
  }
  return cells.map((cell, index) => {
    const [x, y, z] = positions.get(index) ?? cell;
    return [2 * x + 1 - boxHalf, 2 * y + 1 - boxHalf, 2 * z + 1 - boxHalf];
  });
}

/** 0 at the key view and 1 at the view that shows the holes. */
function readOrbit(time: number): number {
  const beats = shuffleBeats;
  return (
    easeInOutSine(progress(time, beats.orbitOut, beats.atHole)) -
    easeInOutSine(progress(time, beats.orbitBack, beats.home))
  );
}

/**
The two key views. The box is seen from below at its corner (+x, -y, +z) and the room from above
into its far corner; both put the camera side of the box at + on every box axis.
*/
const box = {
  center: [0, 0, 0],
  elevation: -isometricElevation,
  signs: [1, -1, 1],
  yaw: 45,
} as const;
const room = {
  center: [-boxHalf, boxHalf, boxHalf],
  elevation: isometricElevation,
  signs: [-1, 1, 1],
  yaw: -45,
} as const;
const halfHeight = 7.6;
/** The orbit that shows the holes: just past the corner octant, toward eye level. */
const holeYaw = 58;
const holeLift = 14;

function boxCamera(orbit: number) {
  return orbitCamera(
    {
      elevation: box.elevation + holeLift * orbit * orbit,
      halfHeight,
      tan: 0,
      target: box.center,
      yaw: box.yaw + holeYaw * orbit,
    },
    16,
  );
}

function roomCamera() {
  return orbitCamera(
    { elevation: room.elevation, halfHeight, tan: 0, target: room.center, yaw: room.yaw },
    16,
  );
}

/** The cubes shuffle in the room; the box is shown from the first swap to the second. */
export function showsRoom(frame: number): boolean {
  return frame <= swapFrames.toBox || frame > swapFrames.toRoom;
}

export function readShuffleCubeOrHoleFrame(time: number, sampleGrid: number): IllusionStudyFrame {
  const form = showsRoom(Math.round(time * shuffleCubeOrHoleFps)) ? "cubes" : "holes";
  return frameAt(time, form, sampleGrid);
}

function frameAt(time: number, form: ShuffleForm, sampleGrid: number): IllusionStudyFrame {
  const halfShutter = 0.25 / shuffleCubeOrHoleFps;
  const inRoom = form === "cubes";
  const cameraAt = (at: number) => (inRoom ? roomCamera() : boxCamera(readOrbit(at)));
  const keyView = inRoom ? roomCamera() : boxCamera(0);
  const place = inRoom ? room : box;
  return {
    cameras: [cameraAt(time - halfShutter), cameraAt(time + halfShutter)],
    grain: 0.024,
    grainStep: Math.floor(Math.round(time * 30) / 2),
    haze: {
      clearing: { center: [0, 0, 0], edge: 1, halfSize: boxHalf, radius: 1e9, veil: 0 },
      density: 0,
      start: 0,
      width: 1,
    },
    light: {
      ambient: 0.6,
      aoScale: 0.12,
      // No occlusion: the cut cells meet at shared faces, where occlusion would draw seams.
      aoStrength: 0,
      // Fixed along the key view. Every cast shadow then lies behind its caster, so it never shows,
      // and the shadow rays would only graze the hole walls: the study casts none.
      direction: keyView.back,
      key: 0.4 * Math.sqrt(3),
      shadeLimit: 1,
      shadowStrength: 0,
    },
    lines: { ink: palettes.haze.ink, strength: 0.85 },
    sampleGrid,
    scene: {
      cells: readCells(time),
      center: place.center,
      form: inRoom ? "cubes" : "holes",
      halfSize: boxHalf,
      kind: "stack",
      signs: place.signs,
      wall: 0.003,
    },
    sky: palettes.haze.sky,
    tones: landingTones,
  };
}

/** The rest arrangement at the key view in one form, for the proof that both give the same picture. */
export function readShuffleKeyFrame(form: ShuffleForm, sampleGrid: number): IllusionStudyFrame {
  return frameAt(0, form, sampleGrid);
}
