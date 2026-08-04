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
} from "@samebase/logo-model/rotation";

export const LOGO_RASTER_RECURSIVE_FRUSTUM_PADDING = 1;
const LOGO_RASTER_BOUNDING_CUBE_DIAMETER = Math.sqrt(3);

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
  worldHalfSize?: number | undefined;
}): LogoRasterProjection {
  const cameraDirection = getWorldCameraVector(elevationDegrees);
  const up = getWorldScreenVerticalAxis(elevationDegrees);
  const right = normalizeVector(crossProduct(scaleVector(cameraDirection, -1), up));
  const rotationAxis = getLogoRotationAxis({
    elevationDegrees,
    mode: rotationAxisMode,
  });
  const renderedRotationDegrees = toRenderedRotationDegrees(rotationDegrees);
  const rotatePoint = (point: Vector3) =>
    rotateVectorAroundAxis(point, rotationAxis, renderedRotationDegrees);
  const normalizedWorldHalfSize = Math.max(0.0001, worldHalfSize ?? 0.5);
  // Match the Three renderer's camera-fit rule: fit the bounding sphere of the
  // cube, so yaw and elevation changes do not re-zoom the raster scene.
  const span = normalizedWorldHalfSize * 2 * LOGO_RASTER_BOUNDING_CUBE_DIAMETER;
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
