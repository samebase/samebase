import { common, d, std, tgpu } from "typegpu";

import type { WebGpuFrameRenderer } from "../../webgpu/useWebGpuFrame";
import { drawBackdrop, drawOverlay, waitForFilmV3Fonts } from "./filmV3Page";
import { type FilmV3Frame, inks, type Vector3 } from "./filmV3Timeline";

const MAXIMUM_SAMPLE_GRID = 4;
/** Unfolds per pixel over the shutter while the faces move. */
const FACE_SHUTTER_SAMPLES = 8;
const MAXIMUM_RAY_STEPS = 200;
const MAXIMUM_MENGER_DEPTH = 8;
/**
A shuffled cell level fades out between its fade width and this many times that width: its cells
grow until they close the openings between them. Below 3, only one level fades at a time.
*/
const FADE_SPAN = 8 / 3;
/** Sides of the star warp. */
const STAR_SIDES = 7;
const BEAM_COUNT = 32;

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
  /**
  The camera at the shutter close; the fields above hold it at the shutter open. Each antialiasing
  sample takes its own time in the shutter.
  */
  closeRight: d.vec3f,
  closeUp: d.vec3f,
  closeBack: d.vec3f,
  closeFocus: d.vec3f,
  closeHalfHeight: d.f32,
  closeTanHalfFieldOfView: d.f32,
  closeRayStart: d.f32,
  /** Unit vector toward the key light. */
  light: d.vec3f,
  ambient: d.f32,
  key: d.f32,
  aoScale: d.f32,
  /**
  How much self shadow darkens the object. The giant keeps less of it, because its cell boxes bound
  the distance loosely near cell borders.
  */
  shadeStrength: d.f32,
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
  /** 1 anchors each opening toward the probe side of its parent hole, 0 centers it. */
  anchorToProbe: d.f32,
  tesseractHalfExtent: d.vec3f,
  /** Levels of the shuffled sponge: the top cell splits this many times. */
  shuffleDepth: d.i32,
  /** Levels above this one keep the Menger layout and no cell moves in them. */
  moveMinLevel: d.i32,
  /** Up to three cells in flight at every level, in slot units of their parent: from and to. */
  moveFromA: d.vec3f,
  moveToA: d.vec3f,
  moveFromB: d.vec3f,
  moveToB: d.vec3f,
  moveFromC: d.vec3f,
  moveToC: d.vec3f,
  /** Eased progress of each cell in flight. */
  moveProgress: d.vec3f,
  moveCount: d.i32,
  /** Shuffled cells narrower than this many pixels are solid, and a level fades out above it. */
  fadePixels: d.f32,
  /** 1 warps the isometric image into the star. */
  starEnabled: d.i32,
  /** The hexagon radius of the object outline, in world units at the focal plane. */
  starHexRadius: d.f32,
  /** The star turn at the shutter open and close, in degrees counterclockwise. */
  starRotation: d.vec2f,
  /** Widths in degrees of sides 0 to 3 and 4 to 6 of the star, counterclockwise from the top face. */
  starWidthsA: d.vec4f,
  starWidthsB: d.vec4f,
  floorHeight: d.f32,
  /** 0 hides the floor shadow. It fades out near a level camera, where the floor turns edge on. */
  floorStrength: d.f32,
  /** Distances from the cube box, in cube half sizes: the giant is clear to the first and hidden past the second. */
  hazeClear: d.f32,
  hazeHidden: d.f32,
  hazeDensity: d.f32,
  hazeStart: d.f32,
  xTone: d.vec3f,
  yTone: d.vec3f,
  zTone: d.vec3f,
});

const CompositeState = d.struct({
  outputSize: d.vec2f,
  grainStep: d.f32,
  grain: d.f32,
  shadowTint: d.vec3f,
  facesEnabled: d.i32,
  /** How the new face opens: 0 it waits behind the doors, 1 it folds open like a leaf, 2 it shears. */
  facesFold: d.i32,
  /** Hexagon center in pixels from the top left. */
  facesCenter: d.vec2f,
  facesRadius: d.f32,
  /** The unfold at the shutter open and close. */
  facesUnfold: d.vec2f,
  newTone: d.vec3f,
  yTone: d.vec3f,
});

const TraceSample = d.struct({
  color: d.vec3f,
  coverage: d.f32,
  /** Face direction weights times the shade, for the new face recolor. */
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
  1 for each of the 27 slots that holds a resting cell, x first, then y, then z, four slots per
  vector: a uniform array needs a 16 byte stride.
  */
  const slotState = root.createUniform(d.arrayOf(d.vec4f, 7));

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
    const anchorDelta = std.mul(channelDelta, sceneState.$.anchorToProbe);
    const absoluteDelta = std.abs(anchorDelta);
    const totalDelta = absoluteDelta.x + absoluteDelta.y;
    let weightA = d.f32(0.5);
    if (totalDelta > 0) {
      const directionalBlend = std.min(totalDelta / (holeSize * 0.5), 1);
      weightA = 0.5 + (absoluteDelta.x / totalDelta - 0.5) * directionalBlend;
    }
    const anchor = std.clamp(
      std.sub(d.vec2f(0.5), std.div(anchorDelta, holeSize)),
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

  const slotFilled = (slot: number): number => {
    "use gpu";
    // @ts-expect-error A WGSL array read has no undefined case, and every index is below 7.
    const group = d.vec4f(slotState.$[d.i32(slot / 4)]);
    const lane = slot % 4;
    if (lane === 0) {
      return group.x;
    }
    if (lane === 1) {
      return group.y;
    }
    if (lane === 2) {
      return group.z;
    }
    return group.w;
  };

  /** Center of slot `slot` in the unit cell: each coordinate is -2/3, 0, or 2/3. */
  const slotCenter = (slot: number): d.v3f => {
    "use gpu";
    const index = d.f32(slot);
    const z = std.floor(index / 9);
    const y = std.floor((index - z * 9) / 3);
    const x = index - z * 9 - y * 3;
    return std.mul(std.sub(d.vec3f(x, y, z), d.vec3f(1)), 2 / 3);
  };

  /** A Menger slot is filled when fewer than two of its coordinates are the middle one. */
  const mengerFilled = (slot: number): number => {
    "use gpu";
    const center = slotCenter(slot);
    const middle =
      std.select(0, 1, std.abs(center.x) < 0.1) +
      std.select(0, 1, std.abs(center.y) < 0.1) +
      std.select(0, 1, std.abs(center.z) < 0.1);
    return std.select(0, 1, middle < 2);
  };

  const movingCenter = (index: number): d.v3f => {
    "use gpu";
    const state = sceneState.$;
    if (index === 0) {
      return std.mix(state.moveFromA, state.moveToA, state.moveProgress.x);
    }
    if (index === 1) {
      return std.mix(state.moveFromB, state.moveToB, state.moveProgress.y);
    }
    return std.mix(state.moveFromC, state.moveToC, state.moveProgress.z);
  };

  const cellBoxDistance = (point: d.v3f, center: d.v3f, halfSize: number): number => {
    "use gpu";
    const delta = std.sub(std.abs(std.sub(point, center)), d.vec3f(halfSize));
    return std.length(std.max(delta, d.vec3f(0))) + std.min(std.max(delta.x, delta.y, delta.z), 0);
  };

  /**
  The shuffled sponge, after the landing shuffle: every cell splits into the same 27 slots, the
  resting cells fill their slots, and up to three cells slide between two slots each. The same moves
  run inside every cell at every level from `moveMinLevel` down, at the same time. The descent
  follows the one cell that holds the point. For the march, the other cell boxes of every level bound
  the distance, so a step never skips a neighbor. With `nearOnly` only the level where the point is
  in empty space counts: normals and occlusion then see the cells around the point and not the loose
  box bound of a far neighbor, which would draw lines along cell borders.
  */
  const shuffleDistance = (point: d.v3f, threshold: number, nearOnly: boolean): number => {
    "use gpu";
    const state = sceneState.$;
    let local = std.div(std.sub(point, state.spongeCenter), state.spongeHalfSize);
    let scale = d.f32(state.spongeHalfSize);
    // Far outside, the top cell box bounds the distance. Near it, the cell boxes do, so an opening
    // at the top cell face stays open.
    const outside = unitBoxDistance(local) * scale;
    if (outside > scale * 0.3) {
      return outside;
    }
    let best = d.f32(1000000);
    for (let level = 0; level < MAXIMUM_MENGER_DEPTH; level += 1) {
      // Cells below the fade width stay solid: smaller openings only alias at grazing angles. Just
      // above it the cells grow into their neighbors, so the level fades out and never pops. The
      // threshold is half a pixel.
      const cellPixels = scale / (3 * threshold);
      if (level >= state.shuffleDepth || cellPixels < state.fadePixels) {
        break;
      }
      const grow = 1 - std.smoothstep(state.fadePixels, state.fadePixels * FADE_SPAN, cellPixels);
      const cellHalf = (1 + grow) / 3;
      const shuffled = level >= state.moveMinLevel;
      // The nearest cell box. A point inside it, or closer than two hit thresholds, descends into it,
      // so a march that nears a cell face finds the openings in that cell before it stops.
      let nearest = d.f32(1000000);
      let nearestCenter = d.vec3f(0);
      let second = d.f32(1000000);
      if (shuffled) {
        for (let index = 0; index < 3; index += 1) {
          if (index < state.moveCount) {
            const center = movingCenter(index);
            const distance = cellBoxDistance(local, center, cellHalf);
            if (distance < nearest) {
              second = nearest;
              nearest = distance;
              nearestCenter = d.vec3f(center);
            } else {
              second = std.min(second, distance);
            }
          }
        }
      }
      for (let slot = 0; slot < 27; slot += 1) {
        let filled = mengerFilled(slot);
        if (shuffled) {
          filled = slotFilled(slot);
        }
        if (filled > 0.5) {
          const center = slotCenter(slot);
          const distance = cellBoxDistance(local, center, cellHalf);
          if (distance < nearest) {
            second = nearest;
            nearest = distance;
            nearestCenter = d.vec3f(center);
          } else {
            second = std.min(second, distance);
          }
        }
      }
      if (grow > 0) {
        // The fading level is the last one. Its grown cells stay inside their parent box.
        return std.min(best, std.max(nearest, unitBoxDistance(local)) * scale);
      }
      if (nearest * scale > threshold * 2) {
        return std.min(best, nearest * scale);
      }
      if (!nearOnly) {
        best = std.min(best, second * scale);
      }
      const insideCenter = nearestCenter;
      local = std.mul(std.sub(local, insideCenter), 3);
      scale = scale / 3;
    }
    return std.min(best, unitBoxDistance(local) * scale);
  };

  /** Distance and material in world units. */
  const sceneSample = (point: d.v3f, threshold: number): d.v2f => {
    "use gpu";
    const state = sceneState.$;
    if (state.mode === 1) {
      return d.vec2f(tesseractDistance(point), 1);
    }
    if (state.mode === 2) {
      return d.vec2f(shuffleDistance(point, threshold, false), 1);
    }
    const local = std.div(std.sub(point, state.spongeCenter), state.spongeHalfSize);
    const sample = mengerSample(local, threshold / state.spongeHalfSize);
    return d.vec2f(sample.x * state.spongeHalfSize, sample.y);
  };

  /** The distance that normals read: the same, but near cells only in the shuffle. */
  const shadingSample = (point: d.v3f, threshold: number): number => {
    "use gpu";
    if (sceneState.$.mode === 2) {
      return shuffleDistance(point, threshold, true);
    }
    return sceneSample(point, threshold).x;
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
        std.mul(a, shadingSample(std.add(point, std.mul(a, epsilon)), threshold)),
        std.mul(b, shadingSample(std.add(point, std.mul(b, epsilon)), threshold)),
      ),
      std.add(
        std.mul(c, shadingSample(std.add(point, std.mul(c, epsilon)), threshold)),
        std.mul(e, shadingSample(std.add(point, std.mul(e, epsilon)), threshold)),
      ),
    );
    return std.normalize(sum);
  };

  const keyShadow = (origin: d.v3f, threshold: number): number => {
    "use gpu";
    const state = sceneState.$;
    let light = d.f32(1);
    let distance = state.aoScale * 0.5;
    for (let step = 0; step < 56; step += 1) {
      // Shadow rays see openings below four pixels as solid, so a fine grid of openings casts no moire.
      const sample = sceneSample(std.add(origin, std.mul(state.light, distance)), threshold * 4).x;
      // A hard edge: the shadow is the exact outline of its caster, with no soft penumbra.
      light = std.min(light, (400 * sample) / distance);
      distance += std.clamp(sample, state.aoScale * 0.25, state.aoScale * 8);
      if (light < 0.002 || distance > state.rayEnd) {
        break;
      }
    }
    return std.clamp(light, 0, 1);
  };

  const starWidth = (side: number): number => {
    "use gpu";
    const state = sceneState.$;
    if (side < 4) {
      if (side === 0) {
        return state.starWidthsA.x;
      }
      if (side === 1) {
        return state.starWidthsA.y;
      }
      if (side === 2) {
        return state.starWidthsA.z;
      }
      return state.starWidthsA.w;
    }
    if (side === 4) {
      return state.starWidthsB.x;
    }
    if (side === 5) {
      return state.starWidthsB.y;
    }
    return state.starWidthsB.z;
  };

  /**
  Source cube face of each star side, counterclockwise from the top face: 0 the top, 1 the left,
  and 2 the front. Neighbor sides never share a face while zero width sides are left out.
  */
  const starSourceFace = (side: number): number => {
    "use gpu";
    if (side === 0 || side === 3) {
      return 0;
    }
    if (side === 1 || side === 5) {
      return 1;
    }
    return 2;
  };

  /**
  The source point of `point` in the star warp, around the frame center, in screen units, and 1 in
  z when the point is inside its side. Side k is the parallelogram R * (a * u + b * v) between the
  rays u and v at its start and end angles; the same (a, b) on the rays of its source face, which
  the isometric view draws at 30, 150, and 270 degrees, gives the source point. Every side is one
  exact linear map, so the three 120 degree sides with no turn give the image back unchanged. A new
  side opens from a segment of length 2R along the cut: while it is narrow, it is long and its square
  openings are thin diamonds.
  */
  const starSource = (point: d.v2f, rotation: number, radius: number): d.v3f => {
    "use gpu";
    const first = 30 + rotation;
    const angle = (std.atan2(point.y, point.x) * 180) / Math.PI;
    const relative = std.fract((angle - first) / 360 + 4) * 360;
    // Past the last side, rounding leaves the point on the last side.
    let side = d.i32(STAR_SIDES - 1);
    let start = 360 - starWidth(STAR_SIDES - 1);
    let cumulative = d.f32(0);
    for (let index = 0; index < STAR_SIDES; index += 1) {
      const sideWidth = starWidth(index);
      if (relative < cumulative + sideWidth) {
        side = index;
        start = cumulative;
        break;
      }
      cumulative += sideWidth;
    }
    const width = starWidth(side);
    const u = angleRay(first + start);
    const v = angleRay(first + start + width);
    const determinant = cross2(u, v) * radius;
    const a = cross2(point, v) / determinant;
    const b = cross2(u, point) / determinant;
    const faceStart = 30 + 120 * d.f32(starSourceFace(side));
    const source = std.mul(
      std.add(std.mul(angleRay(faceStart), a), std.mul(angleRay(faceStart + 120), b)),
      radius,
    );
    return d.vec3f(source, std.select(0, 1, a <= 1 && b <= 1));
  };

  /** One sample at `screenPoint`, `shutter` of the way from the shutter open to its close. */
  const traceSample = (screenPoint: d.v2f, shutter: number): d.Infer<typeof TraceSample> => {
    "use gpu";
    const state = sceneState.$;
    const right = std.mix(state.right, state.closeRight, shutter);
    const up = std.mix(state.up, state.closeUp, shutter);
    const back = std.mix(state.back, state.closeBack, shutter);
    const focus = std.mix(state.focus, state.closeFocus, shutter);
    const halfHeight = std.mix(state.halfHeight, state.closeHalfHeight, shutter);
    const tanHalfFieldOfView = std.mix(
      state.tanHalfFieldOfView,
      state.closeTanHalfFieldOfView,
      shutter,
    );
    const rayStart = std.mix(state.rayStart, state.closeRayStart, shutter);
    let imagePoint = d.vec2f(screenPoint);
    if (state.starEnabled === 1) {
      const star = starSource(
        screenPoint,
        std.mix(state.starRotation.x, state.starRotation.y, shutter),
        state.starHexRadius / halfHeight,
      );
      if (star.z < 0.5) {
        return TraceSample({ color: d.vec3f(0), coverage: 0, floor: 1, toneShade: d.vec3f(0) });
      }
      imagePoint = d.vec2f(star.x, star.y);
    }
    const lateral = std.add(std.mul(right, imagePoint.x), std.mul(up, imagePoint.y));
    const focalPoint = std.add(focus, std.mul(lateral, halfHeight));
    const rayDirection = std.normalize(std.sub(std.mul(lateral, tanHalfFieldOfView), back));
    const origin = std.sub(focalPoint, std.mul(rayDirection, rayStart));
    const footprintStart = state.pixelSize * halfHeight;
    const footprintGrowth = state.pixelSize * tanHalfFieldOfView;

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
          0.5 * (footprintStart + footprintGrowth * (distance - rayStart)),
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
      // The stencil sits just outside the surface, so flush pieces of a union show no seam.
      const normal = surfaceNormal(
        std.sub(hitPoint, std.mul(rayDirection, threshold * 1.5)),
        threshold,
      );
      const weights = std.mul(normal, normal);
      const tone = std.add(
        std.add(std.mul(state.xTone, weights.x), std.mul(state.yTone, weights.y)),
        std.mul(state.zTone, weights.z),
      );
      const facing = std.max(std.dot(normal, state.light), 0);
      let shadow = d.f32(1);
      if (facing > 0) {
        shadow = std.mix(
          1,
          keyShadow(std.add(hitPoint, std.mul(normal, threshold * 2)), threshold),
          state.shadeStrength,
        );
      }
      // Every face is one flat tone: no occlusion darkens holes, corners, or contacts.
      const shade = state.ambient + state.key * facing * shadow;
      // The haze has the sky color behind the pixel, so it lowers the coverage. Near the cube the
      // giant is clear out to `hazeClear`, and past `hazeHidden` the haze hides it. The distance is
      // taken a pixel further along the ray, so a neighbor face that lies on a cube face plane, such
      // as the cell under the cube seen through an opening, counts as outside the cube.
      const inside = std.add(hitPoint, std.mul(rayDirection, threshold * 3));
      const outsideCube = std.length(std.max(std.sub(std.abs(inside), d.vec3f(1)), d.vec3f(0)));
      const clear =
        (1 - std.smoothstep(state.hazeClear, state.hazeHidden, outsideCube)) *
        std.exp(-std.max(distance - state.hazeStart, 0) * state.hazeDensity);
      return TraceSample({
        color: std.mul(tone, shade * clear),
        coverage: clear,
        floor: 1,
        toneShade: std.mul(weights, shade * clear),
      });
    }

    let floor = d.f32(1);
    if (state.floorStrength > 0 && rayDirection.y < 0) {
      const floorDistance = (state.floorHeight - origin.y) / rayDirection.y;
      const floorPoint = std.add(origin, std.mul(rayDirection, floorDistance));
      const floorThreshold = footprintStart;
      floor = std.mix(1, keyShadow(floorPoint, floorThreshold), state.floorStrength);
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
        // Neighboring samples take shutter times far apart, so a moving edge blurs evenly.
        const shutterIndex = ((sampleY * grid + sampleX) * 7) % (grid * grid);
        const sample = traceSample(
          std.add(screenPoint, offset),
          (d.f32(shutterIndex) + 0.5) / d.f32(grid * grid),
        );
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

  /**
  Start ray of face `face` at unfold `unfold`, in degrees counterclockwise: 0 top, 1 left, 2 new,
  3 right. The rays are mirror symmetric about the vertical line through the center.
  */
  const faceStart = (face: number, unfold: number): number => {
    "use gpu";
    if (face === 0) {
      return 30 + 15 * unfold;
    }
    if (face === 1) {
      return 150 - 15 * unfold;
    }
    if (face === 2) {
      return 270 - 45 * unfold;
    }
    return 270 + 45 * unfold;
  };

  const faceEnd = (face: number, unfold: number): number => {
    "use gpu";
    if (face === 3) {
      return faceStart(0, unfold) + 360;
    }
    return faceStart(face + 1, unfold);
  };

  const faceIsEmpty = (face: number, unfold: number): boolean => {
    "use gpu";
    return faceEnd(face, unfold) - faceStart(face, unfold) < 0.0001;
  };

  /**
  The render texture point of face `face` at `along` and `across` hexagon radii on its source edges.
  The top, left, and right faces come from the rendered regions between the rays at 30, 150, 270,
  and 390 degrees. The new face comes from the top region upside down, as the bottom face looks from
  below.
  */
  const sourcePoint = (face: number, along: number, across: number): d.v2f => {
    "use gpu";
    const state = compositeState.$;
    let sourceOffset = std.add(std.mul(angleRay(150), along), std.mul(angleRay(30), across));
    if (face !== 2) {
      const sourceStart = 30 + 120 * d.f32(std.min(face, 2));
      sourceOffset = std.add(
        std.mul(angleRay(sourceStart), along),
        std.mul(angleRay(sourceStart + 120), across),
      );
    }
    return std.div(
      d.vec2f(
        state.facesCenter.x + sourceOffset.x * state.facesRadius,
        state.facesCenter.y - sourceOffset.y * state.facesRadius,
      ),
      state.outputSize,
    );
  };

  /**
  Face `face` at `offset` (pixels from the center, y up) and unfold `unfold`: its color and the
  coverage of its outer edges. The top, left, and right faces are affine maps of their source
  regions, with both edges one hexagon radius long, so their openings stay one third. The new face
  waits at its final 90 degree shape straight down. Only its part inside the lines through the lower
  corners of the two doors shows, so its outline meets the doors and never passes them.
  */
  const faceColor = (offset: d.v2f, face: number, unfold: number): d.v4f => {
    "use gpu";
    const state = compositeState.$;
    const radius = state.facesRadius;
    let u = angleRay(faceStart(face, unfold));
    let v = angleRay(faceEnd(face, unfold));
    let limit = d.f32(1);
    if (face === 2 && state.facesFold === 1) {
      // The leaf is drawn on top of all faces by `leafColor`; its gap between the doors is empty.
      return d.vec4f(0);
    }
    if (face === 2 && state.facesFold === 0) {
      u = angleRay(225);
      v = angleRay(315);
      // The lower corner of the left door, one radius out on the ray 270 - 45 unfold, in new face axes.
      limit = std.sin(((45 + 45 * unfold) * Math.PI) / 180);
    }
    const sine = cross2(u, v);
    const a = cross2(offset, v) / sine / radius;
    const b = cross2(u, offset) / sine / radius;
    const outer = std.min(limit - a, limit - b) * radius * sine;
    if (outer < -1.5) {
      return d.vec4f(0);
    }
    // Once the faces move, keep a pixel away from the region edges, where the render blends in the
    // neighbor face. At unfold 0 every face samples the render at its own pixel.
    const inset = 1.25 / radius;
    const moving = std.min(unfold * 50, 1);
    const uv = sourcePoint(
      face,
      std.mix(a, std.clamp(a, inset, 1 - inset), moving),
      std.mix(b, std.clamp(b, inset, 1 - inset), moving),
    );
    const sample = std.textureSampleLevel(colorView.$, linearSampler.$, uv, 0);
    // The render is premultiplied by its coverage, which is 1 inside a face.
    let color = std.div(sample.xyz, std.max(sample.w, 0.001));
    // The render antialiases the outline of the top, left, and right faces, so at unfold 0 they
    // equal it exactly. The new face outline runs through the door corners and is drawn here.
    let coverage = std.clamp(outer + 0.5, 0, 1);
    if (face !== 2) {
      coverage = std.textureSampleLevel(colorView.$, linearSampler.$, sourcePoint(face, a, b), 0).w;
    }
    if (face === 2) {
      // The new tone replaces the top tone with the same light. The new face opens in the soft
      // shadow of both doors and brightens as they open.
      const toneShade = std.textureSampleLevel(auxView.$, linearSampler.$, uv, 0).xyz;
      color = std.add(color, std.mul(std.sub(state.newTone, state.yTone), toneShade.y));
      const fromLeft = std.max(cross2(angleRay(faceStart(2, unfold)), offset), 0);
      const fromRight = std.max(cross2(offset, angleRay(faceStart(3, unfold))), 0);
      const doorShadow = (1 - 0.3 * std.exp(-fromLeft / 5)) * (1 - 0.3 * std.exp(-fromRight / 5));
      color = std.mul(color, doorShadow * std.mix(0.55, 0.75, unfold));
    }
    return d.vec4f(std.mul(color, coverage), coverage);
  };

  /**
  The leaf fold: the new face folds open about its vertical diagonal, the cut line, like a book seen
  from its spine. Each half turns from edge on to flat by the fold angle 90 unfold degrees, so in the
  orthographic view its width is the sine of that angle times its flat width, and the hole folds
  with it. Each half takes the camera-fixed key light at its own angle. The leaf folds toward the
  viewer, so it covers the doors where the two overlap.
  */
  const leafColor = (offset: d.v2f, unfold: number): d.v4f => {
    "use gpu";
    const state = compositeState.$;
    const radius = state.facesRadius;
    const width = std.sin((unfold * Math.PI) / 2);
    if (width < 0.001) {
      return d.vec4f(0);
    }
    const flat = d.vec2f(offset.x / width, offset.y);
    const u = angleRay(225);
    const v = angleRay(315);
    const a = cross2(flat, v) / radius;
    const b = cross2(u, flat) / radius;
    // Pixels to the nearest outline edge: the x scale shrinks each edge distance by this factor.
    const toPixels = (radius * Math.SQRT2 * width) / std.sqrt(1 + width * width);
    const edge = std.min(std.min(a, b), std.min(1 - a, 1 - b)) * toPixels;
    if (edge < -1.5) {
      return d.vec4f(0);
    }
    const inset = 1.25 / radius;
    const uv = sourcePoint(2, std.clamp(a, inset, 1 - inset), std.clamp(b, inset, 1 - inset));
    const sample = std.textureSampleLevel(colorView.$, linearSampler.$, uv, 0);
    let color = std.div(sample.xyz, std.max(sample.w, 0.001));
    const toneShade = std.textureSampleLevel(auxView.$, linearSampler.$, uv, 0).xyz;
    color = std.add(color, std.mul(std.sub(state.newTone, state.yTone), toneShade.y));
    // The key light in camera axes, as in the film: a flat half gets exactly its tone.
    const light = std.normalize(d.vec3f(-0.5, 0.78, 0.58));
    const side = std.sign(offset.x);
    const normal = d.vec3f(side * std.sqrt(std.max(1 - width * width, 0)), 0, width);
    const shade = 0.6 + (0.4 / light.z) * std.max(std.dot(normal, light), 0);
    color = std.mul(color, shade * 0.8);
    const coverage = std.clamp(edge + 0.5, 0, 1);
    return d.vec4f(std.mul(color, coverage), coverage);
  };

  const previousFace = (face: number, unfold: number): number => {
    "use gpu";
    let previous = (face + 3) % 4;
    if (faceIsEmpty(previous, unfold)) {
      previous = (previous + 3) % 4;
    }
    return previous;
  };

  const nextFace = (face: number, unfold: number): number => {
    "use gpu";
    let next = (face + 1) % 4;
    if (faceIsEmpty(next, unfold)) {
      next = (next + 1) % 4;
    }
    return next;
  };

  /**
  The four faces tile the turn: every direction from the center belongs to exactly one face, and
  the faces meet along shared rays. Within half a pixel of a shared ray the two faces blend.
  */
  const facesColorAt = (offset: d.v2f, unfold: number): d.v4f => {
    "use gpu";
    const angle = (std.atan2(offset.y, offset.x) * 180) / Math.PI;
    const topStart = faceStart(0, unfold);
    const relative = std.fract((angle - topStart) / 360 + 2) * 360;
    let face = d.i32(3);
    if (relative < faceStart(1, unfold) - topStart) {
      face = 0;
    } else if (relative < faceStart(2, unfold) - topStart) {
      face = 1;
    } else if (relative < faceStart(3, unfold) - topStart) {
      face = 2;
    }
    let layer = faceColor(offset, face, unfold);
    const startDistance = cross2(angleRay(faceStart(face, unfold)), offset);
    if (startDistance < 0.5) {
      const neighbor = faceColor(offset, previousFace(face, unfold), unfold);
      layer = std.mix(layer, neighbor, std.clamp(0.5 - startDistance, 0, 0.5));
    }
    const endDistance = cross2(offset, angleRay(faceEnd(face, unfold)));
    if (endDistance < 0.5) {
      const neighbor = faceColor(offset, nextFace(face, unfold), unfold);
      layer = std.mix(layer, neighbor, std.clamp(0.5 - endDistance, 0, 0.5));
    }
    if (compositeState.$.facesFold === 1) {
      const leaf = leafColor(offset, unfold);
      layer = std.add(leaf, std.mul(layer, 1 - leaf.w));
    }
    return layer;
  };

  /** While the faces move, the pixel averages unfolds spread over the shutter. */
  const facesColor = (pixel: d.v2f): d.v4f => {
    "use gpu";
    const state = compositeState.$;
    const offset = d.vec2f(pixel.x - state.facesCenter.x, state.facesCenter.y - pixel.y);
    let count = d.i32(1);
    if (std.abs(state.facesUnfold.y - state.facesUnfold.x) > 0.00001) {
      count = FACE_SHUTTER_SAMPLES;
    }
    let layer = d.vec4f(0);
    for (let sample = 0; sample < FACE_SHUTTER_SAMPLES; sample += 1) {
      if (sample >= count) {
        break;
      }
      const shutter = (d.f32(sample) + 0.5) / d.f32(count);
      const unfold = std.mix(state.facesUnfold.x, state.facesUnfold.y, shutter);
      layer = std.add(layer, facesColorAt(offset, unfold));
    }
    return std.div(layer, d.f32(count));
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

    // During the fourth direction only the faces exist, split from the isometric render.
    let object = d.vec4f(0);
    if (state.facesEnabled === 1) {
      object = facesColor(pixel);
    } else {
      object = sampleObject(pixel);
    }
    color = std.add(object.xyz, std.mul(color, 1 - object.w));

    const overlay = std.textureSampleLevel(overlayView.$, linearSampler.$, uv, 0);
    color = std.mix(color, overlay.xyz, overlay.w);
    const noise = hash(std.add(std.floor(pixel), d.vec2f(state.grainStep * 17.31, 3.7))) - 0.5;
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

      const { faces, floor, haze, light, shuffle, sponge, star, tesseract, tones } = frame.scene;
      const [camera, closeCamera] = frame.shutter.cameras;
      const resting = { from: [0, 0, 0], progress: 0, to: [0, 0, 0] } as const;
      const [moveA = resting, moveB = resting, moveC = resting] = shuffle.moves;
      sceneState.write({
        ambient: light.ambient,
        anchorToProbe: sponge.anchorToProbe,
        aoScale: light.aoScale,
        shadeStrength: light.shadeStrength,
        aspectRatio: canvas.width / canvas.height,
        back: vector(camera.back),
        closeBack: vector(closeCamera.back),
        closeFocus: vector(closeCamera.target),
        closeHalfHeight: closeCamera.halfHeight,
        closeRayStart: closeCamera.rayStart,
        closeRight: vector(closeCamera.right),
        closeTanHalfFieldOfView: closeCamera.tanHalfFieldOfView,
        closeUp: vector(closeCamera.up),
        depth: sponge.depth,
        floorStrength: floor.strength,
        floorHeight: floor.height,
        halfHeight: camera.halfHeight,
        hazeClear: haze.clear,
        hazeHidden: haze.hidden,
        hazeDensity: haze.density,
        hazeStart: haze.start,
        key: light.key,
        light: vector(light.direction),
        mode: frame.scene.mode === "tesseract" ? 1 : frame.scene.mode === "shuffle" ? 2 : 0,
        moveCount: shuffle.moves.length,
        fadePixels: shuffle.fadePixels,
        starEnabled: star.enabled ? 1 : 0,
        starHexRadius: star.hexRadius,
        starRotation: d.vec2f(...frame.shutter.starRotation),
        starWidthsA: d.vec4f(star.widths[0], star.widths[1], star.widths[2], star.widths[3]),
        starWidthsB: d.vec4f(star.widths[4], star.widths[5], star.widths[6], 0),
        moveFromA: vector(moveA.from),
        moveFromB: vector(moveB.from),
        moveFromC: vector(moveC.from),
        moveMinLevel: shuffle.moveMinLevel,
        moveProgress: d.vec3f(moveA.progress, moveB.progress, moveC.progress),
        moveToA: vector(moveA.to),
        moveToB: vector(moveB.to),
        moveToC: vector(moveC.to),
        shuffleDepth: shuffle.depth,
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
      slotState.write(
        Array.from({ length: 7 }, (_, group) =>
          d.vec4f(
            shuffle.slots[group * 4] ?? 0,
            shuffle.slots[group * 4 + 1] ?? 0,
            shuffle.slots[group * 4 + 2] ?? 0,
            shuffle.slots[group * 4 + 3] ?? 0,
          ),
        ),
      );
      compositeState.write({
        facesCenter: d.vec2f(...faces.center),
        facesEnabled: faces.enabled ? 1 : 0,
        facesFold: { leaf: 1, shear: 2, wait: 0 }[faces.fold],
        facesRadius: faces.radius,
        facesUnfold: d.vec2f(...frame.shutter.unfold),
        newTone: vector(inks.newFace),
        grainStep: frame.grainStep,
        grain: frame.grain,
        outputSize: d.vec2f(canvas.width, canvas.height),
        shadowTint: vector(frame.shadowTint),
        yTone: vector(tones.y),
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
