import { normalizeRotationDegrees } from "./voxel.ts";

export const LOGO_AUTO_ROTATE_SPEED = {
  defaultValue: 12,
  min: 0,
  sliderMax: 60,
  step: 1,
} as const;

export function normalizeLogoAutoRotateDegreesPerSecond(value: number): number {
  if (!Number.isFinite(value)) {
    return LOGO_AUTO_ROTATE_SPEED.defaultValue;
  }

  return Math.max(value, LOGO_AUTO_ROTATE_SPEED.min);
}

export function advanceLogoAutoRotation(
  rotationDegrees: number,
  deltaSeconds: number,
  {
    degreesPerSecond = LOGO_AUTO_ROTATE_SPEED.defaultValue,
    speedMultiplier = 1,
  }: {
    degreesPerSecond?: number;
    speedMultiplier?: number;
  } = {},
) {
  return normalizeRotationDegrees(
    rotationDegrees +
      deltaSeconds * normalizeLogoAutoRotateDegreesPerSecond(degreesPerSecond) * speedMultiplier,
  );
}
