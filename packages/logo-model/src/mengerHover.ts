import {
  type MengerDepthTransitionModel,
  type MengerDepthTransitionStage,
  type MengerHoleAxis,
} from "./mengerDepthTransition.ts";

export const MENGER_HOVER_MIN_REVEAL_RADIUS = 0.05;
export const MENGER_HOVER_MAX_REVEAL_RADIUS = 1;
export const MENGER_HOVER_DEFAULT_REVEAL_RADIUS = 0.55;
const MENGER_HOVER_FULL_OPEN_RADIUS_FRACTION = 0.25;
/**
A crossed pair's corner-anchored rect only uncovers the ray column near full
openness, so the floor ramps three times faster than the ray's openness:
blockers are fully open while a ray is still about a third open, and an open
depth-three rect shows through-white immediately, like the carpet.
*/
const MENGER_HOVER_RAY_FLOOR_BOOST = 3;

/**
Unit sponge coordinates: the full cube spans [0, 1] on every axis.
outsideDistance is how far the pointer ray passes outside the cube surface in
the same unit scale; probes on the surface use 0. It joins the channel
distance term so influence fades continuously while the pointer skims past
the silhouette instead of collapsing to the resting state at the edge. The
direction is the local camera ray toward the sponge and keeps the cleared
interior path aligned with tilted views.
*/
export type MengerHoverProbe = {
  direction: readonly [number, number, number];
  outsideDistance: number;
  x: number;
  y: number;
  z: number;
};

/**
Each hole opening is covered by TWO coincident cubes, one per tangent axis,
mirroring the carpet's slide rect: cover A retreats by openness ** weightA
cells along the first tangent axis, cover B by openness ** (1 - weightA)
along the second, each toward its sign. The region both covers still hide is
the hole minus a rectangle of exactly the carpet's revealed shape, anchored
at the pointer-facing corner, with revealed area equal to the openness. A
sign only flips while that axis's weight is 0, which puts that cover at full
retreat, so the flip is never visible.

Tangent axis order matches readChannelTangentDeltas: hole axis 0 pairs
(y, z), hole axis 1 pairs (x, z), hole axis 2 pairs (x, y).
*/
export type MengerHoverMoveState = {
  openness: number;
  signA: 1 | -1;
  signB: 1 | -1;
  weightA: number;
};

export type MengerHoverState = {
  depthThree: MengerHoverMoveState[];
  depthTwo: MengerHoverMoveState[];
};

export function normalizeMengerHoverRevealRadius(value: number): number {
  if (!Number.isFinite(value)) {
    return MENGER_HOVER_DEFAULT_REVEAL_RADIUS;
  }

  return Math.min(Math.max(value, MENGER_HOVER_MIN_REVEAL_RADIUS), MENGER_HOVER_MAX_REVEAL_RADIUS);
}

function readChannelAxis(channel: number, faceGridSize: number): MengerHoleAxis {
  const axis = Math.floor(channel / (faceGridSize * faceGridSize));
  switch (axis) {
    case 0:
    case 1:
    case 2:
      return axis;
    default:
      throw new Error("Every Menger hover channel must use one cube axis.");
  }
}

function readChannelFaceCoordinates(channel: number, faceGridSize: number) {
  const axis = readChannelAxis(channel, faceGridSize);
  const channelWithinAxis = channel - axis * faceGridSize * faceGridSize;

  return {
    axis,
    coordinateA: Math.floor(channelWithinAxis / faceGridSize),
    coordinateB: channelWithinAxis % faceGridSize,
  };
}

type ChannelTangentDeltas = {
  deltaA: number;
  deltaB: number;
};

function readChannelTangentDeltas(
  axis: MengerHoleAxis,
  centerA: number,
  centerB: number,
  point: MengerHoverProbe,
): ChannelTangentDeltas {
  switch (axis) {
    case 0:
      return { deltaA: centerA - point.y, deltaB: centerB - point.z };
    case 1:
      return { deltaA: centerA - point.x, deltaB: centerB - point.z };
    case 2:
      return { deltaA: centerA - point.x, deltaB: centerB - point.y };
    default:
      return axis satisfies never;
  }
}

function clampUnit(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

/**
The carpet's readSlideAwayFromPointer, restated for the cover pair: the
openness split follows the pointer-to-center offset ratio, and within half a
hole side of the hole the split relaxes toward an even 0.5 so a cardinal
pass does not flip the rect between wide and tall across a knife edge.
*/
function readChannelSlide(
  deltas: ChannelTangentDeltas,
  holeSize: number,
): Omit<MengerHoverMoveState, "openness"> {
  const totalDelta = Math.abs(deltas.deltaA) + Math.abs(deltas.deltaB);
  const directionalBlend = clampUnit(totalDelta / (holeSize / 2));
  const directionalWeightA = totalDelta > 0 ? Math.abs(deltas.deltaA) / totalDelta : 0.5;

  return {
    signA: deltas.deltaA >= 0 ? 1 : -1,
    signB: deltas.deltaB >= 0 ? 1 : -1,
    weightA: 0.5 + (directionalWeightA - 0.5) * directionalBlend,
  };
}

function readChannelState(
  channel: number,
  stage: MengerDepthTransitionStage,
  probe: MengerHoverProbe | null,
  directionProbe: MengerHoverProbe | null,
  revealRadius: number,
): MengerHoverMoveState {
  const faceGridSize = stage.gridSize / 3;
  const { axis, coordinateA, coordinateB } = readChannelFaceCoordinates(channel, faceGridSize);
  const centerA = (coordinateA + 0.5) / faceGridSize;
  const centerB = (coordinateB + 0.5) / faceGridSize;

  // The heal after the pointer leaves keeps the last slide split and signs,
  // exactly like the carpet's direction pointer, so easing covers retract
  // along the path they came instead of teleporting.
  const slidePoint = probe ?? directionProbe;
  const slide =
    slidePoint === null
      ? { signA: 1 as const, signB: 1 as const, weightA: 0.5 }
      : readChannelSlide(
          readChannelTangentDeltas(axis, centerA, centerB, slidePoint),
          1 / faceGridSize / 3,
        );
  if (probe === null) {
    return { ...slide, openness: 0 };
  }

  let axisDelta: number;
  switch (axis) {
    case 0:
      axisDelta = Math.min(probe.x, 1 - probe.x);
      break;
    case 1:
      axisDelta = Math.min(probe.y, 1 - probe.y);
      break;
    case 2:
      axisDelta = Math.min(probe.z, 1 - probe.z);
      break;
    default:
      return axis satisfies never;
  }

  const { deltaA, deltaB } = readChannelTangentDeltas(axis, centerA, centerB, probe);
  const radius = normalizeMengerHoverRevealRadius(revealRadius);
  const closeness = 1 - Math.hypot(axisDelta, deltaA, deltaB, probe.outsideDistance) / radius;
  const normalized =
    closeness > 0 ? Math.min(closeness / (1 - MENGER_HOVER_FULL_OPEN_RADIUS_FRACTION), 1) : 0;

  return { ...slide, openness: normalized * normalized * (3 - 2 * normalized) };
}

function readStageChannelStates(
  stage: MengerDepthTransitionStage,
  probe: MengerHoverProbe | null,
  directionProbe: MengerHoverProbe | null,
  revealRadius: number,
): MengerHoverMoveState[] {
  const faceGridSize = stage.gridSize / 3;
  const channelCount = 3 * faceGridSize * faceGridSize;
  return Array.from({ length: channelCount }, (_, channel) =>
    readChannelState(channel, stage, probe, directionProbe, revealRadius),
  );
}

function toStageMoveStates(
  stage: MengerDepthTransitionStage,
  channelStates: MengerHoverMoveState[],
): MengerHoverMoveState[] {
  return stage.moves.map((move) => {
    const channelState = channelStates[move.faceColumnChannel];
    if (!channelState) {
      throw new Error("Every Menger mover must resolve to one hover channel.");
    }

    // The renderer smooths openness per mover in place, so every mover needs
    // its own state object.
    return { ...channelState };
  });
}

function rayIntersectsMove(
  origin: readonly [number, number, number],
  direction: readonly [number, number, number],
  moveCoordinate: readonly [number, number, number],
  gridSize: number,
): boolean {
  let entry = 0;
  let exit = Number.POSITIVE_INFINITY;

  for (const axis of [0, 1, 2] as const) {
    const axisOrigin = origin[axis];
    const axisDirection = direction[axis];
    const cellMinimum = moveCoordinate[axis] / gridSize;
    const cellMaximum = (moveCoordinate[axis] + 1) / gridSize;
    if (Math.abs(axisDirection) < Number.EPSILON) {
      if (axisOrigin < cellMinimum || axisOrigin > cellMaximum) {
        return false;
      }
      continue;
    }

    const first = (cellMinimum - axisOrigin) / axisDirection;
    const second = (cellMaximum - axisOrigin) / axisDirection;
    entry = Math.max(entry, Math.min(first, second));
    exit = Math.min(exit, Math.max(first, second));
    if (exit < entry) {
      return false;
    }
  }

  return exit >= entry;
}

function readDepthThreeBlockerMoveIndexes(
  model: MengerDepthTransitionModel,
  channel: number,
  direction: readonly [number, number, number],
): number[] {
  const faceGridSize = model.depthThree.gridSize / 3;
  const { axis, coordinateA, coordinateB } = readChannelFaceCoordinates(channel, faceGridSize);
  const axisDirection = direction[axis];
  if (Math.abs(axisDirection) < Number.EPSILON) {
    return [];
  }

  const tangentAxes = axis === 0 ? ([1, 2] as const) : axis === 1 ? ([0, 2] as const) : [0, 1];
  const origin: [number, number, number] = [0, 0, 0];
  origin[axis] = axisDirection < 0 ? 1 : 0;
  origin[tangentAxes[0]] = (coordinateA + 0.5) / faceGridSize;
  origin[tangentAxes[1]] = (coordinateB + 0.5) / faceGridSize;

  const blockerMoveIndexes: number[] = [];
  for (const [moveIndex, move] of model.depthTwo.moves.entries()) {
    if (
      move.holeAxis !== axis &&
      rayIntersectsMove(origin, direction, move.from, model.depthTwo.gridSize)
    ) {
      blockerMoveIndexes.push(moveIndex);
    }
  }

  return blockerMoveIndexes;
}

/**
Every opening in one channel shares its openness, split, and signs, so the
rectangles at both tunnel ends and every interior segment stay aligned. The
camera direction traces the real view ray from each depth-three opening
through the sponge. Depth-two pairs that cross that ray open their own normal
carpet rectangle. This keeps the cleared interior path aligned when the cube
tilts and does not open the rest of a blocker's channel. The floor ramps with
the depth-three opening, so it engages and releases continuously and vanishes
exactly at rest.
*/
export function readMengerHoverState(
  model: MengerDepthTransitionModel,
  probe: MengerHoverProbe | null,
  directionProbe: MengerHoverProbe | null,
  revealRadius: number,
): MengerHoverState {
  const depthTwoChannels = readStageChannelStates(
    model.depthTwo,
    probe,
    directionProbe,
    revealRadius,
  );
  const depthThreeChannels = readStageChannelStates(
    model.depthThree,
    probe,
    directionProbe,
    revealRadius,
  );
  const depthTwo = toStageMoveStates(model.depthTwo, depthTwoChannels);
  const depthThree = toStageMoveStates(model.depthThree, depthThreeChannels);
  const depthThreeFaceGridSize = model.depthThree.gridSize / 3;
  const depthThreeMoveChannels = new Set(
    model.depthThree.moves.map((move) => move.faceColumnChannel),
  );
  const direction = probe?.direction ?? directionProbe?.direction;

  depthThreeChannels.forEach((channelState, channel) => {
    if (channelState.openness <= 0 || !direction || !depthThreeMoveChannels.has(channel)) {
      return;
    }

    const blockerMoveIndexes = readDepthThreeBlockerMoveIndexes(model, channel, direction);
    if (blockerMoveIndexes.length === 0) {
      return;
    }

    const rayAxis = readChannelAxis(channel, depthThreeFaceGridSize);
    const floor = Math.min(1, channelState.openness * MENGER_HOVER_RAY_FLOOR_BOOST);
    for (const blockerMoveIndex of blockerMoveIndexes) {
      const blockerState = depthTwo[blockerMoveIndex];
      const blockerMove = model.depthTwo.moves[blockerMoveIndex];
      if (!blockerState || !blockerMove || blockerMove.holeAxis === rayAxis) {
        continue;
      }

      blockerState.openness = Math.max(blockerState.openness, floor);
    }
  });

  return { depthThree, depthTwo };
}
