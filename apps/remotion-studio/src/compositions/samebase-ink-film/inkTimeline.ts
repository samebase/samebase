/**
The ink film timeline: every function here is a pure function of the film time in seconds. The music
is 120 BPM, so beats fall on multiples of 0.5 s and bars start on even seconds (see
`notes/samebase-ink-film.md`).
*/
import { PALETTE } from "./inkBrush";
import {
  clamp,
  easeIn,
  easeInOut,
  easeOut,
  easeOutBack,
  lerp,
  mix,
  pulse,
  ramp,
  spring,
  type Point,
} from "./inkMath";

export const FILM_FPS = 24;
export const FILM_DURATION = 38.5;
export const FILM_FRAMES = Math.round(FILM_FPS * FILM_DURATION);
/** Lines and character washes are re-seeded 12 times per second. */
export const boilIndex = (time: number) => Math.floor(time * 12 + 1e-6);

export const TIMES = {
  paint: 0,
  alive: 4,
  cube: 8,
  hold: 12,
  peel: 15.5,
  fourSides: 16,
  fiveSides: 17,
  fold: 18,
  legs: 19,
  walk: 19.5,
  crest: 22,
  giant: 24,
  words: 26,
  stroll: 28,
  awaken: 31.2,
  wipe: 32.7,
  end: 33.5,
  finalHit: 36,
} as const;

/** The landscape is laid out in the coordinates of the approved style frame B (1920 x 1080). */
export const SCREEN_CENTER: Point = [960, 540];
export const MARK_SIZE = 50;
export const LEG_LENGTH = 0.52 * MARK_SIZE;
export const RIDGE: readonly Point[] = [
  [-400, 930],
  [-40, 902],
  [100, 884],
  [220, 873],
  [300, 874],
  [400, 882],
  [520, 896],
  [640, 914],
  [780, 942],
  [920, 980],
  [1060, 1030],
  [1200, 1100],
];

export function ridgeY(x: number): number {
  for (let index = 1; index < RIDGE.length; index += 1) {
    const a = RIDGE[index - 1];
    const b = RIDGE[index];
    if (a && b && x <= b[0]) {
      const t = clamp((x - a[0]) / (b[0] - a[0]));
      return lerp(a[1], b[1], (1 - Math.cos(Math.PI * t)) / 2);
    }
  }
  return 1100;
}

/** The mark sits on the ridge here before it has legs. */
export const MARK_HOME: Point = [150, ridgeY(150) - MARK_SIZE / 2];

export type Camera = { angle: number; center: Point; zoom: number };

export function project(camera: Camera, point: Point): Point {
  const dx = (point[0] - camera.center[0]) * camera.zoom;
  const dy = (point[1] - camera.center[1]) * camera.zoom;
  const cos = Math.cos(camera.angle);
  const sin = Math.sin(camera.angle);
  return [SCREEN_CENTER[0] + dx * cos - dy * sin, SCREEN_CENTER[1] + dx * sin + dy * cos];
}

/** A far layer moves and zooms less than the main camera: depth 1 is the ridge, 0 is fixed. */
export function layerCamera(camera: Camera, depth: number): Camera {
  return {
    angle: camera.angle * depth,
    center: mix(SCREEN_CENTER, camera.center, depth),
    zoom: camera.zoom ** depth,
  };
}

const STAGE_ZOOM = 5.4;
const LANDSCAPE_ZOOM = 1.24;

/** Where the camera looks: the paper stage around the mark, then the landscape. */
export function readCamera(time: number): Camera {
  const stageCenter: Point = [MARK_HOME[0], MARK_HOME[1] - 2];
  if (time < TIMES.walk) {
    let zoom = lerp(5.5, 6.25, easeInOut(ramp(time, 0, 4)));
    zoom += 0.25 * easeInOut(ramp(time, 4, 4));
    zoom -= 1.35 * easeInOut(ramp(time, 8, 1.5));
    zoom += 0.55 * easeIn(ramp(time, 12, 3.45));
    zoom -= 0.5 * spring(time, TIMES.peel, 1.4, 4);
    zoom += 0.18 * ramp(time, 16, 3.5);
    const shake =
      0.012 * pulse(time, TIMES.peel, 7, 7) + 0.004 * (pulse(time, 4, 5, 9) + pulse(time, 6, 5, 9));
    return {
      angle: lerp(-0.025, 0, easeInOut(ramp(time, 0, 5))) + shake,
      center: [stageCenter[0], stageCenter[1] + 3 * pulse(time, TIMES.peel, 4, 5)],
      zoom,
    };
  }
  if (time < TIMES.giant) {
    // The zoom out: the frame widens around the walking mark, then settles on the landscape.
    const out = easeInOut(ramp(time, TIMES.walk, 3));
    const zoom = Math.exp(lerp(Math.log(STAGE_ZOOM - 0.03), Math.log(LANDSCAPE_ZOOM), out));
    const widen = clamp((1 / zoom - 1 / STAGE_ZOOM) / (1 / LANDSCAPE_ZOOM - 1 / STAGE_ZOOM));
    const mark = readMarkWalkPosition(time);
    const lookUp = easeInOut(ramp(time, 22.2, 1.8));
    const target: Point = [620, lerp(700, 640, lookUp)];
    return {
      angle: 0,
      center: mix([mark[0], mark[1] - 2], target, widen),
      zoom: zoom - 0.03 * lookUp,
    };
  }
  // Pull back to see the giant, then drift after the walking mark, then tilt up into the clouds.
  const pull = easeInOut(ramp(time, TIMES.giant, 3.2));
  const follow = easeInOut(ramp(time, 26.4, 6.2));
  const rise = easeIn(ramp(time, TIMES.wipe - 0.3, 1.3));
  const zoom = lerp(LANDSCAPE_ZOOM - 0.03, 1, pull) + 0.12 * follow;
  const center: Point = [
    lerp(620, 960, pull) + 50 * follow,
    lerp(640, 540, pull) + 85 * follow - 260 * rise,
  ];
  return { angle: 0, center, zoom };
}

/** The end card camera: a slow push in. */
export function readEndCamera(time: number): Camera {
  return {
    angle: 0,
    center: [SCREEN_CENTER[0] + 40, SCREEN_CENTER[1] + 20],
    zoom: 1.1 + 0.055 * easeOut(ramp(time, TIMES.end, 5)),
  };
}

export type MarkPose = {
  angle: number;
  center: Point;
  color: string;
  /** Wash bloom radius in [0, 1] while the first wash spreads. */
  bloom: number;
  /** Height of the opening: 1 open, 0 shut in a blink. */
  blink: number;
  hole: number;
  /** Leg extension in [0, 1]. */
  legs: number;
  outline: number;
  holeOutline: number;
  previousColor: string;
  recolor: number;
  size: number;
  squash: Point;
  /** Walk phase: whole steps plus the fraction of the current step, or null when standing. */
  step: number | null;
};

type Keyframe = readonly [time: number, value: number];

/** A quick blink at each start time: the opening shuts and opens in 0.18 s. */
export function readBlink(time: number, starts: readonly number[]): number {
  const shut = Math.max(0, ...starts.map((start) => 1 - Math.abs((time - start) / 0.09 - 1)));
  return 1 - 0.9 * clamp(shut);
}

/** Springs from each keyframe value to the next, so every change overshoots and settles. */
function springTrack(
  time: number,
  keys: readonly Keyframe[],
  frequency = 2.6,
  damping = 6,
): number {
  let value = keys[0]?.[1] ?? 0;
  keys.forEach(([start, target], index) => {
    const previous = keys[index - 1];
    if (previous) {
      value += (target - previous[1]) * spring(time, start, frequency, damping);
    }
  });
  return value;
}

const WALK_STEPS = 5;
const STROLL_STEPS = 8;
const STROLL_END_X = 860;

/** The mark walks from home to the crest, and later along the ridge toward the giant. */
function readMarkWalk(time: number): { step: number | null; x: number } {
  if (time < TIMES.walk + 0.12) {
    return { step: null, x: MARK_HOME[0] };
  }
  if (time < TIMES.crest) {
    const phase =
      clamp((time - TIMES.walk - 0.12) / (TIMES.crest - TIMES.walk - 0.12)) * WALK_STEPS;
    const whole = Math.min(WALK_STEPS - 1, Math.floor(phase));
    const progress = (whole + easeInOut(phase - whole)) / WALK_STEPS;
    return { step: phase >= WALK_STEPS ? null : phase, x: lerp(MARK_HOME[0], 292, progress) };
  }
  if (time < TIMES.stroll || time > TIMES.stroll + 4) {
    return { step: null, x: time < TIMES.stroll ? 292 : STROLL_END_X };
  }
  const phase = ((time - TIMES.stroll) / 4) * STROLL_STEPS;
  const whole = Math.min(STROLL_STEPS - 1, Math.floor(phase));
  const progress = (whole + easeInOut(phase - whole)) / STROLL_STEPS;
  return { step: phase, x: lerp(292, STROLL_END_X, progress) };
}

export function readMarkWalkPosition(time: number): Point {
  const { x } = readMarkWalk(time);
  return [x, ridgeY(x) - MARK_SIZE / 2 - LEG_LENGTH];
}

const COLOR_KEYS: readonly [number, string][] = [
  [0, PALETTE.slateMid],
  [4.5, PALETTE.teal],
  [7, PALETTE.ochre],
];

/** The mark as a character, or null while it is a cube or a flat many-sided picture. */
export function readMarkPose(time: number): MarkPose | null {
  if (time >= TIMES.cube + 0.05 && time < TIMES.fold + 0.62) {
    return null;
  }
  if (time >= TIMES.end) {
    return null;
  }
  let color: string = PALETTE.clay;
  let previousColor: string = PALETTE.clay;
  let recolor = 1;
  if (time < TIMES.cube + 0.05) {
    COLOR_KEYS.forEach(([start, key], index) => {
      if (time >= start) {
        previousColor = COLOR_KEYS[index - 1]?.[1] ?? key;
        color = key;
        recolor = index === 0 ? 1 : easeOut(ramp(time, start, 0.35));
      }
    });
  }
  const sx = springTrack(time, [
    [0, 1],
    [5, 1.38],
    [5.5, 0.8],
    [6, 1],
    [7.5, 1.22],
    [7.92, 0.86],
    [8.3, 1],
  ]);
  const sy = springTrack(time, [
    [0, 1],
    [5, 0.78],
    [5.5, 1.32],
    [6, 1],
    [7.5, 0.72],
    [7.92, 1.2],
    [8.3, 1],
  ]);
  const hop = pulse(time, 4, 2.2, 5) + 0.6 * pulse(time, 3.5, 6, 8);
  // The opening is the mark's only feature: it gasps and it blinks.
  const hole = springTrack(time, [
    [0, 1 / 3],
    [6, 0.56],
    [6.5, 1 / 3],
    [24.05, 0.5],
    [24.9, 1 / 3],
  ]);
  const walk = readMarkWalk(time);
  const legs = time < TIMES.legs ? 0 : spring(time, TIMES.legs, 2.4, 5);
  const landed = time >= TIMES.fold && time < TIMES.walk;
  let center: Point = [MARK_HOME[0], MARK_HOME[1] - 18 * hop];
  let angle = 0.05 * pulse(time, 7, 3, 4) - 0.04 * pulse(time, 3.5, 7, 7);
  if (time >= TIMES.fold) {
    const stand = readMarkWalkPosition(time);
    const rise = LEG_LENGTH * legs;
    center = [stand[0], stand[1] + LEG_LENGTH - rise];
    if (landed) {
      // Looks left, then right, then crouches before the hop.
      angle +=
        0.12 * Math.sin(Math.PI * 2 * ramp(time, 19.1, 0.35)) * (1 - ramp(time, 19.45, 0.05));
    }
    if (walk.step !== null) {
      const fraction = walk.step - Math.floor(walk.step);
      center = [center[0], center[1] - 3.5 * Math.sin(Math.PI * fraction)];
      angle += 0.07;
    }
    const lookUp = easeInOut(ramp(time, 22.35, 0.9)) * (1 - easeInOut(ramp(time, 27.4, 0.6)));
    angle -= 0.2 * lookUp + 0.06 * pulse(time, TIMES.giant, 1.5, 3);
    // A startled little hop when the giant appears.
    center = [center[0], center[1] - 9 * Math.max(0, pulse(time, TIMES.giant + 0.05, 1.4, 3.5))];
  }
  const crouch =
    time >= TIMES.fold ? 0.16 * pulse(time, 18.9, 2.8, 5) + 0.2 * pulse(time, 19.36, 3.5, 6) : 0;
  return {
    angle,
    bloom: easeOut(ramp(time, 3, 0.7)),
    blink: readBlink(time, [6.5, 7.6, 19.3, 23.1, 30.2]),
    center,
    color,
    hole,
    holeOutline: easeInOut(ramp(time, 2.5, 0.3)),
    legs,
    // The pen draws one side of the square on each beat.
    outline: [0.5, 1, 1.5, 2].reduce(
      (sum, start) => sum + 0.25 * easeOut(ramp(time, start, 0.24)),
      0,
    ),
    previousColor,
    recolor,
    size: MARK_SIZE,
    squash: [sx + crouch * 0.8, sy - crouch + 0.1 * hop],
    step: walk.step,
  };
}

export type CubePose = {
  kind: "cube";
  /** Yaw and pitch in radians: 0 is the flat mark facing the camera. */
  pitch: number;
  yaw: number;
  perspective: number;
  lift: number;
  /** Paint progress of the top, left, and front faces, and the hatching. */
  paint: readonly [number, number, number];
  pencil: number;
  hatch: number;
  circle: number;
};

export type SidesPose = {
  kind: "sides";
  colors: readonly string[];
  /** Side widths in degrees, counterclockwise from `start`. */
  widths: readonly number[];
  start: number;
  /** The whole picture is one sticker: 0 flat on the paper, 1 mostly peeled back from its right tip. */
  peel: number;
  hatch: number;
  circle: number;
  /** 0 keeps the sides at the hexagon, 1 moves the last side onto the mark pose. */
  settle: number;
};

export type LabelPose = { text: string; progress: number; fade: number };

export const ISO_YAW = Math.PI / 4;
export const ISO_PITCH = Math.atan(1 / Math.sqrt(2));

/** The cube and the flat picture between 8 s and the fold. */
export function readCubePose(time: number): CubePose | SidesPose | null {
  if (time < TIMES.cube + 0.05 || time >= TIMES.fold + 0.62) {
    return null;
  }
  const hatch = easeInOut(ramp(time, 11, 0.9));
  const circle = easeInOut(ramp(time, 12, 1.1)) * (1 - ramp(time, TIMES.peel, 0.3));
  if (time < 15) {
    const turn = easeOutBack(easeOut(ramp(time, TIMES.cube + 0.05, 2.9)), 0.9);
    return {
      circle,
      hatch,
      kind: "cube",
      lift: 16 * Math.sin(Math.PI * clamp((time - TIMES.cube) / 1.1)) * (1 - ramp(time, 9, 0.3)),
      paint: [easeOut(ramp(time, 9, 0.55)), easeOut(ramp(time, 10, 0.55)), 1],
      pencil: easeInOut(ramp(time, 8.3, 0.7)),
      perspective: 0.38 * (1 - easeInOut(ramp(time, TIMES.cube, 3.4))),
      pitch: ISO_PITCH * turn,
      yaw: ISO_YAW * easeOutBack(easeOut(ramp(time, TIMES.cube, 2.7)), 0.8),
    };
  }
  // The flat picture: top, left, and right (the front face) as sides, starting at 30 degrees.
  // The corner at the right tip lifts and flutters, then the whole sticker peels on the hit.
  const flutter =
    0.07 *
    Math.max(0, Math.sin(Math.PI * 2 * 4 * (time - 15))) *
    (1 - ramp(time, TIMES.peel, 0.01));
  const peelOut = easeOutBack(ramp(time, TIMES.peel, 0.3), 1.2);
  const peelBack = easeInOut(ramp(time, TIMES.fourSides - 0.05, 0.28));
  const peel = clamp(
    (0.07 * ramp(time, 14.9, 0.15) + flutter) * (1 - peelOut) + peelOut * (1 - peelBack),
    0,
    1.1,
  );
  const four = easeOutBack(ramp(time, TIMES.fourSides + 0.1, 0.45), 1.4);
  const five = easeOutBack(ramp(time, TIMES.fiveSides, 0.45), 1.4);
  const breathe =
    Math.sin(Math.PI * 2 * (time - 17.5)) * ramp(time, 17.5, 0.2) * (1 - ramp(time, 17.9, 0.1));
  // Order: top, rose (the fifth side), left, right, clay (the fourth side, cut open at 30 degrees).
  let widths = [
    lerp(lerp(120, 102, four), 80, five),
    lerp(0, 58, five),
    lerp(lerp(120, 98, four), 84, five),
    lerp(lerp(120, 96, four), 76 + 8 * breathe, five),
    lerp(lerp(0, 64, four), 62 - 8 * breathe, five),
  ];
  // The fan fold: each side but the clay one folds away, and the clay side opens to a square.
  const fold = (index: number) => easeInOut(ramp(time, TIMES.fold + 0.07 * index, 0.3));
  widths = widths.map((width, index) =>
    index === 4 ? lerp(width, 90, fold(2)) : width * (1 - fold(index)),
  );
  return {
    circle,
    colors: [PALETTE.ochre, PALETTE.rose, PALETTE.teal, PALETTE.slateMid, PALETTE.clay],
    hatch,
    kind: "sides",
    peel,
    settle: easeInOut(ramp(time, TIMES.fold + 0.32, 0.3)),
    start: 30,
    widths,
  };
}

export function readCubeLabels(time: number): LabelPose[] {
  const fade = 1 - easeIn(ramp(time, TIMES.fourSides, 0.4));
  return [
    { fade, progress: ramp(time, 9, 0.55), text: "GitHub." },
    { fade, progress: ramp(time, 10, 0.55), text: "Convex." },
    { fade, progress: ramp(time, 11, 0.65), text: "Cloudflare." },
  ];
}

/** When each landscape element blooms in, as a wash spreading from a brush touch. */
export function readLandscapeReveal(time: number) {
  return {
    birds: easeOut(ramp(time, 24.5, 1)),
    clouds: easeOut(ramp(time, 20.9, 1.2)),
    grass: ramp(time, 20.3, 0.9),
    hills: easeOut(ramp(time, 20.5, 0.9)),
    ridge: easeOut(ramp(time, 19.62, 0.95)),
    sky: easeOut(ramp(time, 19.8, 1.25)),
    sun: easeOut(ramp(time, 20.8, 0.6)),
  };
}

/** How far the cloud bank in front of the giant has parted: 0 closed, 1 open. */
export const readCloudParting = (time: number) => easeInOut(ramp(time, TIMES.giant - 0.1, 2.2));

export type SpongeState = {
  awaken: number;
  azimuth: number;
  elevation: number;
  mist: number;
  on: boolean;
  probe: readonly [number, number, number];
  probeStart: readonly [number, number, number];
  restLevels: number;
  revealRadius: number;
  visibility: number;
};

export function readSpongeState(time: number): SpongeState {
  const on = time > 20.4 && time < TIMES.end + 0.1;
  const visibility = easeInOut(ramp(time, TIMES.giant + 0.3, 1.1));
  return {
    awaken: easeInOut(ramp(time, TIMES.awaken, 1.7)),
    azimuth: lerp(52, 47.5, easeInOut(ramp(time, 21, 12))),
    elevation: 26,
    mist: ramp(time, 20.4, 1) * (1 + 0.28 * (1 - easeInOut(ramp(time, TIMES.giant, 2.5)))),
    on,
    probe: [0, 0, 0],
    probeStart: [0, 0, 0],
    restLevels: 3,
    revealRadius: 0.2 * easeOut(ramp(time, TIMES.stroll + 0.3, 3.2)),
    visibility,
  };
}

/** The end card beats. */
export function readEndCard(time: number) {
  return {
    circle: easeInOut(ramp(time, TIMES.end + 0.05, 0.9)),
    hop: clamp((time - TIMES.end - 0.05) / 0.45),
    lineOne: ramp(time, 34.05, 0.6),
    lineTwo: ramp(time, 35, 0.95),
    site: ramp(time, TIMES.finalHit, 0.5),
    underline: easeInOut(ramp(time, 34.7, 0.3)),
    finalHop: pulse(time, TIMES.finalHit, 2.2, 4.5),
  };
}

/** A cloud wipe carries the cut to the end card: 0 before, 1 fully past. */
export const readWipe = (time: number) => ramp(time, TIMES.wipe, 1.6);
