export const DEFAULT_LOGO_PREVIEW_ZOOM = 1;
export const MIN_LOGO_PREVIEW_ZOOM = 0.1;
export const MAX_LOGO_PREVIEW_ZOOM = 1;
export const LOGO_PREVIEW_ZOOM_STEP = 0.01;

export function normalizeLogoPreviewZoom(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_LOGO_PREVIEW_ZOOM;
  }

  return Math.min(Math.max(value, MIN_LOGO_PREVIEW_ZOOM), MAX_LOGO_PREVIEW_ZOOM);
}
