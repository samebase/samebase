import { describe, expect, it } from "vite-plus/test";

import { buildLogoSurfaceQuads, getLogoSurfaceFitRadius } from "@/components/logo/logoSurfaceModel";
import {
  createDefaultFilledVoxelSet,
  createFilledVoxelSet,
  createLogoFractalVoxelGrid,
  LOGO_GRID_SIZE_3,
} from "@/components/logo/logoVoxelState";

describe("buildLogoSurfaceQuads", () => {
  it("keeps the default logo as exposed faces without renderer-specific state", () => {
    const surfaceQuads = buildLogoSurfaceQuads(
      createDefaultFilledVoxelSet(LOGO_GRID_SIZE_3),
      LOGO_GRID_SIZE_3,
    );
    const materialCounts = new Map<number, number>();

    for (const surfaceQuad of surfaceQuads) {
      materialCounts.set(
        surfaceQuad.materialIndex,
        (materialCounts.get(surfaceQuad.materialIndex) ?? 0) + 1,
      );
    }

    expect(surfaceQuads).toHaveLength(72);
    expect([...materialCounts.entries()]).toEqual([
      [0, 12],
      [1, 12],
      [2, 12],
      [3, 12],
      [4, 12],
      [5, 12],
    ]);
  });

  it("merges adjacent coplanar voxel faces before renderers see them", () => {
    const surfaceQuads = buildLogoSurfaceQuads(
      createFilledVoxelSet([
        [0, 0, 0],
        [1, 0, 0],
      ]),
    );

    expect(surfaceQuads).toHaveLength(6);
    expect(surfaceQuads.map(({ key }) => key)).toEqual([
      "negative-x:0:0:0:1:1",
      "positive-x:1:0:0:1:1",
      "positive-y:0:0:0:2:1",
      "negative-y:0:0:0:2:1",
      "positive-z:0:0:0:2:1",
      "negative-z:0:0:0:2:1",
    ]);
  });

  it("supports larger recursive grids without changing renderer contracts", () => {
    const voxelGrid = createLogoFractalVoxelGrid({ depth: 2, gridSize: LOGO_GRID_SIZE_3 });
    const surfaceQuads = buildLogoSurfaceQuads(voxelGrid.filledVoxels, voxelGrid.gridSize);

    expect(surfaceQuads.length).toBeGreaterThan(72);
    expect(
      surfaceQuads.every((surfaceQuad) =>
        surfaceQuad.vertices.every(([x, y, z]) =>
          [x, y, z].every((value) => value >= -4.5 && value <= 4.5),
        ),
      ),
    ).toBe(true);
  });
});

describe("getLogoSurfaceFitRadius", () => {
  it("measures surface bounds from shared quad vertices", () => {
    expect(
      getLogoSurfaceFitRadius(
        buildLogoSurfaceQuads(createDefaultFilledVoxelSet(LOGO_GRID_SIZE_3), LOGO_GRID_SIZE_3),
        LOGO_GRID_SIZE_3,
      ),
    ).toBeCloseTo(Math.sqrt(4.75));
  });
});
