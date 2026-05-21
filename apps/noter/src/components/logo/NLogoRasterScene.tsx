import { getTailwindColorHex, type FaceColors } from "@/components/logo/logoTailwindColors";
import {
  addVectors,
  dotProduct,
  type LogoRotationAxisMode,
  scaleVector,
  type Vector3,
} from "@/components/logo/logoRotationMath";
import {
  createLogoRasterProjection as getRasterProjection,
  LOGO_RASTER_RECURSIVE_FRUSTUM_PADDING,
  type LogoRasterPoint2D as Point2D,
  type LogoRasterProjection as RasterProjection,
} from "@/components/logo/logoRasterProjection";
import {
  DEFAULT_LOGO_DISTANCE_SCALE,
  normalizeLogoDistanceScale,
} from "@/components/logo/logoDistanceScale";
import { clampLogoFractalDepthForRenderer } from "@/components/logo/logoDepthLimits";
import { getShuffleOriginCandidates } from "@/components/logo/logoShuffleRules";
import {
  DRAG_ELEVATION_DEGREES_PER_PIXEL,
  DRAG_ROTATION_DEGREES_PER_PIXEL,
} from "@/components/logo/logoViewDragConstants";
import {
  GRID_SIZE,
  createDefaultFilledVoxelSet,
  parseVoxelKey,
  parseVoxelState,
  voxelKey,
  type VoxelCoordinate,
} from "@/components/logo/logoVoxelState";
import { resolveLogoViewState, type LogoViewDragConfig } from "@/components/logo/logoViewDrag";
import { useCallback, useEffect, useRef, type MouseEvent, type PointerEvent } from "react";
import { type LogoShuffleAnimationConfig } from "@/components/logo/NLogoScene";

const DRAG_THRESHOLD_PX = 4;
const RASTER_BACKING_MIN_SIZE = 256;
const RASTER_BACKING_MAX_SIZE = 1536;
// Exact 3-based offscreen levels keep recursive tiles from sampling transparent
// edges into internal seams while the intermediate canvases stay bounded.
const RASTER_EXACT_TILE_MAX_SIZE = RASTER_BACKING_MAX_SIZE * 2;
const RASTER_FRUSTUM_PADDING = 1.18;
const RASTER_RECURSIVE_FRUSTUM_PADDING = LOGO_RASTER_RECURSIVE_FRUSTUM_PADDING;
const FACE_ON_DOT_THRESHOLD = 1 - 1e-6;
const SHUFFLE_MOVE_DURATION_MS = 1800;
const SHUFFLE_MOVE_STAGGER_MS = 520;

type RasterMotifDrawItem = {
  center: Vector3;
  depth: number;
  key: string;
};

type RasterFace = {
  colorKey: keyof FaceColors;
  normal: Vector3;
  vertices: readonly [Vector3, Vector3, Vector3, Vector3];
};

type RasterAxisIndex = 0 | 1 | 2;

type RasterFaceCell = {
  colorKey: keyof FaceColors;
  key: string;
  normal: Vector3;
  planeAxis: RasterAxisIndex;
  planeIndex: number;
  u: number;
  uAxis: RasterAxisIndex;
  v: number;
  vAxis: RasterAxisIndex;
};

type RasterGridPoint = {
  u: number;
  v: number;
};

type RasterGridEdge = {
  from: RasterGridPoint;
  to: RasterGridPoint;
};

type RasterMergedSurface = {
  cells: readonly RasterFaceCell[];
  colorKey: keyof FaceColors;
  depth: number;
  key: string;
  normal: Vector3;
  planeAxis: RasterAxisIndex;
  planeIndex: number;
  uAxis: RasterAxisIndex;
  vAxis: RasterAxisIndex;
};

type RasterProjectedFace = {
  colorKey: keyof FaceColors;
  depth: number;
  key: string;
  points: readonly Point2D[];
};

type RasterFaceDefinition = {
  colorKey: keyof FaceColors;
  key: string;
  neighborOffset: VoxelCoordinate;
  normal: Vector3;
  planeAxis: RasterAxisIndex;
  getPlaneIndex: (coordinate: VoxelCoordinate) => number;
  getU: (coordinate: VoxelCoordinate) => number;
  getV: (coordinate: VoxelCoordinate) => number;
  uAxis: RasterAxisIndex;
  vAxis: RasterAxisIndex;
};

type RasterFaceOnState = {
  cells: ReadonlySet<string>;
  colorKey: keyof FaceColors;
};

type RasterActiveMove = {
  durationMs: number;
  from: VoxelCoordinate;
  fromKey: string;
  hasDeparted: boolean;
  startTimeMs: number;
  to: VoxelCoordinate;
  toKey: string;
};

type RasterMotionState = {
  activeMoves: RasterActiveMove[];
  currentFilledVoxels: Set<string>;
  homeFilledVoxels: Set<string>;
  lastMovedKey: string | null;
};

type RasterInteraction = {
  button: 0 | null;
  pointerId: number | null;
  startElevationDegrees: number;
  startRotationDegrees: number;
  startX: number;
  startY: number;
  status: "idle" | "pending" | "dragging";
};

type NLogoRasterSceneProps = {
  backgroundColor: string;
  className?: string;
  distanceScale: number;
  elevationDegrees: number;
  faceColors: FaceColors;
  fractalDepth: number;
  opacity: number;
  onInteractionEnd?: () => void;
  onInteractionStart?: () => void;
  onViewChange: (nextView: { elevationDegrees: number; rotationDegrees: number }) => void;
  rotationAxisMode?: LogoRotationAxisMode;
  rotationDegrees: number;
  shuffleAnimation: LogoShuffleAnimationConfig;
  viewDragConfig?: LogoViewDragConfig;
  voxelState: string;
};

const CUBE_FACES = [
  {
    colorKey: "right",
    normal: [1, 0, 0],
    vertices: [
      [0.5, -0.5, -0.5],
      [0.5, 0.5, -0.5],
      [0.5, 0.5, 0.5],
      [0.5, -0.5, 0.5],
    ],
  },
  {
    colorKey: "right",
    normal: [-1, 0, 0],
    vertices: [
      [-0.5, -0.5, 0.5],
      [-0.5, 0.5, 0.5],
      [-0.5, 0.5, -0.5],
      [-0.5, -0.5, -0.5],
    ],
  },
  {
    colorKey: "top",
    normal: [0, 1, 0],
    vertices: [
      [-0.5, 0.5, 0.5],
      [0.5, 0.5, 0.5],
      [0.5, 0.5, -0.5],
      [-0.5, 0.5, -0.5],
    ],
  },
  {
    colorKey: "top",
    normal: [0, -1, 0],
    vertices: [
      [-0.5, -0.5, -0.5],
      [0.5, -0.5, -0.5],
      [0.5, -0.5, 0.5],
      [-0.5, -0.5, 0.5],
    ],
  },
  {
    colorKey: "left",
    normal: [0, 0, 1],
    vertices: [
      [-0.5, -0.5, 0.5],
      [0.5, -0.5, 0.5],
      [0.5, 0.5, 0.5],
      [-0.5, 0.5, 0.5],
    ],
  },
  {
    colorKey: "left",
    normal: [0, 0, -1],
    vertices: [
      [-0.5, 0.5, -0.5],
      [0.5, 0.5, -0.5],
      [0.5, -0.5, -0.5],
      [-0.5, -0.5, -0.5],
    ],
  },
] as const satisfies readonly RasterFace[];

const RASTER_FACE_DEFINITIONS = [
  {
    colorKey: "right",
    getPlaneIndex: ([x]) => x + 1,
    getU: ([, y]) => y,
    getV: ([, , z]) => z,
    key: "positive-x",
    neighborOffset: [1, 0, 0],
    normal: [1, 0, 0],
    planeAxis: 0,
    uAxis: 1,
    vAxis: 2,
  },
  {
    colorKey: "right",
    getPlaneIndex: ([x]) => x,
    getU: ([, y]) => y,
    getV: ([, , z]) => z,
    key: "negative-x",
    neighborOffset: [-1, 0, 0],
    normal: [-1, 0, 0],
    planeAxis: 0,
    uAxis: 1,
    vAxis: 2,
  },
  {
    colorKey: "top",
    getPlaneIndex: ([, y]) => y + 1,
    getU: ([x]) => x,
    getV: ([, , z]) => z,
    key: "positive-y",
    neighborOffset: [0, 1, 0],
    normal: [0, 1, 0],
    planeAxis: 1,
    uAxis: 0,
    vAxis: 2,
  },
  {
    colorKey: "top",
    getPlaneIndex: ([, y]) => y,
    getU: ([x]) => x,
    getV: ([, , z]) => z,
    key: "negative-y",
    neighborOffset: [0, -1, 0],
    normal: [0, -1, 0],
    planeAxis: 1,
    uAxis: 0,
    vAxis: 2,
  },
  {
    colorKey: "left",
    getPlaneIndex: ([, , z]) => z + 1,
    getU: ([x]) => x,
    getV: ([, y]) => y,
    key: "positive-z",
    neighborOffset: [0, 0, 1],
    normal: [0, 0, 1],
    planeAxis: 2,
    uAxis: 0,
    vAxis: 1,
  },
  {
    colorKey: "left",
    getPlaneIndex: ([, , z]) => z,
    getU: ([x]) => x,
    getV: ([, y]) => y,
    key: "negative-z",
    neighborOffset: [0, 0, -1],
    normal: [0, 0, -1],
    planeAxis: 2,
    uAxis: 0,
    vAxis: 1,
  },
] as const satisfies readonly RasterFaceDefinition[];

function getCanvasBackingSize(canvas: HTMLCanvasElement): number {
  const rect = canvas.getBoundingClientRect();
  const cssSize = Math.max(1, Math.min(rect.width || 640, rect.height || 640));
  const targetSize = Math.round(cssSize * Math.min(window.devicePixelRatio, 2));
  return Math.min(Math.max(targetSize, RASTER_BACKING_MIN_SIZE), RASTER_BACKING_MAX_SIZE);
}

function createRasterCanvas(sizePx: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = sizePx;
  canvas.height = sizePx;
  return canvas;
}

function getFaceCenter(face: RasterFace): Vector3 {
  return scaleVector(
    face.vertices.reduce<Vector3>((sum, vertex) => addVectors(sum, vertex), [0, 0, 0]),
    1 / face.vertices.length,
  );
}

function drawPolygon(context: CanvasRenderingContext2D, points: readonly Point2D[]) {
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

function renderCubeUnitCanvas({
  faceColors,
  opacity,
  projection,
}: {
  faceColors: FaceColors;
  opacity: number;
  projection: RasterProjection;
}): HTMLCanvasElement {
  const canvas = createRasterCanvas(projection.sizePx);
  const context = canvas.getContext("2d");
  if (!context) {
    return canvas;
  }

  const faces = CUBE_FACES.map((face) => {
    const rotatedNormal = projection.rotatePoint(face.normal);
    if (dotProduct(rotatedNormal, projection.cameraDirection) <= 0) {
      return null;
    }

    return {
      color: getTailwindColorHex(faceColors[face.colorKey]),
      depth: dotProduct(projection.rotatePoint(getFaceCenter(face)), projection.cameraDirection),
      points: face.vertices.map((vertex) => projection.projectPoint(vertex)),
    };
  }).filter((face) => face !== null);

  context.lineJoin = "round";
  context.lineWidth = Math.max(1, projection.sizePx / 512);
  context.globalAlpha = Math.max(0, Math.min(opacity, 1));

  faces
    .sort((left, right) => left.depth - right.depth)
    .forEach((face) => {
      context.fillStyle = face.color;
      context.strokeStyle = face.color;
      drawPolygon(context, face.points);
    });

  context.globalAlpha = 1;
  return canvas;
}

function getSortedProjectionRanks(values: readonly number[]): number[] {
  const ranks: number[] = [];
  const sortedValues = [...values].sort((left, right) => left - right);

  for (const value of sortedValues) {
    if (ranks.length === 0) {
      ranks.push(value);
      continue;
    }

    const previousValue = ranks[ranks.length - 1];
    if (Math.abs(value - previousValue) > 1e-4) {
      ranks.push(value);
    }
  }

  return ranks;
}

function getProjectionRank(ranks: readonly number[], value: number): number {
  let nearestRank = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < ranks.length; index += 1) {
    const distance = Math.abs(value - ranks[index]);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestRank = index;
    }
  }

  return nearestRank;
}

function getFaceOnState({
  filledVoxels,
  projection,
}: {
  filledVoxels: ReadonlySet<string>;
  projection: RasterProjection;
}): RasterFaceOnState | null {
  let visibleFace: RasterFace | null = null;
  let visibleFaceDot = -1;

  for (const face of CUBE_FACES) {
    const dot = dotProduct(projection.rotatePoint(face.normal), projection.cameraDirection);
    if (dot > visibleFaceDot) {
      visibleFace = face;
      visibleFaceDot = dot;
    }
  }

  if (!visibleFace || visibleFaceDot < FACE_ON_DOT_THRESHOLD) {
    return null;
  }

  const projectedGridCenters: Point2D[] = [];
  for (let x = 0; x < GRID_SIZE; x += 1) {
    for (let y = 0; y < GRID_SIZE; y += 1) {
      for (let z = 0; z < GRID_SIZE; z += 1) {
        projectedGridCenters.push(projection.projectPoint(getMotifCenter([x, y, z])));
      }
    }
  }

  const xRanks = getSortedProjectionRanks(projectedGridCenters.map((point) => point.x));
  const yRanks = getSortedProjectionRanks(projectedGridCenters.map((point) => point.y));
  if (xRanks.length !== GRID_SIZE || yRanks.length !== GRID_SIZE) {
    return null;
  }

  const cells = new Set<string>();
  for (const key of filledVoxels) {
    const coordinate = parseVoxelKey(key);
    if (!coordinate) {
      continue;
    }

    const point = projection.projectPoint(getMotifCenter(coordinate));
    cells.add(`${getProjectionRank(xRanks, point.x)},${getProjectionRank(yRanks, point.y)}`);
  }

  return {
    cells,
    colorKey: visibleFace.colorKey,
  };
}

function renderFaceOnBaseCanvas({
  cells,
  color,
  opacity,
  sizePx,
}: {
  cells: ReadonlySet<string>;
  color: string;
  opacity: number;
  sizePx: number;
}): HTMLCanvasElement {
  const canvas = createRasterCanvas(sizePx);
  const context = canvas.getContext("2d");
  if (!context) {
    return canvas;
  }

  const childSize = sizePx / GRID_SIZE;
  context.fillStyle = color;
  context.globalAlpha = Math.max(0, Math.min(opacity, 1));
  for (const cell of cells) {
    const [columnText, rowText] = cell.split(",");
    const column = Number(columnText);
    const row = Number(rowText);
    if (!Number.isInteger(column) || !Number.isInteger(row)) {
      continue;
    }

    context.fillRect(column * childSize, row * childSize, childSize, childSize);
  }

  context.globalAlpha = 1;
  return canvas;
}

function composeFaceOnRasterLevel({
  cells,
  childCanvas,
  sizePx,
}: {
  cells: ReadonlySet<string>;
  childCanvas: HTMLCanvasElement;
  sizePx: number;
}): HTMLCanvasElement {
  const canvas = createRasterCanvas(sizePx);
  const context = canvas.getContext("2d");
  if (!context) {
    return canvas;
  }

  const childSize = childCanvas.width;
  context.imageSmoothingEnabled = false;
  for (const cell of cells) {
    const [columnText, rowText] = cell.split(",");
    const column = Number(columnText);
    const row = Number(rowText);
    if (!Number.isInteger(column) || !Number.isInteger(row)) {
      continue;
    }

    context.drawImage(childCanvas, column * childSize, row * childSize);
  }

  return canvas;
}

function renderFaceOnRecursiveImage({
  depth,
  exactCellSize,
  faceColors,
  faceOnState,
  opacity,
}: {
  depth: number;
  exactCellSize: number;
  faceColors: FaceColors;
  faceOnState: RasterFaceOnState;
  opacity: number;
}): HTMLCanvasElement {
  let unitCanvas = renderFaceOnBaseCanvas({
    cells: faceOnState.cells,
    color: getTailwindColorHex(faceColors[faceOnState.colorKey]),
    opacity,
    sizePx: getExactRasterLevelSize({
      exactCellSize,
      level: 1,
    }),
  });

  for (let level = 2; level <= depth; level += 1) {
    unitCanvas = composeFaceOnRasterLevel({
      cells: faceOnState.cells,
      childCanvas: unitCanvas,
      sizePx: getExactRasterLevelSize({
        exactCellSize,
        level,
      }),
    });
  }

  return unitCanvas;
}

function isWithinRasterGrid([x, y, z]: VoxelCoordinate): boolean {
  return x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE && z >= 0 && z < GRID_SIZE;
}

function offsetRasterCoordinate(
  coordinate: VoxelCoordinate,
  offset: VoxelCoordinate,
): VoxelCoordinate {
  return [coordinate[0] + offset[0], coordinate[1] + offset[1], coordinate[2] + offset[2]];
}

function getRasterGridCoordinate(index: number): number {
  return index / GRID_SIZE - 0.5;
}

function getRasterDistanceProjectionHalfSize(distanceScale: number): number {
  const cellHalfSize = 0.5 / GRID_SIZE;
  return cellHalfSize + (0.5 - cellHalfSize) * normalizeLogoDistanceScale(distanceScale);
}

function isDefaultRasterDistanceScale(distanceScale: number): boolean {
  return normalizeLogoDistanceScale(distanceScale) === DEFAULT_LOGO_DISTANCE_SCALE;
}

function createRasterGridPoint({
  planeAxis,
  planeIndex,
  u,
  uAxis,
  v,
  vAxis,
}: {
  planeAxis: RasterAxisIndex;
  planeIndex: number;
  u: number;
  uAxis: RasterAxisIndex;
  v: number;
  vAxis: RasterAxisIndex;
}): Vector3 {
  const planeCoordinate = getRasterGridCoordinate(planeIndex);
  const uCoordinate = getRasterGridCoordinate(u);
  const vCoordinate = getRasterGridCoordinate(v);
  const getCoordinate = (axis: RasterAxisIndex) => {
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

function getRasterFaceCellCenter(cell: RasterFaceCell): Vector3 {
  return createRasterGridPoint({
    planeAxis: cell.planeAxis,
    planeIndex: cell.planeIndex,
    u: cell.u + 0.5,
    uAxis: cell.uAxis,
    v: cell.v + 0.5,
    vAxis: cell.vAxis,
  });
}

function getRasterFaceCellGroupKey(cell: RasterFaceCell) {
  return `${cell.key}:${cell.planeIndex}`;
}

function getRasterFaceCellKey(cell: RasterFaceCell) {
  return `${getRasterFaceCellGroupKey(cell)}:${cell.u}:${cell.v}`;
}

function getRasterGridPointKey(point: RasterGridPoint) {
  return `${point.u},${point.v}`;
}

function getRasterGridEdgeKey(from: RasterGridPoint, to: RasterGridPoint) {
  return `${getRasterGridPointKey(from)}:${getRasterGridPointKey(to)}`;
}

function areRasterGridPointsEqual(left: RasterGridPoint, right: RasterGridPoint) {
  return left.u === right.u && left.v === right.v;
}

function areRasterFaceCellsAdjacent(left: RasterFaceCell, right: RasterFaceCell): boolean {
  return (
    (left.u === right.u && Math.abs(left.v - right.v) === 1) ||
    (left.v === right.v && Math.abs(left.u - right.u) === 1)
  );
}

function collectRasterFaceCells(filledVoxels: ReadonlySet<string>): RasterFaceCell[] {
  const cells: RasterFaceCell[] = [];

  for (const key of filledVoxels) {
    const coordinate = parseVoxelKey(key);
    if (!coordinate || !isWithinRasterGrid(coordinate)) {
      continue;
    }

    for (const faceDefinition of RASTER_FACE_DEFINITIONS) {
      const neighbor = offsetRasterCoordinate(coordinate, faceDefinition.neighborOffset);
      if (filledVoxels.has(voxelKey(neighbor[0], neighbor[1], neighbor[2]))) {
        continue;
      }

      const planeIndex = faceDefinition.getPlaneIndex(coordinate);
      const u = faceDefinition.getU(coordinate);
      const v = faceDefinition.getV(coordinate);
      cells.push({
        colorKey: faceDefinition.colorKey,
        key: faceDefinition.key,
        normal: faceDefinition.normal,
        planeAxis: faceDefinition.planeAxis,
        planeIndex,
        u,
        uAxis: faceDefinition.uAxis,
        v,
        vAxis: faceDefinition.vAxis,
      });
    }
  }

  return cells;
}

function addRasterBoundaryEdge(
  edges: Map<string, RasterGridEdge>,
  from: RasterGridPoint,
  to: RasterGridPoint,
) {
  // Shared cell edges arrive in opposite directions. Removing those pairs makes
  // the raster path describe only the visible component outline.
  const reverseKey = getRasterGridEdgeKey(to, from);
  if (edges.has(reverseKey)) {
    edges.delete(reverseKey);
    return;
  }

  edges.set(getRasterGridEdgeKey(from, to), { from, to });
}

function takeNextRasterBoundaryEdge(
  edges: Map<string, RasterGridEdge>,
  point: RasterGridPoint,
): RasterGridEdge | null {
  const pointKey = getRasterGridPointKey(point);
  for (const edge of edges.values()) {
    if (getRasterGridPointKey(edge.from) !== pointKey) {
      continue;
    }

    edges.delete(getRasterGridEdgeKey(edge.from, edge.to));
    return edge;
  }

  return null;
}

function getRasterMergedSurfaceLoops(cells: readonly RasterFaceCell[]): RasterGridPoint[][] {
  const edges = new Map<string, RasterGridEdge>();
  for (const cell of cells) {
    const bottomLeft = { u: cell.u, v: cell.v };
    const bottomRight = { u: cell.u + 1, v: cell.v };
    const topRight = { u: cell.u + 1, v: cell.v + 1 };
    const topLeft = { u: cell.u, v: cell.v + 1 };

    addRasterBoundaryEdge(edges, bottomLeft, bottomRight);
    addRasterBoundaryEdge(edges, bottomRight, topRight);
    addRasterBoundaryEdge(edges, topRight, topLeft);
    addRasterBoundaryEdge(edges, topLeft, bottomLeft);
  }

  const loops: RasterGridPoint[][] = [];
  while (edges.size > 0) {
    const firstEdge = edges.values().next().value;
    if (!firstEdge) {
      break;
    }

    edges.delete(getRasterGridEdgeKey(firstEdge.from, firstEdge.to));
    const loop = [firstEdge.from];
    let currentPoint = firstEdge.to;

    while (!areRasterGridPointsEqual(currentPoint, firstEdge.from)) {
      loop.push(currentPoint);
      const nextEdge = takeNextRasterBoundaryEdge(edges, currentPoint);
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

function takeRasterConnectedSurface(
  cells: Map<string, RasterFaceCell>,
  startCell: RasterFaceCell,
): RasterFaceCell[] {
  const component: RasterFaceCell[] = [];
  const pendingCells = [startCell];
  cells.delete(getRasterFaceCellKey(startCell));

  while (pendingCells.length > 0) {
    const currentCell = pendingCells.pop();
    if (!currentCell) {
      continue;
    }

    component.push(currentCell);
    for (const candidate of cells.values()) {
      if (
        getRasterFaceCellGroupKey(candidate) !== getRasterFaceCellGroupKey(currentCell) ||
        !areRasterFaceCellsAdjacent(currentCell, candidate)
      ) {
        continue;
      }

      cells.delete(getRasterFaceCellKey(candidate));
      pendingCells.push(candidate);
    }
  }

  return component;
}

function buildRasterMergedSurfaces({
  filledVoxels,
  projection,
}: {
  filledVoxels: ReadonlySet<string>;
  projection: RasterProjection;
}): RasterMergedSurface[] {
  const remainingCells = new Map(
    collectRasterFaceCells(filledVoxels).map((cell) => [getRasterFaceCellKey(cell), cell]),
  );
  const mergedSurfaces: RasterMergedSurface[] = [];

  for (const cell of remainingCells.values()) {
    if (!remainingCells.has(getRasterFaceCellKey(cell))) {
      continue;
    }

    const rotatedNormal = projection.rotatePoint(cell.normal);
    if (dotProduct(rotatedNormal, projection.cameraDirection) <= 0) {
      remainingCells.delete(getRasterFaceCellKey(cell));
      continue;
    }

    const component = takeRasterConnectedSurface(remainingCells, cell);
    const depth =
      component.reduce((totalDepth, componentCell) => {
        return (
          totalDepth +
          dotProduct(
            projection.rotatePoint(getRasterFaceCellCenter(componentCell)),
            projection.cameraDirection,
          )
        );
      }, 0) / component.length;

    mergedSurfaces.push({
      cells: component,
      colorKey: cell.colorKey,
      depth,
      key: `${getRasterFaceCellGroupKey(cell)}:${component
        .map((componentCell) => `${componentCell.u},${componentCell.v}`)
        .sort()
        .join("|")}`,
      normal: cell.normal,
      planeAxis: cell.planeAxis,
      planeIndex: cell.planeIndex,
      uAxis: cell.uAxis,
      vAxis: cell.vAxis,
    });
  }

  return mergedSurfaces.sort((left, right) => {
    if (left.depth !== right.depth) {
      return left.depth - right.depth;
    }

    return left.key.localeCompare(right.key);
  });
}

function drawRasterMergedSurface({
  context,
  projection,
  surface,
}: {
  context: CanvasRenderingContext2D;
  projection: RasterProjection;
  surface: RasterMergedSurface;
}) {
  context.beginPath();
  for (const loop of getRasterMergedSurfaceLoops(surface.cells)) {
    const [firstPoint, ...remainingPoints] = loop;
    const projectedFirstPoint = projection.projectPoint(
      createRasterGridPoint({
        planeAxis: surface.planeAxis,
        planeIndex: surface.planeIndex,
        u: firstPoint.u,
        uAxis: surface.uAxis,
        v: firstPoint.v,
        vAxis: surface.vAxis,
      }),
    );
    context.moveTo(projectedFirstPoint.x, projectedFirstPoint.y);

    for (const point of remainingPoints) {
      const projectedPoint = projection.projectPoint(
        createRasterGridPoint({
          planeAxis: surface.planeAxis,
          planeIndex: surface.planeIndex,
          u: point.u,
          uAxis: surface.uAxis,
          v: point.v,
          vAxis: surface.vAxis,
        }),
      );
      context.lineTo(projectedPoint.x, projectedPoint.y);
    }

    context.closePath();
  }

  context.fill();
}

function scaleRasterCubeLocalPoint(point: Vector3): Vector3 {
  return scaleVector(point, 1 / GRID_SIZE);
}

function collectDistanceScaledRasterFaces({
  drawItems,
  projection,
}: {
  drawItems: readonly RasterMotifDrawItem[];
  projection: RasterProjection;
}): RasterProjectedFace[] {
  const faces: RasterProjectedFace[] = [];

  for (const item of drawItems) {
    for (const face of CUBE_FACES) {
      const rotatedNormal = projection.rotatePoint(face.normal);
      if (dotProduct(rotatedNormal, projection.cameraDirection) <= 0) {
        continue;
      }

      const faceCenter = addVectors(item.center, scaleRasterCubeLocalPoint(getFaceCenter(face)));
      faces.push({
        colorKey: face.colorKey,
        depth: dotProduct(projection.rotatePoint(faceCenter), projection.cameraDirection),
        key: `${item.key}:${face.colorKey}:${face.normal.join(",")}`,
        points: face.vertices.map((vertex) =>
          projection.projectPoint(addVectors(item.center, scaleRasterCubeLocalPoint(vertex))),
        ),
      });
    }
  }

  return faces.sort((left, right) => {
    if (left.depth !== right.depth) {
      return left.depth - right.depth;
    }

    return left.key.localeCompare(right.key);
  });
}

function drawDistanceScaledRasterFaces({
  context,
  faceColors,
  faces,
  opacity,
  projection,
}: {
  context: CanvasRenderingContext2D;
  faceColors: FaceColors;
  faces: readonly RasterProjectedFace[];
  opacity: number;
  projection: RasterProjection;
}) {
  context.lineJoin = "round";
  context.lineWidth = Math.max(1, projection.sizePx / 512);
  context.globalAlpha = Math.max(0, Math.min(opacity, 1));

  for (const face of faces) {
    const color = getTailwindColorHex(faceColors[face.colorKey]);
    context.fillStyle = color;
    context.strokeStyle = color;
    drawPolygon(context, face.points);
  }

  context.globalAlpha = 1;
}

function renderSurfaceMotifCanvas({
  activeMoves,
  distanceScale,
  elevationDegrees,
  faceColors,
  filledVoxels,
  opacity,
  projection,
  rotationAxisMode,
  rotationDegrees,
}: {
  activeMoves: readonly RasterActiveMove[];
  distanceScale: number;
  elevationDegrees: number;
  faceColors: FaceColors;
  filledVoxels: ReadonlySet<string>;
  opacity: number;
  projection: RasterProjection;
  rotationAxisMode: LogoRotationAxisMode;
  rotationDegrees: number;
}): HTMLCanvasElement {
  const canvas = createRasterCanvas(projection.sizePx);
  const context = canvas.getContext("2d");
  if (!context) {
    return canvas;
  }

  if (!isDefaultRasterDistanceScale(distanceScale)) {
    const drawItems = getMotifDrawItems({
      activeMoves,
      distanceScale,
      filledVoxels,
      projection,
    });
    drawDistanceScaledRasterFaces({
      context,
      faceColors,
      faces: collectDistanceScaledRasterFaces({ drawItems, projection }),
      opacity,
      projection,
    });

    return canvas;
  }

  context.globalAlpha = Math.max(0, Math.min(opacity, 1));

  buildRasterMergedSurfaces({ filledVoxels, projection }).forEach((surface) => {
    context.fillStyle = getTailwindColorHex(faceColors[surface.colorKey]);
    drawRasterMergedSurface({ context, projection, surface });
  });

  context.globalAlpha = 1;

  if (activeMoves.length > 0) {
    const childSize = projection.sizePx / GRID_SIZE;
    const cubeCanvas = renderCubeUnitCanvas({
      faceColors,
      opacity,
      projection: getRasterProjection({
        elevationDegrees,
        frustumPadding: RASTER_RECURSIVE_FRUSTUM_PADDING,
        rotationAxisMode,
        rotationDegrees,
        sizePx: Math.max(1, Math.round(childSize)),
      }),
    });
    const movingItems = getMotifDrawItems({
      activeMoves,
      distanceScale,
      filledVoxels: new Set(),
      projection,
    });

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    for (const item of movingItems) {
      const offset = projection.projectVector(item.center);
      context.drawImage(
        cubeCanvas,
        projection.centerPx + offset.x - childSize / 2,
        projection.centerPx + offset.y - childSize / 2,
        childSize,
        childSize,
      );
    }
  }

  return canvas;
}

function getMotifCenter([x, y, z]: VoxelCoordinate): Vector3 {
  return [(x + 0.5) / GRID_SIZE - 0.5, (y + 0.5) / GRID_SIZE - 0.5, (z + 0.5) / GRID_SIZE - 0.5];
}

function getMotifDrawItems({
  activeMoves,
  distanceScale,
  filledVoxels,
  projection,
}: {
  activeMoves: readonly RasterActiveMove[];
  distanceScale: number;
  filledVoxels: ReadonlySet<string>;
  projection: RasterProjection;
}): RasterMotifDrawItem[] {
  const drawItems: RasterMotifDrawItem[] = [];
  const normalizedDistanceScale = normalizeLogoDistanceScale(distanceScale);

  for (const key of filledVoxels) {
    const coordinate = parseVoxelKey(key);
    if (!coordinate) {
      continue;
    }

    const center = scaleVector(getMotifCenter(coordinate), normalizedDistanceScale);
    drawItems.push({
      center,
      depth: dotProduct(projection.rotatePoint(center), projection.cameraDirection),
      key,
    });
  }

  for (const move of activeMoves) {
    if (!move.hasDeparted) {
      continue;
    }

    const progress = Math.min(
      Math.max((performance.now() - move.startTimeMs) / move.durationMs, 0),
      1,
    );
    const startCenter = scaleVector(getMotifCenter(move.from), normalizedDistanceScale);
    const endCenter = scaleVector(getMotifCenter(move.to), normalizedDistanceScale);
    const travelProgress = easeInOutCubic(progress);
    const center: Vector3 = [
      startCenter[0] + (endCenter[0] - startCenter[0]) * travelProgress,
      startCenter[1] + (endCenter[1] - startCenter[1]) * travelProgress,
      startCenter[2] + (endCenter[2] - startCenter[2]) * travelProgress,
    ];

    drawItems.push({
      center,
      depth: dotProduct(projection.rotatePoint(center), projection.cameraDirection),
      key: `${move.fromKey}->${move.toKey}`,
    });
  }

  return drawItems.sort((left, right) => {
    if (left.depth !== right.depth) {
      return left.depth - right.depth;
    }

    return left.key.localeCompare(right.key);
  });
}

function composeRasterLevel({
  childCanvas,
  drawItems,
  projection,
}: {
  childCanvas: HTMLCanvasElement;
  drawItems: readonly RasterMotifDrawItem[];
  projection: RasterProjection;
}): HTMLCanvasElement {
  const canvas = createRasterCanvas(projection.sizePx);
  const context = canvas.getContext("2d");
  if (!context) {
    return canvas;
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  const childSize = childCanvas.width;

  for (const item of drawItems) {
    const offset = projection.projectVector(item.center);
    context.drawImage(
      childCanvas,
      projection.centerPx + offset.x - childSize / 2,
      projection.centerPx + offset.y - childSize / 2,
      childSize,
      childSize,
    );
  }

  return canvas;
}

function getRasterExactCellSize({
  depth,
  outputSizePx,
}: {
  depth: number;
  outputSizePx: number;
}): number {
  const cellSize = Math.max(1, Math.ceil(outputSizePx / GRID_SIZE ** depth));
  if (cellSize * GRID_SIZE ** depth <= RASTER_EXACT_TILE_MAX_SIZE) {
    return cellSize;
  }

  return 0;
}

function getExactRasterLevelSize({
  exactCellSize,
  level,
}: {
  exactCellSize: number;
  level: number;
}): number {
  return exactCellSize * GRID_SIZE ** level;
}

function getRasterLevelSize({
  depth,
  exactCellSize,
  level,
  outputSizePx,
}: {
  depth: number;
  exactCellSize: number;
  level: number;
  outputSizePx: number;
}): number {
  if (exactCellSize > 0) {
    return getExactRasterLevelSize({ exactCellSize, level });
  }

  return Math.max(1, Math.ceil(outputSizePx / GRID_SIZE ** (depth - level)));
}

function easeInOutCubic(value: number): number {
  return value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function renderRasterRecursiveImage({
  activeMoves,
  depth,
  distanceScale,
  drawItems,
  elevationDegrees,
  faceColors,
  filledVoxels,
  opacity,
  outputSizePx,
  rotationAxisMode,
  rotationDegrees,
}: {
  activeMoves: readonly RasterActiveMove[];
  depth: number;
  distanceScale: number;
  drawItems: readonly RasterMotifDrawItem[];
  elevationDegrees: number;
  faceColors: FaceColors;
  filledVoxels: ReadonlySet<string>;
  opacity: number;
  outputSizePx: number;
  rotationAxisMode: LogoRotationAxisMode;
  rotationDegrees: number;
}): HTMLCanvasElement {
  const normalizedDistanceScale = normalizeLogoDistanceScale(distanceScale);
  const worldHalfSize = getRasterDistanceProjectionHalfSize(normalizedDistanceScale);
  const exactCellSize = getRasterExactCellSize({
    depth,
    outputSizePx,
  });
  const faceOnProjection = getRasterProjection({
    elevationDegrees,
    frustumPadding: RASTER_RECURSIVE_FRUSTUM_PADDING,
    rotationAxisMode,
    rotationDegrees,
    sizePx: getRasterLevelSize({
      depth,
      exactCellSize,
      level: Math.min(depth, 1),
      outputSizePx,
    }),
    worldHalfSize,
  });
  const faceOnState =
    activeMoves.length === 0 &&
    exactCellSize > 0 &&
    normalizedDistanceScale === DEFAULT_LOGO_DISTANCE_SCALE
      ? getFaceOnState({
          filledVoxels,
          projection: faceOnProjection,
        })
      : null;
  if (faceOnState) {
    // Exact snap-to-face views are 2D coverage, so render the recursive mask
    // directly instead of resampling transparent tile edges into seams.
    return renderFaceOnRecursiveImage({
      depth,
      exactCellSize,
      faceColors,
      faceOnState,
      opacity,
    });
  }

  let unitCanvas = renderSurfaceMotifCanvas({
    activeMoves,
    distanceScale: normalizedDistanceScale,
    elevationDegrees,
    faceColors,
    filledVoxels,
    opacity,
    projection: getRasterProjection({
      elevationDegrees,
      frustumPadding: RASTER_RECURSIVE_FRUSTUM_PADDING,
      rotationAxisMode,
      rotationDegrees,
      sizePx: getRasterLevelSize({
        depth,
        exactCellSize,
        level: 1,
        outputSizePx,
      }),
      worldHalfSize,
    }),
    rotationAxisMode,
    rotationDegrees,
  });

  for (let level = 2; level <= depth; level += 1) {
    const levelSizePx = getRasterLevelSize({
      depth,
      exactCellSize,
      level,
      outputSizePx,
    });
    unitCanvas = composeRasterLevel({
      childCanvas: unitCanvas,
      drawItems,
      projection: getRasterProjection({
        elevationDegrees,
        frustumPadding: RASTER_RECURSIVE_FRUSTUM_PADDING,
        rotationAxisMode,
        rotationDegrees,
        sizePx: levelSizePx,
        worldHalfSize,
      }),
    });
  }

  return unitCanvas;
}

function renderRasterScene({
  backgroundColor,
  canvas,
  distanceScale,
  elevationDegrees,
  faceColors,
  fractalDepth,
  motion,
  opacity,
  rotationAxisMode,
  rotationDegrees,
}: {
  backgroundColor: string;
  canvas: HTMLCanvasElement;
  distanceScale: number;
  elevationDegrees: number;
  faceColors: FaceColors;
  fractalDepth: number;
  motion: RasterMotionState;
  opacity: number;
  rotationAxisMode: LogoRotationAxisMode;
  rotationDegrees: number;
}) {
  const normalizedDistanceScale = normalizeLogoDistanceScale(distanceScale);
  const worldHalfSize = getRasterDistanceProjectionHalfSize(normalizedDistanceScale);
  const sizePx = getCanvasBackingSize(canvas);
  if (canvas.width !== sizePx) {
    canvas.width = sizePx;
  }
  if (canvas.height !== sizePx) {
    canvas.height = sizePx;
  }

  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }

  const projection = getRasterProjection({
    elevationDegrees,
    frustumPadding: RASTER_RECURSIVE_FRUSTUM_PADDING,
    rotationAxisMode,
    rotationDegrees,
    sizePx,
    worldHalfSize,
  });
  const drawItems = getMotifDrawItems({
    activeMoves: motion.activeMoves,
    distanceScale: normalizedDistanceScale,
    filledVoxels: motion.currentFilledVoxels,
    projection,
  });
  const image = renderRasterRecursiveImage({
    activeMoves: motion.activeMoves,
    depth: clampLogoFractalDepthForRenderer(fractalDepth, "raster"),
    distanceScale: normalizedDistanceScale,
    drawItems,
    elevationDegrees,
    faceColors,
    filledVoxels: motion.currentFilledVoxels,
    opacity,
    outputSizePx: sizePx,
    rotationAxisMode,
    rotationDegrees,
  });

  context.clearRect(0, 0, sizePx, sizePx);
  context.fillStyle = backgroundColor;
  context.fillRect(0, 0, sizePx, sizePx);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  const paddedImageSizePx = sizePx / RASTER_FRUSTUM_PADDING;
  const paddedImageOffsetPx = (sizePx - paddedImageSizePx) / 2;
  context.drawImage(
    image,
    paddedImageOffsetPx,
    paddedImageOffsetPx,
    paddedImageSizePx,
    paddedImageSizePx,
  );
}

function createRasterMotionState(voxelState: string): RasterMotionState {
  const homeFilledVoxels = parseVoxelState(voxelState) ?? createDefaultFilledVoxelSet();
  return {
    activeMoves: [],
    currentFilledVoxels: new Set(homeFilledVoxels),
    homeFilledVoxels: new Set(homeFilledVoxels),
    lastMovedKey: null,
  };
}

function resetRasterMotion(motion: RasterMotionState) {
  motion.activeMoves = [];
  motion.currentFilledVoxels = new Set(motion.homeFilledVoxels);
  motion.lastMovedKey = null;
}

function scheduleNextRasterMove({
  elevationDegrees,
  motion,
  rotationAxisMode,
  rotationDegrees,
  startTimeMs,
}: {
  elevationDegrees: number;
  motion: RasterMotionState;
  rotationAxisMode: LogoRotationAxisMode;
  rotationDegrees: number;
  startTimeMs: number;
}): boolean {
  const blockedKeys = new Set<string>();
  for (const move of motion.activeMoves) {
    blockedKeys.add(move.fromKey);
    blockedKeys.add(move.toKey);
  }

  const originCandidates = getShuffleOriginCandidates({
    blockedKeys,
    elevationDegrees,
    filledVoxels: motion.currentFilledVoxels,
    gridSize: GRID_SIZE,
    lastMovedCubeKey: motion.lastMovedKey,
    rotationAxisMode,
    rotationDegrees,
  });
  if (originCandidates.length === 0) {
    return false;
  }

  const nextMove = originCandidates[Math.floor(Math.random() * originCandidates.length)];
  if (nextMove.destinations.length === 0) {
    return false;
  }

  const toCoordinate =
    nextMove.destinations[Math.floor(Math.random() * nextMove.destinations.length)];
  const toKey = voxelKey(toCoordinate[0], toCoordinate[1], toCoordinate[2]);
  motion.activeMoves.push({
    durationMs: SHUFFLE_MOVE_DURATION_MS,
    from: nextMove.from,
    fromKey: nextMove.fromKey,
    hasDeparted: false,
    startTimeMs,
    to: toCoordinate,
    toKey,
  });
  return true;
}

function syncRasterMotion({
  elevationDegrees,
  motion,
  parallelMoves,
  rotationAxisMode,
  rotationDegrees,
  timestampMs,
}: {
  elevationDegrees: number;
  motion: RasterMotionState;
  parallelMoves: LogoShuffleAnimationConfig["parallelMoves"];
  rotationAxisMode: LogoRotationAxisMode;
  rotationDegrees: number;
  timestampMs: number;
}) {
  const completedMoves: RasterActiveMove[] = [];

  for (const move of motion.activeMoves) {
    if (!move.hasDeparted && timestampMs >= move.startTimeMs) {
      move.hasDeparted = true;
      motion.currentFilledVoxels.delete(move.fromKey);
    }

    if (move.hasDeparted && timestampMs - move.startTimeMs >= move.durationMs) {
      completedMoves.push(move);
    }
  }

  if (completedMoves.length > 0) {
    const completedMoveSet = new Set(completedMoves);
    motion.activeMoves = motion.activeMoves.filter((move) => !completedMoveSet.has(move));
    for (const move of completedMoves) {
      motion.currentFilledVoxels.add(move.toKey);
      motion.lastMovedKey = move.toKey;
    }
  }

  while (motion.activeMoves.length < parallelMoves) {
    const didScheduleMove = scheduleNextRasterMove({
      elevationDegrees,
      motion,
      rotationAxisMode,
      rotationDegrees,
      startTimeMs: timestampMs + motion.activeMoves.length * SHUFFLE_MOVE_STAGGER_MS,
    });
    if (!didScheduleMove) {
      break;
    }
  }
}

export function NLogoRasterScene({
  backgroundColor,
  className,
  distanceScale,
  elevationDegrees,
  faceColors,
  fractalDepth,
  opacity,
  onInteractionEnd,
  onInteractionStart,
  onViewChange,
  rotationAxisMode = "cube-y",
  rotationDegrees,
  shuffleAnimation,
  viewDragConfig,
  voxelState,
}: NLogoRasterSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const motionRef = useRef(createRasterMotionState(voxelState));
  const interactionRef = useRef<RasterInteraction>({
    button: null,
    pointerId: null,
    startElevationDegrees: elevationDegrees,
    startRotationDegrees: rotationDegrees,
    startX: 0,
    startY: 0,
    status: "idle",
  });

  const renderScene = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    renderRasterScene({
      backgroundColor,
      canvas,
      distanceScale,
      elevationDegrees,
      faceColors,
      fractalDepth,
      motion: motionRef.current,
      opacity,
      rotationAxisMode,
      rotationDegrees,
    });
  }, [
    backgroundColor,
    distanceScale,
    elevationDegrees,
    faceColors,
    fractalDepth,
    opacity,
    rotationAxisMode,
    rotationDegrees,
  ]);

  useEffect(() => {
    motionRef.current = createRasterMotionState(voxelState);
    renderScene();
  }, [renderScene, voxelState]);

  useEffect(() => {
    renderScene();
  }, [renderScene]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      renderScene();
    });
    resizeObserver.observe(canvas);
    return () => {
      resizeObserver.disconnect();
    };
  }, [renderScene]);

  useEffect(() => {
    if (!shuffleAnimation.enabled) {
      resetRasterMotion(motionRef.current);
      renderScene();
      return;
    }

    let animationFrameId = 0;
    const step = (timestampMs: number) => {
      syncRasterMotion({
        elevationDegrees,
        motion: motionRef.current,
        parallelMoves: shuffleAnimation.parallelMoves,
        rotationAxisMode,
        rotationDegrees,
        timestampMs,
      });
      renderScene();
      animationFrameId = window.requestAnimationFrame(step);
    };

    animationFrameId = window.requestAnimationFrame(step);
    return () => {
      window.cancelAnimationFrame(animationFrameId);
    };
  }, [
    elevationDegrees,
    renderScene,
    rotationAxisMode,
    rotationDegrees,
    shuffleAnimation.enabled,
    shuffleAnimation.parallelMoves,
  ]);

  const resetInteraction = (target: HTMLCanvasElement, pointerId: number) => {
    const wasDragging = interactionRef.current.status === "dragging";
    if (target.hasPointerCapture(pointerId)) {
      target.releasePointerCapture(pointerId);
    }
    if (wasDragging) {
      onInteractionEnd?.();
    }

    interactionRef.current = {
      button: null,
      pointerId: null,
      startElevationDegrees: elevationDegrees,
      startRotationDegrees: rotationDegrees,
      startX: 0,
      startY: 0,
      status: "idle",
    };
  };

  const handlePointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    interactionRef.current = {
      button: event.button,
      pointerId: event.pointerId,
      startElevationDegrees: elevationDegrees,
      startRotationDegrees: rotationDegrees,
      startX: event.clientX,
      startY: event.clientY,
      status: "pending",
    };
  };

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const interaction = interactionRef.current;
    if (interaction.pointerId !== event.pointerId || interaction.button !== 0) {
      return;
    }

    const deltaX = event.clientX - interaction.startX;
    const deltaY = event.clientY - interaction.startY;

    if (interaction.status === "pending" && Math.hypot(deltaX, deltaY) >= DRAG_THRESHOLD_PX) {
      interactionRef.current.status = "dragging";
      onInteractionStart?.();
    }

    if (interactionRef.current.status !== "dragging") {
      return;
    }

    onViewChange(
      resolveLogoViewState({
        config: viewDragConfig,
        disableSnap: event.altKey || event.shiftKey,
        view: {
          elevationDegrees:
            interaction.startElevationDegrees + deltaY * DRAG_ELEVATION_DEGREES_PER_PIXEL,
          rotationDegrees:
            interaction.startRotationDegrees + deltaX * DRAG_ROTATION_DEGREES_PER_PIXEL,
        },
      }),
    );
  };

  const handlePointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
    const interaction = interactionRef.current;
    if (interaction.pointerId !== event.pointerId || interaction.button === null) {
      return;
    }

    resetInteraction(event.currentTarget, event.pointerId);
  };

  const handlePointerCancel = (event: PointerEvent<HTMLCanvasElement>) => {
    if (interactionRef.current.pointerId !== event.pointerId) {
      return;
    }

    resetInteraction(event.currentTarget, event.pointerId);
  };

  const handleContextMenu = (event: MouseEvent<HTMLCanvasElement>) => {
    event.preventDefault();
  };

  return (
    <canvas
      ref={canvasRef}
      className={className}
      data-logo-elevation-degrees={elevationDegrees}
      data-logo-renderer="raster"
      data-logo-rotation-degrees={rotationDegrees}
      onContextMenu={handleContextMenu}
      onPointerCancel={handlePointerCancel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    />
  );
}
