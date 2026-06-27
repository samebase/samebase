import {
  LOGO_THREE_SVG_VIEWBOX_SIZE,
  STATIC_LOGO_ELEVATION_DEGREES,
  STATIC_LOGO_ROTATION_DEGREES,
} from "@/components/logo/logoStaticSvgContract";
import {
  DEFAULT_FACE_COLORS,
  getTailwindColorHex,
  type FaceColorKey,
} from "@/components/logo/logoTailwindColors";
import {
  createLogoProjector,
  type LogoProjectedPoint,
  type LogoWorldPoint,
} from "@/components/logo/logoThreeSvgRenderer";
import { LOGO_GRID_SIZE_2, voxelKey, type VoxelCoordinate } from "@/components/logo/logoVoxelState";

type CubeBounds = {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
};

type CubeFaceDefinition = {
  colorKey: FaceColorKey;
  key: string;
  materialOrder: number;
  neighborDelta: VoxelCoordinate;
  normal: LogoWorldPoint;
  readVertices: (
    bounds: CubeBounds,
  ) => readonly [LogoWorldPoint, LogoWorldPoint, LogoWorldPoint, LogoWorldPoint];
};

type CubeWorldFace = {
  color: string;
  colorKey: FaceColorKey;
  cubeKey: string;
  cubeLabel: string;
  key: string;
  materialOrder: number;
  normal: LogoWorldPoint;
  vertices: readonly [LogoWorldPoint, LogoWorldPoint, LogoWorldPoint, LogoWorldPoint];
};

export type TransitionCube = {
  coordinate: VoxelCoordinate;
  key: string;
  label: string;
  projectedCenter: LogoProjectedPoint;
};

export type TransitionCubeFace = {
  color: string;
  colorKey: FaceColorKey;
  cubeKey: string;
  cubeLabel: string;
  depth: number;
  key: string;
  points: readonly LogoProjectedPoint[];
};

export type TransitionCubeScene = {
  cubes: readonly TransitionCube[];
  faces: readonly TransitionCubeFace[];
  viewBox: {
    height: number;
    minX: number;
    minY: number;
    width: number;
  };
};

export const TRANSITION_CUBE_SCENE_VIEW_BOX = {
  height: LOGO_THREE_SVG_VIEWBOX_SIZE,
  minX: 0,
  minY: 0,
  width: LOGO_THREE_SVG_VIEWBOX_SIZE,
} as const;

export const TRANSITION_CUBE_DEFAULT_SELECTED_KEY = voxelKey(1, 1, 1);
export const TRANSITION_CUBE_DEFAULT_END_OFFSET = {
  x: 72,
  y: -44,
} as const;

const CUBE_FACE_DEFINITIONS = [
  {
    colorKey: "right",
    key: "positive-x",
    materialOrder: 0,
    neighborDelta: [1, 0, 0],
    normal: { x: 1, y: 0, z: 0 },
    readVertices: ({ x1, y0, y1, z0, z1 }) => [
      { x: x1, y: y0, z: z0 },
      { x: x1, y: y1, z: z0 },
      { x: x1, y: y1, z: z1 },
      { x: x1, y: y0, z: z1 },
    ],
  },
  {
    colorKey: "right",
    key: "negative-x",
    materialOrder: 1,
    neighborDelta: [-1, 0, 0],
    normal: { x: -1, y: 0, z: 0 },
    readVertices: ({ x0, y0, y1, z0, z1 }) => [
      { x: x0, y: y0, z: z1 },
      { x: x0, y: y1, z: z1 },
      { x: x0, y: y1, z: z0 },
      { x: x0, y: y0, z: z0 },
    ],
  },
  {
    colorKey: "top",
    key: "positive-y",
    materialOrder: 2,
    neighborDelta: [0, 1, 0],
    normal: { x: 0, y: 1, z: 0 },
    readVertices: ({ x0, x1, y1, z0, z1 }) => [
      { x: x0, y: y1, z: z1 },
      { x: x1, y: y1, z: z1 },
      { x: x1, y: y1, z: z0 },
      { x: x0, y: y1, z: z0 },
    ],
  },
  {
    colorKey: "top",
    key: "negative-y",
    materialOrder: 3,
    neighborDelta: [0, -1, 0],
    normal: { x: 0, y: -1, z: 0 },
    readVertices: ({ x0, x1, y0, z0, z1 }) => [
      { x: x0, y: y0, z: z0 },
      { x: x1, y: y0, z: z0 },
      { x: x1, y: y0, z: z1 },
      { x: x0, y: y0, z: z1 },
    ],
  },
  {
    colorKey: "left",
    key: "positive-z",
    materialOrder: 4,
    neighborDelta: [0, 0, 1],
    normal: { x: 0, y: 0, z: 1 },
    readVertices: ({ x0, x1, y0, y1, z1 }) => [
      { x: x0, y: y0, z: z1 },
      { x: x1, y: y0, z: z1 },
      { x: x1, y: y1, z: z1 },
      { x: x0, y: y1, z: z1 },
    ],
  },
  {
    colorKey: "left",
    key: "negative-z",
    materialOrder: 5,
    neighborDelta: [0, 0, -1],
    normal: { x: 0, y: 0, z: -1 },
    readVertices: ({ x0, x1, y0, y1, z0 }) => [
      { x: x1, y: y0, z: z0 },
      { x: x0, y: y0, z: z0 },
      { x: x0, y: y1, z: z0 },
      { x: x1, y: y1, z: z0 },
    ],
  },
] as const satisfies readonly CubeFaceDefinition[];

const STANDARD_TWO_BY_TWO_CUBE_COORDINATES = [
  [0, 0, 0],
  [1, 0, 0],
  [0, 1, 0],
  [1, 1, 0],
  [0, 0, 1],
  [1, 0, 1],
  [0, 1, 1],
  [1, 1, 1],
] as const satisfies readonly VoxelCoordinate[];

function dotWorldPoints(left: LogoWorldPoint, right: LogoWorldPoint): number {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

function getCubeLabel([x, y, z]: VoxelCoordinate): string {
  return `Cube ${x + 1},${y + 1},${z + 1}`;
}

function getCubeBounds([x, y, z]: VoxelCoordinate): CubeBounds {
  const halfGrid = LOGO_GRID_SIZE_2 / 2;

  return {
    x0: x - halfGrid,
    x1: x + 1 - halfGrid,
    y0: y - halfGrid,
    y1: y + 1 - halfGrid,
    z0: z - halfGrid,
    z1: z + 1 - halfGrid,
  };
}

function getCubeCenter(bounds: CubeBounds): LogoWorldPoint {
  return {
    x: (bounds.x0 + bounds.x1) / 2,
    y: (bounds.y0 + bounds.y1) / 2,
    z: (bounds.z0 + bounds.z1) / 2,
  };
}

function getFaceCenter(vertices: readonly LogoWorldPoint[]): LogoWorldPoint {
  return vertices.reduce(
    (sum, vertex) => ({
      x: sum.x + vertex.x / vertices.length,
      y: sum.y + vertex.y / vertices.length,
      z: sum.z + vertex.z / vertices.length,
    }),
    { x: 0, y: 0, z: 0 },
  );
}

function addCoordinate(coordinate: VoxelCoordinate, delta: VoxelCoordinate): VoxelCoordinate {
  return [coordinate[0] + delta[0], coordinate[1] + delta[1], coordinate[2] + delta[2]];
}

function getCoordinateKey(coordinate: VoxelCoordinate): string {
  return voxelKey(coordinate[0], coordinate[1], coordinate[2]);
}

function createWorldFaces(filledCubeKeys: ReadonlySet<string>): CubeWorldFace[] {
  const faces: CubeWorldFace[] = [];

  for (const coordinate of STANDARD_TWO_BY_TWO_CUBE_COORDINATES) {
    const bounds = getCubeBounds(coordinate);
    const cubeKey = getCoordinateKey(coordinate);
    const cubeLabel = getCubeLabel(coordinate);

    for (const definition of CUBE_FACE_DEFINITIONS) {
      const neighborCoordinate = addCoordinate(coordinate, definition.neighborDelta);
      if (filledCubeKeys.has(getCoordinateKey(neighborCoordinate))) {
        continue;
      }

      faces.push({
        color: getTailwindColorHex(DEFAULT_FACE_COLORS[definition.colorKey]),
        colorKey: definition.colorKey,
        cubeKey,
        cubeLabel,
        key: `${cubeKey}:${definition.key}`,
        materialOrder: definition.materialOrder,
        normal: definition.normal,
        vertices: definition.readVertices(bounds),
      });
    }
  }

  return faces;
}

export function createStandardTwoByTwoTransitionCubeScene({
  elevationDegrees = STATIC_LOGO_ELEVATION_DEGREES,
  rotationDegrees = STATIC_LOGO_ROTATION_DEGREES,
}: {
  elevationDegrees?: number;
  rotationDegrees?: number;
} = {}): TransitionCubeScene {
  const filledCubeKeys = new Set(
    STANDARD_TWO_BY_TWO_CUBE_COORDINATES.map((coordinate) => getCoordinateKey(coordinate)),
  );
  const worldFaces = createWorldFaces(filledCubeKeys);
  const cubeCenters = STANDARD_TWO_BY_TWO_CUBE_COORDINATES.map((coordinate) =>
    getCubeCenter(getCubeBounds(coordinate)),
  );
  const projector = createLogoProjector({
    elevationDegrees,
    rotationDegrees,
    scenePoints: [...worldFaces.flatMap((face) => face.vertices), ...cubeCenters],
    viewBoxSize: TRANSITION_CUBE_SCENE_VIEW_BOX.width,
  });
  const cubes = STANDARD_TWO_BY_TWO_CUBE_COORDINATES.map((coordinate) => {
    const center = getCubeCenter(getCubeBounds(coordinate));

    return {
      coordinate,
      key: getCoordinateKey(coordinate),
      label: getCubeLabel(coordinate),
      projectedCenter: projector.projectRotatedPoint(projector.rotateWorldPoint(center)),
    };
  });
  const faces = worldFaces
    .map((face) => {
      const normal = projector.rotateWorldPoint(face.normal);
      if (dotWorldPoints(normal, projector.cameraDirection) <= 0) {
        return null;
      }

      const rotatedVertices = face.vertices.map((vertex) => projector.rotateWorldPoint(vertex));
      const center = getFaceCenter(rotatedVertices);

      return {
        color: face.color,
        colorKey: face.colorKey,
        cubeKey: face.cubeKey,
        cubeLabel: face.cubeLabel,
        depth: dotWorldPoints(center, projector.cameraDirection),
        key: face.key,
        materialOrder: face.materialOrder,
        points: rotatedVertices.map((vertex) => projector.projectRotatedPoint(vertex)),
      };
    })
    .filter((face) => face !== null)
    .sort((left, right) => {
      if (left.depth !== right.depth) {
        return left.depth - right.depth;
      }

      return left.materialOrder - right.materialOrder;
    });

  return {
    cubes,
    faces,
    viewBox: TRANSITION_CUBE_SCENE_VIEW_BOX,
  };
}

export const STANDARD_TWO_BY_TWO_TRANSITION_CUBE_SCENE =
  createStandardTwoByTwoTransitionCubeScene();
