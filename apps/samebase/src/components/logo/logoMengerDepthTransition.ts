import {
  MENGER_SPONGE_VOXEL_STATE,
  parseVoxelKey,
  parseVoxelState,
  type VoxelCoordinate,
} from "@/components/logo/logoVoxelState";

export const MENGER_DEPTH_TRANSITION_GRID_SIZE = 9;
export const MENGER_DEPTH_TRANSITION_MOVE_DURATION_MS = 1_800;
export const MENGER_DEPTH_TRANSITION_SPLIT_HOLD_MS = 240;
const MENGER_DEPTH_TRANSITION_CENTER_DELAY_MS = 260;

export type MengerDepthTransitionMove = {
  from: VoxelCoordinate;
  startTimeMs: number;
  to: VoxelCoordinate;
};

export type MengerDepthTransitionModel = {
  depthOneVoxels: VoxelCoordinate[];
  moves: MengerDepthTransitionMove[];
  settledVoxels: VoxelCoordinate[];
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

function toDepthTwoCoordinate(parent: VoxelCoordinate, child: VoxelCoordinate): VoxelCoordinate {
  return [parent[0] * 3 + child[0], parent[1] * 3 + child[1], parent[2] * 3 + child[2]];
}

function manhattanDistance(left: VoxelCoordinate, right: VoxelCoordinate): number {
  return Math.abs(left[0] - right[0]) + Math.abs(left[1] - right[1]) + Math.abs(left[2] - right[2]);
}

function readNearestRetainedChild(
  child: VoxelCoordinate,
  retainedChildren: readonly VoxelCoordinate[],
): VoxelCoordinate {
  const firstRetainedChild = retainedChildren[0];
  let nearestChild = firstRetainedChild;
  let nearestDistance = manhattanDistance(child, firstRetainedChild);

  for (const candidate of retainedChildren.slice(1)) {
    const candidateDistance = manhattanDistance(child, candidate);
    if (
      candidateDistance < nearestDistance ||
      (candidateDistance === nearestDistance &&
        compareVoxelCoordinates(candidate, nearestChild) < 0)
    ) {
      nearestChild = candidate;
      nearestDistance = candidateDistance;
    }
  }

  return nearestChild;
}

function createMengerDepthTransitionModel(): MengerDepthTransitionModel {
  const retainedChildren = readMengerCoordinates();
  const retainedChildKeys = new Set(retainedChildren.map(([x, y, z]) => `${x},${y},${z}`));
  const settledVoxels: VoxelCoordinate[] = [];
  const moves: MengerDepthTransitionMove[] = [];

  for (const parent of retainedChildren) {
    for (let x = 0; x < 3; x += 1) {
      for (let y = 0; y < 3; y += 1) {
        for (let z = 0; z < 3; z += 1) {
          const child: VoxelCoordinate = [x, y, z];
          const coordinate = toDepthTwoCoordinate(parent, child);

          if (retainedChildKeys.has(`${x},${y},${z}`)) {
            settledVoxels.push(coordinate);
            continue;
          }

          const middleAxisCount = child.filter((axis) => axis === 1).length;
          const nearestRetainedChild = readNearestRetainedChild(child, retainedChildren);
          moves.push({
            from: coordinate,
            startTimeMs:
              MENGER_DEPTH_TRANSITION_SPLIT_HOLD_MS +
              (middleAxisCount === 3 ? MENGER_DEPTH_TRANSITION_CENTER_DELAY_MS : 0),
            to: toDepthTwoCoordinate(parent, nearestRetainedChild),
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

  return {
    depthOneVoxels: retainedChildren,
    moves,
    settledVoxels,
    totalDurationMs:
      MENGER_DEPTH_TRANSITION_SPLIT_HOLD_MS +
      MENGER_DEPTH_TRANSITION_CENTER_DELAY_MS +
      MENGER_DEPTH_TRANSITION_MOVE_DURATION_MS,
  };
}

export const MENGER_DEPTH_TRANSITION_MODEL = createMengerDepthTransitionModel();
