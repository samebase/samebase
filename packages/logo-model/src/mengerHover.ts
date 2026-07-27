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
offset is the mover's full slide in its own child-cell units: always 0 on the
mover's hole axis and Chebyshev norm 1 across its two tangent axes. The ring
of eight retained siblings around a face-center hole is solid, so every
Chebyshev-1 tangent offset parks the fully open mover inside solid geometry.
The rendered position is from + ease(openness) * offset, which keeps the
reveal continuous in both pointer position and openness; the discrete
axis-pick this replaces teleported partially open movers whenever the pointer
crossed a channel diagonal or axis line.
*/
export type MengerHoverMoveState = {
  offset: [number, number, number];
  openness: number;
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

function toChannelOffset(
  axis: MengerHoleAxis,
  offsetA: number,
  offsetB: number,
): [number, number, number] {
  switch (axis) {
    case 0:
      return [0, offsetA, offsetB];
    case 1:
      return [offsetA, 0, offsetB];
    case 2:
      return [offsetA, offsetB, 0];
    default:
      return axis satisfies never;
  }
}

/**
The slide points away from the pointer like the carpet wipe, scaled so the
larger tangent component is exactly 1: the offset rotates continuously around
the sibling ring as the pointer orbits the channel instead of snapping
between four discrete slide lines. The pointer can only cross the degenerate
center while the channel is fully open, so the fallback never shows.
*/
function readChannelSlideOffset(deltas: ChannelTangentDeltas): readonly [number, number] {
  const magnitude = Math.max(Math.abs(deltas.deltaA), Math.abs(deltas.deltaB));
  if (magnitude <= 0) {
    return [1, 0];
  }

  return [deltas.deltaA / magnitude, deltas.deltaB / magnitude];
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

  // The heal after the pointer leaves keeps the last slide direction, exactly
  // like the carpet's direction pointer; a zero offset here would teleport
  // every easing mover back to its hole in one frame.
  const slidePoint = probe ?? directionProbe;
  const slide =
    slidePoint === null
      ? ([1, 0] as const)
      : readChannelSlideOffset(readChannelTangentDeltas(axis, centerA, centerB, slidePoint));
  const offset = toChannelOffset(axis, slide[0], slide[1]);
  if (probe === null) {
    return { offset, openness: 0 };
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

  return { offset, openness: normalized * normalized * (3 - 2 * normalized) };
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

function readDepthThreeBlockerMoveIndexes(model: MengerDepthTransitionModel): number[][] {
  const existing = MENGER_HOVER_BLOCKER_MOVE_INDEXES_BY_MODEL.get(model);
  if (existing) {
    return existing;
  }

  const created = createDepthThreeBlockerMoveIndexes(model);
  MENGER_HOVER_BLOCKER_MOVE_INDEXES_BY_MODEL.set(model, created);
  return created;
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

/**
All cube pairs in one face-on channel share its openness and slide offset. A
depth-two cube also moves when it blocks an open depth-three view ray; the
override applies to that cube alone, not its whole channel, so it never opens
an unrelated coarse hole. A cross-axis blocker (a side-hole cover crossing a
front-face ray) must dodge along the one axis perpendicular to both its own
hole axis and the ray axis: its natural tangent plane contains the ray axis,
and any slide along the ray keeps the column covered forever, which made the
deep view snap between fully blocked and fully open.
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
  const depthTwo = model.depthTwo.moves.map((move): MengerHoverMoveState => {
    const channelState = depthTwoChannels[move.faceColumnChannel];
    if (!channelState) {
      throw new Error("Every depth-two Menger mover must resolve to one hover channel.");
    }

    return {
      offset: [channelState.offset[0], channelState.offset[1], channelState.offset[2]],
      openness: channelState.openness,
    };
  });
  const depthThree = model.depthThree.moves.map((move) => {
    const channelState = depthThreeChannels[move.faceColumnChannel];
    if (!channelState) {
      throw new Error("Every depth-three Menger mover must resolve to one hover channel.");
    }

    return { offset: channelState.offset, openness: channelState.openness };
  });
  const blockerMoveIndexesByChannel = readDepthThreeBlockerMoveIndexes(model);
  const depthThreeFaceGridSize = model.depthThree.gridSize / 3;

  depthThreeChannels.forEach((state, channel) => {
    const blockerMoveIndexes = blockerMoveIndexesByChannel[channel] ?? [];
    if (blockerMoveIndexes.length === 0) {
      return;
    }

    const rayAxis = readChannelAxis(channel, depthThreeFaceGridSize);
    for (const blockerMoveIndex of blockerMoveIndexes) {
      const blockerState = depthTwo[blockerMoveIndex];
      const blockerMove = model.depthTwo.moves[blockerMoveIndex];
      if (!blockerState || !blockerMove || state.openness <= blockerState.openness) {
        continue;
      }

      blockerState.openness = state.openness;
      if (blockerMove.holeAxis !== rayAxis) {
        const perpendicularAxis = readPerpendicularAxis(blockerMove.holeAxis, rayAxis);
        const perpendicularSign = blockerState.offset[perpendicularAxis] < 0 ? -1 : 1;
        blockerState.offset[perpendicularAxis] = perpendicularSign;
        blockerState.offset[rayAxis] = 0;
      }
    }
  });

  return { depthThree, depthTwo };
}
