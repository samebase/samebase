import { describe, expect, it } from "vite-plus/test";

import {
  createDefaultFilledVoxelSet,
  createLogoFractalVoxelGrid,
  normalizeLogoFractalDepth,
  voxelKey,
} from "@/components/logoVoxelState";

describe("logoVoxelState", () => {
  it("creates the first cornerless carpet iteration as the current mark", () => {
    const voxelGrid = createLogoFractalVoxelGrid({ depth: 1 });

    expect(voxelGrid.gridSize).toBe(3);
    expect(voxelGrid.filledVoxels.size).toBe(12);
    expect(voxelGrid.filledVoxels).toEqual(createDefaultFilledVoxelSet());
    expect(voxelGrid.filledVoxels.has(voxelKey(0, 0, 0))).toBe(false);
    expect(voxelGrid.filledVoxels.has(voxelKey(1, 0, 0))).toBe(true);
    expect(voxelGrid.filledVoxels.has(voxelKey(1, 1, 1))).toBe(false);
  });

  it("keeps recursive 3D corners empty while preserving the side carpet", () => {
    const voxelGrid = createLogoFractalVoxelGrid({ depth: 2 });
    const projectedCells = new Set<string>();

    for (const key of voxelGrid.filledVoxels) {
      const [xText, yText, zText] = key.split(",");
      if (
        typeof xText !== "string" ||
        typeof yText !== "string" ||
        typeof zText !== "string"
      ) {
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
    });

    expect(voxelGrid.gridSize).toBe(9);
    expect(voxelGrid.filledVoxels).toEqual(
      new Set([
        voxelKey(0, 0, 0),
        voxelKey(6, 6, 6),
        voxelKey(2, 2, 2),
        voxelKey(8, 8, 8),
      ]),
    );
  });

  it("builds deliberate higher depths from filled motif cells", () => {
    const voxelGrid = createLogoFractalVoxelGrid({ depth: 5 });

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
