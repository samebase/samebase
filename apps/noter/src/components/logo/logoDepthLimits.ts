import { normalizeLogoFractalDepth } from "./logoVoxelState";

export type LogoDepthRenderer = "three" | "svg" | "raster" | "iso";

type LogoDepthLimit = {
  hardMax: number;
  sliderMax: number | null;
};

const LOGO_DEPTH_LIMITS = {
  iso: {
    hardMax: 10,
    sliderMax: 10,
  },
  raster: {
    hardMax: 10,
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
