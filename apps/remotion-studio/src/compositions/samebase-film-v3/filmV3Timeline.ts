import {
  easeLogoShuffleProgress,
  LOGO_SHUFFLE_MOVE_DURATION_MS,
  LOGO_SHUFFLE_MOVE_STAGGER_MS,
} from "@samebase/logo-model/shuffle";
import { isWithinVoxelGrid, MENGER_SPONGE_VOXEL_STATE, voxelKey } from "@samebase/logo-model/voxel";

export const filmV3Fps = 60;
export const filmV3DurationInSeconds = 42;
/** The beat clips replay the film from the settle to the orbit after the fourth direction. */
export const beatClipStart = 13;
export const beatClipDurationInSeconds = 10;

export type Vector3 = readonly [number, number, number];
export type Rgb = Vector3;

/** Which fourth-direction beat a cut shows. */
export type FourthDirection = "fan" | "tesseract";

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
  };
  sponge: {
    center: Vector3;
    depth: number;
    halfSize: number;
    openness: number;
    probe: Vector3;
    restDepth: number;
    revealRadius: number;
  };
  tesseract: {
    halfExtent: Vector3;
    /** Two joint cubes per beam: center x, y, z and half size. */
    joints: readonly (readonly [number, number, number, number])[];
  };
  tones: { x: Rgb; y: Rgb; z: Rgb };
};

export type FilmV3Text = {
  align: "center" | "left" | "right";
  /** Cap height in pixels. */
  cap: number;
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
    unfold: readonly [number, number];
  };
};

/** `landscape` is the 1920x1080 film and `portrait` the 1080x1350 feed cut. */
export type FilmV3Format = "landscape" | "portrait";

/** `blue` is a deep blue field, `haze` a pale sky, and `paper` a warm off-white. */
export type FilmV3Palette = "blue" | "haze" | "paper";

export type FilmV3Options = {
  format: FilmV3Format;
  fourthDirection: FourthDirection;
  height: number;
  palette: FilmV3Palette;
  sampleGrid: number;
  width: number;
};

// ---------- colors ----------

function hex(value: number): Rgb {
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

export const inks = {
  newFace: hex(0x4068cc),
  cyan: hex(0x00b8db),
  slate: hex(0x394447),
  white: hex(0xffffff),
};

/**
The sky behind the object, from the top to the bottom of the frame, the ink of every word, and the
tint of the floor shadow. The sky stays darker than the white top face, and the words stay dense.
*/
const palettes = {
  blue: { ink: inks.white, shadowTint: hex(0x6d6aa8), sky: [hex(0x3255a4), hex(0x3255a4)] },
  haze: { ink: hex(0x171b4f), shadowTint: hex(0xa8b3cc), sky: [hex(0x8499b0), hex(0xdfe4ea)] },
  paper: { ink: hex(0x232d31), shadowTint: hex(0xbdb3a8), sky: [hex(0xeee8dc), hex(0xeee8dc)] },
} as const satisfies Record<FilmV3Palette, { ink: Rgb; shadowTint: Rgb; sky: readonly [Rgb, Rgb] }>;

/** The landing hero tones by face direction: x the side faces, y the top, z the mark face. */
const landingTones = { x: inks.cyan, y: inks.white, z: inks.slate };

// ---------- motion ----------

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

function progress(time: number, start: number, end: number): number {
  return clamp01((time - start) / (end - start));
}

function mix(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

function easeInOutCubic(value: number): number {
  return value < 0.5 ? 4 * value ** 3 : 1 - (-2 * value + 2) ** 3 / 2;
}

function easeInOutSine(value: number): number {
  return -(Math.cos(Math.PI * value) - 1) / 2;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const amount = clamp01((value - edge0) / (edge1 - edge0));
  return amount * amount * (3 - 2 * amount);
}

function easeOutCubic(value: number): number {
  return 1 - (1 - value) ** 3;
}

/** A short ease in and a long ease out, with no overshoot: the speed peaks at 38 percent. */
function easeInLongOut(value: number): number {
  return 1 - (1 - value * value) ** 4;
}

function easeOutQuint(value: number): number {
  return 1 - (1 - value) ** 5;
}

function easeOutBack(value: number, overshoot = 1.4): number {
  return 1 + (overshoot + 1) * (value - 1) ** 3 + overshoot * (value - 1) ** 2;
}

/** Piecewise motion: each key eases from the previous value to its own value over its span. */
type Key = { at: number; ease: (value: number) => number; to: number; until: number };

function keyed(time: number, from: number, keys: readonly Key[]): number {
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

function add(a: Vector3, b: Vector3): Vector3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function scale(a: Vector3, amount: number): Vector3 {
  return [a[0] * amount, a[1] * amount, a[2] * amount];
}

function cross(a: Vector3, b: Vector3): Vector3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function normalize(a: Vector3): Vector3 {
  return scale(a, 1 / Math.hypot(a[0], a[1], a[2]));
}

const degrees = Math.PI / 180;
const isometricYaw = -45;
const isometricElevation = Math.atan(1 / Math.SQRT2) / degrees;
/** Hexagon radius of the isometric cube, in cube half sizes. */
const hexagonRadius = 2 * Math.sqrt(2 / 3);

type Orbit = {
  elevation: number;
  halfHeight: number;
  tan: number;
  target: Vector3;
  yaw: number;
};

function orbitCamera({ elevation, halfHeight, tan, target, yaw }: Orbit, rayLimit: number) {
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
function floorStrengthAt(elevation: number): number {
  const amount = clamp01((elevation - 1.5) / 7.5);
  return amount * amount * (3 - 2 * amount);
}

/** The camera-fixed key light: upper left and toward the viewer. */
function keyLight(camera: FilmV3Camera, aoScale: number, shadeStrength: number) {
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
function probeAt(
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
function tesseractJoints(extent: number, turn: number) {
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

// ---------- the story ----------

export const beats = {
  press: 2,
  /** The cursor lets go after the second drag and hovers; the reveal then covers the cube. */
  hover: 6.35,
  /** The cube shuffles at three levels, and every move returns before the settle. */
  shuffle: 8.45,
  settle: 13.2,
  still: 14.5,
  lift: 17.5,
  collapse: 20,
  /** The four faces close on the beat, and the orbit resumes. */
  resume: 21.5,
  /**
  The pull back starts in the middle of a shuffle move of the cube, and the cube becomes the corner
  cell of the giant, which the haze still hides.
  */
  scale: 25.2,
  end: 32.5,
  url: 36.75,
} as const;

const iso: Pick<Orbit, "elevation" | "yaw"> = {
  elevation: isometricElevation,
  yaw: isometricYaw,
};

/**
Drag orbit: the cursor turns the solid as on the landing hero. During the hover the camera swings
to the left side, where the three moving faces take the light.
*/
function readOrbit(time: number): Orbit {
  const yaw = keyed(time, 0, [
    { at: 2, ease: easeInOutSine, to: -58, until: 4.2 },
    { at: 4.2, ease: easeOutCubic, to: -62, until: 4.5 },
    { at: 4.5, ease: easeInOutSine, to: 34, until: 6.3 },
    { at: 6.3, ease: easeOutCubic, to: 40, until: 6.9 },
    { at: 6.9, ease: easeInOutSine, to: -32, until: 9.4 },
    { at: 9.4, ease: easeInOutSine, to: -40, until: beats.settle },
    { at: beats.settle, ease: easeInLongOut, to: iso.yaw, until: beats.still },
    { at: beats.resume, ease: easeInOutSine, to: -118, until: 25.6 },
  ]);
  const elevation = keyed(time, 0, [
    { at: 2, ease: easeInOutSine, to: 24, until: 4.2 },
    { at: 4.5, ease: easeInOutSine, to: 12, until: 6.3 },
    { at: 6.9, ease: easeInOutSine, to: 24, until: 9.4 },
    { at: 9.4, ease: easeInOutSine, to: 27, until: beats.settle },
    { at: beats.settle, ease: easeInLongOut, to: iso.elevation, until: beats.still },
    { at: beats.resume, ease: easeInOutSine, to: 22, until: 25.6 },
  ]);
  const tan = keyed(time, 0, [
    { at: 2, ease: easeInOutCubic, to: 0.42, until: 3.6 },
    { at: 6.9, ease: easeInOutSine, to: 0.34, until: 9.4 },
    { at: beats.settle, ease: easeInLongOut, to: 0, until: beats.still },
    { at: beats.resume, ease: easeInOutCubic, to: 0.36, until: 24.6 },
  ]);
  const halfHeight = keyed(time, 2.8, [
    { at: 2, ease: easeInOutCubic, to: 2.35, until: 3.6 },
    { at: 6.9, ease: easeInOutSine, to: 2.5, until: 9.4 },
    { at: beats.settle, ease: easeInLongOut, to: 2.9, until: beats.still },
    { at: beats.resume, ease: easeInOutCubic, to: 2.6, until: 24.6 },
  ]);
  return { elevation, halfHeight, tan, target: [0, 0, 0], yaw };
}

/** Cursor pixels per degree of drag. */
const dragPixelsPerDegree = 6.2;

function readCursor(time: number, orbit: Orbit, width: number, height: number): FilmV3Cursor {
  const centerX = width / 2;
  const centerY = height / 2;
  const grabX = centerX + 120;
  const grabY = centerY + 90;
  const visible = progress(time, 0.5, 0.8) * (1 - progress(time, 8.85, 9.2));
  const pressWindows = [
    [2, 4.2],
    [4.5, 6.3],
  ] as const;
  let pressed = 0;
  for (const [start, end] of pressWindows) {
    pressed = Math.max(
      pressed,
      progress(time, start - 0.12, start) * (1 - progress(time, end, end + 0.12)),
    );
  }
  if (time < 2) {
    // Enter from the lower right and settle on the grab point on the downbeat.
    const approach = easeOutCubic(progress(time, 0.5, 1.9));
    return {
      pressed,
      visible,
      x: mix(width * 0.86, grabX, approach),
      y: mix(height * 1.02, grabY, approach),
    };
  }
  if (time < beats.hover) {
    // The cursor follows the drag: yaw moves it sideways and elevation moves it down.
    return {
      pressed,
      visible,
      x: grabX - orbit.yaw * dragPixelsPerDegree,
      y:
        grabY +
        orbit.elevation * dragPixelsPerDegree * 0.55 -
        70 * Math.sin(Math.PI * progress(time, 4.5, 6.3)),
    };
  }
  // Hover: a slow figure eight over the faces, after the landing hero automatic probe.
  const release = readOrbit(beats.hover);
  const lastX = grabX - release.yaw * dragPixelsPerDegree;
  const lastY = grabY + release.elevation * dragPixelsPerDegree * 0.55;
  const hover = progress(time, beats.hover, beats.shuffle + 0.5);
  const angle = hover * Math.PI * 2 * 0.85;
  const entry = easeInOutSine(progress(time, beats.hover, beats.hover + 0.6));
  // The cursor stays on the cube until the reveal covers it, then leaves.
  const exit = easeInOutCubic(progress(time, beats.shuffle, 9.2));
  const loopX = centerX + Math.sin(angle * 2) * 180 + 20;
  const loopY = centerY - Math.sin(angle) * 150 + 30;
  return {
    pressed: 0,
    visible,
    x: mix(mix(lastX, loopX, entry), width * 0.9, exit),
    y: mix(mix(lastY, loopY, entry), height * 1.05, exit),
  };
}

function riseOf(time: number, at: number, until: number): number {
  return (
    easeOutQuint(progress(time, at, at + 0.45)) *
    (1 - easeInOutCubic(progress(time, until, until + 0.35)))
  );
}

type Timed = { at: number; text: string };
type Placement = Omit<FilmV3Text, "words"> & { leading: number };

/** One text row per entry of `rows`, `leading` pixels apart. Every word rises at its own time. */
function stack(
  rows: readonly (readonly Timed[])[],
  until: number,
  time: number,
  { leading, ...placement }: Placement,
): FilmV3Text[] {
  return rows.map((words, index) => ({
    ...placement,
    words: words.map(({ at, text }) => ({ rise: riseOf(time, at, until), text })),
    y: placement.y + index * leading,
  }));
}

/** Pixel positions are authored per format: 1920x1080 for the film and 1080x1350 for the feed cut. */
function readTexts(time: number, format: FilmV3Format, ink: Rgb) {
  const portrait = format === "portrait";
  const pick = <Value>(landscape: Value, portraitValue: Value) =>
    portrait ? portraitValue : landscape;
  const backdrop: FilmV3Text[] = [];
  const overlay: FilmV3Text[] = [];

  // Hook: SAME and BASE fill the frame from frame 0 and slide off with the drag.
  const slide = easeInOutSine(progress(time, 2, 4.4));
  const drift = time * 6;
  const width = pick(1920, 1080);
  if (time < 4.6) {
    backdrop.push({
      align: "left",
      cap: pick(300, 250),
      color: ink,
      words: [{ rise: 1, text: "SAME" }],
      x: pick(110, 60) + drift + slide * width,
      y: pick(470, 400),
    });
    backdrop.push({
      align: "right",
      cap: pick(300, 250),
      color: ink,
      words: [{ rise: 1, text: "BASE" }],
      x: pick(1810, 1020) - drift + slide * width * 1.25,
      y: pick(910, 1210),
    });
  }

  backdrop.push(
    ...stack(
      [
        [
          { at: 14.75, text: "GitHub." },
          { at: 15.5, text: "Convex." },
          { at: 16.25, text: "Cloudflare." },
        ],
      ],
      17.2,
      time,
      {
        align: "center",
        cap: pick(80, 56),
        color: ink,
        leading: 0,
        x: pick(960, 540),
        y: pick(1000, 1240),
      },
    ),
  );

  // Two lines at the lower left keep clear of the four-face diamond.
  const lower: Placement = {
    align: "left",
    cap: pick(56, 64),
    color: ink,
    leading: pick(80, 88),
    x: pick(110, 70),
    y: pick(940, 1215),
  };
  backdrop.push(
    ...stack(
      [[{ at: 19, text: "Delete your" }], [{ at: 19.15, text: "Samebase account." }]],
      21.45,
      time,
      lower,
    ),
  );
  backdrop.push(
    ...stack(
      [[{ at: 21.75, text: "Your app" }], [{ at: 21.9, text: "doesn't notice." }]],
      25.1,
      time,
      lower,
    ),
  );

  const skyPlacement: Placement = {
    align: "left",
    cap: pick(82, 80),
    color: ink,
    leading: pick(130, 106),
    x: pick(110, 70),
    y: pick(190, 170),
  };
  const everyApp = pick(
    [[{ at: 29, text: "Every app on the same base." }]],
    [[{ at: 29, text: "Every app on" }], [{ at: 29.15, text: "the same base." }]],
  );
  overlay.push(...stack(everyApp, 32.1, time, skyPlacement));
  overlay.push(
    ...stack([[{ at: 30.25, text: "Samebase too." }]], 32.1, time, {
      ...skyPlacement,
      color: ink,
      y: skyPlacement.y + everyApp.length * skyPlacement.leading,
    }),
  );

  backdrop.push(
    ...stack(
      [
        [{ at: 32.75, text: "Same base." }],
        [{ at: 33.5, text: "Your accounts." }],
        [{ at: 34.25, text: "No magic." }],
      ],
      99,
      time,
      {
        align: pick("left", "center"),
        cap: pick(112, 96),
        color: ink,
        leading: pick(175, 150),
        x: pick(150, 540),
        y: pick(330, 720),
      },
    ),
  );
  backdrop.push(
    ...stack([[{ at: beats.url, text: "samebase.com" }]], 99, time, {
      align: pick("left", "center"),
      cap: pick(58, 56),
      color: ink,
      leading: 0,
      x: pick(152, 540),
      y: pick(930, 1210),
    }),
  );

  return { backdrop, overlay };
}

const restFaces = {
  center: [0, 0],
  enabled: false,
  radius: 0,
  unfold: 0,
} as const satisfies FilmV3Scene["faces"];

/**
The faces replace the render one beat before the lift and hand it back just before the resume, both
while the camera is still. At unfold 0 the faces equal the render, so neither swap shows.
*/
const facesStart = beats.lift - 0.5;
const facesEnd = beats.resume - 0.04;
const unfoldSeconds = 1.6;

/**
The unfold opens on the lift, holds, and closes with the exact reverse. It is home a moment before
the faces end, so they end at rest.
*/
function readUnfold(time: number): number {
  const closed = beats.resume - 0.06;
  const opening = easeInOutSine(progress(time, beats.lift, beats.lift + unfoldSeconds));
  const closing = easeInOutSine(progress(time, closed - unfoldSeconds, closed));
  return opening * (1 - closing);
}

/**
The fourth direction. The orthographic isometric frame is split along the three lines from the
center into the top, left, and right faces, and the renderer draws each one as an affine map of its
rendered region, including the depth seen through its opening. At every unfold from 0 to 1 the
figure is mirror symmetric about the vertical line through the center: the top face narrows from 120
to 90 degrees around straight up, the left and right faces open away from the lower line like two
doors, and the gap between them uncovers the new face, which waits at its final 90 degree shape
straight down. The face widths are 120 - 30 u for the top, left, and right faces and 90 u for the
new face, so the faces always tile the full turn.
*/
function readFaces(time: number, halfHeight: number, width: number, height: number) {
  return {
    center: [width / 2, height / 2],
    enabled: time >= facesStart && time < facesEnd,
    radius: (hexagonRadius * height) / (2 * halfHeight),
    unfold: readUnfold(time),
  } satisfies FilmV3Scene["faces"];
}

/** The fourth axis: the shell grows on the lift, turns inside out, and collapses. */
function readTesseract(time: number) {
  const open = easeOutBack(progress(time, beats.lift, beats.lift + 1.2), 1.1);
  const collapse = easeInOutCubic(progress(time, beats.collapse, beats.collapse + 0.8));
  const extent = open * (1 - collapse);
  const turn = 180 * easeInOutSine(progress(time, beats.lift + 1.3, beats.collapse - 0.1));
  // The camera eases out to a three-quarter view that shows the inner cube, then back.
  const view =
    easeInOutCubic(progress(time, beats.lift, beats.lift + 1.4)) *
    (1 - easeInOutCubic(progress(time, beats.collapse, beats.collapse + 1.6)));
  return {
    active: time >= beats.lift && time < beats.collapse + 0.8,
    view,
    ...tesseractJoints(extent, turn),
  };
}

// ---------- the shuffle ----------

type Slot = readonly [number, number, number];
type ShuffleMove = { at: number; from: Slot; to: Slot };

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
const moveStagger = LOGO_SHUFFLE_MOVE_STAGGER_MS / 1000;

/**
During the orbit: three edge cells slide up or across into the openings of the front, left, and top
faces, one stagger apart, and then slide back. The same moves run inside every cell at every level.
*/
const orbitMoves: readonly ShuffleMove[] = [
  { at: 8.5, from: [1, 0, 2], to: [1, 1, 2] },
  { at: 8.5 + moveStagger, from: [0, 0, 1], to: [0, 1, 1] },
  { at: 8.5 + 2 * moveStagger, from: [2, 2, 1], to: [1, 2, 1] },
  { at: 8.5 + moveDuration, from: [1, 1, 2], to: [1, 0, 2] },
  { at: 8.5 + moveStagger + moveDuration, from: [0, 1, 1], to: [0, 0, 1] },
  { at: 8.5 + 2 * moveStagger + moveDuration, from: [1, 2, 1], to: [2, 2, 1] },
];

/** Across the cut to the giant: a cell slides up into the left face opening and back. */
const scaleMoves: readonly ShuffleMove[] = [
  { at: 24.6, from: [0, 0, 1], to: [0, 1, 1] },
  { at: 24.6 + moveDuration + 0.2, from: [0, 1, 1], to: [0, 0, 1] },
];

/**
Fail closed on a plan that breaks the landing shuffle rules: a move leaves a filled slot for the
free slot next to it along one axis, no two moves in flight share a slot, at most three move at
once (the renderer draws three), and the plan ends in the Menger layout.
*/
function checkShufflePlan(moves: readonly ShuffleMove[]): void {
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

checkShufflePlan(orbitMoves);
checkShufflePlan(scaleMoves);

/** The resting slots and the cells in flight at `time`. The same state holds inside every cell. */
function readShuffle(time: number, moves: readonly ShuffleMove[]) {
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

/** The giant: a depth 5 sponge whose (-x, +y, -z) corner cell is the cube. */
const giantLevels = 5;
const giantHalfSize = 3 ** (giantLevels - 1);
const giantCenter: Vector3 = [giantHalfSize - 1, -(giantHalfSize - 1), giantHalfSize - 1];

/** The dolly backs away until the frame is this many times as tall. */
const pullZoom = 30 / 2.6;

function readPull(time: number): number {
  return easeInOutSine(progress(time, beats.scale, beats.scale + 4.6));
}

/**
One continuous camera move from the cube to the giant. The orbit keeps its own settle, and on top of
it an exponential dolly backs away from the corner cell in a three-quarter view with lit faces, so
the camera never nears the surface and never looks head on.
*/
function readPullBack(time: number, orbit: Orbit, format: FilmV3Format) {
  const pull = readPull(time);
  const drift = easeInOutSine(progress(time, beats.scale, beats.end));
  const halfHeight = orbit.halfHeight * pullZoom ** pull;
  const yaw = orbit.yaw - 12 * pull + 7 * drift;
  const elevation = orbit.elevation - 13 * pull + 2 * drift;
  // Screen offset of the corner: left of center and low, so the sky holds the words.
  const right: Vector3 = [Math.cos(yaw * degrees), 0, -Math.sin(yaw * degrees)];
  const offset = pull * halfHeight;
  return orbitCamera(
    {
      elevation,
      halfHeight,
      tan: orbit.tan + 0.38 * pull,
      target: add(scale(right, (format === "portrait" ? 0.22 : 0.58) * offset), [
        0,
        (format === "portrait" ? -0.1 : 0.32) * offset,
        0,
      ]),
      yaw,
    },
    giantHalfSize * 5,
  );
}

/**
The haze lifts with the pull back: at the scale beat it hides every other cell of the giant less
than a pixel past the cube, and the clear distance then grows with the dolly, a little ahead of it, while the
haze edge softens, until the whole giant is clear.
*/
function readHazeLift(time: number) {
  const zoom = pullZoom ** readPull(time);
  const clear = 2.2 * (zoom - 1) ** 1.6;
  return { clear, hidden: 0.0015 + clear * mix(2, 5, smoothstep(0.01, 0.5, clear)) };
}

/** The shots start at these times. The shutter never spans a cut. */
const shotStarts = [0, beats.end] as const;

/**
The frame at `time`. Its shutter is half a frame long and centered on `time`, clipped to the shot:
the renderer spreads the antialiasing samples over it.
*/
export function readFilmV3Frame(time: number, options: FilmV3Options): FilmV3Frame {
  const shotStart = Math.max(...shotStarts.filter((start) => start <= time));
  const shotEnd = Math.min(...shotStarts.filter((start) => start > time), Number.POSITIVE_INFINITY);
  const halfShutter = 0.25 / filmV3Fps;
  const open = readStillFrame(Math.max(time - halfShutter, shotStart), options).scene;
  const close = readStillFrame(Math.min(time + halfShutter, shotEnd - 1e-4), options).scene;
  return {
    ...readStillFrame(time, options),
    shutter: {
      cameras: [open.camera, close.camera],
      unfold: [open.faces.unfold, close.faces.unfold],
    },
  };
}

function readStillFrame(time: number, options: FilmV3Options): Omit<FilmV3Frame, "shutter"> {
  const { format, fourthDirection, height, palette, sampleGrid, width } = options;
  const { ink, shadowTint, sky } = palettes[palette];
  // The feed cut is narrower, so its orbit frames the cube a little smaller.
  const baseOrbit = readOrbit(time);
  const orbit = {
    ...baseOrbit,
    halfHeight: baseOrbit.halfHeight * (format === "portrait" ? 1.2 : 1),
  };
  const cursor = readCursor(time, orbit, width, height);
  const texts = readTexts(time, format, ink);
  const inGiant = time >= beats.scale && time < beats.end;
  const inEnd = time >= beats.end;

  let camera = orbitCamera(orbit, 6);
  let sponge: FilmV3Scene["sponge"] = {
    center: [0, 0, 0],
    depth: 3,
    halfSize: 1,
    openness: 0,
    probe: [0.5, 0.5, 1],
    restDepth: 1,
    revealRadius: 0.62,
  };
  let haze: FilmV3Scene["haze"] = { clear: 1e6, density: 0, hidden: 2e6, start: 0 };
  let floor = { height: -1, strength: floorStrengthAt(orbit.elevation) };
  let aoScale = 0.045;
  let shadeStrength = 1;
  let mode: FilmV3Scene["mode"] = "sponge";
  let faces: FilmV3Scene["faces"] = restFaces;
  let tesseract: FilmV3Scene["tesseract"] = {
    halfExtent: [1, 1, 1],
    joints: tesseractJoints(0, 0).joints,
  };

  // The hover reveal: the cursor probe opens deeper channels, as on the landing hero. At the end of
  // the hover the reveal covers the whole cube, so every level down to the third is open.
  const hovering = progress(time, beats.hover, beats.hover + 0.35);
  if (hovering > 0 && time < beats.shuffle) {
    // A slightly larger box catches a cursor at the cube edge; the probe clamps onto the cube.
    const margin = 1.3;
    const hit = probeAt(camera, width, height, cursor.x, cursor.y, margin);
    if (hit) {
      const onCube = (value: number) => clamp01(((value - 0.5) * 2 * margin) / 2 + 0.5);
      sponge = {
        ...sponge,
        openness: hovering,
        probe: [onCube(hit[0]), onCube(hit[1]), onCube(hit[2])],
        revealRadius: mix(0.62, 2.6, smoothstep(7.7, beats.shuffle - 0.1, time)),
      };
    }
  }
  // After the shuffle every channel closes again while the camera settles to the isometric view.
  if (time >= beats.settle && time < beats.lift) {
    sponge = {
      ...sponge,
      openness: 1 - easeInOutCubic(progress(time, beats.settle + 0.1, 14)),
      probe: [0.5, 0.5, 1],
      revealRadius: 2.6,
    };
  }

  // The shuffled sponge draws the open cube while cells move: it has the same geometry as the open
  // landing sponge at rest, so both switches hide in the orbit.
  let shuffle: FilmV3Scene["shuffle"] = {
    depth: 3,
    moveMinLevel: 0,
    ...readShuffle(time, orbitMoves),
  };
  if (time >= beats.shuffle && time < beats.settle) {
    mode = "shuffle";
  }
  if (time >= 24.5 && time < beats.end) {
    mode = "shuffle";
    shuffle = { depth: 1, moveMinLevel: 0, ...readShuffle(time, scaleMoves) };
  }

  if (fourthDirection === "fan") {
    faces = readFaces(time, orbit.halfHeight, width, height);
    // Only the faces exist while they are open, so the floor shadow of the cube fades with them.
    floor = { ...floor, strength: floor.strength * (1 - faces.unfold) };
  } else if (time >= beats.lift && time < beats.resume + 1.6) {
    const shape = readTesseract(time);
    const { view } = shape;
    // Nearly head on, the opening of the outer mark frames the inner cube.
    const elevation = orbit.elevation - 29 * view;
    camera = orbitCamera(
      {
        elevation,
        halfHeight: orbit.halfHeight + 1.6 * view,
        tan: orbit.tan + 0.22 * view,
        target: [0, -0.2 * view, 0],
        yaw: orbit.yaw + 37 * view,
      },
      12,
    );
    floor = { height: -1, strength: floorStrengthAt(elevation) };
    if (shape.active) {
      mode = "tesseract";
      tesseract = { halfExtent: shape.halfExtent, joints: shape.joints };
      floor = { height: Math.min(-1, shape.lowest), strength: floorStrengthAt(elevation) };
    }
  }

  // The floor has no place under the giant, so its shadow fades before the cube becomes a cell.
  if (time < beats.end) {
    floor = { ...floor, strength: floor.strength * (1 - smoothstep(24.2, beats.scale, time)) };
  }

  if (inGiant) {
    // The cube is the corner cell of the giant from here on, and the haze hides the rest.
    camera = readPullBack(time, orbit, format);
    // Only the cells of the cube size shuffle on the giant, so its outline stays whole.
    shuffle = {
      depth: giantLevels,
      moveMinLevel: giantLevels - 1,
      ...readShuffle(time, scaleMoves),
    };
    sponge = { ...sponge, center: giantCenter, halfSize: giantHalfSize };
    haze = { ...readHazeLift(time), density: 0.009, start: camera.rayStart + 12 };
    floor = { height: -1, strength: 0 };
    aoScale = 0.045 * Math.max(1, camera.halfHeight / 2.6);
    shadeStrength = 1 - 0.5 * smoothstep(2.6, 12, camera.halfHeight);
  }

  if (inEnd) {
    // The solid turns in and settles head on, flat as the mark, when the address lands.
    const turn = 1 - easeInOutCubic(progress(time, beats.end, beats.url));
    const view = { elevation: 10 * turn, halfHeight: 3.6, tan: 0.34 * turn, yaw: -32 * turn };
    const aligned = orbitCamera({ ...view, target: [0, 0, 0] }, 6);
    // Keep the cube center on the focal plane: right of the words, or above them in portrait.
    const target =
      format === "portrait"
        ? scale(aligned.up, -1.75)
        : add(scale(aligned.right, -4.27), scale(aligned.up, -0.6));
    camera = orbitCamera({ ...view, target }, 6);
    sponge = { ...sponge, center: [0, 0, 0], depth: 1, halfSize: 1, openness: 0, restDepth: 1 };
    haze = { clear: 1e6, density: 0, hidden: 2e6, start: 0 };
    floor = { height: -1, strength: floorStrengthAt(view.elevation) };
    aoScale = 0.045;
  }

  return {
    backdropTexts: texts.backdrop,
    cursor: inGiant || inEnd ? { pressed: 0, visible: 0, x: 0, y: 0 } : cursor,
    sky,
    grainStep: Math.floor(Math.round(time * 30) / 2),
    grain: 0.024,
    overlayTexts: texts.overlay,
    sampleGrid,
    scene: {
      camera,
      faces,
      floor,
      haze,
      light: keyLight(camera, aoScale, shadeStrength),
      mode,
      shuffle,
      sponge,
      tesseract,
      tones: landingTones,
    },
    shadowTint,
  };
}
