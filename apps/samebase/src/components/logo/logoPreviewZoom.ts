export const LOGO_PREVIEW_ZOOM = {
  defaultValue: 1,
  min: 0,
  max: 1,
  step: 0.01,
} as const;

export function normalizeLogoPreviewZoom(value: number): number {
  if (!Number.isFinite(value)) {
    return LOGO_PREVIEW_ZOOM.defaultValue;
  }

  return Math.min(Math.max(value, LOGO_PREVIEW_ZOOM.min), LOGO_PREVIEW_ZOOM.max);
}
