import {
  MENGER_DEPTH_TRANSITION_MODEL,
  createMengerDepthTransitionModel,
} from "../src/mengerDepthTransition.ts";
import {
  MENGER_HOVER_DEFAULT_REVEAL_RADIUS,
  normalizeMengerHoverRevealRadius,
  readMengerHoverState,
} from "../src/mengerHover.ts";
import { describe, expect, it } from "vite-plus/test";

describe("Menger hover", () => {
  it("normalizes the pointer reveal radius", () => {
    expect(normalizeMengerHoverRevealRadius(Number.NaN)).toBe(MENGER_HOVER_DEFAULT_REVEAL_RADIUS);
    expect(normalizeMengerHoverRevealRadius(0)).toBe(0.05);
    expect(normalizeMengerHoverRevealRadius(2)).toBe(1);
    expect(normalizeMengerHoverRevealRadius(0.4)).toBe(0.4);
  });

  it("keeps every mover closed without a pointer", () => {
    const state = readMengerHoverState(
      MENGER_DEPTH_TRANSITION_MODEL,
      null,
      null,
      MENGER_HOVER_DEFAULT_REVEAL_RADIUS,
    );

    expect(state.depthTwo.every((move) => move.openness === 0)).toBe(true);
    expect(state.depthThree.every((move) => move.openness === 0)).toBe(true);
  });

  it("keeps offsets tangent, Chebyshev-1, and inside each source parent", () => {
    const probe = { outsideDistance: 0, x: 0.15, y: 0.2, z: 1 };
    const state = readMengerHoverState(
      MENGER_DEPTH_TRANSITION_MODEL,
      probe,
      probe,
      MENGER_HOVER_DEFAULT_REVEAL_RADIUS,
    );

    for (const [stage, moveStates] of [
      [MENGER_DEPTH_TRANSITION_MODEL.depthTwo, state.depthTwo],
      [MENGER_DEPTH_TRANSITION_MODEL.depthThree, state.depthThree],
    ] as const) {
      for (const [moveIndex, move] of stage.moves.entries()) {
        const moveState = moveStates[moveIndex];
        if (!moveState) {
          throw new Error("Every Menger mover must have one hover move state.");
        }

        expect(moveState.offset[move.holeAxis]).toBe(0);
        expect(Math.max(...moveState.offset.map(Math.abs))).toBe(1);
        for (let axis = 0; axis < 3; axis += 1) {
          const shifted = (move.from[axis] ?? 0) + (moveState.offset[axis] ?? 0);
          expect(Math.floor(shifted / 3)).toBe(Math.floor((move.from[axis] ?? 0) / 3));
        }
      }
    }
  });

  it("dodges cross-axis blockers perpendicular to an open face-on ray", () => {
    // Depth-3 z-channel at grid-9 face coords (0, 1): its blockers are the
    // x-hole covers of parents (0, 0, pz), whose tangent plane contains the
    // ray axis. Sliding along the ray never clears the column, so the dodge
    // must use the one axis perpendicular to both hole and ray.
    const model = createMengerDepthTransitionModel(3);
    const probe = { outsideDistance: 0, x: 0.5 / 9, y: 1.5 / 9, z: 1 };
    const state = readMengerHoverState(model, probe, probe, MENGER_HOVER_DEFAULT_REVEAL_RADIUS);
    const blockerMoveIndexes = model.depthTwo.moves.flatMap((move, moveIndex) =>
      move.from[0] === 0 && move.from[1] === 1 && move.holeAxis === 0 ? [moveIndex] : [],
    );

    expect(blockerMoveIndexes.length).toBeGreaterThan(0);
    for (const blockerMoveIndex of blockerMoveIndexes) {
      const blockerState = state.depthTwo[blockerMoveIndex];
      if (!blockerState) {
        throw new Error("Every blocker move must have one hover move state.");
      }

      expect(blockerState.openness).toBe(1);
      expect(blockerState.offset[0]).toBe(0);
      expect(blockerState.offset[2]).toBe(0);
      expect(Math.abs(blockerState.offset[1])).toBe(1);
    }
  });

  it("keeps offsets continuous across a channel diagonal at partial openness", () => {
    const faceGridSize = MENGER_DEPTH_TRANSITION_MODEL.depthThree.gridSize / 3;
    const channel = 2 * faceGridSize * faceGridSize + 4 * faceGridSize + 6;
    const moveIndex = MENGER_DEPTH_TRANSITION_MODEL.depthThree.moves.findIndex(
      (move) => move.faceColumnChannel === channel,
    );
    const centerA = 4.5 / 9;
    const centerB = 6.5 / 9;
    const leftProbe = { outsideDistance: 0, x: centerA - 0.201, y: centerB - 0.199, z: 1 };
    const rightProbe = { outsideDistance: 0, x: centerA - 0.199, y: centerB - 0.201, z: 1 };
    const leftState = readMengerHoverState(
      MENGER_DEPTH_TRANSITION_MODEL,
      leftProbe,
      leftProbe,
      MENGER_HOVER_DEFAULT_REVEAL_RADIUS,
    ).depthThree[moveIndex];
    const rightState = readMengerHoverState(
      MENGER_DEPTH_TRANSITION_MODEL,
      rightProbe,
      rightProbe,
      MENGER_HOVER_DEFAULT_REVEAL_RADIUS,
    ).depthThree[moveIndex];
    if (!leftState || !rightState) {
      throw new Error("The probed channel must resolve to a depth-three mover.");
    }

    expect(leftState.openness).toBeGreaterThan(0.2);
    expect(leftState.openness).toBeLessThan(1);
    expect(Math.abs(leftState.openness - rightState.openness)).toBeLessThan(0.01);
    for (let axis = 0; axis < 3; axis += 1) {
      expect(Math.abs((leftState.offset[axis] ?? 0) - (rightState.offset[axis] ?? 0))).toBeLessThan(
        0.05,
      );
    }
  });

  it("fades openness with the pointer's outside distance", () => {
    const onSurface = { outsideDistance: 0, x: 0.5 / 9, y: 1.5 / 9, z: 1 };
    const nearMiss = { outsideDistance: 0.3, x: 0.5 / 9, y: 1.5 / 9, z: 1 };
    const farMiss = { outsideDistance: 0.6, x: 0.5 / 9, y: 1.5 / 9, z: 1 };
    const radius = MENGER_HOVER_DEFAULT_REVEAL_RADIUS;
    const model = MENGER_DEPTH_TRANSITION_MODEL;
    const rayMoveIndex = model.depthThree.moves.findIndex(
      (move) => move.faceColumnChannel === 2 * 81 + 1,
    );
    const onSurfaceState = readMengerHoverState(model, onSurface, onSurface, radius);
    const nearMissState = readMengerHoverState(model, nearMiss, nearMiss, radius);
    const farMissState = readMengerHoverState(model, farMiss, farMiss, radius);

    expect(rayMoveIndex).toBeGreaterThanOrEqual(0);
    expect(onSurfaceState.depthThree[rayMoveIndex]?.openness).toBe(1);
    const nearMissOpenness = nearMissState.depthThree[rayMoveIndex]?.openness ?? 0;
    expect(nearMissOpenness).toBeGreaterThan(0);
    expect(nearMissOpenness).toBeLessThan(1);
    expect(farMissState.depthThree.every((move) => move.openness === 0)).toBe(true);
    expect(farMissState.depthTwo.every((move) => move.openness === 0)).toBe(true);
  });

  it("heals along the last slide directions after the pointer leaves", () => {
    const probe = { outsideDistance: 0, x: 0.15, y: 0.2, z: 1 };
    const liveState = readMengerHoverState(
      MENGER_DEPTH_TRANSITION_MODEL,
      probe,
      probe,
      MENGER_HOVER_DEFAULT_REVEAL_RADIUS,
    );
    const healedState = readMengerHoverState(
      MENGER_DEPTH_TRANSITION_MODEL,
      null,
      probe,
      MENGER_HOVER_DEFAULT_REVEAL_RADIUS,
    );

    expect(healedState.depthThree.every((move) => move.openness === 0)).toBe(true);
    expect(healedState.depthThree.map((move) => move.offset)).toEqual(
      liveState.depthThree.map((move) => move.offset),
    );
  });
});
