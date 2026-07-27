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
Unit sponge coordinates: the full cube spans [0, 1] on every axis.
outsideDistance is how far the pointer ray passes outside the cube surface in
the same unit scale; probes on the surface use 0. It joins the channel
distance term so influence fades continuously while the pointer skims past
the silhouette instead of collapsing to the resting state at the edge.
*/
export type MengerHoverProbe = {
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
sign only flips while that axis's weight is 0, which parks its cover fully
inside the solid sibling ring, so the flip is never visible.

forcedA and forcedB are ray dodges: when an open depth-three view ray
crosses a depth-two pair from another hole axis, motion along the ray can
never clear the column, so both covers gain a displacement on the axis
perpendicular to hole and ray, ramping with the ray's openness. They are
SIGNED slides in cell units: nothing hides a dodged cover at a side switch,
so the renderer smooths the signed value and the cover sweeps back through
the column instead of teleporting between sides. The renderer applies
forcedA to both covers' A-axis components (the larger magnitude of own
slide and force wins on the cover's native axis) and forcedB likewise, so a
forced pair leaves the crossed column entirely. Depth-three movers are
never crossed and keep both at 0.

Tangent axis order matches readChannelTangentDeltas: hole axis 0 pairs
(y, z), hole axis 1 pairs (x, z), hole axis 2 pairs (x, y).
*/
export type MengerHoverMoveState = {
  forcedA: number;
  forcedB: number;
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

type ChannelState = {
  openness: number;
  signA: 1 | -1;
  signB: 1 | -1;
  weightA: number;
};

/**
The carpet's readSlideAwayFromPointer, restated for the cover pair: the
openness split follows the pointer-to-center offset ratio, and within half a
hole side of the hole the split relaxes toward an even 0.5 so a cardinal
pass does not flip the rect between wide and tall across a knife edge.
*/
function readChannelSlide(
  deltas: ChannelTangentDeltas,
  holeSize: number,
): Omit<ChannelState, "openness"> {
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
): ChannelState {
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
): ChannelState[] {
  const faceGridSize = stage.gridSize / 3;
  const channelCount = 3 * faceGridSize * faceGridSize;
  return Array.from({ length: channelCount }, (_, channel) =>
    readChannelState(channel, stage, probe, directionProbe, revealRadius),
  );
}

function toStageMoveStates(
  stage: MengerDepthTransitionStage,
  channelStates: ChannelState[],
): MengerHoverMoveState[] {
  return stage.moves.map((move) => {
    const channelState = channelStates[move.faceColumnChannel];
    if (!channelState) {
      throw new Error("Every Menger mover must resolve to one hover channel.");
    }

    // The renderer smooths openness and forces per mover in place, so every
    // mover needs its own state object.
    return { ...channelState, forcedA: 0, forcedB: 0 };
  });
}

function readProjectedMoveCoordinates(
  axis: MengerHoleAxis,
  coordinate: readonly [number, number, number],
): readonly [number, number] {
  switch (axis) {
    case 0:
      return [coordinate[1], coordinate[2]];
    case 1:
      return [coordinate[0], coordinate[2]];
    case 2:
      return [coordinate[0], coordinate[1]];
    default:
      return axis satisfies never;
  }
}

function createDepthThreeBlockerMoveIndexes(model: MengerDepthTransitionModel): number[][] {
  const depthThree = model.depthThree;
  const faceGridSize = depthThree.gridSize / 3;
  const channelCount = 3 * faceGridSize * faceGridSize;
  const depthThreeChannels = new Set(depthThree.moves.map((move) => move.faceColumnChannel));

  return Array.from({ length: channelCount }, (_, channel) => {
    if (!depthThreeChannels.has(channel)) {
      return [];
    }

    const { axis, coordinateA, coordinateB } = readChannelFaceCoordinates(channel, faceGridSize);
    const blockerMoveIndexes: number[] = [];
    for (const [moveIndex, move] of model.depthTwo.moves.entries()) {
      const [moveCoordinateA, moveCoordinateB] = readProjectedMoveCoordinates(axis, move.from);
      if (moveCoordinateA === coordinateA && moveCoordinateB === coordinateB) {
        blockerMoveIndexes.push(moveIndex);
      }
    }

    return blockerMoveIndexes;
  });
}

const MENGER_HOVER_BLOCKER_MOVE_INDEXES_BY_MODEL = new WeakMap<
  MengerDepthTransitionModel,
  number[][]
>();

function readDepthThreeBlockerMoveIndexes(model: MengerDepthTransitionModel): number[][] {
  const existing = MENGER_HOVER_BLOCKER_MOVE_INDEXES_BY_MODEL.get(model);
  if (existing) {
    return existing;
  }

  const created = createDepthThreeBlockerMoveIndexes(model);
  MENGER_HOVER_BLOCKER_MOVE_INDEXES_BY_MODEL.set(model, created);
  return created;
}

function readPerpendicularAxis(left: MengerHoleAxis, right: MengerHoleAxis): MengerHoleAxis {
  switch (left + right) {
    case 1:
      return 2;
    case 2:
      return 1;
    case 3:
      return 0;
    default:
      throw new Error("Perpendicular axes exist only for two distinct cube axes.");
  }
}

/**
Every opening in one face-on channel shares its openness, split, and signs,
so the rectangles at both tunnel ends and every interior segment stay
aligned and the through view is the same rectangle. Depth-three rays that
cross depth-two pairs from another hole axis raise those pairs' forced
dodge on the perpendicular axis; the force ramps with the ray's openness,
so it engages and releases continuously and vanishes exactly at rest.
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
  const blockerMoveIndexesByChannel = readDepthThreeBlockerMoveIndexes(model);
  const depthThreeFaceGridSize = model.depthThree.gridSize / 3;

  depthThreeChannels.forEach((channelState, channel) => {
    if (channelState.openness <= 0) {
      return;
    }

    const blockerMoveIndexes = blockerMoveIndexesByChannel[channel] ?? [];
    if (blockerMoveIndexes.length === 0) {
      return;
    }

    const rayAxis = readChannelAxis(channel, depthThreeFaceGridSize);
    for (const blockerMoveIndex of blockerMoveIndexes) {
      const blockerState = depthTwo[blockerMoveIndex];
      const blockerMove = model.depthTwo.moves[blockerMoveIndex];
      if (!blockerState || !blockerMove || blockerMove.holeAxis === rayAxis) {
        continue;
      }

      const dodgeAxis = readPerpendicularAxis(blockerMove.holeAxis, rayAxis);
      const blockerTangentAxisA = blockerMove.holeAxis === 0 ? 1 : 0;
      if (dodgeAxis === blockerTangentAxisA) {
        blockerState.forcedA =
          blockerState.signA * Math.max(Math.abs(blockerState.forcedA), channelState.openness);
      } else {
        blockerState.forcedB =
          blockerState.signB * Math.max(Math.abs(blockerState.forcedB), channelState.openness);
      }
    }
  });

  return { depthThree, depthTwo };
}
