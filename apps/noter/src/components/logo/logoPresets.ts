import {
  DEFAULT_VOXEL_STATE,
  GRID_SIZE,
  createFilledVoxelSet,
  serializeVoxelState,
  type VoxelCoordinate,
} from "@/components/logo/logoVoxelState";

export const CUSTOM_LOGO_PRESET_ID = "custom";
export const DEFAULT_LOGO_PRESET_ID = "checker-lattice";

export type LogoPresetId =
  | "checker-lattice"
  | "cornerless-cube"
  | "full-cube"
  | "n-logo"
  | "sierpinski-carpet";
export type LogoPresetSelection = LogoPresetId | typeof CUSTOM_LOGO_PRESET_ID;

type LogoPreset = {
  description: string;
  id: LogoPresetId;
  label: string;
  voxelState: string;
};

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
  );
}

function createCornerlessCubeVoxelState(): string {
  const coordinates: VoxelCoordinate[] = [];

  for (let x = 0; x < GRID_SIZE; x += 1) {
    for (let y = 0; y < GRID_SIZE; y += 1) {
      for (let z = 0; z < GRID_SIZE; z += 1) {
        const isCornerX = x === 0 || x === GRID_SIZE - 1;
        const isCornerY = y === 0 || y === GRID_SIZE - 1;
        const isCornerZ = z === 0 || z === GRID_SIZE - 1;

        if (isCornerX && isCornerY && isCornerZ) {
          continue;
        }

        coordinates.push([x, y, z] as const);
      }
    }
  }

  return serializeVoxelState(createFilledVoxelSet(coordinates));
}

function createFullCubeVoxelState(): string {
  const coordinates: VoxelCoordinate[] = [];

  for (let x = 0; x < GRID_SIZE; x += 1) {
    for (let y = 0; y < GRID_SIZE; y += 1) {
      for (let z = 0; z < GRID_SIZE; z += 1) {
        coordinates.push([x, y, z] as const);
      }
    }
  }

  return serializeVoxelState(createFilledVoxelSet(coordinates));
}

function createSierpinskiCarpetVoxelState(): string {
  const coordinates: VoxelCoordinate[] = [];
  const centerIndex = Math.floor(GRID_SIZE / 2);

  for (let x = 0; x < GRID_SIZE; x += 1) {
    for (let y = 0; y < GRID_SIZE; y += 1) {
      for (let z = 0; z < GRID_SIZE; z += 1) {
        const centerAxisCount =
          Number(x === centerIndex) + Number(y === centerIndex) + Number(z === centerIndex);

        if (centerAxisCount >= 2) {
          continue;
        }

        coordinates.push([x, y, z] as const);
      }
    }
  }

  return serializeVoxelState(createFilledVoxelSet(coordinates));
}

export const LOGO_PRESETS = [
  {
    description: "Three-layer alternating lattice with the center cube removed",
    id: "checker-lattice",
    label: "Checker Lattice",
    voxelState: DEFAULT_VOXEL_STATE,
  },
  {
    description: "Original lowercase n voxel mark",
    id: "n-logo",
    label: "N Logo",
    voxelState: createNLogoVoxelState(),
  },
  {
    description: "3x3x3 level-1 carpet with corners kept and face centers open",
    id: "sierpinski-carpet",
    label: "Sierpinski Carpet",
    voxelState: createSierpinskiCarpetVoxelState(),
  },
  {
    description: "Solid 3x3x3 block for spotting raster seams across full faces",
    id: "full-cube",
    label: "Full Cube",
    voxelState: createFullCubeVoxelState(),
  },
  {
    description: "3x3x3 cube with all 8 corner cubes removed",
    id: "cornerless-cube",
    label: "Cornerless Cube",
    voxelState: createCornerlessCubeVoxelState(),
  },
] as const satisfies readonly LogoPreset[];

export function getLogoPresetSelection(voxelState: string): LogoPresetSelection {
  for (const preset of LOGO_PRESETS) {
    if (preset.voxelState === voxelState) {
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
