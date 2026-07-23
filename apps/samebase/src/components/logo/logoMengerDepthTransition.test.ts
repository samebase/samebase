import {
  MENGER_DEPTH_TRANSITION_DEPTH_HOLD_MS,
  MENGER_DEPTH_TRANSITION_MODEL,
  MENGER_DEPTH_TRANSITION_MOVE_DURATION_MS,
  MENGER_DEPTH_TRANSITION_SPLIT_HOLD_MS,
  type MengerDepthTransitionStage,
} from "@/components/logo/logoMengerDepthTransition";
import { voxelKey } from "@/components/logo/logoVoxelState";
import { describe, expect, it } from "vite-plus/test";

function coordinateKey([x, y, z]: readonly [number, number, number]): string {
  return voxelKey(x, y, z);
}

function expectStageShape(
  stage: MengerDepthTransitionStage,
  sourceCount: number,
  settledCount: number,
  moveCount: number,
): void {
  const settledKeys = new Set(stage.settledVoxels.map(coordinateKey));
  const moverOriginKeys = new Set(stage.moves.map((move) => coordinateKey(move.from)));
  const splitKeys = new Set([...settledKeys, ...moverOriginKeys]);

  expect(stage.sourceVoxels).toHaveLength(sourceCount);
  expect(stage.settledVoxels).toHaveLength(settledCount);
  expect(stage.moves).toHaveLength(moveCount);
  expect(moverOriginKeys.size).toBe(moveCount);
  expect(splitKeys.size).toBe(sourceCount * 27);
  expect(stage.moves.every((move) => settledKeys.has(coordinateKey(move.to)))).toBe(true);
  expect(
    stage.settledVoxels.every(([x, y, z]) =>
      [x, y, z].every((axis) => axis >= 0 && axis < stage.gridSize),
    ),
  ).toBe(true);
}

describe("Menger depth transition", () => {
  it("turns each packed subdivision into the exact next Menger depth", () => {
    expect(MENGER_DEPTH_TRANSITION_MODEL.depthOneVoxels).toHaveLength(20);
    expectStageShape(MENGER_DEPTH_TRANSITION_MODEL.depthTwo, 20, 400, 140);
    expectStageShape(MENGER_DEPTH_TRANSITION_MODEL.depthThree, 400, 8_000, 2_800);
  });

  it("keeps every absorbed cube inside its original parent cube", () => {
    for (const stage of [
      MENGER_DEPTH_TRANSITION_MODEL.depthTwo,
      MENGER_DEPTH_TRANSITION_MODEL.depthThree,
    ]) {
      expect(
        stage.moves.every(
          (move) =>
            Math.floor(move.from[0] / 3) === Math.floor(move.to[0] / 3) &&
            Math.floor(move.from[1] / 3) === Math.floor(move.to[1] / 3) &&
            Math.floor(move.from[2] / 3) === Math.floor(move.to[2] / 3),
        ),
      ).toBe(true);
    }
  });

  it("varies destination direction while keeping one movement style", () => {
    for (const stage of [
      MENGER_DEPTH_TRANSITION_MODEL.depthTwo,
      MENGER_DEPTH_TRANSITION_MODEL.depthThree,
    ]) {
      const directionKeys = new Set(
        stage.moves.map(
          (move) =>
            `${move.to[0] - move.from[0]},${move.to[1] - move.from[1]},${move.to[2] - move.from[2]}`,
        ),
      );

      expect(directionKeys.size).toBeGreaterThan(12);
      for (const axis of [0, 1, 2]) {
        expect(stage.moves.some((move) => move.to[axis] - move.from[axis] < 0)).toBe(true);
        expect(stage.moves.some((move) => move.to[axis] - move.from[axis] > 0)).toBe(true);
      }
      expect(new Set(stage.moves.map((move) => move.startTimeMs)).size).toBe(2);
      expect(
        stage.moves.every(
          (move) => move.startTimeMs + MENGER_DEPTH_TRANSITION_MOVE_DURATION_MS <= stage.endTimeMs,
        ),
      ).toBe(true);
    }
  });

  it("holds the complete depth-two sponge before splitting it into depth three", () => {
    expect(
      MENGER_DEPTH_TRANSITION_MODEL.depthThree.splitTimeMs -
        MENGER_DEPTH_TRANSITION_MODEL.depthTwo.endTimeMs,
    ).toBe(MENGER_DEPTH_TRANSITION_DEPTH_HOLD_MS + MENGER_DEPTH_TRANSITION_SPLIT_HOLD_MS);
    expect(MENGER_DEPTH_TRANSITION_MODEL.totalDurationMs).toBe(
      MENGER_DEPTH_TRANSITION_MODEL.depthThree.endTimeMs,
    );
  });
});
