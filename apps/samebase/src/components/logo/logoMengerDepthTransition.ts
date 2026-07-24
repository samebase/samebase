import {
  MENGER_SPONGE_VOXEL_STATE,
  parseVoxelKey,
  parseVoxelState,
  type VoxelCoordinate,
} from "@/components/logo/logoVoxelState";

export const MENGER_DEPTH_TRANSITION_SPLIT_HOLD_MS = 240;
export const MENGER_DEPTH_TRANSITION_DEPTH_HOLD_MS = 700;
export const MENGER_DEPTH_TRANSITION_MOVE_DURATION_MS = 1_800;
export const MENGER_DEPTH_TRANSITION_DEFAULT_STAGGER_GROUP_COUNT = 3;
export const MENGER_DEPTH_TRANSITION_MAX_STAGGER_GROUP_COUNT = 27;
const FACE_NEIGHBOR_OFFSETS: readonly VoxelCoordinate[] = [
  [-1, 0, 0],
  [1, 0, 0],
  [0, -1, 0],
  [0, 1, 0],
  [0, 0, -1],
  [0, 0, 1],
];

export type MengerDepthTransitionMove = {
  from: VoxelCoordinate;
  startTimeMs: number;
  to: VoxelCoordinate;
};

export type MengerDepthTransitionStage = {
  depth: 2 | 3;
  endTimeMs: number;
  gridSize: number;
  moves: MengerDepthTransitionMove[];
  settledVoxels: VoxelCoordinate[];
  sourceVoxels: VoxelCoordinate[];
  splitTimeMs: number;
};

export type MengerDepthTransitionModel = {
  depthOneVoxels: VoxelCoordinate[];
  depthThree: MengerDepthTransitionStage;
  depthTwo: MengerDepthTransitionStage;
  totalDurationMs: number;
};

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
  staggerGroupCount: number,
): ReadonlyMap<number, number> {
  const channels = Array.from(
    { length: MENGER_DEPTH_TRANSITION_MAX_STAGGER_GROUP_COUNT },
    (_, channel) => channel,
  );
  channels.sort(
    (left, right) =>
      readDirectionNoise([left, depth, 29], depth) -
        readDirectionNoise([right, depth, 29], depth) || left - right,
  );

  return new Map(
    channels.map((channel, rank) => [
      channel,
      Math.floor((rank * staggerGroupCount) / channels.length),
    ]),
  );
}

function readFaceColumnChannel(parent: VoxelCoordinate, child: VoxelCoordinate): number {
  const holeAxis = child.findIndex((axis) => axis !== 1);
  // Ignore depth along the hole axis so an entire face-on ray shares one
  // movement pattern and one start time.
  const faceCoordinates = parent.filter((_, axisIndex) => axisIndex !== holeAxis);

  return holeAxis * 9 + (faceCoordinates[0] % 3) * 3 + (faceCoordinates[1] % 3);
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

  return destinations[
    Math.floor(readDirectionNoise([faceColumnChannel, depth, 47], depth) * destinations.length)
  ];
}

function createMengerDepthTransitionStage(
  sourceVoxels: VoxelCoordinate[],
  depth: MengerDepthTransitionStage["depth"],
  startTimeMs: number,
  staggerGroupCount: number,
): MengerDepthTransitionStage {
  const retainedChildren = readMengerCoordinates();
  const retainedChildKeys = new Set(retainedChildren.map(([x, y, z]) => `${x},${y},${z}`));
  const settledVoxels: VoxelCoordinate[] = [];
  const moves: MengerDepthTransitionMove[] = [];
  const splitTimeMs = startTimeMs + MENGER_DEPTH_TRANSITION_SPLIT_HOLD_MS;
  const staggerGroups = createStaggerGroups(depth, staggerGroupCount);

  for (const parent of sourceVoxels) {
    for (let x = 0; x < 3; x += 1) {
      for (let y = 0; y < 3; y += 1) {
        for (let z = 0; z < 3; z += 1) {
          const child: VoxelCoordinate = [x, y, z];
          const coordinate = toChildCoordinate(parent, child);

          if (retainedChildKeys.has(`${x},${y},${z}`)) {
            settledVoxels.push(coordinate);
            continue;
          }

          const middleAxisCount = child.filter((axis) => axis === 1).length;
          if (middleAxisCount === 3) {
            continue;
          }

          const faceColumnChannel = readFaceColumnChannel(parent, child);
          const destinationChild = readDestinationChild(
            child,
            faceColumnChannel,
            depth,
            retainedChildKeys,
          );
          const staggerGroup = staggerGroups.get(faceColumnChannel);
          if (staggerGroup === undefined) {
            throw new Error("Every Menger transition move must resolve to a stagger group.");
          }
          moves.push({
            from: coordinate,
            startTimeMs:
              splitTimeMs +
              (staggerGroup * MENGER_DEPTH_TRANSITION_MOVE_DURATION_MS) / staggerGroupCount,
            to: toChildCoordinate(parent, destinationChild),
          });
        }
      }
    }
  }

  settledVoxels.sort(compareVoxelCoordinates);
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
    settledVoxels,
    sourceVoxels,
    splitTimeMs,
  };
}

export function createMengerDepthTransitionModel(
  requestedStaggerGroupCount: number,
): MengerDepthTransitionModel {
  const staggerGroupCount = Math.max(
    1,
    Math.min(
      MENGER_DEPTH_TRANSITION_MAX_STAGGER_GROUP_COUNT,
      Math.round(requestedStaggerGroupCount),
    ),
  );
  const depthOneVoxels = readMengerCoordinates();
  const depthTwo = createMengerDepthTransitionStage(depthOneVoxels, 2, 0, staggerGroupCount);
  const depthThree = createMengerDepthTransitionStage(
    depthTwo.settledVoxels,
    3,
    depthTwo.endTimeMs + MENGER_DEPTH_TRANSITION_DEPTH_HOLD_MS,
    staggerGroupCount,
  );

  return {
    depthOneVoxels,
    depthThree,
    depthTwo,
    totalDurationMs: depthThree.endTimeMs,
  };
}

export const MENGER_DEPTH_TRANSITION_MODEL = createMengerDepthTransitionModel(1);
