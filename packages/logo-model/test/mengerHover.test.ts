import { MENGER_DEPTH_TRANSITION_MODEL } from "../src/mengerDepthTransition.ts";
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

    expect(state.length).toBe(MENGER_DEPTH_TRANSITION_MODEL.depthTwo.moves.length);
    expect(state.every((move) => move.openness === 0)).toBe(true);
  });

  it("keeps offsets tangent, Chebyshev-1, and inside each source parent", () => {
    const probe = { outsideDistance: 0, x: 0.15, y: 0.2, z: 1 };
    const state = readMengerHoverState(
      MENGER_DEPTH_TRANSITION_MODEL,
      probe,
      probe,
      MENGER_HOVER_DEFAULT_REVEAL_RADIUS,
    );

    for (const [moveIndex, move] of MENGER_DEPTH_TRANSITION_MODEL.depthTwo.moves.entries()) {
      const moveState = state[moveIndex];
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
  });

  it("keeps offsets continuous across a channel diagonal at partial openness", () => {
    const channel = 2 * 9 + 0 * 3 + 1;
    const moveIndex = MENGER_DEPTH_TRANSITION_MODEL.depthTwo.moves.findIndex(
      (move) => move.faceColumnChannel === channel,
    );
    const centerA = 0.5 / 3;
    const centerB = 1.5 / 3;
    const leftProbe = { outsideDistance: 0, x: centerA - 0.201, y: centerB - 0.199, z: 1 };
    const rightProbe = { outsideDistance: 0, x: centerA - 0.199, y: centerB - 0.201, z: 1 };
    const leftState = readMengerHoverState(
      MENGER_DEPTH_TRANSITION_MODEL,
      leftProbe,
      leftProbe,
      MENGER_HOVER_DEFAULT_REVEAL_RADIUS,
    )[moveIndex];
    const rightState = readMengerHoverState(
      MENGER_DEPTH_TRANSITION_MODEL,
      rightProbe,
      rightProbe,
      MENGER_HOVER_DEFAULT_REVEAL_RADIUS,
    )[moveIndex];
    if (!leftState || !rightState) {
      throw new Error("The probed channel must resolve to a depth-two mover.");
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
    const channel = 2 * 9 + 0 * 3 + 1;
    const rayMoveIndex = MENGER_DEPTH_TRANSITION_MODEL.depthTwo.moves.findIndex(
      (move) => move.faceColumnChannel === channel,
    );
    const onSurface = { outsideDistance: 0, x: 0.5 / 3, y: 1.5 / 3, z: 1 };
    const nearMiss = { outsideDistance: 0.3, x: 0.5 / 3, y: 1.5 / 3, z: 1 };
    const farMiss = { outsideDistance: 0.6, x: 0.5 / 3, y: 1.5 / 3, z: 1 };
    const radius = MENGER_HOVER_DEFAULT_REVEAL_RADIUS;
    const model = MENGER_DEPTH_TRANSITION_MODEL;
    const onSurfaceState = readMengerHoverState(model, onSurface, onSurface, radius);
    const nearMissState = readMengerHoverState(model, nearMiss, nearMiss, radius);
    const farMissState = readMengerHoverState(model, farMiss, farMiss, radius);

    expect(rayMoveIndex).toBeGreaterThanOrEqual(0);
    expect(onSurfaceState[rayMoveIndex]?.openness).toBe(1);
    const nearMissOpenness = nearMissState[rayMoveIndex]?.openness ?? 0;
    expect(nearMissOpenness).toBeGreaterThan(0);
    expect(nearMissOpenness).toBeLessThan(1);
    expect(farMissState.every((move) => move.openness === 0)).toBe(true);
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

    expect(healedState.every((move) => move.openness === 0)).toBe(true);
    expect(healedState.map((move) => move.offset)).toEqual(liveState.map((move) => move.offset));
  });
});
