import { common, d, std, tgpu } from "typegpu";

import {
  mengerDiveMaximumRayDistanceScale,
  type MengerDiveCamera,
  type MengerDiveVector,
} from "./mengerDiveCamera";
import { mengerDiveDistance } from "./mengerDiveDistance";

const MAXIMUM_RAY_STEPS = 192;
const MAXIMUM_ANTIALIASING_GRID_SIZE = 4;
/** Tunnels open from this pixel width to twice this width, so the finest visible holes stay crisp. */
const CLOSED_TUNNEL_WIDTH_IN_PIXELS = 2;
const SURFACE_THRESHOLD_IN_PIXELS = 0.12;
/** Ambient occlusion samples along the normal, spaced by this share of the hit distance. */
const OCCLUSION_STEP_SCALE = 0.012;
const OCCLUSION_SAMPLE_COUNT = 4;
/** Fog halves the remaining contrast every `ln(2) * FOG_DISTANCE_SCALE` camera distances. */
const FOG_DISTANCE_SCALE = 3;
const HALF_VERTICAL_FIELD_OF_VIEW_RADIANS = (35 * Math.PI) / 180;

// Samebase light theme face colors from the landing hero, in sRGB.
const X_FACE_COLOR = d.vec3f(0x39 / 255, 0x44 / 255, 0x47 / 255);
const Y_FACE_COLOR = d.vec3f(1, 1, 1);
const Z_FACE_COLOR = d.vec3f(0x00 / 255, 0xb8 / 255, 0xdb / 255);
const FOG_COLOR = d.vec3f(1, 1, 1);

const SceneState = d.struct({
  antialiasingGridSize: d.i32,
  aspectRatio: d.f32,
  cameraForward: d.vec3f,
  cameraPosition: d.vec3f,
  cameraRight: d.vec3f,
  cameraUp: d.vec3f,
  coarsestPeriod: d.f32,
  distanceToFixedPoint: d.f32,
  /** World size of one pixel at unit distance from the camera. */
  pixelAngle: d.f32,
  tanHalfFieldOfView: d.f32,
});

export type MengerDiveRenderer = {
  destroy: () => void;
  render: (camera: MengerDiveCamera) => Promise<void>;
};

function toGpuVector([x, y, z]: MengerDiveVector): d.v3f {
  return d.vec3f(x, y, z);
}

export async function createMengerDiveRenderer({
  antialiasingGridSize,
  canvas,
}: {
  antialiasingGridSize: number;
  canvas: HTMLCanvasElement;
}): Promise<MengerDiveRenderer> {
  const root = await tgpu.init();
  const { architecture, vendor } = root.device.adapterInfo;
  // Render logs show whether the Metal GPU or a software adapter drew the frames.
  console.info(`Menger dive WebGPU adapter: ${vendor} ${architecture}`);
  const context = root.configureContext({ canvas, alphaMode: "opaque" });
  const tanHalfFieldOfView = Math.tan(HALF_VERTICAL_FIELD_OF_VIEW_RADIANS);
  const sceneState = root.createUniform(SceneState, {
    antialiasingGridSize,
    aspectRatio: canvas.width / canvas.height,
    cameraForward: d.vec3f(0, 0, -1),
    cameraPosition: d.vec3f(0, 0, 1),
    cameraRight: d.vec3f(1, 0, 0),
    cameraUp: d.vec3f(0, 1, 0),
    coarsestPeriod: 1,
    distanceToFixedPoint: 1,
    pixelAngle: (2 * tanHalfFieldOfView) / canvas.height,
    tanHalfFieldOfView,
  });

  const sceneDistance = (point: d.v3f, distanceAlongRay: number): number => {
    "use gpu";
    return mengerDiveDistance(
      point,
      sceneState.$.coarsestPeriod,
      distanceAlongRay * sceneState.$.pixelAngle * CLOSED_TUNNEL_WIDTH_IN_PIXELS,
    );
  };
  const ambientOcclusion = (point: d.v3f, normal: d.v3f, distanceAlongRay: number): number => {
    "use gpu";
    // Every sample distance is relative to the hit distance, so the shading is scale invariant.
    const stepLength = distanceAlongRay * OCCLUSION_STEP_SCALE;
    let occlusion = d.f32(0);
    let weight = d.f32(0.5);
    for (let sample = 1; sample <= OCCLUSION_SAMPLE_COUNT; sample += 1) {
      const offset = stepLength * d.f32(sample);
      const distance = sceneDistance(std.add(point, std.mul(normal, offset)), distanceAlongRay);
      occlusion += weight * std.clamp((offset - distance) / offset, 0, 1);
      weight *= 0.5;
    }
    return 1 - occlusion;
  };
  const surfaceNormal = (point: d.v3f, distanceAlongRay: number, epsilon: number): d.v3f => {
    "use gpu";
    // Tetrahedral central differences: four distance samples for one gradient.
    const a = d.vec3f(1, -1, -1);
    const b = d.vec3f(-1, -1, 1);
    const c = d.vec3f(-1, 1, -1);
    const e = d.vec3f(1, 1, 1);
    return std.normalize(
      std.add(
        std.add(
          std.mul(a, sceneDistance(std.add(point, std.mul(a, epsilon)), distanceAlongRay)),
          std.mul(b, sceneDistance(std.add(point, std.mul(b, epsilon)), distanceAlongRay)),
        ),
        std.add(
          std.mul(c, sceneDistance(std.add(point, std.mul(c, epsilon)), distanceAlongRay)),
          std.mul(e, sceneDistance(std.add(point, std.mul(e, epsilon)), distanceAlongRay)),
        ),
      ),
    );
  };
  const faceColor = (normal: d.v3f): d.v3f => {
    "use gpu";
    const axis = std.abs(normal);
    if (axis.x >= axis.y && axis.x >= axis.z) {
      return X_FACE_COLOR;
    }
    if (axis.y >= axis.z) {
      return Y_FACE_COLOR;
    }
    return Z_FACE_COLOR;
  };
  const traceRay = (screenPoint: d.v2f): d.v3f => {
    "use gpu";
    const state = sceneState.$;
    const rayDirection = std.normalize(
      std.add(
        state.cameraForward,
        std.add(
          std.mul(state.cameraRight, screenPoint.x * state.tanHalfFieldOfView),
          std.mul(state.cameraUp, screenPoint.y * state.tanHalfFieldOfView),
        ),
      ),
    );
    const maximumDistance = state.distanceToFixedPoint * mengerDiveMaximumRayDistanceScale;
    let distanceAlongRay = d.f32(0);
    let color = FOG_COLOR;
    for (let step = 0; step < MAXIMUM_RAY_STEPS; step += 1) {
      const point = std.add(state.cameraPosition, std.mul(rayDirection, distanceAlongRay));
      const pixelFootprint = std.max(distanceAlongRay, 0) * state.pixelAngle;
      const threshold = pixelFootprint * SURFACE_THRESHOLD_IN_PIXELS;
      const distance = sceneDistance(point, distanceAlongRay);
      if (distance < threshold) {
        const normal = surfaceNormal(point, distanceAlongRay, std.max(threshold * 1.5, 1e-9));
        // Rays that need many steps pass close to edges and into cavities, so darken them.
        const stepShade = 1 - 0.4 * std.pow(d.f32(step) / MAXIMUM_RAY_STEPS, 0.6);
        const shade = stepShade * ambientOcclusion(point, normal, distanceAlongRay);
        const fog = std.exp(-distanceAlongRay / (state.distanceToFixedPoint * FOG_DISTANCE_SCALE));
        color = std.mix(FOG_COLOR, std.mul(faceColor(normal), shade), fog);
        break;
      }
      distanceAlongRay += std.max(distance, threshold * 0.5);
      if (distanceAlongRay > maximumDistance) {
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
    const gridSize = state.antialiasingGridSize;
    // Screen points span [-1, 1] vertically, so one pixel is 2 / height of that span.
    const pixelSize = state.pixelAngle / state.tanHalfFieldOfView;
    let color = d.vec3f(0);
    for (let sampleY = 0; sampleY < MAXIMUM_ANTIALIASING_GRID_SIZE; sampleY += 1) {
      if (sampleY >= gridSize) {
        break;
      }
      for (let sampleX = 0; sampleX < MAXIMUM_ANTIALIASING_GRID_SIZE; sampleX += 1) {
        if (sampleX >= gridSize) {
          break;
        }
        const offset = std.mul(
          std.sub(
            std.div(d.vec2f(d.f32(sampleX) + 0.5, d.f32(sampleY) + 0.5), d.f32(gridSize)),
            d.vec2f(0.5),
          ),
          pixelSize,
        );
        color = std.add(color, traceRay(std.add(screenPoint, offset)));
      }
    }
    return d.vec4f(std.div(color, d.f32(gridSize * gridSize)), 1);
  });
  const pipeline = root.createRenderPipeline({
    vertex: common.fullScreenTriangle,
    fragment,
  });
  await pipeline.initAsync();

  return {
    destroy: () => root.destroy(),
    render: (camera) => {
      sceneState.patch({
        cameraForward: toGpuVector(camera.forward),
        cameraPosition: toGpuVector(camera.position),
        cameraRight: toGpuVector(camera.right),
        cameraUp: toGpuVector(camera.up),
        coarsestPeriod: camera.coarsestPeriod,
        distanceToFixedPoint: camera.distanceToFixedPoint,
      });
      pipeline.withColorAttachment({ view: context }).draw(3);
      return root.device.queue.onSubmittedWorkDone();
    },
  };
}
