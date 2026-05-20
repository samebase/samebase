import { type FaceColorKey } from "./logoTailwindColors";
import { GRID_SIZE, isWithinVoxelGrid, parseVoxelKey } from "./logoVoxelState";

type Rectangle = {
  column: number;
  height: number;
  row: number;
  width: number;
};

type FacePlaneMap = Map<number, Set<number>>;

type SurfaceFacePlanes = {
  negativeX: FacePlaneMap;
  negativeY: FacePlaneMap;
  negativeZ: FacePlaneMap;
  positiveX: FacePlaneMap;
  positiveY: FacePlaneMap;
  positiveZ: FacePlaneMap;
};

type FilledVoxelCoordinates = {
  coordinates: LogoSurfaceVertex[];
  filledCells: ReadonlySet<number>;
};

export type LogoSurfaceVertex = readonly [number, number, number];
export type LogoSurfaceUv = readonly [number, number];

export type LogoSurfaceQuad = {
  colorKey: FaceColorKey;
  key: string;
  materialIndex: number;
  normal: LogoSurfaceVertex;
  vertices: readonly [
    LogoSurfaceVertex,
    LogoSurfaceVertex,
    LogoSurfaceVertex,
    LogoSurfaceVertex,
  ];
};

export function getLogoSurfaceVertexUv(
  surfaceQuad: LogoSurfaceQuad,
  vertex: LogoSurfaceVertex,
): LogoSurfaceUv {
  switch (surfaceQuad.colorKey) {
    case "left":
      return [vertex[0], vertex[1]];
    case "right":
      return [vertex[2], vertex[1]];
    case "top":
      return [vertex[0], vertex[2]];
    default: {
      const unreachable = surfaceQuad.colorKey satisfies never;
      return unreachable;
    }
  }
}

function collectSparseRectangles(
  cells: ReadonlySet<number> | undefined,
  gridSize: number,
): Rectangle[] {
  if (!cells || cells.size === 0) {
    return [];
  }

  const visited = new Set<number>();
  const rectangles: Rectangle[] = [];
  const sortedCells = [...cells].sort((left, right) => left - right);

  for (const cell of sortedCells) {
    if (visited.has(cell)) {
      continue;
    }

    const row = Math.floor(cell / gridSize);
    const column = cell % gridSize;
    let width = 1;

    while (column + width < gridSize) {
      const nextCell = row * gridSize + column + width;
      if (!cells.has(nextCell) || visited.has(nextCell)) {
        break;
      }
      width += 1;
    }

    let height = 1;
    let canGrow = true;
    while (row + height < gridSize && canGrow) {
      for (
        let nextColumn = column;
        nextColumn < column + width;
        nextColumn += 1
      ) {
        const nextCell = (row + height) * gridSize + nextColumn;
        if (!cells.has(nextCell) || visited.has(nextCell)) {
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
        visited.add(nextRow * gridSize + nextColumn);
      }
    }

    rectangles.push({ column, height, row, width });
  }

  return rectangles;
}

function isVoxelFilled(
  filledCells: ReadonlySet<number>,
  gridSize: number,
  x: number,
  y: number,
  z: number,
): boolean {
  if (!isWithinVoxelGrid(gridSize, x, y, z)) {
    return false;
  }

  return filledCells.has(toVoxelCell(gridSize, x, y, z));
}

function addFaceCell(
  facePlanes: FacePlaneMap,
  gridSize: number,
  plane: number,
  row: number,
  column: number,
) {
  const cell = row * gridSize + column;
  const existingCells = facePlanes.get(plane);
  if (existingCells) {
    existingCells.add(cell);
    return;
  }

  facePlanes.set(plane, new Set([cell]));
}

function toVoxelCell(
  gridSize: number,
  x: number,
  y: number,
  z: number,
): number {
  return (x * gridSize + y) * gridSize + z;
}

function readFilledVoxelCoordinates(
  filledVoxels: ReadonlySet<string>,
  gridSize: number,
): FilledVoxelCoordinates {
  const coordinates: LogoSurfaceVertex[] = [];
  const filledCells = new Set<number>();

  for (const key of filledVoxels) {
    const coordinate = parseVoxelKey(key);
    if (!coordinate) {
      continue;
    }

    const [x, y, z] = coordinate;
    if (!isWithinVoxelGrid(gridSize, x, y, z)) {
      continue;
    }

    coordinates.push(coordinate);
    filledCells.add(toVoxelCell(gridSize, x, y, z));
  }

  return { coordinates, filledCells };
}

function collectSurfaceFacePlanes(
  filledVoxelCoordinates: FilledVoxelCoordinates,
  gridSize: number,
): SurfaceFacePlanes {
  const facePlanes: SurfaceFacePlanes = {
    negativeX: new Map(),
    negativeY: new Map(),
    negativeZ: new Map(),
    positiveX: new Map(),
    positiveY: new Map(),
    positiveZ: new Map(),
  };

  for (const coordinate of filledVoxelCoordinates.coordinates) {
    const [x, y, z] = coordinate;

    if (
      !isVoxelFilled(filledVoxelCoordinates.filledCells, gridSize, x + 1, y, z)
    ) {
      addFaceCell(facePlanes.positiveX, gridSize, x, y, z);
    }
    if (
      !isVoxelFilled(filledVoxelCoordinates.filledCells, gridSize, x - 1, y, z)
    ) {
      addFaceCell(facePlanes.negativeX, gridSize, x, y, z);
    }
    if (
      !isVoxelFilled(filledVoxelCoordinates.filledCells, gridSize, x, y + 1, z)
    ) {
      addFaceCell(facePlanes.positiveY, gridSize, y, x, z);
    }
    if (
      !isVoxelFilled(filledVoxelCoordinates.filledCells, gridSize, x, y - 1, z)
    ) {
      addFaceCell(facePlanes.negativeY, gridSize, y, x, z);
    }
    if (
      !isVoxelFilled(filledVoxelCoordinates.filledCells, gridSize, x, y, z + 1)
    ) {
      addFaceCell(facePlanes.positiveZ, gridSize, z, x, y);
    }
    if (
      !isVoxelFilled(filledVoxelCoordinates.filledCells, gridSize, x, y, z - 1)
    ) {
      addFaceCell(facePlanes.negativeZ, gridSize, z, x, y);
    }
  }

  return facePlanes;
}

function toWorld(boundaryIndex: number, gridSize: number): number {
  return boundaryIndex - gridSize / 2;
}

/**
 * Converts settled voxels into merged exposed faces. Renderers should treat
 * this as derived geometry; moving cubes stay as transient motion state above
 * the settled voxel shape.
 */
export function buildLogoSurfaceQuads(
  filledVoxels: ReadonlySet<string>,
  gridSize = GRID_SIZE,
): LogoSurfaceQuad[] {
  const quads: LogoSurfaceQuad[] = [];
  const facePlanes = collectSurfaceFacePlanes(
    readFilledVoxelCoordinates(filledVoxels, gridSize),
    gridSize,
  );

  for (let x = 0; x < gridSize; x += 1) {
    for (const rectangle of collectSparseRectangles(
      facePlanes.positiveX.get(x),
      gridSize,
    )) {
      const plane = toWorld(x + 1, gridSize);
      const y0 = toWorld(rectangle.row, gridSize);
      const y1 = toWorld(rectangle.row + rectangle.height, gridSize);
      const z0 = toWorld(rectangle.column, gridSize);
      const z1 = toWorld(rectangle.column + rectangle.width, gridSize);
      quads.push({
        colorKey: "right",
        key: `positive-x:${x}:${rectangle.row}:${rectangle.column}:${rectangle.height}:${rectangle.width}`,
        materialIndex: 0,
        normal: [1, 0, 0],
        vertices: [
          [plane, y0, z0],
          [plane, y1, z0],
          [plane, y1, z1],
          [plane, y0, z1],
        ],
      });
    }

    for (const rectangle of collectSparseRectangles(
      facePlanes.negativeX.get(x),
      gridSize,
    )) {
      const plane = toWorld(x, gridSize);
      const y0 = toWorld(rectangle.row, gridSize);
      const y1 = toWorld(rectangle.row + rectangle.height, gridSize);
      const z0 = toWorld(rectangle.column, gridSize);
      const z1 = toWorld(rectangle.column + rectangle.width, gridSize);
      quads.push({
        colorKey: "right",
        key: `negative-x:${x}:${rectangle.row}:${rectangle.column}:${rectangle.height}:${rectangle.width}`,
        materialIndex: 1,
        normal: [-1, 0, 0],
        vertices: [
          [plane, y0, z1],
          [plane, y1, z1],
          [plane, y1, z0],
          [plane, y0, z0],
        ],
      });
    }
  }

  for (let y = 0; y < gridSize; y += 1) {
    for (const rectangle of collectSparseRectangles(
      facePlanes.positiveY.get(y),
      gridSize,
    )) {
      const plane = toWorld(y + 1, gridSize);
      const x0 = toWorld(rectangle.row, gridSize);
      const x1 = toWorld(rectangle.row + rectangle.height, gridSize);
      const z0 = toWorld(rectangle.column, gridSize);
      const z1 = toWorld(rectangle.column + rectangle.width, gridSize);
      quads.push({
        colorKey: "top",
        key: `positive-y:${y}:${rectangle.row}:${rectangle.column}:${rectangle.height}:${rectangle.width}`,
        materialIndex: 2,
        normal: [0, 1, 0],
        vertices: [
          [x0, plane, z1],
          [x1, plane, z1],
          [x1, plane, z0],
          [x0, plane, z0],
        ],
      });
    }

    for (const rectangle of collectSparseRectangles(
      facePlanes.negativeY.get(y),
      gridSize,
    )) {
      const plane = toWorld(y, gridSize);
      const x0 = toWorld(rectangle.row, gridSize);
      const x1 = toWorld(rectangle.row + rectangle.height, gridSize);
      const z0 = toWorld(rectangle.column, gridSize);
      const z1 = toWorld(rectangle.column + rectangle.width, gridSize);
      quads.push({
        colorKey: "top",
        key: `negative-y:${y}:${rectangle.row}:${rectangle.column}:${rectangle.height}:${rectangle.width}`,
        materialIndex: 3,
        normal: [0, -1, 0],
        vertices: [
          [x0, plane, z0],
          [x1, plane, z0],
          [x1, plane, z1],
          [x0, plane, z1],
        ],
      });
    }
  }

  for (let z = 0; z < gridSize; z += 1) {
    for (const rectangle of collectSparseRectangles(
      facePlanes.positiveZ.get(z),
      gridSize,
    )) {
      const plane = toWorld(z + 1, gridSize);
      const x0 = toWorld(rectangle.row, gridSize);
      const x1 = toWorld(rectangle.row + rectangle.height, gridSize);
      const y0 = toWorld(rectangle.column, gridSize);
      const y1 = toWorld(rectangle.column + rectangle.width, gridSize);
      quads.push({
        colorKey: "left",
        key: `positive-z:${z}:${rectangle.row}:${rectangle.column}:${rectangle.height}:${rectangle.width}`,
        materialIndex: 4,
        normal: [0, 0, 1],
        vertices: [
          [x0, y0, plane],
          [x1, y0, plane],
          [x1, y1, plane],
          [x0, y1, plane],
        ],
      });
    }

    for (const rectangle of collectSparseRectangles(
      facePlanes.negativeZ.get(z),
      gridSize,
    )) {
      const plane = toWorld(z, gridSize);
      const x0 = toWorld(rectangle.row, gridSize);
      const x1 = toWorld(rectangle.row + rectangle.height, gridSize);
      const y0 = toWorld(rectangle.column, gridSize);
      const y1 = toWorld(rectangle.column + rectangle.width, gridSize);
      quads.push({
        colorKey: "left",
        key: `negative-z:${z}:${rectangle.row}:${rectangle.column}:${rectangle.height}:${rectangle.width}`,
        materialIndex: 5,
        normal: [0, 0, -1],
        vertices: [
          [x0, y1, plane],
          [x1, y1, plane],
          [x1, y0, plane],
          [x0, y0, plane],
        ],
      });
    }
  }

  return quads;
}

export function getLogoSurfaceFitRadius(
  surfaceQuads: readonly LogoSurfaceQuad[],
  gridSize = GRID_SIZE,
): number {
  let fitRadius = 0;

  for (const surfaceQuad of surfaceQuads) {
    for (const [x, y, z] of surfaceQuad.vertices) {
      fitRadius = Math.max(fitRadius, Math.hypot(x, y, z));
    }
  }

  return fitRadius || (gridSize / 2) * Math.sqrt(3);
}
