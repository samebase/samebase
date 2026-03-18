import {
  DEFAULT_FACE_COLORS,
  getTailwindColorHex,
} from "@/components/logoTailwindColors";

const CANVAS_SIZE = 36;
const GRID_STEP = 1;
const CUBE_SCALE = 16;
const CAMERA_PITCH_DEGREES = 35.26438968;
const CANVAS_MARGIN = 1;

type Point2D = {
  x: number;
  y: number;
};

type Point3D = {
  x: number;
  y: number;
  z: number;
};

type CubeFace = {
  color: string;
  depth: number;
  points: readonly Point2D[];
};

type CubeFaceDefinition = {
  colorKey: "left" | "right" | "top";
  normal: Point3D;
  vertices: readonly [number, number, number, number];
};

export const SINGLE_CUBE_STUDY_CANVAS_SIZE = CANVAS_SIZE;

export const SINGLE_CUBE_STUDY_SAMPLE_ANGLES = [
  0, 15, 30, 45, 60, 75, 90,
] as const;

const CUBE_VERTICES = [
  { x: -0.5, y: -0.5, z: -0.5 },
  { x: 0.5, y: -0.5, z: -0.5 },
  { x: 0.5, y: 0.5, z: -0.5 },
  { x: -0.5, y: 0.5, z: -0.5 },
  { x: -0.5, y: -0.5, z: 0.5 },
  { x: 0.5, y: -0.5, z: 0.5 },
  { x: 0.5, y: 0.5, z: 0.5 },
  { x: -0.5, y: 0.5, z: 0.5 },
] as const satisfies readonly Point3D[];

const CUBE_FACES = [
  {
    colorKey: "right",
    normal: { x: 1, y: 0, z: 0 },
    vertices: [1, 5, 6, 2],
  },
  {
    colorKey: "left",
    normal: { x: 0, y: 0, z: 1 },
    vertices: [4, 5, 6, 7],
  },
  {
    colorKey: "top",
    normal: { x: 0, y: 1, z: 0 },
    vertices: [3, 2, 6, 7],
  },
] as const satisfies readonly CubeFaceDefinition[];

const VIVID_FACE_COLORS = {
  left: "#ef4444",
  right: "#22c55e",
  top: "#3b82f6",
} as const;

const DEFAULT_STUDY_FACE_COLORS = {
  left: getTailwindColorHex(DEFAULT_FACE_COLORS.left),
  right: getTailwindColorHex(DEFAULT_FACE_COLORS.right),
  top: getTailwindColorHex(DEFAULT_FACE_COLORS.top),
} as const;

function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function rotateAroundY(point: Point3D, yawRadians: number): Point3D {
  const cosine = Math.cos(yawRadians);
  const sine = Math.sin(yawRadians);
  return {
    x: point.x * cosine + point.z * sine,
    y: point.y,
    z: -point.x * sine + point.z * cosine,
  };
}

function rotateAroundX(point: Point3D, pitchRadians: number): Point3D {
  const cosine = Math.cos(pitchRadians);
  const sine = Math.sin(pitchRadians);
  return {
    x: point.x,
    y: point.y * cosine - point.z * sine,
    z: point.y * sine + point.z * cosine,
  };
}

function transformPoint(point: Point3D, yawRadians: number): Point3D {
  return rotateAroundX(
    rotateAroundY(point, yawRadians),
    degreesToRadians(CAMERA_PITCH_DEGREES),
  );
}

function projectPoint(point: Point3D): Point2D {
  return {
    x: Math.round(point.x * CUBE_SCALE),
    y: Math.round(-point.y * CUBE_SCALE),
  };
}

function getFaceBounds(faces: readonly CubeFace[]) {
  const points = faces.flatMap((face) => face.points);
  return {
    maxX: Math.max(...points.map((point) => point.x)),
    maxY: Math.max(...points.map((point) => point.y)),
    minX: Math.min(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
  };
}

function translateFacesToCanvas(faces: readonly CubeFace[]): CubeFace[] {
  const bounds = getFaceBounds(faces);
  const cubeWidth = bounds.maxX - bounds.minX + 1;
  const cubeHeight = bounds.maxY - bounds.minY + 1;
  const availableSize = CANVAS_SIZE - CANVAS_MARGIN * 2;
  const offsetX =
    CANVAS_MARGIN + Math.round((availableSize - cubeWidth) / 2) - bounds.minX;
  const offsetY =
    CANVAS_MARGIN + Math.round((availableSize - cubeHeight) / 2) - bounds.minY;

  return faces.map((face) => ({
    ...face,
    points: face.points.map((point) => ({
      x: point.x + offsetX,
      y: point.y + offsetY,
    })),
  }));
}

function collectPolygonRowSpans(points: readonly Point2D[]) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.floor(Math.min(...xs));
  const maxX = Math.ceil(Math.max(...xs));
  const minY = Math.floor(Math.min(...ys));
  const maxY = Math.ceil(Math.max(...ys));
  const rowSpans: { endX: number; startX: number; y: number }[] = [];

  for (let y = minY; y <= maxY; y += 1) {
    let startX: number | null = null;
    let endX: number | null = null;

    for (let x = minX; x <= maxX; x += 1) {
      if (isPointInsidePolygon(x + 0.5, y + 0.5, points)) {
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

function fillPolygonPixels(
  context: CanvasRenderingContext2D,
  points: readonly Point2D[],
  fillStyle: string,
) {
  context.fillStyle = fillStyle;
  for (const rowSpan of collectPolygonRowSpans(points)) {
    context.fillRect(
      rowSpan.startX,
      rowSpan.y,
      rowSpan.endX - rowSpan.startX + 1,
      1,
    );
  }
}

function drawPixelLine(
  context: CanvasRenderingContext2D,
  startPoint: Point2D,
  endPoint: Point2D,
  strokeStyle: string,
) {
  let currentX = startPoint.x;
  let currentY = startPoint.y;
  const deltaX = Math.abs(endPoint.x - startPoint.x);
  const directionX = currentX < endPoint.x ? 1 : -1;
  const deltaY = -Math.abs(endPoint.y - startPoint.y);
  const directionY = currentY < endPoint.y ? 1 : -1;
  let error = deltaX + deltaY;

  context.fillStyle = strokeStyle;
  for (;;) {
    context.fillRect(currentX, currentY, 1, 1);
    if (currentX === endPoint.x && currentY === endPoint.y) {
      break;
    }

    const doubleError = error * 2;
    if (doubleError >= deltaY) {
      error += deltaY;
      currentX += directionX;
    }
    if (doubleError <= deltaX) {
      error += deltaX;
      currentY += directionY;
    }
  }
}

function drawPolygonEdges(
  context: CanvasRenderingContext2D,
  points: readonly Point2D[],
  strokeStyle: string,
) {
  for (let index = 0; index < points.length; index += 1) {
    const nextIndex = (index + 1) % points.length;
    drawPixelLine(context, points[index], points[nextIndex], strokeStyle);
  }
}

function buildVisibleFaces(
  yawDegrees: number,
  vividColors: boolean,
): CubeFace[] {
  const yawRadians = degreesToRadians(yawDegrees - 90);
  const transformedVertices = CUBE_VERTICES.map((vertex) =>
    transformPoint(vertex, yawRadians),
  );
  const projectedVertices = transformedVertices.map(projectPoint);
  const palette = vividColors ? VIVID_FACE_COLORS : DEFAULT_STUDY_FACE_COLORS;

  const visibleFaces = CUBE_FACES.map((face) => {
    const transformedNormal = transformPoint(face.normal, yawRadians);
    const points = face.vertices.map(
      (vertexIndex) => projectedVertices[vertexIndex],
    );
    return {
      color: palette[face.colorKey],
      depth:
        face.vertices.reduce(
          (sum, vertexIndex) => sum + transformedVertices[vertexIndex].z,
          0,
        ) / face.vertices.length,
      isVisible: transformedNormal.z > 0,
      points,
    };
  })
    .filter((face) => face.isVisible)
    .sort((left, right) => left.depth - right.depth)
    .map(({ color, depth, points }) => ({
      color,
      depth,
      points,
    }));

  return translateFacesToCanvas(visibleFaces);
}

function drawGrid(context: CanvasRenderingContext2D) {
  context.fillStyle = "#e7e5e4";
  for (let x = 0; x < CANVAS_SIZE; x += GRID_STEP) {
    for (let y = 0; y < CANVAS_SIZE; y += 1) {
      context.fillRect(x, y, 1, 1);
    }
  }

  for (let y = 0; y < CANVAS_SIZE; y += GRID_STEP) {
    for (let x = 0; x < CANVAS_SIZE; x += 1) {
      context.fillRect(x, y, 1, 1);
    }
  }
}

export function drawSingleCubeStudy(
  context: CanvasRenderingContext2D,
  {
    showEdges,
    showGrid,
    vividColors,
    yawDegrees,
  }: {
    showEdges: boolean;
    showGrid: boolean;
    vividColors: boolean;
    yawDegrees: number;
  },
) {
  context.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  if (showGrid) {
    drawGrid(context);
  }

  const faces = buildVisibleFaces(yawDegrees, vividColors);
  for (const face of faces) {
    fillPolygonPixels(context, face.points, face.color);
  }

  if (showEdges) {
    for (const face of faces) {
      drawPolygonEdges(context, face.points, "#111827");
    }
  }
}

export function isPointInsidePolygon(
  pointX: number,
  pointY: number,
  polygon: readonly Point2D[],
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
