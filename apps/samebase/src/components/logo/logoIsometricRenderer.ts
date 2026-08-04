import {
  DEFAULT_LOGO_FRACTAL_DEPTH,
  DEFAULT_LOGO_GRID_SIZE,
  FAVICON_ROTATION_DEGREES,
  GRID_SIZE,
  getLogoFractalGridSize,
  isWithinVoxelGrid,
  type LogoGridSize,
  normalizeLogoFractalDepth,
  parseVoxelKey,
  type VoxelCoordinate,
  voxelKey,
} from "@samebase/logo-model/voxel";
import { getTailwindColorHex, type FaceColors } from "@/components/logo/logoTailwindColors";
import { includes } from "@samebase/dependent";
import {
  parseLogoIsoCubePixelKey,
  type LogoIsoCubePixelSprite,
} from "@/components/logo/logoIsoCubePixelSprite";

const FRAME_PADDING = 4;
export const LOGO_ISOMETRIC_CUBE_SIDE_PIXELS = {
  defaultValue: 16,
  min: 2,
  max: 40,
  step: 2,
};

type Point = {
  x: number;
  y: number;
};

type RowSpan = {
  endX: number;
  startX: number;
  y: number;
};

export type IsometricHitRowSpan = RowSpan;

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
  hitRows: readonly IsometricHitRowSpan[];
  normal: VoxelCoordinate;
  polygon: readonly Point[];
  spriteOffsetX: number;
  spriteOffsetY: number;
};

export type IsometricMovingVoxel = {
  coordinate: VoxelCoordinate;
  position: CubePosition;
};

type IsometricRecursiveDrawItem = {
  key: string;
  position: CubePosition;
};

export type LogoIsometricFrameMetrics = {
  canvasHeight: number;
  canvasWidth: number;
  cubeSidePixels: number;
  offsetX: number;
  offsetY: number;
  tileHalfHeight: number;
  tileHalfWidth: number;
  voxelScreenHeight: number;
};

type LogoIsometricEdgeMode = "none" | "shaded";

type LogoIsometricStyle = {
  capWidth: 2 | 3 | 4;
  description: string;
  edgeMode: LogoIsometricEdgeMode;
  id: LogoIsometricStyleId;
  label: string;
};

export type LogoIsometricStyleId = "flat" | "shaded-edge" | "cap-3" | "cap-4";
export type LogoIsometricSvgSafeStyleId = Extract<LogoIsometricStyleId, "flat">;

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

export const DEFAULT_LOGO_ISOMETRIC_STYLE_ID: LogoIsometricStyleId = "flat";

export const LOGO_ISOMETRIC_STYLES = [
  {
    capWidth: 2,
    description: "Standard 2:1 isometric fill with no outlines.",
    edgeMode: "none",
    id: "flat",
    label: "Flat 2:1",
  },
  {
    capWidth: 2,
    description: "Standard 2:1 fill with shaded edge pixels on silhouettes and ridges.",
    edgeMode: "shaded",
    id: "shaded-edge",
    label: "Shaded Edge",
  },
  {
    capWidth: 3,
    description: "Keeps 2:1 slopes but widens the top and bottom cap rows to 3 pixels.",
    edgeMode: "none",
    id: "cap-3",
    label: "Cap 3",
  },
  {
    capWidth: 4,
    description: "Keeps 2:1 slopes but widens the top and bottom cap rows to 4 pixels.",
    edgeMode: "none",
    id: "cap-4",
    label: "Cap 4",
  },
] as const satisfies readonly LogoIsometricStyle[];

const LOGO_ISOMETRIC_STYLE_IDS = LOGO_ISOMETRIC_STYLES.map((style) => style.id);

export function isLogoIsometricStyleId(value: string | null) {
  return includes(LOGO_ISOMETRIC_STYLE_IDS, value);
}

export function getLogoIsometricStyle(styleId: LogoIsometricStyleId): LogoIsometricStyle {
  return LOGO_ISOMETRIC_STYLES.find((style) => style.id === styleId) ?? LOGO_ISOMETRIC_STYLES[0];
}

export function normalizeLogoIsometricCubeSidePixels(value: number): number {
  if (!Number.isFinite(value)) {
    return LOGO_ISOMETRIC_CUBE_SIDE_PIXELS.defaultValue;
  }

  const roundedToStep =
    Math.round(value / LOGO_ISOMETRIC_CUBE_SIDE_PIXELS.step) * LOGO_ISOMETRIC_CUBE_SIDE_PIXELS.step;

  return Math.min(
    Math.max(roundedToStep, LOGO_ISOMETRIC_CUBE_SIDE_PIXELS.min),
    LOGO_ISOMETRIC_CUBE_SIDE_PIXELS.max,
  );
}

function normalizeLogoIsometricFrameCubeSidePixels(value: number): number {
  if (!Number.isFinite(value)) {
    return LOGO_ISOMETRIC_CUBE_SIDE_PIXELS.defaultValue;
  }

  return Math.min(Math.max(Math.round(value), 1), LOGO_ISOMETRIC_CUBE_SIDE_PIXELS.max);
}

function projectPoint(position: CubePosition, frameMetrics: LogoIsometricFrameMetrics): Point {
  return {
    x: (position[0] - position[2]) * frameMetrics.tileHalfWidth,
    y:
      (position[0] + position[2]) * frameMetrics.tileHalfHeight -
      position[1] * frameMetrics.voxelScreenHeight,
  };
}

function getGridBoundaryPoints(gridSize: number): readonly CubePosition[] {
  return [
    [0, 0, 0],
    [0, 0, gridSize],
    [0, gridSize, 0],
    [0, gridSize, gridSize],
    [gridSize, 0, 0],
    [gridSize, 0, gridSize],
    [gridSize, gridSize, 0],
    [gridSize, gridSize, gridSize],
  ];
}

function getCubeFacePolygon(
  position: CubePosition,
  direction: IsometricFaceDirection,
  frameMetrics: LogoIsometricFrameMetrics,
): readonly Point[] {
  const [x, y, z] = position;
  switch (direction) {
    case "top":
      return [
        projectPoint([x, y + 1, z], frameMetrics),
        projectPoint([x + 1, y + 1, z], frameMetrics),
        projectPoint([x + 1, y + 1, z + 1], frameMetrics),
        projectPoint([x, y + 1, z + 1], frameMetrics),
      ];
    case "right":
      return [
        projectPoint([x + 1, y + 1, z], frameMetrics),
        projectPoint([x + 1, y, z], frameMetrics),
        projectPoint([x + 1, y, z + 1], frameMetrics),
        projectPoint([x + 1, y + 1, z + 1], frameMetrics),
      ];
    case "left":
      return [
        projectPoint([x, y + 1, z + 1], frameMetrics),
        projectPoint([x + 1, y + 1, z + 1], frameMetrics),
        projectPoint([x + 1, y, z + 1], frameMetrics),
        projectPoint([x, y, z + 1], frameMetrics),
      ];
  }
}

function createLogoIsometricFrameMetrics(
  cubeSidePixels: number,
  gridSize: number,
): LogoIsometricFrameMetrics {
  const normalizedCubeSidePixels = normalizeLogoIsometricFrameCubeSidePixels(cubeSidePixels);
  const tileHalfWidth = normalizedCubeSidePixels;
  const tileHalfHeight = normalizedCubeSidePixels / 2;
  const voxelScreenHeight = normalizedCubeSidePixels;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  const provisionalMetrics = {
    canvasHeight: 0,
    canvasWidth: 0,
    cubeSidePixels: normalizedCubeSidePixels,
    offsetX: 0,
    offsetY: 0,
    tileHalfHeight,
    tileHalfWidth,
    voxelScreenHeight,
  } satisfies LogoIsometricFrameMetrics;

  for (const boundaryPoint of getGridBoundaryPoints(gridSize)) {
    const point = projectPoint(boundaryPoint, provisionalMetrics);
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  return {
    canvasHeight: Math.ceil(maxY - minY) + FRAME_PADDING * 2 + 1,
    canvasWidth: Math.ceil(maxX - minX) + FRAME_PADDING * 2 + 1,
    cubeSidePixels: normalizedCubeSidePixels,
    offsetX: FRAME_PADDING - minX,
    offsetY: FRAME_PADDING - minY,
    tileHalfHeight,
    tileHalfWidth,
    voxelScreenHeight,
  };
}

// Cube-side normalization and route depth keep this cache bounded to the frame
// variants we actually render while still allowing fitted recursive previews.
const isometricFrameMetricsCache = new Map<string, LogoIsometricFrameMetrics>();

export function getLogoIsometricFrameMetrics(
  cubeSidePixels = LOGO_ISOMETRIC_CUBE_SIDE_PIXELS.defaultValue,
  gridSize: number = GRID_SIZE,
): LogoIsometricFrameMetrics {
  const normalizedCubeSidePixels = normalizeLogoIsometricFrameCubeSidePixels(cubeSidePixels);
  const cacheKey = `${normalizedCubeSidePixels}:${gridSize}`;
  const cachedFrameMetrics = isometricFrameMetricsCache.get(cacheKey);

  if (cachedFrameMetrics) {
    return cachedFrameMetrics;
  }

  const frameMetrics = createLogoIsometricFrameMetrics(normalizedCubeSidePixels, gridSize);
  isometricFrameMetricsCache.set(cacheKey, frameMetrics);
  return frameMetrics;
}

const defaultFrameMetrics = getLogoIsometricFrameMetrics();

export const LOGO_ISOMETRIC_CANVAS_WIDTH = defaultFrameMetrics.canvasWidth;
export const LOGO_ISOMETRIC_CANVAS_HEIGHT = defaultFrameMetrics.canvasHeight;
export const LOGO_ISOMETRIC_ELEVATION_DEGREES = 35.26438968;
export const LOGO_ISOMETRIC_ROTATION_DEGREES = FAVICON_ROTATION_DEGREES;

function translatePolygon(
  points: readonly Point[],
  frameMetrics: LogoIsometricFrameMetrics,
): readonly Point[] {
  return points.map((point) => ({
    x: point.x + frameMetrics.offsetX,
    y: point.y + frameMetrics.offsetY,
  }));
}

function translatePoint(position: CubePosition, frameMetrics: LogoIsometricFrameMetrics): Point {
  const point = projectPoint(position, frameMetrics);
  return {
    x: point.x + frameMetrics.offsetX,
    y: point.y + frameMetrics.offsetY,
  };
}

function isVoxelFilled(
  filledVoxels: ReadonlySet<string>,
  gridSize: number,
  x: number,
  y: number,
  z: number,
): boolean {
  if (!isWithinVoxelGrid(gridSize, x, y, z)) {
    return false;
  }

  return filledVoxels.has(voxelKey(x, y, z));
}

function collectPolygonRowSpans(polygon: readonly Point[]): RowSpan[] {
  const xs = polygon.map((point) => point.x);
  const ys = polygon.map((point) => point.y);
  const minX = Math.floor(Math.min(...xs));
  const maxX = Math.ceil(Math.max(...xs));
  const minY = Math.floor(Math.min(...ys));
  const maxY = Math.ceil(Math.max(...ys));
  const rowSpans: RowSpan[] = [];

  for (let y = minY; y <= maxY; y += 1) {
    let startX: number | null = null;
    let endX: number | null = null;

    for (let x = minX; x <= maxX; x += 1) {
      if (isPointInsidePolygon(x + 0.5, y + 0.5, polygon)) {
        startX ??= x;
        endX = x;
      }
    }

    if (startX !== null && endX !== null) {
      rowSpans.push({ endX, startX, y });
    }
  }

  return rowSpans;
}

function widenCapRows(rowSpans: readonly RowSpan[], capWidth: 2 | 3 | 4): readonly RowSpan[] {
  if (capWidth === 2 || rowSpans.length < 2) {
    return rowSpans;
  }

  return rowSpans.map((rowSpan, index) => {
    if (index !== 0 && index !== rowSpans.length - 1) {
      return rowSpan;
    }

    const width = rowSpan.endX - rowSpan.startX + 1;
    if (width >= capWidth) {
      return rowSpan;
    }

    const expansion = capWidth - width;
    return {
      endX: rowSpan.endX + Math.ceil(expansion / 2),
      startX: rowSpan.startX - Math.floor(expansion / 2),
      y: rowSpan.y,
    };
  });
}

function fillRowSpans(
  context: CanvasRenderingContext2D,
  rowSpans: readonly RowSpan[],
  fillStyle: string,
) {
  context.fillStyle = fillStyle;
  for (const rowSpan of rowSpans) {
    context.fillRect(rowSpan.startX, rowSpan.y, rowSpan.endX - rowSpan.startX + 1, 1);
  }
}

function getStyledFaceRowSpans(polygon: readonly Point[], capWidth: 2 | 3 | 4): readonly RowSpan[] {
  return widenCapRows(collectPolygonRowSpans(polygon), capWidth);
}

function fillLogoIsoCubePixelSprite({
  context,
  cubePixelSprite,
  fillStyle,
  frameMetrics,
  maskRowSpans,
}: {
  context: CanvasRenderingContext2D;
  cubePixelSprite: LogoIsoCubePixelSprite | undefined;
  fillStyle: string;
  frameMetrics: LogoIsometricFrameMetrics;
  maskRowSpans: readonly RowSpan[];
}) {
  if (!cubePixelSprite || cubePixelSprite.pixelKeys.size === 0) {
    return;
  }

  context.fillStyle = fillStyle;
  for (const pixelKey of cubePixelSprite.pixelKeys) {
    const pixel = parseLogoIsoCubePixelKey(pixelKey);
    if (
      !pixel ||
      pixel.x < 0 ||
      pixel.x >= frameMetrics.canvasWidth ||
      pixel.y < 0 ||
      pixel.y >= frameMetrics.canvasHeight ||
      !isPointInsideRowSpans(pixel.x + 0.5, pixel.y + 0.5, maskRowSpans)
    ) {
      continue;
    }

    context.fillRect(pixel.x, pixel.y, 1, 1);
  }
}

function getCubeSpriteDrawOffset(
  position: CubePosition,
  frameMetrics: LogoIsometricFrameMetrics,
  cubeFrameMetrics: LogoIsometricFrameMetrics,
): Point {
  const origin = translatePoint(position, frameMetrics);
  return {
    x: origin.x - cubeFrameMetrics.offsetX,
    y: origin.y - cubeFrameMetrics.offsetY,
  };
}

function buildSingleCubeRenderFaces(
  faceColors: FaceColors,
  frameMetrics: LogoIsometricFrameMetrics,
): RenderFace[] {
  const coordinate: VoxelCoordinate = [0, 0, 0];
  const position: CubePosition = [0, 0, 0];
  const faceFillColors: Record<IsometricFaceDirection, string> = {
    left: getTailwindColorHex(faceColors.left),
    right: getTailwindColorHex(faceColors.right),
    top: getTailwindColorHex(faceColors.top),
  };
  const directions: readonly IsometricFaceDirection[] = ["left", "right", "top"];

  return directions
    .map((direction) =>
      createRenderFace({
        color: faceFillColors[direction],
        coordinate,
        direction,
        frameMetrics,
        position,
      }),
    )
    .sort(compareRenderFaces);
}

function getLogoIsometricCubeRowSpans({
  cubeSidePixels,
  styleId,
}: {
  cubeSidePixels: number;
  styleId: LogoIsometricStyleId;
}): readonly RowSpan[] {
  const style = getLogoIsometricStyle(styleId);
  const frameMetrics = getLogoIsometricFrameMetrics(cubeSidePixels, 1);
  const directions: readonly IsometricFaceDirection[] = ["left", "right", "top"];
  return directions.flatMap((direction) =>
    getStyledFaceRowSpans(
      translatePolygon(getCubeFacePolygon([0, 0, 0], direction, frameMetrics), frameMetrics),
      style.capWidth,
    ),
  );
}

export function getLogoIsometricCubeHitRows({
  cubeSidePixels = LOGO_ISOMETRIC_CUBE_SIDE_PIXELS.defaultValue,
  styleId = DEFAULT_LOGO_ISOMETRIC_STYLE_ID,
}: {
  cubeSidePixels?: number;
  styleId?: LogoIsometricStyleId;
}): readonly IsometricHitRowSpan[] {
  return getLogoIsometricCubeRowSpans({ cubeSidePixels, styleId });
}

function escapeSvgAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function serializeSvgPolygon(points: readonly Point[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

function applyShadedEdges(
  context: CanvasRenderingContext2D,
  frameMetrics: LogoIsometricFrameMetrics,
) {
  const imageData = context.getImageData(0, 0, frameMetrics.canvasWidth, frameMetrics.canvasHeight);
  const source = imageData.data.slice();
  const next = imageData.data;
  const width = frameMetrics.canvasWidth;
  const height = frameMetrics.canvasHeight;

  const isOpaque = (x: number, y: number) => {
    if (x < 0 || x >= width || y < 0 || y >= height) {
      return false;
    }

    return source[(y * width + x) * 4 + 3] > 0;
  };

  const hasDifferentNeighbor = (x: number, y: number, offsetX: number, offsetY: number) => {
    const neighborX = x + offsetX;
    const neighborY = y + offsetY;
    if (!isOpaque(neighborX, neighborY)) {
      return true;
    }

    const sourceIndex = (y * width + x) * 4;
    const neighborIndex = (neighborY * width + neighborX) * 4;
    return (
      source[sourceIndex] !== source[neighborIndex] ||
      source[sourceIndex + 1] !== source[neighborIndex + 1] ||
      source[sourceIndex + 2] !== source[neighborIndex + 2]
    );
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      if (source[index + 3] === 0) {
        continue;
      }

      const shouldShade =
        hasDifferentNeighbor(x, y, -1, 0) ||
        hasDifferentNeighbor(x, y, 1, 0) ||
        hasDifferentNeighbor(x, y, 0, -1) ||
        hasDifferentNeighbor(x, y, 0, 1);

      if (!shouldShade) {
        continue;
      }

      next[index] = Math.round(source[index] * 0.55);
      next[index + 1] = Math.round(source[index + 1] * 0.55);
      next[index + 2] = Math.round(source[index + 2] * 0.55);
    }
  }

  context.putImageData(imageData, 0, 0);
}

function parseVoxelCoordinate(key: string): VoxelCoordinate {
  const parts = key.split(",");
  if (parts.length !== 3) {
    throw new Error(`Invalid voxel coordinate key: ${key}`);
  }

  const x = Number.parseInt(parts[0].trim(), 10);
  const y = Number.parseInt(parts[1].trim(), 10);
  const z = Number.parseInt(parts[2].trim(), 10);

  if (Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(z)) {
    throw new Error(`Invalid voxel coordinate key: ${key}`);
  }

  return [x, y, z];
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
  const leftDepth = leftSortPosition[0] + leftSortPosition[1] + leftSortPosition[2];
  const rightDepth = rightSortPosition[0] + rightSortPosition[1] + rightSortPosition[2];

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
  frameMetrics,
  position,
}: {
  color: string;
  coordinate: VoxelCoordinate;
  direction: IsometricFaceDirection;
  frameMetrics: LogoIsometricFrameMetrics;
  position: CubePosition;
}): RenderFace {
  return {
    color,
    coordinate,
    direction,
    normal: FACE_NORMALS[direction],
    polygon: translatePolygon(getCubeFacePolygon(position, direction, frameMetrics), frameMetrics),
    position,
  };
}

function buildStaticRenderFaces(
  filledVoxels: ReadonlySet<string>,
  faceColors: FaceColors,
  frameMetrics: LogoIsometricFrameMetrics,
  gridSize: number,
): RenderFace[] {
  const renderFaces: RenderFace[] = [];
  const topColor = getTailwindColorHex(faceColors.top);
  const rightColor = getTailwindColorHex(faceColors.right);
  const leftColor = getTailwindColorHex(faceColors.left);

  for (const key of filledVoxels) {
    const coordinate = parseVoxelCoordinate(key);

    if (!isVoxelFilled(filledVoxels, gridSize, coordinate[0], coordinate[1], coordinate[2] + 1)) {
      renderFaces.push(
        createRenderFace({
          color: leftColor,
          coordinate,
          direction: "left",
          frameMetrics,
          position: coordinate,
        }),
      );
    }

    if (!isVoxelFilled(filledVoxels, gridSize, coordinate[0] + 1, coordinate[1], coordinate[2])) {
      renderFaces.push(
        createRenderFace({
          color: rightColor,
          coordinate,
          direction: "right",
          frameMetrics,
          position: coordinate,
        }),
      );
    }

    if (!isVoxelFilled(filledVoxels, gridSize, coordinate[0], coordinate[1] + 1, coordinate[2])) {
      renderFaces.push(
        createRenderFace({
          color: topColor,
          coordinate,
          direction: "top",
          frameMetrics,
          position: coordinate,
        }),
      );
    }
  }

  return renderFaces;
}

function buildMovingRenderFaces(
  filledVoxels: ReadonlySet<string>,
  faceColors: FaceColors,
  frameMetrics: LogoIsometricFrameMetrics,
  gridSize: number,
  movingVoxels: readonly IsometricMovingVoxel[],
): RenderFace[] {
  const topColor = getTailwindColorHex(faceColors.top);
  const rightColor = getTailwindColorHex(faceColors.right);
  const leftColor = getTailwindColorHex(faceColors.left);
  const occupiedVoxelKeys = new Set(filledVoxels);

  for (const movingVoxel of movingVoxels) {
    occupiedVoxelKeys.add(
      voxelKey(movingVoxel.coordinate[0], movingVoxel.coordinate[1], movingVoxel.coordinate[2]),
    );
  }

  return movingVoxels.flatMap((movingVoxel) => {
    const renderFaces: RenderFace[] = [];

    if (
      !isVoxelFilled(
        occupiedVoxelKeys,
        gridSize,
        movingVoxel.coordinate[0],
        movingVoxel.coordinate[1],
        movingVoxel.coordinate[2] + 1,
      )
    ) {
      renderFaces.push(
        createRenderFace({
          color: leftColor,
          coordinate: movingVoxel.coordinate,
          direction: "left",
          frameMetrics,
          position: movingVoxel.position,
        }),
      );
    }

    if (
      !isVoxelFilled(
        occupiedVoxelKeys,
        gridSize,
        movingVoxel.coordinate[0] + 1,
        movingVoxel.coordinate[1],
        movingVoxel.coordinate[2],
      )
    ) {
      renderFaces.push(
        createRenderFace({
          color: rightColor,
          coordinate: movingVoxel.coordinate,
          direction: "right",
          frameMetrics,
          position: movingVoxel.position,
        }),
      );
    }

    if (
      !isVoxelFilled(
        occupiedVoxelKeys,
        gridSize,
        movingVoxel.coordinate[0],
        movingVoxel.coordinate[1] + 1,
        movingVoxel.coordinate[2],
      )
    ) {
      renderFaces.push(
        createRenderFace({
          color: topColor,
          coordinate: movingVoxel.coordinate,
          direction: "top",
          frameMetrics,
          position: movingVoxel.position,
        }),
      );
    }

    return renderFaces;
  });
}

function compareRenderFaces(left: RenderFace, right: RenderFace): number {
  return compareFaceLayers(left.position, left.direction, right.position, right.direction);
}

function compareRecursiveDrawItems(
  left: IsometricRecursiveDrawItem,
  right: IsometricRecursiveDrawItem,
): number {
  const leftDepth = left.position[0] + left.position[1] + left.position[2];
  const rightDepth = right.position[0] + right.position[1] + right.position[2];

  if (leftDepth !== rightDepth) {
    return leftDepth - rightDepth;
  }

  if (left.position[1] !== right.position[1]) {
    return left.position[1] - right.position[1];
  }

  if (left.position[0] !== right.position[0]) {
    return left.position[0] - right.position[0];
  }

  if (left.position[2] !== right.position[2]) {
    return left.position[2] - right.position[2];
  }

  return left.key.localeCompare(right.key);
}

function getRecursiveDrawItems({
  filledVoxels,
  gridSize = GRID_SIZE,
  movingVoxels,
}: {
  filledVoxels: ReadonlySet<string>;
  gridSize?: number;
  movingVoxels: readonly IsometricMovingVoxel[];
}): readonly IsometricRecursiveDrawItem[] {
  const drawItems: IsometricRecursiveDrawItem[] = [];

  for (const key of filledVoxels) {
    const coordinate = parseVoxelKey(key);
    if (!coordinate || !isWithinVoxelGrid(gridSize, coordinate[0], coordinate[1], coordinate[2])) {
      continue;
    }

    drawItems.push({
      key,
      position: coordinate,
    });
  }

  for (const movingVoxel of movingVoxels) {
    drawItems.push({
      key: `moving:${voxelKey(...movingVoxel.coordinate)}`,
      position: movingVoxel.position,
    });
  }

  return drawItems.sort(compareRecursiveDrawItems);
}

function createIsometricCanvas(frameMetrics: LogoIsometricFrameMetrics): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = frameMetrics.canvasWidth;
  canvas.height = frameMetrics.canvasHeight;
  return canvas;
}

export function createLogoIsometricCubeCanvas({
  cubePixelSprite,
  cubeSidePixels = LOGO_ISOMETRIC_CUBE_SIDE_PIXELS.defaultValue,
  faceColors,
  styleId = DEFAULT_LOGO_ISOMETRIC_STYLE_ID,
}: {
  cubePixelSprite?: LogoIsoCubePixelSprite | undefined;
  cubeSidePixels?: number;
  faceColors: FaceColors;
  styleId?: LogoIsometricStyleId;
}): {
  canvas: HTMLCanvasElement;
  frameMetrics: LogoIsometricFrameMetrics;
} {
  const frameMetrics = getLogoIsometricFrameMetrics(cubeSidePixels, 1);
  const canvas = createIsometricCanvas(frameMetrics);
  const context = canvas.getContext("2d", {
    willReadFrequently: true,
  });

  if (!context) {
    return { canvas, frameMetrics };
  }

  const style = getLogoIsometricStyle(styleId);
  const cubeMaskRowSpans: RowSpan[] = [];
  for (const renderFace of buildSingleCubeRenderFaces(faceColors, frameMetrics)) {
    const hitRows = getStyledFaceRowSpans(renderFace.polygon, style.capWidth);
    fillRowSpans(context, hitRows, renderFace.color);
    cubeMaskRowSpans.push(...hitRows);
  }

  if (style.edgeMode === "shaded") {
    applyShadedEdges(context, frameMetrics);
  }

  fillLogoIsoCubePixelSprite({
    context,
    cubePixelSprite,
    fillStyle: getTailwindColorHex(faceColors.right),
    frameMetrics,
    maskRowSpans: cubeMaskRowSpans,
  });

  return { canvas, frameMetrics };
}

function drawRecursiveChildImage({
  childCanvas,
  childFrameMetrics,
  childGridSize,
  context,
  drawItem,
  frameMetrics,
}: {
  childCanvas: HTMLCanvasElement;
  childFrameMetrics: LogoIsometricFrameMetrics;
  childGridSize: number;
  context: CanvasRenderingContext2D;
  drawItem: IsometricRecursiveDrawItem;
  frameMetrics: LogoIsometricFrameMetrics;
}) {
  const origin = translatePoint(
    [
      drawItem.position[0] * childGridSize,
      drawItem.position[1] * childGridSize,
      drawItem.position[2] * childGridSize,
    ],
    frameMetrics,
  );

  context.drawImage(
    childCanvas,
    origin.x - childFrameMetrics.offsetX,
    origin.y - childFrameMetrics.offsetY,
  );
}

export function createLogoIsometricRecursiveCanvas({
  baseGridSize = DEFAULT_LOGO_GRID_SIZE,
  cubeSidePixels = LOGO_ISOMETRIC_CUBE_SIDE_PIXELS.defaultValue,
  cubePixelSprite,
  depth,
  faceColors,
  filledVoxels,
  movingVoxels = [],
  styleId = DEFAULT_LOGO_ISOMETRIC_STYLE_ID,
}: {
  baseGridSize?: LogoGridSize;
  cubeSidePixels?: number;
  cubePixelSprite?: LogoIsoCubePixelSprite | undefined;
  depth: number;
  faceColors: FaceColors;
  filledVoxels: ReadonlySet<string>;
  movingVoxels?: readonly IsometricMovingVoxel[];
  styleId?: LogoIsometricStyleId;
}): {
  canvas: HTMLCanvasElement;
  frameMetrics: LogoIsometricFrameMetrics;
} {
  const normalizedDepth = normalizeLogoFractalDepth(depth);
  let frameMetrics = getLogoIsometricFrameMetrics(cubeSidePixels, baseGridSize);
  let canvas = createIsometricCanvas(frameMetrics);
  const context = canvas.getContext("2d", {
    willReadFrequently: true,
  });

  if (!context) {
    return { canvas, frameMetrics };
  }

  drawLogoIsometricFrame({
    backgroundColor: "transparent",
    cubeSidePixels,
    context,
    cubePixelSprite,
    faceColors,
    filledVoxels,
    gridSize: baseGridSize,
    movingVoxels,
    paintBackground: false,
    styleId,
  });

  if (normalizedDepth <= DEFAULT_LOGO_FRACTAL_DEPTH) {
    return { canvas, frameMetrics };
  }

  const drawItems = getRecursiveDrawItems({ filledVoxels, movingVoxels });

  for (let level = 2; level <= normalizedDepth; level += 1) {
    const childCanvas = canvas;
    const childFrameMetrics = frameMetrics;
    const childGridSize = getLogoFractalGridSize(baseGridSize, level - 1);
    frameMetrics = getLogoIsometricFrameMetrics(
      cubeSidePixels,
      getLogoFractalGridSize(baseGridSize, level),
    );
    canvas = createIsometricCanvas(frameMetrics);
    const nextContext = canvas.getContext("2d", {
      willReadFrequently: true,
    });
    if (!nextContext) {
      return { canvas, frameMetrics };
    }

    nextContext.imageSmoothingEnabled = false;
    for (const drawItem of drawItems) {
      drawRecursiveChildImage({
        childCanvas,
        childFrameMetrics,
        childGridSize,
        context: nextContext,
        drawItem,
        frameMetrics,
      });
    }
  }

  return { canvas, frameMetrics };
}

export function drawLogoIsometricFrame({
  backgroundColor,
  cubePixelSprite,
  cubeSidePixels = LOGO_ISOMETRIC_CUBE_SIDE_PIXELS.defaultValue,
  context,
  faceColors,
  filledVoxels,
  gridSize = GRID_SIZE,
  movingVoxels = [],
  paintBackground = true,
  styleId = DEFAULT_LOGO_ISOMETRIC_STYLE_ID,
}: {
  backgroundColor: string;
  cubePixelSprite?: LogoIsoCubePixelSprite | undefined;
  cubeSidePixels?: number;
  context: CanvasRenderingContext2D;
  faceColors: FaceColors;
  filledVoxels: ReadonlySet<string>;
  gridSize?: number;
  movingVoxels?: readonly IsometricMovingVoxel[];
  paintBackground?: boolean;
  styleId?: LogoIsometricStyleId;
}): readonly IsometricVisibleFace[] {
  const style = getLogoIsometricStyle(styleId);
  const frameMetrics = getLogoIsometricFrameMetrics(cubeSidePixels, gridSize);
  const { canvas: cubeCanvas, frameMetrics: cubeFrameMetrics } = createLogoIsometricCubeCanvas({
    cubePixelSprite,
    cubeSidePixels,
    faceColors,
    styleId,
  });

  context.clearRect(0, 0, frameMetrics.canvasWidth, frameMetrics.canvasHeight);

  const renderFaces = [
    ...buildStaticRenderFaces(filledVoxels, faceColors, frameMetrics, gridSize),
    ...buildMovingRenderFaces(filledVoxels, faceColors, frameMetrics, gridSize, movingVoxels),
  ].sort(compareRenderFaces);
  const visibleFaces: IsometricVisibleFace[] = [];

  for (const renderFace of renderFaces) {
    const hitRows = getStyledFaceRowSpans(renderFace.polygon, style.capWidth);
    const spriteOffset = getCubeSpriteDrawOffset(
      renderFace.position,
      frameMetrics,
      cubeFrameMetrics,
    );
    visibleFaces.push({
      coordinate: renderFace.coordinate,
      direction: renderFace.direction,
      hitRows,
      normal: renderFace.normal,
      polygon: renderFace.polygon,
      spriteOffsetX: spriteOffset.x,
      spriteOffsetY: spriteOffset.y,
    });
  }

  context.imageSmoothingEnabled = false;
  for (const drawItem of getRecursiveDrawItems({ filledVoxels, gridSize, movingVoxels })) {
    const spriteOffset = getCubeSpriteDrawOffset(drawItem.position, frameMetrics, cubeFrameMetrics);
    context.drawImage(cubeCanvas, spriteOffset.x, spriteOffset.y);
  }

  if (paintBackground) {
    context.save();
    context.globalCompositeOperation = "destination-over";
    context.fillStyle = backgroundColor;
    context.fillRect(0, 0, frameMetrics.canvasWidth, frameMetrics.canvasHeight);
    context.restore();
  }

  return visibleFaces;
}

export function drawLogoIsometricRecursiveFrame({
  baseGridSize = DEFAULT_LOGO_GRID_SIZE,
  backgroundColor,
  context,
  cubePixelSprite,
  depth,
  faceColors,
  filledVoxels,
  movingVoxels = [],
  styleId = DEFAULT_LOGO_ISOMETRIC_STYLE_ID,
  cubeSidePixels = LOGO_ISOMETRIC_CUBE_SIDE_PIXELS.defaultValue,
}: {
  baseGridSize?: LogoGridSize;
  backgroundColor: string;
  context: CanvasRenderingContext2D;
  cubePixelSprite?: LogoIsoCubePixelSprite | undefined;
  depth: number;
  faceColors: FaceColors;
  filledVoxels: ReadonlySet<string>;
  movingVoxels?: readonly IsometricMovingVoxel[];
  styleId?: LogoIsometricStyleId;
  cubeSidePixels?: number;
}): readonly IsometricVisibleFace[] {
  const normalizedDepth = normalizeLogoFractalDepth(depth);

  if (normalizedDepth <= DEFAULT_LOGO_FRACTAL_DEPTH) {
    return drawLogoIsometricFrame({
      backgroundColor,
      context,
      cubePixelSprite,
      cubeSidePixels,
      faceColors,
      filledVoxels,
      gridSize: baseGridSize,
      movingVoxels,
      styleId,
    });
  }

  const { canvas, frameMetrics } = createLogoIsometricRecursiveCanvas({
    baseGridSize,
    cubeSidePixels,
    cubePixelSprite,
    depth: normalizedDepth,
    faceColors,
    filledVoxels,
    movingVoxels,
    styleId,
  });

  context.clearRect(0, 0, frameMetrics.canvasWidth, frameMetrics.canvasHeight);
  context.fillStyle = backgroundColor;
  context.fillRect(0, 0, frameMetrics.canvasWidth, frameMetrics.canvasHeight);
  context.imageSmoothingEnabled = false;
  context.drawImage(canvas, 0, 0);

  return [];
}

export function createLogoIsometricSvgMarkup({
  backgroundColor,
  faceColors,
  filledVoxels,
  gridSize = GRID_SIZE,
  movingVoxels = [],
  styleId = "flat",
}: {
  backgroundColor: string;
  faceColors: FaceColors;
  filledVoxels: ReadonlySet<string>;
  gridSize?: number;
  movingVoxels?: readonly IsometricMovingVoxel[];
  styleId?: LogoIsometricSvgSafeStyleId;
}): string {
  const style = getLogoIsometricStyle(styleId);
  const frameMetrics = getLogoIsometricFrameMetrics(
    LOGO_ISOMETRIC_CUBE_SIDE_PIXELS.defaultValue,
    gridSize,
  );

  if (style.edgeMode !== "none" || style.capWidth !== 2) {
    throw new Error("SVG export only supports flat four-point face geometry.");
  }

  const renderFaces = [
    ...buildStaticRenderFaces(filledVoxels, faceColors, frameMetrics, gridSize),
    ...buildMovingRenderFaces(filledVoxels, faceColors, frameMetrics, gridSize, movingVoxels),
  ].sort(compareRenderFaces);
  const backgroundRect = `<rect x="0" y="0" width="${frameMetrics.canvasWidth}" height="${frameMetrics.canvasHeight}" fill="${escapeSvgAttribute(backgroundColor)}"/>`;
  const renderFacePolygons = renderFaces
    .map((renderFace) => {
      const fill = escapeSvgAttribute(renderFace.color);
      const points = escapeSvgAttribute(serializeSvgPolygon(renderFace.polygon));
      return `<polygon points="${points}" fill="${fill}"/>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${frameMetrics.canvasWidth} ${frameMetrics.canvasHeight}" width="${frameMetrics.canvasWidth}" height="${frameMetrics.canvasHeight}">${backgroundRect}${renderFacePolygons}</svg>`;
}

export function getIsometricAddCoordinate(
  face: IsometricVisibleFace,
  filledVoxels: ReadonlySet<string>,
  gridSize: number = GRID_SIZE,
): VoxelCoordinate | null {
  const [x, y, z] = face.coordinate;
  const [dx, dy, dz] = face.normal;
  const nextCoordinate: VoxelCoordinate = [x + dx, y + dy, z + dz];

  if (!isWithinVoxelGrid(gridSize, nextCoordinate[0], nextCoordinate[1], nextCoordinate[2])) {
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
    const crossesHorizontalRange = currentPoint.y > pointY !== previousPoint.y > pointY;

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

export function isPointInsideRowSpans(
  pointX: number,
  pointY: number,
  rowSpans: readonly IsometricHitRowSpan[],
): boolean {
  const row = Math.floor(pointY);
  if (row < 0) {
    return false;
  }

  return rowSpans.some(
    (rowSpan) => rowSpan.y === row && pointX >= rowSpan.startX && pointX < rowSpan.endX + 1,
  );
}
