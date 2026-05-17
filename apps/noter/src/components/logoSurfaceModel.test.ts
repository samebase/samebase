import { describe, expect, it } from "vite-plus/test";

import {
  buildLogoSurfaceQuads,
  getLogoSurfaceFitRadius,
} from "@/components/logoSurfaceModel";
import {
  createDefaultFilledVoxelSet,
  createFilledVoxelSet,
} from "@/components/logoVoxelState";

describe("buildLogoSurfaceQuads", () => {
  it("keeps the default logo as exposed faces without renderer-specific state", () => {
    const surfaceQuads = buildLogoSurfaceQuads(createDefaultFilledVoxelSet());
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
});

describe("getLogoSurfaceFitRadius", () => {
  it("measures surface bounds from shared quad vertices", () => {
    expect(
      getLogoSurfaceFitRadius(
        buildLogoSurfaceQuads(createDefaultFilledVoxelSet()),
      ),
    ).toBeCloseTo(Math.sqrt(4.75));
  });
});
