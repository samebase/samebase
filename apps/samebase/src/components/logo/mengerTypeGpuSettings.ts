import { normalizeLogoFractalDepth } from "@samebase/logo-model/voxel";

export const MENGER_TYPE_GPU_DEFAULT_DEPTH = 4;
export const MENGER_TYPE_GPU_MINIMUM_DEPTH = 1;
export const MENGER_TYPE_GPU_MAXIMUM_DEPTH = 8;
export const MENGER_TYPE_GPU_DEFAULT_RESOLUTION_SCALE = 0.75;
export const MENGER_TYPE_GPU_MINIMUM_RESOLUTION_SCALE = 0.5;
export const MENGER_TYPE_GPU_MAXIMUM_RESOLUTION_SCALE = 1;
export const MENGER_TYPE_GPU_RESOLUTION_SCALE_STEP = 0.25;
export const MENGER_TYPE_GPU_ANTIALIASING_MODES = ["off", "2x2", "4x4"] as const;
export const MENGER_TYPE_GPU_DEFAULT_ANTIALIASING = "off";

export type MengerTypeGpuAntialiasing = (typeof MENGER_TYPE_GPU_ANTIALIASING_MODES)[number];

export const MENGER_TYPE_GPU_ANTIALIASING_SETTINGS = {
  off: { gridSize: 1, label: "Off" },
  "2x2": { gridSize: 2, label: "2x2 shader supersampling" },
  "4x4": { gridSize: 4, label: "4x4 shader supersampling" },
} satisfies Record<MengerTypeGpuAntialiasing, { gridSize: number; label: string }>;

export type MengerTypeGpuSettings = {
  antialiasing: MengerTypeGpuAntialiasing;
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
