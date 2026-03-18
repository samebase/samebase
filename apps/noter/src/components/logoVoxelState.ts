export const GRID_SIZE = 3;
export const HALF_GRID = GRID_SIZE / 2;
export const DEFAULT_ROTATION_DEGREES = 0;
export const DEFAULT_ELEVATION_DEGREES = 29.5;
export const MIN_ELEVATION_DEGREES = 0;
export const MAX_ELEVATION_DEGREES = 360;
const LEGACY_VOXEL_LAYER_SEPARATOR = ",";
const LEGACY_VOXEL_ROW_SEPARATOR = "/";
const VOXEL_LAYER_SEPARATOR = "-";
const VOXEL_ROW_SEPARATOR = "_";

export type VoxelCoordinate = readonly [number, number, number];

export type VoxelEdit = {
  coordinate: VoxelCoordinate;
  kind: "add" | "remove";
};

const defaultVoxelCoordinates = [
  [1, 2, 0],
  [0, 2, 1],
  [2, 2, 1],
  [1, 2, 2],
  [0, 1, 0],
  [2, 1, 0],
  [1, 1, 1],
  [0, 1, 2],
  [2, 1, 2],
  [1, 0, 0],
  [0, 0, 1],
  [2, 0, 1],
  [1, 0, 2],
] as const satisfies readonly VoxelCoordinate[];

export function voxelKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

export function isWithinGrid(x: number, y: number, z: number): boolean {
  return (
    x >= 0 &&
    x < GRID_SIZE &&
    y >= 0 &&
    y < GRID_SIZE &&
    z >= 0 &&
    z < GRID_SIZE
  );
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

export function createFilledVoxelSet(
  coordinates: readonly VoxelCoordinate[],
): Set<string> {
  return new Set(coordinates.map(([x, y, z]) => voxelKey(x, y, z)));
}

export function createDefaultFilledVoxelSet(): Set<string> {
  return createFilledVoxelSet(defaultVoxelCoordinates);
}

export function serializeVoxelState(filledVoxels: Set<string>): string {
  const layers: string[] = [];

  for (let y = GRID_SIZE - 1; y >= 0; y -= 1) {
    const rows: string[] = [];

    for (let z = 0; z < GRID_SIZE; z += 1) {
      let row = "";

      for (let x = 0; x < GRID_SIZE; x += 1) {
        row += filledVoxels.has(voxelKey(x, y, z)) ? "x" : "o";
      }

      rows.push(row);
    }

    layers.push(rows.join(VOXEL_ROW_SEPARATOR));
  }

  return layers.join(VOXEL_LAYER_SEPARATOR);
}

export function parseVoxelState(
  serializedState: string | null,
): Set<string> | null {
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
  if (layers.length !== GRID_SIZE) {
    return null;
  }

  const filledVoxels = new Set<string>();

  for (const [layerIndex, layer] of layers.entries()) {
    const rowSeparator = layer.includes(VOXEL_ROW_SEPARATOR)
      ? VOXEL_ROW_SEPARATOR
      : LEGACY_VOXEL_ROW_SEPARATOR;
    const rows = layer.split(rowSeparator);
    if (rows.length !== GRID_SIZE) {
      return null;
    }

    const y = GRID_SIZE - 1 - layerIndex;

    for (const [z, row] of rows.entries()) {
      if (row.length !== GRID_SIZE) {
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

  return filledVoxels;
}

export function applyVoxelEdit(
  serializedState: string,
  edit: VoxelEdit,
): string {
  const filledVoxels =
    parseVoxelState(serializedState) ?? createDefaultFilledVoxelSet();
  const [x, y, z] = edit.coordinate;

  if (!isWithinGrid(x, y, z)) {
    return serializeVoxelState(filledVoxels);
  }

  const key = voxelKey(x, y, z);
  if (edit.kind === "add") {
    filledVoxels.add(key);
  } else {
    filledVoxels.delete(key);
  }

  return serializeVoxelState(filledVoxels);
}

export const DEFAULT_VOXEL_STATE = serializeVoxelState(
  createDefaultFilledVoxelSet(),
);
