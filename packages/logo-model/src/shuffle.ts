import {
  dotProduct,
  getCameraLocalVector,
  type LogoRotationAxisMode,
  type Vector3,
} from "./rotation.ts";
import { isWithinVoxelGrid, parseVoxelKey, type VoxelCoordinate, voxelKey } from "./voxel.ts";

export const LOGO_SHUFFLE_MOVE_DURATION_MS = 1800;
export const LOGO_SHUFFLE_MOVE_STAGGER_MS = 520;

const SHUFFLE_FACE_DIRECTIONS = [
  {
    normal: [1, 0, 0] as const,
    offset: [1, 0, 0] as const,
  },
  {
    normal: [-1, 0, 0] as const,
    offset: [-1, 0, 0] as const,
  },
  {
    normal: [0, 1, 0] as const,
    offset: [0, 1, 0] as const,
  },
  {
    normal: [0, -1, 0] as const,
    offset: [0, -1, 0] as const,
  },
  {
    normal: [0, 0, 1] as const,
    offset: [0, 0, 1] as const,
  },
  {
    normal: [0, 0, -1] as const,
    offset: [0, 0, -1] as const,
  },
] as const;

export type ShuffleOriginCandidate = {
  destinations: VoxelCoordinate[];
  from: VoxelCoordinate;
  fromKey: string;
};

type ShuffleOriginCandidateContext = {
  blockedKeys: Set<string>;
  elevationDegrees: number;
  filledVoxels: Set<string>;
  gridSize: number;
  lastMovedCubeKey: string | null;
  rotationAxisMode: LogoRotationAxisMode;
  rotationDegrees: number;
};

function readCenterVoxelKey(gridSize: number): string | null {
  if (gridSize % 2 === 0) {
    return null;
  }

  const centerIndex = (gridSize - 1) / 2;
  return voxelKey(centerIndex, centerIndex, centerIndex);
}

function getAdjacentFreeDestinations(
  filledVoxels: Set<string>,
  blockedKeys: Set<string>,
  from: VoxelCoordinate,
  gridSize: number,
): VoxelCoordinate[] {
  const destinations: VoxelCoordinate[] = [];

  for (const direction of SHUFFLE_FACE_DIRECTIONS) {
    const nextX = from[0] + direction.offset[0];
    const nextY = from[1] + direction.offset[1];
    const nextZ = from[2] + direction.offset[2];

    if (!isWithinVoxelGrid(gridSize, nextX, nextY, nextZ)) {
      continue;
    }

    const nextKey = voxelKey(nextX, nextY, nextZ);
    if (filledVoxels.has(nextKey) || blockedKeys.has(nextKey)) {
      continue;
    }

    destinations.push([nextX, nextY, nextZ]);
  }

  return destinations;
}

function hasVisibleExposedFace(
  filledVoxels: Set<string>,
  from: VoxelCoordinate,
  cameraLocalVector: Vector3,
  gridSize: number,
): boolean {
  for (const direction of SHUFFLE_FACE_DIRECTIONS) {
    const neighborX = from[0] + direction.offset[0];
    const neighborY = from[1] + direction.offset[1];
    const neighborZ = from[2] + direction.offset[2];
    const neighborKey = voxelKey(neighborX, neighborY, neighborZ);
    const isFaceCovered =
      isWithinVoxelGrid(gridSize, neighborX, neighborY, neighborZ) && filledVoxels.has(neighborKey);

    if (isFaceCovered) {
      continue;
    }

    if (dotProduct(direction.normal, cameraLocalVector) > 0) {
      return true;
    }
  }

  return false;
}

export function easeLogoShuffleProgress(value: number): number {
  if (value < 0.5) {
    return 4 * value * value * value;
  }

  return 1 - Math.pow(-2 * value + 2, 3) / 2;
}

export function getShuffleOriginCandidates({
  blockedKeys,
  elevationDegrees,
  filledVoxels,
  gridSize,
  lastMovedCubeKey,
  rotationAxisMode,
  rotationDegrees,
}: ShuffleOriginCandidateContext): ShuffleOriginCandidate[] {
  const cameraLocalVector = getCameraLocalVector({
    elevationDegrees,
    rotationAxisMode,
    rotationDegrees,
  });
  const candidates: ShuffleOriginCandidate[] = [];
  const centerVoxelKey = readCenterVoxelKey(gridSize);

  for (const fromKey of filledVoxels) {
    if (
      blockedKeys.has(fromKey) ||
      fromKey === lastMovedCubeKey ||
      (centerVoxelKey !== null && fromKey === centerVoxelKey)
    ) {
      continue;
    }

    const fromCoordinate = parseVoxelKey(fromKey);
    if (!fromCoordinate) {
      continue;
    }
    if (!hasVisibleExposedFace(filledVoxels, fromCoordinate, cameraLocalVector, gridSize)) {
      continue;
    }

    const destinations = getAdjacentFreeDestinations(
      filledVoxels,
      blockedKeys,
      fromCoordinate,
      gridSize,
    );
    if (destinations.length === 0) {
      continue;
    }

    candidates.push({
      destinations,
      from: fromCoordinate,
      fromKey,
    });
  }

  return candidates;
}
