import { LOGO_THREE_SVG_VIEWBOX_SIZE } from "./logoStaticSvgContract";
import { toRenderedRotationDegrees } from "./logoRotationMath";
import { getTailwindColorHex, type FaceColorKey, type FaceColors } from "./logoTailwindColors";
import {
  buildLogoSurfaceQuads,
  type LogoSurfaceQuad,
  type LogoSurfaceVertex,
} from "./logoSurfaceModel";
import {
  DEFAULT_LOGO_FRACTAL_DEPTH,
  DEFAULT_ELEVATION_DEGREES,
  DEFAULT_ROTATION_DEGREES,
  GRID_SIZE,
  getLogoFractalGridSize,
  isWithinVoxelGrid,
  normalizeLogoFractalDepth,
  parseVoxelKey,
  type VoxelCoordinate,
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

const RECURSIVE_GROUP_PREFIX = "logo-recursive-level";

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
    x: ((dotVectors(point, right) + frustumHalfHeight) / (frustumHalfHeight * 2)) * viewBoxSize,
    y: ((frustumHalfHeight - dotVectors(point, up)) / (frustumHalfHeight * 2)) * viewBoxSize,
  };
}

function serializePolygon(points: readonly LogoProjectedPoint[]): string {
  return points.map((point) => `${point.x.toFixed(6)},${point.y.toFixed(6)}`).join(" ");
}

function toLogoWorldPoint([x, y, z]: LogoSurfaceVertex): LogoWorldPoint {
  return { x, y, z };
}

function toVector3(point: LogoWorldPoint): Vector3 {
  return {
    x: point.x,
    y: point.y,
    z: point.z,
  };
}

function getSurfaceQuadColor(faceColors: FaceColors, surfaceQuad: LogoSurfaceQuad): string {
  return getTailwindColorHex(faceColors[surfaceQuad.colorKey]);
}

function getSceneCubeCorners(gridSize: number): LogoWorldPoint[] {
  const halfGrid = gridSize / 2;
  return [
    { x: -halfGrid, y: -halfGrid, z: -halfGrid },
    { x: -halfGrid, y: -halfGrid, z: halfGrid },
    { x: -halfGrid, y: halfGrid, z: -halfGrid },
    { x: -halfGrid, y: halfGrid, z: halfGrid },
    { x: halfGrid, y: -halfGrid, z: -halfGrid },
    { x: halfGrid, y: -halfGrid, z: halfGrid },
    { x: halfGrid, y: halfGrid, z: -halfGrid },
    { x: halfGrid, y: halfGrid, z: halfGrid },
  ];
}

function readBaseCoordinates(filledVoxels: ReadonlySet<string>): VoxelCoordinate[] {
  const coordinates: VoxelCoordinate[] = [];

  for (const key of filledVoxels) {
    const coordinate = parseVoxelKey(key);
    if (!coordinate || !isWithinVoxelGrid(GRID_SIZE, coordinate[0], coordinate[1], coordinate[2])) {
      continue;
    }

    coordinates.push(coordinate);
  }

  return coordinates.sort(
    (left, right) => left[0] - right[0] || left[1] - right[1] || left[2] - right[2],
  );
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
  const rotationRadians = (toRenderedRotationDegrees(rotationDegrees) * Math.PI) / 180;
  const rotateWorldPoint = (point: LogoWorldPoint) => rotateVectorY(point, rotationRadians);
  const radius = scenePoints.reduce((maxRadius, point) => {
    const rotatedPoint = rotateWorldPoint(point);
    return Math.max(maxRadius, Math.hypot(rotatedPoint.x, rotatedPoint.y, rotatedPoint.z));
  }, 0);
  const frustumHalfHeight = radius > 0 ? radius * CAMERA_FRUSTUM_PADDING : CAMERA_FRUSTUM_PADDING;

  return {
    cameraDirection,
    projectRotatedPoint: (point) => projectPoint(point, right, up, frustumHalfHeight, viewBoxSize),
    rotateWorldPoint,
  };
}

function getProjectedScene({
  elevationDegrees = DEFAULT_ELEVATION_DEGREES,
  faceColors,
  filledVoxels,
  gridSize = GRID_SIZE,
  rotationDegrees = DEFAULT_ROTATION_DEGREES,
  viewBoxSize = LOGO_THREE_SVG_VIEWBOX_SIZE,
}: {
  elevationDegrees?: number;
  faceColors: FaceColors;
  filledVoxels: ReadonlySet<string>;
  gridSize?: number;
  rotationDegrees?: number;
  viewBoxSize?: number;
}) {
  const surfaceQuads = buildLogoSurfaceQuads(filledVoxels, gridSize);
  const projector = createLogoProjector({
    elevationDegrees,
    rotationDegrees,
    scenePoints: surfaceQuads.flatMap((quad) => quad.vertices.map(toLogoWorldPoint)),
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

function createLogoProjectedQuadsWithProjector({
  faceColors,
  filledVoxels,
  gridSize = GRID_SIZE,
  projector,
}: {
  faceColors: FaceColors;
  filledVoxels: ReadonlySet<string>;
  gridSize?: number;
  projector: LogoProjector;
}): LogoProjectedQuad[] {
  const surfaceQuads = buildLogoSurfaceQuads(filledVoxels, gridSize);
  const projectedQuads: LogoProjectedQuad[] = [];

  for (const quad of surfaceQuads) {
    const normal = projector.rotateWorldPoint(toLogoWorldPoint(quad.normal));
    if (dotVectors(toVector3(normal), toVector3(projector.cameraDirection)) <= 0) {
      continue;
    }

    const vertices = quad.vertices.map((vertex) =>
      projector.rotateWorldPoint(toLogoWorldPoint(vertex)),
    );
    const points = vertices.map((vertex) => projector.projectRotatedPoint(vertex));
    const center = vertices.reduce(
      (sum, vertex) => ({
        x: sum.x + vertex.x / vertices.length,
        y: sum.y + vertex.y / vertices.length,
        z: sum.z + vertex.z / vertices.length,
      }),
      { x: 0, y: 0, z: 0 },
    );

    projectedQuads.push({
      color: getSurfaceQuadColor(faceColors, quad),
      colorKey: quad.colorKey,
      depth: dotVectors(toVector3(center), toVector3(projector.cameraDirection)),
      key: quad.key,
      materialOrder: quad.materialIndex,
      points,
      strokeWidth: FACE_STROKE_WIDTH,
    });
  }

  return projectedQuads.sort((left, rightQuad) => {
    if (left.depth !== rightQuad.depth) {
      return left.depth - rightQuad.depth;
    }

    return left.materialOrder - rightQuad.materialOrder;
  });
}

export function createLogoThreeProjectedQuads({
  elevationDegrees = DEFAULT_ELEVATION_DEGREES,
  faceColors,
  filledVoxels,
  gridSize = GRID_SIZE,
  rotationDegrees = DEFAULT_ROTATION_DEGREES,
  viewBoxSize = LOGO_THREE_SVG_VIEWBOX_SIZE,
}: {
  elevationDegrees?: number;
  faceColors: FaceColors;
  filledVoxels: ReadonlySet<string>;
  gridSize?: number;
  rotationDegrees?: number;
  viewBoxSize?: number;
}): LogoProjectedQuad[] {
  const { projector, rotatedQuads } = getProjectedScene({
    elevationDegrees,
    faceColors,
    filledVoxels,
    gridSize,
    rotationDegrees,
    viewBoxSize,
  });

  if (rotatedQuads.length === 0) {
    return [];
  }

  return rotatedQuads
    .map((quad) => {
      const points = quad.vertices.map((vertex) => projector.projectRotatedPoint(vertex));
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
  depth = DEFAULT_LOGO_FRACTAL_DEPTH,
  elevationDegrees = DEFAULT_ELEVATION_DEGREES,
  faceColors,
  filledVoxels,
  gridSize = GRID_SIZE,
  rotationDegrees = DEFAULT_ROTATION_DEGREES,
  viewBoxSize = LOGO_THREE_SVG_VIEWBOX_SIZE,
}: {
  backgroundColor: string;
  depth?: number;
  elevationDegrees?: number;
  faceColors: FaceColors;
  filledVoxels: ReadonlySet<string>;
  gridSize?: number;
  rotationDegrees?: number;
  viewBoxSize?: number;
}): string {
  const normalizedDepth = normalizeLogoFractalDepth(depth);
  if (normalizedDepth > DEFAULT_LOGO_FRACTAL_DEPTH && gridSize === GRID_SIZE) {
    return createLogoThreeRecursiveSvgMarkup({
      backgroundColor,
      depth: normalizedDepth,
      elevationDegrees,
      faceColors,
      filledVoxels,
      rotationDegrees,
      viewBoxSize,
    });
  }

  const projectedQuads = createLogoThreeProjectedQuads({
    elevationDegrees,
    faceColors,
    filledVoxels,
    gridSize,
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

function getRecursiveChildCenter({
  childGridSize,
  coordinate,
}: {
  childGridSize: number;
  coordinate: VoxelCoordinate;
}): LogoWorldPoint {
  const parentGridSize = childGridSize * GRID_SIZE;
  return {
    x: (coordinate[0] + 0.5) * childGridSize - parentGridSize / 2,
    y: (coordinate[1] + 0.5) * childGridSize - parentGridSize / 2,
    z: (coordinate[2] + 0.5) * childGridSize - parentGridSize / 2,
  };
}

function getProjectedTranslation({
  offset,
  origin,
  projector,
}: {
  offset: LogoWorldPoint;
  origin: LogoProjectedPoint;
  projector: LogoProjector;
}): LogoProjectedPoint {
  const projectedOffset = projector.projectRotatedPoint(offset);
  return {
    x: projectedOffset.x - origin.x,
    y: projectedOffset.y - origin.y,
  };
}

function compareRecursiveCoordinates({
  childGridSize,
  left,
  projector,
  right,
}: {
  childGridSize: number;
  left: VoxelCoordinate;
  projector: LogoProjector;
  right: VoxelCoordinate;
}): number {
  const leftCenter = getRecursiveChildCenter({
    childGridSize,
    coordinate: left,
  });
  const rightCenter = getRecursiveChildCenter({
    childGridSize,
    coordinate: right,
  });
  const leftDepth = dotVectors(
    toVector3(projector.rotateWorldPoint(leftCenter)),
    toVector3(projector.cameraDirection),
  );
  const rightDepth = dotVectors(
    toVector3(projector.rotateWorldPoint(rightCenter)),
    toVector3(projector.cameraDirection),
  );

  if (leftDepth !== rightDepth) {
    return leftDepth - rightDepth;
  }

  return left[0] - right[0] || left[1] - right[1] || left[2] - right[2];
}

function createRecursiveUseGroup({
  baseCoordinates,
  childGridSize,
  level,
  origin,
  projector,
}: {
  baseCoordinates: readonly VoxelCoordinate[];
  childGridSize: number;
  level: number;
  origin: LogoProjectedPoint;
  projector: LogoProjector;
}): string {
  const previousLevelId = `${RECURSIVE_GROUP_PREFIX}-${level - 1}`;
  const childUses = [...baseCoordinates]
    .sort((left, right) =>
      compareRecursiveCoordinates({
        childGridSize,
        left,
        projector,
        right,
      }),
    )
    .map((coordinate) => {
      const translation = getProjectedTranslation({
        offset: getRecursiveChildCenter({ childGridSize, coordinate }),
        origin,
        projector,
      });
      return `<use href="#${previousLevelId}" transform="translate(${translation.x.toFixed(6)} ${translation.y.toFixed(6)})"/>`;
    })
    .join("");

  return `<g id="${RECURSIVE_GROUP_PREFIX}-${level}">${childUses}</g>`;
}

function createLogoThreeRecursiveSvgMarkup({
  backgroundColor,
  depth,
  elevationDegrees,
  faceColors,
  filledVoxels,
  rotationDegrees,
  viewBoxSize,
}: {
  backgroundColor: string;
  depth: number;
  elevationDegrees: number;
  faceColors: FaceColors;
  filledVoxels: ReadonlySet<string>;
  rotationDegrees: number;
  viewBoxSize: number;
}): string {
  const fullGridSize = getLogoFractalGridSize(depth);
  const projector = createLogoProjector({
    elevationDegrees,
    rotationDegrees,
    scenePoints: getSceneCubeCorners(fullGridSize),
    viewBoxSize,
  });
  const origin = projector.projectRotatedPoint({ x: 0, y: 0, z: 0 });
  const baseCoordinates = readBaseCoordinates(filledVoxels);
  const baseQuads = createLogoProjectedQuadsWithProjector({
    faceColors,
    filledVoxels,
    gridSize: GRID_SIZE,
    projector,
  });
  const basePolygons = baseQuads
    .map((quad) => {
      const fill = escapeSvgAttribute(quad.color);
      return `<polygon points="${escapeSvgAttribute(serializePolygon(quad.points))}" fill="${fill}" stroke="${fill}" stroke-width="${FACE_STROKE_WIDTH}" stroke-linejoin="round" paint-order="stroke fill"/>`;
    })
    .join("");

  const recursiveGroups = [`<g id="${RECURSIVE_GROUP_PREFIX}-1">${basePolygons}</g>`];
  for (let level = 2; level <= depth; level += 1) {
    recursiveGroups.push(
      createRecursiveUseGroup({
        baseCoordinates,
        childGridSize: getLogoFractalGridSize(level - 1),
        level,
        origin,
        projector,
      }),
    );
  }

  const backgroundRect = `<rect x="0" y="0" width="${viewBoxSize}" height="${viewBoxSize}" fill="${escapeSvgAttribute(backgroundColor)}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBoxSize} ${viewBoxSize}" width="${viewBoxSize}" height="${viewBoxSize}">${backgroundRect}<defs>${recursiveGroups.join("")}</defs><use href="#${RECURSIVE_GROUP_PREFIX}-${depth}"/></svg>`;
}
