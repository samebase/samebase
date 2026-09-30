import type { IllusionStudyFrame } from "../illusion-studies/illusionStudyRenderer";
import {
  add,
  checkShufflePlan,
  easeInLongOut,
  easeInOutCubic,
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
  orbitMoves,
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
Three orders of the same moves. Every film is one continuous orthographic shot, and the swaps
between the two renderers happen only while both pictures are the same.

- `a`: mark to solid, local reveal, fractal shuffle, fourth face, endless pull back. Each move shows
  one more property of the same cube: solid, deep, the same at every level, more sides than it
  shows, and one cell of something without end.
- `b`: mark to solid, fourth face, endless pull back. Three steps, each one larger than the last: the
  flat mark is a solid, the solid has a fourth face, and the cube is one cell of something without
  end.
- `c`: mark to solid, local reveal, endless pull back. The surface opens inward, then the camera
  pulls outward and finds the same pattern at every larger scale: one idea, in and out.

- `look`: look again. The moves of A in one shot that ends on its own first frame: the zoom out
  goes on while the camera turns back to the front view, and the giant shrinks into the flat mark.

The cube or hole move is in no cut: a Menger cube and its mold look different at the key view,
because the mold shows the ends of its channels, which the cube hides.
*/
export type FilmV4Variant = "a" | "b" | "c" | "look";

/** How the new face of the fourth face move opens. */
export type FourthFold = FilmV3Scene["faces"]["fold"];

/**
The fold of the films: the leaf. Its halves visibly turn in the light while the hole folds with
them, so the move reads as a fold, and it never reaches past the square diagonal. The shear grows a
needle twice the face side before it widens.
*/
export const filmFold: FourthFold = "leaf";

export const filmV4Seconds = { a: 38.5, b: 28, c: 25, look: 42 } as const satisfies Record<
  FilmV4Variant,
  number
>;

/**
One render in the stack, drawn over the layers before it. The film renderer draws the cube moves:
the mark, the reveal, the shuffle, and the fourth face. The study renderer draws the endless sponge
of the pull back. Where one render hands over to another, the two
pictures are the same up to sub-pixel edges and shading, and the new layer fades in over a few
frames on top of the old one. `id` names the renderer and its mode, so a layer keeps its renderer
while it lasts.
*/
export type FilmV4Layer =
  | { frame: FilmV3Frame; id: "film" | "film-shuffle"; kind: "film"; opacity: number }
  | { frame: IllusionStudyFrame; id: "study"; kind: "study"; opacity: number };

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

const sampleGrid = 4;
const halfShutter = 0.25 / filmV4Fps;
const grain = 0.024;
const haze = palettes.haze;

/** The colors of the look film: the sky, the face tones, the shadow tint, and the words. */
export type LookStyle = {
  ink: Rgb;
  /** The haze behind the words and the casing of the outlines. */
  pale: Rgb;
  shadowTint: Rgb;
  sky: readonly [Rgb, Rgb];
  tones: FilmV3Scene["tones"];
};

/** `haze` is the landing look. The others are presentation tests. */
export const lookStyles = {
  haze: {
    ink: haze.ink,
    pale: haze.sky[1],
    shadowTint: haze.shadowTint,
    sky: haze.sky,
    tones: landingTones,
  },
  cobalt: {
    ink: hex(0xffffff),
    pale: hex(0x2f55f0),
    shadowTint: hex(0x14287a),
    sky: [hex(0x1733c4), hex(0x2f55f0)],
    tones: { x: hex(0xffd400), y: hex(0xffffff), z: hex(0x0b1654) },
  },
  sunset: {
    ink: hex(0x1d1147),
    pale: hex(0xff5c8a),
    shadowTint: hex(0xb8325c),
    sky: [hex(0xff8a3d), hex(0xff5c8a)],
    tones: { x: hex(0x6b2bd9), y: hex(0xfff4e6), z: hex(0x1d1147) },
  },
} as const satisfies Record<string, LookStyle>;

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
    tones: { x: mix(from.tones.x, to.tones.x), y: mix(from.tones.y, to.tones.y), z: mix(from.tones.z, to.tones.z) },
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
The ink of a line over the top (0) or bottom (1) sky color: in the riso look, the riso ink with the
best contrast over the whole time the line shows, so one line keeps one color while the sky shifts
under it.
*/
function lineInk(style: LookStyleName, row: 0 | 1, at: number, until: number): Rgb {
  if (style !== "riso") {
    return lookStyles[style].ink;
  }
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

export type LookStyleName = keyof typeof lookStyles | "riso";

function lookThemeAt(style: LookStyleName, time: number): LookStyle {
  if (style !== "riso") {
    return lookStyles[style];
  }
  return risoThemeAt(time);
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

const restShuffle = {
  depth: 3,
  fadePixels: 1.5,
  moveMinLevel: 0,
  ...readShuffle(0, []),
} as const satisfies FilmV3Scene["shuffle"];

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
fill the whole frame with a margin, from the isometric view and from the view of C.
*/
const deepHalfHeight = 0.6;

/**
The move from the cube to the giant. The camera zooms in toward the near corner of the cube until
its three faces fill the frame, holds still, and zooms out from the same corner as the endless pull
back. At `swap`, while the frame is still and shows no outline and no sky, the cube becomes the
corner cell of the giant: every other cell of the giant is outside the frame, so the two renders
give the same picture, and the rest of the giant then enters from the frame edges.
*/
type Dive = {
  from: View;
  start: number;
  deep: number;
  swap: number;
  out: number;
  detailFloor: number;
  /** The zoom out slows to 40 percent over three seconds from here, under the words. */
  slowAt: number;
};

type CubeShot = {
  /** 0 is the view, 1 the deepest point of the zoom in toward the near corner. */
  dive: number;
  faces: FilmV3Scene["faces"];
  /** Scales the floor shadow, which also fades out near a level camera. */
  floor: number;
  mode: "shuffle" | "sponge";
  shuffle: FilmV3Scene["shuffle"];
  sponge: FilmV3Scene["sponge"];
  view: View;
};

/** The frame shrinks on a log scale, and the target moves from the cube center to the near corner. */
function cubeCamera(view: View, dive: number): FilmV3Camera {
  return orbitCamera(
    {
      ...view,
      halfHeight: view.halfHeight * (deepHalfHeight / view.halfHeight) ** dive,
      tan: 0,
      target: scale(corner, dive),
    },
    6,
  );
}

function cubeScene(shot: CubeShot): FilmV3Scene {
  const camera = cubeCamera(shot.view, shot.dive);
  return {
    camera,
    faces: shot.faces,
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
  const camera = cubeCamera(view, 0);
  const rest = pixelOf(camera, [-1, firstOpening[1] * 2 - 1, firstOpening[2] * 2 - 1], size);
  const leave = easeInOutSine(progress(time, start + 0.6, start + 1.6));
  const angle = easeInOutSine(progress(time, start + 0.6, spread)) * Math.PI * 2 * 0.85;
  // The loop stays well inside the cube outline, so the probe is always the point on the surface.
  // Its size is in pixels of the 1080 line frame.
  const unit = size.height / 1080;
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

/**
Move 5: at the isometric view the two faces under the corner open like mirror doors around a fourth
face, hold, and close with the exact reverse. The camera is still and orthographic, and at unfold 0
the faces equal the render, so neither swap shows.
*/
/** The faces open for this long, hold for one beat, and close with the exact reverse. */
const unfoldSeconds = 1.6;
const unfoldHold = 0.5;

/**
The faces follow the zoom in toward the corner, which starts while they close: at the isometric view
the corner lies on the view axis, so the faces keep their center and only their radius grows.
*/
function fourthFaces(
  time: number,
  lift: number,
  { fold, halfHeight, size }: { fold: FourthFold; halfHeight: number; size: Size },
) {
  const closed = lift + 2 * unfoldSeconds + unfoldHold;
  const opening = easeInOutSine(progress(time, lift, lift + unfoldSeconds));
  const closing = easeInOutSine(progress(time, closed - unfoldSeconds, closed));
  return {
    center: [size.width / 2, size.height / 2],
    enabled: time >= lift - 0.5 && time < closed + 0.02,
    fold,
    radius: (hexagonRadius * size.height) / (2 * halfHeight),
    unfold: opening * (1 - closing),
  } satisfies FilmV3Scene["faces"];
}

const isoView: View = { ...iso, halfHeight: 2.9 };

// ---------- the study renderer: the endless pull back ----------

/**
Move 6. The pull back ends in a three-quarter view with lit faces, clear of the isometric symmetry,
and nearly level, so the top face of the giant is a thin band that fades into the sky above it.
*/
const pullbackView = { elevation: 7, yaw: -58 } as const;
/**
Where the corner of the giant ends on screen, in frame half heights from the center with y up: low
and right, so the words keep clear sky at the upper left.
*/
const cornerOnScreen = { x: 0.42, y: -0.25 } as const;
const spongeHalfSize = 3 ** 5;
/** One threefold zoom out takes this long at full speed. */
const pullbackPeriod = 2.4;
/**
The zoom out speeds up from rest over this long. The zoom in slows to rest the same way, so the turn
at the deepest point reads as one breath and not as a stop.
*/
const zoomOutSpeedUp = 1.2;
/** Detail floors, in first cube units: the cube keeps one or three levels of channels. */
export const detailFloors = { oneLevel: 0.19, threeLevels: 0.0214 } as const;

function zoomSpeed(elapsed: number, slowAfter: number): number {
  return (
    (smoothstep(0, zoomOutSpeedUp, elapsed) / pullbackPeriod) *
    mix(1, 0.4, smoothstep(slowAfter, slowAfter + 3, elapsed))
  );
}

/** Log base 3 of the zoom scale, integrated from the speed with the midpoint rule. */
function zoomLogAt(elapsed: number, slowAfter: number): number {
  if (elapsed <= 0) {
    return 0;
  }
  const steps = Math.ceil(elapsed * 240);
  const step = elapsed / steps;
  let sum = 0;
  for (let index = 0; index < steps; index += 1) {
    sum += zoomSpeed((index + 0.5) * step, slowAfter) * step;
  }
  return sum;
}

/**
The pull back camera at `renderScale`. It starts at the deepest point of the zoom in, with the near
corner at the frame center, and the frame scales about the corner while the camera turns and pans
the corner to `cornerOnScreen`.
*/
function pullbackCamera(time: number, dive: Dive, renderScale: number): FilmV3Camera {
  const turn = easeInOutSine(progress(time, dive.out, dive.out + 5));
  const angles = {
    elevation: mix(dive.from.elevation, pullbackView.elevation, turn),
    halfHeight: deepHalfHeight * renderScale,
    tan: 0,
    yaw: mix(dive.from.yaw, pullbackView.yaw, turn),
  };
  const centered = orbitCamera({ ...angles, target: corner }, 1);
  const pan = add(
    scale(centered.right, cornerOnScreen.x * angles.halfHeight * turn),
    scale(centered.up, cornerOnScreen.y * angles.halfHeight * turn),
  );
  return orbitCamera({ ...angles, target: add(corner, scale(pan, -1)) }, 120 * renderScale);
}

/**
The frame drops the whole number of threefold zooms, the same one for the shutter open and close,
so the zoom runs on with no loss of precision: the picture at scale `s` and at `3 s` is the same.
*/
function pullbackStudy(time: number, dive: Dive): IllusionStudyFrame {
  const slowAfter = dive.slowAt - dive.out;
  const zoomLog = zoomLogAt(time - dive.out, slowAfter);
  const whole = Math.floor(zoomLog);
  const cameraAt = (at: number) =>
    pullbackCamera(at, dive, 3 ** (zoomLogAt(at - dive.out, slowAfter) - whole));
  const renderScale = 3 ** (zoomLog - whole);
  const camera = cameraAt(time);
  const halfHeight = deepHalfHeight * renderScale;
  const light = keyLight(camera, 0.045 * renderScale, 1);
  // Depth haze in frame units, so it is the same at every scale. It starts 2.5 frame half heights
  // behind the corner, so the cube itself never takes more than about 2 percent, and it grows in
  // with the first zoom, so the swap frame has none, as in the film render.
  const hazeWidth = 0.5 * halfHeight;
  return {
    cameras: [cameraAt(time - halfShutter), cameraAt(time + halfShutter)],
    grain,
    grainStep: grainStepAt(time),
    haze: {
      clearing: { center: corner, edge: 1, halfSize: 1, radius: 1e9, veil: 0 },
      density: (0.45 / hazeWidth) * smoothstep(0, 1, zoomLog),
      start: camera.rayStart + 2.5 * halfHeight,
      width: hazeWidth,
    },
    light: {
      ambient: light.ambient,
      aoScale: light.aoScale,
      aoStrength: 1,
      direction: light.direction,
      key: light.key,
      // As in the film: no limit below the brightest possible shade.
      shadeLimit: light.ambient + light.key,
      shadowStrength: 1,
    },
    lines: { ink: haze.ink, strength: 0 },
    sampleGrid,
    scene: {
      corner,
      detailFloor: dive.detailFloor * 3 ** -whole,
      halfSize: spongeHalfSize,
      kind: "sponge",
      octant,
    },
    sky: haze.sky,
    tones: landingTones,
  };
}

// ---------- the layer stack ----------

function filmLayer(id: "film" | "film-shuffle", frame: FilmV3Frame, opacity: number): FilmV4Layer {
  return { frame, id, kind: "film", opacity };
}

function studyLayer(frame: IllusionStudyFrame, opacity: number): FilmV4Layer {
  return { frame, id: "study", kind: "study", opacity };
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

type Word = { at: number; text: string };

function rise(time: number, at: number): number {
  return 1 - (1 - progress(time, at, at + 0.45)) ** 5;
}

/** The end lines of the landing page, at the left over the pale haze. */
function endWords(time: number, lines: readonly Word[], address: Word): FilmV3Text[] {
  const ink = haze.ink;
  return [
    ...lines.map(({ at, text }, index) => ({
      align: "left" as const,
      cap: 84,
      fit: Infinity,
      color: ink,
      words: [{ rise: rise(time, at), text }],
      x: 150,
      y: 200 + index * 124,
    })),
    {
      align: "left",
      cap: 46,
      fit: Infinity,
      color: ink,
      words: [{ rise: rise(time, address.at), text: address.text }],
      x: 152,
      y: 540,
    },
  ];
}

function standardEnd(time: number, first: number, address: number): FilmV3Text[] {
  return endWords(
    time,
    [
      { at: first, text: "Same base." },
      { at: first + 0.75, text: "Your accounts." },
      { at: first + 1.5, text: "No magic." },
    ],
    { at: address, text: "samebase.com" },
  );
}

/** The half height of the cube camera after `dive` of the zoom in toward the corner. */
function divedHalfHeight(view: View, dive: number): number {
  return view.halfHeight * (deepHalfHeight / view.halfHeight) ** dive;
}

// ---------- variant A ----------

/**
A plays the music from the start to its groove end at 14 s and then from the lift at 17.5 s, so the
music never stops, and the faces open on the lift at 14 s. The mark holds one beat before it turns,
and every move starts as the one before it settles.
*/
const a = {
  turn: [0.5, 3.1],
  reveal: { end: 6.9, spread: 5.7, start: 3.3 },
  shuffle: 7.45,
  settle: 12.2,
  still: 13.5,
  lift: 14,
  dive: { start: 17.1, deep: 19.5, swap: 19.63, out: 19.8 },
  words: 29.25,
  address: 33.25,
} as const;

/** The shuffle of the v3 orbit, one second earlier. */
const shuffleMovesA = orbitMoves.map((move) => ({ ...move, at: move.at - 1 }));

function readViewA(time: number, turnStart: number): View {
  const turned = markTurn(time, turnStart, { elevation: 24, halfHeight: 2.5, yaw: -52 }, a.turn[1]);
  return {
    elevation: keyed(time, turned.elevation, [
      { at: a.turn[1], ease: easeInOutSine, to: 27, until: a.shuffle },
      { at: a.settle, ease: easeInLongOut, to: iso.elevation, until: a.still },
    ]),
    halfHeight: keyed(time, turned.halfHeight, [
      { at: a.settle, ease: easeInLongOut, to: isoView.halfHeight, until: a.still },
    ]),
    yaw: keyed(time, turned.yaw, [
      { at: a.turn[1], ease: easeInOutSine, to: -38, until: a.shuffle },
      { at: a.shuffle, ease: easeInOutSine, to: -42, until: a.settle },
      { at: a.settle, ease: easeInLongOut, to: iso.yaw, until: a.still },
    ]),
  };
}

function readCubeA(
  time: number,
  size: Size,
  mode: CubeShot["mode"],
  fold: FourthFold,
): FilmV3Scene {
  const view = readViewA(time, a.turn[0]);
  const dive = easeInOutSine(progress(time, a.dive.start, a.dive.deep));
  let sponge: FilmV3Scene["sponge"] = revealSponge(time, view, size, a.reveal);
  if (time >= a.settle) {
    sponge = {
      ...restSponge,
      openness: 1 - easeInOutCubic(progress(time, a.settle + 0.1, a.settle + 0.8)),
      revealRadius: fullRevealRadius,
    };
  }
  return cubeScene({
    dive,
    faces: fourthFaces(time, a.lift, { fold, halfHeight: divedHalfHeight(view, dive), size }),
    // The floor shadow fades with the opening faces and stays away: the giant has no floor.
    floor: 1 - easeInOutSine(progress(time, a.lift, a.lift + unfoldSeconds)),
    mode,
    shuffle: { depth: 3, fadePixels: 1.5, moveMinLevel: 0, ...readShuffle(time, shuffleMovesA) },
    sponge,
    view,
  });
}

function readFilmV4A(time: number, size: Size, fold: FourthFold): FilmV4Frame {
  const dive: Dive = {
    ...a.dive,
    detailFloor: detailFloors.oneLevel,
    from: isoView,
    slowAt: a.words - 1.25,
  };
  const cube = (mode: CubeShot["mode"]) => filmFrame((at) => readCubeA(at, size, mode, fold), time);
  return {
    // Move 3: the shuffled sponge draws the fully open cube while cells move, and every level makes
    // the same move at once. At rest it has the geometry of the fully open cube, so the handovers
    // to it and back are free of motion, but its normals and occlusion read only the cells near the
    // point, so each handover fades over six frames.
    layers: stackAt(time, [
      { fade: 0, from: 0, layer: (opacity) => filmLayer("film", cube("sponge"), opacity) },
      {
        fade: 0.1,
        from: a.shuffle - 0.05,
        layer: (opacity) => filmLayer("film-shuffle", cube("shuffle"), opacity),
      },
      {
        fade: 0.1,
        from: a.settle - 0.05,
        layer: (opacity) => filmLayer("film", cube("sponge"), opacity),
      },
      {
        fade: 0,
        from: a.dive.swap,
        layer: (opacity) => studyLayer(pullbackStudy(time, dive), opacity),
      },
    ]),
    outlines: [],
    overlay: { ink: haze.ink, pale: haze.sky[1] },
    texts: standardEnd(time, a.words, a.address),
    veil: 0,
  };
}

// ---------- variant B ----------

/**
B plays the music from the start to 3.5 s and then from the lift at 17.5 s, so the faces open on
the lift one beat after the turn: film time is track time minus 14 from the cut on.
*/
const b = {
  turn: [0.5, 3.1],
  lift: 3.5,
  dive: { start: 6.6, deep: 9, swap: 9.13, out: 9.3 },
  words: 18.75,
  address: 22.75,
} as const;

/** The mark turns straight to the isometric view, and the faces open one beat later. */
function readCubeB(time: number, size: Size, fold: FourthFold): FilmV3Scene {
  const view = markTurn(time, b.turn[0], isoView, b.turn[1]);
  const dive = easeInOutSine(progress(time, b.dive.start, b.dive.deep));
  return cubeScene({
    dive,
    faces: fourthFaces(time, b.lift, { fold, halfHeight: divedHalfHeight(view, dive), size }),
    floor: 1 - easeInOutSine(progress(time, b.lift, b.lift + unfoldSeconds)),
    mode: "sponge",
    shuffle: restShuffle,
    sponge: restSponge,
    view,
  });
}

function readFilmV4B(time: number, size: Size, fold: FourthFold): FilmV4Frame {
  const dive: Dive = {
    ...b.dive,
    detailFloor: detailFloors.oneLevel,
    from: isoView,
    slowAt: b.words - 1.25,
  };
  const cube = () => filmFrame((at) => readCubeB(at, size, fold), time);
  return {
    layers: stackAt(time, [
      { fade: 0, from: 0, layer: (opacity) => filmLayer("film", cube(), opacity) },
      {
        fade: 0,
        from: b.dive.swap,
        layer: (opacity) => studyLayer(pullbackStudy(time, dive), opacity),
      },
    ]),
    outlines: [],
    overlay: { ink: haze.ink, pale: haze.sky[1] },
    texts: standardEnd(time, b.words, b.address),
    veil: 0,
  };
}

// ---------- variant C ----------

/**
C plays the music from the start to 8.5 s and then from the lift at 17.5 s, so the zoom toward the
corner starts on the lift, and again from 25.5 s to 33.5 s, one phrase apart, so the words land on
the last phrase before the ring out.
*/
const c = {
  turn: [0.5, 3.1],
  reveal: { end: 8.3, spread: 7.1, start: 3.3 },
  settled: 8.7,
  dive: { start: 8.3, deep: 10.7, swap: 10.83, out: 11 },
  words: 17.25,
  address: 20.75,
} as const;

function readViewC(time: number): View {
  const turned = markTurn(time, c.turn[0], { elevation: 24, halfHeight: 2.5, yaw: -52 }, c.turn[1]);
  return {
    ...turned,
    elevation: keyed(time, turned.elevation, [
      { at: c.turn[1], ease: easeInOutSine, to: 27, until: c.settled },
    ]),
    yaw: keyed(time, turned.yaw, [
      { at: c.turn[1], ease: easeInOutSine, to: -40, until: c.settled },
    ]),
  };
}

function readCubeC(time: number, size: Size): FilmV3Scene {
  const view = readViewC(time);
  return cubeScene({
    dive: easeInOutSine(progress(time, c.dive.start, c.dive.deep)),
    faces: closedFaces,
    floor: 1 - easeInOutSine(progress(time, c.reveal.end - 0.8, c.settled)),
    mode: "sponge",
    shuffle: restShuffle,
    sponge: revealSponge(time, view, size, c.reveal),
    view,
  });
}

function readFilmV4C(time: number, size: Size): FilmV4Frame {
  const dive: Dive = {
    ...c.dive,
    detailFloor: detailFloors.threeLevels,
    from: readViewC(c.settled),
    slowAt: c.words - 1.25,
  };
  const cube = () => filmFrame((at) => readCubeC(at, size), time);
  return {
    layers: stackAt(time, [
      { fade: 0, from: 0, layer: (opacity) => filmLayer("film", cube(), opacity) },
      {
        fade: 0,
        from: c.dive.swap,
        layer: (opacity) => studyLayer(pullbackStudy(time, dive), opacity),
      },
    ]),
    outlines: [],
    overlay: { ink: haze.ink, pale: haze.sky[1] },
    texts: standardEnd(time, c.words, c.address),
    veil: 0,
  };
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
  return cubeScene({
    dive: easeInOutSine(progress(at, ...look.dive)),
    faces: closedFaces,
    floor: 1 - easeInOutSine(progress(at, look.settle[0], 16.3)),
    mode,
    shuffle: lookShuffle(at, lookFadePixels),
    sponge: { ...revealSponge(at, view, size, look.reveal), depth: lookDepth },
    view,
  });
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
      halfHeight,
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
    shuffle: lookShuffle(at, Math.max(lookFadePixels, fade * 0.0426 * sampleGrid * size.height)),
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

function readFilmV4Look(time: number, size: Size, style: LookStyleName): FilmV4Frame {
  const theme = lookThemeAt(style, time);
  const backdrop = lookBackdropWords(time, size, style);
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
    overlay: { ink: lineInk(style, 1, 21.5, 28.5), pale: theme.pale },
    texts: lookFrontWords(time, size, style),
    veil: smoothstep(29, 29.5, time) * (1 - smoothstep(34.4, 34.9, time)),
  };
}

/**
The big lines of the cube shots stand behind the object in two bands, one above and one below it,
so the object overlaps them. Each line fills the frame width, rises word by word as its move starts,
and sinks before the next one.
*/
const lookBandLines: readonly { at: number; rows: readonly [string, string]; until: number }[] = [
  { at: 3.4, rows: ["GitHub. Convex.", "Cloudflare."], until: 6.9 },
  { at: 7.6, rows: ["Run agents", "in parallel."], until: 10.9 },
  { at: 11.2, rows: ["Every PR gets", "its own preview."], until: 14.6 },
  { at: 37.4, rows: ["Same base.", "Your accounts. No magic."], until: 41.3 },
];

/** The star fills the middle of the frame, so its lines stand in front of it over the haze. */
const lookStarLines: readonly { at: number; text: string; until: number }[] = [
  { at: 29.5, text: "Delete your Samebase account.", until: 31.6 },
  { at: 31.8, text: "Your app doesn't notice.", until: 34.3 },
];

const lookAddress = { at: 39.8, until: 41.45 } as const;

/** The words of one line, each rising `step` seconds after the one before it. */
function risingWords(time: number, words: readonly string[], at: number, until: number, step: number) {
  return words.map((word, index) => ({
    rise: rise(time, at + index * step) - rise(time, until + index * 0.04),
    text: word,
  }));
}

function lookBackdropWords(
  time: number,
  { height, width }: Size,
  style: LookStyleName,
): FilmV3Text[] {
  return lookBandLines.flatMap(({ at, rows, until }) =>
    rows.map((row, index) => ({
      align: "center" as const,
      cap: 0.19 * height,
      color: lineInk(style, index === 0 ? 0 : 1, at, until),
      fit: 0.94 * width,
      words: risingWords(time, row.split(" "), at + index * 0.22, until + index * 0.08, 0.08),
      x: width / 2,
      y: (index === 0 ? 0.25 : 0.94) * height,
    })),
  );
}

function lookFrontWords(time: number, { height, width }: Size, style: LookStyleName): FilmV3Text[] {
  return [
    ...lookStarLines.map(({ at, text, until }) => ({
      align: "center" as const,
      cap: 0.13 * height,
      color: lineInk(style, 1, at, until),
      fit: 0.94 * width,
      words: risingWords(time, text.split(" "), at, until, 0.08),
      x: width / 2,
      y: 0.93 * height,
    })),
    {
      align: "center",
      cap: 0.035 * height,
      color: lineInk(style, 1, lookAddress.at, lookAddress.until),
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

function lookOutlines(time: number, { height, width }: Size): FilmV4Outline[] {
  if (time < look.dive[1] || time >= look.star[0]) {
    return [];
  }
  const zoom = lookZoomAt(time);
  return lookLabels.map(({ label, level }) => {
    // In frame heights: a cell of half size 3^level at the half height of the zoom.
    const radius = (hexagonRadius * 3 ** (level - zoom)) / (2 * deepHalfHeight);
    const fadeIn = 1 - smoothstep(0.42, 0.5, radius);
    return {
      // The label grows and shrinks with its outline.
      cap: 0.28 * radius * height,
      drawn: easeInOutSine(progress(-radius, -0.5, -0.34)),
      label,
      labelOpacity: fadeIn * smoothstep(0.07, 0.11, radius),
      opacity: fadeIn * smoothstep(0.015, 0.03, radius),
      radius: radius * height,
      x: width / 2,
      y: height / 2,
    };
  });
}

export function readFilmV4Frame(
  variant: FilmV4Variant,
  time: number,
  size: Size,
  fold: FourthFold,
  style: LookStyleName,
): FilmV4Frame {
  switch (variant) {
    case "a":
      return readFilmV4A(time, size, fold);
    case "b":
      return readFilmV4B(time, size, fold);
    case "c":
      return readFilmV4C(time, size);
    case "look":
      return readFilmV4Look(time, size, style);
    default:
      return variant satisfies never;
  }
}
