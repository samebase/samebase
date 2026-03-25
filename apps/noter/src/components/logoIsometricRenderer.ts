import {
  FAVICON_ROTATION_DEGREES,
  GRID_SIZE,
  isWithinGrid,
  type VoxelCoordinate,
  voxelKey,
} from "@/components/logoVoxelState";
import {
  getTailwindColorHex,
  type FaceColors,
} from "@/components/logoTailwindColors";

const FRAME_PADDING = 4;
export const DEFAULT_LOGO_ISOMETRIC_CUBE_SIDE_PX = 16;
export const MIN_LOGO_ISOMETRIC_CUBE_SIDE_PX = 2;
export const MAX_LOGO_ISOMETRIC_CUBE_SIDE_PX = 40;
export const LOGO_ISOMETRIC_CUBE_SIDE_STEP_PX = 2;

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
};

export type IsometricMovingVoxel = {
  coordinate: VoxelCoordinate;
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
    description:
      "Standard 2:1 fill with shaded edge pixels on silhouettes and ridges.",
    edgeMode: "shaded",
    id: "shaded-edge",
    label: "Shaded Edge",
  },
  {
    capWidth: 3,
    description:
      "Keeps 2:1 slopes but widens the top and bottom cap rows to 3 pixels.",
    edgeMode: "none",
    id: "cap-3",
    label: "Cap 3",
  },
  {
    capWidth: 4,
    description:
      "Keeps 2:1 slopes but widens the top and bottom cap rows to 4 pixels.",
    edgeMode: "none",
    id: "cap-4",
    label: "Cap 4",
  },
] as const satisfies readonly LogoIsometricStyle[];

export function isLogoIsometricStyleId(
  value: string | null,
): value is LogoIsometricStyleId {
  if (value === null) {
    return false;
  }

  return LOGO_ISOMETRIC_STYLES.some((style) => style.id === value);
}

export function getLogoIsometricStyle(
  styleId: LogoIsometricStyleId,
): LogoIsometricStyle {
  return (
    LOGO_ISOMETRIC_STYLES.find((style) => style.id === styleId) ??
    LOGO_ISOMETRIC_STYLES[0]
  );
}

export function normalizeLogoIsometricCubeSidePixels(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_LOGO_ISOMETRIC_CUBE_SIDE_PX;
  }

  const roundedToStep =
    Math.round(value / LOGO_ISOMETRIC_CUBE_SIDE_STEP_PX) *
    LOGO_ISOMETRIC_CUBE_SIDE_STEP_PX;

  return Math.min(
    Math.max(roundedToStep, MIN_LOGO_ISOMETRIC_CUBE_SIDE_PX),
    MAX_LOGO_ISOMETRIC_CUBE_SIDE_PX,
  );
}

function projectPoint(
  position: CubePosition,
  frameMetrics: LogoIsometricFrameMetrics,
): Point {
  return {
    x: (position[0] - position[2]) * frameMetrics.tileHalfWidth,
    y:
      (position[0] + position[2]) * frameMetrics.tileHalfHeight -
      position[1] * frameMetrics.voxelScreenHeight,
  };
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
): LogoIsometricFrameMetrics {
  const normalizedCubeSidePixels =
    normalizeLogoIsometricCubeSidePixels(cubeSidePixels);
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

  for (let x = 0; x <= GRID_SIZE; x += 1) {
    for (let y = 0; y <= GRID_SIZE; y += 1) {
      for (let z = 0; z <= GRID_SIZE; z += 1) {
        const point = projectPoint([x, y, z], provisionalMetrics);
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
      }
    }
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

// normalizeLogoIsometricCubeSidePixels limits getLogoIsometricFrameMetrics to a
// small fixed set of step-aligned keys, so this cache only ever grows to the
// supported cube-side variants for isometricFrameMetricsCache.
const isometricFrameMetricsCache = new Map<number, LogoIsometricFrameMetrics>();

export function getLogoIsometricFrameMetrics(
  cubeSidePixels = DEFAULT_LOGO_ISOMETRIC_CUBE_SIDE_PX,
): LogoIsometricFrameMetrics {
  const normalizedCubeSidePixels =
    normalizeLogoIsometricCubeSidePixels(cubeSidePixels);
  const cachedFrameMetrics = isometricFrameMetricsCache.get(
    normalizedCubeSidePixels,
  );

  if (cachedFrameMetrics) {
    return cachedFrameMetrics;
  }

  const frameMetrics = createLogoIsometricFrameMetrics(
    normalizedCubeSidePixels,
  );
  isometricFrameMetricsCache.set(normalizedCubeSidePixels, frameMetrics);
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

function widenCapRows(
  rowSpans: readonly RowSpan[],
  capWidth: 2 | 3 | 4,
): readonly RowSpan[] {
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
    context.fillRect(
      rowSpan.startX,
      rowSpan.y,
      rowSpan.endX - rowSpan.startX + 1,
      1,
    );
  }
}

function getStyledFaceRowSpans(
  polygon: readonly Point[],
  capWidth: 2 | 3 | 4,
): readonly RowSpan[] {
  return widenCapRows(collectPolygonRowSpans(polygon), capWidth);
}

function fillStyledFace(
  context: CanvasRenderingContext2D,
  polygon: readonly Point[],
  fillStyle: string,
  capWidth: 2 | 3 | 4,
) {
  fillRowSpans(context, getStyledFaceRowSpans(polygon, capWidth), fillStyle);
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
  const imageData = context.getImageData(
    0,
    0,
    frameMetrics.canvasWidth,
    frameMetrics.canvasHeight,
  );
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

  const hasDifferentNeighbor = (
    x: number,
    y: number,
    offsetX: number,
    offsetY: number,
  ) => {
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
    polygon: translatePolygon(
      getCubeFacePolygon(position, direction, frameMetrics),
      frameMetrics,
    ),
    position,
  };
}

function buildStaticRenderFaces(
  filledVoxels: ReadonlySet<string>,
  faceColors: FaceColors,
  frameMetrics: LogoIsometricFrameMetrics,
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
          frameMetrics,
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
          frameMetrics,
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
  movingVoxels: readonly IsometricMovingVoxel[],
): RenderFace[] {
  const topColor = getTailwindColorHex(faceColors.top);
  const rightColor = getTailwindColorHex(faceColors.right);
  const leftColor = getTailwindColorHex(faceColors.left);
  const occupiedVoxelKeys = new Set(filledVoxels);

  for (const movingVoxel of movingVoxels) {
    occupiedVoxelKeys.add(
      voxelKey(
        movingVoxel.coordinate[0],
        movingVoxel.coordinate[1],
        movingVoxel.coordinate[2],
      ),
    );
  }

  return movingVoxels.flatMap((movingVoxel) => {
    const renderFaces: RenderFace[] = [];

    if (
      !isVoxelFilled(
        occupiedVoxelKeys,
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
  return compareFaceLayers(
    left.position,
    left.direction,
    right.position,
    right.direction,
  );
}

export function drawLogoIsometricFrame({
  backgroundColor,
  cubeSidePixels = DEFAULT_LOGO_ISOMETRIC_CUBE_SIDE_PX,
  context,
  faceColors,
  filledVoxels,
  movingVoxels = [],
  styleId = DEFAULT_LOGO_ISOMETRIC_STYLE_ID,
}: {
  backgroundColor: string;
  cubeSidePixels?: number;
  context: CanvasRenderingContext2D;
  faceColors: FaceColors;
  filledVoxels: ReadonlySet<string>;
  movingVoxels?: readonly IsometricMovingVoxel[];
  styleId?: LogoIsometricStyleId;
}): readonly IsometricVisibleFace[] {
  const style = getLogoIsometricStyle(styleId);
  const frameMetrics = getLogoIsometricFrameMetrics(cubeSidePixels);

  context.clearRect(0, 0, frameMetrics.canvasWidth, frameMetrics.canvasHeight);

  const renderFaces = [
    ...buildStaticRenderFaces(filledVoxels, faceColors, frameMetrics),
    ...buildMovingRenderFaces(
      filledVoxels,
      faceColors,
      frameMetrics,
      movingVoxels,
    ),
  ].sort(compareRenderFaces);

  for (const renderFace of renderFaces) {
    fillStyledFace(
      context,
      renderFace.polygon,
      renderFace.color,
      style.capWidth,
    );
  }

  if (style.edgeMode === "shaded") {
    applyShadedEdges(context, frameMetrics);
  }

  context.save();
  context.globalCompositeOperation = "destination-over";
  context.fillStyle = backgroundColor;
  context.fillRect(0, 0, frameMetrics.canvasWidth, frameMetrics.canvasHeight);
  context.restore();

  return renderFaces.map(({ coordinate, direction, normal, polygon }) => ({
    coordinate,
    direction,
    hitRows: getStyledFaceRowSpans(polygon, style.capWidth),
    normal,
    polygon,
  }));
}

export function createLogoIsometricSvgMarkup({
  backgroundColor,
  faceColors,
  filledVoxels,
  movingVoxels = [],
  styleId = "flat",
}: {
  backgroundColor: string;
  faceColors: FaceColors;
  filledVoxels: ReadonlySet<string>;
  movingVoxels?: readonly IsometricMovingVoxel[];
  styleId?: LogoIsometricSvgSafeStyleId;
}): string {
  const style = getLogoIsometricStyle(styleId);
  const frameMetrics = defaultFrameMetrics;

  if (style.edgeMode !== "none" || style.capWidth !== 2) {
    throw new Error("SVG export only supports flat four-point face geometry.");
  }

  const renderFaces = [
    ...buildStaticRenderFaces(filledVoxels, faceColors, frameMetrics),
    ...buildMovingRenderFaces(
      filledVoxels,
      faceColors,
      frameMetrics,
      movingVoxels,
    ),
  ].sort(compareRenderFaces);
  const backgroundRect = `<rect x="0" y="0" width="${frameMetrics.canvasWidth}" height="${frameMetrics.canvasHeight}" fill="${escapeSvgAttribute(backgroundColor)}"/>`;
  const renderFacePolygons = renderFaces
    .map((renderFace) => {
      const fill = escapeSvgAttribute(renderFace.color);
      const points = escapeSvgAttribute(
        serializeSvgPolygon(renderFace.polygon),
      );
      return `<polygon points="${points}" fill="${fill}"/>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${frameMetrics.canvasWidth} ${frameMetrics.canvasHeight}" width="${frameMetrics.canvasWidth}" height="${frameMetrics.canvasHeight}">${backgroundRect}${renderFacePolygons}</svg>`;
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
    (rowSpan) =>
      rowSpan.y === row &&
      pointX >= rowSpan.startX &&
      pointX < rowSpan.endX + 1,
  );
}
