import { LOGO_THREE_SVG_VIEWBOX_SIZE } from "./logoStaticSvgContract";
import { toRenderedRotationDegrees } from "./logoRotationMath";
import {
  getTailwindColorHex,
  type FaceColorKey,
  type FaceColors,
} from "./logoTailwindColors";
import {
  buildLogoSurfaceQuads,
  type LogoSurfaceQuad,
  type LogoSurfaceVertex,
} from "./logoSurfaceModel";
import {
  DEFAULT_ELEVATION_DEGREES,
  DEFAULT_ROTATION_DEGREES,
} from "./logoVoxelState";

export type LogoProjectedPoint = {
  x: number;
  y: number;
};

export type LogoWorldPoint = {
  x: number;
  y: number;
  z: number;
};

export type LogoProjector = {
  cameraDirection: LogoWorldPoint;
  projectRotatedPoint: (point: LogoWorldPoint) => LogoProjectedPoint;
  rotateWorldPoint: (point: LogoWorldPoint) => LogoWorldPoint;
};

type Vector3 = {
  x: number;
  y: number;
  z: number;
};

export type LogoProjectedQuad = {
  color: string;
  colorKey: FaceColorKey;
  depth: number;
  key: string;
  materialOrder: number;
  points: readonly LogoProjectedPoint[];
  strokeWidth: number;
};

const CAMERA_FRUSTUM_PADDING = 1.12;
// Browsers can still show hairline cracks between adjacent projected polygons
// even when the math is exact. A thin same-color stroke closes those seams
// while still scaling down with the delivered SVG on smaller surfaces.
const FACE_STROKE_WIDTH = 0.14;
const ORBIT_RIGHT_AXIS = normalizeVector({
  x: 1,
  y: 0,
  z: -1,
});

function normalizeVector(vector: Vector3): Vector3 {
  const length = Math.hypot(vector.x, vector.y, vector.z);
  if (length === 0) {
    throw new Error("Cannot normalize a zero-length vector.");
  }

  return {
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length,
  };
}

function dotVectors(left: Vector3, right: Vector3): number {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

function crossVectors(left: Vector3, right: Vector3): Vector3 {
  return {
    x: left.y * right.z - left.z * right.y,
    y: left.z * right.x - left.x * right.z,
    z: left.x * right.y - left.y * right.x,
  };
}

function rotateVectorY(vector: Vector3, radians: number): Vector3 {
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    x: vector.x * cosine + vector.z * sine,
    y: vector.y,
    z: -vector.x * sine + vector.z * cosine,
  };
}

function escapeSvgAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function getCameraBasis(elevationDegrees: number) {
  const elevationRadians = (elevationDegrees * Math.PI) / 180;
  const horizontalComponent = Math.cos(elevationRadians);
  const verticalComponent = Math.sin(elevationRadians);
  const diagonalComponent = horizontalComponent / Math.sqrt(2);
  const cameraDirection = normalizeVector({
    x: diagonalComponent,
    y: verticalComponent,
    z: diagonalComponent,
  });
  const forward = {
    x: -cameraDirection.x,
    y: -cameraDirection.y,
    z: -cameraDirection.z,
  };
  const up = normalizeVector(crossVectors(ORBIT_RIGHT_AXIS, forward));

  return {
    cameraDirection,
    right: ORBIT_RIGHT_AXIS,
    up,
  };
}

function projectPoint(
  point: Vector3,
  right: Vector3,
  up: Vector3,
  frustumHalfHeight: number,
  viewBoxSize: number,
): LogoProjectedPoint {
  return {
    x:
      ((dotVectors(point, right) + frustumHalfHeight) /
        (frustumHalfHeight * 2)) *
      viewBoxSize,
    y:
      ((frustumHalfHeight - dotVectors(point, up)) / (frustumHalfHeight * 2)) *
      viewBoxSize,
  };
}

function serializePolygon(points: readonly LogoProjectedPoint[]): string {
  return points
    .map((point) => `${point.x.toFixed(6)},${point.y.toFixed(6)}`)
    .join(" ");
}

function toLogoWorldPoint([x, y, z]: LogoSurfaceVertex): LogoWorldPoint {
  return { x, y, z };
}

function getSurfaceQuadColor(
  faceColors: FaceColors,
  surfaceQuad: LogoSurfaceQuad,
): string {
  return getTailwindColorHex(faceColors[surfaceQuad.colorKey]);
}

export function createLogoProjector({
  elevationDegrees = DEFAULT_ELEVATION_DEGREES,
  rotationDegrees = DEFAULT_ROTATION_DEGREES,
  scenePoints,
  viewBoxSize = LOGO_THREE_SVG_VIEWBOX_SIZE,
}: {
  elevationDegrees?: number;
  rotationDegrees?: number;
  scenePoints: readonly LogoWorldPoint[];
  viewBoxSize?: number;
}): LogoProjector {
  const { cameraDirection, right, up } = getCameraBasis(elevationDegrees);
  const rotationRadians =
    (toRenderedRotationDegrees(rotationDegrees) * Math.PI) / 180;
  const rotateWorldPoint = (point: LogoWorldPoint) =>
    rotateVectorY(point, rotationRadians);
  const radius = scenePoints.reduce((maxRadius, point) => {
    const rotatedPoint = rotateWorldPoint(point);
    return Math.max(
      maxRadius,
      Math.hypot(rotatedPoint.x, rotatedPoint.y, rotatedPoint.z),
    );
  }, 0);
  const frustumHalfHeight =
    radius > 0 ? radius * CAMERA_FRUSTUM_PADDING : CAMERA_FRUSTUM_PADDING;

  return {
    cameraDirection,
    projectRotatedPoint: (point) =>
      projectPoint(point, right, up, frustumHalfHeight, viewBoxSize),
    rotateWorldPoint,
  };
}

function getProjectedScene({
  elevationDegrees = DEFAULT_ELEVATION_DEGREES,
  faceColors,
  filledVoxels,
  rotationDegrees = DEFAULT_ROTATION_DEGREES,
  viewBoxSize = LOGO_THREE_SVG_VIEWBOX_SIZE,
}: {
  elevationDegrees?: number;
  faceColors: FaceColors;
  filledVoxels: ReadonlySet<string>;
  rotationDegrees?: number;
  viewBoxSize?: number;
}) {
  const surfaceQuads = buildLogoSurfaceQuads(filledVoxels);
  const projector = createLogoProjector({
    elevationDegrees,
    rotationDegrees,
    scenePoints: surfaceQuads.flatMap((quad) =>
      quad.vertices.map(toLogoWorldPoint),
    ),
    viewBoxSize,
  });
  const rotatedQuads = surfaceQuads
    .map((quad) => {
      const normal = projector.rotateWorldPoint(toLogoWorldPoint(quad.normal));
      if (dotVectors(normal, projector.cameraDirection) <= 0) {
        return null;
      }

      return {
        color: getSurfaceQuadColor(faceColors, quad),
        colorKey: quad.colorKey,
        key: quad.key,
        materialOrder: quad.materialIndex,
        vertices: quad.vertices.map((vertex) =>
          projector.rotateWorldPoint(toLogoWorldPoint(vertex)),
        ),
      };
    })
    .filter((quad) => quad !== null);

  return {
    projector,
    rotatedQuads,
  };
}

export function createLogoThreeProjectedQuads({
  elevationDegrees = DEFAULT_ELEVATION_DEGREES,
  faceColors,
  filledVoxels,
  rotationDegrees = DEFAULT_ROTATION_DEGREES,
  viewBoxSize = LOGO_THREE_SVG_VIEWBOX_SIZE,
}: {
  elevationDegrees?: number;
  faceColors: FaceColors;
  filledVoxels: ReadonlySet<string>;
  rotationDegrees?: number;
  viewBoxSize?: number;
}): LogoProjectedQuad[] {
  const { projector, rotatedQuads } = getProjectedScene({
    elevationDegrees,
    faceColors,
    filledVoxels,
    rotationDegrees,
    viewBoxSize,
  });

  if (rotatedQuads.length === 0) {
    return [];
  }

  return rotatedQuads
    .map((quad) => {
      const points = quad.vertices.map((vertex) =>
        projector.projectRotatedPoint(vertex),
      );
      const center = quad.vertices.reduce(
        (sum, vertex) => ({
          x: sum.x + vertex.x / quad.vertices.length,
          y: sum.y + vertex.y / quad.vertices.length,
          z: sum.z + vertex.z / quad.vertices.length,
        }),
        { x: 0, y: 0, z: 0 },
      );

      return {
        color: quad.color,
        colorKey: quad.colorKey,
        depth: dotVectors(center, projector.cameraDirection),
        key: quad.key,
        materialOrder: quad.materialOrder,
        points,
        strokeWidth: FACE_STROKE_WIDTH,
      };
    })
    .sort((left, rightQuad) => {
      if (left.depth !== rightQuad.depth) {
        return left.depth - rightQuad.depth;
      }

      return left.materialOrder - rightQuad.materialOrder;
    });
}

export function createLogoThreeSvgMarkup({
  backgroundColor,
  elevationDegrees = DEFAULT_ELEVATION_DEGREES,
  faceColors,
  filledVoxels,
  rotationDegrees = DEFAULT_ROTATION_DEGREES,
  viewBoxSize = LOGO_THREE_SVG_VIEWBOX_SIZE,
}: {
  backgroundColor: string;
  elevationDegrees?: number;
  faceColors: FaceColors;
  filledVoxels: ReadonlySet<string>;
  rotationDegrees?: number;
  viewBoxSize?: number;
}): string {
  const projectedQuads = createLogoThreeProjectedQuads({
    elevationDegrees,
    faceColors,
    filledVoxels,
    rotationDegrees,
    viewBoxSize,
  });

  if (projectedQuads.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBoxSize} ${viewBoxSize}" width="${viewBoxSize}" height="${viewBoxSize}"><rect x="0" y="0" width="${viewBoxSize}" height="${viewBoxSize}" fill="${escapeSvgAttribute(backgroundColor)}"/></svg>`;
  }

  const backgroundRect = `<rect x="0" y="0" width="${viewBoxSize}" height="${viewBoxSize}" fill="${escapeSvgAttribute(backgroundColor)}"/>`;
  const polygons = projectedQuads
    .map((quad) => {
      const fill = escapeSvgAttribute(quad.color);
      return `<polygon points="${escapeSvgAttribute(serializePolygon(quad.points))}" fill="${fill}" stroke="${fill}" stroke-width="${FACE_STROKE_WIDTH}" stroke-linejoin="round" paint-order="stroke fill"/>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBoxSize} ${viewBoxSize}" width="${viewBoxSize}" height="${viewBoxSize}">${backgroundRect}${polygons}</svg>`;
}
