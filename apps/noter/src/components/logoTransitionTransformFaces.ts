import { STATIC_LOGO_VOXEL_COORDINATES } from "@/components/logoStaticSvgContract";
import {
  DEFAULT_FACE_COLORS,
  getTailwindColorHex,
} from "@/components/logoTailwindColors";
import {
  HALF_GRID,
  createFilledVoxelSet,
  voxelKey,
  type VoxelCoordinate,
} from "@/components/logoVoxelState";

type Point = {
  x: number;
  y: number;
};

type Vector3 = {
  x: number;
  y: number;
  z: number;
};

type FaceDefinition = {
  color: string;
  key: string;
  normal: Vector3;
  origin: Vector3;
  u: Vector3;
  v: Vector3;
};

type ProjectedFaceDefinition = {
  color: string;
  corners: readonly Point[];
  depth: number;
  key: string;
  stroke: string;
  strokeWidth: number;
  transform: string;
};

const VIEWBOX_SIZE = 500;
const CAMERA_FRUSTUM_PADDING = 1.12;
const FACE_STROKE_WIDTH = 0.14;
const DEFAULT_ROTATION_DEGREES = 0;
const DEFAULT_ELEVATION_DEGREES = 35.26438968;
const ORBIT_RIGHT_AXIS = normalizeVector({
  x: 1,
  y: 0,
  z: -1,
});

export type TransformLabFace = ProjectedFaceDefinition;

export const TRANSFORM_LAB_VIEW_BOX = {
  minX: 0,
  minY: 0,
  width: VIEWBOX_SIZE,
  height: VIEWBOX_SIZE,
} as const;

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

function toWorld(boundaryIndex: number): number {
  return boundaryIndex - HALF_GRID;
}

function isVoxelFilled(
  filledVoxels: ReadonlySet<string>,
  x: number,
  y: number,
  z: number,
): boolean {
  return filledVoxels.has(voxelKey(x, y, z));
}

function createFaceDefinition(
  coordinate: VoxelCoordinate,
  axis:
    | "negative-x"
    | "negative-y"
    | "negative-z"
    | "positive-x"
    | "positive-y"
    | "positive-z",
): FaceDefinition {
  const [x, y, z] = coordinate;

  switch (axis) {
    case "positive-x":
      return {
        color: getTailwindColorHex(DEFAULT_FACE_COLORS.right),
        key: `${x},${y},${z}:positive-x`,
        normal: { x: 1, y: 0, z: 0 },
        origin: { x: toWorld(x + 1), y: toWorld(y), z: toWorld(z) },
        u: { x: 0, y: 0, z: 1 },
        v: { x: 0, y: 1, z: 0 },
      };
    case "negative-x":
      return {
        color: getTailwindColorHex(DEFAULT_FACE_COLORS.right),
        key: `${x},${y},${z}:negative-x`,
        normal: { x: -1, y: 0, z: 0 },
        origin: { x: toWorld(x), y: toWorld(y), z: toWorld(z + 1) },
        u: { x: 0, y: 0, z: -1 },
        v: { x: 0, y: 1, z: 0 },
      };
    case "positive-y":
      return {
        color: getTailwindColorHex(DEFAULT_FACE_COLORS.top),
        key: `${x},${y},${z}:positive-y`,
        normal: { x: 0, y: 1, z: 0 },
        origin: { x: toWorld(x), y: toWorld(y + 1), z: toWorld(z + 1) },
        u: { x: 1, y: 0, z: 0 },
        v: { x: 0, y: 0, z: -1 },
      };
    case "negative-y":
      return {
        color: getTailwindColorHex(DEFAULT_FACE_COLORS.top),
        key: `${x},${y},${z}:negative-y`,
        normal: { x: 0, y: -1, z: 0 },
        origin: { x: toWorld(x), y: toWorld(y), z: toWorld(z) },
        u: { x: 1, y: 0, z: 0 },
        v: { x: 0, y: 0, z: 1 },
      };
    case "positive-z":
      return {
        color: getTailwindColorHex(DEFAULT_FACE_COLORS.left),
        key: `${x},${y},${z}:positive-z`,
        normal: { x: 0, y: 0, z: 1 },
        origin: { x: toWorld(x), y: toWorld(y), z: toWorld(z + 1) },
        u: { x: 1, y: 0, z: 0 },
        v: { x: 0, y: 1, z: 0 },
      };
    case "negative-z":
      return {
        color: getTailwindColorHex(DEFAULT_FACE_COLORS.left),
        key: `${x},${y},${z}:negative-z`,
        normal: { x: 0, y: 0, z: -1 },
        origin: { x: toWorld(x + 1), y: toWorld(y), z: toWorld(z) },
        u: { x: -1, y: 0, z: 0 },
        v: { x: 0, y: 1, z: 0 },
      };
  }
}

function collectVisibleFaces(): FaceDefinition[] {
  const filledVoxels = createFilledVoxelSet(STATIC_LOGO_VOXEL_COORDINATES);
  const faces: FaceDefinition[] = [];

  for (const coordinate of STATIC_LOGO_VOXEL_COORDINATES) {
    const [x, y, z] = coordinate;

    if (!isVoxelFilled(filledVoxels, x + 1, y, z)) {
      faces.push(createFaceDefinition(coordinate, "positive-x"));
    }
    if (!isVoxelFilled(filledVoxels, x - 1, y, z)) {
      faces.push(createFaceDefinition(coordinate, "negative-x"));
    }
    if (!isVoxelFilled(filledVoxels, x, y + 1, z)) {
      faces.push(createFaceDefinition(coordinate, "positive-y"));
    }
    if (!isVoxelFilled(filledVoxels, x, y - 1, z)) {
      faces.push(createFaceDefinition(coordinate, "negative-y"));
    }
    if (!isVoxelFilled(filledVoxels, x, y, z + 1)) {
      faces.push(createFaceDefinition(coordinate, "positive-z"));
    }
    if (!isVoxelFilled(filledVoxels, x, y, z - 1)) {
      faces.push(createFaceDefinition(coordinate, "negative-z"));
    }
  }

  return faces;
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
): Point {
  return {
    x:
      ((dotVectors(point, right) + frustumHalfHeight) /
        (frustumHalfHeight * 2)) *
      VIEWBOX_SIZE,
    y:
      ((frustumHalfHeight - dotVectors(point, up)) / (frustumHalfHeight * 2)) *
      VIEWBOX_SIZE,
  };
}

function formatNumber(value: number): string {
  return value.toFixed(6);
}

function createTransformString(u: Point, v: Point, origin: Point): string {
  return `matrix(${formatNumber(u.x)} ${formatNumber(u.y)} ${formatNumber(v.x)} ${formatNumber(v.y)} ${formatNumber(origin.x)} ${formatNumber(origin.y)})`;
}

function createProjectedFaceDefinitions(): ProjectedFaceDefinition[] {
  const { cameraDirection, right, up } = getCameraBasis(
    DEFAULT_ELEVATION_DEGREES,
  );
  const rotationRadians = (DEFAULT_ROTATION_DEGREES * Math.PI) / 180;

  const visibleFaces = collectVisibleFaces()
    .map((face) => {
      const normal = rotateVectorY(face.normal, rotationRadians);
      if (dotVectors(normal, cameraDirection) <= 0) {
        return null;
      }

      const origin = rotateVectorY(face.origin, rotationRadians);
      const u = rotateVectorY(face.u, rotationRadians);
      const v = rotateVectorY(face.v, rotationRadians);
      const center = {
        x: origin.x + (u.x + v.x) / 2,
        y: origin.y + (u.y + v.y) / 2,
        z: origin.z + (u.z + v.z) / 2,
      };

      return {
        color: face.color,
        corners: [
          origin,
          { x: origin.x + u.x, y: origin.y + u.y, z: origin.z + u.z },
          {
            x: origin.x + u.x + v.x,
            y: origin.y + u.y + v.y,
            z: origin.z + u.z + v.z,
          },
          { x: origin.x + v.x, y: origin.y + v.y, z: origin.z + v.z },
        ] as const,
        depth: dotVectors(center, cameraDirection),
        key: face.key,
        stroke: face.color,
        strokeWidth: FACE_STROKE_WIDTH,
        u,
        v,
      };
    })
    .filter((face) => face !== null);

  const radius = visibleFaces.reduce((maxRadius, face) => {
    const faceRadius = face.corners.reduce((maxCornerRadius, corner) => {
      return Math.max(
        maxCornerRadius,
        Math.hypot(corner.x, corner.y, corner.z),
      );
    }, 0);
    return Math.max(maxRadius, faceRadius);
  }, 0);
  const frustumHalfHeight = radius * CAMERA_FRUSTUM_PADDING;

  return visibleFaces
    .map((face) => {
      const projectedOrigin = projectPoint(
        face.corners[0],
        right,
        up,
        frustumHalfHeight,
      );
      const projectedUPoint = projectPoint(
        face.corners[1],
        right,
        up,
        frustumHalfHeight,
      );
      const projectedVPoint = projectPoint(
        face.corners[3],
        right,
        up,
        frustumHalfHeight,
      );
      const projectedCorners = face.corners.map((corner) =>
        projectPoint(corner, right, up, frustumHalfHeight),
      );

      return {
        color: face.color,
        corners: projectedCorners,
        depth: face.depth,
        key: face.key,
        stroke: face.stroke,
        strokeWidth: face.strokeWidth,
        transform: createTransformString(
          {
            x: projectedUPoint.x - projectedOrigin.x,
            y: projectedUPoint.y - projectedOrigin.y,
          },
          {
            x: projectedVPoint.x - projectedOrigin.x,
            y: projectedVPoint.y - projectedOrigin.y,
          },
          projectedOrigin,
        ),
      };
    })
    .sort((left, rightFace) => left.depth - rightFace.depth);
}

export function createLogoTransitionTransformFaces(): TransformLabFace[] {
  return createProjectedFaceDefinitions();
}
