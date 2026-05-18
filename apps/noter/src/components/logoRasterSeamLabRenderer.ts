import {
  getWorldCameraVector,
  getWorldScreenVerticalAxis,
  toRenderedRotationDegrees,
  type Vector3,
} from "@/components/logoRotationMath";

type Point2D = {
  x: number;
  y: number;
};

type ProjectedPoint = Point2D & {
  depth: number;
};

type RasterSeamLabProjection = {
  cameraDirection: Vector3;
  centerPx: number;
  projectPoint: (point: Vector3) => ProjectedPoint;
  projectVector: (point: Vector3) => Point2D;
  rotatePoint: (point: Vector3) => Vector3;
  scalePx: number;
  sizePx: number;
};

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
  uAxis: AxisIndex;
  vAxis: AxisIndex;
};

export type RasterSeamLabImageKind = "composed" | "mask" | "reference";

export type RasterSeamLabMergeMode =
  | "destination-out-full"
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
  seamPixels: number;
};

export const RASTER_SEAM_LAB_SOURCE_SIZES = [
  18, 24, 32, 48,
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
export const RASTER_SEAM_LAB_DEFAULT_MERGE_MODE: RasterSeamLabMergeMode =
  "source-over";
export const RASTER_SEAM_LAB_DEFAULT_ROTATION_DEGREES = 22;
export const RASTER_SEAM_LAB_DEFAULT_SOURCE_SIZE_PX = 24;

const GRID_SIZE = 2;
const CELL_SIZE = 1 / GRID_SIZE;
const CELL_HALF_SIZE = CELL_SIZE / 2;
const FRUSTUM_PADDING = 1.08;
const SEAM_ALPHA_THRESHOLD = 230;
const SEAM_COLOR_DISTANCE_THRESHOLD = 70;
const SEAM_MASK_COLOR = [255, 0, 255, 255] as const;
const LAB_BACKGROUND_COLOR = "#ffffff";

const FACE_COLORS = {
  x: "#ff0000",
  y: "#0000ff",
  z: "#00cc00",
} as const;

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

const BLOCK_CORNERS = [
  [-0.5, -0.5, -0.5],
  [-0.5, -0.5, 0.5],
  [-0.5, 0.5, -0.5],
  [-0.5, 0.5, 0.5],
  [0.5, -0.5, -0.5],
  [0.5, -0.5, 0.5],
  [0.5, 0.5, -0.5],
  [0.5, 0.5, 0.5],
] as const satisfies readonly Vector3[];

function addVectors(left: Vector3, right: Vector3): Vector3 {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

function scaleVector(vector: Vector3, scalar: number): Vector3 {
  return [vector[0] * scalar, vector[1] * scalar, vector[2] * scalar];
}

function dotVectors(left: Vector3, right: Vector3): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function crossVectors(left: Vector3, right: Vector3): Vector3 {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function normalizeVector(vector: Vector3): Vector3 {
  const length = Math.hypot(vector[0], vector[1], vector[2]);
  if (length === 0) {
    return [0, 0, 0];
  }

  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function rotateVectorY(vector: Vector3, rotationDegrees: number): Vector3 {
  const radians = (rotationDegrees * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return [
    vector[0] * cosine + vector[2] * sine,
    vector[1],
    -vector[0] * sine + vector[2] * cosine,
  ];
}

function getProjectionSpan({
  projectionAxis,
  rotationDegrees,
}: {
  projectionAxis: Vector3;
  rotationDegrees: number;
}): number {
  let minValue = Number.POSITIVE_INFINITY;
  let maxValue = Number.NEGATIVE_INFINITY;

  for (const corner of BLOCK_CORNERS) {
    const rotatedCorner = rotateVectorY(corner, rotationDegrees);
    const projectedValue = dotVectors(rotatedCorner, projectionAxis);
    minValue = Math.min(minValue, projectedValue);
    maxValue = Math.max(maxValue, projectedValue);
  }

  return Math.max(maxValue - minValue, 0.001);
}

function createProjection({
  elevationDegrees,
  rotationDegrees,
  sizePx,
}: {
  elevationDegrees: number;
  rotationDegrees: number;
  sizePx: number;
}): RasterSeamLabProjection {
  const renderedRotationDegrees = toRenderedRotationDegrees(rotationDegrees);
  const cameraDirection = getWorldCameraVector(elevationDegrees);
  const up = getWorldScreenVerticalAxis(elevationDegrees);
  const right = normalizeVector(
    crossVectors(scaleVector(cameraDirection, -1), up),
  );
  const span = Math.max(
    getProjectionSpan({
      projectionAxis: right,
      rotationDegrees: renderedRotationDegrees,
    }),
    getProjectionSpan({
      projectionAxis: up,
      rotationDegrees: renderedRotationDegrees,
    }),
  );
  const scalePx = sizePx / (span * FRUSTUM_PADDING);
  const centerPx = sizePx / 2;
  const rotatePoint = (point: Vector3) =>
    rotateVectorY(point, renderedRotationDegrees);
  const projectVector = (point: Vector3) => {
    const rotatedPoint = rotatePoint(point);
    return {
      x: dotVectors(rotatedPoint, right) * scalePx,
      y: -dotVectors(rotatedPoint, up) * scalePx,
    };
  };

  return {
    cameraDirection,
    centerPx,
    projectPoint: (point) => {
      const rotatedPoint = rotatePoint(point);
      return {
        depth: dotVectors(rotatedPoint, cameraDirection),
        x: centerPx + dotVectors(rotatedPoint, right) * scalePx,
        y: centerPx - dotVectors(rotatedPoint, up) * scalePx,
      };
    },
    projectVector,
    rotatePoint,
    scalePx,
    sizePx,
  };
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

  context.lineJoin = "miter";
  context.lineWidth = Math.max(1, projection.sizePx / 32);
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

function createLabCanvas(sizePx: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = sizePx;
  canvas.height = sizePx;
  return canvas;
}

function createUnitCubeCanvas(projection: RasterSeamLabProjection) {
  const canvas = createLabCanvas(projection.sizePx);
  const context = canvas.getContext("2d");
  if (!context) {
    return canvas;
  }

  drawProjectedFaces({
    context,
    faces: getCubeFaces({
      center: [0, 0, 0],
      halfSize: CELL_HALF_SIZE,
    }),
    projection,
  });
  return canvas;
}

function getGridCoordinate(index: number): number {
  return index / GRID_SIZE - 0.5;
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

function getGridCells(): GridCell[] {
  const cells: GridCell[] = [];

  for (let x = 0; x < GRID_SIZE; x += 1) {
    for (let y = 0; y < GRID_SIZE; y += 1) {
      for (let z = 0; z < GRID_SIZE; z += 1) {
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

    if (loop.length >= 3) {
      loops.push(loop);
    }
  }

  return loops;
}

function createWorldGridPoint({
  planeAxis,
  planeIndex,
  point,
  uAxis,
  vAxis,
}: {
  planeAxis: AxisIndex;
  planeIndex: number;
  point: GridPoint2D;
  uAxis: AxisIndex;
  vAxis: AxisIndex;
}): Vector3 {
  const planeCoordinate = getGridCoordinate(planeIndex);
  const uCoordinate = getGridCoordinate(point.u);
  const vCoordinate = getGridCoordinate(point.v);
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
  planeAxis,
  planeIndex,
  rect,
  uAxis,
  vAxis,
}: {
  planeAxis: AxisIndex;
  planeIndex: number;
  rect: GridRect;
  uAxis: AxisIndex;
  vAxis: AxisIndex;
}): Vector3 {
  return createWorldGridPoint({
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

function getMergedFaceGroups(
  projection: RasterSeamLabProjection,
): RasterSeamLabMergedFaceGroup[] {
  const cells = getGridCells();
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
  group,
  projection,
}: {
  context: CanvasRenderingContext2D;
  group: RasterSeamLabMergedFaceGroup;
  projection: RasterSeamLabProjection;
}) {
  context.beginPath();
  for (const loop of group.loops) {
    const [firstPoint, ...remainingPoints] = loop;
    const projectedFirstPoint = projection.projectPoint(
      createWorldGridPoint({
        planeAxis: group.planeAxis,
        planeIndex: group.planeIndex,
        point: firstPoint,
        uAxis: group.uAxis,
        vAxis: group.vAxis,
      }),
    );
    context.moveTo(projectedFirstPoint.x, projectedFirstPoint.y);

    for (const point of remainingPoints) {
      const projectedPoint = projection.projectPoint(
        createWorldGridPoint({
          planeAxis: group.planeAxis,
          planeIndex: group.planeIndex,
          point,
          uAxis: group.uAxis,
          vAxis: group.vAxis,
        }),
      );
      context.lineTo(projectedPoint.x, projectedPoint.y);
    }

    context.closePath();
  }
  context.fill();
  context.stroke();
}

function renderMergedFacesImage(projection: RasterSeamLabProjection) {
  const canvas = createLabCanvas(projection.sizePx);
  const context = canvas.getContext("2d");
  if (!context) {
    return canvas;
  }

  context.lineJoin = "miter";
  context.lineWidth = Math.max(1, projection.sizePx / 32);
  for (const group of getMergedFaceGroups(projection)) {
    context.fillStyle = group.color;
    context.strokeStyle = group.color;
    drawMergedFaceGroup({ context, group, projection });
  }

  return canvas;
}

function getCellCenter(x: number, y: number, z: number): Vector3 {
  return [
    (x + 0.5) / GRID_SIZE - 0.5,
    (y + 0.5) / GRID_SIZE - 0.5,
    (z + 0.5) / GRID_SIZE - 0.5,
  ];
}

function getDrawItems(
  projection: RasterSeamLabProjection,
): RasterSeamLabDrawItem[] {
  const drawItems: RasterSeamLabDrawItem[] = [];

  for (let x = 0; x < GRID_SIZE; x += 1) {
    for (let y = 0; y < GRID_SIZE; y += 1) {
      for (let z = 0; z < GRID_SIZE; z += 1) {
        const center = getCellCenter(x, y, z);
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

function renderComposedImage(projection: RasterSeamLabProjection) {
  const canvas = createLabCanvas(projection.sizePx);
  const context = canvas.getContext("2d");
  if (!context) {
    return canvas;
  }

  const unitCanvas = createUnitCubeCanvas(projection);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  for (const item of getDrawItems(projection)) {
    const offset = projection.projectVector(item.center);
    context.drawImage(unitCanvas, offset.x, offset.y);
  }

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
  projection,
}: {
  canvasOperation: GlobalCompositeOperation;
  projection: RasterSeamLabProjection;
}) {
  const canvas = createLabCanvas(projection.sizePx);
  const context = canvas.getContext("2d");
  if (!context) {
    return canvas;
  }

  const unitCanvas = createUnitCubeCanvas(projection);
  const items = getDrawItems(projection);
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
    magicContext.drawImage(unitCanvas, 0, 0);
    magicContext.globalCompositeOperation = canvasOperation;

    for (const parentItem of getNearerOverlappingItems({
      currentIndex: itemIndex,
      items,
      offsets,
      sizePx: projection.sizePx,
    })) {
      const parentOffset = getDrawImageOffset(projection, parentItem);
      magicContext.drawImage(
        unitCanvas,
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
  projection,
}: {
  canvasOperation: GlobalCompositeOperation;
  projection: RasterSeamLabProjection;
}) {
  const canvas = createLabCanvas(projection.sizePx);
  const context = canvas.getContext("2d");
  if (!context) {
    return canvas;
  }

  const unitCanvas = createUnitCubeCanvas(projection);
  const items = getDrawItems(projection);
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
    magicContext.drawImage(unitCanvas, stageOffset.x, stageOffset.y);
    magicContext.globalCompositeOperation = canvasOperation;

    for (const parentItem of getNearerOverlappingItems({
      currentIndex: itemIndex,
      items,
      offsets,
      sizePx: projection.sizePx,
    })) {
      const parentOffset = getDrawImageOffset(projection, parentItem);
      magicContext.drawImage(
        unitCanvas,
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

function renderMergedImage({
  mergeMode,
  projection,
}: {
  mergeMode: RasterSeamLabMergeMode;
  projection: RasterSeamLabProjection;
}): HTMLCanvasElement {
  switch (mergeMode) {
    case "source-over":
      return renderComposedImage(projection);
    case "source-atop-single":
      return renderSingleCompositeImage({
        canvasOperation: "source-atop",
        projection,
      });
    case "source-atop-full":
      return renderFullCompositeImage({
        canvasOperation: "source-atop",
        projection,
      });
    case "destination-out-full":
      return renderFullCompositeImage({
        canvasOperation: "destination-out",
        projection,
      });
    case "merged-faces":
      return renderMergedFacesImage(projection);
    default:
      mergeMode satisfies never;
      throw new Error("Unsupported raster seam lab merge mode.");
  }
}

function renderReferenceImage(projection: RasterSeamLabProjection) {
  const canvas = createLabCanvas(projection.sizePx);
  const context = canvas.getContext("2d");
  if (!context) {
    return canvas;
  }

  drawProjectedFaces({
    context,
    faces: getCubeFaces({
      center: [0, 0, 0],
      halfSize: 0.5,
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
    return { coveredPixels: 0, seamPixels: 0 };
  }

  let coveredPixels = 0;
  let seamPixels = 0;

  for (let index = 0; index < referenceImageData.data.length; index += 4) {
    if (referenceImageData.data[index + 3] < SEAM_ALPHA_THRESHOLD) {
      continue;
    }

    coveredPixels += 1;
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

  return { coveredPixels, seamPixels };
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
    elevationDegrees,
    imageKind,
    mergeMode,
    rotationDegrees,
    sourceSizePx,
  }: {
    elevationDegrees: number;
    imageKind: RasterSeamLabImageKind;
    mergeMode: RasterSeamLabMergeMode;
    rotationDegrees: number;
    sourceSizePx: number;
  },
): RasterSeamLabResult {
  const projection = createProjection({
    elevationDegrees,
    rotationDegrees,
    sizePx: sourceSizePx,
  });
  const composedCanvas = renderMergedImage({ mergeMode, projection });
  const referenceCanvas = renderReferenceImage(projection);
  const seamResult = measureSeams({ composedCanvas, referenceCanvas });

  if (context.canvas.width !== sourceSizePx) {
    context.canvas.width = sourceSizePx;
  }
  if (context.canvas.height !== sourceSizePx) {
    context.canvas.height = sourceSizePx;
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
