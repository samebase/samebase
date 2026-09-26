import { common, d, std, tgpu } from "typegpu";

import type { WebGpuFrameRenderer } from "../../webgpu/useWebGpuFrame";
import { drawFilmPage, waitForFilmFonts } from "./filmPage";
import { hash, pageHeight, pageWidth } from "./filmMotion";
import type { FilmFrame, Inks } from "./filmTimeline";

// ---------- print constants ----------

function hexColor(hex: number): d.v3f {
  return d.vec3f(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255);
}

const PAPER = hexColor(0xf3eee3);
const PINK = hexColor(0xff48b0);
const BLUE = hexColor(0x3255a4);
const SLATE = hexColor(0x394447);
/** Screen angles in radians and cell sizes in page pixels, as on the approved style frames. */
const PINK_ANGLE = (15 * Math.PI) / 180;
const BLUE_ANGLE = (75 * Math.PI) / 180;
const SLATE_ANGLE = (45 * Math.PI) / 180;
const PINK_CELL = 6.5;
const BLUE_CELL = 6.5;
const SLATE_CELL = 5.6;
const PAPER_TILE = 2048;
/** Page turn: distance from the eye to the page, in page pixels, for the perspective of the sheet. */
const EYE_DISTANCE = 2600;
const SPINE_X = 960;

// ---------- scene constants ----------

/** Half thickness of the paper. Each wall lies on the inner side of its face plane. */
const PAPER_HALF_THICKNESS = 0.012;
const HOLE_HALF_SIZE = 1 / 3;
const MAXIMUM_LEVELS = 6;

const Face = d.struct({ n: d.vec3f, origin: d.vec3f, tint: d.f32, u: d.vec3f, v: d.vec3f });

const SceneState = d.struct({
  back: d.vec3f,
  center: d.vec2f,
  face0: Face,
  face1: Face,
  face2: Face,
  face3: Face,
  face4: Face,
  face5: Face,
  halfHeight: d.f32,
  hazeDistance: d.f32,
  hazeStart: d.f32,
  innerTone: d.vec3f,
  light: d.vec3f,
  lit: d.f32,
  mode: d.i32,
  pageDepth: d.f32,
  printRadius: d.vec3f,
  probe: d.vec3f,
  probeStart: d.vec3f,
  restDepth: d.i32,
  revealRadius: d.f32,
  revealTone: d.vec3f,
  right: d.vec3f,
  shadeTone: d.vec3f,
  shadow: d.f32,
  shadowTone: d.vec3f,
  spongeCenter: d.vec3f,
  spongeHalfSize: d.f32,
  spongeLevels: d.i32,
  tanHalfFieldOfView: d.f32,
  lookAt: d.vec3f,
  up: d.vec3f,
  xTone: d.vec3f,
  yTone: d.vec3f,
  zTone: d.vec3f,
});

const WarpState = d.struct({
  center: d.vec2f,
  enabled: d.i32,
  hexagonRadius: d.f32,
  lastSideInk: d.vec3f,
  lastSideWidth: d.f32,
  sideInk0: d.vec3f,
  sideInk1: d.vec3f,
  sideInk2: d.vec3f,
  sideInk3: d.vec3f,
  sideWidths: d.vec4f,
  spin: d.f32,
  xTone: d.vec3f,
  yTone: d.vec3f,
  zTone: d.vec3f,
  innerTone: d.vec3f,
});

const PrintState = d.struct({
  blueRegistration: d.vec3f,
  pageTurn: d.f32,
  pan: d.vec2f,
  pinkRegistration: d.vec3f,
  printIndex: d.f32,
  rotation: d.f32,
  scale: d.f32,
  slateRegistration: d.vec3f,
});

const SceneOutput = { axes: d.vec4f, ink: d.vec4f };
const Hit = d.struct({ axes: d.vec4f, ink: d.vec3f });

// ---------- shared GPU helpers ----------

const boxDistance = (point: d.v3f, halfSize: d.v3f): number => {
  "use gpu";
  const outside = std.sub(std.abs(point), halfSize);
  return (
    std.length(std.max(outside, d.vec3f(0))) + std.min(std.max(outside.x, outside.y, outside.z), 0)
  );
};

const rectangleDistance = (point: d.v2f, halfSize: number): number => {
  "use gpu";
  const delta = std.sub(std.abs(point), d.vec2f(halfSize));
  return std.length(std.max(delta, d.vec2f(0))) + std.min(std.max(delta.x, delta.y), 0);
};

/** Three square tunnels through a unit cell, one along each axis. */
const tunnelDistance = (point: d.v3f, halfWidth: number): number => {
  "use gpu";
  return std.min(
    rectangleDistance(point.xy, halfWidth),
    rectangleDistance(point.yz, halfWidth),
    rectangleDistance(point.xz, halfWidth),
  );
};

/** Hash without sine (Dave Hoskins), stable for page-pixel inputs. */
const hash21 = (point: d.v2f): number => {
  "use gpu";
  let p3 = std.fract(std.mul(d.vec3f(point.x, point.y, point.x), 0.1031));
  p3 = std.add(p3, std.dot(p3, std.add(d.vec3f(p3.y, p3.z, p3.x), 33.33)));
  return std.fract((p3.x + p3.y) * p3.z);
};

const valueNoise = (point: d.v2f): number => {
  "use gpu";
  const cell = std.floor(point);
  const local = std.fract(point);
  const blend = std.mul(std.mul(local, local), std.sub(d.vec2f(3), std.mul(local, 2)));
  const a = hash21(cell);
  const b = hash21(std.add(cell, d.vec2f(1, 0)));
  const c = hash21(std.add(cell, d.vec2f(0, 1)));
  const e = hash21(std.add(cell, d.vec2f(1, 1)));
  return std.mix(std.mix(a, b, blend.x), std.mix(c, e, blend.x), blend.y);
};

const fractalNoise = (point: d.v2f): number => {
  "use gpu";
  return (
    0.57 * valueNoise(point) +
    0.29 * valueNoise(std.mul(point, 2.03)) +
    0.14 * valueNoise(std.mul(point, 4.01))
  );
};

const rotate2 = (point: d.v2f, angle: number): d.v2f => {
  "use gpu";
  const cos = std.cos(angle);
  const sin = std.sin(angle);
  return d.vec2f(cos * point.x - sin * point.y, sin * point.x + cos * point.y);
};

/**
Share of one pixel that a round-dot screen inks at `coverage`. The dots sit on a grid in page space,
so they stay on the paper when the camera moves. `footprint` is one screen pixel in page pixels.
*/
const halftone = (
  point: d.v2f,
  angle: number,
  cell: number,
  coverage: number,
  footprint: number,
): number => {
  "use gpu";
  if (coverage < 0.008) {
    return 0;
  }
  if (coverage > 0.975) {
    return 1;
  }
  const edge = (0.9 * footprint) / cell;
  let total = d.f32(0);
  for (let sample = 0; sample < 4; sample += 1) {
    const offset = d.vec2f(
      (d.f32(sample % 2) - 0.5) * 0.5 * footprint,
      (std.floor(d.f32(sample) / 2) - 0.5) * 0.5 * footprint,
    );
    const rotated = std.div(rotate2(std.add(point, offset), -angle), cell);
    const spot = 0.5 + 0.25 * (std.cos(2 * Math.PI * rotated.x) + std.cos(2 * Math.PI * rotated.y));
    total += std.smoothstep(-edge, edge, coverage - spot);
  }
  return total / 4;
};

// ---------- paper texture ----------

/** Seeded paper fibers and blotches, drawn once. Red is fibers, green is the blotch field. */
function drawPaperTile(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = PAPER_TILE;
  canvas.height = PAPER_TILE;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("No 2D context for the paper tile");
  }
  context.fillStyle = "rgb(128, 128, 0)";
  context.fillRect(0, 0, PAPER_TILE, PAPER_TILE);
  let seed = 0;
  const random = () => hash(seed++, 77);
  // Blotches: large soft discs in the green channel.
  context.globalCompositeOperation = "source-over";
  for (let index = 0; index < 260; index += 1) {
    const x = random() * PAPER_TILE;
    const y = random() * PAPER_TILE;
    const radius = 60 + random() * 220;
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
    const tone = random() < 0.5 ? 100 : 156;
    gradient.addColorStop(0, `rgba(128, ${tone}, 0, 0.35)`);
    gradient.addColorStop(1, "rgba(128, 128, 0, 0)");
    context.fillStyle = gradient;
    context.fillRect(x - radius, y - radius, 2 * radius, 2 * radius);
  }
  // Fibers: short curved strokes in the red channel.
  for (let index = 0; index < 2600; index += 1) {
    const x = random() * PAPER_TILE;
    const y = random() * PAPER_TILE;
    const length = 14 + random() * 60;
    const angle = random() * 2 * Math.PI;
    const tone = random() < 0.5 ? 70 : 190;
    context.strokeStyle = `rgba(${tone}, 128, 0, 0.35)`;
    context.lineWidth = 0.6 + random() * 1;
    context.beginPath();
    context.moveTo(x, y);
    context.quadraticCurveTo(
      x + Math.cos(angle) * length * 0.5 + (random() - 0.5) * 14,
      y + Math.sin(angle) * length * 0.5 + (random() - 0.5) * 14,
      x + Math.cos(angle) * length,
      y + Math.sin(angle) * length,
    );
    context.stroke();
  }
  return canvas;
}

function vec3(inks: Inks | readonly [number, number, number]): d.v3f {
  return d.vec3f(inks[0], inks[1], inks[2]);
}

export async function createFilmRenderer(
  canvas: HTMLCanvasElement,
): Promise<WebGpuFrameRenderer<FilmFrame>> {
  const root = await tgpu.init();
  const { architecture, vendor } = root.device.adapterInfo;
  console.info(`Riso film WebGPU adapter: ${vendor} ${architecture}`);
  const context = root.configureContext({ canvas, alphaMode: "opaque" });
  const size = [pageWidth, pageHeight] as const;

  const makeTarget = () =>
    root.createTexture({ format: "rgba16float", size }).$usage("render", "sampled");
  const sceneInkTexture = makeTarget();
  const sceneAxesTexture = makeTarget();
  const warpedInkTexture = makeTarget();
  const vectorTexture = root
    .createTexture({ format: "rgba8unorm", size })
    .$usage("render", "sampled");
  const nextVectorTexture = root
    .createTexture({ format: "rgba8unorm", size })
    .$usage("render", "sampled");
  const paperTexture = root
    .createTexture({ format: "rgba8unorm", size: [PAPER_TILE, PAPER_TILE] })
    .$usage("render", "sampled");
  paperTexture.write(drawPaperTile());

  const sceneInkView = sceneInkTexture.createView();
  const sceneAxesView = sceneAxesTexture.createView();
  const warpedInkView = warpedInkTexture.createView();
  const vectorView = vectorTexture.createView();
  const nextVectorView = nextVectorTexture.createView();
  const paperView = paperTexture.createView();
  const clampSampler = root.createSampler({ magFilter: "linear", minFilter: "linear" });
  const repeatSampler = root.createSampler({
    addressModeU: "repeat",
    addressModeV: "repeat",
    magFilter: "linear",
    minFilter: "linear",
  });

  const pageCanvas = document.createElement("canvas");
  pageCanvas.width = pageWidth;
  pageCanvas.height = pageHeight;
  const pageContext = pageCanvas.getContext("2d");
  if (!pageContext) {
    throw new Error("No 2D context for the page plates");
  }

  const zeroFace = {
    n: d.vec3f(0, 0, 1),
    origin: d.vec3f(0),
    tint: 0,
    u: d.vec3f(1, 0, 0),
    v: d.vec3f(0, 1, 0),
  };
  const sceneState = root.createUniform(SceneState, {
    back: d.vec3f(0, 0, 1),
    center: d.vec2f(960, 540),
    face0: zeroFace,
    face1: zeroFace,
    face2: zeroFace,
    face3: zeroFace,
    face4: zeroFace,
    face5: zeroFace,
    halfHeight: 3,
    hazeDistance: 100,
    hazeStart: 0,
    innerTone: d.vec3f(0),
    light: d.vec3f(0, 1, 0),
    lit: 0,
    mode: 0,
    pageDepth: 0,
    printRadius: d.vec3f(1000),
    probe: d.vec3f(0),
    probeStart: d.vec3f(0),
    restDepth: 9,
    revealRadius: 1,
    revealTone: d.vec3f(0),
    right: d.vec3f(1, 0, 0),
    shadeTone: d.vec3f(0),
    shadow: 0,
    shadowTone: d.vec3f(0),
    spongeCenter: d.vec3f(0),
    spongeHalfSize: 1,
    spongeLevels: 0,
    tanHalfFieldOfView: 0,
    lookAt: d.vec3f(0),
    up: d.vec3f(0, 1, 0),
    xTone: d.vec3f(0),
    yTone: d.vec3f(0),
    zTone: d.vec3f(0),
  });
  const warpState = root.createUniform(WarpState, {
    center: d.vec2f(960, 540),
    enabled: 0,
    hexagonRadius: 300,
    innerTone: d.vec3f(0),
    lastSideInk: d.vec3f(0),
    lastSideWidth: 120,
    sideInk0: d.vec3f(0),
    sideInk1: d.vec3f(0),
    sideInk2: d.vec3f(0),
    sideInk3: d.vec3f(0),
    sideWidths: d.vec4f(120, 120, 0, 0),
    spin: 0,
    xTone: d.vec3f(0),
    yTone: d.vec3f(0),
    zTone: d.vec3f(0),
  });
  const printState = root.createUniform(PrintState, {
    blueRegistration: d.vec3f(0),
    pageTurn: 0,
    pan: d.vec2f(0),
    pinkRegistration: d.vec3f(0),
    printIndex: 0,
    rotation: 0,
    scale: 1,
    slateRegistration: d.vec3f(0),
  });

  // ---------- the paper cube ----------

  const faceAt = (index: number): d.Infer<typeof Face> => {
    "use gpu";
    const state = sceneState.$;
    if (index === 0) {
      return Face(state.face0);
    }
    if (index === 1) {
      return Face(state.face1);
    }
    if (index === 2) {
      return Face(state.face2);
    }
    if (index === 3) {
      return Face(state.face3);
    }
    if (index === 4) {
      return Face(state.face4);
    }
    return Face(state.face5);
  };

  const faceDistance = (point: d.v3f, index: number): number => {
    "use gpu";
    const face = faceAt(index);
    const offset = std.sub(point, face.origin);
    const local = d.vec3f(
      std.dot(offset, face.u),
      std.dot(offset, face.v),
      std.dot(offset, face.n) + PAPER_HALF_THICKNESS,
    );
    const slab = boxDistance(local, d.vec3f(1, 1, PAPER_HALF_THICKNESS));
    return std.max(slab, -rectangleDistance(local.xy, HOLE_HALF_SIZE));
  };

  const netDistance = (point: d.v3f): number => {
    "use gpu";
    let distance = d.f32(1_000);
    for (let index = 0; index < 6; index += 1) {
      distance = std.min(distance, faceDistance(point, index));
    }
    return distance;
  };

  const netNormal = (point: d.v3f): d.v3f => {
    "use gpu";
    const epsilon = 0.0006;
    return std.normalize(
      d.vec3f(
        netDistance(std.add(point, d.vec3f(epsilon, 0, 0))) -
          netDistance(std.sub(point, d.vec3f(epsilon, 0, 0))),
        netDistance(std.add(point, d.vec3f(0, epsilon, 0))) -
          netDistance(std.sub(point, d.vec3f(0, epsilon, 0))),
        netDistance(std.add(point, d.vec3f(0, 0, epsilon))) -
          netDistance(std.sub(point, d.vec3f(0, 0, epsilon))),
      ),
    );
  };

  const netShadow = (origin: d.v3f, direction: d.v3f): number => {
    "use gpu";
    let light = d.f32(1);
    let distance = d.f32(0.02);
    for (let step = 0; step < 40; step += 1) {
      const sample = netDistance(std.add(origin, std.mul(direction, distance)));
      light = std.min(light, (9 * sample) / distance);
      distance += std.clamp(sample, 0.01, 0.3);
      if (light < 0.001 || distance > 8) {
        break;
      }
    }
    return std.clamp(light, 0, 1);
  };

  const axisInk = (axes: d.v3f): d.v3f => {
    "use gpu";
    const state = sceneState.$;
    return std.add(
      std.add(std.mul(state.xTone, axes.x), std.mul(state.yTone, axes.y)),
      std.mul(state.zTone, axes.z),
    );
  };

  const netHit = (point: d.v3f): d.Infer<typeof Hit> => {
    "use gpu";
    const state = sceneState.$;
    const normal = netNormal(point);
    let nearest = d.i32(0);
    let nearestDistance = d.f32(1_000);
    for (let index = 0; index < 6; index += 1) {
      const distance = faceDistance(point, index);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = index;
      }
    }
    const face = faceAt(nearest);
    const facing = std.abs(std.dot(normal, face.n)) > 0.7;
    const inner = facing && std.dot(normal, face.n) < 0;
    const axes = std.mul(normal, normal);
    const lift = std.add(point, std.mul(normal, 0.003));
    const diffuse = std.max(std.dot(normal, state.light), 0);
    const shadow = netShadow(lift, state.light);
    const darkness = 1 - std.clamp(0.25 + 0.85 * diffuse * shadow, 0, 1);
    let ink = std.mul(axisInk(axes), face.tint);
    let axesOut = d.vec4f(std.mul(axes, face.tint), 0);
    if (inner) {
      ink = std.mul(state.innerTone, face.tint);
      axesOut = d.vec4f(0, 0, 0, face.tint);
    }
    ink = std.add(ink, std.mul(state.shadeTone, state.lit * darkness * face.tint));
    return Hit({ axes: axesOut, ink });
  };

  // ---------- the giant ----------

  /**
  Point in its paper cell, from -1 to 1. Cells have half size 1 and tile the giant from its corner,
  so the cell centers sit on even offsets from the paper cube at the origin.
  */
  const cellPoint = (point: d.v3f): d.v3f => {
    "use gpu";
    const state = sceneState.$;
    const fromCorner = std.add(std.sub(point, state.spongeCenter), d.vec3f(state.spongeHalfSize));
    return std.sub(std.mul(std.fract(std.mul(fromCorner, 0.5)), 2), d.vec3f(1));
  };

  /**
  The sponge of hollow paper cells. Each level opens only when its tunnels are wider than two
  pixels, and levels at and below `restDepth` open only near the probe. Walls thicken with the
  pixel footprint until far cells are solid.
  */
  const spongeDistance = (point: d.v3f, footprint: number, useProbe: number): number => {
    "use gpu";
    const state = sceneState.$;
    const halfSize = state.spongeHalfSize;
    const local = std.div(std.sub(point, state.spongeCenter), halfSize);
    let distance = boxDistance(local, d.vec3f(1)) * halfSize;
    const closedWidth = 2 * footprint;
    // Distance to the probe path so far: the giant stays awake where the probe passed.
    const path = std.sub(state.probe, state.probeStart);
    const along = std.clamp(
      std.dot(std.sub(point, state.probeStart), path) / std.max(std.dot(path, path), 0.000001),
      0,
      1,
    );
    const probeDistance = std.length(
      std.sub(point, std.add(state.probeStart, std.mul(path, along))),
    );
    let period = d.f32(2);
    for (let level = 0; level < MAXIMUM_LEVELS; level += 1) {
      if (level >= state.spongeLevels) {
        break;
      }
      const tunnelWidth = (period * halfSize) / 3;
      const lod = std.clamp(tunnelWidth / closedWidth - 1, 0, 1);
      if (lod <= 0) {
        break;
      }
      let open = d.f32(1);
      if (level >= state.restDepth) {
        const radius = state.revealRadius * (1 - 0.12 * d.f32(level - state.restDepth));
        open = d.f32(useProbe) * (1 - std.smoothstep(0.45 * radius, radius, probeDistance));
      }
      const halfWidth = (lod * open) / 6;
      if (halfWidth > 0) {
        const cellPoint = std.sub(
          std.fract(std.div(std.add(local, d.vec3f(1)), period)),
          d.vec3f(0.5),
        );
        distance = std.max(distance, -tunnelDistance(cellPoint, halfWidth) * period * halfSize);
      }
      period = period / 3;
    }
    // Paper cells of half size 1: a wall on the inner side of each cell face, with a hole.
    const cell = cellPoint(point);
    const wall = std.clamp(2 * PAPER_HALF_THICKNESS + 3 * footprint, 2 * PAPER_HALF_THICKNESS, 1);
    let cellDistance = boxDistance(cell, d.vec3f(1));
    if (wall < 0.999) {
      cellDistance = std.max(cellDistance, -boxDistance(cell, d.vec3f(1 - wall)));
    }
    const holeLod = std.clamp((2 * HOLE_HALF_SIZE) / closedWidth - 1, 0, 1);
    let holeOpen = holeLod;
    if (state.spongeLevels >= state.restDepth) {
      holeOpen =
        holeLod *
        d.f32(useProbe) *
        (1 - std.smoothstep(0.3 * state.revealRadius, 0.8 * state.revealRadius, probeDistance));
    }
    if (holeOpen > 0) {
      cellDistance = std.max(cellDistance, -tunnelDistance(cell, HOLE_HALF_SIZE * holeOpen));
    }
    return std.max(distance, cellDistance);
  };

  const spongeNormal = (point: d.v3f, footprint: number, epsilon: number): d.v3f => {
    "use gpu";
    const a = d.vec3f(1, -1, -1);
    const b = d.vec3f(-1, -1, 1);
    const c = d.vec3f(-1, 1, -1);
    const e = d.vec3f(1, 1, 1);
    return std.normalize(
      std.add(
        std.add(
          std.mul(a, spongeDistance(std.add(point, std.mul(a, epsilon)), footprint, 1)),
          std.mul(b, spongeDistance(std.add(point, std.mul(b, epsilon)), footprint, 1)),
        ),
        std.add(
          std.mul(c, spongeDistance(std.add(point, std.mul(c, epsilon)), footprint, 1)),
          std.mul(e, spongeDistance(std.add(point, std.mul(e, epsilon)), footprint, 1)),
        ),
      ),
    );
  };

  const spongeOcclusion = (
    point: d.v3f,
    normal: d.v3f,
    footprint: number,
    reach: number,
  ): number => {
    "use gpu";
    let occlusion = d.f32(0);
    let weight = d.f32(0.5);
    for (let sample = 1; sample <= 4; sample += 1) {
      const offset = reach * d.f32(sample);
      const distance = spongeDistance(std.add(point, std.mul(normal, offset)), footprint, 1);
      occlusion += weight * std.clamp((offset - distance) / offset, 0, 1);
      weight *= 0.5;
    }
    return std.clamp(occlusion, 0, 1);
  };

  // ---------- scene pass ----------

  const traceSample = (pagePixel: d.v2f): d.Infer<typeof Hit> => {
    "use gpu";
    const state = sceneState.$;
    const screen = d.vec2f(
      (pagePixel.x - state.center.x) / 540,
      (state.center.y - pagePixel.y) / 540,
    );
    const lateral = std.add(std.mul(state.right, screen.x), std.mul(state.up, screen.y));
    const focal = std.add(state.lookAt, std.mul(lateral, state.halfHeight));
    const direction = std.normalize(
      std.sub(std.mul(lateral, state.tanHalfFieldOfView), state.back),
    );
    const along = -std.dot(direction, state.back);
    const pixelWorld = state.halfHeight / 540;
    let empty = Hit({ axes: d.vec4f(0), ink: d.vec3f(0) });

    if (state.mode === 1) {
      let start = d.f32(14);
      if (state.tanHalfFieldOfView > 0.0001) {
        start = std.min(start, state.halfHeight / state.tanHalfFieldOfView / along);
      }
      const origin = std.sub(focal, std.mul(direction, start));
      let distance = d.f32(0);
      const threshold = 0.2 * pixelWorld;
      for (let step = 0; step < 180; step += 1) {
        const point = std.add(origin, std.mul(direction, distance));
        const sample = netDistance(point);
        if (sample < threshold) {
          return netHit(point);
        }
        distance += sample;
        if (distance > start + 14) {
          break;
        }
      }
      // The page plane behind the cut-out takes its shadow.
      const planeDistance =
        (-state.pageDepth - std.dot(std.sub(origin, state.lookAt), state.back)) /
        std.dot(direction, state.back);
      if (planeDistance > 0 && state.shadow > 0) {
        const ground = std.add(origin, std.mul(direction, planeDistance));
        const light = netShadow(ground, state.light);
        empty = Hit({
          axes: d.vec4f(0),
          ink: std.mul(state.shadowTone, state.shadow * (1 - light)),
        });
      }
      return empty;
    }

    if (state.mode === 2) {
      const halfSize = state.spongeHalfSize + 0.05;
      // Enter the bounding box before marching.
      const relative = std.sub(focal, state.spongeCenter);
      const inverse = std.div(d.vec3f(1), direction);
      let start = d.f32(4 * state.spongeHalfSize);
      if (state.tanHalfFieldOfView > 0.0001) {
        start = std.min(start, state.halfHeight / state.tanHalfFieldOfView / along);
      }
      const originRelative = std.sub(relative, std.mul(direction, start));
      const t0 = std.mul(std.sub(d.vec3f(-halfSize), originRelative), inverse);
      const t1 = std.mul(std.sub(d.vec3f(halfSize), originRelative), inverse);
      const near = std.min(t0, t1);
      const far = std.max(t0, t1);
      const enter = std.max(std.max(near.x, near.y), std.max(near.z, 0));
      const exit = std.min(std.min(far.x, far.y), far.z);
      if (enter > exit) {
        return empty;
      }
      const origin = std.sub(focal, std.mul(direction, start));
      const cameraToPlane = state.halfHeight / std.max(state.tanHalfFieldOfView, 0.0001);
      let distance = enter;
      for (let step = 0; step < 320; step += 1) {
        const point = std.add(origin, std.mul(direction, distance));
        const depthBeyondPlane = -std.dot(std.sub(point, state.lookAt), state.back);
        const footprint = pixelWorld * std.max(0.02, 1 + depthBeyondPlane / cameraToPlane);
        const threshold = 0.25 * footprint;
        const sample = spongeDistance(point, footprint, 1);
        if (sample < threshold) {
          const normal = spongeNormal(point, footprint, std.max(threshold, 0.0005));
          const axes = std.mul(normal, normal);
          const cell = cellPoint(point);
          const wall = std.clamp(
            2 * PAPER_HALF_THICKNESS + 3 * footprint,
            2 * PAPER_HALF_THICKNESS,
            1,
          );
          const inner =
            wall < 0.9 &&
            std.max(std.abs(cell.x), std.max(std.abs(cell.y), std.abs(cell.z))) < 1 - 0.5 * wall;
          let ink = axisInk(axes);
          let axesOut = d.vec4f(axes, 0);
          if (inner) {
            ink = d.vec3f(state.innerTone);
            axesOut = d.vec4f(0, 0, 0, 1);
          }
          const occlusion = spongeOcclusion(point, normal, footprint, std.max(4 * footprint, 0.05));
          ink = std.add(ink, std.mul(state.shadeTone, occlusion));
          const restDistance = spongeDistance(point, footprint, 0);
          if (restDistance > 4 * threshold) {
            ink = std.add(ink, state.revealTone);
          }
          const haze =
            1 - std.exp(-std.max(depthBeyondPlane - state.hazeStart, 0) / state.hazeDistance);
          const reach = std.length(point);
          const radius = state.printRadius;
          const printed = d.vec3f(
            1 - std.smoothstep(radius.x * 0.8 - 1, radius.x, reach),
            1 - std.smoothstep(radius.y * 0.8 - 1, radius.y, reach),
            1 - std.smoothstep(radius.z * 0.8 - 1, radius.z, reach),
          );
          return Hit({ axes: axesOut, ink: std.mul(std.mul(ink, 1 - haze), printed) });
        }
        distance += std.max(0.8 * sample, 0.5 * threshold);
        if (distance > exit) {
          break;
        }
      }
    }
    return empty;
  };

  const sceneFragment = tgpu.fragmentFn({ in: { uv: d.vec2f }, out: SceneOutput })(({ uv }) => {
    "use gpu";
    if (sceneState.$.mode === 0) {
      return { axes: d.vec4f(0), ink: d.vec4f(0) };
    }
    const pixel = std.mul(uv, d.vec2f(pageWidth, pageHeight));
    let ink = d.vec3f(0);
    let axes = d.vec4f(0);
    for (let sample = 0; sample < 4; sample += 1) {
      const offset = d.vec2f(
        (d.f32(sample % 2) - 0.5) * 0.5,
        (std.floor(d.f32(sample) / 2) - 0.5) * 0.5,
      );
      const hit = traceSample(std.add(pixel, offset));
      ink = std.add(ink, hit.ink);
      axes = std.add(axes, hit.axes);
    }
    return { axes: std.div(axes, 4), ink: d.vec4f(std.div(ink, 4), 1) };
  });

  // ---------- warp pass ----------

  const sideWidth = (sideIndex: number): number => {
    "use gpu";
    const state = warpState.$;
    if (sideIndex === 0) {
      return state.sideWidths.x;
    }
    if (sideIndex === 1) {
      return state.sideWidths.y;
    }
    if (sideIndex === 2) {
      return state.sideWidths.z;
    }
    if (sideIndex === 3) {
      return state.sideWidths.w;
    }
    return state.lastSideWidth;
  };

  const sideInk = (sideIndex: number): d.v3f => {
    "use gpu";
    const state = warpState.$;
    if (sideIndex === 0) {
      return d.vec3f(state.sideInk0);
    }
    if (sideIndex === 1) {
      return d.vec3f(state.sideInk1);
    }
    if (sideIndex === 2) {
      return d.vec3f(state.sideInk2);
    }
    if (sideIndex === 3) {
      return d.vec3f(state.sideInk3);
    }
    return d.vec3f(state.lastSideInk);
  };

  /** Source cube face of each side: 0 top, 1 left, 2 right. New sides reuse a face. */
  const sideSourceFace = (sideIndex: number): number => {
    "use gpu";
    if (sideIndex === 0) {
      return 0;
    }
    if (sideIndex === 1 || sideIndex === 3) {
      return 1;
    }
    return 2;
  };

  const angleRay = (degrees: number): d.v2f => {
    "use gpu";
    const radians = (degrees * Math.PI) / 180;
    return d.vec2f(std.cos(radians), std.sin(radians));
  };

  const cross2 = (a: d.v2f, b: d.v2f): number => {
    "use gpu";
    return a.x * b.y - a.y * b.x;
  };

  const sampleAt = (offsetPixel: d.v2f): d.v2f => {
    "use gpu";
    const state = warpState.$;
    return d.vec2f(
      (state.center.x + offsetPixel.x) / pageWidth,
      (state.center.y - offsetPixel.y) / pageHeight,
    );
  };

  /** Flat ink of a source point, with the side ink in place of the source face ink. */
  const warpedSourceInk = (sourcePixel: d.v2f, sideIndex: number, sourceFace: number): d.v3f => {
    "use gpu";
    const state = warpState.$;
    const axes = std.textureSampleLevel(sceneAxesView.$, clampSampler.$, sampleAt(sourcePixel), 0);
    const tone = sideInk(sideIndex);
    let xTone = d.vec3f(state.xTone);
    let yTone = d.vec3f(state.yTone);
    let zTone = d.vec3f(state.zTone);
    if (sourceFace === 0) {
      yTone = d.vec3f(tone);
    } else if (sourceFace === 1) {
      xTone = d.vec3f(tone);
    } else {
      zTone = d.vec3f(tone);
    }
    return std.add(
      std.add(std.mul(xTone, axes.x), std.mul(yTone, axes.y)),
      std.add(std.mul(zTone, axes.z), std.mul(state.innerTone, axes.w)),
    );
  };

  const sideStartDegrees = (sideIndex: number): number => {
    "use gpu";
    let start = 90 - sideWidth(0) / 2;
    for (let index = 0; index < 5; index += 1) {
      if (index >= sideIndex) {
        break;
      }
      start += sideWidth(index);
    }
    return start;
  };

  const sideColor = (pixel: d.v2f, sideIndex: number): d.v3f => {
    "use gpu";
    const state = warpState.$;
    const start = sideStartDegrees(sideIndex);
    const width = sideWidth(sideIndex);
    const u = angleRay(start);
    const v = angleRay(start + width);
    const growth = std.max(std.smoothstep(0, 70, width), 0.02);
    const determinant = cross2(u, v) * state.hexagonRadius * growth;
    const margin = 1 / (state.hexagonRadius * growth);
    const a = std.max(cross2(pixel, v) / determinant, margin);
    const b = std.max(cross2(u, pixel) / determinant, margin);
    const sourceFace = sideSourceFace(sideIndex);
    const sourceStart = 30 + 120 * d.f32(sourceFace);
    const sourcePixel = std.mul(
      std.add(std.mul(angleRay(sourceStart), a), std.mul(angleRay(sourceStart + 120), b)),
      state.hexagonRadius,
    );
    return warpedSourceInk(sourcePixel, sideIndex, sourceFace);
  };

  const neighborSide = (sideIndex: number, direction: number): number => {
    "use gpu";
    let neighbor = sideIndex;
    for (let offset = 1; offset < 5; offset += 1) {
      const index = (sideIndex + direction * offset + 10) % 5;
      if (sideWidth(index) > 0) {
        neighbor = index;
        break;
      }
    }
    return neighbor;
  };

  const warpFragment = tgpu.fragmentFn({ in: { uv: d.vec2f }, out: d.vec4f })(({ uv }) => {
    "use gpu";
    const state = warpState.$;
    if (state.enabled === 0) {
      return std.textureSampleLevel(sceneInkView.$, clampSampler.$, uv, 0);
    }
    const page = std.mul(uv, d.vec2f(pageWidth, pageHeight));
    const pixel = rotate2(d.vec2f(page.x - state.center.x, state.center.y - page.y), -state.spin);
    const angle = (std.atan2(pixel.y, pixel.x) * 180) / Math.PI;
    const relative = std.fract((angle - sideStartDegrees(0)) / 360 + 2) * 360;
    let sideIndex = 4;
    let cumulative = d.f32(0);
    for (let index = 0; index < 5; index += 1) {
      cumulative += sideWidth(index);
      if (relative < cumulative) {
        sideIndex = index;
        break;
      }
    }
    let color = sideColor(pixel, sideIndex);
    const start = sideStartDegrees(sideIndex);
    const startDistance = cross2(angleRay(start), pixel);
    if (startDistance < 0.5) {
      const previous = neighborSide(sideIndex, -1);
      color = std.mix(color, sideColor(pixel, previous), std.clamp(0.5 - startDistance, 0, 0.5));
    }
    const endDistance = cross2(pixel, angleRay(start + sideWidth(sideIndex)));
    if (endDistance < 0.5) {
      const next = neighborSide(sideIndex, 1);
      color = std.mix(color, sideColor(pixel, next), std.clamp(0.5 - endDistance, 0, 0.5));
    }
    return d.vec4f(color, 1);
  });

  // ---------- riso print pass ----------

  const registered = (pagePoint: d.v2f, registration: d.v3f): d.v2f => {
    "use gpu";
    const centered = std.sub(pagePoint, d.vec2f(pageWidth / 2, pageHeight / 2));
    return std.add(
      std.add(rotate2(centered, registration.z), d.vec2f(pageWidth / 2, pageHeight / 2)),
      registration.xy,
    );
  };

  /** Ink coverage of one plate at a registered page point: the vector plate and the scene. */
  const plateCoverage = (point: d.v2f, plate: number, page: number): number => {
    "use gpu";
    const uv = std.div(point, d.vec2f(pageWidth, pageHeight));
    if (page === 1) {
      const next = std.textureSampleLevel(nextVectorView.$, clampSampler.$, uv, 0);
      if (plate === 0) {
        return next.x;
      }
      if (plate === 1) {
        return next.y;
      }
      return next.z;
    }
    const vector = std.textureSampleLevel(vectorView.$, clampSampler.$, uv, 0);
    const scene = std.clamp(
      std.textureSampleLevel(warpedInkView.$, clampSampler.$, uv, 0),
      d.vec4f(0),
      d.vec4f(1),
    );
    if (plate === 0) {
      return 1 - (1 - vector.x) * (1 - scene.x);
    }
    if (plate === 1) {
      return 1 - (1 - vector.y) * (1 - scene.y);
    }
    return 1 - (1 - vector.z) * (1 - scene.z);
  };

  /** Riso ink of one plate: halftone dots, uneven drum density, roller bands, and pinholes. */
  const plateInk = (
    pagePoint: d.v2f,
    plate: number,
    page: number,
    registration: d.v3f,
    angle: number,
    cell: number,
    footprint: number,
  ): number => {
    "use gpu";
    const print = printState.$.printIndex;
    const point = registered(pagePoint, registration);
    let coverage = plateCoverage(point, plate, page);
    if (coverage < 0.008) {
      return 0;
    }
    const grain = hash21(std.add(std.floor(point), d.vec2f(print * 7.1 + d.f32(plate) * 131, 0)));
    coverage = coverage + (grain - 0.5) * 0.05;
    const dots = halftone(point, angle, cell, coverage, footprint);
    const blotch = fractalNoise(
      std.add(
        std.div(point, 260),
        d.vec2f(d.f32(plate) * 17.3 + print * 0.013, d.f32(plate) * 5.1),
      ),
    );
    const bandNoise = valueNoise(d.vec2f(point.y / 57 + d.f32(plate) * 11.7, print * 0.21));
    const band = std.max(bandNoise - 0.55, 0) * 0.3;
    let density = 0.8 + 0.22 * blotch + 0.08 * (grain - 0.5) - band;
    const pinhole = hash21(
      std.add(std.floor(std.mul(point, 0.5)), d.vec2f(print * 3.7, d.f32(plate) * 91)),
    );
    if (pinhole > 0.9935) {
      density *= 0.25;
    }
    return dots * std.min(density, 1);
  };

  const foldShade = (x: number): number => {
    "use gpu";
    const offset = x - SPINE_X;
    let side = d.f32(0.55);
    let lift = d.f32(0);
    if (offset > 0) {
      side = 1;
      lift = 0.012;
    }
    return (
      1 -
      0.09 * std.exp(-std.pow(offset / 9, 2)) * side -
      0.045 * std.exp(-std.abs(offset) / 90) +
      0.035 * std.exp(-std.pow((offset + 5) / 2.2, 2)) -
      lift
    );
  };

  /** One printed page: paper, then the three plates multiplied over it. */
  const printPage = (pagePoint: d.v2f, page: number, footprint: number): d.v3f => {
    "use gpu";
    const state = printState.$;
    const paperShift = d.vec2f(
      hash21(d.vec2f(state.printIndex, 3)) * PAPER_TILE,
      hash21(d.vec2f(state.printIndex, 9)) * PAPER_TILE,
    );
    const paper = std.textureSampleLevel(
      paperView.$,
      repeatSampler.$,
      std.div(std.add(pagePoint, paperShift), PAPER_TILE),
      0,
    );
    const grain = hash21(std.add(std.floor(pagePoint), d.vec2f(state.printIndex * 13.1, 5)));
    const tone = 1 + (grain - 0.5) * 0.05 + (paper.y - 0.5) * 0.07 + (paper.x - 0.5) * 0.09;
    let color = std.mul(PAPER, tone * foldShade(pagePoint.x));
    const pink = plateInk(
      pagePoint,
      0,
      page,
      state.pinkRegistration,
      PINK_ANGLE,
      PINK_CELL,
      footprint,
    );
    const blue = plateInk(
      pagePoint,
      1,
      page,
      state.blueRegistration,
      BLUE_ANGLE,
      BLUE_CELL,
      footprint,
    );
    const slate = plateInk(
      pagePoint,
      2,
      page,
      state.slateRegistration,
      SLATE_ANGLE,
      SLATE_CELL,
      footprint,
    );
    color = std.mul(color, std.sub(d.vec3f(1), std.mul(std.sub(d.vec3f(1), PINK), pink)));
    color = std.mul(color, std.sub(d.vec3f(1), std.mul(std.sub(d.vec3f(1), BLUE), blue)));
    color = std.mul(color, std.sub(d.vec3f(1), std.mul(std.sub(d.vec3f(1), SLATE), slate)));
    return color;
  };

  const printFragment = tgpu.fragmentFn({ in: { uv: d.vec2f }, out: d.vec4f })(({ uv }) => {
    "use gpu";
    const state = printState.$;
    const screen = std.mul(uv, d.vec2f(pageWidth, pageHeight));
    const centered = std.sub(screen, d.vec2f(pageWidth / 2, pageHeight / 2));
    const pagePoint = std.add(
      std.add(
        std.div(rotate2(centered, -state.rotation), state.scale),
        d.vec2f(pageWidth / 2, pageHeight / 2),
      ),
      state.pan,
    );
    const footprint = 1 / state.scale;
    const turn = state.pageTurn;
    if (turn <= 0.0001) {
      return d.vec4f(printPage(pagePoint, 0, footprint), 1);
    }
    // The right half page turns over the spine. A point at distance r from the spine lifts
    // toward the eye by r sin(turn) and projects with a simple perspective.
    const offset = pagePoint.x - SPINE_X;
    const cos = std.cos(turn);
    const sin = std.sin(turn);
    const denominator = cos * EYE_DISTANCE + offset * sin;
    let onSheet = false;
    let sheetX = d.f32(0);
    let sheetY = d.f32(0);
    if (std.abs(denominator) > 0.001) {
      const reach = (offset * EYE_DISTANCE) / denominator;
      const depthScale = (EYE_DISTANCE - reach * sin) / EYE_DISTANCE;
      sheetY = pageHeight / 2 + (pagePoint.y - pageHeight / 2) * depthScale;
      sheetX = reach;
      onSheet =
        reach >= 0 &&
        reach <= pageWidth - SPINE_X &&
        sheetY >= 0 &&
        sheetY <= pageHeight &&
        depthScale > 0;
    }
    if (onSheet) {
      if (turn < Math.PI / 2) {
        const color = printPage(d.vec2f(SPINE_X + sheetX, sheetY), 0, footprint);
        return d.vec4f(std.mul(color, 0.82 + 0.18 * cos), 1);
      }
      // Thin riso paper: the front print shows through the back, mirrored.
      const through = printPage(d.vec2f(SPINE_X + sheetX, sheetY), 0, footprint);
      const color = std.mul(
        printPage(d.vec2f(SPINE_X - sheetX, sheetY), 1, footprint),
        std.mix(d.vec3f(1), std.div(through, PAPER), 0.16),
      );
      return d.vec4f(std.mul(color, 0.82 + 0.18 * std.abs(cos)), 1);
    }
    let under = d.vec3f(0);
    if (pagePoint.x >= SPINE_X) {
      under = printPage(pagePoint, 1, footprint);
    } else {
      under = printPage(pagePoint, 0, footprint);
    }
    // Soft shadow of the lifted sheet on the page below it.
    const edge = SPINE_X + (pageWidth - SPINE_X) * cos;
    const shadow = 0.22 * sin * std.exp(-std.abs(pagePoint.x - edge) / 140);
    return d.vec4f(std.mul(under, 1 - shadow), 1);
  });

  const scenePipeline = root.createRenderPipeline({
    fragment: sceneFragment,
    targets: { axes: { format: "rgba16float" }, ink: { format: "rgba16float" } },
    vertex: common.fullScreenTriangle,
  });
  const warpPipeline = root.createRenderPipeline({
    fragment: warpFragment,
    targets: { format: "rgba16float" },
    vertex: common.fullScreenTriangle,
  });
  const printPipeline = root.createRenderPipeline({
    fragment: printFragment,
    vertex: common.fullScreenTriangle,
  });
  await Promise.all([
    scenePipeline.initAsync(),
    warpPipeline.initAsync(),
    printPipeline.initAsync(),
  ]);

  return {
    destroy: () => root.destroy(),
    render: async (frame) => {
      await waitForFilmFonts();
      drawFilmPage(pageContext, frame, "current");
      vectorTexture.write(pageCanvas);
      if (frame.pageTurn > 0) {
        drawFilmPage(pageContext, frame, "next");
        nextVectorTexture.write(pageCanvas);
      }

      const { scene } = frame;
      const { camera, sponge, tones, warp } = scene;
      const face = (index: 0 | 1 | 2 | 3 | 4 | 5) => {
        const { n, origin, tint, u, v } = scene.faces[index];
        return { n: vec3(n), origin: vec3(origin), tint, u: vec3(u), v: vec3(v) };
      };
      sceneState.write({
        back: vec3(camera.back),
        center: d.vec2f(...camera.center),
        face0: face(0),
        face1: face(1),
        face2: face(2),
        face3: face(3),
        face4: face(4),
        face5: face(5),
        halfHeight: camera.halfHeight,
        hazeDistance: sponge.hazeDistance,
        hazeStart: sponge.hazeStart,
        innerTone: vec3(tones.inner),
        light: vec3(scene.light),
        lit: scene.lit,
        mode: scene.mode === "net" ? 1 : scene.mode === "sponge" ? 2 : 0,
        pageDepth: scene.pageDepth,
        printRadius: vec3(sponge.printRadius),
        probe: vec3(sponge.probe),
        probeStart: vec3(sponge.probeStart),
        restDepth: sponge.restDepth,
        revealRadius: sponge.revealRadius,
        revealTone: vec3(tones.reveal),
        right: vec3(camera.right),
        shadeTone: vec3(tones.shade),
        shadow: scene.shadow,
        shadowTone: vec3(tones.shadow),
        spongeCenter: vec3(sponge.center),
        spongeHalfSize: sponge.halfSize,
        spongeLevels: sponge.levels,
        tanHalfFieldOfView: camera.tanHalfFieldOfView,
        lookAt: vec3(camera.target),
        up: vec3(camera.up),
        xTone: vec3(tones.x),
        yTone: vec3(tones.y),
        zTone: vec3(tones.z),
      });
      const [top, left, lowerLeft, lowerRight, rightSide] = warp.sides;
      const [ink0, ink1, ink2, ink3, ink4] = warp.sideInks;
      warpState.write({
        center: d.vec2f(...camera.center),
        enabled: warp.enabled ? 1 : 0,
        hexagonRadius: (2 * Math.sqrt(2 / 3) * 540) / camera.halfHeight,
        innerTone: vec3(tones.inner),
        lastSideInk: vec3(ink4),
        lastSideWidth: rightSide,
        sideInk0: vec3(ink0),
        sideInk1: vec3(ink1),
        sideInk2: vec3(ink2),
        sideInk3: vec3(ink3),
        sideWidths: d.vec4f(top, left, lowerLeft, lowerRight),
        spin: warp.spin,
        xTone: vec3(tones.x),
        yTone: vec3(tones.y),
        zTone: vec3(tones.z),
      });
      const [pinkRegistration, blueRegistration, slateRegistration] = frame.registration;
      const registration = ({ dx, dy, rotation }: FilmFrame["registration"][0]) =>
        d.vec3f(dx, dy, rotation);
      printState.write({
        blueRegistration: registration(blueRegistration),
        pageTurn: frame.pageTurn,
        pan: d.vec2f(frame.page.panX, frame.page.panY),
        pinkRegistration: registration(pinkRegistration),
        printIndex: frame.printIndex % 4096,
        rotation: frame.page.rotation,
        scale: frame.page.scale,
        slateRegistration: registration(slateRegistration),
      });

      scenePipeline
        .withColorAttachment({ axes: { view: sceneAxesTexture }, ink: { view: sceneInkTexture } })
        .draw(3);
      warpPipeline.withColorAttachment({ view: warpedInkTexture }).draw(3);
      printPipeline.withColorAttachment({ view: context }).draw(3);
      return root.device.queue.onSubmittedWorkDone();
    },
  };
}
