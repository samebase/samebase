import {
  createLogoRasterProjection,
  LOGO_RASTER_RECURSIVE_FRUSTUM_PADDING,
  type LogoRasterPoint2D as Point2D,
  type LogoRasterProjection as RasterSeamLabProjection,
} from "@/components/logoRasterProjection";
import { type Vector3 } from "@/components/logoRotationMath";

type RasterSeamLabFace = {
  color: string;
  key: string;
  normal: Vector3;
  vertices: readonly [Vector3, Vector3, Vector3, Vector3];
};

type RasterSeamLabDrawItem = {
  center: Vector3;
  depth: number;
  key: string;
};

type AxisIndex = 0 | 1 | 2;

type GridCell = {
  x: number;
  y: number;
  z: number;
};

type GridPoint2D = {
  u: number;
  v: number;
};

type GridRect = {
  u0: number;
  u1: number;
  v0: number;
  v1: number;
};

type GridEdge = {
  from: GridPoint2D;
  to: GridPoint2D;
};

type RasterSeamLabFaceDefinition = {
  color: string;
  key: string;
  neighborOffset: Vector3;
  normal: Vector3;
  planeAxis: AxisIndex;
  getPlaneIndex: (cell: GridCell) => number;
  getRect: (cell: GridCell) => GridRect;
  uAxis: AxisIndex;
  vAxis: AxisIndex;
};

type RasterSeamLabFaceAccumulator = {
  color: string;
  key: string;
  normal: Vector3;
  planeAxis: AxisIndex;
  planeIndex: number;
  rects: GridRect[];
  uAxis: AxisIndex;
  vAxis: AxisIndex;
};

type RasterSeamLabMergedFaceGroup = {
  color: string;
  depth: number;
  key: string;
  loops: readonly (readonly GridPoint2D[])[];
  normal: Vector3;
  planeAxis: AxisIndex;
  planeIndex: number;
  rectCount: number;
  uAxis: AxisIndex;
  vAxis: AxisIndex;
};

export type RasterSeamLabImageKind = "composed" | "mask" | "reference";

export type RasterSeamLabDepth = 1 | 2;

export type RasterSeamLabGridSize = 2 | 3;

export type RasterSeamLabMergeMode =
  | "crisp-source-over"
  | "destination-out-full"
  | "inflated-source-over"
  | "merged-faces"
  | "source-atop-full"
  | "source-atop-single"
  | "source-over";

type RasterSeamLabMergeModeOption = {
  label: string;
  value: RasterSeamLabMergeMode;
};

export type RasterSeamLabResult = {
  coveredPixels: number;
  meanSquaredError: number;
  seamPixels: number;
  stats: RasterSeamLabStats;
};

export type RasterSeamLabStats = {
  baseGridSize: RasterSeamLabGridSize;
  effectiveGridSize: number;
  mergedFaceLoops: number;
  mergedFacePoints: number;
  mergedFaceRects: number;
  occupiedCells: number;
  recursiveTileDraws: number;
};

export const RASTER_SEAM_LAB_DEPTHS = [
  1, 2,
] as const satisfies readonly RasterSeamLabDepth[];

export const RASTER_SEAM_LAB_GRID_SIZES = [
  2, 3,
] as const satisfies readonly RasterSeamLabGridSize[];

export const RASTER_SEAM_LAB_SOURCE_SIZES = [
  18, 24, 32, 48, 96, 144,
] as const satisfies readonly number[];

export const RASTER_SEAM_LAB_SAMPLE_ROTATIONS = [
  0, 13, 22, 37, 45, 61,
] as const satisfies readonly number[];

export const RASTER_SEAM_LAB_MERGE_MODES = [
  {
    label: "Plain",
    value: "source-over",
  },
  {
    label: "Crisp",
    value: "crisp-source-over",
  },
  {
    label: "Inflate",
    value: "inflated-source-over",
  },
  {
    label: "Atop single",
    value: "source-atop-single",
  },
  {
    label: "Atop full",
    value: "source-atop-full",
  },
  {
    label: "Cut full",
    value: "destination-out-full",
  },
  {
    label: "Merged faces",
    value: "merged-faces",
  },
] as const satisfies readonly RasterSeamLabMergeModeOption[];

export const RASTER_SEAM_LAB_DEFAULT_ELEVATION_DEGREES = 22;
export const RASTER_SEAM_LAB_DEFAULT_DEPTH: RasterSeamLabDepth = 1;
export const RASTER_SEAM_LAB_DEFAULT_GRID_SIZE: RasterSeamLabGridSize = 2;
export const RASTER_SEAM_LAB_DEFAULT_MERGE_MODE: RasterSeamLabMergeMode =
  "source-over";
export const RASTER_SEAM_LAB_DEFAULT_ROTATION_DEGREES = 22;
export const RASTER_SEAM_LAB_DEFAULT_SOURCE_SIZE_PX = 24;
export const RASTER_SEAM_LAB_MIN_SOURCE_SIZE_PX = 1;
export const RASTER_SEAM_LAB_SOURCE_SIZE_STEP = 1;
export const RASTER_SEAM_LAB_DEFAULT_INFLATION_SCALE = 1.01;
export const RASTER_SEAM_LAB_MIN_INFLATION_SCALE = 1;
export const RASTER_SEAM_LAB_SLIDER_MAX_INFLATION_SCALE = 1.05;
export const RASTER_SEAM_LAB_INFLATION_SCALE_STEP = 0.001;
export const RASTER_SEAM_LAB_DEFAULT_SPACING_SCALE = 1;
export const RASTER_SEAM_LAB_MIN_SPACING_SCALE = 0;
export const RASTER_SEAM_LAB_SLIDER_MAX_SPACING_SCALE = 2;
export const RASTER_SEAM_LAB_SPACING_SCALE_STEP = 0.001;

export const RASTER_SEAM_LAB_EMPTY_STATS = {
  baseGridSize: RASTER_SEAM_LAB_DEFAULT_GRID_SIZE,
  effectiveGridSize: RASTER_SEAM_LAB_DEFAULT_GRID_SIZE,
  mergedFaceLoops: 0,
  mergedFacePoints: 0,
  mergedFaceRects: 0,
  occupiedCells: 0,
  recursiveTileDraws: 0,
} satisfies RasterSeamLabStats;

const SEAM_ALPHA_THRESHOLD = 230;
const SEAM_COLOR_DISTANCE_THRESHOLD = 70;
const SEAM_MASK_COLOR = [255, 0, 255, 255] as const;
const LAB_BACKGROUND_COLOR = "#ffffff";
const FACE_EDGE_STROKE_SCALE = 512;

const FACE_COLORS = {
  x: "#ff0000",
  y: "#0000ff",
  z: "#00cc00",
} as const;

export function normalizeRasterSeamLabDepth(
  value: number | null | undefined,
): RasterSeamLabDepth {
  return value === 2 ? 2 : RASTER_SEAM_LAB_DEFAULT_DEPTH;
}

export function normalizeRasterSeamLabGridSize(
  value: number | null | undefined,
): RasterSeamLabGridSize {
  return value === 3 ? 3 : RASTER_SEAM_LAB_DEFAULT_GRID_SIZE;
}

export function normalizeRasterSeamLabSourceSizePx(
  value: number | null | undefined,
) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return RASTER_SEAM_LAB_DEFAULT_SOURCE_SIZE_PX;
  }

  return Math.max(RASTER_SEAM_LAB_MIN_SOURCE_SIZE_PX, Math.round(value));
}

export function normalizeRasterSeamLabInflationScale(
  value: number | null | undefined,
) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return RASTER_SEAM_LAB_DEFAULT_INFLATION_SCALE;
  }

  return Math.max(RASTER_SEAM_LAB_MIN_INFLATION_SCALE, value);
}

export function normalizeRasterSeamLabSpacingScale(
  value: number | null | undefined,
) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return RASTER_SEAM_LAB_DEFAULT_SPACING_SCALE;
  }

  return Math.max(RASTER_SEAM_LAB_MIN_SPACING_SCALE, value);
}

const MERGED_FACE_DEFINITIONS = [
  {
    color: FACE_COLORS.x,
    getPlaneIndex: (cell) => cell.x + 1,
    getRect: (cell) => ({
      u0: cell.z,
      u1: cell.z + 1,
      v0: cell.y,
      v1: cell.y + 1,
    }),
    key: "positive-x",
    neighborOffset: [1, 0, 0],
    normal: [1, 0, 0],
    planeAxis: 0,
    uAxis: 2,
    vAxis: 1,
  },
  {
    color: FACE_COLORS.x,
    getPlaneIndex: (cell) => cell.x,
    getRect: (cell) => ({
      u0: cell.z,
      u1: cell.z + 1,
      v0: cell.y,
      v1: cell.y + 1,
    }),
    key: "negative-x",
    neighborOffset: [-1, 0, 0],
    normal: [-1, 0, 0],
    planeAxis: 0,
    uAxis: 2,
    vAxis: 1,
  },
  {
    color: FACE_COLORS.y,
    getPlaneIndex: (cell) => cell.y + 1,
    getRect: (cell) => ({
      u0: cell.x,
      u1: cell.x + 1,
      v0: cell.z,
      v1: cell.z + 1,
    }),
    key: "positive-y",
    neighborOffset: [0, 1, 0],
    normal: [0, 1, 0],
    planeAxis: 1,
    uAxis: 0,
    vAxis: 2,
  },
  {
    color: FACE_COLORS.y,
    getPlaneIndex: (cell) => cell.y,
    getRect: (cell) => ({
      u0: cell.x,
      u1: cell.x + 1,
      v0: cell.z,
      v1: cell.z + 1,
    }),
    key: "negative-y",
    neighborOffset: [0, -1, 0],
    normal: [0, -1, 0],
    planeAxis: 1,
    uAxis: 0,
    vAxis: 2,
  },
  {
    color: FACE_COLORS.z,
    getPlaneIndex: (cell) => cell.z + 1,
    getRect: (cell) => ({
      u0: cell.x,
      u1: cell.x + 1,
      v0: cell.y,
      v1: cell.y + 1,
    }),
    key: "positive-z",
    neighborOffset: [0, 0, 1],
    normal: [0, 0, 1],
    planeAxis: 2,
    uAxis: 0,
    vAxis: 1,
  },
  {
    color: FACE_COLORS.z,
    getPlaneIndex: (cell) => cell.z,
    getRect: (cell) => ({
      u0: cell.x,
      u1: cell.x + 1,
      v0: cell.y,
      v1: cell.y + 1,
    }),
    key: "negative-z",
    neighborOffset: [0, 0, -1],
    normal: [0, 0, -1],
    planeAxis: 2,
    uAxis: 0,
    vAxis: 1,
  },
] as const satisfies readonly RasterSeamLabFaceDefinition[];

function addVectors(left: Vector3, right: Vector3): Vector3 {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

function scaleVector(vector: Vector3, scalar: number): Vector3 {
  return [vector[0] * scalar, vector[1] * scalar, vector[2] * scalar];
}

function dotVectors(left: Vector3, right: Vector3): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function createProjection({
  elevationDegrees,
  rotationDegrees,
  sizePx,
  worldHalfSize,
}: {
  elevationDegrees: number;
  rotationDegrees: number;
  sizePx: number;
  worldHalfSize?: number;
}): RasterSeamLabProjection {
  return createLogoRasterProjection({
    elevationDegrees,
    frustumPadding: LOGO_RASTER_RECURSIVE_FRUSTUM_PADDING,
    rotationAxisMode: "cube-y",
    rotationDegrees,
    sizePx,
    worldHalfSize,
  });
}

function getCubeFaces({
  center,
  halfSize,
}: {
  center: Vector3;
  halfSize: number;
}): readonly RasterSeamLabFace[] {
  const minX = center[0] - halfSize;
  const maxX = center[0] + halfSize;
  const minY = center[1] - halfSize;
  const maxY = center[1] + halfSize;
  const minZ = center[2] - halfSize;
  const maxZ = center[2] + halfSize;

  return [
    {
      color: FACE_COLORS.x,
      key: "positive-x",
      normal: [1, 0, 0],
      vertices: [
        [maxX, minY, minZ],
        [maxX, maxY, minZ],
        [maxX, maxY, maxZ],
        [maxX, minY, maxZ],
      ],
    },
    {
      color: FACE_COLORS.x,
      key: "negative-x",
      normal: [-1, 0, 0],
      vertices: [
        [minX, minY, maxZ],
        [minX, maxY, maxZ],
        [minX, maxY, minZ],
        [minX, minY, minZ],
      ],
    },
    {
      color: FACE_COLORS.y,
      key: "positive-y",
      normal: [0, 1, 0],
      vertices: [
        [minX, maxY, minZ],
        [minX, maxY, maxZ],
        [maxX, maxY, maxZ],
        [maxX, maxY, minZ],
      ],
    },
    {
      color: FACE_COLORS.y,
      key: "negative-y",
      normal: [0, -1, 0],
      vertices: [
        [minX, minY, maxZ],
        [minX, minY, minZ],
        [maxX, minY, minZ],
        [maxX, minY, maxZ],
      ],
    },
    {
      color: FACE_COLORS.z,
      key: "positive-z",
      normal: [0, 0, 1],
      vertices: [
        [minX, minY, maxZ],
        [maxX, minY, maxZ],
        [maxX, maxY, maxZ],
        [minX, maxY, maxZ],
      ],
    },
    {
      color: FACE_COLORS.z,
      key: "negative-z",
      normal: [0, 0, -1],
      vertices: [
        [maxX, minY, minZ],
        [minX, minY, minZ],
        [minX, maxY, minZ],
        [maxX, maxY, minZ],
      ],
    },
  ];
}

function getFaceCenter(face: RasterSeamLabFace): Vector3 {
  return scaleVector(
    face.vertices.reduce<Vector3>(
      (sum, vertex) => addVectors(sum, vertex),
      [0, 0, 0],
    ),
    1 / face.vertices.length,
  );
}

function drawPolygon(
  context: CanvasRenderingContext2D,
  points: readonly Point2D[],
) {
  const [firstPoint, ...remainingPoints] = points;
  context.beginPath();
  context.moveTo(firstPoint.x, firstPoint.y);
  for (const point of remainingPoints) {
    context.lineTo(point.x, point.y);
  }
  context.closePath();
  context.fill();
  context.stroke();
}

function drawProjectedFaces({
  context,
  faces,
  projection,
}: {
  context: CanvasRenderingContext2D;
  faces: readonly RasterSeamLabFace[];
  projection: RasterSeamLabProjection;
}) {
  const projectedFaces = faces
    .map((face) => {
      const rotatedNormal = projection.rotatePoint(face.normal);
      if (dotVectors(rotatedNormal, projection.cameraDirection) <= 0) {
        return null;
      }

      return {
        color: face.color,
        depth: dotVectors(
          projection.rotatePoint(getFaceCenter(face)),
          projection.cameraDirection,
        ),
        key: face.key,
        points: face.vertices.map((vertex) => projection.projectPoint(vertex)),
      };
    })
    .filter((face) => face !== null);

  context.lineJoin = "round";
  context.lineWidth = Math.max(1, projection.sizePx / FACE_EDGE_STROKE_SCALE);
  projectedFaces
    .sort((left, right) => {
      if (left.depth !== right.depth) {
        return left.depth - right.depth;
      }

      return left.key.localeCompare(right.key);
    })
    .forEach((face) => {
      context.fillStyle = face.color;
      context.strokeStyle = face.color;
      drawPolygon(context, face.points);
    });
}

function getFaceColorChannels(
  color: string,
): readonly [number, number, number] {
  if (color === FACE_COLORS.x) {
    return [255, 0, 0];
  }
  if (color === FACE_COLORS.y) {
    return [0, 0, 255];
  }
  if (color === FACE_COLORS.z) {
    return [0, 204, 0];
  }

  return [0, 0, 0];
}

function isPointInsidePolygon(point: Point2D, polygon: readonly Point2D[]) {
  let inside = false;
  for (
    let index = 0, previousIndex = polygon.length - 1;
    index < polygon.length;
    previousIndex = index, index += 1
  ) {
    const current = polygon[index];
    const previous = polygon[previousIndex];
    if (
      current.y > point.y === previous.y > point.y ||
      point.x >=
        ((previous.x - current.x) * (point.y - current.y)) /
          (previous.y - current.y) +
          current.x
    ) {
      continue;
    }

    inside = !inside;
  }

  return inside;
}

function drawProjectedFacesCrisp({
  context,
  faces,
  projection,
}: {
  context: CanvasRenderingContext2D;
  faces: readonly RasterSeamLabFace[];
  projection: RasterSeamLabProjection;
}) {
  const projectedFaces = faces
    .map((face) => {
      const rotatedNormal = projection.rotatePoint(face.normal);
      if (dotVectors(rotatedNormal, projection.cameraDirection) <= 0) {
        return null;
      }

      return {
        color: face.color,
        depth: dotVectors(
          projection.rotatePoint(getFaceCenter(face)),
          projection.cameraDirection,
        ),
        key: face.key,
        points: face.vertices.map((vertex) => projection.projectPoint(vertex)),
      };
    })
    .filter((face) => face !== null)
    .sort((left, right) => {
      if (left.depth !== right.depth) {
        return left.depth - right.depth;
      }

      return left.key.localeCompare(right.key);
    });

  const imageData = context.createImageData(
    projection.sizePx,
    projection.sizePx,
  );

  for (const face of projectedFaces) {
    const redGreenBlue = getFaceColorChannels(face.color);
    const minX = Math.max(
      0,
      Math.floor(Math.min(...face.points.map((point) => point.x))),
    );
    const maxX = Math.min(
      projection.sizePx - 1,
      Math.ceil(Math.max(...face.points.map((point) => point.x))),
    );
    const minY = Math.max(
      0,
      Math.floor(Math.min(...face.points.map((point) => point.y))),
    );
    const maxY = Math.min(
      projection.sizePx - 1,
      Math.ceil(Math.max(...face.points.map((point) => point.y))),
    );

    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        if (!isPointInsidePolygon({ x: x + 0.5, y: y + 0.5 }, face.points)) {
          continue;
        }

        const index = (y * projection.sizePx + x) * 4;
        imageData.data[index] = redGreenBlue[0];
        imageData.data[index + 1] = redGreenBlue[1];
        imageData.data[index + 2] = redGreenBlue[2];
        imageData.data[index + 3] = 255;
      }
    }
  }

  context.putImageData(imageData, 0, 0);
}

function createLabCanvas(sizePx: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = sizePx;
  canvas.height = sizePx;
  return canvas;
}

function createUnitCubeCanvas(
  projection: RasterSeamLabProjection,
  halfSize: number,
) {
  const canvas = createLabCanvas(projection.sizePx);
  const context = canvas.getContext("2d");
  if (!context) {
    return canvas;
  }

  drawProjectedFaces({
    context,
    faces: getCubeFaces({
      center: [0, 0, 0],
      halfSize,
    }),
    projection,
  });
  return canvas;
}

function createCrispUnitCubeCanvas(
  projection: RasterSeamLabProjection,
  halfSize: number,
) {
  const canvas = createLabCanvas(projection.sizePx);
  const context = canvas.getContext("2d");
  if (!context) {
    return canvas;
  }

  drawProjectedFacesCrisp({
    context,
    faces: getCubeFaces({
      center: [0, 0, 0],
      halfSize,
    }),
    projection,
  });
  return canvas;
}

function getGridCoordinate({
  gridSize,
  index,
}: {
  gridSize: number;
  index: number;
}): number {
  return index / gridSize - 0.5;
}

function getGridPointKey(point: GridPoint2D) {
  return `${point.u},${point.v}`;
}

function getGridEdgeKey(from: GridPoint2D, to: GridPoint2D) {
  return `${getGridPointKey(from)}:${getGridPointKey(to)}`;
}

function areGridPointsEqual(left: GridPoint2D, right: GridPoint2D) {
  return left.u === right.u && left.v === right.v;
}

function getGridCellKey(cell: GridCell) {
  return `${cell.x},${cell.y},${cell.z}`;
}

function getGridCells(gridSize: number): GridCell[] {
  const cells: GridCell[] = [];

  for (let x = 0; x < gridSize; x += 1) {
    for (let y = 0; y < gridSize; y += 1) {
      for (let z = 0; z < gridSize; z += 1) {
        cells.push({ x, y, z });
      }
    }
  }

  return cells;
}

function addBoundaryEdge(
  edges: Map<string, GridEdge>,
  from: GridPoint2D,
  to: GridPoint2D,
) {
  // Adjacent cells add the same edge in opposite directions; deleting that pair
  // leaves only the outer loop that should be rasterized.
  const reverseKey = getGridEdgeKey(to, from);
  if (edges.has(reverseKey)) {
    edges.delete(reverseKey);
    return;
  }

  edges.set(getGridEdgeKey(from, to), { from, to });
}

function takeNextBoundaryEdge(
  edges: Map<string, GridEdge>,
  point: GridPoint2D,
): GridEdge | null {
  const pointKey = getGridPointKey(point);
  for (const edge of edges.values()) {
    if (getGridPointKey(edge.from) !== pointKey) {
      continue;
    }

    edges.delete(getGridEdgeKey(edge.from, edge.to));
    return edge;
  }

  return null;
}

function areGridPointsColinear(
  previous: GridPoint2D,
  current: GridPoint2D,
  next: GridPoint2D,
) {
  return (
    (previous.u === current.u && current.u === next.u) ||
    (previous.v === current.v && current.v === next.v)
  );
}

function simplifyGridLoop(loop: readonly GridPoint2D[]) {
  if (loop.length <= 3) {
    return [...loop];
  }

  return loop.filter((point, index) => {
    const previous = loop[(index + loop.length - 1) % loop.length];
    const next = loop[(index + 1) % loop.length];
    return !areGridPointsColinear(previous, point, next);
  });
}

function getMergedRectLoops(rects: readonly GridRect[]) {
  const edges = new Map<string, GridEdge>();
  for (const rect of rects) {
    const bottomLeft = { u: rect.u0, v: rect.v0 };
    const bottomRight = { u: rect.u1, v: rect.v0 };
    const topRight = { u: rect.u1, v: rect.v1 };
    const topLeft = { u: rect.u0, v: rect.v1 };

    addBoundaryEdge(edges, bottomLeft, bottomRight);
    addBoundaryEdge(edges, bottomRight, topRight);
    addBoundaryEdge(edges, topRight, topLeft);
    addBoundaryEdge(edges, topLeft, bottomLeft);
  }

  const loops: GridPoint2D[][] = [];
  while (edges.size > 0) {
    const firstEdge = edges.values().next().value;
    if (!firstEdge) {
      break;
    }

    edges.delete(getGridEdgeKey(firstEdge.from, firstEdge.to));
    const loop = [firstEdge.from];
    let currentPoint = firstEdge.to;

    while (!areGridPointsEqual(currentPoint, firstEdge.from)) {
      loop.push(currentPoint);
      const nextEdge = takeNextBoundaryEdge(edges, currentPoint);
      if (!nextEdge) {
        break;
      }

      currentPoint = nextEdge.to;
    }

    const simplifiedLoop = simplifyGridLoop(loop);
    if (simplifiedLoop.length >= 3) {
      loops.push(simplifiedLoop);
    }
  }

  return loops;
}

function createWorldGridPoint({
  gridSize,
  planeAxis,
  planeIndex,
  point,
  uAxis,
  vAxis,
}: {
  gridSize: number;
  planeAxis: AxisIndex;
  planeIndex: number;
  point: GridPoint2D;
  uAxis: AxisIndex;
  vAxis: AxisIndex;
}): Vector3 {
  const planeCoordinate = getGridCoordinate({ gridSize, index: planeIndex });
  const uCoordinate = getGridCoordinate({ gridSize, index: point.u });
  const vCoordinate = getGridCoordinate({ gridSize, index: point.v });
  const getCoordinate = (axis: AxisIndex) => {
    if (axis === planeAxis) {
      return planeCoordinate;
    }
    if (axis === uAxis) {
      return uCoordinate;
    }
    if (axis === vAxis) {
      return vCoordinate;
    }

    return 0;
  };

  return [getCoordinate(0), getCoordinate(1), getCoordinate(2)];
}

function getRectCenter({
  gridSize,
  planeAxis,
  planeIndex,
  rect,
  uAxis,
  vAxis,
}: {
  gridSize: number;
  planeAxis: AxisIndex;
  planeIndex: number;
  rect: GridRect;
  uAxis: AxisIndex;
  vAxis: AxisIndex;
}): Vector3 {
  return createWorldGridPoint({
    gridSize,
    planeAxis,
    planeIndex,
    point: {
      u: (rect.u0 + rect.u1) / 2,
      v: (rect.v0 + rect.v1) / 2,
    },
    uAxis,
    vAxis,
  });
}

function getMergedFaceGroups({
  gridSize,
  projection,
}: {
  gridSize: number;
  projection: RasterSeamLabProjection;
}): RasterSeamLabMergedFaceGroup[] {
  const cells = getGridCells(gridSize);
  const occupiedCellKeys = new Set(cells.map((cell) => getGridCellKey(cell)));
  const groups = new Map<string, RasterSeamLabFaceAccumulator>();

  for (const cell of cells) {
    for (const faceDefinition of MERGED_FACE_DEFINITIONS) {
      const neighbor = {
        x: cell.x + faceDefinition.neighborOffset[0],
        y: cell.y + faceDefinition.neighborOffset[1],
        z: cell.z + faceDefinition.neighborOffset[2],
      };
      if (occupiedCellKeys.has(getGridCellKey(neighbor))) {
        continue;
      }

      const planeIndex = faceDefinition.getPlaneIndex(cell);
      const groupKey = `${faceDefinition.key}:${planeIndex}`;
      const existingGroup = groups.get(groupKey);
      if (existingGroup) {
        existingGroup.rects.push(faceDefinition.getRect(cell));
        continue;
      }

      groups.set(groupKey, {
        color: faceDefinition.color,
        key: groupKey,
        normal: faceDefinition.normal,
        planeAxis: faceDefinition.planeAxis,
        planeIndex,
        rects: [faceDefinition.getRect(cell)],
        uAxis: faceDefinition.uAxis,
        vAxis: faceDefinition.vAxis,
      });
    }
  }

  return Array.from(groups.values())
    .map((group) => {
      const rotatedNormal = projection.rotatePoint(group.normal);
      if (dotVectors(rotatedNormal, projection.cameraDirection) <= 0) {
        return null;
      }

      const depth =
        group.rects.reduce((totalDepth, rect) => {
          const rectCenter = getRectCenter({
            gridSize,
            planeAxis: group.planeAxis,
            planeIndex: group.planeIndex,
            rect,
            uAxis: group.uAxis,
            vAxis: group.vAxis,
          });
          return (
            totalDepth +
            dotVectors(
              projection.rotatePoint(rectCenter),
              projection.cameraDirection,
            )
          );
        }, 0) / group.rects.length;

      return {
        color: group.color,
        depth,
        key: group.key,
        loops: getMergedRectLoops(group.rects),
        normal: group.normal,
        planeAxis: group.planeAxis,
        planeIndex: group.planeIndex,
        rectCount: group.rects.length,
        uAxis: group.uAxis,
        vAxis: group.vAxis,
      };
    })
    .filter((group) => group !== null)
    .sort((left, right) => {
      if (left.depth !== right.depth) {
        return left.depth - right.depth;
      }

      return left.key.localeCompare(right.key);
    });
}

function drawMergedFaceGroup({
  context,
  gridSize,
  group,
  halfSize,
  projection,
}: {
  context: CanvasRenderingContext2D;
  gridSize: number;
  group: RasterSeamLabMergedFaceGroup;
  halfSize: number;
  projection: RasterSeamLabProjection;
}) {
  context.beginPath();
  for (const loop of group.loops) {
    const [firstPoint, ...remainingPoints] = loop;
    const projectedFirstPoint = projection.projectPoint(
      scaleVector(
        createWorldGridPoint({
          gridSize,
          planeAxis: group.planeAxis,
          planeIndex: group.planeIndex,
          point: firstPoint,
          uAxis: group.uAxis,
          vAxis: group.vAxis,
        }),
        halfSize * 2,
      ),
    );
    context.moveTo(projectedFirstPoint.x, projectedFirstPoint.y);

    for (const point of remainingPoints) {
      const projectedPoint = projection.projectPoint(
        scaleVector(
          createWorldGridPoint({
            gridSize,
            planeAxis: group.planeAxis,
            planeIndex: group.planeIndex,
            point,
            uAxis: group.uAxis,
            vAxis: group.vAxis,
          }),
          halfSize * 2,
        ),
      );
      context.lineTo(projectedPoint.x, projectedPoint.y);
    }

    context.closePath();
  }
  context.fill();
}

function renderMergedFacesImage({
  gridSize,
  halfSize,
  projection,
}: {
  gridSize: number;
  halfSize: number;
  projection: RasterSeamLabProjection;
}) {
  const canvas = createLabCanvas(projection.sizePx);
  const context = canvas.getContext("2d");
  if (!context) {
    return canvas;
  }

  for (const group of getMergedFaceGroups({ gridSize, projection })) {
    context.fillStyle = group.color;
    drawMergedFaceGroup({ context, gridSize, group, halfSize, projection });
  }

  return canvas;
}

function getCellCenter({
  gridSize,
  halfSize,
  x,
  y,
  z,
}: {
  gridSize: number;
  halfSize: number;
  x: number;
  y: number;
  z: number;
}): Vector3 {
  const size = halfSize * 2;
  return [
    ((x + 0.5) / gridSize) * size - halfSize,
    ((y + 0.5) / gridSize) * size - halfSize,
    ((z + 0.5) / gridSize) * size - halfSize,
  ];
}

function getSpacedGridHalfSize({
  gridSize,
  halfSize,
  spacingScale,
}: {
  gridSize: number;
  halfSize: number;
  spacingScale: number;
}) {
  const cellHalfSize = halfSize / gridSize;
  return (
    cellHalfSize +
    (halfSize - cellHalfSize) * normalizeRasterSeamLabSpacingScale(spacingScale)
  );
}

function getDrawItems({
  gridSize,
  halfSize,
  projection,
  spacingScale,
}: {
  gridSize: number;
  halfSize: number;
  projection: RasterSeamLabProjection;
  spacingScale: number;
}): RasterSeamLabDrawItem[] {
  const drawItems: RasterSeamLabDrawItem[] = [];
  const normalizedSpacingScale =
    normalizeRasterSeamLabSpacingScale(spacingScale);

  for (let x = 0; x < gridSize; x += 1) {
    for (let y = 0; y < gridSize; y += 1) {
      for (let z = 0; z < gridSize; z += 1) {
        const center = scaleVector(
          getCellCenter({ gridSize, halfSize, x, y, z }),
          normalizedSpacingScale,
        );
        drawItems.push({
          center,
          depth: dotVectors(
            projection.rotatePoint(center),
            projection.cameraDirection,
          ),
          key: `${x},${y},${z}`,
        });
      }
    }
  }

  return drawItems.sort((left, right) => {
    if (left.depth !== right.depth) {
      return left.depth - right.depth;
    }

    return left.key.localeCompare(right.key);
  });
}

function renderComposedImage({
  childCanvas,
  gridSize,
  halfSize,
  projection,
  spacingScale,
}: {
  childCanvas: HTMLCanvasElement;
  gridSize: number;
  halfSize: number;
  projection: RasterSeamLabProjection;
  spacingScale: number;
}) {
  const canvas = createLabCanvas(projection.sizePx);
  const context = canvas.getContext("2d");
  if (!context) {
    return canvas;
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  for (const item of getDrawItems({
    gridSize,
    halfSize,
    projection,
    spacingScale,
  })) {
    const offset = projection.projectVector(item.center);
    context.drawImage(childCanvas, offset.x, offset.y);
  }

  return canvas;
}

function renderCrispComposedImage({
  childCanvas,
  gridSize,
  halfSize,
  projection,
  spacingScale,
}: {
  childCanvas: HTMLCanvasElement;
  gridSize: number;
  halfSize: number;
  projection: RasterSeamLabProjection;
  spacingScale: number;
}) {
  const canvas = createLabCanvas(projection.sizePx);
  const context = canvas.getContext("2d");
  if (!context) {
    return canvas;
  }

  context.imageSmoothingEnabled = false;
  for (const item of getDrawItems({
    gridSize,
    halfSize,
    projection,
    spacingScale,
  })) {
    const offset = projection.projectVector(item.center);
    context.drawImage(childCanvas, Math.round(offset.x), Math.round(offset.y));
  }

  return canvas;
}

function renderInflatedComposedImage({
  childCanvas,
  gridSize,
  halfSize,
  inflationScale,
  projection,
  spacingScale,
}: {
  childCanvas: HTMLCanvasElement;
  gridSize: number;
  halfSize: number;
  inflationScale: number;
  projection: RasterSeamLabProjection;
  spacingScale: number;
}) {
  const canvas = createLabCanvas(projection.sizePx);
  const context = canvas.getContext("2d");
  if (!context) {
    return canvas;
  }

  const inflatedSize = childCanvas.width * inflationScale;
  const inflatedOffset = (inflatedSize - childCanvas.width) / 2;

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  getDrawItems({ gridSize, halfSize, projection, spacingScale }).forEach(
    (item, index) => {
      const offset = projection.projectVector(item.center);
      if (index === 0) {
        context.drawImage(childCanvas, offset.x, offset.y);
        return;
      }

      context.drawImage(
        childCanvas,
        offset.x - inflatedOffset,
        offset.y - inflatedOffset,
        inflatedSize,
        inflatedSize,
      );
    },
  );

  return canvas;
}

function getDrawImageOffset(
  projection: RasterSeamLabProjection,
  item: RasterSeamLabDrawItem,
): Point2D {
  return projection.projectVector(item.center);
}

function hasCanvasOverlap({
  left,
  right,
  sizePx,
}: {
  left: Point2D;
  right: Point2D;
  sizePx: number;
}) {
  return (
    left.x < right.x + sizePx &&
    left.x + sizePx > right.x &&
    left.y < right.y + sizePx &&
    left.y + sizePx > right.y
  );
}

function getNearerOverlappingItems({
  currentIndex,
  items,
  offsets,
  sizePx,
}: {
  currentIndex: number;
  items: readonly RasterSeamLabDrawItem[];
  offsets: readonly Point2D[];
  sizePx: number;
}) {
  const currentOffset = offsets[currentIndex];
  return items.slice(currentIndex + 1).filter((_, parentIndex) =>
    hasCanvasOverlap({
      left: currentOffset,
      right: offsets[currentIndex + parentIndex + 1],
      sizePx,
    }),
  );
}

function renderSingleCompositeImage({
  canvasOperation,
  childCanvas,
  gridSize,
  halfSize,
  projection,
  spacingScale,
}: {
  canvasOperation: GlobalCompositeOperation;
  childCanvas: HTMLCanvasElement;
  gridSize: number;
  halfSize: number;
  projection: RasterSeamLabProjection;
  spacingScale: number;
}) {
  const canvas = createLabCanvas(projection.sizePx);
  const context = canvas.getContext("2d");
  if (!context) {
    return canvas;
  }

  const items = getDrawItems({ gridSize, halfSize, projection, spacingScale });
  const offsets = items.map((item) => getDrawImageOffset(projection, item));
  const magicCanvas = createLabCanvas(projection.sizePx);
  const magicContext = magicCanvas.getContext("2d");
  if (!magicContext) {
    return canvas;
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  for (const [itemIndex] of items.entries()) {
    const offset = offsets[itemIndex];
    magicContext.clearRect(0, 0, magicCanvas.width, magicCanvas.height);
    magicContext.globalCompositeOperation = "source-over";
    magicContext.drawImage(childCanvas, 0, 0);
    magicContext.globalCompositeOperation = canvasOperation;

    for (const parentItem of getNearerOverlappingItems({
      currentIndex: itemIndex,
      items,
      offsets,
      sizePx: projection.sizePx,
    })) {
      const parentOffset = getDrawImageOffset(projection, parentItem);
      magicContext.drawImage(
        childCanvas,
        parentOffset.x - offset.x,
        parentOffset.y - offset.y,
      );
    }

    context.drawImage(magicCanvas, offset.x, offset.y);
  }

  return canvas;
}

function renderFullCompositeImage({
  canvasOperation,
  childCanvas,
  gridSize,
  halfSize,
  projection,
  spacingScale,
}: {
  canvasOperation: GlobalCompositeOperation;
  childCanvas: HTMLCanvasElement;
  gridSize: number;
  halfSize: number;
  projection: RasterSeamLabProjection;
  spacingScale: number;
}) {
  const canvas = createLabCanvas(projection.sizePx);
  const context = canvas.getContext("2d");
  if (!context) {
    return canvas;
  }

  const items = getDrawItems({ gridSize, halfSize, projection, spacingScale });
  const offsets = items.map((item) => getDrawImageOffset(projection, item));
  const stagePaddingPx = projection.sizePx;
  const stageSizePx = projection.sizePx + stagePaddingPx * 2;
  const magicCanvas = createLabCanvas(stageSizePx);
  const magicContext = magicCanvas.getContext("2d");
  if (!magicContext) {
    return canvas;
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  for (const [itemIndex] of items.entries()) {
    const offset = offsets[itemIndex];
    const stageOffset = {
      x: offset.x + stagePaddingPx,
      y: offset.y + stagePaddingPx,
    };
    magicContext.clearRect(0, 0, magicCanvas.width, magicCanvas.height);
    magicContext.globalCompositeOperation = "source-over";
    magicContext.drawImage(childCanvas, stageOffset.x, stageOffset.y);
    magicContext.globalCompositeOperation = canvasOperation;

    for (const parentItem of getNearerOverlappingItems({
      currentIndex: itemIndex,
      items,
      offsets,
      sizePx: projection.sizePx,
    })) {
      const parentOffset = getDrawImageOffset(projection, parentItem);
      magicContext.drawImage(
        childCanvas,
        parentOffset.x + stagePaddingPx,
        parentOffset.y + stagePaddingPx,
      );
    }

    context.drawImage(
      magicCanvas,
      stageOffset.x,
      stageOffset.y,
      projection.sizePx,
      projection.sizePx,
      offset.x,
      offset.y,
      projection.sizePx,
      projection.sizePx,
    );
  }

  return canvas;
}

function renderRecursiveComposedImage({
  depth,
  gridSize,
  halfSize,
  projection,
  spacingScale,
}: {
  depth: number;
  gridSize: number;
  halfSize: number;
  projection: RasterSeamLabProjection;
  spacingScale: number;
}): HTMLCanvasElement {
  if (depth <= 0) {
    return createUnitCubeCanvas(projection, halfSize);
  }

  const childCanvas = renderRecursiveComposedImage({
    depth: depth - 1,
    gridSize,
    halfSize: halfSize / gridSize,
    projection,
    spacingScale,
  });
  return renderComposedImage({
    childCanvas,
    gridSize,
    halfSize,
    projection,
    spacingScale,
  });
}

function renderRecursiveCrispComposedImage({
  depth,
  gridSize,
  halfSize,
  projection,
  spacingScale,
}: {
  depth: number;
  gridSize: number;
  halfSize: number;
  projection: RasterSeamLabProjection;
  spacingScale: number;
}): HTMLCanvasElement {
  if (depth <= 0) {
    return createCrispUnitCubeCanvas(projection, halfSize);
  }

  const childCanvas = renderRecursiveCrispComposedImage({
    depth: depth - 1,
    gridSize,
    halfSize: halfSize / gridSize,
    projection,
    spacingScale,
  });
  return renderCrispComposedImage({
    childCanvas,
    gridSize,
    halfSize,
    projection,
    spacingScale,
  });
}

function renderRecursiveInflatedComposedImage({
  depth,
  gridSize,
  halfSize,
  inflationScale,
  projection,
  spacingScale,
}: {
  depth: number;
  gridSize: number;
  halfSize: number;
  inflationScale: number;
  projection: RasterSeamLabProjection;
  spacingScale: number;
}): HTMLCanvasElement {
  if (depth <= 0) {
    return createUnitCubeCanvas(projection, halfSize);
  }

  const childCanvas = renderRecursiveInflatedComposedImage({
    depth: depth - 1,
    gridSize,
    halfSize: halfSize / gridSize,
    inflationScale,
    projection,
    spacingScale,
  });
  return renderInflatedComposedImage({
    childCanvas,
    gridSize,
    halfSize,
    inflationScale,
    projection,
    spacingScale,
  });
}

function renderRecursiveSingleCompositeImage({
  canvasOperation,
  depth,
  gridSize,
  halfSize,
  projection,
  spacingScale,
}: {
  canvasOperation: GlobalCompositeOperation;
  depth: number;
  gridSize: number;
  halfSize: number;
  projection: RasterSeamLabProjection;
  spacingScale: number;
}): HTMLCanvasElement {
  if (depth <= 0) {
    return createUnitCubeCanvas(projection, halfSize);
  }

  const childCanvas = renderRecursiveSingleCompositeImage({
    canvasOperation,
    depth: depth - 1,
    gridSize,
    halfSize: halfSize / gridSize,
    projection,
    spacingScale,
  });
  return renderSingleCompositeImage({
    canvasOperation,
    childCanvas,
    gridSize,
    halfSize,
    projection,
    spacingScale,
  });
}

function renderRecursiveFullCompositeImage({
  canvasOperation,
  depth,
  gridSize,
  halfSize,
  projection,
  spacingScale,
}: {
  canvasOperation: GlobalCompositeOperation;
  depth: number;
  gridSize: number;
  halfSize: number;
  projection: RasterSeamLabProjection;
  spacingScale: number;
}): HTMLCanvasElement {
  if (depth <= 0) {
    return createUnitCubeCanvas(projection, halfSize);
  }

  const childCanvas = renderRecursiveFullCompositeImage({
    canvasOperation,
    depth: depth - 1,
    gridSize,
    halfSize: halfSize / gridSize,
    projection,
    spacingScale,
  });
  return renderFullCompositeImage({
    canvasOperation,
    childCanvas,
    gridSize,
    halfSize,
    projection,
    spacingScale,
  });
}

function getEffectiveGridSize({
  depth,
  gridSize,
}: {
  depth: RasterSeamLabDepth;
  gridSize: RasterSeamLabGridSize;
}) {
  return gridSize ** depth;
}

function getRasterSeamLabStats({
  depth,
  gridSize,
  projection,
}: {
  depth: RasterSeamLabDepth;
  gridSize: RasterSeamLabGridSize;
  projection: RasterSeamLabProjection;
}): RasterSeamLabStats {
  const effectiveGridSize = getEffectiveGridSize({ depth, gridSize });
  const visibleMergedFaceGroups = getMergedFaceGroups({
    gridSize: effectiveGridSize,
    projection,
  });

  return {
    baseGridSize: gridSize,
    effectiveGridSize,
    mergedFaceLoops: visibleMergedFaceGroups.reduce(
      (totalLoops, group) => totalLoops + group.loops.length,
      0,
    ),
    mergedFacePoints: visibleMergedFaceGroups.reduce(
      (totalPoints, group) =>
        totalPoints +
        group.loops.reduce((groupPoints, loop) => groupPoints + loop.length, 0),
      0,
    ),
    mergedFaceRects: visibleMergedFaceGroups.reduce(
      (totalRects, group) => totalRects + group.rectCount,
      0,
    ),
    occupiedCells: effectiveGridSize ** 3,
    recursiveTileDraws: depth * gridSize ** 3,
  };
}

export function getLogoRasterSeamLabStats({
  depth,
  elevationDegrees,
  gridSize,
  rotationDegrees,
  sourceSizePx,
}: {
  depth: RasterSeamLabDepth;
  elevationDegrees: number;
  gridSize: RasterSeamLabGridSize;
  rotationDegrees: number;
  sourceSizePx: number;
}): RasterSeamLabStats {
  return getRasterSeamLabStats({
    depth,
    gridSize,
    projection: createProjection({
      elevationDegrees,
      rotationDegrees,
      sizePx: normalizeRasterSeamLabSourceSizePx(sourceSizePx),
    }),
  });
}

function renderMergedImage({
  depth,
  gridSize,
  inflationScale,
  mergeMode,
  projection,
  spacingScale,
}: {
  depth: RasterSeamLabDepth;
  gridSize: RasterSeamLabGridSize;
  inflationScale: number;
  mergeMode: RasterSeamLabMergeMode;
  projection: RasterSeamLabProjection;
  spacingScale: number;
}): HTMLCanvasElement {
  switch (mergeMode) {
    case "source-over":
      return renderRecursiveComposedImage({
        depth,
        gridSize,
        halfSize: 0.5,
        projection,
        spacingScale,
      });
    case "crisp-source-over":
      return renderRecursiveCrispComposedImage({
        depth,
        gridSize,
        halfSize: 0.5,
        projection,
        spacingScale,
      });
    case "inflated-source-over":
      return renderRecursiveInflatedComposedImage({
        depth,
        gridSize,
        halfSize: 0.5,
        inflationScale,
        projection,
        spacingScale,
      });
    case "source-atop-single":
      return renderRecursiveSingleCompositeImage({
        canvasOperation: "source-atop",
        depth,
        gridSize,
        halfSize: 0.5,
        projection,
        spacingScale,
      });
    case "source-atop-full":
      return renderRecursiveFullCompositeImage({
        canvasOperation: "source-atop",
        depth,
        gridSize,
        halfSize: 0.5,
        projection,
        spacingScale,
      });
    case "destination-out-full":
      return renderRecursiveFullCompositeImage({
        canvasOperation: "destination-out",
        depth,
        gridSize,
        halfSize: 0.5,
        projection,
        spacingScale,
      });
    case "merged-faces": {
      const effectiveGridSize = getEffectiveGridSize({ depth, gridSize });
      return renderMergedFacesImage({
        gridSize: effectiveGridSize,
        halfSize: getSpacedGridHalfSize({
          gridSize: effectiveGridSize,
          halfSize: 0.5,
          spacingScale,
        }),
        projection,
      });
    }
    default:
      mergeMode satisfies never;
      throw new Error("Unsupported raster seam lab merge mode.");
  }
}

function renderReferenceImage({
  depth,
  gridSize,
  mergeMode,
  projection,
  spacingScale,
}: {
  depth: RasterSeamLabDepth;
  gridSize: RasterSeamLabGridSize;
  mergeMode: RasterSeamLabMergeMode;
  projection: RasterSeamLabProjection;
  spacingScale: number;
}) {
  const canvas = createLabCanvas(projection.sizePx);
  const context = canvas.getContext("2d");
  if (!context) {
    return canvas;
  }

  const halfSize = getSpacedGridHalfSize({
    gridSize: getEffectiveGridSize({ depth, gridSize }),
    halfSize: 0.5,
    spacingScale,
  });

  if (mergeMode === "crisp-source-over") {
    drawProjectedFacesCrisp({
      context,
      faces: getCubeFaces({
        center: [0, 0, 0],
        halfSize,
      }),
      projection,
    });
    return canvas;
  }

  if (mergeMode === "merged-faces") {
    return renderMergedFacesImage({ gridSize: 1, halfSize, projection });
  }

  drawProjectedFaces({
    context,
    faces: getCubeFaces({
      center: [0, 0, 0],
      halfSize,
    }),
    projection,
  });
  return canvas;
}

function getImageData(canvas: HTMLCanvasElement): ImageData | null {
  const context = canvas.getContext("2d", {
    willReadFrequently: true,
  });
  if (!context) {
    return null;
  }

  return context.getImageData(0, 0, canvas.width, canvas.height);
}

function getColorDistance(
  left: Uint8ClampedArray,
  right: Uint8ClampedArray,
  leftIndex: number,
  rightIndex: number,
) {
  return Math.max(
    Math.abs(left[leftIndex] - right[rightIndex]),
    Math.abs(left[leftIndex + 1] - right[rightIndex + 1]),
    Math.abs(left[leftIndex + 2] - right[rightIndex + 2]),
  );
}

function measureSeams({
  composedCanvas,
  referenceCanvas,
}: {
  composedCanvas: HTMLCanvasElement;
  referenceCanvas: HTMLCanvasElement;
}): RasterSeamLabResult {
  const composedImageData = getImageData(composedCanvas);
  const referenceImageData = getImageData(referenceCanvas);
  if (!composedImageData || !referenceImageData) {
    return {
      coveredPixels: 0,
      meanSquaredError: 0,
      seamPixels: 0,
      stats: RASTER_SEAM_LAB_EMPTY_STATS,
    };
  }

  let coveredPixels = 0;
  let squaredError = 0;
  let seamPixels = 0;

  for (let index = 0; index < referenceImageData.data.length; index += 4) {
    if (referenceImageData.data[index + 3] < SEAM_ALPHA_THRESHOLD) {
      continue;
    }

    coveredPixels += 1;
    const redDelta =
      composedImageData.data[index] - referenceImageData.data[index];
    const greenDelta =
      composedImageData.data[index + 1] - referenceImageData.data[index + 1];
    const blueDelta =
      composedImageData.data[index + 2] - referenceImageData.data[index + 2];
    const alphaDelta =
      composedImageData.data[index + 3] - referenceImageData.data[index + 3];
    squaredError +=
      redDelta * redDelta +
      greenDelta * greenDelta +
      blueDelta * blueDelta +
      alphaDelta * alphaDelta;

    if (
      composedImageData.data[index + 3] < SEAM_ALPHA_THRESHOLD ||
      getColorDistance(
        composedImageData.data,
        referenceImageData.data,
        index,
        index,
      ) > SEAM_COLOR_DISTANCE_THRESHOLD
    ) {
      seamPixels += 1;
    }
  }

  const maxSquaredError = coveredPixels * 4 * 255 * 255;
  return {
    coveredPixels,
    meanSquaredError: maxSquaredError > 0 ? squaredError / maxSquaredError : 0,
    seamPixels,
    stats: RASTER_SEAM_LAB_EMPTY_STATS,
  };
}

function drawCanvasOnWhite({
  context,
  image,
}: {
  context: CanvasRenderingContext2D;
  image: HTMLCanvasElement;
}) {
  context.clearRect(0, 0, image.width, image.height);
  context.fillStyle = LAB_BACKGROUND_COLOR;
  context.fillRect(0, 0, image.width, image.height);
  context.drawImage(image, 0, 0);
}

function drawSeamMask({
  composedCanvas,
  context,
  referenceCanvas,
}: {
  composedCanvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  referenceCanvas: HTMLCanvasElement;
}) {
  drawCanvasOnWhite({ context, image: composedCanvas });

  const composedImageData = getImageData(composedCanvas);
  const referenceImageData = getImageData(referenceCanvas);
  if (!composedImageData || !referenceImageData) {
    return;
  }

  const maskImageData = context.getImageData(
    0,
    0,
    composedCanvas.width,
    composedCanvas.height,
  );
  for (let index = 0; index < referenceImageData.data.length; index += 4) {
    if (referenceImageData.data[index + 3] < SEAM_ALPHA_THRESHOLD) {
      continue;
    }

    if (
      composedImageData.data[index + 3] >= SEAM_ALPHA_THRESHOLD &&
      getColorDistance(
        composedImageData.data,
        referenceImageData.data,
        index,
        index,
      ) <= SEAM_COLOR_DISTANCE_THRESHOLD
    ) {
      continue;
    }

    maskImageData.data[index] = SEAM_MASK_COLOR[0];
    maskImageData.data[index + 1] = SEAM_MASK_COLOR[1];
    maskImageData.data[index + 2] = SEAM_MASK_COLOR[2];
    maskImageData.data[index + 3] = SEAM_MASK_COLOR[3];
  }

  context.putImageData(maskImageData, 0, 0);
}

export function drawLogoRasterSeamLabImage(
  context: CanvasRenderingContext2D,
  {
    depth,
    elevationDegrees,
    gridSize,
    imageKind,
    inflationScale,
    mergeMode,
    rotationDegrees,
    spacingScale,
    sourceSizePx,
  }: {
    depth: RasterSeamLabDepth;
    elevationDegrees: number;
    gridSize: RasterSeamLabGridSize;
    imageKind: RasterSeamLabImageKind;
    inflationScale: number;
    mergeMode: RasterSeamLabMergeMode;
    rotationDegrees: number;
    spacingScale: number;
    sourceSizePx: number;
  },
): RasterSeamLabResult {
  const normalizedSourceSizePx =
    normalizeRasterSeamLabSourceSizePx(sourceSizePx);
  const normalizedSpacingScale =
    normalizeRasterSeamLabSpacingScale(spacingScale);
  const worldHalfSize = getSpacedGridHalfSize({
    gridSize: getEffectiveGridSize({ depth, gridSize }),
    halfSize: 0.5,
    spacingScale: normalizedSpacingScale,
  });
  const projection = createProjection({
    elevationDegrees,
    rotationDegrees,
    sizePx: normalizedSourceSizePx,
    worldHalfSize,
  });
  const composedCanvas = renderMergedImage({
    depth,
    gridSize,
    inflationScale: normalizeRasterSeamLabInflationScale(inflationScale),
    mergeMode,
    projection,
    spacingScale: normalizedSpacingScale,
  });
  const referenceCanvas = renderReferenceImage({
    depth,
    gridSize,
    mergeMode,
    projection,
    spacingScale: normalizedSpacingScale,
  });
  const seamResult = {
    ...measureSeams({ composedCanvas, referenceCanvas }),
    stats: getRasterSeamLabStats({ depth, gridSize, projection }),
  };

  if (context.canvas.width !== normalizedSourceSizePx) {
    context.canvas.width = normalizedSourceSizePx;
  }
  if (context.canvas.height !== normalizedSourceSizePx) {
    context.canvas.height = normalizedSourceSizePx;
  }
  context.imageSmoothingEnabled = false;

  if (imageKind === "reference") {
    drawCanvasOnWhite({ context, image: referenceCanvas });
    return seamResult;
  }

  if (imageKind === "mask") {
    drawSeamMask({ composedCanvas, context, referenceCanvas });
    return seamResult;
  }

  drawCanvasOnWhite({ context, image: composedCanvas });
  return seamResult;
}
