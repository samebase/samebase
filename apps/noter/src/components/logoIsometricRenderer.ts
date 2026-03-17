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

// Use a larger source cube so the shape stays readable before favicon downscaling.
const TILE_HALF_WIDTH = 16;
const TILE_HALF_HEIGHT = 8;
const VOXEL_SCREEN_HEIGHT = 16;
const FRAME_PADDING = 4;

type Point = {
  x: number;
  y: number;
};

type CubePosition = readonly [number, number, number];

type RenderFace = {
  color: string;
  coordinate: VoxelCoordinate;
  direction: IsometricFaceDirection;
  normal: VoxelCoordinate;
  polygon: readonly Point[];
  position: CubePosition;
};

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

const FACE_NORMALS: Record<IsometricFaceDirection, VoxelCoordinate> = {
  left: [0, 0, 1],
  right: [1, 0, 0],
  top: [0, 1, 0],
};

const FACE_DRAW_ORDER: Record<IsometricFaceDirection, number> = {
  left: 0,
  right: 1,
  top: 2,
};

function projectPoint(position: CubePosition): Point {
  return {
    x: (position[0] - position[2]) * TILE_HALF_WIDTH,
    y:
      (position[0] + position[2]) * TILE_HALF_HEIGHT -
      position[1] * VOXEL_SCREEN_HEIGHT,
  };
}

function getCubeFacePolygon(
  position: CubePosition,
  direction: IsometricFaceDirection,
): readonly Point[] {
  const [x, y, z] = position;
  switch (direction) {
    case "top":
      return [
        projectPoint([x, y + 1, z]),
        projectPoint([x + 1, y + 1, z]),
        projectPoint([x + 1, y + 1, z + 1]),
        projectPoint([x, y + 1, z + 1]),
      ];
    case "right":
      return [
        projectPoint([x + 1, y + 1, z]),
        projectPoint([x + 1, y, z]),
        projectPoint([x + 1, y, z + 1]),
        projectPoint([x + 1, y + 1, z + 1]),
      ];
    case "left":
      return [
        projectPoint([x, y + 1, z + 1]),
        projectPoint([x + 1, y + 1, z + 1]),
        projectPoint([x + 1, y, z + 1]),
        projectPoint([x, y, z + 1]),
      ];
  }
}

function buildSceneBounds() {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (let x = 0; x <= GRID_SIZE; x += 1) {
    for (let y = 0; y <= GRID_SIZE; y += 1) {
      for (let z = 0; z <= GRID_SIZE; z += 1) {
        const point = projectPoint([x, y, z]);
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
      }
    }
  }

  return {
    height: Math.ceil(maxY - minY) + FRAME_PADDING * 2 + 1,
    offsetX: FRAME_PADDING - minX,
    offsetY: FRAME_PADDING - minY,
    width: Math.ceil(maxX - minX) + FRAME_PADDING * 2 + 1,
  };
}

const sceneBounds = buildSceneBounds();

export const LOGO_ISOMETRIC_CANVAS_WIDTH = sceneBounds.width;
export const LOGO_ISOMETRIC_CANVAS_HEIGHT = sceneBounds.height;
export const LOGO_ISOMETRIC_ELEVATION_DEGREES = 35.26438968;
export const LOGO_ISOMETRIC_ROTATION_DEGREES = 0;

function translatePolygon(points: readonly Point[]): readonly Point[] {
  return points.map((point) => ({
    x: point.x + sceneBounds.offsetX,
    y: point.y + sceneBounds.offsetY,
  }));
}

function isVoxelFilled(
  filledVoxels: ReadonlySet<string>,
  x: number,
  y: number,
  z: number,
): boolean {
  if (!isWithinGrid(x, y, z)) {
    return false;
  }

  return filledVoxels.has(voxelKey(x, y, z));
}

function fillPolygonPixels(
  context: CanvasRenderingContext2D,
  polygon: readonly Point[],
  fillStyle: string,
) {
  const xs = polygon.map((point) => point.x);
  const ys = polygon.map((point) => point.y);
  const minX = Math.floor(Math.min(...xs));
  const maxX = Math.ceil(Math.max(...xs));
  const minY = Math.floor(Math.min(...ys));
  const maxY = Math.ceil(Math.max(...ys));

  context.fillStyle = fillStyle;
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (isPointInsidePolygon(x + 0.5, y + 0.5, polygon)) {
        context.fillRect(x, y, 1, 1);
      }
    }
  }
}

function parseVoxelCoordinate(key: string): VoxelCoordinate {
  const [xText, yText, zText] = key.split(",");
  return [
    Number.parseInt(xText, 10),
    Number.parseInt(yText, 10),
    Number.parseInt(zText, 10),
  ];
}

function getFaceSortPosition(
  position: CubePosition,
  direction: IsometricFaceDirection,
): CubePosition {
  switch (direction) {
    case "top":
      return [position[0] + 0.5, position[1] + 1, position[2] + 0.5];
    case "right":
      return [position[0] + 1, position[1] + 0.5, position[2] + 0.5];
    case "left":
      return [position[0] + 0.5, position[1] + 0.5, position[2] + 1];
  }
}

function compareFaceLayers(
  leftPosition: CubePosition,
  leftDirection: IsometricFaceDirection,
  rightPosition: CubePosition,
  rightDirection: IsometricFaceDirection,
): number {
  const leftSortPosition = getFaceSortPosition(leftPosition, leftDirection);
  const rightSortPosition = getFaceSortPosition(rightPosition, rightDirection);
  const leftDepth =
    leftSortPosition[0] + leftSortPosition[1] + leftSortPosition[2];
  const rightDepth =
    rightSortPosition[0] + rightSortPosition[1] + rightSortPosition[2];

  if (leftDepth !== rightDepth) {
    return leftDepth - rightDepth;
  }

  if (leftSortPosition[1] !== rightSortPosition[1]) {
    return leftSortPosition[1] - rightSortPosition[1];
  }

  if (leftSortPosition[0] !== rightSortPosition[0]) {
    return leftSortPosition[0] - rightSortPosition[0];
  }

  if (leftSortPosition[2] !== rightSortPosition[2]) {
    return leftSortPosition[2] - rightSortPosition[2];
  }

  return FACE_DRAW_ORDER[leftDirection] - FACE_DRAW_ORDER[rightDirection];
}

function createRenderFace({
  color,
  coordinate,
  direction,
  position,
}: {
  color: string;
  coordinate: VoxelCoordinate;
  direction: IsometricFaceDirection;
  position: CubePosition;
}): RenderFace {
  return {
    color,
    coordinate,
    direction,
    normal: FACE_NORMALS[direction],
    polygon: translatePolygon(getCubeFacePolygon(position, direction)),
    position,
  };
}

function buildStaticRenderFaces(
  filledVoxels: ReadonlySet<string>,
  faceColors: FaceColors,
): RenderFace[] {
  const renderFaces: RenderFace[] = [];
  const topColor = getTailwindColorHex(faceColors.top);
  const rightColor = getTailwindColorHex(faceColors.right);
  const leftColor = getTailwindColorHex(faceColors.left);

  for (const key of filledVoxels) {
    const coordinate = parseVoxelCoordinate(key);

    if (
      !isVoxelFilled(
        filledVoxels,
        coordinate[0],
        coordinate[1],
        coordinate[2] + 1,
      )
    ) {
      renderFaces.push(
        createRenderFace({
          color: leftColor,
          coordinate,
          direction: "left",
          position: coordinate,
        }),
      );
    }

    if (
      !isVoxelFilled(
        filledVoxels,
        coordinate[0] + 1,
        coordinate[1],
        coordinate[2],
      )
    ) {
      renderFaces.push(
        createRenderFace({
          color: rightColor,
          coordinate,
          direction: "right",
          position: coordinate,
        }),
      );
    }

    if (
      !isVoxelFilled(
        filledVoxels,
        coordinate[0],
        coordinate[1] + 1,
        coordinate[2],
      )
    ) {
      renderFaces.push(
        createRenderFace({
          color: topColor,
          coordinate,
          direction: "top",
          position: coordinate,
        }),
      );
    }
  }

  return renderFaces;
}

function buildMovingRenderFaces(
  faceColors: FaceColors,
  movingVoxels: readonly IsometricMovingVoxel[],
): RenderFace[] {
  const topColor = getTailwindColorHex(faceColors.top);
  const rightColor = getTailwindColorHex(faceColors.right);
  const leftColor = getTailwindColorHex(faceColors.left);

  return movingVoxels.flatMap((movingVoxel) => [
    createRenderFace({
      color: leftColor,
      coordinate: movingVoxel.coordinate,
      direction: "left",
      position: movingVoxel.position,
    }),
    createRenderFace({
      color: rightColor,
      coordinate: movingVoxel.coordinate,
      direction: "right",
      position: movingVoxel.position,
    }),
    createRenderFace({
      color: topColor,
      coordinate: movingVoxel.coordinate,
      direction: "top",
      position: movingVoxel.position,
    }),
  ]);
}

function compareRenderFaces(left: RenderFace, right: RenderFace): number {
  return compareFaceLayers(
    left.position,
    left.direction,
    right.position,
    right.direction,
  );
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

  const renderFaces = [
    ...buildStaticRenderFaces(filledVoxels, faceColors),
    ...buildMovingRenderFaces(faceColors, movingVoxels),
  ].sort(compareRenderFaces);

  for (const renderFace of renderFaces) {
    fillPolygonPixels(context, renderFace.polygon, renderFace.color);
  }

  return renderFaces.map(({ coordinate, direction, normal, polygon }) => ({
    coordinate,
    direction,
    normal,
    polygon,
  }));
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
