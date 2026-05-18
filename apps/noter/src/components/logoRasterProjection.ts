import {
  crossProduct,
  dotProduct,
  getLogoRotationAxis,
  getWorldCameraVector,
  getWorldScreenVerticalAxis,
  normalizeVector,
  rotateVectorAroundAxis,
  scaleVector,
  toRenderedRotationDegrees,
  type LogoRotationAxisMode,
  type Vector3,
} from "@/components/logoRotationMath";

export const LOGO_RASTER_RECURSIVE_FRUSTUM_PADDING = 1;

export type LogoRasterPoint2D = {
  x: number;
  y: number;
};

export type LogoRasterProjectedPoint = LogoRasterPoint2D & {
  depth: number;
};

export type LogoRasterProjection = {
  cameraDirection: Vector3;
  centerPx: number;
  projectPoint: (point: Vector3) => LogoRasterProjectedPoint;
  projectVector: (point: Vector3) => LogoRasterPoint2D;
  rotatePoint: (point: Vector3) => Vector3;
  scalePx: number;
  sizePx: number;
};

const LOGO_RASTER_CUBE_VERTICES = [
  [-0.5, -0.5, -0.5],
  [0.5, -0.5, -0.5],
  [0.5, 0.5, -0.5],
  [-0.5, 0.5, -0.5],
  [-0.5, -0.5, 0.5],
  [0.5, -0.5, 0.5],
  [0.5, 0.5, 0.5],
  [-0.5, 0.5, 0.5],
] as const satisfies readonly Vector3[];

function subtractVectors(left: Vector3, right: Vector3): Vector3 {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

/**
 * Keep raster zoom stable while rotating by fitting the worst projected cube
 * span for the current elevation and rotation axis, instead of the current yaw.
 */
function getMaxRotatedCubeProjectionSpan({
  projectionAxis,
  rotationAxis,
}: {
  projectionAxis: Vector3;
  rotationAxis: Vector3;
}): number {
  const normalizedRotationAxis = normalizeVector(rotationAxis);
  let maxSpan = 0;

  for (const firstVertex of LOGO_RASTER_CUBE_VERTICES) {
    for (const secondVertex of LOGO_RASTER_CUBE_VERTICES) {
      const delta = subtractVectors(firstVertex, secondVertex);
      const axisDelta = scaleVector(
        normalizedRotationAxis,
        dotProduct(normalizedRotationAxis, delta),
      );
      const radialDelta = subtractVectors(delta, axisDelta);
      const sineDelta = crossProduct(normalizedRotationAxis, delta);
      const cosineCoefficient = dotProduct(radialDelta, projectionAxis);
      const sineCoefficient = dotProduct(sineDelta, projectionAxis);
      const axisCoefficient = dotProduct(axisDelta, projectionAxis);

      maxSpan = Math.max(
        maxSpan,
        axisCoefficient + Math.hypot(cosineCoefficient, sineCoefficient),
      );
    }
  }

  return maxSpan;
}

export function createLogoRasterProjection({
  elevationDegrees,
  frustumPadding,
  rotationAxisMode,
  rotationDegrees,
  sizePx,
  worldHalfSize,
}: {
  elevationDegrees: number;
  frustumPadding: number;
  rotationAxisMode: LogoRotationAxisMode;
  rotationDegrees: number;
  sizePx: number;
  worldHalfSize?: number;
}): LogoRasterProjection {
  const cameraDirection = getWorldCameraVector(elevationDegrees);
  const up = getWorldScreenVerticalAxis(elevationDegrees);
  const right = normalizeVector(
    crossProduct(scaleVector(cameraDirection, -1), up),
  );
  const rotationAxis = getLogoRotationAxis({
    elevationDegrees,
    mode: rotationAxisMode,
  });
  const renderedRotationDegrees = toRenderedRotationDegrees(rotationDegrees);
  const rotatePoint = (point: Vector3) =>
    rotateVectorAroundAxis(point, rotationAxis, renderedRotationDegrees);
  const normalizedWorldHalfSize = Math.max(0.0001, worldHalfSize ?? 0.5);
  const worldScale = normalizedWorldHalfSize * 2;
  const span =
    Math.max(
      getMaxRotatedCubeProjectionSpan({
        projectionAxis: right,
        rotationAxis,
      }),
      getMaxRotatedCubeProjectionSpan({
        projectionAxis: up,
        rotationAxis,
      }),
      0.001,
    ) * worldScale;
  const scalePx = sizePx / (span * frustumPadding);
  const centerPx = sizePx / 2;

  const projectVector = (point: Vector3) => {
    const rotatedPoint = rotatePoint(point);
    return {
      x: dotProduct(rotatedPoint, right) * scalePx,
      y: -dotProduct(rotatedPoint, up) * scalePx,
    };
  };

  return {
    cameraDirection,
    centerPx,
    projectPoint: (point) => {
      const rotatedPoint = rotatePoint(point);
      return {
        depth: dotProduct(rotatedPoint, cameraDirection),
        x: centerPx + dotProduct(rotatedPoint, right) * scalePx,
        y: centerPx - dotProduct(rotatedPoint, up) * scalePx,
      };
    },
    projectVector,
    rotatePoint,
    scalePx,
    sizePx,
  };
}
