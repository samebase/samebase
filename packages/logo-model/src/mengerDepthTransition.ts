import {
  MENGER_SPONGE_VOXEL_STATE,
  parseVoxelKey,
  parseVoxelState,
  type VoxelCoordinate,
} from "./voxel.ts";

export const MENGER_DEPTH_TRANSITION_SPLIT_HOLD_MS = 240;
export const MENGER_DEPTH_TRANSITION_DEPTH_HOLD_MS = 700;
export const MENGER_DEPTH_TRANSITION_MOVE_DURATION_MS = 1_800;
export const MENGER_DEPTH_TRANSITION_DEFAULT_STAGGER_GROUP_COUNT = 3;
export const MENGER_DEPTH_TRANSITION_MAX_STAGGER_GROUP_COUNT = 243;
const FACE_NEIGHBOR_OFFSETS: readonly VoxelCoordinate[] = [
  [-1, 0, 0],
  [1, 0, 0],
  [0, -1, 0],
  [0, 1, 0],
  [0, 0, -1],
  [0, 0, 1],
];

export type MengerDepthTransitionMove = {
  faceColumnChannel: number;
  from: VoxelCoordinate;
  holeAxis: MengerHoleAxis;
  startTimeMs: number;
  to: VoxelCoordinate;
};

export type MengerHoleAxis = 0 | 1 | 2;

export type MengerDepthTransitionStage = {
  depth: number;
  endTimeMs: number;
  gridSize: number;
  moves: MengerDepthTransitionMove[];
  settledVoxelCount: number;
  /** Null only when a compact final stage keeps the count but not its coordinates. */
  settledVoxels: VoxelCoordinate[] | null;
  sourceVoxels: VoxelCoordinate[];
  splitTimeMs: number;
};

export type MengerDepthTransitionModel = {
  depthOneVoxels: VoxelCoordinate[];
  stages: [MengerDepthTransitionStage, ...MengerDepthTransitionStage[]];
  totalDurationMs: number;
};

export function easeMengerDepthTransitionProgress(value: number): number {
  const progress = Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : 0;
  if (progress < 0.5) {
    return 4 * progress * progress * progress;
  }

  return 1 - Math.pow(-2 * progress + 2, 3) / 2;
}

export function readMengerDepthTransitionStage(
  model: MengerDepthTransitionModel,
  elapsedMs: number,
): MengerDepthTransitionStage | null {
  for (let stageIndex = model.stages.length - 1; stageIndex >= 0; stageIndex -= 1) {
    const stage = model.stages[stageIndex];
    if (stage && elapsedMs > stage.splitTimeMs) {
      return stage;
    }
  }

  return null;
}

export function readMengerDepthTransitionMoveProgress(
  move: MengerDepthTransitionMove,
  elapsedMs: number,
): number | null {
  if (elapsedMs === Number.POSITIVE_INFINITY) {
    return null;
  }

  const progress =
    (Number.isFinite(elapsedMs) ? elapsedMs - move.startTimeMs : 0) /
    MENGER_DEPTH_TRANSITION_MOVE_DURATION_MS;
  if (progress >= 1) {
    return null;
  }

  return easeMengerDepthTransitionProgress(progress);
}

function compareVoxelCoordinates(left: VoxelCoordinate, right: VoxelCoordinate): number {
  return left[0] - right[0] || left[1] - right[1] || left[2] - right[2];
}

function readMengerCoordinates(): VoxelCoordinate[] {
  const parsedState = parseVoxelState(MENGER_SPONGE_VOXEL_STATE);
  if (!parsedState) {
    throw new Error("The tracked Menger sponge voxel state must stay valid.");
  }

  const coordinates: VoxelCoordinate[] = [];
  for (const key of parsedState.filledVoxels) {
    const coordinate = parseVoxelKey(key);
    if (coordinate) {
      coordinates.push(coordinate);
    }
  }

  return coordinates.sort(compareVoxelCoordinates);
}

function toChildCoordinate(parent: VoxelCoordinate, child: VoxelCoordinate): VoxelCoordinate {
  return [parent[0] * 3 + child[0], parent[1] * 3 + child[1], parent[2] * 3 + child[2]];
}

function readDirectionNoise(
  coordinate: VoxelCoordinate,
  depth: MengerDepthTransitionStage["depth"],
): number {
  const depthChannel = (depth - 2) * 17;
  const value = Math.sin(
    coordinate[0] * 12.9898 +
      coordinate[1] * 78.233 +
      coordinate[2] * 37.719 +
      depthChannel * 53.123,
  );
  const scaledValue = value * 43_758.5453;

  return scaledValue - Math.floor(scaledValue);
}

function createStaggerGroups(
  depth: MengerDepthTransitionStage["depth"],
  requestedStaggerGroupCount: number,
) {
  const faceGridSize = 3 ** (depth - 1);
  const faceColumnCount = 3 * faceGridSize * faceGridSize;
  const staggerGroupCount = Math.min(requestedStaggerGroupCount, faceColumnCount);
  const channels = Array.from({ length: faceColumnCount }, (_, channel) => channel);
  channels.sort(
    (left, right) =>
      readDirectionNoise([left, depth, 29], depth) -
        readDirectionNoise([right, depth, 29], depth) || left - right,
  );

  return {
    faceGridSize,
    staggerGroupCount,
    staggerGroups: new Map(
      channels.map((channel, rank) => [
        channel,
        Math.floor((rank * staggerGroupCount) / channels.length),
      ]),
    ),
  };
}

function readFaceColumnChannel(
  parent: VoxelCoordinate,
  holeAxis: MengerHoleAxis,
  faceGridSize: number,
): number {
  // Ignore depth along the hole axis so an entire face-on ray shares one
  // movement pattern and one start time.
  let faceCoordinateA: number;
  let faceCoordinateB: number;
  switch (holeAxis) {
    case 0:
      faceCoordinateA = parent[1];
      faceCoordinateB = parent[2];
      break;
    case 1:
      faceCoordinateA = parent[0];
      faceCoordinateB = parent[2];
      break;
    case 2:
      faceCoordinateA = parent[0];
      faceCoordinateB = parent[1];
      break;
    default:
      return holeAxis satisfies never;
  }

  return holeAxis * faceGridSize * faceGridSize + faceCoordinateA * faceGridSize + faceCoordinateB;
}

function readHoleAxis(child: VoxelCoordinate): MengerHoleAxis {
  const holeAxis = child.findIndex((axis) => axis !== 1);
  switch (holeAxis) {
    case 0:
    case 1:
    case 2:
      return holeAxis;
    default:
      throw new Error("Every absorbed Menger child must identify a hole axis.");
  }
}

function readFaceNeighbors(child: VoxelCoordinate): VoxelCoordinate[] {
  const faceNeighbors: VoxelCoordinate[] = [];
  for (const [offsetX, offsetY, offsetZ] of FACE_NEIGHBOR_OFFSETS) {
    const neighbor: VoxelCoordinate = [child[0] + offsetX, child[1] + offsetY, child[2] + offsetZ];
    if (neighbor.every((axis) => axis >= 0 && axis < 3)) {
      faceNeighbors.push(neighbor);
    }
  }

  return faceNeighbors;
}

function readDestinationChild(
  child: VoxelCoordinate,
  faceColumnChannel: number,
  depth: MengerDepthTransitionStage["depth"],
  retainedChildKeys: ReadonlySet<string>,
): VoxelCoordinate {
  const destinations = readFaceNeighbors(child).filter(([x, y, z]) =>
    retainedChildKeys.has(`${x},${y},${z}`),
  );

  const destination =
    destinations[
      Math.floor(readDirectionNoise([faceColumnChannel, depth, 47], depth) * destinations.length)
    ];
  if (!destination) {
    throw new Error("Every absorbed Menger child must have a retained face neighbour.");
  }

  return destination;
}

function createMengerDepthTransitionStage(
  sourceVoxels: VoxelCoordinate[],
  depth: MengerDepthTransitionStage["depth"],
  startTimeMs: number,
  staggerGroupCount: number,
  retainSettledVoxels: boolean,
): MengerDepthTransitionStage {
  const retainedChildren = readMengerCoordinates();
  const retainedChildKeys = new Set(retainedChildren.map(([x, y, z]) => `${x},${y},${z}`));
  const settledVoxels: VoxelCoordinate[] | null = retainSettledVoxels ? [] : null;
  let settledVoxelCount = 0;
  const moves: MengerDepthTransitionMove[] = [];
  const splitTimeMs = startTimeMs + MENGER_DEPTH_TRANSITION_SPLIT_HOLD_MS;
  const stageStagger = createStaggerGroups(depth, staggerGroupCount);

  for (const parent of sourceVoxels) {
    for (let x = 0; x < 3; x += 1) {
      for (let y = 0; y < 3; y += 1) {
        for (let z = 0; z < 3; z += 1) {
          const child: VoxelCoordinate = [x, y, z];
          const coordinate = toChildCoordinate(parent, child);

          if (retainedChildKeys.has(`${x},${y},${z}`)) {
            settledVoxelCount += 1;
            if (settledVoxels) {
              settledVoxels.push(coordinate);
            }
            continue;
          }

          const middleAxisCount = child.filter((axis) => axis === 1).length;
          if (middleAxisCount === 3) {
            continue;
          }

          const holeAxis = readHoleAxis(child);
          const faceColumnChannel = readFaceColumnChannel(
            parent,
            holeAxis,
            stageStagger.faceGridSize,
          );
          const destinationChild = readDestinationChild(
            child,
            faceColumnChannel,
            depth,
            retainedChildKeys,
          );
          const staggerGroup = stageStagger.staggerGroups.get(faceColumnChannel);
          if (staggerGroup === undefined) {
            throw new Error("Every Menger transition move must resolve to a stagger group.");
          }
          moves.push({
            faceColumnChannel,
            from: coordinate,
            holeAxis,
            startTimeMs:
              splitTimeMs +
              (staggerGroup * MENGER_DEPTH_TRANSITION_MOVE_DURATION_MS) /
                stageStagger.staggerGroupCount,
            to: toChildCoordinate(parent, destinationChild),
          });
        }
      }
    }
  }

  if (settledVoxels) {
    settledVoxels.sort(compareVoxelCoordinates);
  }
  moves.sort(
    (left, right) =>
      left.startTimeMs - right.startTimeMs || compareVoxelCoordinates(left.from, right.from),
  );
  const endTimeMs = moves.reduce(
    (latestEndTimeMs, move) =>
      Math.max(latestEndTimeMs, move.startTimeMs + MENGER_DEPTH_TRANSITION_MOVE_DURATION_MS),
    splitTimeMs,
  );

  return {
    depth,
    endTimeMs,
    gridSize: 3 ** depth,
    moves,
    settledVoxelCount,
    settledVoxels,
    sourceVoxels,
    splitTimeMs,
  };
}

/**
The hover renderer can omit the final settled coordinates because its exact
surface reuses the previous stage. Transition models retain all coordinates.
*/
export function createMengerDepthTransitionModel({
  maximumDepth = 3,
  retainFinalSettledVoxels = true,
  staggerGroupCount: requestedStaggerGroupCount,
}: {
  maximumDepth?: number;
  retainFinalSettledVoxels?: boolean;
  staggerGroupCount: number;
}): MengerDepthTransitionModel {
  if (!Number.isInteger(maximumDepth) || maximumDepth < 2) {
    throw new Error("Menger transition depth must be an integer of at least 2.");
  }

  const finiteStaggerGroupCount = Number.isFinite(requestedStaggerGroupCount)
    ? requestedStaggerGroupCount
    : MENGER_DEPTH_TRANSITION_DEFAULT_STAGGER_GROUP_COUNT;
  const staggerGroupCount = Math.max(
    1,
    Math.min(MENGER_DEPTH_TRANSITION_MAX_STAGGER_GROUP_COUNT, Math.round(finiteStaggerGroupCount)),
  );
  const depthOneVoxels = readMengerCoordinates();
  const depthTwo = createMengerDepthTransitionStage(
    depthOneVoxels,
    2,
    0,
    staggerGroupCount,
    maximumDepth > 2 || retainFinalSettledVoxels,
  );
  const stages: [MengerDepthTransitionStage, ...MengerDepthTransitionStage[]] = [depthTwo];
  let previousStage = depthTwo;
  for (let depth = 3; depth <= maximumDepth; depth += 1) {
    const sourceVoxels = previousStage.settledVoxels;
    if (sourceVoxels === null) {
      throw new Error("Only the final Menger stage can omit settled voxel coordinates.");
    }
    const stage = createMengerDepthTransitionStage(
      sourceVoxels,
      depth,
      previousStage.endTimeMs + MENGER_DEPTH_TRANSITION_DEPTH_HOLD_MS,
      staggerGroupCount,
      depth < maximumDepth || retainFinalSettledVoxels,
    );
    stages.push(stage);
    previousStage = stage;
  }

  return {
    depthOneVoxels,
    stages,
    totalDurationMs: previousStage.endTimeMs,
  };
}
