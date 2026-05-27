import {
  DEFAULT_VOXEL_STATE,
  LOGO_GRID_SIZE_2,
  LOGO_GRID_SIZE_3,
  createDefaultVoxelState,
  createFilledVoxelSet,
  serializeVoxelState,
  type LogoGridSize,
  type VoxelCoordinate,
} from "@/components/logo/logoVoxelState";

export const CUSTOM_LOGO_PRESET_ID = "custom";
export const DEFAULT_LOGO_PRESET_ID = "checker-lattice-3";

export type LogoPresetId =
  | "checker-lattice"
  | "checker-lattice-3"
  | "cornerless-cube"
  | "full-cube-2"
  | "full-cube"
  | "n-logo"
  | "sierpinski-carpet";
export type LogoPresetSelection = LogoPresetId | typeof CUSTOM_LOGO_PRESET_ID;

type LogoPreset = {
  description: string;
  gridSize: LogoGridSize;
  id: LogoPresetId;
  label: string;
  voxelState: string;
};
type LogoPresetList = readonly [LogoPreset, ...LogoPreset[]];

function createNLogoVoxelState(): string {
  return serializeVoxelState(
    createFilledVoxelSet([
      [0, 0, 1],
      [0, 0, 2],
      [0, 1, 0],
      [0, 1, 2],
      [0, 2, 0],
      [0, 2, 2],
      [1, 0, 0],
      [1, 2, 0],
      [1, 2, 2],
      [2, 0, 0],
      [2, 0, 1],
      [2, 0, 2],
      [2, 1, 2],
      [2, 2, 0],
      [2, 2, 1],
    ]),
    LOGO_GRID_SIZE_3,
  );
}

function createCornerlessCubeVoxelState(gridSize: LogoGridSize): string {
  const coordinates: VoxelCoordinate[] = [];

  for (let x = 0; x < gridSize; x += 1) {
    for (let y = 0; y < gridSize; y += 1) {
      for (let z = 0; z < gridSize; z += 1) {
        const isCornerX = x === 0 || x === gridSize - 1;
        const isCornerY = y === 0 || y === gridSize - 1;
        const isCornerZ = z === 0 || z === gridSize - 1;

        if (isCornerX && isCornerY && isCornerZ) {
          continue;
        }

        coordinates.push([x, y, z] as const);
      }
    }
  }

  return serializeVoxelState(createFilledVoxelSet(coordinates), gridSize);
}

function createFullCubeVoxelState(gridSize: LogoGridSize): string {
  const coordinates: VoxelCoordinate[] = [];

  for (let x = 0; x < gridSize; x += 1) {
    for (let y = 0; y < gridSize; y += 1) {
      for (let z = 0; z < gridSize; z += 1) {
        coordinates.push([x, y, z] as const);
      }
    }
  }

  return serializeVoxelState(createFilledVoxelSet(coordinates), gridSize);
}

function createSierpinskiCarpetVoxelState(): string {
  const coordinates: VoxelCoordinate[] = [];
  const centerIndex = Math.floor(LOGO_GRID_SIZE_3 / 2);

  for (let x = 0; x < LOGO_GRID_SIZE_3; x += 1) {
    for (let y = 0; y < LOGO_GRID_SIZE_3; y += 1) {
      for (let z = 0; z < LOGO_GRID_SIZE_3; z += 1) {
        const centerAxisCount =
          Number(x === centerIndex) + Number(y === centerIndex) + Number(z === centerIndex);

        if (centerAxisCount >= 2) {
          continue;
        }

        coordinates.push([x, y, z] as const);
      }
    }
  }

  return serializeVoxelState(createFilledVoxelSet(coordinates), LOGO_GRID_SIZE_3);
}

export const LOGO_PRESETS = [
  {
    description: "3x3x3 alternating lattice with the center cube removed",
    gridSize: LOGO_GRID_SIZE_3,
    id: "checker-lattice-3",
    label: "Checker 3",
    voxelState: DEFAULT_VOXEL_STATE,
  },
  {
    description: "Default 2x2x2 recursive exploration motif",
    gridSize: LOGO_GRID_SIZE_2,
    id: "checker-lattice",
    label: "Default 2",
    voxelState: createDefaultVoxelState(LOGO_GRID_SIZE_2),
  },
  {
    description: "Original lowercase n voxel mark",
    gridSize: LOGO_GRID_SIZE_3,
    id: "n-logo",
    label: "N Logo",
    voxelState: createNLogoVoxelState(),
  },
  {
    description: "3x3x3 level-1 carpet with corners kept and face centers open",
    gridSize: LOGO_GRID_SIZE_3,
    id: "sierpinski-carpet",
    label: "Sierpinski Carpet",
    voxelState: createSierpinskiCarpetVoxelState(),
  },
  {
    description: "Solid 2x2x2 block for spotting raster seams across full faces",
    gridSize: LOGO_GRID_SIZE_2,
    id: "full-cube-2",
    label: "Full Cube 2",
    voxelState: createFullCubeVoxelState(LOGO_GRID_SIZE_2),
  },
  {
    description: "Solid 3x3x3 block for spotting raster seams across full faces",
    gridSize: LOGO_GRID_SIZE_3,
    id: "full-cube",
    label: "Full Cube 3",
    voxelState: createFullCubeVoxelState(LOGO_GRID_SIZE_3),
  },
  {
    description: "3x3x3 cube with all 8 corner cubes removed",
    gridSize: LOGO_GRID_SIZE_3,
    id: "cornerless-cube",
    label: "Cornerless Cube",
    voxelState: createCornerlessCubeVoxelState(LOGO_GRID_SIZE_3),
  },
] as const satisfies LogoPresetList;

export function getLogoPresetSelection(
  voxelState: string,
  gridSize: LogoGridSize,
): LogoPresetSelection {
  for (const preset of LOGO_PRESETS) {
    if (preset.gridSize === gridSize && preset.voxelState === voxelState) {
      return preset.id;
    }
  }

  return CUSTOM_LOGO_PRESET_ID;
}

export function getLogoPreset(presetId: LogoPresetId): (typeof LOGO_PRESETS)[number] {
  for (const preset of LOGO_PRESETS) {
    if (preset.id === presetId) {
      return preset;
    }
  }

  return LOGO_PRESETS[0];
}
