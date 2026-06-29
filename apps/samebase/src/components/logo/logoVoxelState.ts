import { includes } from "@samebase/dependent";

export const LOGO_GRID_SIZE_2 = 2;
export const LOGO_GRID_SIZE_3 = 3;
export const LOGO_GRID_SIZE_4 = 4;
export const LOGO_GRID_SIZE_5 = 5;
export const MIN_LOGO_GRID_SIZE = LOGO_GRID_SIZE_2;
export const MAX_LOGO_GRID_SIZE = 10;
export const LOGO_GRID_SIZE_OPTIONS = [
  LOGO_GRID_SIZE_2,
  LOGO_GRID_SIZE_3,
  LOGO_GRID_SIZE_4,
  LOGO_GRID_SIZE_5,
  6,
  7,
  8,
  9,
  MAX_LOGO_GRID_SIZE,
] as const;
export type LogoGridSize = (typeof LOGO_GRID_SIZE_OPTIONS)[number];
export const DEFAULT_LOGO_GRID_SIZE: LogoGridSize = LOGO_GRID_SIZE_3;
export const GRID_SIZE = LOGO_GRID_SIZE_3;
export const FAVICON_ROTATION_DEGREES = 45;
export const DEFAULT_ROTATION_DEGREES = FAVICON_ROTATION_DEGREES;
export const DEFAULT_ELEVATION_DEGREES = 35.26438968;
export const MIN_ELEVATION_DEGREES = 0;
export const MAX_ELEVATION_DEGREES = 360;
export const DEFAULT_LOGO_FRACTAL_DEPTH = 1;
export const MIN_LOGO_FRACTAL_DEPTH = 1;
const LEGACY_VOXEL_LAYER_SEPARATOR = ",";
const LEGACY_VOXEL_ROW_SEPARATOR = "/";
const VOXEL_LAYER_SEPARATOR = "-";
const VOXEL_ROW_SEPARATOR = "_";

export type VoxelCoordinate = readonly [number, number, number];

export type VoxelEdit = {
  coordinate: VoxelCoordinate;
  kind: "add" | "remove";
};

export type LogoVoxelGrid = {
  filledVoxels: ReadonlySet<string>;
  gridSize: number;
};

export type ParsedLogoVoxelState = {
  filledVoxels: Set<string>;
  gridSize: LogoGridSize;
};

const DEFAULT_LOGO_GRID_SIZE_2_COORDINATES = [
  [1, 1, 0],
  [0, 1, 1],
  [1, 0, 1],
] as const satisfies readonly VoxelCoordinate[];

export function voxelKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

export function parseVoxelKey(key: string): VoxelCoordinate | null {
  const parts = key.split(",");
  if (parts.length !== 3) {
    return null;
  }

  const [xText, yText, zText] = parts;
  const x = Number(xText);
  const y = Number(yText);
  const z = Number(zText);

  if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z)) {
    return null;
  }

  return [x, y, z];
}

export function isWithinGrid(x: number, y: number, z: number): boolean {
  return isWithinVoxelGrid(DEFAULT_LOGO_GRID_SIZE, x, y, z);
}

export function isWithinVoxelGrid(gridSize: number, x: number, y: number, z: number): boolean {
  return x >= 0 && x < gridSize && y >= 0 && y < gridSize && z >= 0 && z < gridSize;
}

export function readLogoGridSize(value: number): LogoGridSize | null {
  if (Number.isInteger(value) && includes(LOGO_GRID_SIZE_OPTIONS, value)) {
    return value;
  }

  return null;
}

export function normalizeLogoGridSize(value: number | undefined): LogoGridSize {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_LOGO_GRID_SIZE;
  }

  const roundedValue = Math.round(value);
  const clampedValue = Math.min(Math.max(roundedValue, MIN_LOGO_GRID_SIZE), MAX_LOGO_GRID_SIZE);
  return readLogoGridSize(clampedValue) ?? DEFAULT_LOGO_GRID_SIZE;
}

export function normalizeRotationDegrees(value: number): number {
  const wrappedValue = value % 360;
  if (wrappedValue < 0) {
    return wrappedValue + 360;
  }
  return wrappedValue;
}

export function normalizeElevationDegrees(value: number): number {
  return normalizeRotationDegrees(value);
}

export function createFilledVoxelSet(coordinates: readonly VoxelCoordinate[]): Set<string> {
  return new Set(coordinates.map(([x, y, z]) => voxelKey(x, y, z)));
}

function isExteriorVoxel(gridSize: LogoGridSize, x: number, y: number, z: number): boolean {
  return (
    x === 0 || y === 0 || z === 0 || x === gridSize - 1 || y === gridSize - 1 || z === gridSize - 1
  );
}

function isEvenGridDefaultViewNearCorner(
  gridSize: LogoGridSize,
  x: number,
  y: number,
  z: number,
): boolean {
  return (
    gridSize !== LOGO_GRID_SIZE_2 &&
    gridSize % 2 === 0 &&
    x === gridSize - 1 &&
    y === gridSize - 1 &&
    z === gridSize - 1
  );
}

export function createDefaultVoxelCoordinates(gridSize: LogoGridSize): VoxelCoordinate[] {
  if (gridSize === LOGO_GRID_SIZE_2) {
    return DEFAULT_LOGO_GRID_SIZE_2_COORDINATES.map(([x, y, z]): VoxelCoordinate => [x, y, z]);
  }

  const coordinates: VoxelCoordinate[] = [];

  for (let x = 0; x < gridSize; x += 1) {
    for (let y = 0; y < gridSize; y += 1) {
      for (let z = 0; z < gridSize; z += 1) {
        const isOddCheckerCell = (x + y + z) % 2 === 1;

        if (
          isOddCheckerCell &&
          isExteriorVoxel(gridSize, x, y, z) &&
          !isEvenGridDefaultViewNearCorner(gridSize, x, y, z)
        ) {
          coordinates.push([x, y, z]);
        }
      }
    }
  }

  return coordinates;
}

export function createDefaultFilledVoxelSet(gridSize: LogoGridSize): Set<string> {
  return createFilledVoxelSet(createDefaultVoxelCoordinates(gridSize));
}

export function createDefaultVoxelState(gridSize: LogoGridSize): string {
  return serializeVoxelState(createDefaultFilledVoxelSet(gridSize), gridSize);
}

export function normalizeLogoFractalDepth(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_LOGO_FRACTAL_DEPTH;
  }

  return Math.max(Math.round(value), MIN_LOGO_FRACTAL_DEPTH);
}

export function getLogoFractalGridSize(gridSize: LogoGridSize, depth: number): number {
  return gridSize ** normalizeLogoFractalDepth(depth);
}

function readBaseFractalCoordinates(
  filledVoxels: ReadonlySet<string>,
  gridSize: LogoGridSize,
): VoxelCoordinate[] {
  const coordinates: VoxelCoordinate[] = [];

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
  }

  return coordinates;
}

/**
 * Repeats the depth-1 motif in every filled voxel. The default motif is the
 * Samebase mark, which keeps recursive corners empty instead of becoming a
 * standard Menger sponge. Generation expands only from filled motif cells so
 * higher depths do not scan the empty recursive volume.
 */
export function createLogoFractalVoxelGrid({
  depth,
  filledVoxels,
  gridSize,
}: {
  depth: number;
  filledVoxels?: ReadonlySet<string>;
  gridSize: LogoGridSize;
}): LogoVoxelGrid {
  const normalizedDepth = normalizeLogoFractalDepth(depth);
  const resolvedFilledVoxels = filledVoxels ?? createDefaultFilledVoxelSet(gridSize);
  const fractalGridSize = getLogoFractalGridSize(gridSize, normalizedDepth);
  const baseCoordinates = readBaseFractalCoordinates(resolvedFilledVoxels, gridSize);
  const nextFilledVoxels = new Set<string>();
  let origins: VoxelCoordinate[] = [[0, 0, 0]];
  let scale = 1;

  for (let level = 0; level < normalizedDepth; level += 1) {
    const isFinalLevel = level === normalizedDepth - 1;
    const nextOrigins: VoxelCoordinate[] = [];

    for (const [originX, originY, originZ] of origins) {
      for (const [baseX, baseY, baseZ] of baseCoordinates) {
        const x = originX + baseX * scale;
        const y = originY + baseY * scale;
        const z = originZ + baseZ * scale;

        if (isFinalLevel) {
          nextFilledVoxels.add(voxelKey(x, y, z));
        } else {
          nextOrigins.push([x, y, z]);
        }
      }
    }

    origins = nextOrigins;
    scale *= gridSize;
  }

  return {
    filledVoxels: nextFilledVoxels,
    gridSize: fractalGridSize,
  };
}

export function serializeVoxelState(
  filledVoxels: ReadonlySet<string>,
  gridSize: LogoGridSize,
): string {
  const layers: string[] = [];

  for (let y = gridSize - 1; y >= 0; y -= 1) {
    const rows: string[] = [];

    for (let z = 0; z < gridSize; z += 1) {
      let row = "";

      for (let x = 0; x < gridSize; x += 1) {
        row += filledVoxels.has(voxelKey(x, y, z)) ? "x" : "o";
      }

      rows.push(row);
    }

    layers.push(rows.join(VOXEL_ROW_SEPARATOR));
  }

  return layers.join(VOXEL_LAYER_SEPARATOR);
}

export function parseVoxelState(serializedState: string | null): ParsedLogoVoxelState | null {
  if (!serializedState) {
    return null;
  }

  const layers = serializedState
    .trim()
    .toLowerCase()
    .split(
      serializedState.includes(VOXEL_LAYER_SEPARATOR)
        ? VOXEL_LAYER_SEPARATOR
        : LEGACY_VOXEL_LAYER_SEPARATOR,
    );
  const gridSize = readLogoGridSize(layers.length);
  if (gridSize === null) {
    return null;
  }

  const filledVoxels = new Set<string>();

  for (const [layerIndex, layer] of layers.entries()) {
    const rowSeparator = layer.includes(VOXEL_ROW_SEPARATOR)
      ? VOXEL_ROW_SEPARATOR
      : LEGACY_VOXEL_ROW_SEPARATOR;
    const rows = layer.split(rowSeparator);
    if (rows.length !== gridSize) {
      return null;
    }

    const y = gridSize - 1 - layerIndex;

    for (const [z, row] of rows.entries()) {
      if (row.length !== gridSize) {
        return null;
      }

      for (const [x, cell] of Array.from(row).entries()) {
        if (cell !== "x" && cell !== "o") {
          return null;
        }

        if (cell === "x") {
          filledVoxels.add(voxelKey(x, y, z));
        }
      }
    }
  }

  return {
    filledVoxels,
    gridSize,
  };
}

export function applyVoxelEdit(
  serializedState: string,
  gridSize: LogoGridSize,
  edit: VoxelEdit,
): string {
  const parsedState = parseVoxelState(serializedState);
  const filledVoxels =
    parsedState && parsedState.gridSize === gridSize
      ? parsedState.filledVoxels
      : createDefaultFilledVoxelSet(gridSize);
  const [x, y, z] = edit.coordinate;

  if (!isWithinVoxelGrid(gridSize, x, y, z)) {
    return serializeVoxelState(filledVoxels, gridSize);
  }

  const key = voxelKey(x, y, z);
  if (edit.kind === "add") {
    filledVoxels.add(key);
  } else {
    filledVoxels.delete(key);
  }

  return serializeVoxelState(filledVoxels, gridSize);
}

export const DEFAULT_VOXEL_STATE = createDefaultVoxelState(DEFAULT_LOGO_GRID_SIZE);
