import {
  MENGER_SPONGE_VOXEL_STATE,
  parseVoxelKey,
  parseVoxelState,
  type VoxelCoordinate,
} from "@/components/logo/logoVoxelState";

export const MENGER_DEPTH_TRANSITION_GRID_SIZE = 9;
export const MENGER_DEPTH_TRANSITION_SPLIT_HOLD_MS = 240;
const MENGER_DEPTH_TRANSITION_MOVE_DURATION_BASE_MS = 1_050;
const MENGER_DEPTH_TRANSITION_MOVE_DURATION_VARIATION_MS = 1_050;
const MENGER_DEPTH_TRANSITION_MOVE_STAGGER_MS = 560;

export type MengerDepthTransitionMove = {
  arcOffset: readonly [number, number, number];
  durationMs: number;
  from: VoxelCoordinate;
  motionStyle: "dart" | "drift" | "glide";
  rotation: readonly [number, number, number];
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

function readMovementNoise(coordinate: VoxelCoordinate, channel: number): number {
  const value = Math.sin(
    coordinate[0] * 12.9898 + coordinate[1] * 78.233 + coordinate[2] * 37.719 + channel * 53.123,
  );
  const scaledValue = value * 43_758.5453;

  return scaledValue - Math.floor(scaledValue);
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
          const motionStyleNoise = readMovementNoise(coordinate, 6);
          const motionStyle =
            motionStyleNoise < 1 / 3 ? "drift" : motionStyleNoise < 2 / 3 ? "glide" : "dart";
          const dominantArcAxis = Math.floor(readMovementNoise(coordinate, 0) * 3);
          const arcDirection = readMovementNoise(coordinate, 1) < 0.5 ? -1 : 1;
          const arcNoise = readMovementNoise(coordinate, 2);
          const arcMagnitude =
            motionStyle === "drift"
              ? 0.25 + arcNoise * 0.3
              : motionStyle === "glide"
                ? 0.1 + arcNoise * 0.2
                : arcNoise * 0.08;
          const rotationMagnitude =
            motionStyle === "drift"
              ? Math.PI * 1.5
              : motionStyle === "glide"
                ? Math.PI * 0.75
                : Math.PI * 0.2;
          moves.push({
            arcOffset: [
              (readMovementNoise(coordinate, 3) - 0.5) * 0.08 +
                (dominantArcAxis === 0 ? arcDirection * arcMagnitude : 0),
              (readMovementNoise(coordinate, 4) - 0.5) * 0.08 +
                (dominantArcAxis === 1 ? arcDirection * arcMagnitude : 0),
              (readMovementNoise(coordinate, 5) - 0.5) * 0.08 +
                (dominantArcAxis === 2 ? arcDirection * arcMagnitude : 0),
            ],
            durationMs:
              MENGER_DEPTH_TRANSITION_MOVE_DURATION_BASE_MS +
              Math.round(
                readMovementNoise(coordinate, 7) *
                  MENGER_DEPTH_TRANSITION_MOVE_DURATION_VARIATION_MS,
              ),
            from: coordinate,
            motionStyle,
            rotation: [
              (readMovementNoise(coordinate, 8) - 0.5) * 2 * rotationMagnitude,
              (readMovementNoise(coordinate, 9) - 0.5) * 2 * rotationMagnitude,
              (readMovementNoise(coordinate, 10) - 0.5) * 2 * rotationMagnitude,
            ],
            startTimeMs:
              MENGER_DEPTH_TRANSITION_SPLIT_HOLD_MS +
              Math.round(
                readMovementNoise(coordinate, 11) * MENGER_DEPTH_TRANSITION_MOVE_STAGGER_MS,
              ) +
              (middleAxisCount === 3 ? Math.round(readMovementNoise(coordinate, 12) * 180) : 0),
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
  const totalDurationMs = moves.reduce(
    (latestEndTimeMs, move) => Math.max(latestEndTimeMs, move.startTimeMs + move.durationMs),
    MENGER_DEPTH_TRANSITION_SPLIT_HOLD_MS,
  );

  return {
    depthOneVoxels: retainedChildren,
    moves,
    settledVoxels,
    totalDurationMs,
  };
}

export const MENGER_DEPTH_TRANSITION_MODEL = createMengerDepthTransitionModel();
