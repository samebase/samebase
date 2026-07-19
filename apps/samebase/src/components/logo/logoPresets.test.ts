import { describe, expect, it } from "vite-plus/test";

import {
  DEFAULT_LOGO_PRESET_ID,
  getLogoPreset,
  getLogoPresetSelection,
} from "@/components/logo/logoPresets";
import {
  DEFAULT_LOGO_GRID_SIZE,
  DEFAULT_VOXEL_STATE,
  LOGO_GRID_SIZE_2,
  LOGO_GRID_SIZE_3,
  createDefaultVoxelState,
  parseVoxelState,
  voxelKey,
} from "@samebase/logo-model/voxel";

describe("logoPresets", () => {
  it("keeps the 3x3 checker preset aligned with the route default", () => {
    const preset = getLogoPreset(DEFAULT_LOGO_PRESET_ID);

    expect(DEFAULT_LOGO_PRESET_ID).toBe("checker-lattice-3");
    expect(preset.label).toBe("Checker 3");
    expect(preset.gridSize).toBe(DEFAULT_LOGO_GRID_SIZE);
    expect(preset.gridSize).toBe(LOGO_GRID_SIZE_3);
    expect(preset.voxelState).toBe(DEFAULT_VOXEL_STATE);
    expect(getLogoPresetSelection(preset.voxelState, preset.gridSize)).toBe("checker-lattice-3");
  });

  it("keeps the 2x2 default preset aligned with the 2x2 grid", () => {
    const preset = getLogoPreset("checker-lattice");

    expect(preset.label).toBe("Default 2");
    expect(preset.gridSize).toBe(LOGO_GRID_SIZE_2);
    expect(preset.voxelState).toBe(createDefaultVoxelState(LOGO_GRID_SIZE_2));
    expect(getLogoPresetSelection(preset.voxelState, preset.gridSize)).toBe("checker-lattice");
  });

  it("defines the Sierpinski carpet as a level-1 3x3x3 face-carpet model", () => {
    const preset = getLogoPreset("sierpinski-carpet");
    const filledVoxels = parseVoxelState(preset.voxelState);

    expect(preset.label).toBe("Sierpinski Carpet");
    expect(filledVoxels).not.toBeNull();
    if (filledVoxels === null) {
      throw new Error("Expected Sierpinski carpet preset to parse.");
    }

    expect(filledVoxels.gridSize).toBe(3);
    expect(filledVoxels.filledVoxels.size).toBe(20);
    expect(filledVoxels.filledVoxels.has(voxelKey(0, 0, 0))).toBe(true);
    expect(filledVoxels.filledVoxels.has(voxelKey(2, 2, 2))).toBe(true);
    expect(filledVoxels.filledVoxels.has(voxelKey(1, 1, 1))).toBe(false);
    expect(filledVoxels.filledVoxels.has(voxelKey(1, 1, 0))).toBe(false);
    expect(filledVoxels.filledVoxels.has(voxelKey(1, 0, 1))).toBe(false);
    expect(filledVoxels.filledVoxels.has(voxelKey(0, 1, 1))).toBe(false);
    expect(getLogoPresetSelection(preset.voxelState, preset.gridSize)).toBe("sierpinski-carpet");
  });

  it("defines the full cube as all 27 cells in the 3x3x3 grid", () => {
    const preset = getLogoPreset("full-cube");
    const filledVoxels = parseVoxelState(preset.voxelState);

    expect(preset.label).toBe("Full Cube 3");
    expect(filledVoxels).not.toBeNull();
    if (filledVoxels === null) {
      throw new Error("Expected full cube preset to parse.");
    }

    expect(filledVoxels.gridSize).toBe(3);
    expect(filledVoxels.filledVoxels.size).toBe(27);
    expect(filledVoxels.filledVoxels.has(voxelKey(0, 0, 0))).toBe(true);
    expect(filledVoxels.filledVoxels.has(voxelKey(1, 1, 1))).toBe(true);
    expect(filledVoxels.filledVoxels.has(voxelKey(2, 2, 2))).toBe(true);
    expect(getLogoPresetSelection(preset.voxelState, preset.gridSize)).toBe("full-cube");
  });
});
