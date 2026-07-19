import { normalizeRotationDegrees } from "./voxel.ts";

export const LOGO_AUTO_ROTATE_DEGREES_PER_SECOND = 12;

export function advanceLogoAutoRotation(
  rotationDegrees: number,
  deltaSeconds: number,
  speedMultiplier = 1,
) {
  return normalizeRotationDegrees(
    rotationDegrees + deltaSeconds * LOGO_AUTO_ROTATE_DEGREES_PER_SECOND * speedMultiplier,
  );
}
