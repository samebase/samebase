import { MENGER_DEPTH_TRANSITION_MODEL } from "../src/mengerDepthTransition.ts";
import {
  MENGER_HOVER_DEFAULT_REVEAL_RADIUS,
  normalizeMengerHoverRevealRadius,
  readMengerHoverMoveState,
} from "../src/mengerHover.ts";
import { describe, expect, it } from "vite-plus/test";

const stage = MENGER_DEPTH_TRANSITION_MODEL.depthTwo;
const xAxisMove = stage.moves.find((move) => move.holeAxis === 0);
if (!xAxisMove) {
  throw new Error("The depth-two Menger model must contain an x-axis mover.");
}

describe("Menger hover", () => {
  it("normalizes the pointer reveal radius", () => {
    expect(normalizeMengerHoverRevealRadius(Number.NaN)).toBe(MENGER_HOVER_DEFAULT_REVEAL_RADIUS);
    expect(normalizeMengerHoverRevealRadius(0)).toBe(0.05);
    expect(normalizeMengerHoverRevealRadius(2)).toBe(1);
    expect(normalizeMengerHoverRevealRadius(0.4)).toBe(0.4);
  });

  it("moves only channels on the selected face axis", () => {
    const inactive = readMengerHoverMoveState(
      xAxisMove,
      stage,
      {
        coordinateA: 0.5,
        coordinateB: 0.5,
        holeAxis: 1,
      },
      MENGER_HOVER_DEFAULT_REVEAL_RADIUS,
    );

    expect(inactive).toEqual({ openness: 0, to: xAxisMove.from });
  });

  it("gives every mover in a face-on channel one openness and destination direction", () => {
    const channelMoves = stage.moves.filter(
      (move) => move.faceColumnChannel === xAxisMove.faceColumnChannel,
    );
    const states = channelMoves.map((move) =>
      readMengerHoverMoveState(
        move,
        stage,
        {
          coordinateA: 0,
          coordinateB: 0.5,
          holeAxis: 0,
        },
        1,
      ),
    );
    const directionKeys = states.map(({ to }, index) => {
      const from = channelMoves[index]?.from;
      if (!from) {
        throw new Error("Every hover state must keep its source mover.");
      }

      return `${to[0] - from[0]},${to[1] - from[1]},${to[2] - from[2]}`;
    });

    expect(channelMoves.length).toBeGreaterThanOrEqual(2);
    expect(new Set(states.map((state) => state.openness)).size).toBe(1);
    expect(new Set(directionKeys).size).toBe(1);
  });
});
