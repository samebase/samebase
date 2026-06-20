import { describe, expect, it } from "vite-plus/test";

import {
  DEFAULT_LOGO_GRID_SIZE,
  DEFAULT_VOXEL_STATE,
  LOGO_GRID_SIZE_2,
  LOGO_GRID_SIZE_3,
  createDefaultFilledVoxelSet,
  createDefaultVoxelState,
  createLogoFractalVoxelGrid,
  normalizeLogoFractalDepth,
  voxelKey,
} from "@/components/logo/logoVoxelState";

describe("logoVoxelState", () => {
  it("keeps the 3x3 checker lattice as the global default mark", () => {
    const voxelGrid = createLogoFractalVoxelGrid({ depth: 1, gridSize: DEFAULT_LOGO_GRID_SIZE });

    expect(DEFAULT_LOGO_GRID_SIZE).toBe(LOGO_GRID_SIZE_3);
    expect(DEFAULT_VOXEL_STATE).toBe("oxo_xox_oxo-xox_ooo_xox-oxo_xox_oxo");
    expect(voxelGrid.gridSize).toBe(3);
    expect(voxelGrid.filledVoxels.size).toBe(12);
    expect(voxelGrid.filledVoxels).toEqual(createDefaultFilledVoxelSet(DEFAULT_LOGO_GRID_SIZE));
    expect(voxelGrid.filledVoxels.has(voxelKey(0, 0, 0))).toBe(false);
    expect(voxelGrid.filledVoxels.has(voxelKey(1, 0, 0))).toBe(true);
    expect(voxelGrid.filledVoxels.has(voxelKey(1, 1, 1))).toBe(false);
  });

  it("creates the 2x2 exploratory default mark when gridSize is 2", () => {
    const voxelGrid = createLogoFractalVoxelGrid({ depth: 1, gridSize: LOGO_GRID_SIZE_2 });

    expect(createDefaultVoxelState(LOGO_GRID_SIZE_2)).toBe("ox_xo-oo_ox");
    expect(voxelGrid.gridSize).toBe(2);
    expect(voxelGrid.filledVoxels.size).toBe(3);
    expect(voxelGrid.filledVoxels).toEqual(createDefaultFilledVoxelSet(LOGO_GRID_SIZE_2));
    expect(voxelGrid.filledVoxels.has(voxelKey(0, 0, 0))).toBe(false);
    expect(voxelGrid.filledVoxels.has(voxelKey(1, 0, 1))).toBe(true);
    expect(voxelGrid.filledVoxels.has(voxelKey(1, 1, 0))).toBe(true);
    expect(voxelGrid.filledVoxels.has(voxelKey(0, 1, 1))).toBe(true);
  });

  it("keeps recursive 3D corners empty while preserving the 3x3 side carpet", () => {
    const voxelGrid = createLogoFractalVoxelGrid({ depth: 2, gridSize: LOGO_GRID_SIZE_3 });
    const projectedCells = new Set<string>();

    for (const key of voxelGrid.filledVoxels) {
      const [xText, yText, zText] = key.split(",");
      if (typeof xText !== "string" || typeof yText !== "string" || typeof zText !== "string") {
        throw new Error(`Unexpected voxel key: ${key}`);
      }
      projectedCells.add(`${yText},${zText}`);
    }

    expect(voxelGrid.gridSize).toBe(9);
    expect(voxelGrid.filledVoxels.size).toBe(144);
    expect(voxelGrid.filledVoxels.has(voxelKey(0, 0, 0))).toBe(false);
    expect(voxelGrid.filledVoxels.has(voxelKey(8, 8, 8))).toBe(false);
    expect(projectedCells.size).toBe(64);
    expect(projectedCells.has("4,4")).toBe(false);
  });

  it("repeats a custom depth-1 motif when building recursive grids", () => {
    const voxelGrid = createLogoFractalVoxelGrid({
      depth: 2,
      filledVoxels: new Set([voxelKey(0, 0, 0), voxelKey(2, 2, 2)]),
      gridSize: LOGO_GRID_SIZE_3,
    });

    expect(voxelGrid.gridSize).toBe(9);
    expect(voxelGrid.filledVoxels).toEqual(
      new Set([voxelKey(0, 0, 0), voxelKey(6, 6, 6), voxelKey(2, 2, 2), voxelKey(8, 8, 8)]),
    );
  });

  it("builds deliberate higher depths from filled motif cells", () => {
    const voxelGrid = createLogoFractalVoxelGrid({ depth: 5, gridSize: LOGO_GRID_SIZE_3 });

    expect(voxelGrid.gridSize).toBe(243);
    expect(voxelGrid.filledVoxels.size).toBe(12 ** 5);
    expect(voxelGrid.filledVoxels.has(voxelKey(0, 0, 0))).toBe(false);
    expect(voxelGrid.filledVoxels.has(voxelKey(121, 0, 0))).toBe(true);
  });

  it("normalizes logo fractal depth without capping deliberate values", () => {
    expect(normalizeLogoFractalDepth(0)).toBe(1);
    expect(normalizeLogoFractalDepth(2.4)).toBe(2);
    expect(normalizeLogoFractalDepth(99)).toBe(99);
  });
});
