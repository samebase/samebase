import {
  type MengerDepthTransitionModel,
  type MengerDepthTransitionStage,
  type MengerHoleAxis,
} from "./mengerDepthTransition.ts";

export const MENGER_HOVER_MIN_REVEAL_RADIUS = 0.05;
export const MENGER_HOVER_MAX_REVEAL_RADIUS = 1;
export const MENGER_HOVER_DEFAULT_REVEAL_RADIUS = 0.55;
export const MENGER_HOVER_MIN_DEPTH = 1;
export const MENGER_HOVER_MAX_DEPTH = 5;
export const MENGER_HOVER_DEFAULT_DEPTH = 4;
const MENGER_HOVER_FULL_OPEN_RADIUS_FRACTION = 0.25;
const MENGER_HOVER_VISIBLE_FACE_EPSILON = 1e-8;
const MENGER_HOLE_AXES: readonly MengerHoleAxis[] = [0, 1, 2];

/** Unit sponge coordinates: the full cube spans [0, 1] on every axis. */
export type MengerHoverProbe = {
  x: number;
  y: number;
  z: number;
};

/**
Every opening in one face-on channel shares this state. The renderer smooths
and uploads one value per channel instead of copying the same value to every
cube on the channel axis.
*/
export type MengerHoverChannelState = {
  anchorA: number;
  anchorB: number;
  openness: number;
  weightA: number;
};

export type MengerHoverState = {
  stages: MengerHoverChannelState[][];
};

/**
A lower-stage cover uses this static link to discard fragments inside one
deeper channel. minimumA, minimumB, and size use unit sponge coordinates.
*/
export type MengerHoverBlockerLink = {
  axis: MengerHoleAxis;
  channelStateIndex: number;
  minimumA: number;
  minimumB: number;
  size: number;
};

export type MengerHoverStageTopology = {
  blockerLinks: MengerHoverBlockerLink[];
  channelCount: number;
  channelStateOffset: number;
  maximumBlockerLinksPerMove: number;
  moveBlockerLinkCounts: Uint32Array;
  moveBlockerLinkOffsets: Uint32Array;
  moveChannelStateIndices: Uint32Array;
  moveHoleAxes: Uint8Array;
};

export type MengerHoverTopology = {
  channelCount: number;
  stages: MengerHoverStageTopology[];
};

type MengerHoverWorldPoint = {
  x: number;
  y: number;
  z: number;
};

type MengerHoverFaceProjection = {
  axis: MengerHoleAxis;
  point: MengerHoverWorldPoint;
  sign: 1 | -1;
  visibleFaceCount: number;
};

function readPointAxis(point: MengerHoverWorldPoint, axis: MengerHoleAxis): number {
  switch (axis) {
    case 0:
      return point.x;
    case 1:
      return point.y;
    case 2:
      return point.z;
    default:
      return axis satisfies never;
  }
}

/**
Maps an orthographic pointer line to the boundary of the visible cube
half-spaces. The last face plane entered is the finite cube surface when the
pointer covers the cube. Removing that face's tangent limits extends one face
over the full page, joins two faces on one edge, and joins three faces at their
corner.
*/
export function projectMengerHoverLineToVisibleFacePlanes(
  origin: MengerHoverWorldPoint,
  direction: MengerHoverWorldPoint,
  worldSize: number,
): MengerHoverFaceProjection | null {
  const halfWorldSize = worldSize / 2;
  let selectedAxis: MengerHoleAxis | null = null;
  let selectedDistance = Number.NEGATIVE_INFINITY;
  let selectedSign: 1 | -1 = 1;
  let visibleFaceCount = 0;

  for (const axis of MENGER_HOLE_AXES) {
    const directionValue = readPointAxis(direction, axis);
    if (Math.abs(directionValue) <= MENGER_HOVER_VISIBLE_FACE_EPSILON) {
      continue;
    }

    visibleFaceCount += 1;
    const sign = directionValue > 0 ? -1 : 1;
    const distance = (sign * halfWorldSize - readPointAxis(origin, axis)) / directionValue;
    if (distance > selectedDistance) {
      selectedAxis = axis;
      selectedDistance = distance;
      selectedSign = sign;
    }
  }

  if (selectedAxis === null) {
    return null;
  }

  return {
    axis: selectedAxis,
    point: {
      x: origin.x + direction.x * selectedDistance,
      y: origin.y + direction.y * selectedDistance,
      z: origin.z + direction.z * selectedDistance,
    },
    sign: selectedSign,
    visibleFaceCount,
  };
}

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

function writeChannelState(
  target: MengerHoverChannelState,
  channel: number,
  stage: MengerDepthTransitionStage,
  probe: MengerHoverProbe | null,
  directionProbe: MengerHoverProbe | null,
  revealRadius: number,
): void {
  const faceGridSize = stage.gridSize / 3;
  const axis = readChannelAxis(channel, faceGridSize);
  const channelWithinAxis = channel - axis * faceGridSize * faceGridSize;
  const coordinateA = Math.floor(channelWithinAxis / faceGridSize);
  const coordinateB = channelWithinAxis % faceGridSize;
  const centerA = (coordinateA + 0.5) / faceGridSize;
  const centerB = (coordinateB + 0.5) / faceGridSize;
  const holeSize = 1 / stage.gridSize;
  const slidePoint = probe ?? directionProbe;
  let deltaA = 0;
  let deltaB = 0;
  if (slidePoint === null) {
    target.anchorA = 0.5;
    target.anchorB = 0.5;
    target.weightA = 0.5;
  } else {
    switch (axis) {
      case 0:
        deltaA = centerA - slidePoint.y;
        deltaB = centerB - slidePoint.z;
        break;
      case 1:
        deltaA = centerA - slidePoint.x;
        deltaB = centerB - slidePoint.z;
        break;
      case 2:
        deltaA = centerA - slidePoint.x;
        deltaB = centerB - slidePoint.y;
        break;
      default:
        return axis satisfies never;
    }
    const totalDelta = Math.abs(deltaA) + Math.abs(deltaB);
    const directionalBlend = Math.min(totalDelta / (holeSize / 2), 1);
    const directionalWeightA = totalDelta > 0 ? Math.abs(deltaA) / totalDelta : 0.5;
    target.anchorA = Math.min(Math.max(0.5 - deltaA / holeSize, 0), 1);
    target.anchorB = Math.min(Math.max(0.5 - deltaB / holeSize, 0), 1);
    target.weightA = 0.5 + (directionalWeightA - 0.5) * directionalBlend;
  }

  if (probe === null) {
    target.openness = 0;
    return;
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

  const closeness = 1 - Math.hypot(axisDelta, deltaA, deltaB) / revealRadius;
  const normalized =
    closeness > 0 ? Math.min(closeness / (1 - MENGER_HOVER_FULL_OPEN_RADIUS_FRACTION), 1) : 0;
  target.openness = normalized * normalized * (3 - 2 * normalized);
}

export function createMengerHoverState(model: MengerDepthTransitionModel): MengerHoverState {
  return {
    stages: model.stages.map((stage) => {
      const faceGridSize = stage.gridSize / 3;
      return Array.from({ length: 3 * faceGridSize * faceGridSize }, () => ({
        anchorA: 0.5,
        anchorB: 0.5,
        openness: 0,
        weightA: 0.5,
      }));
    }),
  };
}

/**
Updates one stable channel-state allocation. This is the per-frame path used
by the renderer.
*/
export function writeMengerHoverState(
  target: MengerHoverState,
  model: MengerDepthTransitionModel,
  probe: MengerHoverProbe | null,
  directionProbe: MengerHoverProbe | null,
  revealRadius: number,
): void {
  const normalizedRevealRadius = normalizeMengerHoverRevealRadius(revealRadius);
  for (let stageIndex = 0; stageIndex < model.stages.length; stageIndex += 1) {
    const stage = model.stages[stageIndex];
    const stageState = target.stages[stageIndex];
    if (!stage || !stageState) {
      throw new Error("Every Menger hover stage must have model and channel state.");
    }
    for (let channel = 0; channel < stageState.length; channel += 1) {
      const channelState = stageState[channel];
      if (!channelState) {
        throw new Error("Every Menger hover channel must have state.");
      }
      writeChannelState(
        channelState,
        channel,
        stage,
        probe,
        directionProbe,
        normalizedRevealRadius,
      );
    }
  }
}

export function readMengerHoverState(
  model: MengerDepthTransitionModel,
  probe: MengerHoverProbe | null,
  directionProbe: MengerHoverProbe | null,
  revealRadius: number,
): MengerHoverState {
  const state = createMengerHoverState(model);
  writeMengerHoverState(state, model, probe, directionProbe, revealRadius);
  return state;
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

function createBlockerIndexes(stage: MengerDepthTransitionStage): Array<Map<string, number[]>> {
  return MENGER_HOLE_AXES.map((axis) => {
    const [tangentA, tangentB] = readTangentAxes(axis);
    const indexes = new Map<string, number[]>();
    stage.moves.forEach((move, moveIndex) => {
      if (move.holeAxis === axis) {
        return;
      }
      const key = `${move.from[tangentA]},${move.from[tangentB]}`;
      const moveIndexes = indexes.get(key) ?? [];
      moveIndexes.push(moveIndex);
      indexes.set(key, moveIndexes);
    });
    return indexes;
  });
}

export function createMengerHoverTopology(model: MengerDepthTransitionModel): MengerHoverTopology {
  let channelStateOffset = 0;
  const mutableStages = model.stages.map((stage) => {
    const faceGridSize = stage.gridSize / 3;
    const channelCount = 3 * faceGridSize * faceGridSize;
    const moveChannelStateIndices = Uint32Array.from(
      stage.moves.map((move) => channelStateOffset + move.faceColumnChannel),
    );
    const moveHoleAxes = Uint8Array.from(stage.moves.map((move) => move.holeAxis));
    const blockerLinksByMove: MengerHoverBlockerLink[][] = Array.from(
      { length: stage.moves.length },
      () => [],
    );
    const mutableStage = {
      blockerLinksByMove,
      channelCount,
      channelStateOffset,
      moveChannelStateIndices,
      moveHoleAxes,
    };
    channelStateOffset += channelCount;
    return mutableStage;
  });
  const blockerIndexes = model.stages.slice(0, -1).map(createBlockerIndexes);

  for (let rayStageIndex = 1; rayStageIndex < model.stages.length; rayStageIndex += 1) {
    const rayStage = model.stages[rayStageIndex];
    const rayTopology = mutableStages[rayStageIndex];
    if (!rayStage || !rayTopology) {
      throw new Error("Every Menger ray stage must have topology.");
    }
    const faceGridSize = rayStage.gridSize / 3;
    const visitedChannels = new Set<number>();
    for (const move of rayStage.moves) {
      const channel = move.faceColumnChannel;
      if (visitedChannels.has(channel)) {
        continue;
      }
      visitedChannels.add(channel);

      const { axis, coordinateA, coordinateB } = readChannelFaceCoordinates(channel, faceGridSize);
      const centerA = (coordinateA + 0.5) / faceGridSize;
      const centerB = (coordinateB + 0.5) / faceGridSize;
      const link: MengerHoverBlockerLink = {
        axis,
        channelStateIndex: rayTopology.channelStateOffset + channel,
        minimumA: (coordinateA + 1 / 3) / faceGridSize,
        minimumB: (coordinateB + 1 / 3) / faceGridSize,
        size: 1 / faceGridSize / 3,
      };

      for (let blockerStageIndex = 0; blockerStageIndex < rayStageIndex; blockerStageIndex += 1) {
        const blockerStage = model.stages[blockerStageIndex];
        const blockerStageTopology = mutableStages[blockerStageIndex];
        const indexesForAxis = blockerIndexes[blockerStageIndex]?.[axis];
        if (!blockerStage || !blockerStageTopology || !indexesForAxis) {
          throw new Error("Every lower Menger stage must have blocker topology.");
        }
        const coordinateAInBlocker = Math.min(
          Math.floor(centerA * blockerStage.gridSize),
          blockerStage.gridSize - 1,
        );
        const coordinateBInBlocker = Math.min(
          Math.floor(centerB * blockerStage.gridSize),
          blockerStage.gridSize - 1,
        );
        const moveIndexes =
          indexesForAxis.get(`${coordinateAInBlocker},${coordinateBInBlocker}`) ?? [];
        for (const moveIndex of moveIndexes) {
          blockerStageTopology.blockerLinksByMove[moveIndex]?.push(link);
        }
      }
    }
  }

  return {
    channelCount: channelStateOffset,
    stages: mutableStages.map((stage) => {
      let linkOffset = 0;
      let maximumBlockerLinksPerMove = 0;
      const moveBlockerLinkCounts = Uint32Array.from(
        stage.blockerLinksByMove.map((links) => {
          maximumBlockerLinksPerMove = Math.max(maximumBlockerLinksPerMove, links.length);
          return links.length;
        }),
      );
      const moveBlockerLinkOffsets = Uint32Array.from(
        stage.blockerLinksByMove.map((links) => {
          const offset = linkOffset;
          linkOffset += links.length;
          return offset;
        }),
      );

      return {
        blockerLinks: stage.blockerLinksByMove.flat(),
        channelCount: stage.channelCount,
        channelStateOffset: stage.channelStateOffset,
        maximumBlockerLinksPerMove,
        moveBlockerLinkCounts,
        moveBlockerLinkOffsets,
        moveChannelStateIndices: stage.moveChannelStateIndices,
        moveHoleAxes: stage.moveHoleAxes,
      };
    }),
  };
}
