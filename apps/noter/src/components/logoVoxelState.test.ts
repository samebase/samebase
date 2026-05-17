import { describe, expect, it } from "vite-plus/test";
import {
  createLogoFractalVoxelGrid,
  normalizeLogoFractalDepth,
  voxelKey,
} from "@/components/logoVoxelState";

describe("logoVoxelState", () => {
  it("creates the first cornerless carpet iteration as the current mark", () => {
    const voxelGrid = createLogoFractalVoxelGrid(1);

    expect(voxelGrid.gridSize).toBe(3);
    expect(voxelGrid.filledVoxels.size).toBe(12);
    expect(voxelGrid.filledVoxels.has(voxelKey(0, 0, 0))).toBe(false);
    expect(voxelGrid.filledVoxels.has(voxelKey(1, 0, 0))).toBe(true);
    expect(voxelGrid.filledVoxels.has(voxelKey(1, 1, 1))).toBe(false);
  });

  it("keeps recursive 3D corners empty while preserving the side carpet", () => {
    const voxelGrid = createLogoFractalVoxelGrid(2);
    const projectedCells = new Set<string>();

    for (const key of voxelGrid.filledVoxels) {
      const parts = key.split(",");
      if (parts.length !== 3) {
        throw new Error(`Unexpected voxel key: ${key}`);
      }
      projectedCells.add(`${parts[1]},${parts[2]}`);
    }

    expect(voxelGrid.gridSize).toBe(9);
    expect(voxelGrid.filledVoxels.has(voxelKey(0, 0, 0))).toBe(false);
    expect(voxelGrid.filledVoxels.has(voxelKey(8, 8, 8))).toBe(false);
    expect(projectedCells.size).toBe(64);
    expect(projectedCells.has("4,4")).toBe(false);
  });

  it("caps logo fractal depth to the supported render range", () => {
    expect(normalizeLogoFractalDepth(0)).toBe(1);
    expect(normalizeLogoFractalDepth(2.4)).toBe(2);
    expect(normalizeLogoFractalDepth(99)).toBe(3);
  });
});
