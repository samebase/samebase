import {
  type MengerDepthTransitionModel,
  type MengerDepthTransitionStage,
  type MengerHoleAxis,
} from "./mengerDepthTransition.ts";

export const MENGER_HOVER_MIN_REVEAL_RADIUS = 0.05;
export const MENGER_HOVER_MAX_REVEAL_RADIUS = 1;
export const MENGER_HOVER_DEFAULT_REVEAL_RADIUS = 0.55;
export const MENGER_HOVER_MAX_CLEARANCE_BOXES_PER_MOVE = 80;
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
sign only flips while that axis's weight is 0, which puts that cover at full
retreat, so the flip is never visible.

Tangent axis order matches readChannelTangentDeltas: hole axis 0 pairs
(y, z), hole axis 1 pairs (x, z), hole axis 2 pairs (x, y).

clearances are the signed depth-three rectangles that cross this depth-two
cell. Each rectangle stays on one cube axis.
*/
export type MengerHoverMoveState = {
  clearances: MengerHoverClearance[];
  openness: number;
  signA: 1 | -1;
  signB: 1 | -1;
  weightA: number;
};

export type MengerHoverClearance = {
  axis: MengerHoleAxis;
  extentA: number;
  extentB: number;
  placement: "cell" | "middle-third";
};

export type MengerHoverClearanceBox = {
  maximum: readonly [number, number, number];
  minimum: readonly [number, number, number];
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
): Pick<MengerHoverMoveState, "signA" | "signB" | "weightA"> {
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
    return { ...slide, clearances: [], openness: 0 };
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

  return {
    ...slide,
    clearances: [],
    openness: normalized * normalized * (3 - 2 * normalized),
  };
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

function readTangentAxes(axis: MengerHoleAxis): readonly [MengerHoleAxis, MengerHoleAxis] {
  switch (axis) {
    case 0:
      return [1, 2];
    case 1:
      return [0, 2];
    case 2:
      return [0, 1];
    default:
      return axis satisfies never;
  }
}

function readDepthThreeBlockerMoveIndexes(
  model: MengerDepthTransitionModel,
  channel: number,
): number[] {
  const faceGridSize = model.depthThree.gridSize / 3;
  const { axis, coordinateA, coordinateB } = readChannelFaceCoordinates(channel, faceGridSize);
  const tangentAxes = readTangentAxes(axis);
  const coordinateAlongA = (coordinateA + 0.5) / faceGridSize;
  const coordinateAlongB = (coordinateB + 0.5) / faceGridSize;

  const blockerMoveIndexes: number[] = [];
  for (const [moveIndex, move] of model.depthTwo.moves.entries()) {
    const minimumA = move.from[tangentAxes[0]] / model.depthTwo.gridSize;
    const maximumA = (move.from[tangentAxes[0]] + 1) / model.depthTwo.gridSize;
    const minimumB = move.from[tangentAxes[1]] / model.depthTwo.gridSize;
    const maximumB = (move.from[tangentAxes[1]] + 1) / model.depthTwo.gridSize;
    if (
      move.holeAxis !== axis &&
      coordinateAlongA >= minimumA &&
      coordinateAlongA <= maximumA &&
      coordinateAlongB >= minimumB &&
      coordinateAlongB <= maximumB
    ) {
      blockerMoveIndexes.push(moveIndex);
    }
  }

  return blockerMoveIndexes;
}

/**
Recomputes the depth-two clearance strips from the current depth-three move
states. The caller can first smooth depth-three openness and then call this
function, so each interior strip grows at the same rate as its visible
depth-three opening.
*/
export function applyMengerHoverDepthThreeClearance(
  model: MengerDepthTransitionModel,
  state: MengerHoverState,
): void {
  for (const moveState of state.depthTwo) {
    moveState.clearances = [];
  }

  const depthThreeFaceGridSize = model.depthThree.gridSize / 3;
  const visitedChannels = new Set<number>();

  model.depthThree.moves.forEach((move, moveIndex) => {
    const channel = move.faceColumnChannel;
    if (visitedChannels.has(channel)) {
      return;
    }
    visitedChannels.add(channel);

    const channelState = state.depthThree[moveIndex];
    if (!channelState || channelState.openness <= 0) {
      return;
    }

    const blockerMoveIndexes = readDepthThreeBlockerMoveIndexes(model, channel);
    if (blockerMoveIndexes.length === 0) {
      return;
    }

    const rayAxis = readChannelAxis(channel, depthThreeFaceGridSize);
    for (const blockerMoveIndex of blockerMoveIndexes) {
      const blockerState = state.depthTwo[blockerMoveIndex];
      const blockerMove = model.depthTwo.moves[blockerMoveIndex];
      if (!blockerState || !blockerMove || blockerMove.holeAxis === rayAxis) {
        continue;
      }

      blockerState.clearances.push({
        axis: rayAxis,
        extentA: channelState.signA * channelState.openness ** channelState.weightA,
        extentB: channelState.signB * channelState.openness ** (1 - channelState.weightA),
        placement: "middle-third",
      });
    }
  });
}

/**
Every opening in one channel shares its openness, split, and signs, so the
rectangles at both tunnel ends and every interior segment stay aligned. The
depth-three opening stays on one cube axis through the full sponge. A crossed
depth-two pair gets the same rectangular clearance.
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
  const state = {
    depthTwo: toStageMoveStates(model.depthTwo, depthTwoChannels),
    depthThree: toStageMoveStates(model.depthThree, depthThreeChannels),
  };
  applyMengerHoverDepthThreeClearance(model, state);

  return state;
}

function readClearanceInterval(
  extent: number,
  placement: MengerHoverClearance["placement"],
): readonly [number, number] | null {
  if (extent === 0) {
    return null;
  }

  if (placement === "cell") {
    return extent > 0 ? [0, Math.abs(extent)] : [1 - Math.abs(extent), 1];
  }

  return extent > 0 ? [1 / 3, (1 + Math.abs(extent)) / 3] : [(2 - Math.abs(extent)) / 3, 2 / 3];
}

/**
Splits one depth-two cell into solid axis-aligned boxes after subtracting all
active depth-three tunnel rectangles. The interval boundaries move with the
same signed extents as the visible face openings.
*/
export function readMengerHoverClearanceBoxes(
  clearances: MengerHoverClearance[],
): MengerHoverClearanceBox[] {
  const tunnels = clearances.flatMap((clearance) => {
    const intervalA = readClearanceInterval(clearance.extentA, clearance.placement);
    const intervalB = readClearanceInterval(clearance.extentB, clearance.placement);
    if (!intervalA || !intervalB) {
      return [];
    }

    const [tangentA, tangentB] = readTangentAxes(clearance.axis);
    return [{ intervalA, intervalB, tangentA, tangentB }];
  });
  if (tunnels.length === 0) {
    return [
      {
        maximum: [1, 1, 1],
        minimum: [0, 0, 0],
      },
    ];
  }

  const boundaries: [number[], number[], number[]] = [
    [0, 1],
    [0, 1],
    [0, 1],
  ];
  for (const tunnel of tunnels) {
    boundaries[tunnel.tangentA].push(...tunnel.intervalA);
    boundaries[tunnel.tangentB].push(...tunnel.intervalB);
  }
  for (const axisBoundaries of boundaries) {
    axisBoundaries.sort((left, right) => left - right);
    for (let index = axisBoundaries.length - 1; index > 0; index -= 1) {
      if (axisBoundaries[index] === axisBoundaries[index - 1]) {
        axisBoundaries.splice(index, 1);
      }
    }
  }

  const boxes: MengerHoverClearanceBox[] = [];
  for (let x = 0; x < boundaries[0].length - 1; x += 1) {
    for (let y = 0; y < boundaries[1].length - 1; y += 1) {
      for (let z = 0; z < boundaries[2].length - 1; z += 1) {
        const minimum: [number, number, number] = [
          boundaries[0][x] ?? 0,
          boundaries[1][y] ?? 0,
          boundaries[2][z] ?? 0,
        ];
        const maximum: [number, number, number] = [
          boundaries[0][x + 1] ?? 1,
          boundaries[1][y + 1] ?? 1,
          boundaries[2][z + 1] ?? 1,
        ];
        const center: [number, number, number] = [
          (minimum[0] + maximum[0]) / 2,
          (minimum[1] + maximum[1]) / 2,
          (minimum[2] + maximum[2]) / 2,
        ];
        const insideTunnel = tunnels.some(
          (tunnel) =>
            center[tunnel.tangentA] >= tunnel.intervalA[0] &&
            center[tunnel.tangentA] <= tunnel.intervalA[1] &&
            center[tunnel.tangentB] >= tunnel.intervalB[0] &&
            center[tunnel.tangentB] <= tunnel.intervalB[1],
        );
        if (!insideTunnel) {
          boxes.push({ maximum, minimum });
        }
      }
    }
  }

  if (boxes.length > MENGER_HOVER_MAX_CLEARANCE_BOXES_PER_MOVE) {
    throw new Error("One Menger blocker must fit its bounded clearance box partition.");
  }

  return boxes;
}
