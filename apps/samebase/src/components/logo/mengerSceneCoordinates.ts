import { type VoxelCoordinate } from "@samebase/logo-model/voxel";
import * as THREE from "three";

export const MENGER_SCENE_WORLD_SIZE = 9;

export function toMengerWorldCoordinate(
  coordinate: VoxelCoordinate,
  gridSize: number,
): readonly [number, number, number] {
  const centerOffset = (gridSize - 1) / 2;
  const voxelSize = MENGER_SCENE_WORLD_SIZE / gridSize;

  return [
    (coordinate[0] - centerOffset) * voxelSize,
    (coordinate[1] - centerOffset) * voxelSize,
    (coordinate[2] - centerOffset) * voxelSize,
  ];
}

export function writeMengerVoxelMatrix(
  matrix: THREE.Matrix4,
  coordinate: VoxelCoordinate,
  gridSize: number,
): void {
  const voxelSize = MENGER_SCENE_WORLD_SIZE / gridSize;
  const [x, y, z] = toMengerWorldCoordinate(coordinate, gridSize);
  matrix.makeScale(voxelSize, voxelSize, voxelSize);
  matrix.setPosition(x, y, z);
}
