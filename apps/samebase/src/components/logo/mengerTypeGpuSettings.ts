import { normalizeLogoFractalDepth } from "@samebase/logo-model/voxel";

export const MENGER_TYPE_GPU_DEFAULT_DEPTH = 4;
export const MENGER_TYPE_GPU_MINIMUM_DEPTH = 1;
export const MENGER_TYPE_GPU_MAXIMUM_DEPTH = 8;
export const MENGER_TYPE_GPU_DEFAULT_RESOLUTION_SCALE = 0.75;
export const MENGER_TYPE_GPU_MINIMUM_RESOLUTION_SCALE = 0.5;
export const MENGER_TYPE_GPU_MAXIMUM_RESOLUTION_SCALE = 1;
export const MENGER_TYPE_GPU_RESOLUTION_SCALE_STEP = 0.25;

export type MengerTypeGpuSettings = {
  depth: number;
  resolutionScale: number;
};

export type MengerHoverRenderer = "typegpu" | "three";

export function normalizeMengerTypeGpuDepth(value: number): number {
  return Math.min(normalizeLogoFractalDepth(value), MENGER_TYPE_GPU_MAXIMUM_DEPTH);
}

export function normalizeMengerTypeGpuResolutionScale(value: number): number {
  if (!Number.isFinite(value)) {
    return MENGER_TYPE_GPU_DEFAULT_RESOLUTION_SCALE;
  }

  return Math.min(
    Math.max(value, MENGER_TYPE_GPU_MINIMUM_RESOLUTION_SCALE),
    MENGER_TYPE_GPU_MAXIMUM_RESOLUTION_SCALE,
  );
}
