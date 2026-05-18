export const DEFAULT_LOGO_DISTANCE_SCALE = 1;
export const MIN_LOGO_DISTANCE_SCALE = 0;
export const LOGO_DISTANCE_SCALE_SLIDER_MAX = 2;
export const LOGO_DISTANCE_SCALE_STEP = 0.001;

export function normalizeLogoDistanceScale(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_LOGO_DISTANCE_SCALE;
  }

  return Math.max(MIN_LOGO_DISTANCE_SCALE, value);
}
