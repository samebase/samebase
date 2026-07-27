import {
  type MengerDepthTransitionMove,
  type MengerDepthTransitionStage,
  type MengerHoleAxis,
} from "./mengerDepthTransition.ts";
import { type VoxelCoordinate } from "./voxel.ts";

export const MENGER_HOVER_MIN_REVEAL_RADIUS = 0.05;
export const MENGER_HOVER_MAX_REVEAL_RADIUS = 1;
export const MENGER_HOVER_DEFAULT_REVEAL_RADIUS = 0.55;
const MENGER_HOVER_FULL_OPEN_RADIUS_FRACTION = 0.25;

export type MengerHoverProbe = {
  coordinateA: number;
  coordinateB: number;
  holeAxis: MengerHoleAxis;
};

export function normalizeMengerHoverRevealRadius(value: number): number {
  if (!Number.isFinite(value)) {
    return MENGER_HOVER_DEFAULT_REVEAL_RADIUS;
  }

  return Math.min(Math.max(value, MENGER_HOVER_MIN_REVEAL_RADIUS), MENGER_HOVER_MAX_REVEAL_RADIUS);
}

function readFaceCoordinates(move: MengerDepthTransitionMove, stage: MengerDepthTransitionStage) {
  const faceGridSize = stage.gridSize / 3;
  const channelWithinAxis = move.faceColumnChannel - move.holeAxis * faceGridSize * faceGridSize;
  const faceCoordinateA = Math.floor(channelWithinAxis / faceGridSize);
  const faceCoordinateB = channelWithinAxis % faceGridSize;

  return {
    coordinateA: (faceCoordinateA + 0.5) / faceGridSize,
    coordinateB: (faceCoordinateB + 0.5) / faceGridSize,
  };
}

function readMoveDestination(
  move: MengerDepthTransitionMove,
  deltaA: number,
  deltaB: number,
): VoxelCoordinate {
  const useAxisA = Math.abs(deltaA) >= Math.abs(deltaB);
  const direction = (useAxisA ? deltaA : deltaB) >= 0 ? 1 : -1;
  const [x, y, z] = move.from;

  switch (move.holeAxis) {
    case 0:
      return useAxisA ? [x, y + direction, z] : [x, y, z + direction];
    case 1:
      return useAxisA ? [x + direction, y, z] : [x, y, z + direction];
    case 2:
      return useAxisA ? [x + direction, y, z] : [x, y + direction, z];
    default:
      return move.holeAxis satisfies never;
  }
}

/**
The closed cube pointer proxy reports one face and one normalized point on
that face. Every mover in the same face-on channel gets the same openness and
the same tangent destination, including the two cubes at opposite ends of a
local through-hole.
*/
export function readMengerHoverMoveState(
  move: MengerDepthTransitionMove,
  stage: MengerDepthTransitionStage,
  probe: MengerHoverProbe | null,
  revealRadius: number,
): { openness: number; to: VoxelCoordinate } {
  if (probe === null || probe.holeAxis !== move.holeAxis) {
    return { openness: 0, to: move.from };
  }

  const center = readFaceCoordinates(move, stage);
  const deltaA = center.coordinateA - probe.coordinateA;
  const deltaB = center.coordinateB - probe.coordinateB;
  const radius = normalizeMengerHoverRevealRadius(revealRadius);
  const closeness = 1 - Math.hypot(deltaA, deltaB) / radius;
  if (!(closeness > 0)) {
    return { openness: 0, to: move.from };
  }

  const normalized = Math.min(closeness / (1 - MENGER_HOVER_FULL_OPEN_RADIUS_FRACTION), 1);
  const openness = normalized * normalized * (3 - 2 * normalized);

  return {
    openness,
    to: readMoveDestination(move, deltaA, deltaB),
  };
}
