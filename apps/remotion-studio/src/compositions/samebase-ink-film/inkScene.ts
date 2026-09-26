/**
Paints the Canvas 2D layers of one film frame. Every element is projected to the screen first and
then drawn, so line widths stay the same at every zoom, as if each frame were a new drawing.

- `back`: white ground, multiplied washes behind the giant (sky, sun, far hills).
- `front`: transparent washes in front of the giant (ridge, clouds, the mark, the cube).
- `ink`: transparent ink, pencil, and lettering on top of everything.
*/
import {
  circlePoints,
  createCanvas,
  handLetter,
  hatchPolygon,
  inkLine,
  inkPolygon,
  inkStroke,
  PALETTE,
  partialPath,
  pencil,
  polygonPath,
  wash,
  type Canvas2D,
} from "./inkBrush";
import {
  add,
  clamp,
  easeInOut,
  easeOut,
  length,
  lerp,
  mix,
  pulse,
  ramp,
  ray,
  rng,
  rotate,
  scale,
  smoothstep,
  sub,
  vnoise,
  wobble,
  type Point,
} from "./inkMath";
import { MIST_DEPTH } from "./inkSponge";
import {
  boilIndex,
  layerCamera,
  LEG_LENGTH,
  MARK_HOME,
  MARK_SIZE,
  project,
  readCamera,
  readCloudParting,
  readCubeLabels,
  readCubePose,
  readEndCamera,
  readEndCard,
  readLandscapeReveal,
  readMarkPose,
  readMarkWalkPosition,
  readWipe,
  RIDGE,
  ridgeY,
  TIMES,
  type Camera,
  type CubePose,
  type MarkPose,
  type SidesPose,
} from "./inkTimeline";

export type SceneLayers = { back: Canvas2D; front: Canvas2D; ink: Canvas2D };

export function createSceneLayers(): SceneLayers {
  return { back: createCanvas(), front: createCanvas(), ink: createCanvas() };
}

const INK_LINE = "#262E34";
const CLOUD_FILL = "rgba(255,253,247,0.98)";

/** Clips to a wobbly disc that grows like a wash spreading from a brush touch. */
function clipBloom(
  context: CanvasRenderingContext2D,
  center: Point,
  radius: number,
  seed: number,
): void {
  const edge = wobble(circlePoints(center, Math.max(1, radius), 72, 0.12, seed), true, {
    amplitude: Math.min(18, radius * 0.05),
    seed,
    step: 14,
    wavelength: 120,
  });
  polygonPath(context, edge);
  context.clip();
}

// ----- the mark -----

/** A point of the mark body in its own frame: u and v in [-0.5, 0.5], squashed about its feet. */
function markPoint(pose: MarkPose, u: number, v: number): Point {
  const local: Point = [u * pose.size * pose.squash[0], (v - 0.5) * pose.size * pose.squash[1]];
  const turned = rotate(local, pose.angle);
  return [pose.center[0] + turned[0], pose.center[1] + pose.size / 2 + turned[1]];
}

function markSquare(pose: MarkPose, half: number): Point[] {
  return [
    markPoint(pose, -half, -half),
    markPoint(pose, half, -half),
    markPoint(pose, half, half),
    markPoint(pose, -half, half),
  ];
}

function closedPath(points: readonly Point[]): Point[] {
  const first = points[0];
  return first ? [...points, first] : [];
}

function drawMark(
  layers: SceneLayers,
  camera: Camera,
  pose: MarkPose,
  boil: number,
  walkGround: boolean,
): void {
  const front = layers.front.context;
  const ink = layers.ink.context;
  const outer = markSquare(pose, 0.5).map((point) => project(camera, point));
  const inner = markSquare(pose, pose.hole / 2).map((point) => project(camera, point));
  const centroid = scale(
    outer.reduce((sum, point) => add(sum, point), [0, 0]),
    0.25,
  );
  const screenSize = pose.size * camera.zoom;
  const lineScale = clamp(screenSize / 95, 0.95, 2.6);
  const washSeed = 21 + (boil % 5) * 7;
  if (pose.bloom > 0) {
    front.save();
    if (pose.bloom < 1) {
      clipBloom(front, centroid, pose.bloom * screenSize * 0.9, 5);
    }
    wash(front, outer, pose.recolor < 1 ? pose.previousColor : pose.color, {
      body: 0.86,
      holes: [inner],
      mottle: 0.6,
      origin: centroid,
      seed: washSeed,
      wobbleAmplitude: 1.2 * lineScale,
    });
    if (pose.recolor < 1) {
      front.save();
      clipBloom(front, outer[0] ?? centroid, pose.recolor * screenSize * 1.6, 9);
      wash(front, outer, pose.color, {
        body: 0.9,
        holes: [inner],
        mottle: 0.6,
        origin: centroid,
        seed: washSeed + 3,
        wobbleAmplitude: 1.2 * lineScale,
      });
      front.restore();
    }
    front.restore();
  }
  const lineSeed = 61 + boil * 3;
  const outline = {
    amplitude: 0.5 * lineScale,
    color: INK_LINE,
    seed: lineSeed,
    wavelength: 40 * lineScale,
    width: 2.6 * lineScale,
  };
  if (pose.outline >= 1) {
    inkPolygon(ink, outer, outline);
  } else if (pose.outline > 0) {
    inkStroke(
      ink,
      wobble(partialPath(closedPath(outer), pose.outline), false, {
        amplitude: 0.5 * lineScale,
        seed: lineSeed,
      }),
      { ...outline, taper: 0.05 },
    );
  }
  if (pose.holeOutline >= 1) {
    inkPolygon(ink, inner, { ...outline, seed: lineSeed + 1, width: 1.9 * lineScale });
  } else if (pose.holeOutline > 0) {
    inkStroke(
      ink,
      wobble(partialPath(closedPath(inner), pose.holeOutline), false, {
        amplitude: 0.4 * lineScale,
        seed: lineSeed + 1,
      }),
      { ...outline, taper: 0.05, width: 1.9 * lineScale },
    );
  }
  if (pose.legs > 0.01) {
    const bottomLeft = markPoint(pose, -0.5, 0.5);
    const bottomRight = markPoint(pose, 0.5, 0.5);
    const hips = [mix(bottomLeft, bottomRight, 0.26), mix(bottomLeft, bottomRight, 0.74)];
    const legLength = (LEG_LENGTH / MARK_SIZE) * pose.size * pose.legs;
    const stride = 0.28 * pose.size;
    const toeLength = 0.16 * pose.size * pose.legs;
    hips.forEach((hip, index) => {
      let footX = hip[0] + (index === 0 ? -0.08 : 0.08) * pose.size * pose.legs;
      let lift = 0;
      if (pose.step !== null) {
        const whole = Math.floor(pose.step);
        const fraction = pose.step - whole;
        const moving = (whole + index) % 2 === 0;
        const swing = moving ? lerp(-1, 1, easeInOut(fraction)) : lerp(1, -1, fraction);
        footX = hip[0] + (swing * stride) / 2;
        lift = moving ? 0.12 * pose.size * Math.sin(Math.PI * fraction) : 0;
      }
      const groundY = walkGround ? ridgeY(footX) : hip[1] + legLength;
      const footY = Math.min(groundY, hip[1] + legLength * 1.15) - lift;
      const foot: Point = [footX, footY];
      const knee = mix(hip, foot, 0.5);
      const toe: Point = [foot[0] + (index === 0 ? -toeLength : toeLength), foot[1] + 0.5];
      const points = [hip, knee, foot].map((point) => project(camera, point));
      inkLine(ink, points, {
        amplitude: 0.3,
        color: INK_LINE,
        seed: lineSeed + 5 + index,
        taper: 0,
        width: 3.1 * lineScale,
      });
      inkLine(
        ink,
        [foot, toe].map((point) => project(camera, point)),
        {
          amplitude: 0.2,
          color: INK_LINE,
          seed: lineSeed + 8 + index,
          taper: 0,
          width: 3 * lineScale,
        },
      );
    });
  }
}

/** Droplets flicked from the brush with each new colour. They stay on the paper. */
const DROPLETS = (() => {
  const random = rng(808);
  const flicks: readonly [number, string][] = [
    [3.05, PALETTE.slateMid],
    [4.55, PALETTE.teal],
    [7.05, PALETTE.ochre],
    [9.05, PALETTE.ochre],
    [10.05, PALETTE.teal],
    [16.15, PALETTE.clay],
    [17.05, PALETTE.rose],
  ];
  return flicks.flatMap(([start, color]) =>
    Array.from({ length: 4 }, () => {
      const angle = random() * Math.PI * 2;
      const distance = 40 + random() * 30;
      const at: Point = [
        MARK_HOME[0] + Math.cos(angle) * distance * 1.6,
        MARK_HOME[1] + Math.sin(angle) * distance * 0.9,
      ];
      return { at, color, r: 0.45 + random() * 1.3, start: start + random() * 0.12 };
    }),
  );
})();

function drawDroplets(layers: SceneLayers, camera: Camera, time: number): void {
  const front = layers.front.context;
  const fade = 1 - ramp(time, TIMES.walk, 0.8);
  front.save();
  front.globalCompositeOperation = "multiply";
  for (const droplet of DROPLETS) {
    if (time < droplet.start) {
      continue;
    }
    const center = project(camera, droplet.at);
    const radius =
      droplet.r * camera.zoom * clamp(easeOut(ramp(time, droplet.start, 0.12)) * 1.15, 0, 1);
    if (radius < 0.5) {
      continue;
    }
    const red = parseInt(droplet.color.slice(1, 3), 16);
    const green = parseInt(droplet.color.slice(3, 5), 16);
    const blue = parseInt(droplet.color.slice(5, 7), 16);
    const tone = (alpha: number) => `rgba(${red},${green},${blue},${alpha * fade})`;
    const gradient = front.createRadialGradient(
      center[0],
      center[1],
      0,
      center[0],
      center[1],
      radius,
    );
    gradient.addColorStop(0, tone(0.45));
    gradient.addColorStop(0.72, tone(0.6));
    gradient.addColorStop(0.92, tone(0.95));
    gradient.addColorStop(1, tone(0));
    front.fillStyle = gradient;
    front.beginPath();
    front.ellipse(center[0], center[1], radius, radius * 0.9, droplet.r, 0, Math.PI * 2);
    front.fill();
  }
  front.restore();
}

// ----- the cube and the flat picture -----

type Vector3 = [number, number, number];

const CUBE_FACES: readonly {
  color: string;
  e1: Vector3;
  e2: Vector3;
  normal: Vector3;
  origin: Vector3;
}[] = [
  {
    color: PALETTE.ochre,
    e1: [1, 0, 0],
    e2: [0, 0, 1],
    normal: [0, 1, 0],
    origin: [-0.5, 0.5, -0.5],
  },
  {
    color: PALETTE.teal,
    e1: [0, 0, 1],
    e2: [0, 1, 0],
    normal: [-1, 0, 0],
    origin: [-0.5, -0.5, -0.5],
  },
  {
    color: PALETTE.slateMid,
    e1: [1, 0, 0],
    e2: [0, 1, 0],
    normal: [0, 0, 1],
    origin: [-0.5, -0.5, 0.5],
  },
];

function rotateCube(pose: CubePose, point: Vector3): Vector3 {
  const [x, y, z] = point;
  const cy = Math.cos(pose.yaw);
  const sy = Math.sin(pose.yaw);
  const xr = x * cy + z * sy;
  const zr = -x * sy + z * cy;
  const cp = Math.cos(pose.pitch);
  const sp = Math.sin(pose.pitch);
  return [xr, y * cp - zr * sp, y * sp + zr * cp];
}

function cubeScreen(camera: Camera, pose: CubePose, point: Vector3): Point {
  const [x, y, z] = rotateCube(pose, point);
  const depth = 1 / (1 - pose.perspective * z);
  return project(camera, [
    MARK_HOME[0] + x * MARK_SIZE * depth,
    MARK_HOME[1] - pose.lift - y * MARK_SIZE * depth,
  ]);
}

function facePoint(face: (typeof CUBE_FACES)[number], a: number, b: number): Vector3 {
  return [
    face.origin[0] + face.e1[0] * a + face.e2[0] * b,
    face.origin[1] + face.e1[1] * a + face.e2[1] * b,
    face.origin[2] + face.e1[2] * a + face.e2[2] * b,
  ];
}

function faceQuad(face: (typeof CUBE_FACES)[number], low: number, high: number): Vector3[] {
  return [
    facePoint(face, low, low),
    facePoint(face, high, low),
    facePoint(face, high, high),
    facePoint(face, low, high),
  ];
}

function drawConstructionCircle(
  ink: CanvasRenderingContext2D,
  center: Point,
  radius: number,
  progress: number,
  seed: number,
): void {
  if (progress <= 0) {
    return;
  }
  const circle = circlePoints(center, radius, 160, 0, seed);
  const loop = [...circle, ...circle.slice(0, 12)];
  pencil(
    ink,
    wobble(partialPath(loop, progress), false, { amplitude: 1.6, seed, wavelength: 90 }),
    { alpha: 0.28, seed: seed + 1, width: 1.2 },
  );
  pencil(
    ink,
    partialPath([add(center, [-radius * 1.08, 0]), add(center, [radius * 1.08, 0])], progress),
    { alpha: 0.14, seed: seed + 2 },
  );
  pencil(
    ink,
    partialPath([add(center, [0, -radius * 1.08]), add(center, [0, radius * 1.08])], progress),
    { alpha: 0.14, seed: seed + 3 },
  );
}

function drawCube(
  layers: SceneLayers,
  camera: Camera,
  pose: CubePose,
  boil: number,
  time: number,
): void {
  const front = layers.front.context;
  const ink = layers.ink.context;
  const lineScale = clamp((MARK_SIZE * camera.zoom) / 95, 1, 2.6);
  const lineSeed = 71 + boil * 3;
  const center = project(camera, [MARK_HOME[0], MARK_HOME[1] - pose.lift]);
  drawConstructionCircle(ink, center, 0.816 * MARK_SIZE * camera.zoom * 1.3, pose.circle, 17);
  const visible = CUBE_FACES.map((face) => rotateCube(pose, face.normal)[2]);
  CUBE_FACES.forEach((face, index) => {
    const facing = visible[index] ?? 0;
    if (facing <= 0.02) {
      return;
    }
    const outer = faceQuad(face, 0, 1).map((point) => cubeScreen(camera, pose, point));
    const inner = faceQuad(face, 1 / 3, 2 / 3).map((point) => cubeScreen(camera, pose, point));
    const paint = index === 2 ? 1 : (pose.paint[index] ?? 0);
    const centroid = scale(
      outer.reduce((sum, point) => add(sum, point), [0, 0]),
      0.25,
    );
    if (paint > 0) {
      front.save();
      if (paint < 1) {
        clipBloom(front, centroid, paint * MARK_SIZE * camera.zoom * 1.1, 30 + index);
      }
      // The front face was the ochre mark: it floods to slate as the cube turns.
      const color =
        index === 2 && time < TIMES.cube + 0.5
          ? time < TIMES.cube + 0.15
            ? PALETTE.ochre
            : PALETTE.slateMid
          : face.color;
      wash(front, outer, color, {
        body: 0.84,
        holes: [inner],
        mottle: 0.6,
        origin: centroid,
        seed: 40 + index * 5 + (boil % 4),
        wobbleAmplitude: 1.3 * lineScale,
      });
      if (index === 1) {
        // The left face gets a darker glaze toward its lower edge.
        wash(
          front,
          [
            mix(outer[0] ?? centroid, outer[3] ?? centroid, 0.5),
            mix(outer[1] ?? centroid, outer[2] ?? centroid, 0.5),
            outer[2] ?? centroid,
            outer[3] ?? centroid,
          ].reverse(),
          PALETTE.teal,
          { body: 0.2, holes: [inner], mottle: 0, seed: 45 },
        );
      }
      front.restore();
    }
    const edgeAlpha = clamp(facing * 6);
    if (index === 2 || paint >= 1) {
      inkPolygon(ink, outer, {
        alpha: 0.95 * edgeAlpha,
        amplitude: 0.5 * lineScale,
        color: INK_LINE,
        seed: lineSeed + index * 11,
        wavelength: 50 * lineScale,
        width: 2.7 * lineScale,
      });
      inkPolygon(ink, inner, {
        alpha: 0.95 * edgeAlpha,
        amplitude: 0.4 * lineScale,
        color: INK_LINE,
        seed: lineSeed + index * 11 + 1,
        wavelength: 40 * lineScale,
        width: 2 * lineScale,
      });
    } else {
      pencil(
        ink,
        wobble(partialPath(closedPath(outer), pose.pencil), false, {
          amplitude: 1.2,
          seed: 80 + index,
        }),
        { alpha: 0.4 * edgeAlpha, seed: 81 + index, width: 1.4 },
      );
      if (paint > 0) {
        inkStroke(
          ink,
          wobble(partialPath(closedPath(outer), paint), false, {
            amplitude: 0.5 * lineScale,
            seed: lineSeed + index * 11,
          }),
          {
            alpha: 0.95 * edgeAlpha,
            color: INK_LINE,
            seed: lineSeed + index,
            taper: 0.05,
            width: 2.7 * lineScale,
          },
        );
        inkStroke(
          ink,
          wobble(partialPath(closedPath(inner), paint), false, {
            amplitude: 0.4 * lineScale,
            seed: lineSeed + index * 11 + 1,
          }),
          {
            alpha: 0.95 * edgeAlpha,
            color: INK_LINE,
            seed: lineSeed + index + 1,
            taper: 0.05,
            width: 2 * lineScale,
          },
        );
      }
    }
    if (index === 2 && pose.hatch > 0) {
      hatchPolygon(ink, outer, {
        alpha: 0.5,
        angle: 58,
        color: INK_LINE,
        gap: 7.5 * lineScale,
        holes: [inner],
        reveal: pose.hatch,
        seed: 91 + (boil % 3),
        width: 1.3 * lineScale,
      });
    }
  });
}

/** Keeps the part of a convex polygon on one side of the line dot(point - origin, normal) = offset. */
function clipHalfPlane(
  polygon: readonly Point[],
  origin: Point,
  normal: Point,
  offset: number,
  keepInside: boolean,
): Point[] {
  const side = (point: Point) => {
    const value = (point[0] - origin[0]) * normal[0] + (point[1] - origin[1]) * normal[1] - offset;
    return keepInside ? -value : value;
  };
  const out: Point[] = [];
  polygon.forEach((point, index) => {
    const next = polygon[(index + 1) % polygon.length] ?? point;
    const a = side(point);
    const b = side(next);
    if (a >= 0) {
      out.push(point);
    }
    if (a >= 0 !== b >= 0) {
      out.push(mix(point, next, a / (a - b)));
    }
  });
  return out;
}

function sideQuads(center: Point, radius: number, start: number, width: number) {
  const u = ray(start);
  const v = ray(start + width);
  const at = (a: number, b: number): Point => [
    center[0] + radius * (a * u[0] + b * v[0]),
    center[1] + radius * (a * u[1] + b * v[1]),
  ];
  return {
    inner: [at(1 / 3, 1 / 3), at(2 / 3, 1 / 3), at(2 / 3, 2 / 3), at(1 / 3, 2 / 3)],
    outer: [at(0, 0), at(1, 0), at(1, 1), at(0, 1)],
  };
}

function drawSides(layers: SceneLayers, camera: Camera, pose: SidesPose, boil: number): void {
  const front = layers.front.context;
  const ink = layers.ink.context;
  const lineScale = clamp((MARK_SIZE * camera.zoom) / 95, 1, 2.6);
  const lineSeed = 71 + boil * 3;
  const center = project(camera, MARK_HOME);
  const radius = 0.816 * MARK_SIZE * camera.zoom;
  drawConstructionCircle(ink, center, radius * 1.3, pose.circle, 17);
  const baseLine = {
    amplitude: 0.5 * lineScale,
    color: INK_LINE,
    wavelength: 50 * lineScale,
    width: 2.7 * lineScale,
  };
  let angle = pose.start;
  const sides = pose.widths.map((width, index) => {
    const quads = sideQuads(center, radius, angle, width);
    angle += width;
    return { ...quads, color: pose.colors[index] ?? PALETTE.slateMid, index, width };
  });
  // The clay side becomes the mark: it turns upright and moves onto the mark's place.
  const clay = sides[4];
  if (clay && pose.settle > 0) {
    const middle = scale(add(clay.outer[0] ?? center, clay.outer[2] ?? center), 0.5);
    const edge = sub(clay.outer[1] ?? center, clay.outer[0] ?? center);
    const turn = Math.atan2(edge[1], edge[0]);
    const minimal =
      ((((turn + Math.PI / 4) % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2)) - Math.PI / 4;
    const size = length(edge) || 1;
    const target = project(camera, MARK_HOME);
    const move = (point: Point): Point => {
      const local = rotate(sub(point, middle), -minimal * pose.settle);
      const grow = lerp(1, (MARK_SIZE * camera.zoom) / size, pose.settle);
      return add(mix(middle, target, pose.settle), scale(local, grow));
    };
    clay.outer = clay.outer.map(move);
    clay.inner = clay.inner.map(move);
  }
  const drawSide = (
    outer: Point[],
    inner: Point[],
    color: string,
    index: number,
    glaze: boolean,
    alpha = 1,
  ) => {
    if (outer.length < 3) {
      return;
    }
    const line = { ...baseLine, alpha: 0.95 * alpha };
    const centroid = scale(
      outer.reduce((sum, point) => add(sum, point), [0, 0]),
      1 / outer.length,
    );
    wash(front, outer, color, {
      body: 0.84,
      holes: inner.length >= 3 ? [inner] : [],
      mottle: 0.6,
      origin: centroid,
      seed: 50 + index * 5 + (boil % 4),
      wobbleAmplitude: 1.3 * lineScale,
    });
    if (glaze && outer.length === 4) {
      // Bent paper: one half of the side, across its diagonal, is a shade darker.
      wash(front, [outer[0] ?? centroid, outer[2] ?? centroid, outer[3] ?? centroid], color, {
        body: 0.22,
        holes: inner.length >= 3 ? [inner] : [],
        mottle: 0,
        seed: 57 + index,
      });
    }
    inkPolygon(ink, outer, { ...line, seed: lineSeed + index * 11 });
    if (inner.length >= 3) {
      inkPolygon(ink, inner, { ...line, seed: lineSeed + index * 11 + 1, width: 2 * lineScale });
    }
  };
  // The whole picture is one sticker: a fold line crosses it from the tip of the right side.
  const folding = pose.peel > 0.002;
  const direction = ray(330);
  const fold = radius * (1 - 1.3 * pose.peel);
  const reflect = (point: Point): Point => {
    const distance =
      (point[0] - center[0]) * direction[0] + (point[1] - center[1]) * direction[1] - fold;
    return sub(point, scale(direction, 2 * distance));
  };
  const flat = (polygon: Point[]) =>
    folding ? clipHalfPlane(polygon, center, direction, fold, true) : polygon;
  sides.forEach((side) => {
    if (side.width < 12) {
      return;
    }
    const outer = flat(side.outer);
    const inner = flat(side.inner);
    // A side that folds away fades as it gets thin, so no sliver is left behind.
    const alpha = clamp((side.width - 12) / 30);
    front.save();
    front.globalAlpha = alpha;
    drawSide(outer, inner, side.color, side.index, (pose.widths[4] ?? 0) > 1, alpha);
    front.restore();
    if (side.index === 3 && pose.hatch > 0 && outer.length >= 3) {
      hatchPolygon(ink, outer, {
        alpha: 0.5 * alpha,
        angle: 58,
        color: INK_LINE,
        gap: 7.5 * lineScale,
        holes: inner.length >= 3 ? [inner] : [],
        reveal: pose.hatch,
        seed: 91 + (boil % 3),
        width: 1.3 * lineScale,
      });
    }
  });
  if (!folding) {
    return;
  }
  const outline = sides
    .filter((side) => side.width >= 1)
    .flatMap((side) => [side.outer[1] ?? center, side.outer[2] ?? center]);
  // Under the sticker there is only paper, and the pencil ghost of where it was.
  pencil(ink, wobble(closedPath(outline), false, { amplitude: 1.2, seed: 97 }), {
    alpha: 0.34 * clamp(pose.peel * 3),
    seed: 98,
    width: 1.3,
  });
  const flap = clipHalfPlane(outline, center, direction, fold, false).map(reflect);
  const flapHoles = sides
    .map((side) => clipHalfPlane(side.inner, center, direction, fold, false).map(reflect))
    .filter((hole) => hole.length >= 3);
  if (flap.length < 3) {
    return;
  }
  const shadowShift: Point = [7 * lineScale, 11 * lineScale];
  wash(
    front,
    flap.map((point) => add(point, shadowShift)),
    "#6E6A8C",
    {
      body: 0.22,
      holes: flapHoles.map((hole) => hole.map((point) => add(point, shadowShift))),
      mottle: 0,
      seed: 99,
      wobbleAmplitude: 4,
    },
  );
  // The sticker is opaque paper, and its back is clay: the colour the little mark will have.
  front.save();
  front.fillStyle = "#F6EEDF";
  polygonPath(front, flap, flapHoles);
  front.fill("evenodd");
  front.restore();
  ink.save();
  ink.globalCompositeOperation = "destination-out";
  polygonPath(ink, flap, flapHoles);
  ink.fill("evenodd");
  ink.restore();
  const flapCenter = scale(
    flap.reduce((sum, point) => add(sum, point), [0, 0]),
    1 / flap.length,
  );
  wash(front, flap, PALETTE.clay, {
    body: 0.84,
    holes: flapHoles,
    mottle: 0.6,
    origin: flapCenter,
    seed: 77 + (boil % 4),
    wobbleAmplitude: 1.3 * lineScale,
  });
  inkPolygon(ink, flap, { ...baseLine, seed: lineSeed + 90 });
  flapHoles.forEach((hole, index) =>
    inkPolygon(ink, hole, { ...baseLine, seed: lineSeed + 91 + index, width: 2 * lineScale }),
  );
}

function drawCubeLabels(layers: SceneLayers, camera: Camera, time: number, boil: number): void {
  const ink = layers.ink.context;
  const center = project(camera, MARK_HOME);
  const radius = 0.816 * MARK_SIZE * camera.zoom;
  const size = clamp(radius * 0.36, 44, 72);
  const places: readonly { anchor: Point; label: Point; align: "center" | "left" }[] = [
    {
      align: "center",
      anchor: add(center, [0, -radius * 0.6]),
      label: add(center, [0, -radius * 1.52]),
    },
    {
      align: "center",
      anchor: add(center, [-radius * 0.55, radius * 0.25]),
      label: add(center, [-radius * 1.95, radius * 0.5]),
    },
    {
      align: "center",
      anchor: add(center, [radius * 0.55, radius * 0.25]),
      label: add(center, [radius * 1.95, radius * 0.5]),
    },
  ];
  readCubeLabels(time).forEach((label, index) => {
    const place = places[index];
    if (!place || label.progress <= 0 || label.fade <= 0) {
      return;
    }
    const drop = 40 * (1 - label.fade) * (1 - label.fade);
    handLetter(ink, label.text, place.label[0], place.label[1] + drop, {
      align: place.align,
      alpha: 0.95 * label.fade,
      progress: label.progress,
      rotation: 0.04,
      seed: 200 + index * 10 + (boil % 3),
      size,
    });
    const leaderStart = mix(place.label, place.anchor, 0.28);
    pencil(
      ink,
      partialPath(
        [add(leaderStart, [0, -size * 0.1]), place.anchor],
        easeOut(clamp(label.progress * 1.4 - 0.4)),
      ),
      { alpha: 0.35 * label.fade, seed: 210 + index, width: 1.3 },
    );
  });
}

// ----- the landscape -----

type Puff = { r: number; x: number; y: number };

function makePuffs(
  seed: number,
  x0: number,
  x1: number,
  y: number,
  low: number,
  high: number,
  gap: readonly [number, number] | null,
): Puff[] {
  const random = rng(seed);
  const puffs: Puff[] = [];
  let x = x0;
  while (x < x1) {
    if (gap && x > gap[0] && x < gap[1]) {
      x = gap[1];
      continue;
    }
    const r = low + random() * (high - low);
    puffs.push({ r, x, y: y - r * 0.5 + random() * 8 + 0.05 * (x - 1400) });
    x += r * (0.85 + random() * 0.5);
  }
  return puffs;
}

const SHOULDER_PUFFS = makePuffs(3, 1010, 2150, 322, 20, 54, [1430, 1600]);
/** A cumulus in front of the giant, in two halves that part on 24.0. */
const BANK_BASE = 660;
const BANK_HALVES: readonly (readonly Puff[])[] = [
  [
    { r: 115, x: 900, y: 575 },
    { r: 150, x: 1000, y: 480 },
    { r: 190, x: 1140, y: 390 },
    { r: 165, x: 1280, y: 290 },
    { r: 165, x: 1190, y: 540 },
    { r: 175, x: 1340, y: 500 },
  ],
  [
    { r: 160, x: 1480, y: 250 },
    { r: 210, x: 1610, y: 390 },
    { r: 170, x: 1500, y: 540 },
    { r: 150, x: 1770, y: 320 },
    { r: 190, x: 1860, y: 470 },
    { r: 150, x: 1690, y: 575 },
    { r: 140, x: 2010, y: 540 },
  ],
];
/** A cloud: cream puffs over a flat base, with ink only on the puffy outline. */
function drawCloud(
  layers: SceneLayers,
  puffs: readonly { center: Point; r: number }[],
  baseY: number,
  alpha: number,
  seed: number,
  eraseInk: boolean,
  /** Puffs of a neighbouring cloud that hide this cloud's outline where they overlap. */
  occluders: readonly { center: Point; r: number }[] = [],
): void {
  if (alpha <= 0.01 || puffs.length === 0) {
    return;
  }
  const front = layers.front.context;
  const ink = layers.ink.context;
  const shape = (context: CanvasRenderingContext2D) => {
    context.beginPath();
    for (const puff of puffs) {
      context.moveTo(puff.center[0] + puff.r, puff.center[1]);
      context.arc(puff.center[0], puff.center[1], puff.r, 0, Math.PI * 2);
    }
  };
  const top = Math.min(...puffs.map((puff) => puff.center[1] - puff.r));
  front.save();
  front.beginPath();
  front.rect(-4000, -4000, 12000, baseY + 4000);
  front.clip();
  front.globalAlpha = alpha;
  shape(front);
  front.fillStyle = CLOUD_FILL;
  front.fill();
  const shade = front.createLinearGradient(0, top, 0, Math.min(baseY, top + 600));
  shade.addColorStop(0, "rgba(255,248,236,0)");
  shade.addColorStop(0.55, "rgba(236,226,222,0.2)");
  shade.addColorStop(1, "rgba(206,202,214,0.4)");
  front.fillStyle = shade;
  front.fill();
  // Big puffs get a soft cool shadow under their bellies, so a bank has volume.
  shape(front);
  front.clip();
  front.globalCompositeOperation = "multiply";
  front.filter = `blur(${Math.max(4, Math.min(...puffs.map((puff) => puff.r)) * 0.18)}px)`;
  front.fillStyle = "rgba(206,204,226,0.42)";
  for (const puff of puffs) {
    if (puff.r < 60) {
      continue;
    }
    front.beginPath();
    front.ellipse(
      puff.center[0],
      puff.center[1] + puff.r * 0.62,
      puff.r * 0.85,
      puff.r * 0.4,
      0,
      0,
      Math.PI * 2,
    );
    front.fill();
  }
  front.restore();
  if (eraseInk) {
    ink.save();
    ink.globalCompositeOperation = "destination-out";
    shape(ink);
    ink.fill();
    ink.restore();
  }
  // Outline: the arcs of each puff that no other puff covers, above the base. Inside the bank,
  // the upper arcs of the puffs get a faint contour.
  const runs: { inner: boolean; points: Point[] }[] = [];
  puffs.forEach((puff, index) => {
    let run: Point[] = [];
    let inner = false;
    const flush = () => {
      if (run.length > 2) {
        runs.push({ inner, points: run });
      }
      run = [];
    };
    const steps = Math.max(12, Math.ceil((puff.r * Math.PI * 2) / 5));
    for (let step = 0; step <= steps; step += 1) {
      const angle = (step / steps) * Math.PI * 2;
      const point: Point = [
        puff.center[0] + Math.cos(angle) * puff.r,
        puff.center[1] + Math.sin(angle) * puff.r,
      ];
      const covered =
        puffs.some(
          (other, otherIndex) =>
            otherIndex !== index && length(sub(point, other.center)) < other.r - 1.5,
        ) || occluders.some((other) => length(sub(point, other.center)) < other.r - 1.5);
      const upper = puff.r > 140 && Math.sin(angle) < -0.5 && Math.abs(Math.cos(angle)) < 0.6;
      const state = point[1] > baseY - 2 ? null : !covered ? false : upper ? true : null;
      if (state === null || (run.length > 0 && state !== inner)) {
        flush();
      }
      if (state !== null) {
        inner = state;
        run.push(point);
      }
    }
    flush();
  });
  runs.forEach((run, index) => {
    inkStroke(
      ink,
      wobble(run.points, false, { amplitude: 0.8, seed: seed + index, step: 4, wavelength: 60 }),
      {
        alpha: (run.inner ? 0.22 : 0.72) * alpha,
        color: "#3A4550",
        seed: seed + index,
        taper: run.inner ? 0.45 : 0.3,
        width: run.inner ? 1.5 : 2.2,
      },
    );
  });
}

function blade(
  context: CanvasRenderingContext2D,
  root: Point,
  bend: Point,
  tip: Point,
  width: number,
): void {
  const left: Point[] = [];
  const right: Point[] = [];
  const points: Point[] = [];
  for (let t = 0; t <= 1.001; t += 0.1) {
    points.push(mix(mix(root, bend, t), mix(bend, tip, t), t));
  }
  points.forEach((point, index) => {
    const next = points[Math.min(points.length - 1, index + 1)] ?? point;
    const previous = points[Math.max(0, index - 1)] ?? point;
    const tangent = sub(next, previous);
    const size = length(tangent) || 1;
    const half = (width / 2) * (1 - (index / (points.length - 1)) * 0.9);
    left.push([point[0] - (tangent[1] / size) * half, point[1] + (tangent[0] / size) * half]);
    right.push([point[0] + (tangent[1] / size) * half, point[1] - (tangent[0] / size) * half]);
  });
  context.save();
  context.fillStyle = PALETTE.ink;
  context.globalAlpha = 0.92;
  polygonPath(context, left.concat(right.reverse()));
  context.fill();
  context.restore();
}

const TUFTS = (() => {
  const random = rng(12);
  return Array.from({ length: 46 }, () => {
    const x = -380 + random() * 1500;
    return {
      blades: 2 + Math.floor(random() * 2),
      heights: [random(), random(), random()],
      leans: [random(), random(), random()],
      x,
    };
  });
})();

function paintLandscape(layers: SceneLayers, camera: Camera, time: number, boil: number): void {
  const reveal = readLandscapeReveal(time);
  if (reveal.sky <= 0 && reveal.ridge <= 0) {
    return;
  }
  const back = layers.back.context;
  const front = layers.front.context;
  const ink = layers.ink.context;
  const skyCamera = layerCamera(camera, 0.12);
  const hillCamera = layerCamera(camera, MIST_DEPTH);
  const cloudCamera = layerCamera(camera, 0.5);
  const markFeet = project(camera, [
    lerp(MARK_HOME[0], 292, clamp((time - TIMES.walk) / 2.5)),
    ridgeY(MARK_HOME[0]),
  ]);

  // Sky: cool above, warm toward the low sun on the left, laid in as one wet wash.
  if (reveal.sky > 0) {
    back.save();
    clipBloom(back, project(skyCamera, [1650, 160]), reveal.sky * 2600, 3);
    back.globalCompositeOperation = "multiply";
    const top = project(skyCamera, [0, 30])[1];
    const bottom = project(skyCamera, [0, 640])[1];
    const gradient = back.createLinearGradient(0, top, 0, bottom);
    gradient.addColorStop(0, "#A4CBE3");
    gradient.addColorStop(0.45, "#D9DCCB");
    gradient.addColorStop(1, "#F7DDAE");
    back.fillStyle = gradient;
    back.fillRect(0, 0, 1920, 1080);
    const sun = project(skyCamera, [205, 585]);
    const glow = back.createRadialGradient(sun[0], sun[1], 0, sun[0], sun[1], 520 * skyCamera.zoom);
    glow.addColorStop(0, "rgba(253,222,160,0.85)");
    glow.addColorStop(1, "rgba(253,222,160,0)");
    back.fillStyle = glow;
    back.fillRect(0, 0, 1920, 1080);
    wash(
      back,
      [
        [-40, -40],
        [1960, -40],
        [1960, 1120],
        [-40, 1120],
      ],
      "#D9D3CB",
      { body: 0, mottle: 0.4, origin: project(skyCamera, [0, 0]), seed: 5, textureScale: 1.7 },
    );
    back.restore();
  }
  if (reveal.sun > 0) {
    const sun = project(skyCamera, [205, 575]);
    const radius = 46 * skyCamera.zoom * easeOut(reveal.sun);
    back.save();
    back.fillStyle = "rgba(255,250,236,0.94)";
    polygonPath(
      back,
      wobble(circlePoints(sun, radius, 64), true, { amplitude: 1, seed: 8, step: 6 }),
    );
    back.fill();
    back.restore();
    pencil(
      back,
      wobble(
        circlePoints(sun, radius + 7 * skyCamera.zoom, 120).concat([
          add(sun, [radius + 7 * skyCamera.zoom, 0]),
        ]),
        false,
        { amplitude: 1.6, seed: 3, wavelength: 90 },
      ),
      { alpha: 0.3, seed: 4 },
    );
  }
  if (reveal.hills > 0) {
    back.save();
    clipBloom(back, project(hillCamera, [320, 800]), reveal.hills * 2200, 11);
    const far: Point[] = [
      [-700, 770],
      [-400, 742],
      [-120, 760],
      [110, 726],
      [260, 734],
      [420, 758],
      [660, 800],
      [900, 824],
      [1300, 850],
      [1300, 1300],
      [-700, 1300],
    ];
    const near: Point[] = [
      [-700, 826],
      [-300, 806],
      [170, 794],
      [360, 804],
      [660, 846],
      [1000, 880],
      [1300, 900],
      [1300, 1300],
      [-700, 1300],
    ];
    wash(
      back,
      far.map((point) => project(hillCamera, point)),
      "#B4B7D4",
      { body: 0.75, mottle: 0.45, origin: project(hillCamera, [0, 0]), seed: 13 },
    );
    wash(
      back,
      near.map((point) => project(hillCamera, point)),
      "#9CAFB2",
      { body: 0.75, mottle: 0.45, origin: project(hillCamera, [0, 0]), seed: 14 },
    );
    back.restore();
  }

  // Clouds: a bank hides the giant until it parts on 24.0; a band stays at its shoulder.
  if (reveal.clouds > 0) {
    const parting = readCloudParting(time);
    const shoulder = SHOULDER_PUFFS.map((puff) => ({
      center: project(cloudCamera, [puff.x + 8 * Math.sin(time * 0.3), puff.y]),
      r: puff.r * cloudCamera.zoom * easeOut(reveal.clouds),
    }));
    // Parting: the cumulus splits in two masses that slide apart and thin out.
    const fade = 1 - smoothstep(0.55, 1, parting);
    const halves = BANK_HALVES.map((half, index) => {
      const drift: Point =
        index === 0 ? [-950 * parting, -420 * parting] : [1000 * parting, -180 * parting];
      const puffs = half.map((puff) => ({
        center: project(cloudCamera, [puff.x + drift[0], puff.y + drift[1]]),
        r: puff.r * cloudCamera.zoom * easeOut(reveal.clouds),
      }));
      return { base: project(cloudCamera, [0, BANK_BASE + drift[1]])[1], puffs };
    });
    halves.forEach((half, index) => {
      const other = halves[1 - index]?.puffs ?? [];
      drawCloud(layers, half.puffs, half.base, fade, 300 + index * 40, false, other);
    });
    // The band at the giant's shoulder shows as the cumulus goes.
    const band = smoothstep(0.15, 0.7, parting);
    drawCloud(layers, shoulder, project(cloudCamera, [0, 330])[1], band, 320, false);
  }

  // The ridge: it spreads from under the mark's feet.
  if (reveal.ridge > 0) {
    const polygon = [...RIDGE, [1200, 1500] satisfies Point, [-400, 1500] satisfies Point].map(
      (point) => project(camera, point),
    );
    front.save();
    clipBloom(front, markFeet, reveal.ridge * 2400, 21);
    wash(front, polygon, "#6F8350", {
      body: 0.95,
      mottle: 0.55,
      origin: project(camera, [0, 0]),
      seed: 22,
      textureScale: 1.2,
    });
    wash(front, polygon, "#556B45", {
      body: 0.3,
      mottle: 0.3,
      origin: project(camera, [300, 100]),
      seed: 23,
    });
    polygonPath(front, polygon);
    front.clip();
    const crest = project(camera, [0, 875])[1];
    const low = front.createLinearGradient(
      0,
      crest + 25 * camera.zoom,
      0,
      crest + 220 * camera.zoom,
    );
    low.addColorStop(0, "rgba(40,52,32,0)");
    low.addColorStop(1, "rgba(40,52,32,0.45)");
    front.fillStyle = low;
    front.fillRect(0, 0, 1920, 1080);
    front.filter = `blur(${5 * camera.zoom}px)`;
    front.strokeStyle = "rgba(232,186,96,0.55)";
    front.lineWidth = 12 * camera.zoom;
    front.beginPath();
    RIDGE.forEach((point, index) => {
      const shifted = project(camera, [point[0], point[1] + 5]);
      if (index === 0) {
        front.moveTo(shifted[0], shifted[1]);
      } else {
        front.lineTo(shifted[0], shifted[1]);
      }
    });
    front.stroke();
    front.restore();
    ink.save();
    clipBloom(ink, markFeet, reveal.ridge * 2400, 21);
    inkLine(
      ink,
      RIDGE.map((point) => project(camera, point)),
      { amplitude: 2, seed: 5, taper: 0.1, width: 3.4 },
    );
    ink.restore();
  }
  if (reveal.grass > 0) {
    const markX = readMarkWalkPosition(time)[0];
    TUFTS.forEach((tuft, index) => {
      const order = clamp(reveal.grass * 1.6 - Math.abs(tuft.x - MARK_HOME[0]) / 1400);
      if (order <= 0 || Math.abs(tuft.x - markX) < 22) {
        return;
      }
      for (let bladeIndex = 0; bladeIndex < tuft.blades; bladeIndex += 1) {
        const height = (8 + (tuft.heights[bladeIndex] ?? 0.5) * 12) * easeOut(order);
        const sway = 1.5 * vnoise(boil * 0.9 + index, 3);
        const lean =
          (bladeIndex - (tuft.blades - 1) / 2) * 5 +
          ((tuft.leans[bladeIndex] ?? 0.5) - 0.3) * 4 +
          sway;
        const rootX = tuft.x + bladeIndex * 2.5 - 2;
        const root: Point = [rootX, ridgeY(rootX) + 2];
        blade(
          ink,
          project(camera, root),
          project(camera, add(root, [lean * 0.25, -height * 0.55])),
          project(camera, add(root, [lean, -height])),
          2.8 * Math.min(1.6, camera.zoom),
        );
      }
    });
  }
  if (reveal.birds > 0) {
    for (const [index, [x0, y0, size]] of (
      [
        [548, 452, 14],
        [596, 426, 10],
        [640, 466, 12],
      ] as const
    ).entries()) {
      const x = x0 + 40 * (time - 24) + 6 * index;
      const y = y0 - 6 * (time - 24) + 3 * Math.sin(time * 1.3 + index);
      const flap = Math.sin(time * 2 * Math.PI * 2.4 + index * 1.7);
      const wing = size * (0.35 + 0.25 * flap);
      const at = (dx: number, dy: number) => project(cloudCamera, [x + dx, y + dy]);
      const options = { alpha: easeOut(reveal.birds), amplitude: 0.3, taper: 0.3, width: 1.9 };
      inkLine(ink, [at(-size, -wing), at(-size * 0.35, -wing * 1.2), at(0, 0)], {
        ...options,
        seed: 400 + index * 2 + (boil % 2),
      });
      inkLine(ink, [at(0, 0), at(size * 0.35, -wing * 1.3), at(size, -wing * 0.8)], {
        ...options,
        seed: 401 + index * 2 + (boil % 2),
      });
    }
  }
  if (time >= TIMES.words) {
    const drift = 4 * Math.sin(time * 0.5);
    const lineOne = ramp(time, TIMES.words, 0.55);
    const lineTwo = ramp(time, TIMES.words + 0.5, 0.6);
    const lineThree = ramp(time, TIMES.stroll, 0.5);
    handLetter(ink, "Every app on", 86, 150 + drift, {
      progress: lineOne,
      seed: 7 + (boil % 3),
      size: 72,
    });
    handLetter(ink, "the same base.", 86, 226 + drift, {
      progress: lineTwo,
      seed: 8 + (boil % 3),
      size: 72,
    });
    handLetter(ink, "Samebase too.", 90, 298 + drift, {
      color: PALETTE.inkSoft,
      progress: lineThree,
      seed: 9 + (boil % 3),
      size: 52,
    });
  }
}

// ----- the end card -----

function paintEndCard(layers: SceneLayers, time: number, boil: number): void {
  const camera = readEndCamera(time);
  const card = readEndCard(time);
  const ink = layers.ink.context;
  const at = (point: Point) => project(camera, point);
  const size = 185;
  const groundY = 752;
  const restY = groundY - size / 2 - (LEG_LENGTH / MARK_SIZE) * size;
  drawConstructionCircle(ink, at([560, 600]), 250 * camera.zoom, card.circle, 23);
  const hop = card.hop;
  const x = lerp(260, 560, easeOut(hop));
  const jump = 170 * Math.sin(Math.PI * clamp(hop)) + 60 * Math.max(0, card.finalHop);
  const land =
    pulse(time, TIMES.end + 0.5, 2.4, 5) + 0.6 * pulse(time, TIMES.finalHit + 0.45, 2.6, 5);
  const pose: MarkPose = {
    angle: -0.12 * (1 - hop) + 0.05 * card.finalHop,
    bloom: 1,
    center: [x, restY - jump],
    color: PALETTE.clay,
    hole: 1 / 3,
    holeOutline: 1,
    legs: 1,
    outline: 1,
    previousColor: PALETTE.clay,
    recolor: 1,
    size,
    squash: [1 + 0.22 * land, 1 - 0.25 * land],
    step: null,
  };
  // A small painted shadow under the mark: it shrinks while the mark is in the air.
  const shadow = at([x, groundY + 4]);
  const shadowScale = 1 - 0.45 * clamp(jump / 170);
  wash(
    layers.front.context,
    circlePoints(shadow, 1, 40).map((point) =>
      add(shadow, [
        (point[0] - shadow[0]) * 92 * shadowScale,
        (point[1] - shadow[1]) * 11 * shadowScale,
      ]),
    ),
    "#8C8AA6",
    { body: 0.3 * clamp(hop * 2), mottle: 0, seed: 31, wobbleAmplitude: 2 },
  );
  drawMark(layers, camera, pose, boil, false);
  const textX = 830;
  const lineOne = at([textX, 560]);
  handLetter(ink, "Same base.", lineOne[0], lineOne[1], {
    progress: card.lineOne,
    seed: 501 + (boil % 3),
    size: 170 * camera.zoom,
  });
  if (card.underline > 0) {
    const from = at([textX + 6, 592]);
    const to = at([textX + 610, 584]);
    inkLine(ink, partialPath([from, mix(from, to, 0.5), to], card.underline), {
      amplitude: 2,
      color: PALETTE.clayDeep,
      seed: 502,
      taper: 0.3,
      width: 9 * camera.zoom,
    });
  }
  const lineTwo = at([textX + 8, 680]);
  handLetter(ink, "Your accounts. No magic.", lineTwo[0], lineTwo[1], {
    progress: card.lineTwo,
    seed: 503 + (boil % 3),
    size: 74 * camera.zoom,
  });
  const site = at([textX + 10, 772]);
  handLetter(ink, "samebase.com", site[0], site[1], {
    color: PALETTE.inkSoft,
    progress: card.site,
    seed: 504 + (boil % 3),
    size: 60 * camera.zoom,
  });
}

// ----- the cloud wipe -----

const WIPE_PUFFS = (() => {
  const random = rng(77);
  const edge = (offset: number, sign: number) =>
    Array.from({ length: 11 }, (_, index) => ({
      dx: offset + sign * random() * 70,
      r: 150 + random() * 110,
      y: -120 + index * 132 + random() * 40,
    }));
  return [...edge(0, 1), ...edge(2600, -1)];
})();

function paintWipe(layers: SceneLayers, time: number): void {
  const wipe = readWipe(time);
  if (wipe <= 0 || wipe >= 1) {
    return;
  }
  const lead = lerp(2150, -2750, easeInOut(wipe));
  const puffs = WIPE_PUFFS.map((puff) => ({
    center: [lead + puff.dx, puff.y + 30 * Math.sin(puff.dx)] satisfies Point,
    r: puff.r,
  }));
  const front = layers.front.context;
  front.save();
  front.fillStyle = CLOUD_FILL;
  front.fillRect(lead + 60, -200, 2480, 1500);
  front.restore();
  const ink = layers.ink.context;
  ink.save();
  ink.globalCompositeOperation = "destination-out";
  ink.fillRect(lead + 60, -200, 2480, 1500);
  ink.restore();
  drawCloud(layers, puffs, 5000, 1, 600, true);
}

export function paintScene(time: number, layers: SceneLayers): void {
  const boil = boilIndex(time);
  const back = layers.back.context;
  back.save();
  back.setTransform(1, 0, 0, 1, 0, 0);
  back.globalCompositeOperation = "source-over";
  back.fillStyle = "#FFFFFF";
  back.fillRect(0, 0, 1920, 1080);
  back.restore();
  layers.front.context.clearRect(0, 0, 1920, 1080);
  layers.ink.context.clearRect(0, 0, 1920, 1080);
  if (time < TIMES.end) {
    const camera = readCamera(time);
    paintLandscape(layers, camera, time, boil);
    if (time < TIMES.walk + 0.8) {
      drawDroplets(layers, camera, time);
    }
    const cube = readCubePose(time);
    if (cube?.kind === "cube") {
      drawCube(layers, camera, cube, boil, time);
    } else if (cube?.kind === "sides") {
      drawSides(layers, camera, cube, boil);
    }
    if (time > TIMES.cube && time < TIMES.fourSides + 0.5) {
      drawCubeLabels(layers, camera, time, boil);
    }
    const mark = readMarkPose(time);
    if (mark) {
      drawMark(layers, camera, mark, boil, time >= TIMES.walk);
    }
  } else {
    paintEndCard(layers, time, boil);
  }
  paintWipe(layers, time);
}
