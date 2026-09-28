import { common, d, std, tgpu } from "typegpu";

import type { WebGpuFrameRenderer } from "../../webgpu/useWebGpuFrame";
import type { FilmV3Camera, Rgb, Vector3 } from "../samebase-film-v3/filmV3Timeline";

const MAXIMUM_SAMPLE_GRID = 4;
const MAXIMUM_RAY_STEPS = 256;
const MAXIMUM_SPONGE_LEVELS = 14;
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
  haze: { density: number; start: number; width: number };
  light: {
    ambient: number;
    aoScale: number;
    /** 0 draws no occlusion. */
    aoStrength: number;
    /** Unit vector toward the key light. */
    direction: Vector3;
    key: number;
    /** 0 draws no cast shadow. */
    shadowStrength: number;
  };
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
        /** `plain` is a solid block and `mark` the level 1 Menger sponge of the Samebase mark. */
        block: "mark" | "plain";
        blockHalf: number;
        /** The notch is the corner cell nearest the key view. */
        notchCenter: Vector3;
        notchHalf: number;
        /**
        `cube` puts a real cube in front of the notch: the notch cell turned half a turn about the key
        view axis, so that in the key view it covers the notch with the same three faces.
        */
        notch: "cube" | "hole";
        cubeCenter: Vector3;
        /** Unit vector along the key view, toward the camera. */
        keyAxis: Vector3;
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
  shadowStrength: d.f32,
  hazeDensity: d.f32,
  hazeStart: d.f32,
  hazeWidth: d.f32,
  /** 0 is the sponge and 1 the notched block. */
  mode: d.i32,
  corner: d.vec3f,
  octant: d.vec3f,
  spongeHalf: d.f32,
  /** 0 is the plain block and 1 the mark. */
  markBlock: d.i32,
  blockHalf: d.f32,
  notchCenter: d.vec3f,
  notchHalf: d.f32,
  cubeFilled: d.i32,
  cubeCenter: d.vec3f,
  keyAxis: d.vec3f,
  boundsCenter: d.vec3f,
  boundsHalf: d.vec3f,
  xTone: d.vec3f,
  yTone: d.vec3f,
  zTone: d.vec3f,
  skyTop: d.vec3f,
  skyBottom: d.vec3f,
  grain: d.f32,
  grainStep: d.f32,
});

const TraceSample = d.struct({ color: d.vec3f, coverage: d.f32 });

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

/** Half a turn about the unit axis `axis`. */
const halfTurn = (point: d.v3f, axis: d.v3f): d.v3f => {
  "use gpu";
  return std.sub(std.mul(axis, 2 * std.dot(point, axis)), point);
};

const hash = (value: d.v2f): number => {
  "use gpu";
  return std.fract(std.sin(std.dot(value, d.vec2f(12.9898, 78.233))) * 43758.5453);
};

function vector([x, y, z]: Vector3): d.v3f {
  return d.vec3f(x, y, z);
}

/**
The scene fields of the uniform state. The mode that is not drawn keeps inert values: the shader
reads the sponge fields only in mode 0 and the block fields only in mode 1.
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
        cubeCenter: inert.point,
        cubeFilled: 0,
        keyAxis: inert.point,
        markBlock: 0,
        mode: 0,
        notchCenter: inert.point,
        notchHalf: inert.size,
        octant: vector(octant),
        spongeHalf: halfSize,
      };
    }
    case "notch": {
      const { block, blockHalf, cubeCenter, keyAxis, notch, notchCenter, notchHalf } = scene;
      // The real cube floats in front of the notch, out past the block.
      const reach = Math.max(...cubeCenter.map(Math.abs)) + Math.sqrt(3) * notchHalf;
      return {
        blockHalf,
        boundsCenter: d.vec3f(0),
        boundsHalf: d.vec3f(Math.max(blockHalf, reach)),
        corner: inert.point,
        cubeCenter: vector(cubeCenter),
        cubeFilled: notch === "cube" ? 1 : 0,
        keyAxis: vector(keyAxis),
        markBlock: block === "mark" ? 1 : 0,
        mode: 1,
        notchCenter: vector(notchCenter),
        notchHalf,
        octant: inert.point,
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
  const state = root.createUniform(StudyState);

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

  const blockDistance = (point: d.v3f): number => {
    "use gpu";
    const half = state.$.blockHalf;
    const solid = boxDistance(point, d.vec3f(half));
    if (state.$.markBlock === 0) {
      return solid;
    }
    return std.max(solid, (-crossDistance(std.mul(std.div(point, half), 3), 1) / 3) * half);
  };

  /**
  The notched block, and the real cube when the notch holds one. The removed box reaches past the
  block on the outer sides, so no face of it lies on a block face. Returns the distance and 1 on the
  block or 2 on the cube.
  */
  const notchSample = (point: d.v3f): d.v2f => {
    "use gpu";
    const notchHalf = state.$.notchHalf;
    const outward = std.sign(state.$.notchCenter);
    const cut = boxDistance(
      std.sub(point, std.add(state.$.notchCenter, std.mul(outward, notchHalf))),
      d.vec3f(notchHalf * 2),
    );
    const block = std.max(blockDistance(point), -cut);
    if (state.$.cubeFilled === 0) {
      return d.vec2f(block, 1);
    }
    const cube = boxDistance(
      halfTurn(std.sub(point, state.$.cubeCenter), state.$.keyAxis),
      d.vec3f(notchHalf),
    );
    if (cube < block) {
      return d.vec2f(cube, 2);
    }
    return d.vec2f(block, 1);
  };

  const sceneSample = (point: d.v3f, threshold: number): d.v2f => {
    "use gpu";
    if (state.$.mode === 0) {
      return d.vec2f(spongeDistance(point, threshold), 1);
    }
    return notchSample(point);
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
    const aoScale = state.$.aoScale;
    let light = d.f32(1);
    let distance = aoScale * 0.5;
    for (let step = 0; step < 56; step += 1) {
      // Shadow rays see openings below four pixels as solid, so a fine grid casts no moire.
      const sample = sceneSample(
        std.add(origin, std.mul(state.$.light, distance)),
        threshold * 4,
      ).x;
      light = std.min(light, (8 * sample) / distance);
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
      const distance = sceneSample(std.add(point, std.mul(normal, offset)), threshold).x;
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
    // cube edge then misses it, and the edge never shows the tone of a hidden face.
    let hitFraction = d.f32(0.5);
    if (s.mode === 1) {
      hitFraction = 0.02;
    }
    let hit = d.bool(false);
    let hitPoint = d.vec3f(0);
    let material = d.f32(0);
    let threshold = d.f32(0);
    if (distance < exitDistance) {
      for (let step = 0; step < MAXIMUM_RAY_STEPS; step += 1) {
        const point = std.add(origin, std.mul(rayDirection, distance));
        threshold = std.max(
          hitFraction * (footprintStart + footprintGrowth * (distance - rayStart)),
          footprintStart * hitFraction * 0.1,
        );
        const sample = sceneSample(point, threshold);
        // A ray that runs out of steps grazes a surface, so it counts as a hit there.
        if (sample.x < threshold || step === MAXIMUM_RAY_STEPS - 1) {
          hit = true;
          hitPoint = d.vec3f(point);
          material = sample.y;
          break;
        }
        distance += std.max(sample.x, threshold * 0.5);
        if (distance > exitDistance) {
          break;
        }
      }
    }
    if (!hit) {
      return TraceSample({ color: d.vec3f(0), coverage: 0 });
    }

    // The normal is read just outside the surface, so flush pieces of a union show no seam.
    const normal = surfaceNormal(
      std.sub(hitPoint, std.mul(rayDirection, threshold * 1.5)),
      threshold,
    );
    // The real cube keeps its own face tones: its faces turn with it.
    let toneNormal = d.vec3f(normal);
    if (material > 1.5) {
      toneNormal = halfTurn(normal, s.keyAxis);
    }
    const weights = std.mul(toneNormal, toneNormal);
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
    const shade = s.ambient * occlusion + s.key * facing * shadow;
    // Optical depth of the haze along the view ray, from the eye to the hit.
    const opticalDepth =
      s.hazeDensity * s.hazeWidth * std.log(1 + std.exp((distance - s.hazeStart) / s.hazeWidth));
    const clear = std.exp(-opticalDepth);
    return TraceSample({ color: std.mul(tone, shade * clear), coverage: clear });
  };

  const fragment = tgpu.fragmentFn({
    in: { uv: d.vec2f },
    out: d.vec4f,
  })(({ uv }) => {
    "use gpu";
    const s = state.$;
    const screenPoint = d.vec2f((uv.x - 0.5) * 2 * s.aspectRatio, (0.5 - uv.y) * 2);
    const grid = s.sampleGrid;
    let color = d.vec3f(0);
    let coverage = d.f32(0);
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
      }
    }
    const count = d.f32(grid * grid);
    // The sky is the film backdrop: a vertical gradient from the top to the bottom of the frame.
    const sky = std.mix(s.skyTop, s.skyBottom, uv.y);
    let pixelColor = std.add(std.div(color, count), std.mul(sky, 1 - coverage / count));
    const pixel = std.floor(
      d.vec2f((uv.x * 2 * s.aspectRatio) / s.pixelSize, (uv.y * 2) / s.pixelSize),
    );
    const noise = hash(std.add(pixel, d.vec2f(s.grainStep * 17.31, 3.7))) - 0.5;
    pixelColor = std.add(pixelColor, d.vec3f(noise * s.grain));
    return d.vec4f(std.clamp(pixelColor, d.vec3f(0), d.vec3f(1)), 1);
  });

  const pipeline = root.createRenderPipeline({ fragment, vertex: common.fullScreenTriangle });
  await pipeline.initAsync();

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
        key: light.key,
        light: vector(light.direction),
        pixelSize: 2 / canvas.height,
        rayEnd: camera.rayEnd,
        rayStart: camera.rayStart,
        right: vector(camera.right),
        sampleGrid: frame.sampleGrid,
        shadowStrength: light.shadowStrength,
        skyBottom: vector(sky[1]),
        skyTop: vector(sky[0]),
        tanHalfFieldOfView: camera.tanHalfFieldOfView,
        up: vector(camera.up),
        xTone: vector(tones.x),
        yTone: vector(tones.y),
        zTone: vector(tones.z),
      });
      pipeline.withColorAttachment({ view: context }).draw(3);
      return root.device.queue.onSubmittedWorkDone();
    },
  };
}
