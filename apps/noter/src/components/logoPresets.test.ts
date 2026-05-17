import { describe, expect, it } from "vite-plus/test";

import {
  getLogoPreset,
  getLogoPresetSelection,
} from "@/components/logoPresets";
import { parseVoxelState, voxelKey } from "@/components/logoVoxelState";

describe("logoPresets", () => {
  it("defines the Sierpinski carpet as a level-1 3x3x3 face-carpet model", () => {
    const preset = getLogoPreset("sierpinski-carpet");
    const filledVoxels = parseVoxelState(preset.voxelState);

    expect(preset.label).toBe("Sierpinski Carpet");
    expect(filledVoxels).not.toBeNull();
    if (filledVoxels === null) {
      throw new Error("Expected Sierpinski carpet preset to parse.");
    }

    expect(filledVoxels.size).toBe(20);
    expect(filledVoxels.has(voxelKey(0, 0, 0))).toBe(true);
    expect(filledVoxels.has(voxelKey(2, 2, 2))).toBe(true);
    expect(filledVoxels.has(voxelKey(1, 1, 1))).toBe(false);
    expect(filledVoxels.has(voxelKey(1, 1, 0))).toBe(false);
    expect(filledVoxels.has(voxelKey(1, 0, 1))).toBe(false);
    expect(filledVoxels.has(voxelKey(0, 1, 1))).toBe(false);
    expect(getLogoPresetSelection(preset.voxelState)).toBe("sierpinski-carpet");
  });
});
