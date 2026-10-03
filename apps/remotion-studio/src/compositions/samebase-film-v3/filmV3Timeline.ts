import {
  easeLogoShuffleProgress,
  LOGO_SHUFFLE_MOVE_DURATION_MS,
} from "@samebase/logo-model/shuffle";
import { isWithinVoxelGrid, MENGER_SPONGE_VOXEL_STATE, voxelKey } from "@samebase/logo-model/voxel";

export type Vector3 = readonly [number, number, number];
export type Rgb = Vector3;

export type FilmV3Camera = {
  back: Vector3;
  halfHeight: number;
  rayEnd: number;
  rayStart: number;
  right: Vector3;
  tanHalfFieldOfView: number;
  target: Vector3;
  up: Vector3;
};

export type FilmV3Scene = {
  camera: FilmV3Camera;
  faces: {
    center: readonly [number, number];
    enabled: boolean;
    /**
    How the new face opens. `wait`: it waits at its final shape behind the doors. `leaf`: it folds
    open about its vertical diagonal. `shear`: it is a rhombus of fixed side whose angle grows.
    */
    fold: "leaf" | "shear" | "wait";
    radius: number;
    /** 0 is the isometric cube and 1 the four equal faces. */
    unfold: number;
  };
  floor: { height: number; strength: number };
  /**
  The haze has the color of the sky behind each pixel, so the renderer draws it as less coverage.
  `clear` is the distance from the cube box, in cube half sizes, out to which the giant is clear,
  and past `hidden` the haze hides it. Past `start` the depth haze thickens with `density`.
  */
  haze: { clear: number; density: number; hidden: number; start: number };
  light: {
    ambient: number;
    aoScale: number;
    direction: Vector3;
    key: number;
    shadeStrength: number;
  };
  mode: "shuffle" | "sponge" | "tesseract";
  shuffle: {
    depth: number;
    /** Levels above this one keep the Menger layout, so the giant outline stays whole. */
    moveMinLevel: number;
    /** The cells in flight, as slot centers in their parent cell, with the eased progress. */
    moves: readonly { from: Vector3; progress: number; to: Vector3 }[];
    /** 1 for each slot that holds a resting cell, x first, then y, then z. */
    slots: readonly number[];
    /** Cells narrower than this many pixels are solid, and the level above it fades out. */
    fadePixels: number;
  };
  sponge: {
    /** 1 anchors each opening toward the probe side of its parent hole, 0 centers it. */
    anchorToProbe: number;
    center: Vector3;
    depth: number;
    halfSize: number;
    openness: number;
    probe: Vector3;
    restDepth: number;
    revealRadius: number;
  };
  /**
  The star warp of the isometric image around the frame center, which must be the near corner of the
  object: seven sides counterclockwise from the top face, with widths in degrees that add up to 360.
  The top, left, and front faces are sides 0, 1, and 6, so widths of 120, 120, 0, 0, 0, 0, and 120
  with no turn give the image back unchanged. The turn is in the shutter.
  */
  star: {
    enabled: boolean;
    /** The hexagon radius of the object outline, in world units. */
    hexRadius: number;
    /** The star turn in degrees counterclockwise. */
    rotation: number;
    widths: StarWidths;
  };
  tesseract: {
    halfExtent: Vector3;
    /** Two joint cubes per beam: center x, y, z and half size. */
    joints: readonly (readonly [number, number, number, number])[];
  };
  tones: { x: Rgb; y: Rgb; z: Rgb };
};

export type StarWidths = readonly [number, number, number, number, number, number, number];

/** The star warp off: the three isometric sides with no turn. */
export const noStar = {
  enabled: false,
  hexRadius: 1,
  rotation: 0,
  widths: [120, 120, 0, 0, 0, 0, 120],
} as const satisfies FilmV3Scene["star"];

export type FilmV3Text = {
  align: "center" | "left" | "right";
  /** Cap height in pixels. */
  cap: number;
  /** The widest the line may be, in pixels. A wider line shrinks to fit. */
  fit: number;
  color: Rgb;
  /** Rise 0 hides a word below the baseline and 1 shows it: each word rises into place. */
  words: readonly { rise: number; text: string }[];
  x: number;
  y: number;
};

export type FilmV3Cursor = { pressed: number; visible: number; x: number; y: number };

export type FilmV3Frame = {
  backdropTexts: readonly FilmV3Text[];
  cursor: FilmV3Cursor;
  /** The sky at the top and the bottom of the frame. */
  sky: readonly [Rgb, Rgb];
  /** The grain changes 15 times a second at every frame rate. */
  grainStep: number;
  grain: number;
  overlayTexts: readonly FilmV3Text[];
  sampleGrid: number;
  scene: FilmV3Scene;
  shadowTint: Rgb;
  /**
  The camera and the unfold at the shutter open and close. Each antialiasing sample takes its own
  time in the shutter, so fast moves blur.
  */
  shutter: {
    cameras: readonly [FilmV3Camera, FilmV3Camera];
    /** The star turn in degrees counterclockwise. */
    starRotation: readonly [number, number];
    unfold: readonly [number, number];
  };
};

// ---------- colors ----------

export function hex(value: number): Rgb {
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

export const inks = {
  newFace: hex(0x4068cc),
  cyan: hex(0x00b8db),
  slate: hex(0x394447),
  white: hex(0xffffff),
};

/**
The pale sky behind the object, from the top to the bottom of the frame, the ink of every word, and
the tint of the floor shadow. The sky stays darker than the white top face, and the words stay dense.
*/
export const palettes = {
  haze: { ink: hex(0x171b4f), shadowTint: hex(0xa8b3cc), sky: [hex(0x8499b0), hex(0xdfe4ea)] },
} as const;

/** The landing hero tones by face direction: x the side faces, y the top, z the mark face. */
export const landingTones = { x: inks.cyan, y: inks.white, z: inks.slate };

// ---------- motion ----------

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

export function progress(time: number, start: number, end: number): number {
  return clamp01((time - start) / (end - start));
}

export function mix(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

export function easeInOutSine(value: number): number {
  return -(Math.cos(Math.PI * value) - 1) / 2;
}

export function smoothstep(edge0: number, edge1: number, value: number): number {
  const amount = clamp01((value - edge0) / (edge1 - edge0));
  return amount * amount * (3 - 2 * amount);
}

/** Piecewise motion: each key eases from the previous value to its own value over its span. */
export type Key = { at: number; ease: (value: number) => number; to: number; until: number };

export function keyed(time: number, from: number, keys: readonly Key[]): number {
  let value = from;
  for (const key of keys) {
    if (time <= key.at) {
      return value;
    }
    value = mix(value, key.to, key.ease(progress(time, key.at, key.until)));
  }
  return value;
}

// ---------- vectors ----------

export function add(a: Vector3, b: Vector3): Vector3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function scale(a: Vector3, amount: number): Vector3 {
  return [a[0] * amount, a[1] * amount, a[2] * amount];
}

function cross(a: Vector3, b: Vector3): Vector3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export function normalize(a: Vector3): Vector3 {
  return scale(a, 1 / Math.hypot(a[0], a[1], a[2]));
}

const degrees = Math.PI / 180;
export const isometricElevation = Math.atan(1 / Math.SQRT2) / degrees;
/** Hexagon radius of the isometric cube, in cube half sizes. */
export const hexagonRadius = 2 * Math.sqrt(2 / 3);

export type Orbit = {
  elevation: number;
  halfHeight: number;
  tan: number;
  target: Vector3;
  yaw: number;
};

export function orbitCamera({ elevation, halfHeight, tan, target, yaw }: Orbit, rayLimit: number) {
  const back: Vector3 = [
    Math.sin(yaw * degrees) * Math.cos(elevation * degrees),
    Math.sin(elevation * degrees),
    Math.cos(yaw * degrees) * Math.cos(elevation * degrees),
  ];
  const right = normalize(cross([0, 1, 0], back));
  const up = cross(back, right);
  const eyeDistance = tan > 0 ? halfHeight / tan : Number.POSITIVE_INFINITY;
  const rayStart = Math.min(rayLimit, eyeDistance);
  return {
    back,
    halfHeight,
    rayEnd: rayStart + rayLimit * 2,
    rayStart,
    right,
    tanHalfFieldOfView: tan,
    target,
    up,
  } satisfies FilmV3Camera;
}

/**
The invisible floor has the color of the field, so near a level camera its shadow collapses into a
thin line with no visible floor under it. The shadow fades out below 9 degrees of elevation.
*/
export function floorStrengthAt(elevation: number): number {
  const amount = clamp01((elevation - 1.5) / 7.5);
  return amount * amount * (3 - 2 * amount);
}

/** The camera-fixed key light: upper left and toward the viewer. */
export function keyLight(camera: FilmV3Camera, aoScale: number, shadeStrength: number) {
  const local: Vector3 = normalize([-0.5, 0.78, 0.58]);
  const direction = normalize(
    add(
      add(scale(camera.right, local[0]), scale(camera.up, local[1])),
      scale(camera.back, local[2]),
    ),
  );
  const ambient = 0.6;
  // A face that looks at the camera gets exactly its tone, so frame 0 is the flat mark.
  return { ambient, aoScale, direction, key: (1 - ambient) / local[2], shadeStrength };
}

/** Entry point of the pixel ray into the box of half size `half` at the origin, as unit coordinates. */
export function probeAt(
  camera: FilmV3Camera,
  width: number,
  height: number,
  x: number,
  y: number,
  half: number,
) {
  const screenX = ((x / width) * 2 - 1) * (width / height);
  const screenY = 1 - (y / height) * 2;
  const lateral = add(scale(camera.right, screenX), scale(camera.up, screenY));
  const focal = add(camera.target, scale(lateral, camera.halfHeight));
  const direction = normalize(
    add(scale(lateral, camera.tanHalfFieldOfView), scale(camera.back, -1)),
  );
  const origin = add(focal, scale(direction, -camera.rayStart));
  let near = Number.NEGATIVE_INFINITY;
  let far = Number.POSITIVE_INFINITY;
  for (const axis of [0, 1, 2] as const) {
    const first = (-half - origin[axis]) / direction[axis];
    const second = (half - origin[axis]) / direction[axis];
    near = Math.max(near, Math.min(first, second));
    far = Math.min(far, Math.max(first, second));
  }
  if (near > far) {
    return null;
  }
  const hit = add(origin, scale(direction, near));
  return [hit[0] / (2 * half) + 0.5, hit[1] / (2 * half) + 0.5, hit[2] / (2 * half) + 0.5] as const;
}

// ---------- the tesseract ----------

/**
4D eye distance: the cells at w = 4/3 project at 2.25 times the size of the cells at w = 0, so the
opening of the outer mark frames the inner cube. No cell comes nearer than 0.79 to the 4D eye
during the turn, so the projection stays below 3.1 times.
*/
const eyeW = 2.4;

/**
The level 1 Menger cube is the frame of cubes with one-third beams around the cube edges. The
tesseract frame has the same beams around its 32 edges: joint cubes of half size 1/3 at the corner
cell centers x, y, z = +-2/3 and w = 2/3 * extent +- 2/3 * extent. Before the turn the inner cells
sit at w = 0, so the cube keeps its exact size and a shell twice its size grows out along w. With
`extent` 0 the pairs of joints coincide and the projection is exactly the level 1 cube. The turn in
the xw plane about the tesseract center swaps the inner and outer cells at 180 degrees.
*/
export function tesseractJoints(extent: number, turn: number) {
  const centerW = (2 / 3) * extent;
  const cosine = Math.cos(turn * degrees);
  const sine = Math.sin(turn * degrees);
  const corners = Array.from({ length: 16 }, (_, index) => {
    const sign = (bit: number) => ((index >> bit) & 1 ? 1 : -1);
    const x0 = sign(0) * (2 / 3);
    const w0 = sign(3) * centerW;
    const x = x0 * cosine - w0 * sine;
    const w = centerW + x0 * sine + w0 * cosine;
    const perspective = eyeW / (eyeW - w);
    const y = sign(1) * (2 / 3) * perspective;
    const z = sign(2) * (2 / 3) * perspective;
    return [x * perspective, y, z, perspective / 3] as const;
  });
  const joints: (readonly [number, number, number, number])[] = [];
  for (let index = 0; index < 16; index += 1) {
    for (let bit = 0; bit < 4; bit += 1) {
      if (((index >> bit) & 1) === 0) {
        for (const corner of [corners[index], corners[index | (1 << bit)]]) {
          if (!corner) {
            throw new Error("A tesseract corner index is out of range");
          }
          joints.push(corner);
        }
      }
    }
  }
  const extentOn = (axis: 0 | 1 | 2) =>
    Math.max(...corners.map((corner) => Math.abs(corner[axis]) + corner[3])) + 0.05;
  return {
    halfExtent: [extentOn(0), extentOn(1), extentOn(2)] as const,
    joints,
    lowest: Math.min(...corners.map(([, y, , half]) => y - half)),
  };
}

// ---------- the shuffle ----------

type Slot = readonly [number, number, number];
export type ShuffleMove = { at: number; from: Slot; to: Slot };

/**
The Menger layout of the landing shuffle: the 20 filled slots of `MENGER_SPONGE_VOXEL_STATE`, x first,
then y, then z. Its 7 empty slots are the vacancies.
*/
const mengerSlots: readonly number[] = MENGER_SPONGE_VOXEL_STATE.split("-").flatMap((layer) =>
  layer.split("_").flatMap((row) => row.split("").map((cell) => (cell === "x" ? 1 : 0))),
);

function slotIndex([x, y, z]: Slot): number {
  return x + y * 3 + z * 9;
}

function slotCenter([x, y, z]: Slot): Vector3 {
  return [((x - 1) * 2) / 3, ((y - 1) * 2) / 3, ((z - 1) * 2) / 3];
}

const moveDuration = LOGO_SHUFFLE_MOVE_DURATION_MS / 1000;

/**
Fail closed on a plan that breaks the landing shuffle rules: a move leaves a filled slot for the
free slot next to it along one axis, no two moves in flight share a slot, at most three move at
once (the renderer draws three), and the plan ends in the Menger layout.
*/
export function checkShufflePlan(moves: readonly ShuffleMove[]): void {
  const events = moves
    .flatMap((move) => [
      { kind: "end" as const, move, time: move.at + moveDuration },
      { kind: "start" as const, move, time: move.at },
    ])
    .sort((left, right) => left.time - right.time || (left.kind === "end" ? -1 : 1));
  const slots = [...mengerSlots];
  const busy = new Set<number>();
  for (const { kind, move } of events) {
    const from = slotIndex(move.from);
    const to = slotIndex(move.to);
    if (kind === "end") {
      slots[to] = 1;
      busy.delete(from);
      busy.delete(to);
      continue;
    }
    const steps = move.from.reduce(
      (sum, value, axis) => sum + Math.abs(value - (move.to[axis] ?? value)),
      0,
    );
    if (
      slots[from] !== 1 ||
      slots[to] !== 0 ||
      steps !== 1 ||
      !isWithinVoxelGrid(3, ...move.to) ||
      busy.has(from) ||
      busy.has(to) ||
      busy.size >= 6
    ) {
      throw new Error(
        `Shuffle move ${voxelKey(...move.from)} to ${voxelKey(...move.to)} breaks the rules`,
      );
    }
    slots[from] = 0;
    busy.add(from);
    busy.add(to);
  }
  if (slots.some((filled, slot) => filled !== mengerSlots[slot])) {
    throw new Error("A shuffle plan does not return to the Menger layout");
  }
}

/** The resting slots and the cells in flight at `time`. The same state holds inside every cell. */
export function readShuffle(time: number, moves: readonly ShuffleMove[]) {
  const slots = [...mengerSlots];
  const inFlight: { from: Vector3; progress: number; to: Vector3 }[] = [];
  for (const { at, from, to } of [...moves].sort((left, right) => left.at - right.at)) {
    if (time < at) {
      continue;
    }
    slots[slotIndex(from)] = 0;
    if (time < at + moveDuration) {
      inFlight.push({
        from: slotCenter(from),
        progress: easeLogoShuffleProgress((time - at) / moveDuration),
        to: slotCenter(to),
      });
    } else {
      slots[slotIndex(to)] = 1;
    }
  }
  return { moves: inFlight, slots };
}
