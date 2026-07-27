import { MENGER_DEPTH_TRANSITION_MODEL } from "../src/mengerDepthTransition.ts";
import {
  MENGER_HOVER_DEFAULT_REVEAL_RADIUS,
  normalizeMengerHoverRevealRadius,
  readMengerHoverState,
} from "../src/mengerHover.ts";
import { describe, expect, it } from "vite-plus/test";

// The depth-two z-axis channel at parent face coords (0, 1): hole center
// (x, y) = (0.5 / 3, 1.5 / 3) on the z = 1 face.
const CHANNEL = 2 * 9 + 0 * 3 + 1;
const CENTER_A = 0.5 / 3;
const CENTER_B = 1.5 / 3;

function readChannelMoveState(
  probe: { x: number; y: number; z: number } | null,
  direction = probe,
) {
  const moveIndex = MENGER_DEPTH_TRANSITION_MODEL.depthTwo.moves.findIndex(
    (move) => move.faceColumnChannel === CHANNEL,
  );
  const state = readMengerHoverState(
    MENGER_DEPTH_TRANSITION_MODEL,
    probe === null ? null : { outsideDistance: 0, ...probe },
    direction === null ? null : { outsideDistance: 0, ...direction },
    MENGER_HOVER_DEFAULT_REVEAL_RADIUS,
  ).depthTwo[moveIndex];
  if (!state) {
    throw new Error("The probed channel must resolve to a depth-two mover.");
  }

  return state;
}

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

    expect(state.depthTwo.length).toBe(MENGER_DEPTH_TRANSITION_MODEL.depthTwo.moves.length);
    expect(state.depthThree.length).toBe(MENGER_DEPTH_TRANSITION_MODEL.depthThree.moves.length);
    for (const stage of [state.depthTwo, state.depthThree]) {
      expect(stage.every((move) => move.openness === 0)).toBe(true);
    }
  });

  it("splits the cover pair like the carpet slide", () => {
    // Diagonal approach: even split, both covers retreating away from the
    // pointer toward positive A and B.
    const diagonal = readChannelMoveState({ x: CENTER_A - 0.2, y: CENTER_B - 0.2, z: 1 });
    expect(diagonal.weightA).toBeCloseTo(0.5, 5);
    expect(diagonal.signA).toBe(1);
    expect(diagonal.signB).toBe(1);

    // Cardinal approach from the left: cover A carries the whole slide and
    // cover B is fully retreated, which opens a full-height rectangle that
    // grows toward the pointer.
    const cardinal = readChannelMoveState({ x: CENTER_A - 0.28, y: CENTER_B, z: 1 });
    expect(cardinal.weightA).toBeCloseTo(1, 5);

    // Within half a hole side the split relaxes toward 0.5 instead of
    // flipping between wide and tall across a knife edge.
    const near = readChannelMoveState({ x: CENTER_A - 0.02, y: CENTER_B, z: 1 });
    expect(near.weightA).toBeGreaterThan(0.55);
    expect(near.weightA).toBeLessThan(0.85);
  });

  it("keeps the split continuous across a channel diagonal at partial openness", () => {
    const leftState = readChannelMoveState({ x: CENTER_A - 0.201, y: CENTER_B - 0.199, z: 1 });
    const rightState = readChannelMoveState({ x: CENTER_A - 0.199, y: CENTER_B - 0.201, z: 1 });

    expect(leftState.openness).toBeGreaterThan(0.2);
    expect(leftState.openness).toBeLessThan(1);
    expect(Math.abs(leftState.openness - rightState.openness)).toBeLessThan(0.01);
    expect(Math.abs(leftState.weightA - rightState.weightA)).toBeLessThan(0.05);
    expect(leftState.signA).toBe(rightState.signA);
    expect(leftState.signB).toBe(rightState.signB);
  });

  it("only flips a sign while that axis's cover is fully retreated", () => {
    const leftState = readChannelMoveState({ x: CENTER_A - 0.001, y: CENTER_B - 0.3, z: 1 });
    const rightState = readChannelMoveState({ x: CENTER_A + 0.001, y: CENTER_B - 0.3, z: 1 });

    expect(leftState.signA).toBe(1);
    expect(rightState.signA).toBe(-1);
    // weightA ~ 0 means cover A sits at openness ** 0 = full retreat on both
    // sides of the flip, parked inside the solid ring and invisible.
    expect(leftState.weightA).toBeLessThan(0.01);
    expect(rightState.weightA).toBeLessThan(0.01);
  });

  it("opens only crossed depth-two blockers with the depth-three ray", () => {
    // The depth-three z-ray at grid-9 face coords (0, 1): its column crosses
    // the x-hole cover pairs of parents (0, 0, pz). Those specific movers
    // open their own carpet rectangles so the depth-three view stays clear.
    const model = MENGER_DEPTH_TRANSITION_MODEL;
    const probe = { outsideDistance: 0, x: 0.5 / 9, y: 1.5 / 9, z: 1 };
    const state = readMengerHoverState(model, probe, probe, MENGER_HOVER_DEFAULT_REVEAL_RADIUS);
    const rayChannel = 2 * 81 + 0 * 9 + 1;
    const modelWithoutRay = {
      ...model,
      depthThree: {
        ...model.depthThree,
        moves: model.depthThree.moves.filter((move) => move.faceColumnChannel !== rayChannel),
      },
    };
    const stateWithoutRay = readMengerHoverState(
      modelWithoutRay,
      probe,
      probe,
      MENGER_HOVER_DEFAULT_REVEAL_RADIUS,
    );
    const rayMoveIndex = model.depthThree.moves.findIndex(
      (move) => move.faceColumnChannel === rayChannel,
    );
    const blockerMoveIndexes = model.depthTwo.moves.flatMap((move, moveIndex) =>
      move.from[0] === 0 && move.from[1] === 1 && move.holeAxis === 0 ? [moveIndex] : [],
    );

    expect(state.depthThree[rayMoveIndex]?.openness).toBe(1);
    expect(blockerMoveIndexes.length).toBeGreaterThan(0);
    for (const blockerMoveIndex of blockerMoveIndexes) {
      expect(state.depthTwo[blockerMoveIndex]?.openness).toBe(1);
    }
    expect(
      blockerMoveIndexes.some(
        (moveIndex) =>
          (state.depthTwo[moveIndex]?.openness ?? 0) >
          (stateWithoutRay.depthTwo[moveIndex]?.openness ?? 0),
      ),
    ).toBe(true);

    const firstBlockerMove = model.depthTwo.moves[blockerMoveIndexes[0] ?? -1];
    const untouchedMoveIndex = model.depthTwo.moves.findIndex(
      (move, moveIndex) =>
        move.faceColumnChannel === firstBlockerMove?.faceColumnChannel &&
        !blockerMoveIndexes.includes(moveIndex),
    );
    expect(untouchedMoveIndex).toBeGreaterThanOrEqual(0);
    expect(state.depthTwo[untouchedMoveIndex]?.openness).toBe(
      stateWithoutRay.depthTwo[untouchedMoveIndex]?.openness,
    );
  });

  it("fades openness with the pointer's outside distance", () => {
    const onSurface = readChannelMoveState({ x: CENTER_A, y: CENTER_B, z: 1 });
    expect(onSurface.openness).toBe(1);

    const moveIndex = MENGER_DEPTH_TRANSITION_MODEL.depthTwo.moves.findIndex(
      (move) => move.faceColumnChannel === CHANNEL,
    );
    const nearMissProbe = { outsideDistance: 0.3, x: CENTER_A, y: CENTER_B, z: 1 };
    const farMissProbe = { outsideDistance: 0.6, x: CENTER_A, y: CENTER_B, z: 1 };
    const nearMissState = readMengerHoverState(
      MENGER_DEPTH_TRANSITION_MODEL,
      nearMissProbe,
      nearMissProbe,
      MENGER_HOVER_DEFAULT_REVEAL_RADIUS,
    ).depthTwo[moveIndex];
    const farMissState = readMengerHoverState(
      MENGER_DEPTH_TRANSITION_MODEL,
      farMissProbe,
      farMissProbe,
      MENGER_HOVER_DEFAULT_REVEAL_RADIUS,
    );

    expect(nearMissState?.openness).toBeGreaterThan(0);
    expect(nearMissState?.openness).toBeLessThan(1);
    expect(farMissState.depthTwo.every((move) => move.openness === 0)).toBe(true);
    expect(farMissState.depthThree.every((move) => move.openness === 0)).toBe(true);
  });

  it("heals along the last slide split after the pointer leaves", () => {
    const probe = { x: CENTER_A - 0.15, y: CENTER_B - 0.1, z: 1 };
    const liveState = readChannelMoveState(probe);
    const healedState = readChannelMoveState(null, probe);

    expect(healedState.openness).toBe(0);
    expect(healedState.weightA).toBe(liveState.weightA);
    expect(healedState.signA).toBe(liveState.signA);
    expect(healedState.signB).toBe(liveState.signB);
  });
});
