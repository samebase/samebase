/**
The giant sponge's axonometric projection, shared by the CPU (probe placement) and the shader.

The sponge fills the unit cube [0, 1]^3 with z up. It is drawn like style frame B: an orthographic
view from azimuth `azimuth` and elevation `elevation`, in frame B coordinates, where the near top
corner (1, 1, 1) sits at `SPONGE_FRONT_TOP` and one unit spans `SPONGE_SPAN` px along each axis
before foreshortening. Rays run along -view.
*/
import { deg, type Point } from "./inkMath";
import {
  layerCamera,
  project,
  readCamera,
  readMarkWalkPosition,
  readSpongeState,
  SCREEN_CENTER,
  type Camera,
} from "./inkTimeline";

export const SPONGE_SPAN = 1242;
export const SPONGE_FRONT_TOP: Point = [1560, 340];
export const SPONGE_DEPTH = 0.45;
export const MIST_DEPTH = 0.62;
export const HILL_DEPTH = 0.72;
/** Eye distance from the pivot plane, in sponge units. Smaller is stronger perspective. */
export const SPONGE_FOCAL = 4.2;
/** The pivot plane passes through the near vertical edge, so that edge keeps its place. */
const PIVOT: Vector3 = [1, 1, 0.45];

type Vector3 = readonly [number, number, number];

export function readSpongeBasis(azimuth: number, elevation: number) {
  const a = deg(azimuth);
  const e = deg(elevation);
  const right: Vector3 = [Math.sin(a), -Math.cos(a), 0];
  const down: Vector3 = [Math.cos(a) * Math.sin(e), Math.sin(a) * Math.sin(e), -Math.cos(e)];
  const view: Vector3 = [Math.cos(a) * Math.cos(e), Math.sin(a) * Math.cos(e), Math.sin(e)];
  // The projection of (1, 1, 1) is the sum of the three columns.
  const corner: Point = [right[0] + right[1] + right[2], down[0] + down[1] + down[2]];
  const origin: Point = [
    SPONGE_FRONT_TOP[0] - SPONGE_SPAN * corner[0],
    SPONGE_FRONT_TOP[1] - SPONGE_SPAN * corner[1],
  ];
  return { down, origin, right, view };
}

/**
The eye of the sponge camera and the depth of the pivot plane along `view`. The frame center of
the sponge layer is the principal point.
*/
export function readSpongeEye(
  layerCamera: Camera,
  azimuth: number,
  elevation: number,
  drift: number,
) {
  const { origin, right, down, view } = readSpongeBasis(azimuth, elevation);
  const a = (layerCamera.center[0] - origin[0]) / SPONGE_SPAN;
  const b = (layerCamera.center[1] - origin[1]) / SPONGE_SPAN;
  const pivotDepth = PIVOT[0] * view[0] + PIVOT[1] * view[1] + PIVOT[2] * view[2];
  const reach = pivotDepth + SPONGE_FOCAL;
  const eye: Vector3 = [
    (a + drift) * right[0] + b * down[0] + reach * view[0],
    (a + drift) * right[1] + b * down[1] + reach * view[1],
    (a + drift) * right[2] + b * down[2] + reach * view[2],
  ];
  return { eye, pivotDepth };
}

/** Frame B coordinates of the sponge layer for a screen point. */
export function unproject(camera: Camera, screen: Point): Point {
  const dx = screen[0] - SCREEN_CENTER[0];
  const dy = screen[1] - SCREEN_CENTER[1];
  const cos = Math.cos(-camera.angle);
  const sin = Math.sin(-camera.angle);
  return [
    camera.center[0] + (dx * cos - dy * sin) / camera.zoom,
    camera.center[1] + (dx * sin + dy * cos) / camera.zoom,
  ];
}

/** Where a layer point's ray first meets the sponge's bounding cube, or null when it misses. */
function entryPoint(
  layerPoint: Point,
  camera: Camera,
  azimuth: number,
  elevation: number,
  drift: number,
): Vector3 | null {
  const { down, origin, right, view } = readSpongeBasis(azimuth, elevation);
  const { eye, pivotDepth } = readSpongeEye(camera, azimuth, elevation, drift);
  const a = (layerPoint[0] - origin[0]) / SPONGE_SPAN;
  const b = (layerPoint[1] - origin[1]) / SPONGE_SPAN;
  const target: Vector3 = [
    a * right[0] + b * down[0] + pivotDepth * view[0],
    a * right[1] + b * down[1] + pivotDepth * view[1],
    a * right[2] + b * down[2] + pivotDepth * view[2],
  ];
  const direction: Vector3 = [target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]];
  let enter = 0;
  let exit = Infinity;
  for (let axis = 0; axis < 3; axis += 1) {
    const start = eye[axis] ?? 0;
    const step = direction[axis] ?? 0;
    const t0 = (0 - start) / step;
    const t1 = (1 - start) / step;
    enter = Math.max(enter, Math.min(t0, t1));
    exit = Math.min(exit, Math.max(t0, t1));
  }
  if (enter > exit) {
    return null;
  }
  return [
    eye[0] + enter * direction[0],
    eye[1] + enter * direction[1],
    eye[2] + enter * direction[2],
  ];
}

/** The point on the sponge surface just above the walking mark, or null while the mark is not in front of it. */
function probeAt(time: number, azimuth: number, elevation: number): Vector3 | null {
  const camera = readCamera(time);
  const spongeCamera = layerCamera(camera, SPONGE_DEPTH);
  const mark = readMarkWalkPosition(time);
  const screen = project(camera, [mark[0] + 120, mark[1] - 200]);
  const { drift } = readSpongeState(time);
  return entryPoint(unproject(spongeCamera, screen), spongeCamera, azimuth, elevation, drift);
}

/**
The probe path: from the first point where the walking mark stands in front of the giant to where
it stands now. The giant stays awake along the whole path.
*/
export function readProbePath(
  time: number,
  start: number,
  end: number,
  azimuth: number,
  elevation: number,
): { probe: Vector3; start: Vector3 } {
  const hits: Vector3[] = [];
  for (let sample = start; sample <= Math.min(time, end) + 1e-6; sample += 0.1) {
    const hit = probeAt(sample, azimuth, elevation);
    if (hit) {
      hits.push(hit);
    }
  }
  // Far outside the sponge, so nothing opens before the mark reaches the giant's foot.
  const first = hits[0] ?? [-5, -5, -5];
  return { probe: hits[hits.length - 1] ?? first, start: first };
}
