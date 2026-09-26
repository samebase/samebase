import {
  beat,
  drift,
  easeInCubic,
  easeInOutCubic,
  easeInOutSine,
  easeOutBack,
  easeOutCubic,
  hash,
  keyed,
  mix,
  printsPerSecond,
  progress,
  pulse,
  ring,
} from "./filmMotion";

export type Vector3 = readonly [number, number, number];
/** Ink coverage of the pink, blue, and slate plates, each from 0 to 1. */
export type Inks = readonly [number, number, number];

/** One face of the paper cube: its center, in-plane axes, outward normal, and ink strength. */
export type FilmFace = { n: Vector3; origin: Vector3; tint: number; u: Vector3; v: Vector3 };

export type FilmCamera = {
  back: Vector3;
  /** Page pixel where the target point appears. */
  center: readonly [number, number];
  /** World units from the target to the frame edge 540 page pixels away, on the target plane. */
  halfHeight: number;
  right: Vector3;
  /** 0 is orthographic. */
  tanHalfFieldOfView: number;
  target: Vector3;
  up: Vector3;
};

/** Five warp sides in counterclockwise order from the top: top, left, lower left, lower right, right. */
export type SideWidths = readonly [number, number, number, number, number];
export type SideInks = readonly [Inks, Inks, Inks, Inks, Inks];

export type FilmScene = {
  camera: FilmCamera;
  faces: readonly [FilmFace, FilmFace, FilmFace, FilmFace, FilmFace, FilmFace];
  /** 0 flat inks, 1 shaded by the light. */
  lit: number;
  light: Vector3;
  mode: "net" | "none" | "sponge";
  /** Distance from the target plane back to the paper page, which receives the shadow. */
  pageDepth: number;
  shadow: number;
  sponge: {
    center: Vector3;
    halfSize: number;
    hazeDistance: number;
    hazeStart: number;
    levels: number;
    /** Hollow paper cells with a hole in each wall. Otherwise the cells are one more solid level. */
    paperCells: boolean;
    /** Plate by plate, the sponge prints in within these distances from the paper cube. */
    printRadius: Vector3;
    probe: Vector3;
    probeStart: Vector3;
    /** Levels at and below this depth stay closed away from the probe. */
    restDepth: number;
    revealRadius: number;
  };
  tones: {
    inner: Inks;
    reveal: Inks;
    shade: Inks;
    shadow: Inks;
    x: Inks;
    y: Inks;
    z: Inks;
  };
  warp: {
    enabled: boolean;
    sideInks: SideInks;
    sides: SideWidths;
    /** Rotation of the flat shape in the page plane, in radians. */
    spin: number;
  };
};

export type PlateRegistration = { dx: number; dy: number; rotation: number };

export type FilmFrame = {
  kind: "film" | "loop";
  /** Page box (left, top, right, bottom) where a paper sticker hides the scene ink. */
  knockout: readonly [number, number, number, number];
  /** The camera over the paper page. */
  page: { panX: number; panY: number; rotation: number; scale: number };
  /** 0 to pi: the right half page turns over the center fold. */
  pageTurn: number;
  printIndex: number;
  registration: readonly [PlateRegistration, PlateRegistration, PlateRegistration];
  scene: FilmScene;
  time: number;
};

export const times = {
  markLand: 0.5,
  netDraw: 6,
  lift: 8,
  folds: [8.5, 9, 9.5, 10, 10.5] as const,
  iso: 15,
  drop: 16,
  fourSides: 16.5,
  fiveSides: 18,
  close: 26,
  silence: 28.5,
  hit: 32,
  turnStart: 37.4,
  turnEnd: 38.3,
  lastPrint: 40.5,
} as const;

// ---------- vectors ----------

function add(a: Vector3, b: Vector3): Vector3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function scale(a: Vector3, amount: number): Vector3 {
  return [a[0] * amount, a[1] * amount, a[2] * amount];
}

function dot(a: Vector3, b: Vector3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vector3, b: Vector3): Vector3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function normalize(a: Vector3): Vector3 {
  return scale(a, 1 / Math.hypot(...a));
}

function mixVector(a: Vector3, b: Vector3, amount: number): Vector3 {
  return [mix(a[0], b[0], amount), mix(a[1], b[1], amount), mix(a[2], b[2], amount)];
}

function mixInks(a: Inks, b: Inks, amount: number): Inks {
  return [mix(a[0], b[0], amount), mix(a[1], b[1], amount), mix(a[2], b[2], amount)];
}

/** Rodrigues rotation of `vector` around the unit `axis`. */
function rotate(vector: Vector3, axis: Vector3, angle: number): Vector3 {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return add(
    add(scale(vector, cos), scale(cross(axis, vector), sin)),
    scale(axis, dot(axis, vector) * (1 - cos)),
  );
}

const degrees = Math.PI / 180;
const isometricYaw = -45 * degrees;
const isometricElevation = Math.atan(1 / Math.SQRT2);

function orbitCamera(
  yaw: number,
  elevation: number,
  roll: number,
  rest: Omit<FilmCamera, "back" | "right" | "up">,
): FilmCamera {
  const back: Vector3 = [
    Math.sin(yaw) * Math.cos(elevation),
    Math.sin(elevation),
    Math.cos(yaw) * Math.cos(elevation),
  ];
  const flatRight = normalize(cross([0, 1, 0], back));
  const right = rotate(flatRight, back, roll);
  return { ...rest, back, right, up: cross(back, right) };
}

/** Page pixel of a world point, with the same projection as the scene rays. */
export function projectToPage(camera: FilmCamera, point: Vector3): readonly [number, number] {
  const offset = add(point, scale(camera.target, -1));
  const depthScale = camera.halfHeight - camera.tanHalfFieldOfView * dot(offset, camera.back);
  return [
    camera.center[0] + (540 * dot(offset, camera.right)) / depthScale,
    camera.center[1] - (540 * dot(offset, camera.up)) / depthScale,
  ];
}

// ---------- the paper cube net ----------

type Pose = { n: Vector3; origin: Vector3; u: Vector3; v: Vector3 };

const frontPose: Pose = { n: [0, 0, 1], origin: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] };

/** Local point or direction of `pose` in world space. */
function fromLocal(pose: Pose, local: Vector3, isPoint: boolean): Vector3 {
  const direction = add(
    add(scale(pose.u, local[0]), scale(pose.v, local[1])),
    scale(pose.n, local[2]),
  );
  return isPoint ? add(pose.origin, direction) : direction;
}

/**
A flap hinged on one edge of its parent. `hinge` is the edge center in parent units, `axis` the edge
direction, and `offset` the flap center when the net lies flat. The sign of `angle` folds the flap
behind the parent, away from the printed side.
*/
function foldFlap(
  parent: Pose,
  hinge: Vector3,
  axis: Vector3,
  offset: Vector3,
  angle: number,
): Pose {
  const turn = (local: Vector3) => rotate(local, axis, angle);
  const originLocal = add(hinge, turn(add(offset, scale(hinge, -1))));
  return {
    n: fromLocal(parent, turn([0, 0, 1]), false),
    origin: fromLocal(parent, originLocal, true),
    u: fromLocal(parent, turn([1, 0, 0]), false),
    v: fromLocal(parent, turn([0, 1, 0]), false),
  };
}

const flapOrder = ["left", "right", "top", "back", "bottom"] as const;

/** Fold angle of one flap: a small lift against the fold, then a fold with overshoot. */
function foldAngle(time: number, start: number): number {
  const anticipation = -0.12 * Math.sin(Math.PI * progress(time, start - 0.18, start));
  return anticipation + (Math.PI / 2) * easeOutBack(progress(time, start, start + 0.42), 1.2);
}

/**
The 1-4-1 net: top above left, and bottom below back. It is not the cross net. Folded, front is +z,
left is -x, right is +x, back is -z, top is +y, and bottom is -y.
*/
function readFaces(time: number): FilmScene["faces"] {
  const [leftStart, rightStart, topStart, backStart, bottomStart] = times.folds;
  const left = foldFlap(frontPose, [-1, 0, 0], [0, 1, 0], [-2, 0, 0], -foldAngle(time, leftStart));
  const right = foldFlap(frontPose, [1, 0, 0], [0, 1, 0], [2, 0, 0], foldAngle(time, rightStart));
  const top = foldFlap(left, [0, 1, 0], [1, 0, 0], [0, 2, 0], -foldAngle(time, topStart));
  const back = foldFlap(right, [1, 0, 0], [0, 1, 0], [2, 0, 0], foldAngle(time, backStart));
  const bottom = foldFlap(back, [0, -1, 0], [1, 0, 0], [0, -2, 0], foldAngle(time, bottomStart));
  const poses = { back, bottom, left, right, top };
  const flapTint = (name: (typeof flapOrder)[number], index: number) => {
    const printedAt = times.netDraw + 0.5 + 0.25 * index;
    const printed = 0.38 * easeOutCubic(progress(time, printedAt, printedAt + 0.2));
    const foldStart = times.folds[index] ?? times.lift;
    return { ...poses[name], tint: mix(printed, 1, progress(time, foldStart, foldStart + 0.4)) };
  };
  return [
    { ...frontPose, tint: 1 },
    flapTint("left", 0),
    flapTint("right", 1),
    flapTint("top", 2),
    flapTint("back", 3),
    flapTint("bottom", 4),
  ];
}

// ---------- inks ----------

const none: Inks = [0, 0, 0];
const litTones = {
  x: [0, 0.62, 0.05],
  y: [0.5, 0, 0],
  z: [0, 0, 0.92],
} as const satisfies Record<string, Inks>;
const flatTones = {
  x: [0, 0.95, 0],
  y: [0.9, 0, 0],
  z: [0, 0, 1],
} as const satisfies Record<string, Inks>;
const innerTone: Inks = [0.15, 0.55, 0.85];
const spongeTones = {
  x: [0, 0.5, 0.1],
  y: [0.32, 0.06, 0],
  z: [0, 0.95, 0.25],
} as const satisfies Record<string, Inks>;

// ---------- the warp ----------

const cubeSides: SideWidths = [120, 120, 0, 0, 120];
const anticipationSides: SideWidths = [112, 128, 0, 0, 120];
const fourSides: SideWidths = [118, 112, 0, 52, 78];
const fiveSides: SideWidths = [100, 90, 44, 60, 66];
const fiveSidesWide: SideWidths = [86, 104, 58, 40, 72];
const fiveSidesLean: SideWidths = [108, 76, 50, 70, 56];

function mixSides(from: SideWidths, to: SideWidths, amount: number): SideWidths {
  return [
    mix(from[0], to[0], amount),
    mix(from[1], to[1], amount),
    mix(from[2], to[2], amount),
    mix(from[3], to[3], amount),
    mix(from[4], to[4], amount),
  ];
}

function readSides(time: number): SideWidths {
  const back = (value: number) => easeOutBack(value, 1.6);
  return keyed(
    time,
    [
      { duration: 0, ease: back, time: 0, value: cubeSides },
      {
        duration: 0.18,
        ease: easeInOutSine,
        time: times.fourSides - 0.18,
        value: anticipationSides,
      },
      { duration: 0.45, ease: back, time: times.fourSides, value: fourSides },
      { duration: 0.45, ease: back, time: times.fiveSides, value: fiveSides },
      { duration: 0.4, ease: back, time: 20, value: fiveSidesWide },
      { duration: 0.4, ease: back, time: 21, value: fiveSides },
      { duration: 0.4, ease: back, time: 22, value: fiveSidesLean },
      { duration: 0.4, ease: back, time: 23, value: fiveSidesWide },
      { duration: 0.4, ease: back, time: 24, value: fourSides },
      { duration: 0.4, ease: back, time: 25, value: fiveSides },
      { duration: 0.8, ease: easeInOutCubic, time: times.close, value: cubeSides },
    ],
    mixSides,
  );
}

const sideInksA: SideInks = [
  flatTones.y,
  flatTones.x,
  [0.85, 0.75, 0],
  [0, 0.45, 0.7],
  flatTones.z,
];
const sideInksB: SideInks = [
  flatTones.x,
  [0.85, 0.75, 0],
  flatTones.z,
  flatTones.y,
  [0, 0.45, 0.7],
];
const sideInksC: SideInks = [
  [0, 0.45, 0.7],
  flatTones.z,
  flatTones.y,
  flatTones.x,
  [0.85, 0.75, 0],
];

function mixSideInks(from: SideInks, to: SideInks, amount: number): SideInks {
  return [
    mixInks(from[0], to[0], amount),
    mixInks(from[1], to[1], amount),
    mixInks(from[2], to[2], amount),
    mixInks(from[3], to[3], amount),
    mixInks(from[4], to[4], amount),
  ];
}

function readSideInks(time: number): SideInks {
  const snap = (value: number) => (value > 0 ? 1 : 0);
  return keyed(
    time,
    [
      { duration: 0, ease: snap, time: 0, value: sideInksA },
      { duration: 0.01, ease: snap, time: 23.5, value: sideInksB },
      { duration: 0.01, ease: snap, time: 24.5, value: sideInksC },
      { duration: 0.01, ease: snap, time: 25.5, value: sideInksA },
    ],
    mixSideInks,
  );
}

function readSpin(time: number): number {
  const turn = 40 * degrees;
  const move = (start: number) => easeOutBack(progress(time, start, start + 0.55), 1.4);
  return turn * (move(20) + move(22) - 2 * easeInOutCubic(progress(time, 24.5, 26)));
}

// ---------- cameras ----------

/** Iso framing: the cube hexagon radius is about 300 page pixels. */
const isoHalfHeight = 2.9;
const isoCenter: readonly [number, number] = [1130, 540];
const netCenter: readonly [number, number] = [810, 540];

function readNetCamera(time: number): FilmCamera {
  const orbit =
    0.7 * easeInOutCubic(progress(time, 7.7, 9)) + 0.3 * easeInOutSine(progress(time, 9, 11.4));
  const toIso = easeInOutCubic(progress(time, 11.6, times.iso));
  const yaw = mix(mix(0, -30 * degrees, orbit), isometricYaw, toIso);
  const elevation = mix(mix(0, 20 * degrees, orbit), isometricElevation, toIso);
  const roll = mix(-5 * degrees * orbit, 0, toIso);
  const perspective = easeInOutCubic(progress(time, 7.7, 9)) * (1 - toIso);
  const lift = easeInOutCubic(progress(time, 8.3, 10.8));
  const center: readonly [number, number] = [
    mix(mix(netCenter[0], 1060, lift), isoCenter[0], toIso),
    mix(mix(netCenter[1], 560, lift), isoCenter[1], toIso),
  ];
  return orbitCamera(yaw, elevation, roll, {
    center,
    halfHeight: mix(mix(3.6, 3.3, lift), isoHalfHeight, toIso),
    tanHalfFieldOfView: 0.36 * perspective,
    target: [0, 0, mix(1, 0, lift)],
  });
}

/** The giant: 5 levels above the paper cube, which is its corner cell nearest the camera. */
const spongeLevels = 5;
const spongeHalfSize = 3 ** spongeLevels;
const spongeCenter: Vector3 = scale([1, -1, -1], spongeHalfSize - 1);

function readSpongeCamera(time: number): FilmCamera {
  // Near silence: pull back 27 times in the isometric view.
  const pull = easeInOutCubic(progress(time, 28.9, times.hit));
  const halfHeight = isoHalfHeight * 27 ** pull;
  // The hit: a dolly zoom from the isometric view into deep perspective, then a slow drift.
  const dolly = easeOutCubic(progress(time, times.hit, times.hit + 1.7));
  const settle = easeInOutSine(progress(time, times.hit + 0.6, 38.4));
  const yaw = mix(isometricYaw, -30 * degrees, dolly) + 6 * degrees * settle;
  const elevation = mix(isometricElevation, 11 * degrees, dolly) - 3 * degrees * settle;
  // The giant's corner nearest the camera, where the paper cube sits.
  const target: Vector3 = mixVector([0, 0, 0], [-1, 1, 1], dolly);
  const center: readonly [number, number] = [
    mix(mix(isoCenter[0], 960, pull), 1060, dolly),
    mix(isoCenter[1], 400, dolly),
  ];
  return orbitCamera(yaw, elevation, 0, {
    center,
    halfHeight: mix(halfHeight, 78, dolly) * (1 - 0.12 * settle),
    tanHalfFieldOfView: mix(0.001, 0.62, dolly),
    target,
  });
}

const probeStart: Vector3 = [0, 0, 0];
const probeEnd: Vector3 = [48, -26, 2.4];

/**
The probe that wakes the giant: first the paper cube itself, then a straight path down and across
the front face, which faces the camera.
Deeper levels open along the whole path so far, so the giant stays awake where the probe passed.
*/
export function readProbe(time: number): Vector3 {
  const travel = easeInOutSine(progress(time, times.hit + 0.4, 38.4));
  return mixVector(probeStart, probeEnd, travel);
}

// ---------- scene ----------

function readScene(time: number): FilmScene {
  const faces = readFaces(time);
  const light = (camera: FilmCamera) =>
    normalize(
      add(add(scale(camera.right, -0.45), scale(camera.up, 0.7)), scale(camera.back, 0.95)),
    );
  const baseScene = {
    faces,
    pageDepth: 0.02,
    shadow: 0,
    sponge: {
      center: spongeCenter,
      halfSize: spongeHalfSize,
      hazeDistance: 400,
      hazeStart: 0,
      levels: spongeLevels,
      paperCells: true,
      printRadius: [1000, 1000, 1000],
      probe: probeStart,
      probeStart,
      restDepth: spongeLevels + 1,
      revealRadius: 1,
    },
    warp: {
      enabled: false,
      sideInks: sideInksA,
      sides: cubeSides,
      spin: 0,
    },
  } satisfies Partial<FilmScene>;

  if (time < times.netDraw) {
    const camera = readNetCamera(time);
    return {
      ...baseScene,
      camera,
      light: light(camera),
      lit: 0,
      mode: "none",
      tones: { inner: innerTone, reveal: none, shade: none, shadow: none, ...flatTones },
    };
  }

  if (time < times.silence) {
    const camera = readNetCamera(time);
    const litIn = easeInOutCubic(progress(time, times.lift, 9.2));
    const flatSnap = progress(time, times.drop, times.drop + 0.12);
    const lit = litIn * (1 - flatSnap);
    const tones = {
      x: mixInks(litTones.x, flatTones.x, flatSnap),
      y: mixInks(litTones.y, flatTones.y, flatSnap),
      z: mixInks(litTones.z, flatTones.z, flatSnap),
    };
    return {
      ...baseScene,
      camera,
      light: light(camera),
      lit,
      mode: "net",
      pageDepth: mix(0.02, 1.8, easeOutCubic(progress(time, times.lift, 9.4))),
      shadow: lit,
      tones: {
        inner: innerTone,
        reveal: none,
        shade: [0, 0.2, 0.62],
        shadow: [0, 0.1, 0.3],
        ...tones,
      },
      warp: {
        enabled: time >= times.fourSides - 0.2 && time < times.close + 0.9,
        sideInks: readSideInks(time),
        sides: readSides(time),
        spin: readSpin(time),
      },
    };
  }

  const camera = readSpongeCamera(time);
  if (time >= times.turnEnd) {
    // The end page has no scene.
    return {
      ...baseScene,
      camera,
      light: light(camera),
      lit: 0,
      mode: "none",
      tones: { inner: innerTone, reveal: none, shade: none, shadow: none, ...flatTones },
    };
  }
  const printIn = (delay: number) =>
    1.2 + 900 * easeInCubic(progress(time, times.silence + 0.4 + delay, times.hit - 0.2 + delay));
  const hazeIn = easeOutCubic(progress(time, times.hit, times.hit + 1.2));
  return {
    ...baseScene,
    camera,
    light: light(camera),
    lit: 0,
    mode: "sponge",
    sponge: {
      ...baseScene.sponge,
      hazeDistance: mix(4000, 520, hazeIn),
      hazeStart: mix(0, 50, hazeIn),
      printRadius: [printIn(0.5), printIn(0.25), printIn(0)],
      probe: readProbe(time),
      restDepth: 3,
      revealRadius: mix(44, 30, progress(time, times.hit, times.hit + 1)),
    },
    tones: {
      inner: [0.2, 0.35, 0.8],
      reveal: [0.9, 0, 0],
      shade: [0, 0.15, 0.55],
      shadow: none,
      x: mixInks(flatTones.x, spongeTones.x, hazeIn),
      y: mixInks(flatTones.y, spongeTones.y, hazeIn),
      z: mixInks(flatTones.z, spongeTones.z, hazeIn),
    },
  };
}

// ---------- page camera and registration ----------

const kicks = [
  times.markLand,
  4,
  5,
  times.lift,
  12,
  13,
  14,
  times.drop,
  times.fourSides,
  times.fiveSides,
  20,
  22,
  24,
  times.close,
  times.hit,
  38.5,
  39,
  39.5,
  40,
  times.lastPrint,
] as const;

function readPageCamera(time: number): FilmFrame["page"] {
  let kick = 0;
  for (const hit of kicks) {
    kick += ring(time, hit, 2.2, 6);
  }
  const back = (value: number) => easeOutBack(value, 1.4);
  // Camera words: push in on the mark, punch out when SAME lands, slow pushes, punch on the drop.
  const zoom = keyed(
    time,
    [
      { duration: 0, ease: easeInOutSine, time: 0, value: 1 },
      { duration: 3.9, ease: easeInOutSine, time: 0.1, value: 1.13 },
      { duration: 0.45, ease: back, time: 4, value: 1.005 },
      { duration: 3.8, ease: easeInOutSine, time: 4.2, value: 1.04 },
      { duration: 3.5, ease: easeInOutSine, time: times.lift, value: 1.02 },
      { duration: 3.9, ease: easeInOutSine, time: 12, value: 1.07 },
      { duration: 0.4, ease: back, time: times.drop, value: 1.02 },
      { duration: 12, ease: easeInOutSine, time: 16.4, value: 1.06 },
      { duration: 3, ease: easeInOutSine, time: times.silence, value: 1.01 },
      { duration: 0.5, ease: back, time: times.hit, value: 1.03 },
      { duration: 5, ease: easeInOutSine, time: 32.6, value: 1.06 },
      { duration: 0.5, ease: easeInOutSine, time: times.turnStart, value: 1.005 },
      { duration: 3.5, ease: easeInOutSine, time: 38.4, value: 1.04 },
    ],
    mix,
  );
  const focusOnMark = easeInOutSine(progress(time, 0.1, 4)) * (1 - back(progress(time, 4, 4.45)));
  const scale = zoom + 0.012 * kick + 0.005 * readBeatPump(time);
  const halfWidth = 960 / scale;
  const halfHeight = 540 / scale;
  const focusX = Math.min(
    Math.max(mix(960, 810, focusOnMark) + 5 * drift(time, 1), halfWidth),
    1920 - halfWidth,
  );
  const focusY = Math.min(Math.max(540 + 4 * drift(time, 2), halfHeight), 1080 - halfHeight);
  return {
    panX: focusX - 960 + 3 * kick,
    panY: focusY - 540,
    rotation: (0.16 * drift(time, 3) + 0.35 * kick) * degrees,
    scale,
  };
}

/** A small pulse on every beat of the moulding, the drop, and the finale, so the print pumps. */
function readBeatPump(time: number): number {
  const pumping =
    (time >= 1 && time < 4) ||
    (time >= times.drop && time < times.silence) ||
    (time >= times.hit && time < 38);
  return pumping ? pulse(time, Math.floor(time / beat) * beat, 12) : 0;
}

/** Constant plate offsets, like a real riso print, in page pixels. */
const baseRegistration = [
  { dx: 3.2, dy: -2.2, rotation: 0.1 * degrees },
  { dx: -2.4, dy: 1.8, rotation: -0.06 * degrees },
  { dx: 0, dy: 0, rotation: 0 },
] as const;

/** Where each plate flies in from on the first beat. */
const flyIn = [
  { dx: -520, dy: -260, rotation: -9 * degrees },
  { dx: 560, dy: 300, rotation: 7 * degrees },
  { dx: 30, dy: -420, rotation: 3 * degrees },
] as const;

function readRegistration(time: number, printIndex: number): FilmFrame["registration"] {
  let shock = 0.4 * readBeatPump(time);
  for (const hit of kicks) {
    shock += pulse(time, hit, 9);
  }
  const landing = 1 - easeOutBack(progress(time, 0, times.markLand), 1.3);
  const lastPrint = readLastPrintSpread(time);
  const plate = (index: 0 | 1 | 2): PlateRegistration => {
    const base = baseRegistration[index];
    const fly = flyIn[index];
    const jitter = 1.1 + 7 * shock;
    const jitterX = (hash(printIndex, index, 1) - 0.5) * 2 * jitter;
    const jitterY = (hash(printIndex, index, 2) - 0.5) * 2 * jitter;
    const flyAmount = landing + 0.18 * lastPrint;
    return {
      dx: base.dx + jitterX + fly.dx * flyAmount,
      dy: base.dy + jitterY + fly.dy * flyAmount,
      rotation:
        base.rotation +
        (hash(printIndex, index, 3) - 0.5) * 0.08 * degrees * (1 + 4 * shock) +
        fly.rotation * flyAmount,
    };
  };
  return [plate(0), plate(1), plate(2)];
}

/** The plates drift apart in the half beat before the last print, then snap into register on it. */
function readLastPrintSpread(time: number): number {
  const apart = easeInCubic(progress(time, times.lastPrint - 0.5, times.lastPrint));
  return apart * (1 - easeOutBack(progress(time, times.lastPrint, times.lastPrint + 0.3), 1.2));
}

export function readFilmFrame(timeInSeconds: number): FilmFrame {
  const time = timeInSeconds;
  const printIndex = Math.floor(time * printsPerSecond);
  const turn = easeInOutCubic(progress(time, times.turnStart, times.turnEnd));
  return {
    kind: "film",
    knockout: [-1, -1, -1, -1],
    page: readPageCamera(time),
    pageTurn: turn < 1 ? Math.PI * turn : 0,
    printIndex,
    registration: readRegistration(time, printIndex),
    scene: readScene(time),
    time,
  };
}

export const loopDurationInSeconds = 8;
/** The loop plays the music of the finale: four bars from the hit. */
export const loopMusicStart = times.hit;
/** The paper sticker that carries the words of the loop, in page pixels. */
export const loopSticker = [92, 150, 930, 800] as const;

/**
The social loop: an endless isometric pull back from the giant's corner. The sponge is self-similar
about its corner, so a 9 times zoom over the loop ends on the same picture it starts with. Solid cells
keep the self-similarity exact.
*/
export function readLoopFrame(timeInSeconds: number): FilmFrame {
  const time = timeInSeconds;
  const printIndex = Math.floor(time * printsPerSecond);
  const cycle = (2 * Math.PI * time) / loopDurationInSeconds;
  const base = readScene(times.hit - 0.01);
  // Seven levels keep every loop frame filled with the corner and its detail down to 2 pixels.
  const levels = 7;
  const halfSize = 3 ** levels;
  const camera = orbitCamera(isometricYaw, isometricElevation, 0, {
    center: [1210, 560],
    halfHeight: isoHalfHeight * 27 * 9 ** (time / loopDurationInSeconds),
    tanHalfFieldOfView: 0,
    target: [0, 0, 0],
  });
  let kick = 0;
  for (let hit = 0; hit < loopDurationInSeconds; hit += 2) {
    kick += ring(time, hit, 2.2, 6);
  }
  return {
    kind: "loop",
    knockout: loopSticker,
    page: {
      panX: 4 * Math.sin(cycle) + 3 * kick,
      panY: 3 * Math.sin(2 * cycle),
      rotation: (0.15 * Math.sin(cycle + 1) + 0.3 * kick) * degrees,
      scale: 1.02 + 0.01 * kick,
    },
    pageTurn: 0,
    printIndex,
    registration: readRegistration(time + 100, printIndex),
    scene: {
      ...base,
      camera,
      light: base.light,
      sponge: {
        ...base.sponge,
        center: scale([1, -1, -1], halfSize - 1),
        halfSize,
        // Haze grows with depth, which is not self-similar, so the loop has none.
        hazeDistance: 1e9,
        levels,
        paperCells: false,
        printRadius: [1e6, 1e6, 1e6],
        restDepth: levels + 1,
      },
    },
    time,
  };
}
