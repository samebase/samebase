import { describe, expect, it } from "vite-plus/test";
import {
  STATIC_LOGO_ELEVATION_DEGREES,
  STATIC_LOGO_GRID_SIZE,
  STATIC_LOGO_VOXEL_COORDINATES,
} from "../src/identity.ts";
import { easeLogoShuffleProgress, getShuffleOriginCandidates } from "../src/shuffle.ts";
import { createFilledVoxelSet, voxelKey } from "../src/voxel.ts";

describe("getShuffleOriginCandidates", () => {
  it("returns only direct moves into vacant cells", () => {
    const filledVoxels = createFilledVoxelSet(STATIC_LOGO_VOXEL_COORDINATES);
    const candidates = getShuffleOriginCandidates({
      blockedKeys: new Set(),
      elevationDegrees: STATIC_LOGO_ELEVATION_DEGREES,
      filledVoxels,
      gridSize: STATIC_LOGO_GRID_SIZE,
      lastMovedCubeKey: null,
      rotationAxisMode: "cube-y",
      rotationDegrees: 45,
    });

    expect(candidates.length).toBeGreaterThan(0);
    for (const candidate of candidates) {
      expect(candidate.fromKey).not.toBe("1,1,1");
      for (const destination of candidate.destinations) {
        const travelDistance =
          Math.abs(destination[0] - candidate.from[0]) +
          Math.abs(destination[1] - candidate.from[1]) +
          Math.abs(destination[2] - candidate.from[2]);
        expect(travelDistance).toBe(1);
        expect(filledVoxels.has(voxelKey(destination[0], destination[1], destination[2]))).toBe(
          false,
        );
      }
    }
  });

  it("excludes blocked origins and destinations", () => {
    const filledVoxels = createFilledVoxelSet(STATIC_LOGO_VOXEL_COORDINATES);
    const blockedKeys = new Set(["1,2,0", "1,1,1"]);
    const candidates = getShuffleOriginCandidates({
      blockedKeys,
      elevationDegrees: STATIC_LOGO_ELEVATION_DEGREES,
      filledVoxels,
      gridSize: STATIC_LOGO_GRID_SIZE,
      lastMovedCubeKey: null,
      rotationAxisMode: "cube-y",
      rotationDegrees: 45,
    });

    expect(candidates.some((candidate) => blockedKeys.has(candidate.fromKey))).toBe(false);
    expect(
      candidates.some((candidate) =>
        candidate.destinations.some((destination) =>
          blockedKeys.has(voxelKey(destination[0], destination[1], destination[2])),
        ),
      ),
    ).toBe(false);
  });
});

describe("easeLogoShuffleProgress", () => {
  it("matches the settled endpoints and midpoint", () => {
    expect(easeLogoShuffleProgress(0)).toBe(0);
    expect(easeLogoShuffleProgress(0.5)).toBe(0.5);
    expect(easeLogoShuffleProgress(1)).toBe(1);
  });
});
