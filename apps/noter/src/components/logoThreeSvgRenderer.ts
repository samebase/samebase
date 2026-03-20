import { LOGO_THREE_SVG_VIEWBOX_SIZE } from "./logoStaticSvgContract";
import { toRenderedRotationDegrees } from "./logoRotationMath";
import {
  getTailwindColorHex,
  type FaceColorKey,
  type FaceColors,
} from "./logoTailwindColors";
import {
  DEFAULT_ELEVATION_DEGREES,
  DEFAULT_ROTATION_DEGREES,
  GRID_SIZE,
  HALF_GRID,
  isWithinGrid,
  voxelKey,
} from "./logoVoxelState";

export type LogoProjectedPoint = {
  x: number;
  y: number;
};

export type LogoWorldPoint = {
  x: number;
  y: number;
  z: number;
};

type Rectangle = {
  column: number;
  height: number;
  row: number;
  width: number;
};

type Vector3 = {
  x: number;
  y: number;
  z: number;
};

type SurfaceQuad = {
  color: string;
  colorKey: FaceColorKey;
  key: string;
  materialOrder: number;
  normal: Vector3;
  vertices: readonly Vector3[];
};

export type LogoProjectedQuad = {
  color: string;
  colorKey: FaceColorKey;
  depth: number;
  key: string;
  materialOrder: number;
  points: readonly LogoProjectedPoint[];
  strokeWidth: number;
};

const CAMERA_FRUSTUM_PADDING = 1.12;
// Browsers can still show hairline cracks between adjacent projected polygons
// even when the math is exact. A thin same-color stroke closes those seams
// while still scaling down with the delivered SVG on smaller surfaces.
const FACE_STROKE_WIDTH = 0.14;
const ORBIT_RIGHT_AXIS = normalizeVector({
  x: 1,
  y: 0,
  z: -1,
});

function normalizeVector(vector: Vector3): Vector3 {
  const length = Math.hypot(vector.x, vector.y, vector.z);
  if (length === 0) {
    throw new Error("Cannot normalize a zero-length vector.");
  }

  return {
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length,
  };
}

function dotVectors(left: Vector3, right: Vector3): number {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

function crossVectors(left: Vector3, right: Vector3): Vector3 {
  return {
    x: left.y * right.z - left.z * right.y,
    y: left.z * right.x - left.x * right.z,
    z: left.x * right.y - left.y * right.x,
  };
}

function rotateVectorY(vector: Vector3, radians: number): Vector3 {
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    x: vector.x * cosine + vector.z * sine,
    y: vector.y,
    z: -vector.x * sine + vector.z * cosine,
  };
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

      rectangles.push({ column, height, row, width });
    }
  }

  return rectangles;
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

function toWorld(boundaryIndex: number): number {
  return boundaryIndex - HALF_GRID;
}

function escapeSvgAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildSurfaceQuads(
  faceColors: FaceColors,
  filledVoxels: ReadonlySet<string>,
): SurfaceQuad[] {
  const rightColor = getTailwindColorHex(faceColors.right);
  const topColor = getTailwindColorHex(faceColors.top);
  const leftColor = getTailwindColorHex(faceColors.left);
  const quads: SurfaceQuad[] = [];

  for (let x = 0; x < GRID_SIZE; x += 1) {
    const positiveXMask = Array.from({ length: GRID_SIZE }, (_, y) =>
      Array.from(
        { length: GRID_SIZE },
        (_, z) =>
          isVoxelFilled(filledVoxels, x, y, z) &&
          !isVoxelFilled(filledVoxels, x + 1, y, z),
      ),
    );
    for (const rectangle of collectRectangles(positiveXMask)) {
      const plane = toWorld(x + 1);
      const y0 = toWorld(rectangle.row);
      const y1 = toWorld(rectangle.row + rectangle.height);
      const z0 = toWorld(rectangle.column);
      const z1 = toWorld(rectangle.column + rectangle.width);
      quads.push({
        color: rightColor,
        colorKey: "right",
        key: `positive-x:${x}:${rectangle.row}:${rectangle.column}:${rectangle.height}:${rectangle.width}`,
        materialOrder: 0,
        normal: { x: 1, y: 0, z: 0 },
        vertices: [
          { x: plane, y: y0, z: z0 },
          { x: plane, y: y1, z: z0 },
          { x: plane, y: y1, z: z1 },
          { x: plane, y: y0, z: z1 },
        ],
      });
    }

    const negativeXMask = Array.from({ length: GRID_SIZE }, (_, y) =>
      Array.from(
        { length: GRID_SIZE },
        (_, z) =>
          isVoxelFilled(filledVoxels, x, y, z) &&
          !isVoxelFilled(filledVoxels, x - 1, y, z),
      ),
    );
    for (const rectangle of collectRectangles(negativeXMask)) {
      const plane = toWorld(x);
      const y0 = toWorld(rectangle.row);
      const y1 = toWorld(rectangle.row + rectangle.height);
      const z0 = toWorld(rectangle.column);
      const z1 = toWorld(rectangle.column + rectangle.width);
      quads.push({
        color: rightColor,
        colorKey: "right",
        key: `negative-x:${x}:${rectangle.row}:${rectangle.column}:${rectangle.height}:${rectangle.width}`,
        materialOrder: 1,
        normal: { x: -1, y: 0, z: 0 },
        vertices: [
          { x: plane, y: y0, z: z1 },
          { x: plane, y: y1, z: z1 },
          { x: plane, y: y1, z: z0 },
          { x: plane, y: y0, z: z0 },
        ],
      });
    }
  }

  for (let y = 0; y < GRID_SIZE; y += 1) {
    const positiveYMask = Array.from({ length: GRID_SIZE }, (_, x) =>
      Array.from(
        { length: GRID_SIZE },
        (_, z) =>
          isVoxelFilled(filledVoxels, x, y, z) &&
          !isVoxelFilled(filledVoxels, x, y + 1, z),
      ),
    );
    for (const rectangle of collectRectangles(positiveYMask)) {
      const plane = toWorld(y + 1);
      const x0 = toWorld(rectangle.row);
      const x1 = toWorld(rectangle.row + rectangle.height);
      const z0 = toWorld(rectangle.column);
      const z1 = toWorld(rectangle.column + rectangle.width);
      quads.push({
        color: topColor,
        colorKey: "top",
        key: `positive-y:${y}:${rectangle.row}:${rectangle.column}:${rectangle.height}:${rectangle.width}`,
        materialOrder: 2,
        normal: { x: 0, y: 1, z: 0 },
        vertices: [
          { x: x0, y: plane, z: z1 },
          { x: x1, y: plane, z: z1 },
          { x: x1, y: plane, z: z0 },
          { x: x0, y: plane, z: z0 },
        ],
      });
    }

    const negativeYMask = Array.from({ length: GRID_SIZE }, (_, x) =>
      Array.from(
        { length: GRID_SIZE },
        (_, z) =>
          isVoxelFilled(filledVoxels, x, y, z) &&
          !isVoxelFilled(filledVoxels, x, y - 1, z),
      ),
    );
    for (const rectangle of collectRectangles(negativeYMask)) {
      const plane = toWorld(y);
      const x0 = toWorld(rectangle.row);
      const x1 = toWorld(rectangle.row + rectangle.height);
      const z0 = toWorld(rectangle.column);
      const z1 = toWorld(rectangle.column + rectangle.width);
      quads.push({
        color: topColor,
        colorKey: "top",
        key: `negative-y:${y}:${rectangle.row}:${rectangle.column}:${rectangle.height}:${rectangle.width}`,
        materialOrder: 3,
        normal: { x: 0, y: -1, z: 0 },
        vertices: [
          { x: x0, y: plane, z: z0 },
          { x: x1, y: plane, z: z0 },
          { x: x1, y: plane, z: z1 },
          { x: x0, y: plane, z: z1 },
        ],
      });
    }
  }

  for (let z = 0; z < GRID_SIZE; z += 1) {
    const positiveZMask = Array.from({ length: GRID_SIZE }, (_, x) =>
      Array.from(
        { length: GRID_SIZE },
        (_, y) =>
          isVoxelFilled(filledVoxels, x, y, z) &&
          !isVoxelFilled(filledVoxels, x, y, z + 1),
      ),
    );
    for (const rectangle of collectRectangles(positiveZMask)) {
      const plane = toWorld(z + 1);
      const x0 = toWorld(rectangle.row);
      const x1 = toWorld(rectangle.row + rectangle.height);
      const y0 = toWorld(rectangle.column);
      const y1 = toWorld(rectangle.column + rectangle.width);
      quads.push({
        color: leftColor,
        colorKey: "left",
        key: `positive-z:${z}:${rectangle.row}:${rectangle.column}:${rectangle.height}:${rectangle.width}`,
        materialOrder: 4,
        normal: { x: 0, y: 0, z: 1 },
        vertices: [
          { x: x0, y: y0, z: plane },
          { x: x1, y: y0, z: plane },
          { x: x1, y: y1, z: plane },
          { x: x0, y: y1, z: plane },
        ],
      });
    }

    const negativeZMask = Array.from({ length: GRID_SIZE }, (_, x) =>
      Array.from(
        { length: GRID_SIZE },
        (_, y) =>
          isVoxelFilled(filledVoxels, x, y, z) &&
          !isVoxelFilled(filledVoxels, x, y, z - 1),
      ),
    );
    for (const rectangle of collectRectangles(negativeZMask)) {
      const plane = toWorld(z);
      const x0 = toWorld(rectangle.row);
      const x1 = toWorld(rectangle.row + rectangle.height);
      const y0 = toWorld(rectangle.column);
      const y1 = toWorld(rectangle.column + rectangle.width);
      quads.push({
        color: leftColor,
        colorKey: "left",
        key: `negative-z:${z}:${rectangle.row}:${rectangle.column}:${rectangle.height}:${rectangle.width}`,
        materialOrder: 5,
        normal: { x: 0, y: 0, z: -1 },
        vertices: [
          { x: x0, y: y1, z: plane },
          { x: x1, y: y1, z: plane },
          { x: x1, y: y0, z: plane },
          { x: x0, y: y0, z: plane },
        ],
      });
    }
  }

  return quads;
}

function getCameraBasis(elevationDegrees: number) {
  const elevationRadians = (elevationDegrees * Math.PI) / 180;
  const horizontalComponent = Math.cos(elevationRadians);
  const verticalComponent = Math.sin(elevationRadians);
  const diagonalComponent = horizontalComponent / Math.sqrt(2);
  const cameraDirection = normalizeVector({
    x: diagonalComponent,
    y: verticalComponent,
    z: diagonalComponent,
  });
  const forward = {
    x: -cameraDirection.x,
    y: -cameraDirection.y,
    z: -cameraDirection.z,
  };
  const up = normalizeVector(crossVectors(ORBIT_RIGHT_AXIS, forward));

  return {
    cameraDirection,
    right: ORBIT_RIGHT_AXIS,
    up,
  };
}

function projectPoint(
  point: Vector3,
  right: Vector3,
  up: Vector3,
  frustumHalfHeight: number,
  viewBoxSize: number,
): LogoProjectedPoint {
  return {
    x:
      ((dotVectors(point, right) + frustumHalfHeight) /
        (frustumHalfHeight * 2)) *
      viewBoxSize,
    y:
      ((frustumHalfHeight - dotVectors(point, up)) / (frustumHalfHeight * 2)) *
      viewBoxSize,
  };
}

function serializePolygon(points: readonly LogoProjectedPoint[]): string {
  return points
    .map((point) => `${point.x.toFixed(6)},${point.y.toFixed(6)}`)
    .join(" ");
}

function getProjectedScene({
  elevationDegrees = DEFAULT_ELEVATION_DEGREES,
  faceColors,
  filledVoxels,
  rotationDegrees = DEFAULT_ROTATION_DEGREES,
}: {
  elevationDegrees?: number;
  faceColors: FaceColors;
  filledVoxels: ReadonlySet<string>;
  rotationDegrees?: number;
}) {
  const { cameraDirection, right, up } = getCameraBasis(elevationDegrees);
  const rotationRadians =
    (toRenderedRotationDegrees(rotationDegrees) * Math.PI) / 180;
  const rotatedQuads = buildSurfaceQuads(faceColors, filledVoxels)
    .map((quad) => {
      const normal = rotateVectorY(quad.normal, rotationRadians);
      if (dotVectors(normal, cameraDirection) <= 0) {
        return null;
      }

      return {
        ...quad,
        vertices: quad.vertices.map((vertex) =>
          rotateVectorY(vertex, rotationRadians),
        ),
      };
    })
    .filter((quad) => quad !== null);
  const radius = rotatedQuads.reduce((maxRadius, quad) => {
    const quadRadius = quad.vertices.reduce((maxVertexRadius, vertex) => {
      return Math.max(
        maxVertexRadius,
        Math.hypot(vertex.x, vertex.y, vertex.z),
      );
    }, 0);
    return Math.max(maxRadius, quadRadius);
  }, 0);

  return {
    cameraDirection,
    frustumHalfHeight:
      radius > 0 ? radius * CAMERA_FRUSTUM_PADDING : CAMERA_FRUSTUM_PADDING,
    right,
    rotatedQuads,
    rotationRadians,
    up,
  };
}

export function projectLogoWorldPoints({
  elevationDegrees = DEFAULT_ELEVATION_DEGREES,
  faceColors,
  filledVoxels,
  points,
  rotationDegrees = DEFAULT_ROTATION_DEGREES,
  viewBoxSize = LOGO_THREE_SVG_VIEWBOX_SIZE,
}: {
  elevationDegrees?: number;
  faceColors: FaceColors;
  filledVoxels: ReadonlySet<string>;
  points: readonly LogoWorldPoint[];
  rotationDegrees?: number;
  viewBoxSize?: number;
}): LogoProjectedPoint[] {
  const { frustumHalfHeight, right, rotationRadians, up } = getProjectedScene({
    elevationDegrees,
    faceColors,
    filledVoxels,
    rotationDegrees,
  });

  return points.map((point) =>
    projectPoint(
      rotateVectorY(point, rotationRadians),
      right,
      up,
      frustumHalfHeight,
      viewBoxSize,
    ),
  );
}

export function createLogoThreeProjectedQuads({
  elevationDegrees = DEFAULT_ELEVATION_DEGREES,
  faceColors,
  filledVoxels,
  rotationDegrees = DEFAULT_ROTATION_DEGREES,
  viewBoxSize = LOGO_THREE_SVG_VIEWBOX_SIZE,
}: {
  elevationDegrees?: number;
  faceColors: FaceColors;
  filledVoxels: ReadonlySet<string>;
  rotationDegrees?: number;
  viewBoxSize?: number;
}): LogoProjectedQuad[] {
  const { cameraDirection, frustumHalfHeight, right, rotatedQuads, up } =
    getProjectedScene({
      elevationDegrees,
      faceColors,
      filledVoxels,
      rotationDegrees,
    });

  if (rotatedQuads.length === 0) {
    return [];
  }

  return rotatedQuads
    .map((quad) => {
      const points = quad.vertices.map((vertex) =>
        projectPoint(vertex, right, up, frustumHalfHeight, viewBoxSize),
      );
      const center = quad.vertices.reduce(
        (sum, vertex) => ({
          x: sum.x + vertex.x / quad.vertices.length,
          y: sum.y + vertex.y / quad.vertices.length,
          z: sum.z + vertex.z / quad.vertices.length,
        }),
        { x: 0, y: 0, z: 0 },
      );

      return {
        color: quad.color,
        colorKey: quad.colorKey,
        depth: dotVectors(center, cameraDirection),
        key: quad.key,
        materialOrder: quad.materialOrder,
        points,
        strokeWidth: FACE_STROKE_WIDTH,
      };
    })
    .sort((left, rightQuad) => {
      if (left.depth !== rightQuad.depth) {
        return left.depth - rightQuad.depth;
      }

      return left.materialOrder - rightQuad.materialOrder;
    });
}

export function createLogoThreeSvgMarkup({
  backgroundColor,
  elevationDegrees = DEFAULT_ELEVATION_DEGREES,
  faceColors,
  filledVoxels,
  rotationDegrees = DEFAULT_ROTATION_DEGREES,
  viewBoxSize = LOGO_THREE_SVG_VIEWBOX_SIZE,
}: {
  backgroundColor: string;
  elevationDegrees?: number;
  faceColors: FaceColors;
  filledVoxels: ReadonlySet<string>;
  rotationDegrees?: number;
  viewBoxSize?: number;
}): string {
  const projectedQuads = createLogoThreeProjectedQuads({
    elevationDegrees,
    faceColors,
    filledVoxels,
    rotationDegrees,
    viewBoxSize,
  });

  if (projectedQuads.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBoxSize} ${viewBoxSize}" width="${viewBoxSize}" height="${viewBoxSize}"><rect x="0" y="0" width="${viewBoxSize}" height="${viewBoxSize}" fill="${escapeSvgAttribute(backgroundColor)}"/></svg>`;
  }

  const backgroundRect = `<rect x="0" y="0" width="${viewBoxSize}" height="${viewBoxSize}" fill="${escapeSvgAttribute(backgroundColor)}"/>`;
  const polygons = projectedQuads
    .map((quad) => {
      const fill = escapeSvgAttribute(quad.color);
      return `<polygon points="${escapeSvgAttribute(serializePolygon(quad.points))}" fill="${fill}" stroke="${fill}" stroke-width="${FACE_STROKE_WIDTH}" stroke-linejoin="round" paint-order="stroke fill"/>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBoxSize} ${viewBoxSize}" width="${viewBoxSize}" height="${viewBoxSize}">${backgroundRect}${polygons}</svg>`;
}
