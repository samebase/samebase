export const LOGO_DISTANCE_SCALE = {
  defaultValue: 1,
  min: 0,
  sliderMax: 2,
  step: 0.001,
};

export function normalizeLogoDistanceScale(value: number): number {
  if (!Number.isFinite(value)) {
    return LOGO_DISTANCE_SCALE.defaultValue;
  }

  return Math.max(LOGO_DISTANCE_SCALE.min, value);
}
