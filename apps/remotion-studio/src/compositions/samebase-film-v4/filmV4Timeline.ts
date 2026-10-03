import {
  add,
  checkShufflePlan,
  easeInOutSine,
  type FilmV3Camera,
  type FilmV3Frame,
  type FilmV3Scene,
  type FilmV3Text,
  floorStrengthAt,
  hex,
  hexagonRadius,
  isometricElevation,
  keyed,
  keyLight,
  landingTones,
  mix,
  noStar,
  orbitCamera,
  palettes,
  probeAt,
  progress,
  readShuffle,
  type Rgb,
  type ShuffleMove,
  type StarWidths,
  scale,
  smoothstep,
  tesseractJoints,
  type Vector3,
} from "../samebase-film-v3/filmV3Timeline";
import { contrastRatio, mixOklch } from "./oklch";

export const filmV4Fps = 60;

/**
Look again: one continuous orthographic shot that ends on its own first frame. The zoom out goes on
while the camera turns back to the front view, and the giant shrinks into the flat mark.
*/
export const lookSeconds = 42;

/**
One render in the stack, drawn over the layers before it. Where the sponge hands over to the
shuffled sponge and back, the two pictures are the same up to sub-pixel edges and shading, and the
new layer fades in over a few frames on top of the old one. `id` names the render mode, so a layer
keeps its renderer while it lasts.
*/
export type FilmV4Layer = { frame: FilmV3Frame; id: "film" | "film-shuffle"; opacity: number };

/**
The silhouette of one cell at the isometric view, drawn around the frame point `x`, `y`: a hexagon
with a vertex at the top, `drawn` of its outline traced from that vertex, and `label` above it. The
label fades before the outline, so a small outline stays inside the next one.
*/
export type FilmV4Outline = {
  cap: number;
  drawn: number;
  label: string;
  labelOpacity: number;
  opacity: number;
  radius: number;
  x: number;
  y: number;
};

export type FilmV4Frame = {
  layers: readonly FilmV4Layer[];
  outlines: readonly FilmV4Outline[];
  overlay: { ink: Rgb; pale: Rgb };
  texts: readonly FilmV3Text[];
  /** The haze that rises from the bottom edge behind the words, from 0 to 1. */
  veil: number;
};

type Size = { height: number; width: number };
type View = { elevation: number; halfHeight: number; yaw: number };

/**
The camera keeps the world size of one pixel along the short frame side, and the view half heights
of the timeline are in frames of that side. A tall frame then shows the object at its landscape size
across the width, with more sky above and below it.
*/
function shortSide({ height, width }: Size): number {
  return Math.min(height, width);
}

function frameScale(size: Size): number {
  return size.height / shortSide(size);
}

const sampleGrid = 4;
const halfShutter = 0.25 / filmV4Fps;
const grain = 0.024;
const haze = palettes.haze;

/** The colors of the look film: the sky, the face tones, the shadow tint, and the words. */
type LookStyle = {
  ink: Rgb;
  /** The haze behind the words and the casing of the outlines. */
  pale: Rgb;
  shadowTint: Rgb;
  sky: readonly [Rgb, Rgb];
  tones: FilmV3Scene["tones"];
};

/** The riso look: riso inks on paper. */
const riso = {
  paper: {
    ink: hex(0x0078bf),
    pale: hex(0xf2ebdd),
    shadowTint: hex(0xd6c4a8),
    sky: [hex(0xf7f1e6), hex(0xf2ebdd)],
    tones: { x: hex(0x0078bf), y: hex(0xffe800), z: hex(0xff48b0) },
  },
  pink: {
    ink: hex(0xf7f1e6),
    pale: hex(0xff5cb8),
    shadowTint: hex(0xc8338a),
    sky: [hex(0xff48b0), hex(0xff5cb8)],
    tones: { x: hex(0xffe800), y: hex(0xf7f1e6), z: hex(0x0078bf) },
  },
  yellow: {
    ink: hex(0xff48b0),
    pale: hex(0xffee3a),
    shadowTint: hex(0xd4bf00),
    sky: [hex(0xffe800), hex(0xffee3a)],
    tones: { x: hex(0xff48b0), y: hex(0xf7f1e6), z: hex(0x00838a) },
  },
  blue: {
    ink: hex(0xffe800),
    pale: hex(0x1488cf),
    shadowTint: hex(0x005a91),
    sky: [hex(0x0078bf), hex(0x1488cf)],
    tones: { x: hex(0xffe800), y: hex(0xf7f1e6), z: hex(0xff48b0) },
  },
} as const satisfies Record<string, LookStyle>;

/**
The riso look never stops shifting between its sets, the way the theme params of Samebase recolor a
whole app: paper while the mark turns, then pink, yellow, blue, pink, yellow, and paper again for
the end. Each blend runs at a steady pace from one key to the next.
*/
const risoKeys: readonly { at: number; theme: LookStyle }[] = [
  { at: 3.2, theme: riso.paper },
  { at: 8.5, theme: riso.pink },
  { at: 13.5, theme: riso.yellow },
  { at: 19.5, theme: riso.blue },
  { at: 26, theme: riso.pink },
  { at: 31, theme: riso.yellow },
  { at: 36.5, theme: riso.paper },
];

function mixStyle(from: LookStyle, to: LookStyle, amount: number): LookStyle {
  const mix = (first: Rgb, second: Rgb) => mixOklch(first, second, amount);
  return {
    ink: mix(from.ink, to.ink),
    pale: mix(from.pale, to.pale),
    shadowTint: mix(from.shadowTint, to.shadowTint),
    sky: [mix(from.sky[0], to.sky[0]), mix(from.sky[1], to.sky[1])],
    tones: {
      x: mix(from.tones.x, to.tones.x),
      y: mix(from.tones.y, to.tones.y),
      z: mix(from.tones.z, to.tones.z),
    },
  };
}

function risoThemeAt(time: number): LookStyle {
  let theme: LookStyle = riso.paper;
  for (let index = 1; index < risoKeys.length; index += 1) {
    const from = risoKeys[index - 1];
    const to = risoKeys[index];
    if (from && to && time > from.at) {
      theme = mixStyle(from.theme, to.theme, progress(time, from.at, to.at));
    }
  }
  return theme;
}

const risoInks = [0x0078bf, 0xf7f1e6, 0xff48b0, 0xffe800, 0x00838a].map(hex);
const lineInks = new Map<string, Rgb>();

/**
The ink of a line over the top (0) or bottom (1) sky color: the riso ink with the best contrast over
the whole time the line shows, so one line keeps one color while the sky shifts under it.
*/
function lineInk(row: 0 | 1, at: number, until: number): Rgb {
  const key = `${row} ${at} ${until}`;
  const known = lineInks.get(key);
  if (known) {
    return known;
  }
  let best = { contrast: 0, ink: riso.paper.ink };
  for (const ink of risoInks) {
    let contrast = Infinity;
    for (let time = at; time <= until + 0.5; time += 0.1) {
      contrast = Math.min(contrast, contrastRatio(ink, risoThemeAt(time).sky[row]));
    }
    if (contrast > best.contrast) {
      best = { contrast, ink };
    }
  }
  lineInks.set(key, best.ink);
  return best.ink;
}

/** The same frame in `style`: the scene keeps its geometry, light, and camera. */
function styled(frame: FilmV3Frame, style: LookStyle, backdropTexts: FilmV3Text[]): FilmV3Frame {
  return {
    ...frame,
    backdropTexts,
    scene: { ...frame.scene, tones: style.tones },
    shadowTint: style.shadowTint,
    sky: style.sky,
  };
}
const iso = { elevation: isometricElevation, yaw: -45 } as const;

function grainStepAt(time: number): number {
  return Math.floor(Math.round(time * 30) / 2);
}

// ---------- the film renderer: the cube ----------

const restSponge = {
  anchorToProbe: 1,
  center: [0, 0, 0],
  depth: 3,
  halfSize: 1,
  openness: 0,
  probe: [0.5, 0.5, 1],
  restDepth: 1,
  revealRadius: 0.62,
} as const satisfies FilmV3Scene["sponge"];

/** With this radius every channel of the cube is fully open, which is the geometry of the shuffle. */
const fullRevealRadius = 8;

const closedFaces = {
  center: [0, 0],
  enabled: false,
  fold: "wait",
  radius: 0,
  unfold: 0,
} as const satisfies FilmV3Scene["faces"];

const unusedTesseract = {
  halfExtent: [1, 1, 1],
  joints: tesseractJoints(0, 0).joints,
} as const satisfies FilmV3Scene["tesseract"];

/**
The cube is the (-x, +y, +z) corner cell of the giant, a sponge that runs on without end in +x, -y,
and -z. From the isometric view and the three-quarter views of the film the corner is the point of
the cube nearest the camera, and every other cell of the giant lies behind or under the cube.
*/
const corner: Vector3 = [-1, 1, 1];
const octant: Vector3 = [1, -1, -1];

/**
The zoom in ends with the frame this tall, in cube half sizes: the three faces around the near corner
fill the whole frame with a margin from the isometric view.
*/
const deepHalfHeight = 0.6;

type CubeShot = {
  /** 0 is the view, 1 the deepest point of the zoom in toward the near corner. */
  dive: number;
  /** Scales the floor shadow, which also fades out near a level camera. */
  floor: number;
  mode: "shuffle" | "sponge";
  shuffle: FilmV3Scene["shuffle"];
  sponge: FilmV3Scene["sponge"];
  view: View;
};

/** The frame shrinks on a log scale, and the target moves from the cube center to the near corner. */
function cubeCamera(view: View, dive: number, size: Size): FilmV3Camera {
  return orbitCamera(
    {
      ...view,
      halfHeight: frameScale(size) * view.halfHeight * (deepHalfHeight / view.halfHeight) ** dive,
      tan: 0,
      target: scale(corner, dive),
    },
    6,
  );
}

function cubeScene(shot: CubeShot, size: Size): FilmV3Scene {
  const camera = cubeCamera(shot.view, shot.dive, size);
  return {
    camera,
    faces: closedFaces,
    floor: { height: -1, strength: shot.floor * floorStrengthAt(shot.view.elevation) },
    haze: { clear: 1e6, density: 0, hidden: 2e6, start: 0 },
    light: keyLight(camera, 0.045, 1),
    mode: shot.mode,
    shuffle: shot.shuffle,
    sponge: shot.sponge,
    star: noStar,
    tesseract: unusedTesseract,
    tones: landingTones,
  };
}

/** The film frame at `time`: the shutter is half a frame long and centered on `time`. */
function filmFrame(read: (time: number) => FilmV3Scene, time: number): FilmV3Frame {
  const open = read(time - halfShutter);
  const close = read(time + halfShutter);
  return {
    backdropTexts: [],
    cursor: { pressed: 0, visible: 0, x: 0, y: 0 },
    grain,
    grainStep: grainStepAt(time),
    overlayTexts: [],
    sampleGrid,
    scene: read(time),
    shadowTint: haze.shadowTint,
    shutter: {
      cameras: [open.camera, close.camera],
      starRotation: [open.star.rotation, close.star.rotation],
      unfold: [open.faces.unfold, close.faces.unfold],
    },
    sky: haze.sky,
  };
}

/** The frame half height of the flat mark, in cube half sizes. */
const markHalfHeight = 2.8;

/** Move 1: head on, the solid reads as the flat mark, and a turn shows that it is solid. */
function markTurn(time: number, turnStart: number, to: View, turnEnd: number): View {
  const turn = easeInOutSine(progress(time, turnStart, turnEnd));
  return {
    elevation: mix(0, to.elevation, turn),
    halfHeight: mix(markHalfHeight, to.halfHeight, turn),
    yaw: mix(0, to.yaw, turn),
  };
}

/**
The first opening: the center of the level 2 hole in the middle of the left face row next to the
near edge, in unit cube coordinates. With the point exactly on the center of a closed hole, the hole
opens as one centered square that grows, and no partial sliver or lone speck shows around it.
*/
const firstOpening: Vector3 = [0, 0.5, 5 / 6];

function dot(a: Vector3, b: Vector3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** The pixel where the orthographic `camera` shows the world point `point`. */
function pixelOf(camera: FilmV3Camera, point: Vector3, size: Size) {
  const offset = add(point, scale(camera.target, -1));
  const unit = size.height / (2 * camera.halfHeight);
  return {
    x: size.width / 2 + dot(offset, camera.right) * unit,
    y: size.height / 2 - dot(offset, camera.up) * unit,
  };
}

/**
Move 2: the channels open around a point on the surface. No cursor shows. The point rests on
`firstOpening` while the reveal starts with a radius smaller than the distance to the next channels,
so only that hole opens; then the radius grows and the point eases into a slow figure eight over
the faces, after the automatic probe of the landing hero. At the end the reveal spreads over the
whole cube, so every channel is fully open three levels deep.
*/
function revealSponge(
  time: number,
  view: View,
  size: Size,
  { end, spread, start }: { end: number; spread: number; start: number },
): FilmV3Scene["sponge"] {
  const openness = easeInOutSine(progress(time, start, start + 0.3));
  if (openness <= 0) {
    return restSponge;
  }
  const camera = cubeCamera(view, 0, size);
  const rest = pixelOf(camera, [-1, firstOpening[1] * 2 - 1, firstOpening[2] * 2 - 1], size);
  const leave = easeInOutSine(progress(time, start + 0.6, start + 1.6));
  const angle = easeInOutSine(progress(time, start + 0.6, spread)) * Math.PI * 2 * 0.85;
  // The loop stays well inside the cube outline, so the probe is always the point on the surface.
  // Its size is in pixels of a 1080 pixel short side.
  const unit = shortSide(size) / 1080;
  const x = mix(rest.x, size.width / 2 + (Math.sin(angle * 2) * 150 - 60) * unit, leave);
  const y = mix(rest.y, size.height / 2 + (20 - Math.sin(angle) * 120) * unit, leave);
  const probe =
    leave > 0 ? (probeAt(camera, size.width, size.height, x, y, 1) ?? firstOpening) : firstOpening;
  return {
    ...restSponge,
    openness,
    probe,
    revealRadius:
      time < spread
        ? mix(0.09, 0.62, easeInOutSine(progress(time, start + 0.3, start + 1.5)))
        : mix(0.62, fullRevealRadius, smoothstep(spread, end, time)),
  };
}

// ---------- the layer stack ----------

function filmLayer(id: "film" | "film-shuffle", frame: FilmV3Frame, opacity: number): FilmV4Layer {
  return { frame, id, opacity };
}

/** A render that takes over at `from` and fades in over `fade` seconds on top of the one before. */
type Part = { fade: number; from: number; layer: (opacity: number) => FilmV4Layer };

/** The layers at `time`: the last part that has fully taken over, and the next one while it fades in. */
function stackAt(time: number, parts: readonly [Part, ...Part[]]): FilmV4Layer[] {
  let base = parts[0];
  let next: Part | undefined;
  for (const part of parts) {
    if (time >= part.from + part.fade) {
      base = part;
      next = undefined;
    } else if (!next && time >= part.from) {
      next = part;
    }
  }
  const layers = [base.layer(1)];
  if (next) {
    layers.push(next.layer(smoothstep(next.from, next.from + next.fade, time)));
  }
  return layers;
}

// ---------- the words ----------

function rise(time: number, at: number): number {
  return 1 - (1 - progress(time, at, at + 0.45)) ** 5;
}

// ---------- variant look: look again ----------

/**
Look again is one chain: every move leaves the object in a new state that the next move starts
from, and nothing returns to the plain cube until the end. The flat mark turns into a solid, the
reveal opens it into fractal depth and it stays open, the shuffle moves the cells of every level
one round and stops, the camera dives to the near corner and zooms out through threefold cycles of a giant with
no end in sight, the isometric image turns into a star of 4 and then 5 sides and back to 3, and the
camera turns to the front view while the giant shrinks into the flat mark of the first frame.

The music plays the track from the start with no cut, and the zoom out starts on its lift at 17.5 s.
Nothing else moves while the camera zooms or the star turns.
*/
const look = {
  turn: [0.3, 3],
  reveal: { end: 6.8, spread: 5.6, start: 3.2 },
  /** The shuffled sponge takes over while it rests, and its first cells move at 7.5 s. */
  shuffle: 7.35,
  settle: [14.7, 16.7],
  dive: [15.3, 17.5],
  star: [28.1, 34.9],
  front: [34.9, 37.2],
  /** The camera lands head on, with every level of the giant still open. */
  landed: 37.2,
  /**
  The smaller levels close together in one move under the end lines, long after the zoom out, and
  the giant is then the flat mark of the first frame.
  */
  closed: [39, 39.7],
} as const;

type Slot = readonly [number, number, number];

/**
The shuffle wanders one round and stops in the Menger layout before the dive. On each visible face
of every cell, the opening at the face center travels once around the 2 by 2 cells away from the
near corner edges, one step every 1.85 s from `at`. The near corner and the three edges from it
never move, so the zoom about the corner is the same at every level, and the star seams run along
still edges.
*/
const wanderLoops: readonly {
  at: number;
  loop: readonly [Slot, Slot, Slot, Slot];
}[] = [
  // The front face: the opening moves down, right, up, and back.
  {
    at: 7.5,
    loop: [
      [1, 1, 2],
      [1, 0, 2],
      [2, 0, 2],
      [2, 1, 2],
    ],
  },
  // The top face: right, back, left, and forward again.
  {
    at: 7.7,
    loop: [
      [1, 2, 1],
      [2, 2, 1],
      [2, 2, 0],
      [1, 2, 0],
    ],
  },
  // The left face: down, back, up, and forward again.
  {
    at: 7.9,
    loop: [
      [0, 1, 1],
      [0, 0, 1],
      [0, 0, 0],
      [0, 1, 0],
    ],
  },
];

const wanderMoves: readonly ShuffleMove[] = wanderLoops.flatMap(({ at, loop }) =>
  Array.from({ length: 4 }, (_, step) => ({
    at: at + step * 1.85,
    // The cell after the opening moves into it, so the opening moves on to that cell.
    from: loop[(step + 1) % 4] ?? loop[0],
    to: loop[step % 4] ?? loop[0],
  })),
);
checkShufflePlan(wanderMoves);

/** The world size of the giant: a Menger sponge five levels above the cube. */
const giantLevels = 5;

/**
The zoom out after the deepest point, in threefold cycles: a burst that speeds up to about 1.3
seconds a cycle, and a slow cruise under the star that lands on the mark. The outline of the giant
enters the frame at 29.5 s, and the landing frames the giant as the first frame frames the mark.
*/
function zoomBurst(time: number): number {
  return smoothstep(look.dive[1], 24.5, time) * (1 - smoothstep(25, 29.5, time));
}

function zoomCruise(time: number): number {
  return smoothstep(23.5, 29.5, time) * (1 - smoothstep(32.5, look.landed, time));
}

/** The integral of `speed` from the deepest point to `end`, with the midpoint rule. */
function integrate(speed: (time: number) => number, end: number): number {
  const start = look.dive[1];
  if (end <= start) {
    return 0;
  }
  const steps = Math.ceil((end - start) * 120);
  const step = (end - start) / steps;
  let sum = 0;
  for (let index = 0; index < steps; index += 1) {
    sum += speed(start + (index + 0.5) * step) * step;
  }
  return sum;
}

const zoomEnd = giantLevels + Math.log(markHalfHeight / deepHalfHeight) / Math.log(3);
/** At the isometric view, the frame edge meets the outline of the giant here. */
const zoomOutlineIn = giantLevels + Math.log(0.79 / deepHalfHeight) / Math.log(3);
const cruiseSpeed =
  (zoomEnd - zoomOutlineIn) / (integrate(zoomCruise, look.landed) - integrate(zoomCruise, 29.5));
const burstSpeed =
  (zoomOutlineIn - cruiseSpeed * integrate(zoomCruise, 29.5)) / integrate(zoomBurst, look.landed);

function lookZoomAt(time: number): number {
  const at = Math.min(time, look.landed);
  return burstSpeed * integrate(zoomBurst, at) + cruiseSpeed * integrate(zoomCruise, at);
}

/** Star keys: the widths of the top, left, four new, and front sides, and when they are reached. */
const starKeys: readonly { at: number; widths: StarWidths }[] = [
  { at: look.star[0], widths: noStar.widths },
  { at: 29.4, widths: [98, 84, 0, 80, 0, 0, 98] },
  { at: 31, widths: [76, 70, 0, 64, 0, 76, 74] },
  // The five sides trade widths, so the star never holds still.
  { at: 33.2, widths: [70, 78, 0, 72, 0, 68, 72] },
  { at: look.star[1], widths: noStar.widths },
];

function starWidthsAt(time: number): StarWidths {
  let widths: StarWidths = noStar.widths;
  for (let index = 1; index < starKeys.length; index += 1) {
    const from = starKeys[index - 1];
    const to = starKeys[index];
    if (from && to && time > from.at) {
      const amount = easeInOutSine(progress(time, from.at, to.at));
      const width = (side: 0 | 1 | 2 | 3 | 4 | 5 | 6) =>
        mix(from.widths[side], to.widths[side], amount);
      widths = [width(0), width(1), width(2), width(3), width(4), width(5), width(6)];
    }
  }
  return widths;
}

/** The flat mark turns to a three-quarter view, drifts while the reveal and shuffle run, then settles. */
function readViewLook(time: number): View {
  const turned = markTurn(
    time,
    look.turn[0],
    { elevation: 24, halfHeight: 2.5, yaw: -52 },
    look.turn[1],
  );
  return {
    elevation: keyed(time, turned.elevation, [
      { at: look.turn[1], ease: easeInOutSine, to: 27, until: 7.5 },
      { at: look.settle[0], ease: easeInOutSine, to: iso.elevation, until: look.settle[1] },
    ]),
    halfHeight: turned.halfHeight,
    yaw: keyed(time, turned.yaw, [
      { at: look.turn[1], ease: easeInOutSine, to: -38, until: 7.5 },
      { at: 7.5, ease: easeInOutSine, to: -42, until: look.settle[0] },
      { at: look.settle[0], ease: easeInOutSine, to: iso.yaw, until: look.settle[1] },
    ]),
  };
}

/**
The openings close only when they are smaller than one of the 16 samples of a pixel, a quarter of a
pixel, where no one can see them. Smaller openings would cost GPU time and add nothing: a head-on
frame then traces most rays down long tunnels.
*/
const lookFadePixels = 1;

/**
The levels of openings under the cube. The reveal opens all of them, so the shuffled sponge that
takes over at `look.shuffle` draws the same cube.
*/
const lookDepth = 8;

function lookShuffle(time: number, fadePixels: number): FilmV3Scene["shuffle"] {
  return { depth: lookDepth, fadePixels, moveMinLevel: 0, ...readShuffle(time, wanderMoves) };
}

function readCubeLook(at: number, size: Size, mode: CubeShot["mode"]): FilmV3Scene {
  const view = readViewLook(at);
  return cubeScene(
    {
      dive: easeInOutSine(progress(at, ...look.dive)),
      floor: 1 - easeInOutSine(progress(at, look.settle[0], 16.3)),
      mode,
      shuffle: lookShuffle(at, lookFadePixels),
      sponge: { ...revealSponge(at, view, size, look.reveal), depth: lookDepth },
      view,
    },
    size,
  );
}

/**
The zoom out after the deepest point, in render units: the world scaled down about the near corner
by the whole threefold cycles of the frame, so the numbers stay small at every scale. The giant
draws at most two levels above the frame; while it is larger, its corner cell of that size gives
the same picture.
*/
function lookPullScene(at: number, frameTime: number, size: Size): FilmV3Scene {
  const unit = 3 ** Math.floor(lookZoomAt(frameTime));
  const front = easeInOutSine(progress(at, ...look.front));
  const halfHeight = (deepHalfHeight * 3 ** lookZoomAt(at)) / unit;
  const giantHalf = 3 ** giantLevels / unit;
  const drawnHalf = Math.min(9, giantHalf);
  const camera = orbitCamera(
    {
      elevation: mix(iso.elevation, 0, front),
      halfHeight: frameScale(size) * halfHeight,
      tan: 0,
      target: add(corner, scale(octant, giantHalf * front)),
      yaw: mix(iso.yaw, 0, front),
    },
    6 * drawnHalf,
  );
  const fade = easeInOutSine(progress(at, ...look.closed));
  const inStar = frameTime >= look.star[0] && frameTime < look.star[1];
  return {
    camera,
    faces: closedFaces,
    floor: { height: -1, strength: 0 },
    haze: { clear: 1e6, density: 0, hidden: 2e6, start: 0 },
    light: keyLight(camera, (0.045 * halfHeight) / deepHalfHeight, 1),
    mode: "shuffle",
    shuffle: lookShuffle(
      at,
      Math.max(lookFadePixels, fade * 0.0426 * sampleGrid * shortSide(size)),
    ),
    sponge: { ...restSponge, center: add(corner, scale(octant, drawnHalf)), halfSize: drawnHalf },
    star: inStar
      ? {
          enabled: true,
          hexRadius: hexagonRadius * giantHalf,
          rotation: 360 * easeInOutSine(progress(at, ...look.star)),
          widths: starWidthsAt(at),
        }
      : noStar,
    tesseract: unusedTesseract,
    tones: landingTones,
  };
}

export function readFilmV4Frame(time: number, size: Size): FilmV4Frame {
  const theme = risoThemeAt(time);
  const backdrop = lookBackdropWords(time, size);
  const cube = (mode: CubeShot["mode"]) =>
    styled(
      filmFrame(
        (at) =>
          time >= look.dive[1] ? lookPullScene(at, time, size) : readCubeLook(at, size, mode),
        time,
      ),
      theme,
      backdrop,
    );
  // The landing is the first frame, grain included.
  const rest = styled(
    filmFrame((at) => readCubeLook(Math.min(at, 0), size, "sponge"), 0),
    theme,
    backdrop,
  );
  return {
    layers: stackAt(time, [
      { fade: 0, from: 0, layer: (opacity) => filmLayer("film", cube("sponge"), opacity) },
      {
        fade: 0.1,
        from: look.shuffle - 0.05,
        layer: (opacity) => filmLayer("film-shuffle", cube("shuffle"), opacity),
      },
      { fade: 0, from: look.closed[1], layer: (opacity) => filmLayer("film", rest, opacity) },
    ]),
    outlines: lookOutlines(time, size),
    // The outline labels show while the camera zooms out.
    overlay: { ink: lineInk(1, 21.5, 28.5), pale: theme.pale },
    texts: lookFrontWords(time, size),
    veil: smoothstep(29, 29.5, time) * (1 - smoothstep(34.4, 34.9, time)),
  };
}

/**
The big lines of the cube shots stand behind the object in two bands, one above and one below it,
so the object overlaps them. Each line fills the frame width, rises word by word as its move starts,
and sinks before the next one. A tall frame breaks each row into the `tall` lines.
*/
const lookBandLines: readonly {
  at: number;
  rows: readonly [string, string];
  tall: readonly [readonly string[], readonly string[]];
  until: number;
}[] = [
  {
    at: 3.4,
    rows: ["GitHub. Convex.", "Cloudflare."],
    tall: [["GitHub.", "Convex."], ["Cloudflare."]],
    until: 6.9,
  },
  {
    at: 7.6,
    rows: ["Run agents", "in parallel."],
    tall: [["Run agents"], ["in parallel."]],
    until: 10.9,
  },
  {
    at: 11.2,
    rows: ["Every PR gets", "its own preview."],
    tall: [["Every PR gets"], ["its own", "preview."]],
    until: 14.6,
  },
  {
    at: 37.4,
    rows: ["Same base.", "Your accounts. No magic."],
    tall: [["Same base."], ["Your accounts.", "No magic."]],
    until: 41.3,
  },
];

/** The star fills the middle of the frame, so its lines stand in front of it over the haze. */
const lookStarLines: readonly {
  at: number;
  tall: readonly string[];
  text: string;
  until: number;
}[] = [
  {
    at: 29.5,
    tall: ["Delete your", "Samebase account."],
    text: "Delete your Samebase account.",
    until: 31.6,
  },
  {
    at: 31.8,
    tall: ["Your app", "doesn't notice."],
    text: "Your app doesn't notice.",
    until: 34.3,
  },
];

/**
The lines of a tall frame, in short side widths from the frame center: the last line above the
object and the first line below it overlap its edges as the landscape bands do. Every line stays
clear of the controls that a phone feed draws over the right edge and the bottom fifth.
*/
const tallLayout = { above: -0.27, address: 0.255, below: 0.39, fit: 0.86 } as const;

/** Lines that stack up from above the object or down from below it, with their words rising in order. */
function tallLines(
  time: number,
  lines: readonly string[],
  {
    above,
    at,
    cap,
    color,
    size,
    until,
  }: {
    above: boolean;
    at: number;
    cap: number;
    color: Rgb;
    size: Size;
    until: number;
  },
): FilmV3Text[] {
  const step = 1.25 * cap;
  const start = size.height / 2 + (above ? tallLayout.above : tallLayout.below) * size.width;
  let before = 0;
  return lines.map((line, index) => {
    const words = line.split(" ");
    const first = before;
    before += words.length;
    return {
      align: "center",
      cap,
      color,
      fit: tallLayout.fit * size.width,
      words: risingWords(time, words, at + first * 0.08, until + first * 0.04, 0.08),
      x: size.width / 2,
      y: above ? start - (lines.length - 1 - index) * step : start + index * step,
    };
  });
}

const lookAddress = { at: 39.8, until: 41.45 } as const;

/** The words of one line, each rising `step` seconds after the one before it. */
function risingWords(
  time: number,
  words: readonly string[],
  at: number,
  until: number,
  step: number,
) {
  return words.map((word, index) => ({
    rise: rise(time, at + index * step) - rise(time, until + index * 0.04),
    text: word,
  }));
}

function lookBackdropWords(time: number, size: Size): FilmV3Text[] {
  const { height, width } = size;
  if (height > width) {
    return lookBandLines.flatMap(({ at, tall, until }) =>
      tall.flatMap((lines, index) =>
        tallLines(time, lines, {
          above: index === 0,
          at: at + index * 0.22,
          cap: 0.1 * width,
          color: lineInk(index === 0 ? 0 : 1, at, until),
          size,
          until: until + index * 0.08,
        }),
      ),
    );
  }
  return lookBandLines.flatMap(({ at, rows, until }) =>
    rows.map((row, index) => ({
      align: "center" as const,
      cap: 0.19 * height,
      color: lineInk(index === 0 ? 0 : 1, at, until),
      fit: 0.94 * width,
      words: risingWords(time, row.split(" "), at + index * 0.22, until + index * 0.08, 0.08),
      x: width / 2,
      y: (index === 0 ? 0.25 : 0.94) * height,
    })),
  );
}

function lookFrontWords(time: number, size: Size): FilmV3Text[] {
  const { height, width } = size;
  if (height > width) {
    return [
      ...lookStarLines.flatMap(({ at, tall, until }) =>
        tallLines(time, tall, {
          above: false,
          at,
          cap: 0.075 * width,
          color: lineInk(1, at, until),
          size,
          until,
        }),
      ),
      {
        align: "center",
        cap: 0.035 * width,
        color: lineInk(1, lookAddress.at, lookAddress.until),
        fit: width,
        words: risingWords(time, ["samebase.com"], lookAddress.at, lookAddress.until, 0),
        x: width / 2,
        y: height / 2 + tallLayout.address * width,
      },
    ];
  }
  return [
    ...lookStarLines.map(({ at, text, until }) => ({
      align: "center" as const,
      cap: 0.13 * height,
      color: lineInk(1, at, until),
      fit: 0.94 * width,
      words: risingWords(time, text.split(" "), at, until, 0.08),
      x: width / 2,
      y: 0.93 * height,
    })),
    {
      align: "center",
      cap: 0.035 * height,
      color: lineInk(1, lookAddress.at, lookAddress.until),
      fit: width,
      words: risingWords(time, ["samebase.com"], lookAddress.at, lookAddress.until, 0),
      x: width / 2,
      y: 0.73 * height,
    },
  ];
}

/**
While the camera zooms out, an outline traces the cube, labels it, and shrinks with it. Two cycles
later a second outline does the same for the cell nine times larger. At the isometric view every
corner cell draws a hexagon around the near corner, so the outlines share the frame center.
*/
const lookLabels = [
  { label: "your app", level: 0 },
  { label: "all your apps", level: 2 },
] as const;

function lookOutlines(time: number, size: Size): FilmV4Outline[] {
  if (time < look.dive[1] || time >= look.star[0]) {
    return [];
  }
  const zoom = lookZoomAt(time);
  const unit = shortSide(size);
  return lookLabels.map(({ label, level }) => {
    // In short sides: a cell of half size 3^level at the half height of the zoom.
    const radius = (hexagonRadius * 3 ** (level - zoom)) / (2 * deepHalfHeight);
    const fadeIn = 1 - smoothstep(0.42, 0.5, radius);
    return {
      // The label grows and shrinks with its outline.
      // It stops growing at 0.3 frame widths, where the longest label nearly fills a tall frame; a
      // landscape outline leaves the frame first.
      cap: 0.28 * Math.min(radius, (0.3 * size.width) / unit) * unit,
      drawn: easeInOutSine(progress(-radius, -0.5, -0.34)),
      label,
      labelOpacity: fadeIn * smoothstep(0.07, 0.11, radius),
      opacity: fadeIn * smoothstep(0.015, 0.03, radius),
      radius: radius * unit,
      x: size.width / 2,
      y: size.height / 2,
    };
  });
}
