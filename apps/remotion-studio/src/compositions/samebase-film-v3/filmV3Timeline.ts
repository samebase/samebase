export const filmV3Fps = 30;
export const filmV3DurationInSeconds = 42;
/** The beat clips replay the film from the settle to the orbit after the fourth direction. */
export const beatClipStart = 13;
export const beatClipDurationInSeconds = 10;

export type Vector3 = readonly [number, number, number];
export type Rgb = Vector3;

/** Which fourth-direction beat a cut shows. */
export type FourthDirection = "fan" | "tesseract";

export type FanCard = {
  angle: number;
  brightness: number;
  /** 0 top, 1 left, 2 right (the mark face). */
  face: 0 | 1 | 2;
  /** A new tone for the source face direction, or null to keep the rendered face. */
  tone: Rgb | null;
};

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
  fan: {
    cards: readonly [FanCard, FanCard, FanCard, FanCard];
    center: readonly [number, number];
    enabled: boolean;
    radius: number;
    shadow: number;
  };
  floor: { height: number; strength: number };
  haze: { color: Rgb; density: number; start: number };
  light: { ambient: number; aoScale: number; direction: Vector3; key: number };
  mode: "sponge" | "tesseract";
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
  field: Rgb;
  frameIndex: number;
  grain: number;
  overlayTexts: readonly FilmV3Text[];
  sampleGrid: number;
  scene: FilmV3Scene;
  shadowTint: Rgb;
};

/** `landscape` is the 1920x1080 film and `portrait` the 1080x1350 feed cut. */
export type FilmV3Format = "landscape" | "portrait";

export type FilmV3Options = {
  format: FilmV3Format;
  fourthDirection: FourthDirection;
  height: number;
  sampleGrid: number;
  width: number;
};

// ---------- colors ----------

function hex(value: number): Rgb {
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

export const inks = {
  blue: hex(0x3255a4),
  cyan: hex(0x00b8db),
  pink: hex(0xff48b0),
  slate: hex(0x394447),
  white: hex(0xffffff),
};

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

function easeOutCubic(value: number): number {
  return 1 - (1 - value) ** 3;
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
function keyLight(camera: FilmV3Camera, aoScale: number) {
  const local: Vector3 = normalize([-0.5, 0.78, 0.58]);
  const direction = normalize(
    add(
      add(scale(camera.right, local[0]), scale(camera.up, local[1])),
      scale(camera.back, local[2]),
    ),
  );
  const ambient = 0.6;
  // A face that looks at the camera gets exactly its tone, so frame 0 is the flat mark.
  return { ambient, aoScale, direction, key: (1 - ambient) / local[2] };
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
  hover: 9.5,
  settle: 12.5,
  still: 14.5,
  lift: 17.5,
  collapse: 21.6,
  resume: 22.6,
  scale: 25.5,
  end: 32.5,
  url: 36.75,
} as const;

const iso: Pick<Orbit, "elevation" | "yaw"> = {
  elevation: isometricElevation,
  yaw: isometricYaw,
};

/** Drag orbit: the cursor turns the solid as on the landing hero. */
function readOrbit(time: number): Orbit {
  const yaw = keyed(time, 0, [
    { at: 2, ease: easeInOutSine, to: -58, until: 4.6 },
    { at: 4.6, ease: easeOutCubic, to: -63, until: 5.0 },
    { at: 5.0, ease: easeInOutSine, to: 36, until: 7.1 },
    { at: 7.1, ease: easeOutCubic, to: 48, until: 8.3 },
    { at: 8.3, ease: easeInOutSine, to: -16, until: 9.5 },
    { at: 9.5, ease: easeInOutSine, to: -28, until: 12.5 },
    { at: 12.5, ease: easeInOutCubic, to: iso.yaw, until: 14.4 },
    { at: beats.resume, ease: easeInOutSine, to: -118, until: 25.6 },
  ]);
  const elevation = keyed(time, 0, [
    { at: 2, ease: easeInOutSine, to: 24, until: 4.6 },
    { at: 5.0, ease: easeInOutSine, to: 12, until: 7.1 },
    { at: 8.3, ease: easeInOutSine, to: 20, until: 9.5 },
    { at: 9.5, ease: easeInOutSine, to: 26, until: 12.5 },
    { at: 12.5, ease: easeInOutCubic, to: iso.elevation, until: 14.4 },
    { at: beats.resume, ease: easeInOutSine, to: 22, until: 25.6 },
  ]);
  const tan = keyed(time, 0, [
    { at: 2, ease: easeInOutCubic, to: 0.42, until: 3.6 },
    { at: 12.5, ease: easeInOutCubic, to: 0, until: 14.3 },
    { at: beats.resume, ease: easeInOutCubic, to: 0.36, until: 24.6 },
  ]);
  const halfHeight = keyed(time, 2.8, [
    { at: 2, ease: easeInOutCubic, to: 2.35, until: 3.6 },
    { at: 12.5, ease: easeInOutCubic, to: 2.9, until: 14.3 },
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
  const visible = progress(time, 0.5, 0.8) * (1 - progress(time, 13.2, 13.6));
  const pressWindows = [
    [2, 4.6],
    [5.0, 7.1],
    [8.3, 9.4],
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
  if (time < 9.4) {
    // The cursor follows the drag: yaw moves it sideways and elevation moves it down.
    return {
      pressed,
      visible,
      x: grabX - orbit.yaw * dragPixelsPerDegree,
      y:
        grabY +
        orbit.elevation * dragPixelsPerDegree * 0.55 -
        70 * Math.sin(Math.PI * progress(time, 5, 7.1)),
    };
  }
  // Hover: a slow figure eight over the faces, after the landing hero automatic probe.
  const lastX = grabX + 16 * dragPixelsPerDegree;
  const lastY = grabY + 20 * dragPixelsPerDegree * 0.55;
  const hover = progress(time, 9.4, 13.4);
  const angle = hover * Math.PI * 2 * 0.85;
  const entry = easeInOutSine(progress(time, 9.4, 10.0));
  const exit = easeInOutCubic(progress(time, 12.6, 13.6));
  const loopX = centerX + Math.sin(angle * 2) * 230 + 40;
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
function readTexts(time: number, format: FilmV3Format) {
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
      color: inks.blue,
      words: [{ rise: 1, text: "SAME" }],
      x: pick(110, 60) + drift + slide * width,
      y: pick(470, 400),
    });
    backdrop.push({
      align: "right",
      cap: pick(300, 250),
      color: inks.blue,
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
        color: inks.blue,
        leading: 0,
        x: pick(960, 540),
        y: pick(1000, 1240),
      },
    ),
  );

  const lower: Placement = {
    align: "left",
    cap: pick(76, 70),
    color: inks.blue,
    leading: 96,
    x: pick(110, 70),
    y: pick(1000, 1160),
  };
  backdrop.push(
    ...stack(
      pick(
        [[{ at: 20.4, text: "Delete your Samebase account." }]],
        [[{ at: 20.4, text: "Delete your" }], [{ at: 20.55, text: "Samebase account." }]],
      ),
      22.35,
      time,
      lower,
    ),
  );
  backdrop.push(
    ...stack(
      pick(
        [[{ at: 22.6, text: "Your app doesn't notice." }]],
        [[{ at: 22.6, text: "Your app" }], [{ at: 22.75, text: "doesn't notice." }]],
      ),
      25.2,
      time,
      lower,
    ),
  );

  const skyPlacement: Placement = {
    align: "left",
    cap: pick(82, 80),
    color: inks.pink,
    leading: pick(130, 106),
    x: pick(110, 70),
    y: pick(190, 170),
  };
  const everyApp = pick(
    [[{ at: 27, text: "Every app on the same base." }]],
    [[{ at: 27, text: "Every app on" }], [{ at: 27.15, text: "the same base." }]],
  );
  overlay.push(...stack(everyApp, 32.1, time, skyPlacement));
  overlay.push(
    ...stack([[{ at: 29.25, text: "Samebase too." }]], 32.1, time, {
      ...skyPlacement,
      color: inks.white,
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
        color: inks.blue,
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
      color: inks.slate,
      leading: 0,
      x: pick(152, 540),
      y: pick(930, 1210),
    }),
  );

  return { backdrop, overlay };
}

const restFan = {
  cards: [
    { angle: 0, brightness: 1, face: 2, tone: null },
    { angle: 0, brightness: 1, face: 0, tone: null },
    { angle: 0, brightness: 1, face: 1, tone: null },
    { angle: 0, brightness: 1, face: 2, tone: inks.pink },
  ],
  center: [0, 0],
  enabled: false,
  radius: 0,
  shadow: 0,
} as const satisfies FilmV3Scene["fan"];

/**
The card fan: the face bisectors go from 90, 210, and 330 degrees to an even X at 135, 225, and 315,
and a fourth card slides out from under the right card to 45. The spacing goes from 120 to 90
degrees. Card 0 is on top, and the new card is under its two neighbors.
*/
function readFan(
  time: number,
  halfHeight: number,
  width: number,
  height: number,
): FilmV3Scene["fan"] {
  const open = easeOutBack(progress(time, beats.lift, beats.lift + 1.1), 1.1);
  const close = easeInOutCubic(progress(time, beats.collapse, beats.collapse + 0.8));
  const amount = open * (1 - close);
  // While open, the whole fan turns a little in the picture plane, which no cube can do.
  const spin = -12 * Math.sin(Math.PI * progress(time, beats.lift + 1.1, beats.collapse));
  const enabled = time >= beats.lift && time < beats.collapse + 0.8;
  return {
    cards: [
      { angle: -15 * amount + spin, brightness: 1, face: 2, tone: null },
      { angle: 45 * amount + spin, brightness: 1, face: 0, tone: null },
      { angle: 15 * amount + spin, brightness: 1, face: 1, tone: null },
      { angle: 75 * amount + spin, brightness: 1, face: 2, tone: inks.blue },
    ],
    center: [width / 2, height / 2],
    enabled,
    radius: (hexagonRadius * height) / (2 * halfHeight),
    shadow: 0.3 * clamp01(amount),
  };
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

/**
The giant: a depth 5 sponge whose (-x, +y, -z) corner cell is the cube, so the match cut keeps the
cube in place and the camera finds the giant around it.
*/
const giantLevels = 5;
const giantHalfSize = 3 ** (giantLevels - 1);
const giantCenter: Vector3 = [giantHalfSize - 1, -(giantHalfSize - 1), giantHalfSize - 1];

function readGiant(time: number, format: FilmV3Format) {
  const local = time - beats.scale;
  // The camera backs straight away from the corner cell, so it never nears the surface.
  const pull = easeInOutCubic(progress(local, 0, 2.8));
  const drift = easeInOutSine(progress(local, 0, 7));
  const logHalfHeight = mix(Math.log(2.6), Math.log(30), pull);
  const halfHeight = Math.exp(logHalfHeight);
  const yaw = -118 - 12 * pull + 7 * drift;
  const elevation = 22 - 13 * pull + 2 * drift;
  // Screen offset of the corner: left of center and a little low, so the sky holds the words.
  const right: Vector3 = [Math.cos(yaw * degrees), 0, -Math.sin(yaw * degrees)];
  const offset = pull * halfHeight;
  const orbit: Orbit = {
    elevation,
    halfHeight,
    tan: mix(0.36, 0.74, pull),
    target: add(scale(right, (format === "portrait" ? 0.22 : 0.58) * offset), [
      0,
      (format === "portrait" ? -0.1 : 0.2) * offset,
      0,
    ]),
    yaw,
  };
  // The woken region grows from the cube's corner cell across the giant surface.
  const revealRadius = mix(0.3, 0.95, easeInOutSine(progress(local, 1.2, 6.8)));
  return { camera: orbitCamera(orbit, giantHalfSize * 5), revealRadius };
}

export function readFilmV3Frame(time: number, options: FilmV3Options): FilmV3Frame {
  const { format, fourthDirection, height, sampleGrid, width } = options;
  const frameIndex = Math.round(time * filmV3Fps);
  const orbit = readOrbit(time);
  const cursor = readCursor(time, orbit, width, height);
  const texts = readTexts(time, format);
  const inScale = time >= beats.scale && time < beats.end;
  const inEnd = time >= beats.end;

  let camera = orbitCamera(orbit, 6);
  let field = inks.pink;
  let sponge: FilmV3Scene["sponge"] = {
    center: [0, 0, 0],
    depth: 4,
    halfSize: 1,
    openness: 0,
    probe: [0.5, 0.5, 1],
    restDepth: 1,
    revealRadius: 0.62,
  };
  let haze: FilmV3Scene["haze"] = { color: field, density: 0, start: 0 };
  let floor = { height: -1, strength: floorStrengthAt(orbit.elevation) };
  let aoScale = 0.045;
  let mode: FilmV3Scene["mode"] = "sponge";
  let fan: FilmV3Scene["fan"] = restFan;
  let tesseract: FilmV3Scene["tesseract"] = {
    halfExtent: [1, 1, 1],
    joints: tesseractJoints(0, 0).joints,
  };

  // The hover reveal: the cursor probe opens deeper channels, as on the landing hero.
  const hovering =
    progress(time, beats.hover, beats.hover + 0.35) * (1 - progress(time, 12.7, 13.4));
  if (hovering > 0) {
    const probe = probeAt(camera, width, height, cursor.x, cursor.y, 1);
    if (probe) {
      sponge = { ...sponge, openness: hovering, probe };
    }
  }

  if (time >= beats.lift && time < beats.scale) {
    if (fourthDirection === "fan") {
      fan = readFan(time, orbit.halfHeight, width, height);
    } else {
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
  }

  if (inScale) {
    const giant = readGiant(time, format);
    camera = giant.camera;
    field = inks.blue;
    sponge = {
      center: giantCenter,
      depth: giantLevels,
      halfSize: giantHalfSize,
      openness: 1,
      probe: [0, 1, 0],
      restDepth: 2,
      revealRadius: giant.revealRadius,
    };
    haze = { color: field, density: 0.009, start: camera.rayStart + 12 };
    floor = { height: -1, strength: 0 };
    aoScale = 0.045 * (camera.halfHeight / 2.6);
  }

  if (inEnd) {
    field = inks.pink;
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
    haze = { color: field, density: 0, start: 0 };
    floor = { height: -1, strength: floorStrengthAt(view.elevation) };
    aoScale = 0.045;
  }

  const shadowTint = field === inks.blue ? hex(0x6d6aa8) : ([0.62, 0.45, 0.66] as const);
  return {
    backdropTexts: texts.backdrop,
    cursor: inScale || inEnd ? { pressed: 0, visible: 0, x: 0, y: 0 } : cursor,
    field,
    frameIndex,
    grain: 0.024,
    overlayTexts: texts.overlay,
    sampleGrid,
    scene: {
      camera,
      fan,
      floor,
      haze,
      light: keyLight(camera, aoScale),
      mode,
      sponge,
      tesseract,
      tones: landingTones,
    },
    shadowTint,
  };
}
