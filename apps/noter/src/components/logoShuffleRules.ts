import {
  GRID_SIZE,
  isWithinGrid,
  type VoxelCoordinate,
  voxelKey,
} from "@/components/logoVoxelState";
import {
  getCameraLocalVector,
  type LogoRotationAxisMode,
} from "@/components/logoRotationMath";

const CENTER_INDEX = (GRID_SIZE - 1) / 2;
const CENTER_VOXEL_KEY = voxelKey(CENTER_INDEX, CENTER_INDEX, CENTER_INDEX);
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

type Vector3 = readonly [number, number, number];

export type ShuffleOriginCandidate = {
  destinations: VoxelCoordinate[];
  from: VoxelCoordinate;
  fromKey: string;
};

type ShuffleOriginCandidateContext = {
  blockedKeys: Set<string>;
  elevationDegrees: number;
  filledVoxels: Set<string>;
  lastMovedCubeKey: string | null;
  rotationAxisMode: LogoRotationAxisMode;
  rotationDegrees: number;
};

function dotProduct(left: Vector3, right: Vector3): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function voxelCoordinateFromKey(key: string): VoxelCoordinate {
  const [xText, yText, zText] = key.split(",");
  return [
    Number.parseInt(xText, 10),
    Number.parseInt(yText, 10),
    Number.parseInt(zText, 10),
  ];
}

function getAdjacentFreeDestinations(
  filledVoxels: Set<string>,
  blockedKeys: Set<string>,
  from: VoxelCoordinate,
): VoxelCoordinate[] {
  const destinations: VoxelCoordinate[] = [];

  for (const direction of SHUFFLE_FACE_DIRECTIONS) {
    const nextX = from[0] + direction.offset[0];
    const nextY = from[1] + direction.offset[1];
    const nextZ = from[2] + direction.offset[2];

    if (!isWithinGrid(nextX, nextY, nextZ)) {
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
): boolean {
  for (const direction of SHUFFLE_FACE_DIRECTIONS) {
    const neighborX = from[0] + direction.offset[0];
    const neighborY = from[1] + direction.offset[1];
    const neighborZ = from[2] + direction.offset[2];
    const neighborKey = voxelKey(neighborX, neighborY, neighborZ);
    const isFaceCovered =
      isWithinGrid(neighborX, neighborY, neighborZ) &&
      filledVoxels.has(neighborKey);

    if (isFaceCovered) {
      continue;
    }

    if (dotProduct(direction.normal, cameraLocalVector) > 0) {
      return true;
    }
  }

  return false;
}

export function getShuffleOriginCandidates({
  blockedKeys,
  elevationDegrees,
  filledVoxels,
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

  for (const fromKey of filledVoxels) {
    if (
      blockedKeys.has(fromKey) ||
      fromKey === lastMovedCubeKey ||
      fromKey === CENTER_VOXEL_KEY
    ) {
      continue;
    }

    const fromCoordinate = voxelCoordinateFromKey(fromKey);
    if (
      !hasVisibleExposedFace(filledVoxels, fromCoordinate, cameraLocalVector)
    ) {
      continue;
    }

    const destinations = getAdjacentFreeDestinations(
      filledVoxels,
      blockedKeys,
      fromCoordinate,
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
