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
const VOXEL_SCREEN_HEIGHT = 4;
const FRAME_PADDING = 4;

type Point = {
  x: number;
  y: number;
};

type Rectangle = {
  row: number;
  column: number;
  height: number;
  width: number;
};

type PixelQuad = {
  color: string;
  points: readonly Point[];
  sortX: number;
  sortY: number;
};

type CubePosition = readonly [number, number, number];

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

function collectRectangles(mask: boolean[][]): Rectangle[] {
  const visited = mask.map((row) => row.map(() => false));
  const rectangles: Rectangle[] = [];

  for (let row = 0; row < mask.length; row += 1) {
    for (let column = 0; column < mask[row].length; column += 1) {
      if (!mask[row][column] || visited[row][column]) {
        continue;
      }

      let width = 1;
      while (
        column + width < mask[row].length &&
        mask[row][column + width] &&
        !visited[row][column + width]
      ) {
        width += 1;
      }

      let height = 1;
      let canGrow = true;
      while (row + height < mask.length && canGrow) {
        for (
          let nextColumn = column;
          nextColumn < column + width;
          nextColumn += 1
        ) {
          if (
            !mask[row + height][nextColumn] ||
            visited[row + height][nextColumn]
          ) {
            canGrow = false;
            break;
          }
        }

        if (canGrow) {
          height += 1;
        }
      }

      for (let nextRow = row; nextRow < row + height; nextRow += 1) {
        for (
          let nextColumn = column;
          nextColumn < column + width;
          nextColumn += 1
        ) {
          visited[nextRow][nextColumn] = true;
        }
      }

      rectangles.push({ row, column, height, width });
    }
  }

  return rectangles;
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

function fillQuad(context: CanvasRenderingContext2D, quad: PixelQuad) {
  fillPolygonPixels(context, quad.points, quad.color);
}

function averagePoint(points: readonly Point[]): Point {
  const total = points.reduce(
    (accumulator, point) => ({
      x: accumulator.x + point.x,
      y: accumulator.y + point.y,
    }),
    { x: 0, y: 0 },
  );

  return {
    x: total.x / points.length,
    y: total.y / points.length,
  };
}

function quadFromPolygon(color: string, points: readonly Point[]): PixelQuad {
  const center = averagePoint(points);
  return {
    color,
    points,
    sortX: center.x,
    sortY: center.y,
  };
}

function buildMergedSurfaceQuads(
  filledVoxels: ReadonlySet<string>,
  faceColors: FaceColors,
): PixelQuad[] {
  const quads: PixelQuad[] = [];
  const topColor = getTailwindColorHex(faceColors.top);
  const rightColor = getTailwindColorHex(faceColors.right);
  const leftColor = getTailwindColorHex(faceColors.left);

  for (let y = 0; y < GRID_SIZE; y += 1) {
    const topMask = Array.from({ length: GRID_SIZE }, (_, x) =>
      Array.from(
        { length: GRID_SIZE },
        (_, z) =>
          isVoxelFilled(filledVoxels, x, y, z) &&
          !isVoxelFilled(filledVoxels, x, y + 1, z),
      ),
    );

    for (const rectangle of collectRectangles(topMask)) {
      const points = translatePolygon([
        projectPoint([rectangle.row, y + 1, rectangle.column]),
        projectPoint([
          rectangle.row + rectangle.height,
          y + 1,
          rectangle.column,
        ]),
        projectPoint([
          rectangle.row + rectangle.height,
          y + 1,
          rectangle.column + rectangle.width,
        ]),
        projectPoint([
          rectangle.row,
          y + 1,
          rectangle.column + rectangle.width,
        ]),
      ]);
      quads.push(quadFromPolygon(topColor, points));
    }
  }

  for (let x = 0; x < GRID_SIZE; x += 1) {
    const rightMask = Array.from({ length: GRID_SIZE }, (_, y) =>
      Array.from(
        { length: GRID_SIZE },
        (_, z) =>
          isVoxelFilled(filledVoxels, x, y, z) &&
          !isVoxelFilled(filledVoxels, x + 1, y, z),
      ),
    );

    for (const rectangle of collectRectangles(rightMask)) {
      const points = translatePolygon([
        projectPoint([
          x + 1,
          rectangle.row + rectangle.height,
          rectangle.column,
        ]),
        projectPoint([x + 1, rectangle.row, rectangle.column]),
        projectPoint([
          x + 1,
          rectangle.row,
          rectangle.column + rectangle.width,
        ]),
        projectPoint([
          x + 1,
          rectangle.row + rectangle.height,
          rectangle.column + rectangle.width,
        ]),
      ]);
      quads.push(quadFromPolygon(rightColor, points));
    }
  }

  for (let z = 0; z < GRID_SIZE; z += 1) {
    const leftMask = Array.from({ length: GRID_SIZE }, (_, y) =>
      Array.from(
        { length: GRID_SIZE },
        (_, x) =>
          isVoxelFilled(filledVoxels, x, y, z) &&
          !isVoxelFilled(filledVoxels, x, y, z + 1),
      ),
    );

    for (const rectangle of collectRectangles(leftMask)) {
      const points = translatePolygon([
        projectPoint([
          rectangle.column,
          rectangle.row + rectangle.height,
          z + 1,
        ]),
        projectPoint([
          rectangle.column + rectangle.width,
          rectangle.row + rectangle.height,
          z + 1,
        ]),
        projectPoint([
          rectangle.column + rectangle.width,
          rectangle.row,
          z + 1,
        ]),
        projectPoint([rectangle.column, rectangle.row, z + 1]),
      ]);
      quads.push(quadFromPolygon(leftColor, points));
    }
  }

  return quads;
}

function buildMovingVoxelQuads(
  faceColors: FaceColors,
  movingVoxels: readonly IsometricMovingVoxel[],
): PixelQuad[] {
  const topColor = getTailwindColorHex(faceColors.top);
  const rightColor = getTailwindColorHex(faceColors.right);
  const leftColor = getTailwindColorHex(faceColors.left);

  return movingVoxels.flatMap((movingVoxel) => {
    const topPoints = translatePolygon(
      getCubeFacePolygon(movingVoxel.position, "top"),
    );
    const rightPoints = translatePolygon(
      getCubeFacePolygon(movingVoxel.position, "right"),
    );
    const leftPoints = translatePolygon(
      getCubeFacePolygon(movingVoxel.position, "left"),
    );

    return [
      quadFromPolygon(leftColor, leftPoints),
      quadFromPolygon(rightColor, rightPoints),
      quadFromPolygon(topColor, topPoints),
    ];
  });
}

function compareQuads(left: PixelQuad, right: PixelQuad): number {
  if (left.sortY !== right.sortY) {
    return left.sortY - right.sortY;
  }

  return left.sortX - right.sortX;
}

function buildVisibleFaces(
  filledVoxels: ReadonlySet<string>,
  movingVoxels: readonly IsometricMovingVoxel[],
): IsometricVisibleFace[] {
  const visibleFaces: IsometricVisibleFace[] = [];

  for (const key of filledVoxels) {
    const [xText, yText, zText] = key.split(",");
    const coordinate: VoxelCoordinate = [
      Number.parseInt(xText, 10),
      Number.parseInt(yText, 10),
      Number.parseInt(zText, 10),
    ];

    if (
      !isVoxelFilled(
        filledVoxels,
        coordinate[0],
        coordinate[1],
        coordinate[2] + 1,
      )
    ) {
      visibleFaces.push({
        coordinate,
        direction: "left",
        normal: FACE_NORMALS.left,
        polygon: translatePolygon(getCubeFacePolygon(coordinate, "left")),
      });
    }

    if (
      !isVoxelFilled(
        filledVoxels,
        coordinate[0] + 1,
        coordinate[1],
        coordinate[2],
      )
    ) {
      visibleFaces.push({
        coordinate,
        direction: "right",
        normal: FACE_NORMALS.right,
        polygon: translatePolygon(getCubeFacePolygon(coordinate, "right")),
      });
    }

    if (
      !isVoxelFilled(
        filledVoxels,
        coordinate[0],
        coordinate[1] + 1,
        coordinate[2],
      )
    ) {
      visibleFaces.push({
        coordinate,
        direction: "top",
        normal: FACE_NORMALS.top,
        polygon: translatePolygon(getCubeFacePolygon(coordinate, "top")),
      });
    }
  }

  for (const movingVoxel of movingVoxels) {
    visibleFaces.push({
      coordinate: movingVoxel.coordinate,
      direction: "left",
      normal: FACE_NORMALS.left,
      polygon: translatePolygon(
        getCubeFacePolygon(movingVoxel.position, "left"),
      ),
    });
    visibleFaces.push({
      coordinate: movingVoxel.coordinate,
      direction: "right",
      normal: FACE_NORMALS.right,
      polygon: translatePolygon(
        getCubeFacePolygon(movingVoxel.position, "right"),
      ),
    });
    visibleFaces.push({
      coordinate: movingVoxel.coordinate,
      direction: "top",
      normal: FACE_NORMALS.top,
      polygon: translatePolygon(
        getCubeFacePolygon(movingVoxel.position, "top"),
      ),
    });
  }

  return visibleFaces;
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

  const quads = [
    ...buildMergedSurfaceQuads(filledVoxels, faceColors),
    ...buildMovingVoxelQuads(faceColors, movingVoxels),
  ].sort(compareQuads);

  for (const quad of quads) {
    fillQuad(context, quad);
  }

  return buildVisibleFaces(filledVoxels, movingVoxels);
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
