import {
  FAVICON_ROTATION_DEGREES,
  normalizeRotationDegrees,
} from "./logoVoxelState";

const ORBIT_RIGHT_AXIS = normalizeVector([1, 0, -1]);
const WORLD_UP_AXIS = [0, 1, 0] as const;

export type Vector3 = readonly [number, number, number];

export type LogoRotationAxisMode = "cube-y" | "screen-vertical";

function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180;
}

export function dotProduct(left: Vector3, right: Vector3): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function crossProduct(left: Vector3, right: Vector3): Vector3 {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function normalizeVector([x, y, z]: Vector3): Vector3 {
  const length = Math.hypot(x, y, z);
  if (length === 0) {
    return WORLD_UP_AXIS;
  }

  return [x / length, y / length, z / length];
}

function scaleVector([x, y, z]: Vector3, scalar: number): Vector3 {
  return [x * scalar, y * scalar, z * scalar];
}

function rotateVectorAroundAxis(
  vector: Vector3,
  axis: Vector3,
  rotationDegrees: number,
): Vector3 {
  const radians = degreesToRadians(rotationDegrees);
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const normalizedAxis = normalizeVector(axis);
  const cross = crossProduct(normalizedAxis, vector);
  const dot = dotProduct(normalizedAxis, vector);

  return [
    vector[0] * cosine +
      cross[0] * sine +
      normalizedAxis[0] * dot * (1 - cosine),
    vector[1] * cosine +
      cross[1] * sine +
      normalizedAxis[1] * dot * (1 - cosine),
    vector[2] * cosine +
      cross[2] * sine +
      normalizedAxis[2] * dot * (1 - cosine),
  ];
}

export function getWorldCameraVector(elevationDegrees: number): Vector3 {
  const elevationRadians = degreesToRadians(elevationDegrees);
  const horizontalComponent = Math.cos(elevationRadians);

  return normalizeVector([
    horizontalComponent / Math.sqrt(2),
    Math.sin(elevationRadians),
    horizontalComponent / Math.sqrt(2),
  ]);
}

export function getWorldScreenVerticalAxis(elevationDegrees: number): Vector3 {
  const forward = scaleVector(getWorldCameraVector(elevationDegrees), -1);
  return normalizeVector(crossProduct(ORBIT_RIGHT_AXIS, forward));
}

export function getLogoRotationAxis(args: {
  elevationDegrees: number;
  mode: LogoRotationAxisMode;
}): Vector3 {
  if (args.mode === "screen-vertical") {
    return getWorldScreenVerticalAxis(args.elevationDegrees);
  }

  return WORLD_UP_AXIS;
}

// User-facing 45deg matches the historic/favicon diagonal view.
export function toRenderedRotationDegrees(rotationDegrees: number): number {
  return normalizeRotationDegrees(rotationDegrees - FAVICON_ROTATION_DEGREES);
}

export function getCameraLocalVector(args: {
  elevationDegrees: number;
  rotationAxisMode: LogoRotationAxisMode;
  rotationDegrees: number;
}): Vector3 {
  return rotateVectorAroundAxis(
    getWorldCameraVector(args.elevationDegrees),
    getLogoRotationAxis({
      elevationDegrees: args.elevationDegrees,
      mode: args.rotationAxisMode,
    }),
    -toRenderedRotationDegrees(args.rotationDegrees),
  );
}
