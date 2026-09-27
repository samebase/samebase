import { common, d, std, tgpu } from "typegpu";

import type { WebGpuFrameRenderer } from "../../webgpu/useWebGpuFrame";
import { drawBackdrop, drawOverlay, waitForFilmV3Fonts } from "./filmV3Page";
import type { FilmV3Frame, Vector3 } from "./filmV3Timeline";

const MAXIMUM_SAMPLE_GRID = 4;
const MAXIMUM_RAY_STEPS = 200;
const MAXIMUM_MENGER_DEPTH = 8;
const BEAM_COUNT = 32;
/** The fan cards: a rhombus side spans 120 degrees, and sin(120 degrees) scales its edge distances. */
const RHOMBUS_SINE = Math.sin((2 * Math.PI) / 3);

const SceneState = d.struct({
  aspectRatio: d.f32,
  /** One pixel in screen units, where the frame height spans 2. */
  pixelSize: d.f32,
  sampleGrid: d.i32,
  right: d.vec3f,
  up: d.vec3f,
  /** Unit vector from the focal point toward the camera. */
  back: d.vec3f,
  focus: d.vec3f,
  /** Half the frame height in world units at the focal plane through `target`. */
  halfHeight: d.f32,
  /** 0 is orthographic. */
  tanHalfFieldOfView: d.f32,
  rayStart: d.f32,
  rayEnd: d.f32,
  /** Unit vector toward the key light. */
  light: d.vec3f,
  ambient: d.f32,
  key: d.f32,
  aoScale: d.f32,
  /** 0 is the Menger sponge and 1 is the tesseract frame. */
  mode: d.i32,
  spongeCenter: d.vec3f,
  spongeHalfSize: d.f32,
  depth: d.i32,
  /** Levels below this one open only near the probe, as on the landing hero. */
  restDepth: d.i32,
  /** Probe in unit sponge coordinates, from 0 to 1 on each axis. */
  probe: d.vec3f,
  revealRadius: d.f32,
  openness: d.f32,
  tesseractHalfExtent: d.vec3f,
  floorHeight: d.f32,
  floorEnabled: d.i32,
  hazeColor: d.vec3f,
  hazeDensity: d.f32,
  hazeStart: d.f32,
  xTone: d.vec3f,
  yTone: d.vec3f,
  zTone: d.vec3f,
});

const CompositeState = d.struct({
  outputSize: d.vec2f,
  frameIndex: d.f32,
  grain: d.f32,
  shadowTint: d.vec3f,
  fanEnabled: d.i32,
  /** Hexagon center in pixels from the top left. */
  fanCenter: d.vec2f,
  fanRadius: d.f32,
  /** Darkness of the shadow that each card casts on the cards below it. */
  fanShadow: d.f32,
  /** Rotation of each card in degrees, counterclockwise. Card 0 is on top. */
  fanAngles: d.vec4f,
  /** Source face of each card: 0 top, 1 left, 2 right. */
  fanFaces: d.vec4f,
  fanBrightness: d.vec4f,
  /** 1 recolors the source face direction of the card with its tone. */
  fanRecolor: d.vec4f,
  fanTone0: d.vec3f,
  fanTone1: d.vec3f,
  fanTone2: d.vec3f,
  fanTone3: d.vec3f,
  xTone: d.vec3f,
  yTone: d.vec3f,
  zTone: d.vec3f,
});

const TraceSample = d.struct({
  color: d.vec3f,
  coverage: d.f32,
  /** Face direction weights times the shade, for the fan recolor. */
  toneShade: d.vec3f,
  floor: d.f32,
});

const SceneOutput = { aux: d.vec4f, color: d.vec4f, floor: d.vec4f };

const rectangleDistance = (point: d.v2f, halfSize: d.v2f): number => {
  "use gpu";
  const delta = std.sub(std.abs(point), halfSize);
  return std.length(std.max(delta, d.vec2f(0))) + std.min(std.max(delta.x, delta.y), 0);
};

const unitBoxDistance = (point: d.v3f): number => {
  "use gpu";
  const delta = std.sub(std.abs(point), d.vec3f(1));
  return std.length(std.max(delta, d.vec3f(0))) + std.min(std.max(delta.x, delta.y, delta.z), 0);
};

const crossDistance = (point: d.v3f): number => {
  "use gpu";
  return std.min(
    rectangleDistance(d.vec2f(point.x, point.y), d.vec2f(1)),
    rectangleDistance(d.vec2f(point.x, point.z), d.vec2f(1)),
    rectangleDistance(d.vec2f(point.y, point.z), d.vec2f(1)),
  );
};

const safeDivide = (numerator: number, denominator: number): number => {
  "use gpu";
  let safe = denominator;
  if (std.abs(safe) < 0.000001) {
    safe = 0.000001;
  }
  return numerator / safe;
};

/**
Chebyshev distance from `offset` to the box swept from half size `startHalf` to `endHalf` while its
center moves by `delta`, at sweep parameter `u`. The swept union is the convex hull of the two end
boxes, because the boxes are homothetic.
*/
const sweptBoxExcess = (
  offset: d.v3f,
  delta: d.v3f,
  startHalf: number,
  endHalf: number,
  u: number,
): number => {
  "use gpu";
  const clamped = std.clamp(u, 0, 1);
  const local = std.abs(std.sub(offset, std.mul(delta, clamped)));
  return std.max(local.x, local.y, local.z) - std.mix(startHalf, endHalf, clamped);
};

/**
Candidate sweep parameters where the excess can be smallest. The excess is the maximum of six lines
in the sweep parameter, so its minimum lies at an end (0, 1), at a kink of one axis (2 to 4), or
where the lines of two axes cross (5 to 10).
*/
const hullCandidate = (offset: d.v3f, delta: d.v3f, index: number): number => {
  "use gpu";
  if (index === 0) {
    return 0;
  }
  if (index === 1) {
    return 1;
  }
  if (index === 2) {
    return safeDivide(offset.x, delta.x);
  }
  if (index === 3) {
    return safeDivide(offset.y, delta.y);
  }
  if (index === 4) {
    return safeDivide(offset.z, delta.z);
  }
  if (index === 5) {
    return safeDivide(offset.x + offset.y, delta.x + delta.y);
  }
  if (index === 6) {
    return safeDivide(offset.x - offset.y, delta.x - delta.y);
  }
  if (index === 7) {
    return safeDivide(offset.x + offset.z, delta.x + delta.z);
  }
  if (index === 8) {
    return safeDivide(offset.x - offset.z, delta.x - delta.z);
  }
  if (index === 9) {
    return safeDivide(offset.y + offset.z, delta.y + delta.z);
  }
  return safeDivide(offset.y - offset.z, delta.y - delta.z);
};

/**
Signed distance to the hull of two axis-aligned cubes: the Euclidean distance to the swept cube at
the sweep parameter with the smallest Chebyshev excess. The zero set is the exact hull surface, so
finite differences give true normals, and a straight beam gets its exact box distance.
*/
const hullDistance = (point: d.v3f, start: d.v4f, end: d.v4f): number => {
  "use gpu";
  const offset = std.sub(point, start.xyz);
  const delta = std.sub(end.xyz, start.xyz);
  let bestU = d.f32(0);
  let bestExcess = d.f32(1000000);
  for (let index = 0; index < 11; index += 1) {
    const u = std.clamp(hullCandidate(offset, delta, index), 0, 1);
    const excess = sweptBoxExcess(offset, delta, start.w, end.w, u);
    if (excess < bestExcess) {
      bestExcess = excess;
      bestU = u;
    }
  }
  const box = std.sub(
    std.abs(std.sub(offset, std.mul(delta, bestU))),
    d.vec3f(std.mix(start.w, end.w, bestU)),
  );
  return std.length(std.max(box, d.vec3f(0))) + std.min(std.max(box.x, box.y, box.z), 0);
};

const segmentDistance = (point: d.v3f, start: d.v3f, end: d.v3f): number => {
  "use gpu";
  const along = std.sub(end, start);
  const fromStart = std.sub(point, start);
  const lengthSquared = std.max(std.dot(along, along), 0.000001);
  const u = std.clamp(std.dot(fromStart, along) / lengthSquared, 0, 1);
  return std.length(std.sub(fromStart, std.mul(along, u)));
};

const hash = (value: d.v2f): number => {
  "use gpu";
  return std.fract(std.sin(std.dot(value, d.vec2f(12.9898, 78.233))) * 43758.5453);
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

const pick4 = (values: d.v4f, index: number): number => {
  "use gpu";
  if (index === 0) {
    return values.x;
  }
  if (index === 1) {
    return values.y;
  }
  if (index === 2) {
    return values.z;
  }
  return values.w;
};

function vector([x, y, z]: Vector3): d.v3f {
  return d.vec3f(x, y, z);
}

export async function createFilmV3Renderer(
  canvas: HTMLCanvasElement,
): Promise<WebGpuFrameRenderer<FilmV3Frame>> {
  const root = await tgpu.init();
  const { architecture, vendor } = root.device.adapterInfo;
  console.info(`Film v3 WebGPU adapter: ${vendor} ${architecture}`);
  const context = root.configureContext({ canvas, alphaMode: "opaque" });
  const size = [canvas.width, canvas.height] as const;

  const makeTarget = () =>
    root.createTexture({ format: "rgba16float", size }).$usage("render", "sampled");
  const colorTexture = makeTarget();
  const auxTexture = makeTarget();
  const floorTexture = makeTarget();
  const backdropTexture = root
    .createTexture({ format: "rgba8unorm", size })
    .$usage("render", "sampled");
  const overlayTexture = root
    .createTexture({ format: "rgba8unorm", size })
    .$usage("render", "sampled");
  const colorView = colorTexture.createView();
  const auxView = auxTexture.createView();
  const floorView = floorTexture.createView();
  const backdropView = backdropTexture.createView();
  const overlayView = overlayTexture.createView();
  const linearSampler = root.createSampler({ magFilter: "linear", minFilter: "linear" });

  const pageCanvas = document.createElement("canvas");
  pageCanvas.width = canvas.width;
  pageCanvas.height = canvas.height;
  const pageContext = pageCanvas.getContext("2d");
  if (!pageContext) {
    throw new Error("No 2D context for the film v3 page");
  }

  const sceneState = root.createUniform(SceneState);
  const compositeState = root.createUniform(CompositeState);
  const beamState = root.createUniform(d.arrayOf(d.vec4f, BEAM_COUNT * 2));

  /**
  The landing hero opening: a channel below the rest depth opens by the smoothstep of its closeness
  to the probe, anchored toward the probe side of its parent hole.
  */
  const openingDistance = (
    localPoint: d.v2f,
    parentRetained: boolean,
    channelCenter: d.v2f,
    probePoint: d.v2f,
    probeAxisDistance: number,
    scale: number,
  ): number => {
    "use gpu";
    if (!parentRetained) {
      return 1000;
    }
    const channelDelta = std.sub(channelCenter, probePoint);
    const distanceFromProbe = std.length(
      d.vec3f(probeAxisDistance, channelDelta.x, channelDelta.y),
    );
    const closeness = 1 - distanceFromProbe / sceneState.$.revealRadius;
    if (closeness <= 0) {
      return 1000;
    }
    const normalized = std.min(closeness / 0.75, 1);
    const openness = normalized * normalized * (3 - 2 * normalized) * sceneState.$.openness;
    if (openness <= 0) {
      return 1000;
    }
    const holeSize = 1 / (3 * scale);
    const absoluteDelta = std.abs(channelDelta);
    const totalDelta = absoluteDelta.x + absoluteDelta.y;
    let weightA = d.f32(0.5);
    if (totalDelta > 0) {
      const directionalBlend = std.min(totalDelta / (holeSize * 0.5), 1);
      weightA = 0.5 + (absoluteDelta.x / totalDelta - 0.5) * directionalBlend;
    }
    const anchor = std.clamp(
      std.sub(d.vec2f(0.5), std.div(channelDelta, holeSize)),
      d.vec2f(0),
      d.vec2f(1),
    );
    const width = d.vec2f(std.pow(openness, weightA), std.pow(openness, 1 - weightA));
    const apertureCenter = std.div(
      std.mul(std.sub(std.mul(anchor, 2), d.vec2f(1)), std.sub(d.vec2f(1), width)),
      3,
    );
    return rectangleDistance(std.sub(localPoint, apertureCenter), std.div(width, 3)) / scale;
  };

  /** Distance and material of the unit Menger sponge (half size 1), after the landing hero. */
  const mengerSample = (point: d.v3f, threshold: number): d.v2f => {
    "use gpu";
    const state = sceneState.$;
    const outerDistance = unitBoxDistance(point);
    let removedDistance = d.f32(1000);
    let pointRemoved = d.bool(false);
    let xParentRetained = d.bool(true);
    let yParentRetained = d.bool(true);
    let zParentRetained = d.bool(true);
    let scale = d.f32(1);
    for (let iteration = 0; iteration < MAXIMUM_MENGER_DEPTH; iteration += 1) {
      if (iteration >= state.depth) {
        break;
      }
      if (iteration > 0 && 1 / (3 * scale) <= threshold) {
        break;
      }
      const shiftedPoint = std.add(std.mul(point, scale), d.vec3f(1));
      const repeatedPoint = std.sub(std.mul(std.fract(std.mul(shiftedPoint, 0.5)), 2), d.vec3f(1));
      const fullCrossDistance = crossDistance(std.mul(repeatedPoint, 3)) / (3 * scale);
      let removedCrossDistance = fullCrossDistance;
      if (iteration < state.restDepth) {
        if (fullCrossDistance <= 0) {
          pointRemoved = true;
        }
      } else {
        if (state.openness <= 0 || (!xParentRetained && !yParentRetained && !zParentRetained)) {
          break;
        }
        const unitPoint = std.clamp(
          std.add(std.mul(point, 0.5), d.vec3f(0.5)),
          d.vec3f(0),
          d.vec3f(0.999999),
        );
        const channelCenter = std.div(
          std.add(std.floor(std.mul(unitPoint, scale)), d.vec3f(0.5)),
          scale,
        );
        const probe = state.probe;
        const openingAlongX = openingDistance(
          d.vec2f(repeatedPoint.y, repeatedPoint.z),
          xParentRetained,
          d.vec2f(channelCenter.y, channelCenter.z),
          d.vec2f(probe.y, probe.z),
          std.min(probe.x, 1 - probe.x),
          scale,
        );
        const openingAlongY = openingDistance(
          d.vec2f(repeatedPoint.x, repeatedPoint.z),
          yParentRetained,
          d.vec2f(channelCenter.x, channelCenter.z),
          d.vec2f(probe.x, probe.z),
          std.min(probe.y, 1 - probe.y),
          scale,
        );
        const openingAlongZ = openingDistance(
          d.vec2f(repeatedPoint.x, repeatedPoint.y),
          zParentRetained,
          d.vec2f(channelCenter.x, channelCenter.y),
          d.vec2f(probe.x, probe.y),
          std.min(probe.z, 1 - probe.z),
          scale,
        );
        removedCrossDistance = std.min(openingAlongX, openingAlongY, openingAlongZ);
        if (removedCrossDistance <= 0) {
          pointRemoved = true;
        }
      }
      removedDistance = std.min(removedDistance, removedCrossDistance);
      const repeatedAbsolute = std.abs(repeatedPoint);
      const xInMiddleThird = repeatedAbsolute.x <= 1 / 3;
      const yInMiddleThird = repeatedAbsolute.y <= 1 / 3;
      const zInMiddleThird = repeatedAbsolute.z <= 1 / 3;
      xParentRetained = xParentRetained && !(yInMiddleThird && zInMiddleThird);
      yParentRetained = yParentRetained && !(xInMiddleThird && zInMiddleThird);
      zParentRetained = zParentRetained && !(xInMiddleThird && yInMiddleThird);
      scale = scale * 3;
    }
    let material = d.f32(0);
    if (outerDistance <= 0 && !pointRemoved) {
      material = 1;
    }
    return d.vec2f(std.max(outerDistance, -removedDistance), material);
  };

  const beamJoint = (index: number): d.v4f => {
    "use gpu";
    // @ts-expect-error A WGSL array read has no undefined case, and every index is below 64.
    return d.vec4f(beamState.$[index]);
  };

  const tesseractDistance = (point: d.v3f): number => {
    "use gpu";
    let best = d.f32(1000);
    for (let beam = 0; beam < BEAM_COUNT; beam += 1) {
      const start = beamJoint(beam * 2);
      const end = beamJoint(beam * 2 + 1);
      // The hull lies within the capsule around its axis with the corner radius of the larger cube.
      const bound = segmentDistance(point, start.xyz, end.xyz) - std.max(start.w, end.w) * 1.7321;
      if (bound < best) {
        best = std.min(best, hullDistance(point, start, end));
      }
    }
    return best;
  };

  /** Distance and material in world units. */
  const sceneSample = (point: d.v3f, threshold: number): d.v2f => {
    "use gpu";
    const state = sceneState.$;
    if (state.mode === 1) {
      return d.vec2f(tesseractDistance(point), 1);
    }
    const local = std.div(std.sub(point, state.spongeCenter), state.spongeHalfSize);
    const sample = mengerSample(local, threshold / state.spongeHalfSize);
    return d.vec2f(sample.x * state.spongeHalfSize, sample.y);
  };

  const surfaceNormal = (point: d.v3f, threshold: number): d.v3f => {
    "use gpu";
    const epsilon = threshold * 0.5;
    const a = d.vec3f(1, -1, -1);
    const b = d.vec3f(-1, -1, 1);
    const c = d.vec3f(-1, 1, -1);
    const e = d.vec3f(1, 1, 1);
    const sum = std.add(
      std.add(
        std.mul(a, sceneSample(std.add(point, std.mul(a, epsilon)), threshold).x),
        std.mul(b, sceneSample(std.add(point, std.mul(b, epsilon)), threshold).x),
      ),
      std.add(
        std.mul(c, sceneSample(std.add(point, std.mul(c, epsilon)), threshold).x),
        std.mul(e, sceneSample(std.add(point, std.mul(e, epsilon)), threshold).x),
      ),
    );
    return std.normalize(sum);
  };

  const softShadow = (origin: d.v3f, threshold: number): number => {
    "use gpu";
    const state = sceneState.$;
    let light = d.f32(1);
    let distance = state.aoScale * 0.5;
    for (let step = 0; step < 56; step += 1) {
      const sample = sceneSample(std.add(origin, std.mul(state.light, distance)), threshold).x;
      light = std.min(light, (8 * sample) / distance);
      distance += std.clamp(sample, state.aoScale * 0.25, state.aoScale * 8);
      if (light < 0.002 || distance > state.rayEnd) {
        break;
      }
    }
    return std.clamp(light, 0, 1);
  };

  const ambientOcclusion = (point: d.v3f, normal: d.v3f, threshold: number): number => {
    "use gpu";
    const state = sceneState.$;
    let occlusion = d.f32(0);
    let weight = d.f32(1);
    for (let sample = 1; sample <= 5; sample += 1) {
      const offset = state.aoScale * d.f32(sample);
      const distance = sceneSample(std.add(point, std.mul(normal, offset)), threshold).x;
      occlusion += (weight * (offset - distance)) / state.aoScale;
      weight *= 0.62;
    }
    return std.clamp(1 - 0.28 * occlusion, 0, 1);
  };

  const traceSample = (screenPoint: d.v2f): d.Infer<typeof TraceSample> => {
    "use gpu";
    const state = sceneState.$;
    const lateral = std.add(std.mul(state.right, screenPoint.x), std.mul(state.up, screenPoint.y));
    const focalPoint = std.add(state.focus, std.mul(lateral, state.halfHeight));
    const rayDirection = std.normalize(
      std.sub(std.mul(lateral, state.tanHalfFieldOfView), state.back),
    );
    const origin = std.sub(focalPoint, std.mul(rayDirection, state.rayStart));
    const footprintStart = state.pixelSize * state.halfHeight;
    const footprintGrowth = state.pixelSize * state.tanHalfFieldOfView;

    // Clip the march to the object bounds.
    let boundsCenter = d.vec3f(state.spongeCenter);
    let boundsHalf = d.vec3f(state.spongeHalfSize);
    if (state.mode === 1) {
      boundsCenter = d.vec3f(0);
      boundsHalf = d.vec3f(state.tesseractHalfExtent);
    }
    const inverseDirection = std.div(d.vec3f(1), rayDirection);
    const entryByAxis = std.mul(
      std.sub(std.sub(boundsCenter, boundsHalf), origin),
      inverseDirection,
    );
    const exitByAxis = std.mul(
      std.sub(std.add(boundsCenter, boundsHalf), origin),
      inverseDirection,
    );
    const near = std.min(entryByAxis, exitByAxis);
    const far = std.max(entryByAxis, exitByAxis);
    let distance = std.max(near.x, near.y, near.z, 0);
    const exitDistance = std.min(far.x, far.y, far.z, state.rayEnd);

    let hit = d.bool(false);
    let hitPoint = d.vec3f(0);
    let threshold = d.f32(0);
    if (distance < exitDistance) {
      for (let step = 0; step < MAXIMUM_RAY_STEPS; step += 1) {
        const point = std.add(origin, std.mul(rayDirection, distance));
        threshold = std.max(
          0.5 * (footprintStart + footprintGrowth * (distance - state.rayStart)),
          footprintStart * 0.05,
        );
        const sample = sceneSample(point, threshold);
        if (sample.x < threshold && sample.y > 0.5) {
          hit = true;
          hitPoint = d.vec3f(point);
          break;
        }
        distance += std.max(sample.x, threshold * 0.5);
        if (distance > exitDistance) {
          break;
        }
      }
    }

    if (hit) {
      const normal = surfaceNormal(hitPoint, threshold);
      const weights = std.mul(normal, normal);
      const tone = std.add(
        std.add(std.mul(state.xTone, weights.x), std.mul(state.yTone, weights.y)),
        std.mul(state.zTone, weights.z),
      );
      const facing = std.max(std.dot(normal, state.light), 0);
      let shadow = d.f32(1);
      if (facing > 0) {
        shadow = softShadow(std.add(hitPoint, std.mul(normal, threshold * 2)), threshold);
      }
      const occlusion = ambientOcclusion(hitPoint, normal, threshold);
      const shade = state.ambient * occlusion + state.key * facing * shadow;
      const haze = 1 - std.exp(-std.max(distance - state.hazeStart, 0) * state.hazeDensity);
      const color = std.mix(std.mul(tone, shade), state.hazeColor, haze);
      return TraceSample({
        color,
        coverage: 1,
        floor: 1,
        toneShade: std.mul(weights, shade),
      });
    }

    let floor = d.f32(1);
    if (state.floorEnabled === 1 && rayDirection.y < 0) {
      const floorDistance = (state.floorHeight - origin.y) / rayDirection.y;
      const floorPoint = std.add(origin, std.mul(rayDirection, floorDistance));
      const floorThreshold = footprintStart;
      const shadow = softShadow(floorPoint, floorThreshold);
      const contact = std.clamp(sceneSample(floorPoint, floorThreshold).x / 0.9, 0, 1);
      floor = shadow * (0.55 + 0.45 * std.sqrt(contact));
    }
    return TraceSample({ color: d.vec3f(0), coverage: 0, floor, toneShade: d.vec3f(0) });
  };

  const sceneFragment = tgpu.fragmentFn({
    in: { uv: d.vec2f },
    out: SceneOutput,
  })(({ uv }) => {
    "use gpu";
    const state = sceneState.$;
    const screenPoint = d.vec2f((uv.x - 0.5) * 2 * state.aspectRatio, (0.5 - uv.y) * 2);
    const grid = state.sampleGrid;
    let color = d.vec3f(0);
    let coverage = d.f32(0);
    let toneShade = d.vec3f(0);
    let floor = d.f32(0);
    for (let sampleY = 0; sampleY < MAXIMUM_SAMPLE_GRID; sampleY += 1) {
      if (sampleY >= grid) {
        break;
      }
      for (let sampleX = 0; sampleX < MAXIMUM_SAMPLE_GRID; sampleX += 1) {
        if (sampleX >= grid) {
          break;
        }
        const offset = std.mul(
          std.sub(
            std.div(d.vec2f(d.f32(sampleX) + 0.5, d.f32(sampleY) + 0.5), d.f32(grid)),
            d.vec2f(0.5),
          ),
          state.pixelSize,
        );
        const sample = traceSample(std.add(screenPoint, offset));
        color = std.add(color, sample.color);
        coverage += sample.coverage;
        toneShade = std.add(toneShade, sample.toneShade);
        floor += sample.floor;
      }
    }
    const count = d.f32(grid * grid);
    return {
      aux: d.vec4f(std.div(toneShade, count), 1),
      color: d.vec4f(std.div(color, count), coverage / count),
      floor: d.vec4f(floor / count, 0, 0, 1),
    };
  });

  const sampleObject = (pixel: d.v2f): d.v4f => {
    "use gpu";
    const state = compositeState.$;
    const uv = std.div(pixel, state.outputSize);
    return std.textureSampleLevel(colorView.$, linearSampler.$, uv, 0);
  };

  const cardTone = (card: number): d.v3f => {
    "use gpu";
    const state = compositeState.$;
    if (card === 0) {
      return d.vec3f(state.fanTone0);
    }
    if (card === 1) {
      return d.vec3f(state.fanTone1);
    }
    if (card === 2) {
      return d.vec3f(state.fanTone2);
    }
    return d.vec3f(state.fanTone3);
  };

  /**
  One fan card: a rigid rotation of one rendered isometric face. Each source face is the rhombus
  between the rays at 30 + 120 * face and 150 + 120 * face degrees around the hexagon center.
  Returns the premultiplied color and the coverage of the card at `pixel`.
  */
  /** Rhombus coordinates (a, b) of `pixel` on the source face of `card`, after its rotation. */
  const cardCoordinates = (pixel: d.v2f, card: number): d.v2f => {
    "use gpu";
    const state = compositeState.$;
    const offset = d.vec2f(pixel.x - state.fanCenter.x, state.fanCenter.y - pixel.y);
    const rotation = angleRay(-pick4(state.fanAngles, card));
    const rotated = d.vec2f(
      offset.x * rotation.x - offset.y * rotation.y,
      offset.x * rotation.y + offset.y * rotation.x,
    );
    const start = 30 + 120 * d.f32(d.i32(pick4(state.fanFaces, card) + 0.5));
    const span = state.fanRadius * RHOMBUS_SINE;
    return d.vec2f(
      cross2(rotated, angleRay(start + 120)) / span,
      cross2(angleRay(start), rotated) / span,
    );
  };

  /** Soft coverage of the card outline, for the shadow that a card casts on the cards below. */
  const cardShadow = (pixel: d.v2f, card: number): number => {
    "use gpu";
    const state = compositeState.$;
    const softness = state.fanRadius * 0.05;
    const shifted = std.sub(pixel, d.vec2f(state.fanRadius * 0.02, -state.fanRadius * 0.035));
    const coordinates = cardCoordinates(shifted, card);
    const span = state.fanRadius * RHOMBUS_SINE;
    const edge = std.min(
      std.min(coordinates.x, coordinates.y),
      std.min(1 - coordinates.x, 1 - coordinates.y),
    );
    return std.smoothstep(-softness, softness, edge * span);
  };

  const fanCard = (pixel: d.v2f, card: number): d.v4f => {
    "use gpu";
    const state = compositeState.$;
    const coordinates = cardCoordinates(pixel, card);
    const a = coordinates.x;
    const b = coordinates.y;
    const face = d.i32(pick4(state.fanFaces, card) + 0.5);
    const start = 30 + 120 * d.f32(face);
    const u = angleRay(start);
    const v = angleRay(start + 120);
    const span = state.fanRadius * RHOMBUS_SINE;
    const outer = std.clamp(std.min((1 - a) * span, (1 - b) * span) + 0.5, 0, 1);
    const inner = std.clamp(std.min(a * span, b * span) + 1.5, 0, 1);
    const coverage = outer * inner;
    if (coverage <= 0) {
      return d.vec4f(0);
    }
    const inset = 1.25 / span;
    const sourceOffset = std.mul(
      std.add(
        std.mul(u, std.clamp(a, inset, 1 - inset)),
        std.mul(v, std.clamp(b, inset, 1 - inset)),
      ),
      state.fanRadius,
    );
    const sourcePixel = d.vec2f(
      state.fanCenter.x + sourceOffset.x,
      state.fanCenter.y - sourceOffset.y,
    );
    const uv = std.div(sourcePixel, state.outputSize);
    const source = std.textureSampleLevel(colorView.$, linearSampler.$, uv, 0);
    let color = source.xyz;
    if (pick4(state.fanRecolor, card) > 0.5) {
      const toneShade = std.textureSampleLevel(auxView.$, linearSampler.$, uv, 0).xyz;
      // Face 0 is the top (y) direction, face 1 the left (x) direction, face 2 the mark (z) face.
      let oldTone = d.vec3f(state.yTone);
      let weight = toneShade.y;
      if (face === 1) {
        oldTone = d.vec3f(state.xTone);
        weight = toneShade.x;
      } else if (face === 2) {
        oldTone = d.vec3f(state.zTone);
        weight = toneShade.z;
      }
      color = std.add(color, std.mul(std.sub(cardTone(card), oldTone), weight));
    }
    color = std.mul(color, pick4(state.fanBrightness, card));
    // The source is premultiplied by its own coverage; inside a face that is 1.
    return d.vec4f(std.mul(color, coverage / std.max(source.w, 0.001)), coverage);
  };

  const compositeFragment = tgpu.fragmentFn({
    in: { uv: d.vec2f },
    out: d.vec4f,
  })(({ uv }) => {
    "use gpu";
    const state = compositeState.$;
    const pixel = std.mul(uv, state.outputSize);
    const backdrop = std.textureSampleLevel(backdropView.$, linearSampler.$, uv, 0).xyz;
    const floor = std.textureSampleLevel(floorView.$, linearSampler.$, uv, 0).x;
    let color = std.mul(backdrop, std.mix(state.shadowTint, d.vec3f(1), floor));

    if (state.fanEnabled === 1) {
      let transmittance = d.f32(1);
      let front = d.vec3f(0);
      for (let card = 0; card < 4; card += 1) {
        const layer = fanCard(pixel, card);
        // Each card above casts a soft shadow on this card; at rest the cards lie flat and cast none.
        let lit = d.f32(1);
        for (let above = 0; above < 4; above += 1) {
          if (above >= card) {
            break;
          }
          lit *= 1 - state.fanShadow * cardShadow(pixel, above);
        }
        front = std.add(front, std.mul(layer.xyz, transmittance * lit));
        transmittance *= 1 - layer.w;
      }
      color = std.add(front, std.mul(color, transmittance));
    } else {
      const object = sampleObject(pixel);
      color = std.add(object.xyz, std.mul(color, 1 - object.w));
    }

    const overlay = std.textureSampleLevel(overlayView.$, linearSampler.$, uv, 0);
    color = std.mix(color, overlay.xyz, overlay.w);
    const noise = hash(std.add(std.floor(pixel), d.vec2f(state.frameIndex * 17.31, 3.7))) - 0.5;
    color = std.add(color, d.vec3f(noise * state.grain));
    return d.vec4f(std.clamp(color, d.vec3f(0), d.vec3f(1)), 1);
  });

  const scenePipeline = root.createRenderPipeline({
    fragment: sceneFragment,
    targets: {
      aux: { format: "rgba16float" },
      color: { format: "rgba16float" },
      floor: { format: "rgba16float" },
    },
    vertex: common.fullScreenTriangle,
  });
  const compositePipeline = root.createRenderPipeline({
    fragment: compositeFragment,
    vertex: common.fullScreenTriangle,
  });
  await Promise.all([scenePipeline.initAsync(), compositePipeline.initAsync()]);

  return {
    destroy: () => root.destroy(),
    render: async (frame) => {
      await waitForFilmV3Fonts();
      drawBackdrop(pageContext, frame);
      backdropTexture.write(pageCanvas);
      drawOverlay(pageContext, frame);
      overlayTexture.write(pageCanvas);

      const { camera, fan, floor, haze, light, sponge, tesseract, tones } = frame.scene;
      sceneState.write({
        ambient: light.ambient,
        aoScale: light.aoScale,
        aspectRatio: canvas.width / canvas.height,
        back: vector(camera.back),
        depth: sponge.depth,
        floorEnabled: floor.enabled ? 1 : 0,
        floorHeight: floor.height,
        halfHeight: camera.halfHeight,
        hazeColor: vector(haze.color),
        hazeDensity: haze.density,
        hazeStart: haze.start,
        key: light.key,
        light: vector(light.direction),
        mode: frame.scene.mode === "tesseract" ? 1 : 0,
        openness: sponge.openness,
        pixelSize: 2 / canvas.height,
        probe: vector(sponge.probe),
        rayEnd: camera.rayEnd,
        rayStart: camera.rayStart,
        restDepth: sponge.restDepth,
        revealRadius: sponge.revealRadius,
        right: vector(camera.right),
        sampleGrid: frame.sampleGrid,
        spongeCenter: vector(sponge.center),
        spongeHalfSize: sponge.halfSize,
        tanHalfFieldOfView: camera.tanHalfFieldOfView,
        focus: vector(camera.target),
        tesseractHalfExtent: vector(tesseract.halfExtent),
        up: vector(camera.up),
        xTone: vector(tones.x),
        yTone: vector(tones.y),
        zTone: vector(tones.z),
      });
      beamState.write(tesseract.joints.map(([x, y, z, half]) => d.vec4f(x, y, z, half)));
      const [card0, card1, card2, card3] = fan.cards;
      compositeState.write({
        fanAngles: d.vec4f(card0.angle, card1.angle, card2.angle, card3.angle),
        fanBrightness: d.vec4f(
          card0.brightness,
          card1.brightness,
          card2.brightness,
          card3.brightness,
        ),
        fanCenter: d.vec2f(...fan.center),
        fanEnabled: fan.enabled ? 1 : 0,
        fanFaces: d.vec4f(card0.face, card1.face, card2.face, card3.face),
        fanRadius: fan.radius,
        fanShadow: fan.shadow,
        fanRecolor: d.vec4f(
          card0.tone ? 1 : 0,
          card1.tone ? 1 : 0,
          card2.tone ? 1 : 0,
          card3.tone ? 1 : 0,
        ),
        fanTone0: vector(card0.tone ?? tones.z),
        fanTone1: vector(card1.tone ?? tones.z),
        fanTone2: vector(card2.tone ?? tones.z),
        fanTone3: vector(card3.tone ?? tones.z),
        frameIndex: frame.frameIndex,
        grain: frame.grain,
        outputSize: d.vec2f(canvas.width, canvas.height),
        shadowTint: vector(frame.shadowTint),
        xTone: vector(tones.x),
        yTone: vector(tones.y),
        zTone: vector(tones.z),
      });
      scenePipeline
        .withColorAttachment({
          aux: { view: auxTexture },
          color: { view: colorTexture },
          floor: { view: floorTexture },
        })
        .draw(3);
      compositePipeline.withColorAttachment({ view: context }).draw(3);
      return root.device.queue.onSubmittedWorkDone();
    },
  };
}
