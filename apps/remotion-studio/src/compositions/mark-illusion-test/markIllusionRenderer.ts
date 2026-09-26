import { common, d, std, tgpu } from "typegpu";

import type { WebGpuFrameRenderer } from "../../webgpu/useWebGpuFrame";
import type { MarkIllusionFrame } from "./markIllusionTimeline";

const SAMPLE_GRID_SIZE = 4;
const MAXIMUM_RAY_STEPS = 128;
const SURFACE_THRESHOLD = 0.0002;
/** Half the frame height, in cube half-sizes, at the cube center plane. */
const FRUSTUM_HALF_HEIGHT = 2.6;
/** Rays start this far before the cube center plane, which is outside the cube. */
const RAY_START_DISTANCE = 5;
const RAY_END_DISTANCE = 10;
/** Projected distance from the isometric cube center to a hexagon vertex, in cube half-sizes. */
const HEXAGON_RADIUS_IN_CUBE_UNITS = 2 * Math.sqrt(2 / 3);
/** High and to the left, so the top, left, and front faces get three clearly different values. */
const LIGHT_POSITION = d.vec3f(-4, 7, 2.5);
/** The lit phase puts a soft shadow on an invisible floor under the cube. */
const FLOOR_HEIGHT = -1;

function hexColor(hex: number): d.v3f {
  return d.vec3f(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255);
}

const BACKGROUND = hexColor(0xf2ede4);
const SLATE = hexColor(0x394447);
// Flat tone of each face direction, as on the landing hero: x left, y top, z right (the mark face).
const X_TONE = hexColor(0x00b8db);
const Y_TONE = hexColor(0xffffff);
const Z_TONE = SLATE;
const LOWER_LEFT_TONE = hexColor(0x8fa1a5);
const LOWER_RIGHT_TONE = hexColor(0xc9eef6);

const SceneState = d.struct({
  aspectRatio: d.f32,
  back: d.vec3f,
  /** One pixel in screen units, where the frame height spans 2. */
  pixelSize: d.f32,
  right: d.vec3f,
  tanHalfFieldOfView: d.f32,
  up: d.vec3f,
});
const TraceSample = d.struct({ coverage: d.vec4f, lit: d.vec4f });

const WarpState = d.struct({
  clampPixels: d.f32,
  flatness: d.f32,
  hexagonRadius: d.f32,
  /** Width in degrees of side 4, the right cube face. */
  lastSideWidth: d.f32,
  outputSize: d.vec2f,
  /** Widths in degrees of sides 0 to 3, in the order of `MarkIllusionSideWidths`. */
  sideWidths: d.vec4f,
  squash: d.vec2f,
  warpEnabled: d.i32,
});

const SceneOutput = { coverage: d.vec4f, lit: d.vec4f };

const rectangleDistance = (point: d.v2f, halfSize: number): number => {
  "use gpu";
  const delta = std.sub(std.abs(point), d.vec2f(halfSize));
  return std.length(std.max(delta, d.vec2f(0))) + std.min(std.max(delta.x, delta.y), 0);
};

/** Depth-1 Menger sponge with half-size 1: the cube minus the three center tunnels. */
const spongeDistance = (point: d.v3f): number => {
  "use gpu";
  const outside = std.sub(std.abs(point), d.vec3f(1));
  const box =
    std.length(std.max(outside, d.vec3f(0))) + std.min(std.max(outside.x, outside.y, outside.z), 0);
  const tunnels = std.min(
    rectangleDistance(point.xy, 1 / 3),
    rectangleDistance(point.yz, 1 / 3),
    rectangleDistance(point.xz, 1 / 3),
  );
  return std.max(box, -tunnels);
};

const surfaceNormal = (point: d.v3f): d.v3f => {
  "use gpu";
  const epsilon = 0.0005;
  return std.normalize(
    d.vec3f(
      spongeDistance(std.add(point, d.vec3f(epsilon, 0, 0))) -
        spongeDistance(std.sub(point, d.vec3f(epsilon, 0, 0))),
      spongeDistance(std.add(point, d.vec3f(0, epsilon, 0))) -
        spongeDistance(std.sub(point, d.vec3f(0, epsilon, 0))),
      spongeDistance(std.add(point, d.vec3f(0, 0, epsilon))) -
        spongeDistance(std.sub(point, d.vec3f(0, 0, epsilon))),
    ),
  );
};

const softShadow = (origin: d.v3f, direction: d.v3f, maximumDistance: number): number => {
  "use gpu";
  let light = d.f32(1);
  let distance = d.f32(0.02);
  for (let step = 0; step < 48; step += 1) {
    const sample = spongeDistance(std.add(origin, std.mul(direction, distance)));
    light = std.min(light, (10 * sample) / distance);
    distance += std.clamp(sample, 0.01, 0.25);
    if (light < 0.001 || distance > maximumDistance) {
      break;
    }
  }
  return std.clamp(light, 0, 1);
};

const ambientOcclusion = (point: d.v3f, normal: d.v3f): number => {
  "use gpu";
  let occlusion = d.f32(0);
  let weight = d.f32(1);
  for (let sample = 1; sample <= 5; sample += 1) {
    const offset = 0.04 * d.f32(sample);
    occlusion += weight * (offset - spongeDistance(std.add(point, std.mul(normal, offset))));
    weight *= 0.7;
  }
  return std.clamp(1 - 2.2 * occlusion, 0, 1);
};

/** Soft point light on one slate material, with shadows, occlusion, and a weak highlight. */
const litColor = (point: d.v3f, normal: d.v3f, rayDirection: d.v3f): d.v3f => {
  "use gpu";
  const toLight = std.sub(LIGHT_POSITION, point);
  const lightDistance = std.length(toLight);
  const lightDirection = std.div(toLight, lightDistance);
  const diffuse = std.max(std.dot(normal, lightDirection), 0);
  const shadow = softShadow(std.add(point, std.mul(normal, 0.002)), lightDirection, lightDistance);
  const occlusion = ambientOcclusion(point, normal);
  const halfway = std.normalize(std.sub(lightDirection, rayDirection));
  const highlight = std.pow(std.max(std.dot(normal, halfway), 0), 24) * shadow;
  const albedo = std.mul(SLATE, 1.3);
  const lighting = 0.35 * occlusion + 1.25 * diffuse * shadow;
  return std.add(std.mul(albedo, lighting), d.vec3f(0.16 * highlight));
};

/** The background with the cube shadow and a contact shade on the floor plane. */
const floorColor = (point: d.v3f): d.v3f => {
  "use gpu";
  const toLight = std.sub(LIGHT_POSITION, point);
  const lightDistance = std.length(toLight);
  const shadow = softShadow(point, std.div(toLight, lightDistance), lightDistance);
  const contact = std.clamp(spongeDistance(point) / 0.8, 0, 1);
  return std.mul(BACKGROUND, 1 - 0.28 * (1 - shadow) - 0.12 * (1 - contact));
};

/** Face direction as a one-hot vector: the flat pass maps each direction to one tone. */
const faceAxis = (normal: d.v3f): d.v3f => {
  "use gpu";
  const axis = std.abs(normal);
  if (axis.x >= axis.y && axis.x >= axis.z) {
    return d.vec3f(1, 0, 0);
  }
  if (axis.y >= axis.z) {
    return d.vec3f(0, 1, 0);
  }
  return d.vec3f(0, 0, 1);
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

/**
Source cube face of each warp side: 0 top, 1 left, 2 right. The cube is symmetric about its
diagonal, so each new side reuses a face with its opening and tunnel walls.
*/
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

/** Tone of each warp side: the three cube face tones and one new tone for each new side. */
const sideTone = (sideIndex: number): d.v3f => {
  "use gpu";
  if (sideIndex === 0) {
    return Y_TONE;
  }
  if (sideIndex === 1) {
    return X_TONE;
  }
  if (sideIndex === 2) {
    return LOWER_LEFT_TONE;
  }
  if (sideIndex === 3) {
    return LOWER_RIGHT_TONE;
  }
  return Z_TONE;
};

export async function createMarkIllusionRenderer(
  canvas: HTMLCanvasElement,
): Promise<WebGpuFrameRenderer<MarkIllusionFrame>> {
  const root = await tgpu.init();
  const { architecture, vendor } = root.device.adapterInfo;
  console.info(`Mark illusion WebGPU adapter: ${vendor} ${architecture}`);
  const context = root.configureContext({ canvas, alphaMode: "opaque" });
  const size = [canvas.width, canvas.height] as const;
  const litTexture = root
    .createTexture({ format: "rgba16float", size })
    .$usage("render", "sampled");
  const coverageTexture = root
    .createTexture({ format: "rgba16float", size })
    .$usage("render", "sampled");
  const litView = litTexture.createView();
  const coverageView = coverageTexture.createView();
  const sourceSampler = root.createSampler({ magFilter: "linear", minFilter: "linear" });

  const sceneState = root.createUniform(SceneState, {
    aspectRatio: canvas.width / canvas.height,
    back: d.vec3f(0, 0, 1),
    pixelSize: 2 / canvas.height,
    right: d.vec3f(1, 0, 0),
    tanHalfFieldOfView: 0,
    up: d.vec3f(0, 1, 0),
  });
  const warpState = root.createUniform(WarpState, {
    clampPixels: 0,
    flatness: 1,
    hexagonRadius: (HEXAGON_RADIUS_IN_CUBE_UNITS * canvas.height) / (2 * FRUSTUM_HALF_HEIGHT),
    lastSideWidth: 120,
    outputSize: d.vec2f(canvas.width, canvas.height),
    sideWidths: d.vec4f(120, 120, 0, 0),
    squash: d.vec2f(1, 1),
    warpEnabled: 0,
  });

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

  const traceSample = (screenPoint: d.v2f): d.Infer<typeof TraceSample> => {
    "use gpu";
    const state = sceneState.$;
    const lateral = std.add(std.mul(state.right, screenPoint.x), std.mul(state.up, screenPoint.y));
    const focalPoint = std.mul(lateral, FRUSTUM_HALF_HEIGHT);
    // The ray passes through its point on the cube center plane. At tan 0 it is orthographic.
    const rayDirection = std.normalize(
      std.sub(std.mul(lateral, state.tanHalfFieldOfView), state.back),
    );
    const origin = std.sub(focalPoint, std.mul(rayDirection, RAY_START_DISTANCE));
    let distance = d.f32(0);
    let lit = d.vec3f(BACKGROUND);
    let coverage = d.vec3f(0);
    for (let step = 0; step < MAXIMUM_RAY_STEPS; step += 1) {
      const point = std.add(origin, std.mul(rayDirection, distance));
      const sample = spongeDistance(point);
      if (sample < SURFACE_THRESHOLD) {
        const normal = surfaceNormal(point);
        lit = litColor(point, normal, rayDirection);
        coverage = faceAxis(normal);
        break;
      }
      distance += sample;
      if (distance > RAY_END_DISTANCE) {
        break;
      }
    }
    const missed = coverage.x + coverage.y + coverage.z < 0.5;
    if (missed && rayDirection.y < 0) {
      const floorDistance = (FLOOR_HEIGHT - origin.y) / rayDirection.y;
      lit = floorColor(std.add(origin, std.mul(rayDirection, floorDistance)));
    }
    return TraceSample({ coverage: d.vec4f(coverage, 1), lit: d.vec4f(lit, 1) });
  };

  const sceneFragment = tgpu.fragmentFn({
    in: { uv: d.vec2f },
    out: SceneOutput,
  })(({ uv }) => {
    "use gpu";
    const state = sceneState.$;
    const screenPoint = d.vec2f((uv.x - 0.5) * 2 * state.aspectRatio, (0.5 - uv.y) * 2);
    const pixelSize = state.pixelSize;
    let lit = d.vec4f(0);
    let coverage = d.vec4f(0);
    for (let sampleY = 0; sampleY < SAMPLE_GRID_SIZE; sampleY += 1) {
      for (let sampleX = 0; sampleX < SAMPLE_GRID_SIZE; sampleX += 1) {
        const offset = std.mul(
          std.sub(
            std.div(d.vec2f(d.f32(sampleX) + 0.5, d.f32(sampleY) + 0.5), SAMPLE_GRID_SIZE),
            d.vec2f(0.5),
          ),
          pixelSize,
        );
        const sample = traceSample(std.add(screenPoint, offset));
        lit = std.add(lit, sample.lit);
        coverage = std.add(coverage, sample.coverage);
      }
    }
    const sampleCount = SAMPLE_GRID_SIZE * SAMPLE_GRID_SIZE;
    return {
      coverage: std.div(coverage, sampleCount),
      lit: std.div(lit, sampleCount),
    };
  });

  /** Final color of one source point, with the face tones of one output side. */
  const sourceColor = (sourcePixel: d.v2f, sideIndex: number, sourceFace: number): d.v3f => {
    "use gpu";
    const state = warpState.$;
    const uv = d.vec2f(
      0.5 + sourcePixel.x / state.outputSize.x,
      0.5 - sourcePixel.y / state.outputSize.y,
    );
    const lit = std.textureSampleLevel(litView.$, sourceSampler.$, uv, 0).xyz;
    const coverage = std.textureSampleLevel(coverageView.$, sourceSampler.$, uv, 0).xyz;
    // The side tone replaces the tone of the source face direction. Tunnel walls of the other
    // directions keep their own tones.
    const tone = sideTone(sideIndex);
    let xTone = d.vec3f(X_TONE);
    let yTone = d.vec3f(Y_TONE);
    let zTone = d.vec3f(Z_TONE);
    if (sourceFace === 0) {
      yTone = d.vec3f(tone);
    } else if (sourceFace === 1) {
      xTone = d.vec3f(tone);
    } else {
      zTone = d.vec3f(tone);
    }
    const surface = coverage.x + coverage.y + coverage.z;
    const flat = std.add(
      std.add(std.mul(xTone, coverage.x), std.mul(yTone, coverage.y)),
      std.add(std.mul(zTone, coverage.z), std.mul(BACKGROUND, 1 - surface)),
    );
    return std.mix(lit, flat, state.flatness);
  };

  const sideStartDegrees = (sideIndex: number): number => {
    "use gpu";
    // Side 0 stays centered on the top.
    let start = 90 - sideWidth(0) / 2;
    for (let index = 0; index < 5; index += 1) {
      if (index >= sideIndex) {
        break;
      }
      start += sideWidth(index);
    }
    return start;
  };

  /**
  Color of an output pixel on one side. The side is the parallelogram R * (a * u + b * v) between
  its two rays; the same (a, b) on the rays of its source face gives the source pixel.

  A narrow parallelogram is a needle of length 2R, so a side narrower than 70 degrees also
  shrinks toward the center. A new side then grows out of the cut instead of shooting out of it.
  All three cube faces stay at 120 degrees or at least 70 degrees, so the identity is unchanged.
  */
  const sideColor = (pixel: d.v2f, sideIndex: number): d.v3f => {
    "use gpu";
    const state = warpState.$;
    const start = sideStartDegrees(sideIndex);
    const width = sideWidth(sideIndex);
    const u = angleRay(start);
    const v = angleRay(start + width);
    const growth = std.max(std.smoothstep(0, 70, width), 0.02);
    const determinant = cross2(u, v) * state.hexagonRadius * growth;
    let a = cross2(pixel, v) / determinant;
    let b = cross2(u, pixel) / determinant;
    if (state.clampPixels > 0) {
      // Keep away from the source face edges, whose pixels blend in the source neighbors.
      const margin = state.clampPixels / (state.hexagonRadius * growth);
      a = std.max(a, margin);
      b = std.max(b, margin);
    }
    const sourceFace = sideSourceFace(sideIndex);
    // Source face 0 spans the rays at 30 and 150 degrees; each next face turns 120 degrees.
    const sourceStart = 30 + 120 * d.f32(sourceFace);
    const sourcePixel = std.mul(
      std.add(std.mul(angleRay(sourceStart), a), std.mul(angleRay(sourceStart + 120), b)),
      state.hexagonRadius,
    );
    return sourceColor(sourcePixel, sideIndex, sourceFace);
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

  const warpFragment = tgpu.fragmentFn({
    in: { uv: d.vec2f },
    out: d.vec4f,
  })(({ uv }) => {
    "use gpu";
    const state = warpState.$;
    const pixel = d.vec2f((uv.x - 0.5) * state.outputSize.x, (0.5 - uv.y) * state.outputSize.y);
    if (state.warpEnabled === 0) {
      const sourcePixel = std.div(pixel, state.squash);
      return d.vec4f(sourceColor(sourcePixel, 0, 0), 1);
    }

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

    // Antialias the side edges: blend in the neighbor side within half a pixel of a shared ray.
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

  const scenePipeline = root.createRenderPipeline({
    fragment: sceneFragment,
    targets: { coverage: { format: "rgba16float" }, lit: { format: "rgba16float" } },
    vertex: common.fullScreenTriangle,
  });
  const warpPipeline = root.createRenderPipeline({
    fragment: warpFragment,
    vertex: common.fullScreenTriangle,
  });
  await Promise.all([scenePipeline.initAsync(), warpPipeline.initAsync()]);

  return {
    destroy: () => root.destroy(),
    render: ({ camera, flatness, squash, warp }) => {
      const { elevationRadians, tanHalfFieldOfView, yawRadians } = camera;
      const back = d.vec3f(
        Math.sin(yawRadians) * Math.cos(elevationRadians),
        Math.sin(elevationRadians),
        Math.cos(yawRadians) * Math.cos(elevationRadians),
      );
      const right = std.normalize(std.cross(d.vec3f(0, 1, 0), back));
      sceneState.patch({ back, right, tanHalfFieldOfView, up: std.cross(back, right) });
      const [top, left, lowerLeft, lowerRight, rightSide] = warp.sideWidthsDegrees;
      warpState.patch({
        clampPixels: warp.clampPixels,
        flatness,
        lastSideWidth: rightSide,
        sideWidths: d.vec4f(top, left, lowerLeft, lowerRight),
        squash: d.vec2f(...squash),
        warpEnabled: warp.enabled ? 1 : 0,
      });
      scenePipeline
        .withColorAttachment({ coverage: { view: coverageTexture }, lit: { view: litTexture } })
        .draw(3);
      warpPipeline.withColorAttachment({ view: context }).draw(3);
      return root.device.queue.onSubmittedWorkDone();
    },
  };
}
