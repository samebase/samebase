import { common, d, std, tgpu } from "typegpu";

import type { WebGpuFrameRenderer } from "../../webgpu/useWebGpuFrame";

export type MengerScaleCamera = {
  fieldOfViewDegrees: number;
  hazeDistance: number;
  position: readonly [number, number, number];
  sunDirection: readonly [number, number, number];
  target: readonly [number, number, number];
};

const SAMPLE_GRID_SIZE = 3;
const MAXIMUM_RAY_STEPS = 420;
const MAXIMUM_DEPTH = 7;
const RAY_END_DISTANCE = 12;
/** Tunnels open from this pixel width to twice this width, as in the dive. */
const CLOSED_TUNNEL_WIDTH_IN_PIXELS = 2;
const SURFACE_THRESHOLD_IN_PIXELS = 0.2;

function hexColor(hex: number): d.v3f {
  return d.vec3f(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255);
}

// Landing hero face tones: x faces cyan, y faces white, z faces slate.
const X_TONE = hexColor(0x00b8db);
const Y_TONE = hexColor(0xf7f7f5);
const Z_TONE = hexColor(0x394447);
const HORIZON_COLOR = hexColor(0xf2ede4);
const ZENITH_COLOR = hexColor(0xc9dde3);
const SUN_COLOR = hexColor(0xfff3e0);

const SceneState = d.struct({
  aspectRatio: d.f32,
  cameraForward: d.vec3f,
  cameraPosition: d.vec3f,
  cameraRight: d.vec3f,
  cameraUp: d.vec3f,
  hazeDistance: d.f32,
  /** World size of one pixel at unit distance from the camera. */
  pixelAngle: d.f32,
  sunDirection: d.vec3f,
  tanHalfFieldOfView: d.f32,
});

const squareTunnelDistance = (point: d.v2f, halfWidth: number): number => {
  "use gpu";
  const delta = std.sub(std.abs(point), d.vec2f(halfWidth));
  return std.length(std.max(delta, d.vec2f(0))) + std.min(std.max(delta.x, delta.y), 0);
};

/**
Bounded depth-7 Menger sponge with half-size 1. Levels whose tunnels are narrower than
`closedTunnelWidth` stay closed, and the next wider level opens gradually, as in the dive.
*/
const spongeDistance = (point: d.v3f, closedTunnelWidth: number): number => {
  "use gpu";
  const outside = std.sub(std.abs(point), d.vec3f(1));
  const box =
    std.length(std.max(outside, d.vec3f(0))) + std.min(std.max(outside.x, outside.y, outside.z), 0);
  let emptyDepth = d.f32(-1_000_000);
  let period = d.f32(2);
  for (let level = 0; level < MAXIMUM_DEPTH; level += 1) {
    const tunnelWidth = period / 3;
    if (level > 0 && tunnelWidth <= closedTunnelWidth) {
      break;
    }
    const halfWidth = std.clamp(tunnelWidth / closedTunnelWidth - 1, 0, 1) / 6;
    const cellPoint = std.sub(std.fract(std.div(std.add(point, d.vec3f(1)), period)), d.vec3f(0.5));
    const tunnelDistance = std.min(
      squareTunnelDistance(cellPoint.xy, halfWidth),
      squareTunnelDistance(cellPoint.xz, halfWidth),
      squareTunnelDistance(cellPoint.yz, halfWidth),
    );
    emptyDepth = std.max(emptyDepth, -tunnelDistance * period);
    period = period / 3;
  }
  return std.max(box, emptyDepth);
};

const faceTone = (normal: d.v3f): d.v3f => {
  "use gpu";
  const axis = std.abs(normal);
  if (axis.x >= axis.y && axis.x >= axis.z) {
    return X_TONE;
  }
  if (axis.y >= axis.z) {
    return Y_TONE;
  }
  return Z_TONE;
};

export async function createMengerScaleRenderer(
  canvas: HTMLCanvasElement,
): Promise<WebGpuFrameRenderer<MengerScaleCamera>> {
  const root = await tgpu.init();
  const { architecture, vendor } = root.device.adapterInfo;
  console.info(`Menger scale WebGPU adapter: ${vendor} ${architecture}`);
  const context = root.configureContext({ canvas, alphaMode: "opaque" });
  const sceneState = root.createUniform(SceneState, {
    aspectRatio: canvas.width / canvas.height,
    cameraForward: d.vec3f(0, 0, -1),
    cameraPosition: d.vec3f(0, 0, 3),
    cameraRight: d.vec3f(1, 0, 0),
    cameraUp: d.vec3f(0, 1, 0),
    hazeDistance: 1,
    pixelAngle: 1 / canvas.height,
    sunDirection: d.vec3f(0, 1, 0),
    tanHalfFieldOfView: 0.5,
  });

  const closedWidthAt = (distanceAlongRay: number): number => {
    "use gpu";
    return distanceAlongRay * sceneState.$.pixelAngle * CLOSED_TUNNEL_WIDTH_IN_PIXELS;
  };

  const skyColor = (direction: d.v3f): d.v3f => {
    "use gpu";
    const height = std.clamp(direction.y, 0, 1);
    const sky = std.mix(HORIZON_COLOR, ZENITH_COLOR, std.pow(height, 0.6));
    const sunGlow = std.pow(std.max(std.dot(direction, sceneState.$.sunDirection), 0), 12);
    return std.add(sky, std.mul(SUN_COLOR, 0.12 * sunGlow));
  };

  const surfaceNormal = (point: d.v3f, closedWidth: number, epsilon: number): d.v3f => {
    "use gpu";
    const a = d.vec3f(1, -1, -1);
    const b = d.vec3f(-1, -1, 1);
    const c = d.vec3f(-1, 1, -1);
    const e = d.vec3f(1, 1, 1);
    return std.normalize(
      std.add(
        std.add(
          std.mul(a, spongeDistance(std.add(point, std.mul(a, epsilon)), closedWidth)),
          std.mul(b, spongeDistance(std.add(point, std.mul(b, epsilon)), closedWidth)),
        ),
        std.add(
          std.mul(c, spongeDistance(std.add(point, std.mul(c, epsilon)), closedWidth)),
          std.mul(e, spongeDistance(std.add(point, std.mul(e, epsilon)), closedWidth)),
        ),
      ),
    );
  };

  /** Soft sun shadow. Its steps and detail level scale with the hit distance. */
  const sunShadow = (point: d.v3f, distanceAlongRay: number, closedWidth: number): number => {
    "use gpu";
    const direction = sceneState.$.sunDirection;
    let light = d.f32(1);
    let distance = distanceAlongRay * 0.002;
    for (let step = 0; step < 72; step += 1) {
      const sample = spongeDistance(std.add(point, std.mul(direction, distance)), closedWidth);
      light = std.min(light, (8 * sample) / distance);
      distance += std.max(sample, distanceAlongRay * 0.001);
      if (light < 0.002 || distance > 3) {
        break;
      }
    }
    return std.clamp(light, 0, 1);
  };

  const ambientOcclusion = (
    point: d.v3f,
    normal: d.v3f,
    distanceAlongRay: number,
    closedWidth: number,
  ): number => {
    "use gpu";
    const stepLength = distanceAlongRay * 0.012;
    let occlusion = d.f32(0);
    let weight = d.f32(0.5);
    for (let sample = 1; sample <= 4; sample += 1) {
      const offset = stepLength * d.f32(sample);
      const distance = spongeDistance(std.add(point, std.mul(normal, offset)), closedWidth);
      occlusion += weight * std.clamp((offset - distance) / offset, 0, 1);
      weight *= 0.5;
    }
    return 1 - occlusion;
  };

  const traceRay = (screenPoint: d.v2f): d.v3f => {
    "use gpu";
    const state = sceneState.$;
    const direction = std.normalize(
      std.add(
        state.cameraForward,
        std.add(
          std.mul(state.cameraRight, screenPoint.x * state.tanHalfFieldOfView),
          std.mul(state.cameraUp, screenPoint.y * state.tanHalfFieldOfView),
        ),
      ),
    );
    const sky = skyColor(direction);
    let distanceAlongRay = d.f32(0);
    let color = d.vec3f(sky);
    for (let step = 0; step < MAXIMUM_RAY_STEPS; step += 1) {
      const point = std.add(state.cameraPosition, std.mul(direction, distanceAlongRay));
      const threshold = distanceAlongRay * state.pixelAngle * SURFACE_THRESHOLD_IN_PIXELS;
      const closedWidth = closedWidthAt(distanceAlongRay);
      const distance = spongeDistance(point, closedWidth);
      if (distance < threshold) {
        const normal = surfaceNormal(point, closedWidth, std.max(threshold * 1.5, 0.000_001));
        const lift = std.add(point, std.mul(normal, std.max(threshold * 2, 0.000_002)));
        const sunlight =
          std.max(std.dot(normal, state.sunDirection), 0) *
          sunShadow(lift, distanceAlongRay, closedWidth);
        const skylight =
          (0.55 + 0.25 * normal.y) * ambientOcclusion(point, normal, distanceAlongRay, closedWidth);
        // Sun, sky, and a small bounce term, so deep tunnels stay readable instead of black.
        const lighting = std.add(
          std.mul(SUN_COLOR, 0.95 * sunlight),
          d.vec3f(0.5 * skylight + 0.12),
        );
        const surface = std.mul(faceTone(normal), lighting);
        const haze = 1 - std.exp(-distanceAlongRay / state.hazeDistance);
        color = std.mix(surface, sky, haze);
        break;
      }
      distanceAlongRay += std.max(distance, threshold * 0.5);
      if (distanceAlongRay > RAY_END_DISTANCE) {
        break;
      }
    }
    return color;
  };

  const fragment = tgpu.fragmentFn({
    in: { uv: d.vec2f },
    out: d.vec4f,
  })(({ uv }) => {
    "use gpu";
    const state = sceneState.$;
    const screenPoint = d.vec2f((uv.x - 0.5) * 2 * state.aspectRatio, (0.5 - uv.y) * 2);
    const pixelSize = state.pixelAngle / state.tanHalfFieldOfView;
    let color = d.vec3f(0);
    for (let sampleY = 0; sampleY < SAMPLE_GRID_SIZE; sampleY += 1) {
      for (let sampleX = 0; sampleX < SAMPLE_GRID_SIZE; sampleX += 1) {
        const offset = std.mul(
          std.sub(
            std.div(d.vec2f(d.f32(sampleX) + 0.5, d.f32(sampleY) + 0.5), SAMPLE_GRID_SIZE),
            d.vec2f(0.5),
          ),
          pixelSize,
        );
        color = std.add(color, traceRay(std.add(screenPoint, offset)));
      }
    }
    return d.vec4f(std.div(color, SAMPLE_GRID_SIZE * SAMPLE_GRID_SIZE), 1);
  });
  const pipeline = root.createRenderPipeline({
    fragment,
    vertex: common.fullScreenTriangle,
  });
  await pipeline.initAsync();

  return {
    destroy: () => root.destroy(),
    render: ({ fieldOfViewDegrees, hazeDistance, position, sunDirection, target }) => {
      const cameraPosition = d.vec3f(...position);
      const cameraForward = std.normalize(std.sub(d.vec3f(...target), cameraPosition));
      const cameraRight = std.normalize(std.cross(cameraForward, d.vec3f(0, 1, 0)));
      const tanHalfFieldOfView = Math.tan((fieldOfViewDegrees * Math.PI) / 360);
      sceneState.patch({
        cameraForward,
        cameraPosition,
        cameraRight,
        cameraUp: std.cross(cameraRight, cameraForward),
        hazeDistance,
        pixelAngle: (2 * tanHalfFieldOfView) / canvas.height,
        sunDirection: std.normalize(d.vec3f(...sunDirection)),
        tanHalfFieldOfView,
      });
      pipeline.withColorAttachment({ view: context }).draw(3);
      return root.device.queue.onSubmittedWorkDone();
    },
  };
}
