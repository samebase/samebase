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

The cube or hole move is in no cut: a Menger cube and its mold look different at the key view,
because the mold shows the ends of its channels, which the cube hides.
*/
export type FilmV4Variant = "a" | "b" | "c";

export const filmV4Seconds = { a: 42, b: 32, c: 27 } as const satisfies Record<
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

/** Move 1: head on, the solid reads as the flat mark, and a turn shows that it is solid. */
function markTurn(time: number, turnStart: number, to: View, turnEnd: number): View {
  const turn = easeInOutSine(progress(time, turnStart, turnEnd));
  return {
    elevation: mix(0, to.elevation, turn),
    halfHeight: mix(2.8, to.halfHeight, turn),
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
  const x = mix(rest.x, size.width / 2 + Math.sin(angle * 2) * 150 - 60, leave);
  const y = mix(rest.y, size.height / 2 - Math.sin(angle) * 120 + 20, leave);
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
function fourthFaces(time: number, lift: number, closed: number, halfHeight: number, size: Size) {
  const opening = easeInOutSine(progress(time, lift, lift + 1.6));
  const closing = easeInOutSine(progress(time, closed - 1.6, closed));
  return {
    center: [size.width / 2, size.height / 2],
    enabled: time >= lift - 0.5 && time < closed + 0.02,
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

// ---------- variant A ----------

/** A follows the v3.5 beats: the shuffle ends on the settle, and the faces open on the music lift. */
const a = {
  turn: [2, 4.6],
  reveal: { end: 8.4, spread: 7.2, start: 4.8 },
  shuffle: 8.45,
  settle: 13.2,
  still: 14.5,
  lift: 17.5,
  closed: 21.44,
  dive: { start: 21.5, deep: 23.9, swap: 24.02, out: 24.2 },
  words: 32.75,
  address: 36.75,
} as const;

function readViewA(time: number): View {
  const turned = markTurn(time, a.turn[0], { elevation: 24, halfHeight: 2.5, yaw: -52 }, a.turn[1]);
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

function readCubeA(time: number, size: Size, mode: CubeShot["mode"]): FilmV3Scene {
  const view = readViewA(time);
  let sponge: FilmV3Scene["sponge"] = revealSponge(time, view, size, a.reveal);
  if (time >= a.settle) {
    sponge = {
      ...restSponge,
      openness: 1 - easeInOutCubic(progress(time, a.settle + 0.1, 14)),
      revealRadius: fullRevealRadius,
    };
  }
  return cubeScene({
    dive: easeInOutSine(progress(time, a.dive.start, a.dive.deep)),
    faces: fourthFaces(time, a.lift, a.closed, view.halfHeight, size),
    // The floor shadow fades with the opening faces and stays away: the giant has no floor.
    floor: 1 - easeInOutSine(progress(time, a.lift, a.lift + 1.6)),
    mode,
    shuffle: { depth: 3, moveMinLevel: 0, ...readShuffle(time, orbitMoves) },
    sponge,
    view,
  });
}

function readFilmV4A(time: number, size: Size): FilmV4Frame {
  const dive: Dive = {
    ...a.dive,
    detailFloor: detailFloors.oneLevel,
    from: isoView,
    slowAt: a.words - 1.25,
  };
  const cube = (mode: CubeShot["mode"]) => filmFrame((at) => readCubeA(at, size, mode), time);
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
B cuts the music from the groove at 4 s straight to its fall at 14 s, so the faces open on the lift
of the track at 7.5 s: film time is track time minus 10 from the cut on.
*/
const b = {
  turn: [2, 4.6],
  lift: 7.5,
  closed: 11.44,
  dive: { start: 11.5, deep: 13.9, swap: 14.02, out: 14.2 },
  words: 22.75,
  address: 26.75,
} as const;

/** The mark turns straight to the isometric view and holds still through the fall of the music. */
function readCubeB(time: number, size: Size): FilmV3Scene {
  const view = markTurn(time, b.turn[0], isoView, b.turn[1]);
  return cubeScene({
    dive: easeInOutSine(progress(time, b.dive.start, b.dive.deep)),
    faces: fourthFaces(time, b.lift, b.closed, view.halfHeight, size),
    floor: 1 - easeInOutSine(progress(time, b.lift, b.lift + 1.6)),
    mode: "sponge",
    shuffle: restShuffle,
    sponge: restSponge,
    view,
  });
}

function readFilmV4B(time: number, size: Size): FilmV4Frame {
  const dive: Dive = {
    ...b.dive,
    detailFloor: detailFloors.oneLevel,
    from: isoView,
    slowAt: b.words - 1.25,
  };
  const cube = () => filmFrame((at) => readCubeB(at, size), time);
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
C cuts the music from the groove at 7 s to its fall at 14 s, so the pull back speeds up on the lift
of the track at 10.5 s, and again from 25.5 s to 33.5 s, one phrase apart, so the words land on the
last phrase before the ring out.
*/
const c = {
  turn: [2, 4.6],
  reveal: { end: 9.8, spread: 8.6, start: 4.8 },
  settled: 10.2,
  dive: { start: 10.2, deep: 12.6, swap: 12.72, out: 12.9 },
  words: 19.25,
  address: 22.75,
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

export function readFilmV4Frame(variant: FilmV4Variant, time: number, size: Size): FilmV4Frame {
  switch (variant) {
    case "a":
      return readFilmV4A(time, size);
    case "b":
      return readFilmV4B(time, size);
    case "c":
      return readFilmV4C(time, size);
    default:
      return variant satisfies never;
  }
}
