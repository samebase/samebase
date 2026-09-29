import type { IllusionStudyFrame } from "../illusion-studies/illusionStudyRenderer";
import {
  add,
  easeInLongOut,
  easeInOutCubic,
  easeInOutSine,
  type FilmV3Camera,
  type FilmV3Frame,
  type FilmV3Scene,
  type FilmV3Text,
  floorStrengthAt,
  hexagonRadius,
  isometricElevation,
  keyed,
  keyLight,
  landingTones,
  mix,
  orbitCamera,
  orbitMoves,
  palettes,
  probeAt,
  progress,
  readShuffle,
  scale,
  smoothstep,
  tesseractJoints,
  type Vector3,
} from "../samebase-film-v3/filmV3Timeline";

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

export const filmV4Seconds = { a: 38.5, b: 28, c: 25, look: 30 } as const satisfies Record<
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

export type FilmV4Frame = { layers: readonly FilmV4Layer[]; texts: readonly FilmV3Text[] };

type Size = { height: number; width: number };
type View = { elevation: number; halfHeight: number; yaw: number };

const sampleGrid = 4;
const halfShutter = 0.25 / filmV4Fps;
const grain = 0.024;
const haze = palettes.haze;
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
      color: ink,
      words: [{ rise: rise(time, at), text }],
      x: 150,
      y: 200 + index * 124,
    })),
    {
      align: "left",
      cap: 46,
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
    shuffle: { depth: 3, moveMinLevel: 0, ...readShuffle(time, shuffleMovesA) },
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
    texts: standardEnd(time, a.words, a.address),
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
    texts: standardEnd(time, b.words, b.address),
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
    texts: standardEnd(time, c.words, c.address),
  };
}

// ---------- variant look: look again ----------

/**
Look plays the music of A up to the end of its phrase at 33.5 s, so the loop starts the track again
on a phrase. The moves up to the zoom out are those of A, and the mark holds only 0.3 s, because the
landing at the end holds 0.2 s before the loop.
*/
const look = {
  turnStart: 0.3,
  /** The camera starts to turn back to the front view while the zoom out goes on. */
  turnBack: 22.6,
  /** The camera lands on the flat mark of the first frame and holds it to the end. */
  landed: 29.8,
} as const;

/**
The giant: a Menger sponge two levels above the cube, whose (-x, +y, +z) corner cell is the cube.
At the front view with the frame half height of the mark, its front face is the flat mark.
*/
const giant = { center: add(corner, scale(octant, 9)), halfSize: 9 } as const;

/** Threefold zooms from the deepest point to the frame of the mark around the giant. */
const lookZoomEnd = Math.log((markHalfHeight * giant.halfSize) / deepHalfHeight) / Math.log(3);

/**
Levels of the giant close in turn as they shrink, each opening to its center: first the channels of
the cube size cells, then those of the next level, so the landing shows the level of the mark only.
The spans are in threefold zooms.
*/
const giantCloses = { cells: [1.9, 2.6], blocks: [2.75, 3.3] } as const;

/**
The zoom speed after `elapsed` seconds of the zoom out: it speeds up from rest as in A and slows to
rest over the last 3.5 seconds, where the camera lands on the mark.
*/
function lookZoomSpeed(elapsed: number, span: number): number {
  return smoothstep(0, zoomOutSpeedUp, elapsed) * (1 - smoothstep(span - 3.5, span, elapsed));
}

/** Integral of the zoom speed with the midpoint rule. */
function lookZoomIntegral(elapsed: number, span: number): number {
  const steps = Math.max(Math.ceil(elapsed * 240), 1);
  const step = elapsed / steps;
  let sum = 0;
  for (let index = 0; index < steps; index += 1) {
    sum += lookZoomSpeed((index + 0.5) * step, span) * step;
  }
  return sum;
}

const lookZoomSpan = look.landed - a.dive.out;
const lookZoomTotal = lookZoomIntegral(lookZoomSpan, lookZoomSpan);

/** Threefold zooms out since the deepest point. */
function lookZoomAt(time: number): number {
  const elapsed = Math.min(time - a.dive.out, lookZoomSpan);
  return elapsed <= 0 ? 0 : (lookZoomEnd * lookZoomIntegral(elapsed, lookZoomSpan)) / lookZoomTotal;
}

/**
One frame of the zoom out is in giant units while the giant has more levels than the mark, and in
cube units from the frame where only the level of the mark is left: there the giant and the rest
cube scaled by 9 about the giant center are the same scene, so the change does not show.
*/
function lookPullScene(at: number, zoomAtFrame: number): FilmV3Scene {
  const zoom = lookZoomAt(at);
  const turn = easeInOutSine(progress(at, look.turnBack, look.landed));
  const halfHeight = deepHalfHeight * 3 ** zoom;
  const target = add(scale(corner, 1 - turn), scale(giant.center, turn));
  const inMark = zoomAtFrame >= giantCloses.blocks[1];
  const origin = inMark ? giant.center : ([0, 0, 0] as const);
  const unit = inMark ? giant.halfSize : 1;
  const camera = orbitCamera(
    {
      elevation: mix(iso.elevation, 0, turn),
      halfHeight: halfHeight / unit,
      tan: 0,
      target: scale(add(target, scale(origin, -1)), 1 / unit),
      yaw: mix(iso.yaw, 0, turn),
    },
    (6 * giant.halfSize) / unit,
  );
  const cellsOpen = 1 - easeInOutSine(progress(zoomAtFrame, ...giantCloses.cells));
  const blocksOpen = 1 - easeInOutSine(progress(zoomAtFrame, ...giantCloses.blocks));
  const sponge: FilmV3Scene["sponge"] = inMark
    ? restSponge
    : {
        ...restSponge,
        anchorToProbe: 0,
        center: giant.center,
        halfSize: giant.halfSize,
        revealRadius: fullRevealRadius,
        // While the cube size cells close, the two levels above them stay open; then only the
        // level of the mark stays open while the next one closes.
        ...(cellsOpen > 0
          ? { depth: 3, openness: cellsOpen, restDepth: 2 }
          : { depth: 2, openness: blocksOpen, restDepth: 1 }),
      };
  return {
    camera,
    faces: closedFaces,
    floor: { height: -1, strength: 0 },
    haze: { clear: 1e6, density: 0, hidden: 2e6, start: 0 },
    // The shadow march scales with the frame once the frame is larger than the mark.
    light: keyLight(camera, (0.045 * Math.max(1, halfHeight / markHalfHeight)) / unit, 1),
    mode: "sponge",
    shuffle: restShuffle,
    sponge,
    tesseract: unusedTesseract,
    tones: landingTones,
  };
}

function readCubeLook(
  at: number,
  frameTime: number,
  size: Size,
  mode: CubeShot["mode"],
  fold: FourthFold,
): FilmV3Scene {
  if (frameTime >= look.landed) {
    return readCubeLook(0, 0, size, mode, fold);
  }
  if (frameTime >= a.dive.swap) {
    return lookPullScene(at, lookZoomAt(frameTime));
  }
  const view = readViewA(at, look.turnStart);
  const dive = easeInOutSine(progress(at, a.dive.start, a.dive.deep));
  let sponge: FilmV3Scene["sponge"] = revealSponge(at, view, size, a.reveal);
  if (at >= a.settle) {
    sponge = {
      ...restSponge,
      anchorToProbe: 0,
      openness: 1 - easeInOutCubic(progress(at, a.settle + 0.1, a.settle + 0.8)),
      revealRadius: fullRevealRadius,
    };
  }
  return cubeScene({
    dive,
    faces: fourthFaces(at, a.lift, { fold, halfHeight: divedHalfHeight(view, dive), size }),
    floor: 1 - easeInOutSine(progress(at, a.lift, a.lift + unfoldSeconds)),
    mode,
    shuffle: { depth: 3, moveMinLevel: 0, ...readShuffle(at, shuffleMovesA) },
    sponge,
    view,
  });
}

function readFilmV4Look(time: number, size: Size, fold: FourthFold): FilmV4Frame {
  const cube = (mode: CubeShot["mode"]) => {
    const frame = filmFrame((at) => readCubeLook(at, time, size, mode, fold), time);
    // The landing is the first frame, grain included.
    return time >= look.landed ? { ...frame, grainStep: grainStepAt(0) } : frame;
  };
  return {
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
    ]),
    texts: [],
  };
}

export function readFilmV4Frame(
  variant: FilmV4Variant,
  time: number,
  size: Size,
  fold: FourthFold,
): FilmV4Frame {
  switch (variant) {
    case "a":
      return readFilmV4A(time, size, fold);
    case "b":
      return readFilmV4B(time, size, fold);
    case "c":
      return readFilmV4C(time, size);
    case "look":
      return readFilmV4Look(time, size, fold);
    default:
      return variant satisfies never;
  }
}
