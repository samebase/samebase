import { DEFAULT_FACE_COLORS, getTailwindColorHex } from "@/components/logo/logoTailwindColors";

const CANVAS_SIZE = 36;
const GRID_STEP = 1;
const CANVAS_MARGIN = 1;
const CUBE_HALF_WIDTH = 8;
const TOP_FACE_RISE = 4;
const CUBE_HEIGHT = 8;

type Point2D = {
  x: number;
  y: number;
};

type CubeFace = {
  color: string;
  points: readonly Point2D[];
};

type ProjectedAxes = {
  xAxis: Point2D;
  yAxis: Point2D;
  zAxis: Point2D;
};

export const SINGLE_CUBE_STUDY_CANVAS_SIZE = CANVAS_SIZE;

export const SINGLE_CUBE_STUDY_SAMPLE_ANGLES = [0, 15, 30, 45, 60, 75, 90] as const;

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

function addPoints(...points: readonly Point2D[]): Point2D {
  return points.reduce(
    (sum, point) => ({
      x: sum.x + point.x,
      y: sum.y + point.y,
    }),
    { x: 0, y: 0 },
  );
}

function interpolateInteger(startValue: number, endValue: number, t: number) {
  return Math.round(startValue + (endValue - startValue) * t);
}

function getProjectedAxes(yawDegrees: number): ProjectedAxes {
  if (yawDegrees <= 45) {
    const t = yawDegrees / 45;
    return {
      xAxis: {
        x: interpolateInteger(0, CUBE_HALF_WIDTH, t),
        y: TOP_FACE_RISE,
      },
      yAxis: {
        x: 0,
        y: CUBE_HEIGHT,
      },
      zAxis: {
        x: -CUBE_HALF_WIDTH,
        y: interpolateInteger(0, TOP_FACE_RISE, t),
      },
    };
  }

  const t = (yawDegrees - 45) / 45;
  return {
    xAxis: {
      x: CUBE_HALF_WIDTH,
      y: interpolateInteger(TOP_FACE_RISE, 0, t),
    },
    yAxis: {
      x: 0,
      y: CUBE_HEIGHT,
    },
    zAxis: {
      x: interpolateInteger(-CUBE_HALF_WIDTH, 0, t),
      y: TOP_FACE_RISE,
    },
  };
}

function getPolygonArea(points: readonly Point2D[]) {
  let area = 0;

  for (let index = 0; index < points.length; index += 1) {
    const nextIndex = (index + 1) % points.length;
    area += points[index].x * points[nextIndex].y - points[nextIndex].x * points[index].y;
  }

  return Math.abs(area) / 2;
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
  const offsetX = CANVAS_MARGIN + Math.round((availableSize - cubeWidth) / 2) - bounds.minX;
  const offsetY = CANVAS_MARGIN + Math.round((availableSize - cubeHeight) / 2) - bounds.minY;

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
    context.fillRect(rowSpan.startX, rowSpan.y, rowSpan.endX - rowSpan.startX + 1, 1);
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

function buildVisibleFaces(yawDegrees: number, vividColors: boolean): CubeFace[] {
  const palette = vividColors ? VIVID_FACE_COLORS : DEFAULT_STUDY_FACE_COLORS;
  const axes = getProjectedAxes(yawDegrees);
  const topFront = { x: 0, y: 0 };
  const topRight = addPoints(topFront, axes.xAxis);
  const topLeft = addPoints(topFront, axes.zAxis);
  const topBack = addPoints(topFront, axes.xAxis, axes.zAxis);
  const lowerRight = addPoints(topRight, axes.yAxis);
  const lowerLeft = addPoints(topLeft, axes.yAxis);
  const lowerBack = addPoints(topBack, axes.yAxis);

  const faces = [
    {
      color: palette.left,
      points: [topLeft, topBack, lowerBack, lowerLeft],
    },
    {
      color: palette.right,
      points: [topRight, topBack, lowerBack, lowerRight],
    },
    {
      color: palette.top,
      points: [topFront, topRight, topBack, topLeft],
    },
  ] satisfies readonly CubeFace[];

  return translateFacesToCanvas(faces.filter((face) => getPolygonArea(face.points) > 0.5));
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
