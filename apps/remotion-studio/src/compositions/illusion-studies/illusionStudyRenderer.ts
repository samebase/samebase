import { common, d, std, tgpu } from "typegpu";

import type { WebGpuFrameRenderer } from "../../webgpu/useWebGpuFrame";
import type { FilmV3Camera, Rgb, Vector3 } from "../samebase-film-v3/filmV3Timeline";

const MAXIMUM_SAMPLE_GRID = 4;
const MAXIMUM_RAY_STEPS = 256;
const MAXIMUM_SPONGE_LEVELS = 14;
/** The stack scene holds up to this many unit cells. */
const MAXIMUM_STACK_CELLS = 12;
/**
Cut cells grow by this much, so neighbors overlap: two cut boxes that only touch leave a skin of
zero thickness on the shared face. It moves the hole walls by a fifth of a pixel.
*/
const HOLE_OVERLAP = 0.002;
/**
A sponge opening fades in between these widths, in pixels: narrower openings stay closed, so the
detail follows the pixel footprint and never pops.
*/
const OPENING_CLOSED_PIXELS = 1.5;
const OPENING_OPEN_PIXELS = 3.5;

/**
One study frame. The renderer draws the film v3 look: the camera-fixed key light, the face tones,
the sky gradient, the grain, and the half-frame shutter.
*/
export type IllusionStudyFrame = {
  /** The camera at the shutter open and close. Each antialiasing sample takes its own time. */
  cameras: readonly [FilmV3Camera, FilmV3Camera];
  grain: number;
  /** The grain changes 15 times a second at every frame rate. */
  grainStep: number;
  /**
  The haze has the sky color behind the pixel. Its optical depth along a view ray is
  `density * width * softplus((distance - start) / width)`: clear air near the camera, then an even
  density past `start`.
  */
  haze: {
    /**
    A clearing around the first cube. Past the cube box, at 3D distance `d` from it, the view fades
    to the sky by `exp(-(veil * smoothstep(0, edge, d) + d / radius))`: a veil over everything
    outside the cube that thins as the haze lifts, and a wide fade with no flat shoulder, so it reads
    as haze and not as a mask edge.
    */
    clearing: { center: Vector3; edge: number; halfSize: number; radius: number; veil: number };
    density: number;
    start: number;
    width: number;
  };
  light: {
    ambient: number;
    aoScale: number;
    /** 0 draws no occlusion. */
    aoStrength: number;
    /** Unit vector toward the key light. */
    direction: Vector3;
    key: number;
    /** The shade never passes this: 1 keeps every face at or below its own tone. */
    shadeLimit: number;
    /** 0 draws no cast shadow. */
    shadowStrength: number;
  };
  /**
  Thin lines of `ink` on outlines, creases, and depth steps, drawn over the picture at `strength`
  (0 draws none). They follow the picture: two scenes with the same key view picture get the same
  lines there.
  */
  lines: { ink: Rgb; strength: number };
  sampleGrid: number;
  scene:
    | {
        kind: "sponge";
        /** The sponge fills the octant of `octant` signs from this corner. */
        corner: Vector3;
        octant: Vector3;
        /** Half size of the outermost cell. The haze hides everything past it. */
        halfSize: number;
      }
    | {
        kind: "notch";
        blockHalf: number;
        /** The notch is the corner cell nearest the key view. */
        notchCenter: Vector3;
        notchHalf: number;
      }
    | {
        kind: "room";
        /**
        A real cube in a room corner: the far three walls of the box of half size `halfSize` at
        `center`, as seen along `signs` (the key view direction toward the camera, one sign per
        axis), and a cube of half the box size that rests in the far corner. The walls are `wall`
        thick, and their outer edges are cut along the key view, so in the key view no edge shows a
        rim.
        */
        center: Vector3;
        halfSize: number;
        signs: Vector3;
        wall: number;
      }
    | {
        kind: "stack";
        /**
        Unit cubes (half size 1) in the box of half size `halfSize` at `center`, in box coordinates
        where the camera side of the key view is + on every axis (`signs` maps them to the scene).
        `cubes` stands the cells in the far corner of a room, as the far three walls of the box,
        `wall` thick and cut along the key view. `holes` is the depth inversion: the solid box with
        the cells mirrored through its center cut away. For cells that fill the corner without gaps
        (a plane partition), both give the same key view picture.
        */
        cells: readonly Vector3[];
        center: Vector3;
        form: "cubes" | "holes";
        halfSize: number;
        signs: Vector3;
        wall: number;
      };
  sky: readonly [Rgb, Rgb];
  tones: { x: Rgb; y: Rgb; z: Rgb };
};

const StudyState = d.struct({
  aspectRatio: d.f32,
  /** One pixel in screen units, where the frame height spans 2. */
  pixelSize: d.f32,
  sampleGrid: d.i32,
  right: d.vec3f,
  up: d.vec3f,
  back: d.vec3f,
  focus: d.vec3f,
  halfHeight: d.f32,
  tanHalfFieldOfView: d.f32,
  rayStart: d.f32,
  rayEnd: d.f32,
  closeRight: d.vec3f,
  closeUp: d.vec3f,
  closeBack: d.vec3f,
  closeFocus: d.vec3f,
  closeHalfHeight: d.f32,
  closeTanHalfFieldOfView: d.f32,
  closeRayStart: d.f32,
  light: d.vec3f,
  ambient: d.f32,
  key: d.f32,
  aoScale: d.f32,
  aoStrength: d.f32,
  shadeLimit: d.f32,
  shadowStrength: d.f32,
  hazeDensity: d.f32,
  hazeStart: d.f32,
  hazeWidth: d.f32,
  clearingCenter: d.vec3f,
  clearingHalf: d.f32,
  clearingRadius: d.f32,
  clearingEdge: d.f32,
  clearingVeil: d.f32,
  /** 0 is the sponge, 1 the notched block, 2 the room corner, and 3 the stack. */
  mode: d.i32,
  corner: d.vec3f,
  octant: d.vec3f,
  spongeHalf: d.f32,
  blockHalf: d.f32,
  notchCenter: d.vec3f,
  notchHalf: d.f32,
  roomCenter: d.vec3f,
  roomSigns: d.vec3f,
  roomHalf: d.f32,
  roomWall: d.f32,
  /** 0 stands the stack cells in the room and 1 cuts them out of the box. */
  stackHoles: d.i32,
  stackCount: d.i32,
  boundsCenter: d.vec3f,
  boundsHalf: d.vec3f,
  xTone: d.vec3f,
  yTone: d.vec3f,
  zTone: d.vec3f,
  skyTop: d.vec3f,
  skyBottom: d.vec3f,
  grain: d.f32,
  grainStep: d.f32,
  lineInk: d.vec3f,
  lineStrength: d.f32,
});

const TraceSample = d.struct({
  color: d.vec3f,
  coverage: d.f32,
  /** 1 on a hit, with the surface normal and the distance behind the focal plane. */
  hit: d.f32,
  normal: d.vec3f,
  depth: d.f32,
});

const SceneOutput = { color: d.vec4f, geometry: d.vec4f };

const rectangleDistance = (point: d.v2f, halfSize: d.v2f): number => {
  "use gpu";
  const delta = std.sub(std.abs(point), halfSize);
  return std.length(std.max(delta, d.vec2f(0))) + std.min(std.max(delta.x, delta.y), 0);
};

const boxDistance = (point: d.v3f, half: d.v3f): number => {
  "use gpu";
  const delta = std.sub(std.abs(point), half);
  return std.length(std.max(delta, d.vec3f(0))) + std.min(std.max(delta.x, delta.y, delta.z), 0);
};

/** The three square channels of a Menger cell of half size 3, each `width` wide on either side. */
const crossDistance = (point: d.v3f, width: number): number => {
  "use gpu";
  const arm = d.vec2f(width);
  return std.min(
    rectangleDistance(d.vec2f(point.x, point.y), arm),
    rectangleDistance(d.vec2f(point.x, point.z), arm),
    rectangleDistance(d.vec2f(point.y, point.z), arm),
  );
};

const hash = (value: d.v2f): number => {
  "use gpu";
  return std.fract(std.sin(std.dot(value, d.vec2f(12.9898, 78.233))) * 43758.5453);
};

function vector([x, y, z]: Vector3): d.v3f {
  return d.vec3f(x, y, z);
}

/**
The scene fields of the uniform state. The modes that are not drawn keep inert values: the shader
reads the sponge fields only in mode 0, the block fields only in mode 1, and the room fields only in
mode 2.
*/
function sceneUniforms(scene: IllusionStudyFrame["scene"]) {
  const inert = { point: d.vec3f(0), size: 1 };
  switch (scene.kind) {
    case "sponge": {
      const { corner, halfSize, octant } = scene;
      return {
        blockHalf: inert.size,
        boundsCenter: vector([
          corner[0] + octant[0] * halfSize,
          corner[1] + octant[1] * halfSize,
          corner[2] + octant[2] * halfSize,
        ]),
        boundsHalf: d.vec3f(halfSize),
        corner: vector(corner),
        mode: 0,
        notchCenter: inert.point,
        notchHalf: inert.size,
        octant: vector(octant),
        roomCenter: inert.point,
        roomHalf: inert.size,
        roomSigns: inert.point,
        roomWall: inert.size,
        stackCount: 0,
        stackHoles: 0,
        spongeHalf: halfSize,
      };
    }
    case "notch": {
      const { blockHalf, notchCenter, notchHalf } = scene;
      return {
        blockHalf,
        boundsCenter: d.vec3f(0),
        boundsHalf: d.vec3f(blockHalf),
        corner: inert.point,
        mode: 1,
        notchCenter: vector(notchCenter),
        notchHalf,
        octant: inert.point,
        roomCenter: inert.point,
        roomHalf: inert.size,
        roomSigns: inert.point,
        roomWall: inert.size,
        stackCount: 0,
        stackHoles: 0,
        spongeHalf: inert.size,
      };
    }
    case "room": {
      const { center, halfSize, signs, wall } = scene;
      return {
        blockHalf: inert.size,
        boundsCenter: vector(center),
        boundsHalf: d.vec3f(halfSize + wall),
        corner: inert.point,
        mode: 2,
        notchCenter: inert.point,
        notchHalf: inert.size,
        octant: inert.point,
        roomCenter: vector(center),
        roomHalf: halfSize,
        roomSigns: vector(signs),
        roomWall: wall,
        stackCount: 0,
        stackHoles: 0,
        spongeHalf: inert.size,
      };
    }
    case "stack": {
      const { cells, center, form, halfSize, signs, wall } = scene;
      return {
        blockHalf: inert.size,
        boundsCenter: vector(center),
        boundsHalf: d.vec3f(halfSize + wall),
        corner: inert.point,
        mode: 3,
        notchCenter: inert.point,
        notchHalf: inert.size,
        octant: inert.point,
        roomCenter: vector(center),
        roomHalf: halfSize,
        roomSigns: vector(signs),
        roomWall: wall,
        stackCount: cells.length,
        stackHoles: form === "holes" ? 1 : 0,
        spongeHalf: inert.size,
      };
    }
    default:
      return scene satisfies never;
  }
}

export async function createIllusionStudyRenderer(
  canvas: HTMLCanvasElement,
): Promise<WebGpuFrameRenderer<IllusionStudyFrame>> {
  const root = await tgpu.init();
  const context = root.configureContext({ canvas, alphaMode: "opaque" });
  const size = [canvas.width, canvas.height] as const;
  const makeTarget = () =>
    root.createTexture({ format: "rgba16float", size }).$usage("render", "sampled");
  const colorTexture = makeTarget();
  const geometryTexture = makeTarget();
  const colorView = colorTexture.createView();
  const geometryView = geometryTexture.createView();
  const sampler = root.createSampler({ magFilter: "nearest", minFilter: "nearest" });
  const state = root.createUniform(StudyState);
  /** Stack cell centers in box coordinates; a uniform array needs a 16 byte stride. */
  const stackState = root.createUniform(d.arrayOf(d.vec4f, MAXIMUM_STACK_CELLS));

  /**
  The self-similar sponge: the outermost cell fills the octant from the corner out to twice its half
  size, and every cell inside splits the Menger way. Each level of openings fades in by its width
  against `threshold`, half the pixel footprint, so scaling the camera by 3 about the corner gives
  the same picture.
  */
  const spongeDistance = (point: d.v3f, threshold: number): number => {
    "use gpu";
    const half = state.$.spongeHalf;
    const unit = std.sub(
      std.div(std.mul(std.sub(point, state.$.corner), state.$.octant), half),
      d.vec3f(1),
    );
    const outer = boxDistance(unit, d.vec3f(1)) * half;
    let removed = d.f32(1000000);
    let scale = d.f32(1);
    for (let level = 0; level < MAXIMUM_SPONGE_LEVELS; level += 1) {
      const openingPixels = half / (3 * scale) / threshold;
      if (openingPixels <= OPENING_CLOSED_PIXELS) {
        break;
      }
      const width = std.smoothstep(OPENING_CLOSED_PIXELS, OPENING_OPEN_PIXELS, openingPixels);
      const repeated = std.sub(
        std.mul(std.fract(std.mul(std.add(std.mul(unit, scale), d.vec3f(1)), 0.5)), 2),
        d.vec3f(1),
      );
      removed = std.min(removed, (crossDistance(std.mul(repeated, 3), width) / (3 * scale)) * half);
      scale = scale * 3;
    }
    return std.max(outer, -removed);
  };

  /**
  The notched block. The removed box reaches past the block on the outer sides, so no face of it lies
  on a block face.
  */
  const notchDistance = (point: d.v3f): number => {
    "use gpu";
    const notchHalf = state.$.notchHalf;
    const outward = std.sign(state.$.notchCenter);
    const cut = boxDistance(
      std.sub(point, std.add(state.$.notchCenter, std.mul(outward, notchHalf))),
      d.vec3f(notchHalf * 2),
    );
    return std.max(boxDistance(point, d.vec3f(state.$.blockHalf)), -cut);
  };

  /**
  The room corner in box coordinates `q`, where the camera side is +q on every axis: the walls lie
  just past the far faces at q = -half, the cube rests in the far corner, and the prism of the box
  outline along the key view (the largest minus the smallest coordinate at most twice the half size)
  cuts the wall edges.
  */
  const roomDistance = (point: d.v3f): number => {
    "use gpu";
    const half = state.$.roomHalf;
    const wall = state.$.roomWall;
    const q = std.mul(std.sub(point, state.$.roomCenter), state.$.roomSigns);
    const outer = -half - wall * 0.5;
    const across = d.vec3f(half + wall * 0.5);
    const middle = -wall * 0.5;
    const walls = std.min(
      boxDistance(
        std.sub(q, d.vec3f(outer, middle, middle)),
        d.vec3f(wall * 0.5, across.y, across.z),
      ),
      boxDistance(
        std.sub(q, d.vec3f(middle, outer, middle)),
        d.vec3f(across.x, wall * 0.5, across.z),
      ),
      boxDistance(
        std.sub(q, d.vec3f(middle, middle, outer)),
        d.vec3f(across.x, across.y, wall * 0.5),
      ),
    );
    const prism = (std.max(q.x, q.y, q.z) - std.min(q.x, q.y, q.z) - 2 * half) / Math.SQRT2;
    const cube = boxDistance(std.add(q, d.vec3f(half * 0.5)), d.vec3f(half * 0.5));
    return std.min(std.max(walls, prism), cube);
  };

  /** The far three walls of the room box, in box coordinates, cut along the key view. */
  const wallsDistance = (q: d.v3f): number => {
    "use gpu";
    const half = state.$.roomHalf;
    const wall = state.$.roomWall;
    const outer = -half - wall * 0.5;
    const across = half + wall * 0.5;
    const middle = -wall * 0.5;
    const walls = std.min(
      boxDistance(std.sub(q, d.vec3f(outer, middle, middle)), d.vec3f(wall * 0.5, across, across)),
      boxDistance(std.sub(q, d.vec3f(middle, outer, middle)), d.vec3f(across, wall * 0.5, across)),
      boxDistance(std.sub(q, d.vec3f(middle, middle, outer)), d.vec3f(across, across, wall * 0.5)),
    );
    const prism = (std.max(q.x, q.y, q.z) - std.min(q.x, q.y, q.z) - 2 * half) / Math.SQRT2;
    return std.max(walls, prism);
  };

  const stackCell = (index: number): d.v3f => {
    "use gpu";
    // @ts-expect-error A WGSL array read has no undefined case, and every index is below the maximum.
    return d.vec4f(stackState.$[index]).xyz;
  };

  /**
  The stack: cubes on the room walls, or the box with the mirrored cells cut away. A cut cell that
  touches a box face reaches past it, so no cut face lies on a box face.
  */
  const stackDistance = (point: d.v3f): number => {
    "use gpu";
    const s = state.$;
    const q = std.mul(std.sub(point, s.roomCenter), s.roomSigns);
    let cells = d.f32(1000000);
    for (let index = 0; index < MAXIMUM_STACK_CELLS; index += 1) {
      if (index >= s.stackCount) {
        break;
      }
      const cell = stackCell(index);
      if (s.stackHoles === 0) {
        cells = std.min(cells, boxDistance(std.sub(q, cell), d.vec3f(1)));
      } else {
        const mirrored = std.mul(cell, -1);
        const face = s.roomHalf - 1.01;
        let reach = d.vec3f(0);
        if (std.abs(mirrored.x) > face) {
          reach.x = std.sign(mirrored.x);
        }
        if (std.abs(mirrored.y) > face) {
          reach.y = std.sign(mirrored.y);
        }
        if (std.abs(mirrored.z) > face) {
          reach.z = std.sign(mirrored.z);
        }
        cells = std.min(
          cells,
          boxDistance(
            std.sub(q, std.add(mirrored, std.mul(reach, 0.5))),
            std.add(d.vec3f(1 + HOLE_OVERLAP), std.mul(std.abs(reach), 0.5)),
          ),
        );
      }
    }
    if (s.stackHoles === 0) {
      return std.min(wallsDistance(q), cells);
    }
    return std.max(boxDistance(q, d.vec3f(s.roomHalf)), -cells);
  };

  const sceneSample = (point: d.v3f, threshold: number): number => {
    "use gpu";
    if (state.$.mode === 0) {
      return spongeDistance(point, threshold);
    }
    if (state.$.mode === 1) {
      return notchDistance(point);
    }
    if (state.$.mode === 2) {
      return roomDistance(point);
    }
    return stackDistance(point);
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
        std.mul(a, sceneSample(std.add(point, std.mul(a, epsilon)), threshold)),
        std.mul(b, sceneSample(std.add(point, std.mul(b, epsilon)), threshold)),
      ),
      std.add(
        std.mul(c, sceneSample(std.add(point, std.mul(c, epsilon)), threshold)),
        std.mul(e, sceneSample(std.add(point, std.mul(e, epsilon)), threshold)),
      ),
    );
    return std.normalize(sum);
  };

  const softShadow = (origin: d.v3f, threshold: number): number => {
    "use gpu";
    const aoScale = state.$.aoScale;
    // The sponge keeps the soft film shadow. The plain scenes use a hard edge: their shadows lie
    // exactly behind the faces that cast them in the key view, and a soft edge would show a rim there.
    let hardness = d.f32(8);
    if (state.$.mode > 0) {
      hardness = 400;
    }
    let light = d.f32(1);
    let distance = aoScale * 0.5;
    for (let step = 0; step < 56; step += 1) {
      // Shadow rays see openings below four pixels as solid, so a fine grid casts no moire.
      const sample = sceneSample(std.add(origin, std.mul(state.$.light, distance)), threshold * 4);
      light = std.min(light, (hardness * sample) / distance);
      distance += std.clamp(sample, aoScale * 0.25, aoScale * 8);
      if (light < 0.002) {
        break;
      }
    }
    return std.clamp(light, 0, 1);
  };

  const ambientOcclusion = (point: d.v3f, normal: d.v3f, threshold: number): number => {
    "use gpu";
    const aoScale = state.$.aoScale;
    let occlusion = d.f32(0);
    let weight = d.f32(1);
    for (let sample = 1; sample <= 5; sample += 1) {
      const offset = aoScale * d.f32(sample);
      const distance = sceneSample(std.add(point, std.mul(normal, offset)), threshold);
      occlusion += (weight * (offset - distance)) / aoScale;
      weight *= 0.62;
    }
    return std.clamp(1 - 0.28 * occlusion, 0, 1);
  };

  /** One sample at `screenPoint`, `shutter` of the way from the shutter open to its close. */
  const traceSample = (screenPoint: d.v2f, shutter: number): d.Infer<typeof TraceSample> => {
    "use gpu";
    const s = state.$;
    const right = std.mix(s.right, s.closeRight, shutter);
    const up = std.mix(s.up, s.closeUp, shutter);
    const back = std.mix(s.back, s.closeBack, shutter);
    const focus = std.mix(s.focus, s.closeFocus, shutter);
    const halfHeight = std.mix(s.halfHeight, s.closeHalfHeight, shutter);
    const tanHalfFieldOfView = std.mix(s.tanHalfFieldOfView, s.closeTanHalfFieldOfView, shutter);
    const rayStart = std.mix(s.rayStart, s.closeRayStart, shutter);
    const lateral = std.add(std.mul(right, screenPoint.x), std.mul(up, screenPoint.y));
    const focalPoint = std.add(focus, std.mul(lateral, halfHeight));
    const rayDirection = std.normalize(std.sub(std.mul(lateral, tanHalfFieldOfView), back));
    const origin = std.sub(focalPoint, std.mul(rayDirection, rayStart));
    const footprintStart = s.pixelSize * halfHeight;
    const footprintGrowth = s.pixelSize * tanHalfFieldOfView;

    const inverseDirection = std.div(d.vec3f(1), rayDirection);
    const entryByAxis = std.mul(
      std.sub(std.sub(s.boundsCenter, s.boundsHalf), origin),
      inverseDirection,
    );
    const exitByAxis = std.mul(
      std.sub(std.add(s.boundsCenter, s.boundsHalf), origin),
      inverseDirection,
    );
    const near = std.min(entryByAxis, exitByAxis);
    const far = std.max(entryByAxis, exitByAxis);
    let distance = std.max(near.x, near.y, near.z, 0);
    const exitDistance = std.min(far.x, far.y, far.z, s.rayEnd);

    // The sponge counts a ray within half a pixel of a surface as a hit, which keeps its fine detail
    // stable. The notched block is plain, so its rays march close to the surface: a ray that passes a
    // convex edge then misses it, and the edge never shows the tone of a hidden face.
    let hitFraction = d.f32(0.5);
    if (s.mode > 0) {
      hitFraction = 0.02;
    }
    let hit = d.bool(false);
    let hitPoint = d.vec3f(0);
    let threshold = d.f32(0);
    if (distance < exitDistance) {
      for (let step = 0; step < MAXIMUM_RAY_STEPS; step += 1) {
        const point = std.add(origin, std.mul(rayDirection, distance));
        threshold = std.max(
          hitFraction * (footprintStart + footprintGrowth * (distance - rayStart)),
          footprintStart * hitFraction * 0.1,
        );
        const sample = sceneSample(point, threshold);
        // In the sponge a ray that runs out of steps grazes fine detail, so it counts as a hit. The
        // plain scenes have faces that turn edge on, and a ray that runs along one just outside
        // must miss it, or the outline grows.
        if (sample < threshold || (s.mode === 0 && step === MAXIMUM_RAY_STEPS - 1)) {
          hit = true;
          hitPoint = d.vec3f(point);
          break;
        }
        distance += std.max(sample, threshold * 0.5);
        if (distance > exitDistance) {
          break;
        }
      }
    }
    if (!hit) {
      return TraceSample({ color: d.vec3f(0), coverage: 0, depth: 0, hit: 0, normal: d.vec3f(0) });
    }

    // The normal is read just outside the surface, so flush pieces of a union show no seam.
    const normal = surfaceNormal(
      std.sub(hitPoint, std.mul(rayDirection, threshold * 1.5)),
      threshold,
    );
    const weights = std.mul(normal, normal);
    const tone = std.add(
      std.add(std.mul(s.xTone, weights.x), std.mul(s.yTone, weights.y)),
      std.mul(s.zTone, weights.z),
    );
    const facing = std.max(std.dot(normal, s.light), 0);
    let shadow = d.f32(1);
    if (facing > 0 && s.shadowStrength > 0) {
      shadow = std.mix(
        1,
        softShadow(std.add(hitPoint, std.mul(normal, threshold * 2)), threshold),
        s.shadowStrength,
      );
    }
    let occlusion = d.f32(1);
    if (s.aoStrength > 0) {
      occlusion = std.mix(1, ambientOcclusion(hitPoint, normal, threshold), s.aoStrength);
    }
    const shade = std.min(s.ambient * occlusion + s.key * facing * shadow, s.shadeLimit);
    // Optical depth of the haze along the view ray, from the eye to the hit.
    const opticalDepth =
      s.hazeDensity * s.hazeWidth * std.log(1 + std.exp((distance - s.hazeStart) / s.hazeWidth));
    // The clearing distance is read a little past the hit along the ray, so a neighbor face in the
    // plane of a cube face counts as outside the cube.
    const past = std.add(hitPoint, std.mul(rayDirection, threshold * 3));
    const fromCube = std.length(
      std.max(
        std.sub(std.abs(std.sub(past, s.clearingCenter)), d.vec3f(s.clearingHalf)),
        d.vec3f(0),
      ),
    );
    const veil = s.clearingVeil * std.smoothstep(0, s.clearingEdge, fromCube);
    const clear = std.exp(-opticalDepth - veil - fromCube / s.clearingRadius);
    return TraceSample({
      color: std.mul(tone, shade * clear),
      coverage: clear,
      depth: distance - rayStart,
      hit: 1,
      normal,
    });
  };

  const sceneFragment = tgpu.fragmentFn({
    in: { uv: d.vec2f },
    out: SceneOutput,
  })(({ uv }) => {
    "use gpu";
    const s = state.$;
    const screenPoint = d.vec2f((uv.x - 0.5) * 2 * s.aspectRatio, (0.5 - uv.y) * 2);
    const grid = s.sampleGrid;
    let color = d.vec3f(0);
    let coverage = d.f32(0);
    let hits = d.f32(0);
    let normal = d.vec3f(0);
    let depth = d.f32(0);
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
          s.pixelSize,
        );
        // Neighboring samples take shutter times far apart, so a moving edge blurs evenly.
        const shutterIndex = ((sampleY * grid + sampleX) * 7) % (grid * grid);
        const sample = traceSample(
          std.add(screenPoint, offset),
          (d.f32(shutterIndex) + 0.5) / d.f32(grid * grid),
        );
        color = std.add(color, sample.color);
        coverage += sample.coverage;
        hits += sample.hit;
        normal = std.add(normal, sample.normal);
        depth += sample.depth * sample.hit;
      }
    }
    const count = d.f32(grid * grid);
    return {
      color: d.vec4f(std.div(color, count), coverage / count),
      geometry: d.vec4f(normal, depth / std.max(hits, 1)),
    };
  });

  const readColor = (uv: d.v2f): d.v4f => {
    "use gpu";
    return std.textureSampleLevel(colorView.$, sampler.$, uv, 0);
  };

  const readGeometry = (uv: d.v2f): d.v4f => {
    "use gpu";
    return std.textureSampleLevel(geometryView.$, sampler.$, uv, 0);
  };

  /**
  The line weight between the pixel at `uv` and its neighbor `step` away: an outline where the
  coverage changes, and a crease where two covered pixels face different ways.
  */
  const edgeWith = (uv: d.v2f, step: d.v2f, coverage: number, normal: d.v3f): number => {
    "use gpu";
    const neighbor = std.add(uv, step);
    const neighborCoverage = readColor(neighbor).w;
    let edge = std.abs(coverage - neighborCoverage);
    if (coverage > 0.5 && neighborCoverage > 0.5) {
      const bend = 1 - std.dot(normal, std.normalize(readGeometry(neighbor).xyz));
      edge = std.max(edge, std.smoothstep(0.03, 0.25, bend));
    }
    return edge;
  };

  /**
  A depth step across the pixel along `step`: the second difference of the depth, in pixel widths.
  A flat face has none, so only a face in front of another face draws a line.
  */
  const depthStep = (uv: d.v2f, step: d.v2f, depth: number, footprint: number): number => {
    "use gpu";
    const before = std.sub(uv, step);
    const after = std.add(uv, step);
    if (readColor(before).w < 0.5 || readColor(after).w < 0.5) {
      return 0;
    }
    const bend = std.abs(readGeometry(before).w + readGeometry(after).w - 2 * depth) / footprint;
    return std.smoothstep(3, 8, bend);
  };

  const compositeFragment = tgpu.fragmentFn({
    in: { uv: d.vec2f },
    out: d.vec4f,
  })(({ uv }) => {
    "use gpu";
    const s = state.$;
    const object = readColor(uv);
    // The sky is the film backdrop: a vertical gradient from the top to the bottom of the frame.
    const sky = std.mix(s.skyTop, s.skyBottom, uv.y);
    let pixelColor = std.add(object.xyz, std.mul(sky, 1 - object.w));
    if (s.lineStrength > 0) {
      const texel = d.vec2f(s.pixelSize / (2 * s.aspectRatio), s.pixelSize / 2);
      const across = d.vec2f(texel.x, 0);
      const down = d.vec2f(0, texel.y);
      const geometry = readGeometry(uv);
      const normal = std.normalize(geometry.xyz);
      let edge = std.max(
        std.max(
          edgeWith(uv, across, object.w, normal),
          edgeWith(uv, std.mul(across, -1), object.w, normal),
        ),
        std.max(
          edgeWith(uv, down, object.w, normal),
          edgeWith(uv, std.mul(down, -1), object.w, normal),
        ),
      );
      if (object.w > 0.5) {
        const footprint = s.pixelSize * s.halfHeight;
        edge = std.max(
          edge,
          std.max(
            depthStep(uv, across, geometry.w, footprint),
            depthStep(uv, down, geometry.w, footprint),
          ),
        );
      }
      pixelColor = std.mix(pixelColor, s.lineInk, std.min(edge, 1) * s.lineStrength);
    }
    const pixel = std.floor(
      d.vec2f((uv.x * 2 * s.aspectRatio) / s.pixelSize, (uv.y * 2) / s.pixelSize),
    );
    const noise = hash(std.add(pixel, d.vec2f(s.grainStep * 17.31, 3.7))) - 0.5;
    pixelColor = std.add(pixelColor, d.vec3f(noise * s.grain));
    return d.vec4f(std.clamp(pixelColor, d.vec3f(0), d.vec3f(1)), 1);
  });

  const scenePipeline = root.createRenderPipeline({
    fragment: sceneFragment,
    targets: { color: { format: "rgba16float" }, geometry: { format: "rgba16float" } },
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
      const [camera, closeCamera] = frame.cameras;
      const { haze, light, scene, sky, tones } = frame;
      state.write({
        ...sceneUniforms(scene),
        ambient: light.ambient,
        aoScale: light.aoScale,
        aoStrength: light.aoStrength,
        aspectRatio: canvas.width / canvas.height,
        back: vector(camera.back),
        closeBack: vector(closeCamera.back),
        closeFocus: vector(closeCamera.target),
        closeHalfHeight: closeCamera.halfHeight,
        closeRayStart: closeCamera.rayStart,
        closeRight: vector(closeCamera.right),
        closeTanHalfFieldOfView: closeCamera.tanHalfFieldOfView,
        closeUp: vector(closeCamera.up),
        focus: vector(camera.target),
        grain: frame.grain,
        grainStep: frame.grainStep,
        halfHeight: camera.halfHeight,
        hazeDensity: haze.density,
        hazeStart: haze.start,
        hazeWidth: haze.width,
        clearingCenter: vector(haze.clearing.center),
        clearingHalf: haze.clearing.halfSize,
        clearingRadius: haze.clearing.radius,
        clearingEdge: haze.clearing.edge,
        clearingVeil: haze.clearing.veil,
        key: light.key,
        lineInk: vector(frame.lines.ink),
        lineStrength: frame.lines.strength,
        light: vector(light.direction),
        pixelSize: 2 / canvas.height,
        rayEnd: camera.rayEnd,
        rayStart: camera.rayStart,
        right: vector(camera.right),
        sampleGrid: frame.sampleGrid,
        shadeLimit: light.shadeLimit,
        shadowStrength: light.shadowStrength,
        skyBottom: vector(sky[1]),
        skyTop: vector(sky[0]),
        tanHalfFieldOfView: camera.tanHalfFieldOfView,
        up: vector(camera.up),
        xTone: vector(tones.x),
        yTone: vector(tones.y),
        zTone: vector(tones.z),
      });
      const cells = scene.kind === "stack" ? scene.cells : [];
      stackState.write(
        Array.from({ length: MAXIMUM_STACK_CELLS }, (_, index) => {
          const [x, y, z] = cells[index] ?? [0, 0, 0];
          return d.vec4f(x, y, z, 1);
        }),
      );
      scenePipeline
        .withColorAttachment({
          color: { view: colorTexture },
          geometry: { view: geometryTexture },
        })
        .draw(3);
      compositePipeline.withColorAttachment({ view: context }).draw(3);
      return root.device.queue.onSubmittedWorkDone();
    },
  };
}
