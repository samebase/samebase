import {
  MENGER_DEPTH_TRANSITION_DEFAULT_STAGGER_GROUP_COUNT,
  MENGER_DEPTH_TRANSITION_DEPTH_HOLD_MS,
  MENGER_DEPTH_TRANSITION_MODEL,
  MENGER_DEPTH_TRANSITION_MOVE_DURATION_MS,
  MENGER_DEPTH_TRANSITION_SPLIT_HOLD_MS,
  createMengerDepthTransitionModel,
  readMengerDepthTransitionMoveProgress,
  readMengerDepthTransitionStage,
  type MengerDepthTransitionStage,
} from "../src/mengerDepthTransition.ts";
import { voxelKey } from "../src/voxel.ts";
import { describe, expect, it } from "vite-plus/test";

function coordinateKey([x, y, z]: readonly [number, number, number]): string {
  return voxelKey(x, y, z);
}

function readDirectionKey(
  from: readonly [number, number, number],
  to: readonly [number, number, number],
): string {
  return `${to[0] - from[0]},${to[1] - from[1]},${to[2] - from[2]}`;
}

function readManhattanDistance(
  from: readonly [number, number, number],
  to: readonly [number, number, number],
): number {
  return Math.abs(to[0] - from[0]) + Math.abs(to[1] - from[1]) + Math.abs(to[2] - from[2]);
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
  expect(splitKeys.size).toBe(sourceCount * 26);
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
    expectStageShape(MENGER_DEPTH_TRANSITION_MODEL.depthTwo, 20, 400, 120);
    expectStageShape(MENGER_DEPTH_TRANSITION_MODEL.depthThree, 400, 8_000, 2_400);
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

  it("moves through face neighbours and finishes in retained cubes", () => {
    for (const stage of [
      MENGER_DEPTH_TRANSITION_MODEL.depthTwo,
      MENGER_DEPTH_TRANSITION_MODEL.depthThree,
    ]) {
      const directionKeys = new Set<string>();
      for (const move of stage.moves) {
        directionKeys.add(readDirectionKey(move.from, move.to));
        expect(readManhattanDistance(move.from, move.to)).toBe(1);
      }

      expect(directionKeys).toEqual(
        new Set(["-1,0,0", "0,-1,0", "0,0,-1", "0,0,1", "0,1,0", "1,0,0"]),
      );
      expect(new Set(stage.moves.map((move) => move.startTimeMs)).size).toBe(1);
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

  it("selects stages at the exact split boundaries", () => {
    const { depthThree, depthTwo } = MENGER_DEPTH_TRANSITION_MODEL;

    expect(
      readMengerDepthTransitionStage(MENGER_DEPTH_TRANSITION_MODEL, depthTwo.splitTimeMs),
    ).toBeNull();
    expect(
      readMengerDepthTransitionStage(MENGER_DEPTH_TRANSITION_MODEL, depthTwo.splitTimeMs + 1),
    ).toBe(depthTwo);
    expect(
      readMengerDepthTransitionStage(MENGER_DEPTH_TRANSITION_MODEL, depthThree.splitTimeMs),
    ).toBe(depthTwo);
    expect(
      readMengerDepthTransitionStage(MENGER_DEPTH_TRANSITION_MODEL, depthThree.splitTimeMs + 1),
    ).toBe(depthThree);
  });

  it("returns eased move progress until the move settles", () => {
    const move = MENGER_DEPTH_TRANSITION_MODEL.depthTwo.moves[0];
    if (!move) {
      throw new Error("The depth-two transition must contain a move.");
    }

    expect(readMengerDepthTransitionMoveProgress(move, move.startTimeMs - 1)).toBe(0);
    expect(
      readMengerDepthTransitionMoveProgress(
        move,
        move.startTimeMs + MENGER_DEPTH_TRANSITION_MOVE_DURATION_MS / 2,
      ),
    ).toBe(0.5);
    expect(
      readMengerDepthTransitionMoveProgress(
        move,
        move.startTimeMs + MENGER_DEPTH_TRANSITION_MOVE_DURATION_MS,
      ),
    ).toBeNull();
  });

  it("uses the default stagger count for non-finite input", () => {
    const model = createMengerDepthTransitionModel(Number.NaN);
    const startTimes = new Set(model.depthTwo.moves.map((move) => move.startTimeMs));

    expect(startTimes.size).toBe(MENGER_DEPTH_TRANSITION_DEFAULT_STAGGER_GROUP_COUNT);
  });
});
