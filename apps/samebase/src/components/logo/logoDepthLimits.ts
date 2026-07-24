import { normalizeLogoFractalDepth } from "@samebase/logo-model/voxel";

export type LogoDepthRenderer = "three" | "svg" | "raster" | "iso";

type LogoDepthLimit = {
  hardMax: number;
  sliderMax: number | null;
};

export const MAX_LOGO_FRACTAL_DEPTH = 10;

const LOGO_DEPTH_LIMITS = {
  iso: {
    hardMax: MAX_LOGO_FRACTAL_DEPTH,
    sliderMax: 10,
  },
  raster: {
    hardMax: MAX_LOGO_FRACTAL_DEPTH,
    sliderMax: 10,
  },
  svg: {
    hardMax: 3,
    sliderMax: null,
  },
  three: {
    hardMax: 5,
    sliderMax: 5,
  },
} as const satisfies Record<LogoDepthRenderer, LogoDepthLimit>;

export function getLogoRendererFractalDepthHardMax(renderer: LogoDepthRenderer): number {
  return LOGO_DEPTH_LIMITS[renderer].hardMax;
}

export function getLogoRendererFractalDepthSliderMax(
  renderer: Exclude<LogoDepthRenderer, "svg">,
): number {
  return LOGO_DEPTH_LIMITS[renderer].sliderMax;
}

/**
 * Renderer caps are a recovery boundary for URL-edited depths: every logo page
 * can still boot far enough for the operator to change routes or controls.
 */
export function clampLogoFractalDepthForRenderer(
  value: number,
  renderer: LogoDepthRenderer,
): number {
  return Math.min(normalizeLogoFractalDepth(value), getLogoRendererFractalDepthHardMax(renderer));
}

/**
 * Route state is shared by renderer routes, so generic parsing uses the most
 * permissive shipped renderer cap before each renderer applies its own cap.
 */
export function normalizeLogoFractalDepthForRoute(value: number): number {
  return Math.min(normalizeLogoFractalDepth(value), MAX_LOGO_FRACTAL_DEPTH);
}
