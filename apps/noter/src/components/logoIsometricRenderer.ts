import {
  GRID_SIZE,
  isWithinGrid,
  type VoxelCoordinate,
  voxelKey,
} from "@/components/logoVoxelState";
import {
  getTailwindColorHex,
  type FaceColors,
} from "@/components/logoTailwindColors";

const TILE_HALF_WIDTH = 4;
const TILE_HALF_HEIGHT = 2;
const CUBE_HEIGHT = 4;
const FRAME_PADDING = 6;
const OUTLINE_COLOR = "rgba(0, 0, 0, 0.34)";

type Point = {
  x: number;
  y: number;
};

type CubePosition = readonly [number, number, number];
type CubePolygons = Record<IsometricFaceDirection, readonly Point[]>;

type IsometricFaceDirection = "left" | "right" | "top";

export type IsometricVisibleFace = {
  coordinate: VoxelCoordinate;
  direction: IsometricFaceDirection;
  normal: VoxelCoordinate;
  polygon: readonly Point[];
};

export type IsometricMovingVoxel = {
  coordinate: VoxelCoordinate;
  position: CubePosition;
};

type RenderableCube = {
  coordinate: VoxelCoordinate;
  position: CubePosition;
  visibleFaces: readonly IsometricFaceDirection[];
};

function projectVoxelTop([x, y, z]: CubePosition): Point {
  return {
    x: (x - z) * TILE_HALF_WIDTH,
    y: (x + z) * TILE_HALF_HEIGHT - y * CUBE_HEIGHT,
  };
}

function getCubePolygons(position: CubePosition): CubePolygons {
  const top = projectVoxelTop(position);
  const topRight = { x: top.x + TILE_HALF_WIDTH, y: top.y + TILE_HALF_HEIGHT };
  const bottom = { x: top.x, y: top.y + TILE_HALF_HEIGHT * 2 };
  const topLeft = { x: top.x - TILE_HALF_WIDTH, y: top.y + TILE_HALF_HEIGHT };
  const bottomRight = { x: topRight.x, y: topRight.y + CUBE_HEIGHT };
  const bottomBottom = { x: bottom.x, y: bottom.y + CUBE_HEIGHT };
  const bottomLeft = { x: topLeft.x, y: topLeft.y + CUBE_HEIGHT };

  return {
    left: [topLeft, bottom, bottomBottom, bottomLeft],
    right: [topRight, bottom, bottomBottom, bottomRight],
    top: [top, topRight, bottom, topLeft],
  };
}

function getStaticCubeFaces(
  filledVoxels: ReadonlySet<string>,
  coordinate: VoxelCoordinate,
): readonly IsometricFaceDirection[] {
  const [x, y, z] = coordinate;
  const visibleFaces: IsometricFaceDirection[] = [];

  if (!filledVoxels.has(voxelKey(x, y, z + 1))) {
    visibleFaces.push("left");
  }

  if (!filledVoxels.has(voxelKey(x + 1, y, z))) {
    visibleFaces.push("right");
  }

  if (!filledVoxels.has(voxelKey(x, y + 1, z))) {
    visibleFaces.push("top");
  }

  return visibleFaces;
}

function getSceneBounds() {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (let x = 0; x < GRID_SIZE; x += 1) {
    for (let y = 0; y < GRID_SIZE; y += 1) {
      for (let z = 0; z < GRID_SIZE; z += 1) {
        const polygons = getCubePolygons([x, y, z]);
        const polygonList = [polygons.left, polygons.right, polygons.top];
        for (const polygon of polygonList) {
          for (const point of polygon) {
            minX = Math.min(minX, point.x);
            minY = Math.min(minY, point.y);
            maxX = Math.max(maxX, point.x);
            maxY = Math.max(maxY, point.y);
          }
        }
      }
    }
  }

  const offsetX = FRAME_PADDING - minX;
  const offsetY = FRAME_PADDING - minY;
  const width = Math.ceil(maxX - minX) + FRAME_PADDING * 2;
  const height = Math.ceil(maxY - minY) + FRAME_PADDING * 2;

  return { height, offsetX, offsetY, width };
}

const sceneBounds = getSceneBounds();

export const LOGO_ISOMETRIC_CANVAS_WIDTH = sceneBounds.width;
export const LOGO_ISOMETRIC_CANVAS_HEIGHT = sceneBounds.height;
export const LOGO_ISOMETRIC_ELEVATION_DEGREES = 35.26438968;
export const LOGO_ISOMETRIC_ROTATION_DEGREES = 0;

const FACE_NORMALS: Record<IsometricFaceDirection, VoxelCoordinate> = {
  left: [0, 0, 1],
  right: [1, 0, 0],
  top: [0, 1, 0],
};

function strokeAndFillPolygon(
  context: CanvasRenderingContext2D,
  polygon: readonly Point[],
  fillStyle: string,
) {
  if (polygon.length === 0) {
    return;
  }

  context.beginPath();
  const [firstPoint, ...otherPoints] = polygon;
  context.moveTo(firstPoint.x, firstPoint.y);
  for (const point of otherPoints) {
    context.lineTo(point.x, point.y);
  }
  context.closePath();
  context.fillStyle = fillStyle;
  context.fill();
  context.strokeStyle = OUTLINE_COLOR;
  context.lineWidth = 1;
  context.lineJoin = "miter";
  context.stroke();
}

function drawCube(
  context: CanvasRenderingContext2D,
  cube: RenderableCube,
  faceColors: FaceColors,
  visibleFaces: IsometricVisibleFace[],
) {
  const polygons = getCubePolygons(cube.position);
  const translatedPolygons = {
    left: polygons.left.map((point) => ({
      x: point.x + sceneBounds.offsetX,
      y: point.y + sceneBounds.offsetY,
    })),
    right: polygons.right.map((point) => ({
      x: point.x + sceneBounds.offsetX,
      y: point.y + sceneBounds.offsetY,
    })),
    top: polygons.top.map((point) => ({
      x: point.x + sceneBounds.offsetX,
      y: point.y + sceneBounds.offsetY,
    })),
  } as const;

  const faceColorHex = {
    left: getTailwindColorHex(faceColors.left),
    right: getTailwindColorHex(faceColors.right),
    top: getTailwindColorHex(faceColors.top),
  } as const;

  for (const direction of cube.visibleFaces) {
    const polygon = translatedPolygons[direction];
    strokeAndFillPolygon(context, polygon, faceColorHex[direction]);

    visibleFaces.push({
      coordinate: cube.coordinate,
      direction,
      normal: FACE_NORMALS[direction],
      polygon,
    });
  }
}

function compareCubes(left: RenderableCube, right: RenderableCube): number {
  const leftProjection = projectVoxelTop(left.position);
  const rightProjection = projectVoxelTop(right.position);

  if (leftProjection.y !== rightProjection.y) {
    return leftProjection.y - rightProjection.y;
  }

  if (leftProjection.x !== rightProjection.x) {
    return leftProjection.x - rightProjection.x;
  }

  return left.position[1] - right.position[1];
}

function buildRenderableCubes(
  filledVoxels: ReadonlySet<string>,
  movingVoxels: readonly IsometricMovingVoxel[],
): RenderableCube[] {
  const cubes: RenderableCube[] = [];

  for (const key of filledVoxels) {
    const [xText, yText, zText] = key.split(",");
    const coordinate: VoxelCoordinate = [
      Number.parseInt(xText, 10),
      Number.parseInt(yText, 10),
      Number.parseInt(zText, 10),
    ];
    cubes.push({
      coordinate,
      position: coordinate,
      visibleFaces: getStaticCubeFaces(filledVoxels, coordinate),
    });
  }

  for (const movingVoxel of movingVoxels) {
    cubes.push({
      coordinate: movingVoxel.coordinate,
      position: movingVoxel.position,
      visibleFaces: ["left", "right", "top"],
    });
  }

  cubes.sort(compareCubes);
  return cubes;
}

export function drawLogoIsometricFrame({
  backgroundColor,
  context,
  faceColors,
  filledVoxels,
  movingVoxels = [],
}: {
  backgroundColor: string;
  context: CanvasRenderingContext2D;
  faceColors: FaceColors;
  filledVoxels: ReadonlySet<string>;
  movingVoxels?: readonly IsometricMovingVoxel[];
}): readonly IsometricVisibleFace[] {
  context.clearRect(
    0,
    0,
    LOGO_ISOMETRIC_CANVAS_WIDTH,
    LOGO_ISOMETRIC_CANVAS_HEIGHT,
  );
  context.fillStyle = backgroundColor;
  context.fillRect(
    0,
    0,
    LOGO_ISOMETRIC_CANVAS_WIDTH,
    LOGO_ISOMETRIC_CANVAS_HEIGHT,
  );

  const visibleFaces: IsometricVisibleFace[] = [];
  const cubes = buildRenderableCubes(filledVoxels, movingVoxels);
  for (const cube of cubes) {
    if (cube.visibleFaces.length === 0) {
      continue;
    }

    drawCube(context, cube, faceColors, visibleFaces);
  }

  return visibleFaces;
}

export function getIsometricAddCoordinate(
  face: IsometricVisibleFace,
  filledVoxels: ReadonlySet<string>,
): VoxelCoordinate | null {
  const [x, y, z] = face.coordinate;
  const [dx, dy, dz] = face.normal;
  const nextCoordinate: VoxelCoordinate = [x + dx, y + dy, z + dz];

  if (!isWithinGrid(nextCoordinate[0], nextCoordinate[1], nextCoordinate[2])) {
    return null;
  }

  if (filledVoxels.has(voxelKey(...nextCoordinate))) {
    return null;
  }

  return nextCoordinate;
}

export function isPointInsidePolygon(
  pointX: number,
  pointY: number,
  polygon: readonly Point[],
): boolean {
  let isInside = false;

  for (
    let currentIndex = 0, previousIndex = polygon.length - 1;
    currentIndex < polygon.length;
    previousIndex = currentIndex, currentIndex += 1
  ) {
    const currentPoint = polygon[currentIndex];
    const previousPoint = polygon[previousIndex];
    const crossesHorizontalRange =
      currentPoint.y > pointY !== previousPoint.y > pointY;

    if (!crossesHorizontalRange) {
      continue;
    }

    const slopeIntersectionX =
      ((previousPoint.x - currentPoint.x) * (pointY - currentPoint.y)) /
        (previousPoint.y - currentPoint.y) +
      currentPoint.x;

    if (pointX < slopeIntersectionX) {
      isInside = !isInside;
    }
  }

  return isInside;
}
