import {
  MENGER_DEPTH_TRANSITION_GRID_SIZE,
  MENGER_DEPTH_TRANSITION_MODEL,
} from "@/components/logo/logoMengerDepthTransition";
import { voxelKey } from "@/components/logo/logoVoxelState";
import { describe, expect, it } from "vite-plus/test";

function coordinateKey([x, y, z]: readonly [number, number, number]): string {
  return voxelKey(x, y, z);
}

describe("Menger depth transition", () => {
  it("turns the packed depth-one subdivision into the exact depth-two sponge", () => {
    const settledKeys = new Set(MENGER_DEPTH_TRANSITION_MODEL.settledVoxels.map(coordinateKey));
    const moverOriginKeys = new Set(
      MENGER_DEPTH_TRANSITION_MODEL.moves.map((move) => coordinateKey(move.from)),
    );
    const splitKeys = new Set([...settledKeys, ...moverOriginKeys]);

    expect(MENGER_DEPTH_TRANSITION_MODEL.depthOneVoxels).toHaveLength(20);
    expect(MENGER_DEPTH_TRANSITION_MODEL.settledVoxels).toHaveLength(400);
    expect(MENGER_DEPTH_TRANSITION_MODEL.moves).toHaveLength(140);
    expect(moverOriginKeys.size).toBe(140);
    expect(splitKeys.size).toBe(540);
    expect(
      MENGER_DEPTH_TRANSITION_MODEL.moves.every((move) => settledKeys.has(coordinateKey(move.to))),
    ).toBe(true);
    expect(
      MENGER_DEPTH_TRANSITION_MODEL.settledVoxels.every(([x, y, z]) =>
        [x, y, z].every((axis) => axis >= 0 && axis < MENGER_DEPTH_TRANSITION_GRID_SIZE),
      ),
    ).toBe(true);
  });

  it("keeps every absorbed cube inside its original parent cube", () => {
    expect(
      MENGER_DEPTH_TRANSITION_MODEL.moves.every(
        (move) =>
          Math.floor(move.from[0] / 3) === Math.floor(move.to[0] / 3) &&
          Math.floor(move.from[1] / 3) === Math.floor(move.to[1] / 3) &&
          Math.floor(move.from[2] / 3) === Math.floor(move.to[2] / 3),
      ),
    ).toBe(true);
  });
});
