export type RasterSeamLabImageKind = "composed" | "mask" | "reference" | "source";

export type RasterSeamLabDepth = 1 | 2;

export type RasterSeamLabGridSize = 2 | 3;

export type RasterSeamLabMergeMode =
  | "crisp-source-over"
  | "destination-out-full"
  | "inflated-source-over"
  | "merged-faces"
  | "pixel-copy"
  | "source-atop-full"
  | "source-atop-single"
  | "source-over";

export type RasterSeamLabMergeModeOption = {
  label: string;
  value: RasterSeamLabMergeMode;
};

export type RasterSeamLabResult = {
  coveredPixels: number;
  meanSquaredError: number;
  seamPixels: number;
  stats: RasterSeamLabStats;
};

export type RasterSeamLabStats = {
  baseGridSize: RasterSeamLabGridSize;
  effectiveGridSize: number;
  mergedFaceLoops: number;
  mergedFacePoints: number;
  mergedFaceRects: number;
  occupiedCells: number;
  recursiveTileDraws: number;
};

export const RASTER_SEAM_LAB_DEPTHS = [1, 2] as const satisfies readonly RasterSeamLabDepth[];

export const RASTER_SEAM_LAB_GRID_SIZES = [
  2, 3,
] as const satisfies readonly RasterSeamLabGridSize[];

export const RASTER_SEAM_LAB_SOURCE_SIZES = [
  18, 24, 32, 48, 96, 144,
] as const satisfies readonly number[];

export const RASTER_SEAM_LAB_SAMPLE_ROTATIONS = [
  0, 13, 22, 37, 45, 61,
] as const satisfies readonly number[];

export const RASTER_SEAM_LAB_MERGE_MODES = [
  {
    label: "Plain",
    value: "source-over",
  },
  {
    label: "Crisp",
    value: "crisp-source-over",
  },
  {
    label: "Pixel copy",
    value: "pixel-copy",
  },
  {
    label: "Inflate",
    value: "inflated-source-over",
  },
  {
    label: "Atop single",
    value: "source-atop-single",
  },
  {
    label: "Atop full",
    value: "source-atop-full",
  },
  {
    label: "Cut full",
    value: "destination-out-full",
  },
  {
    label: "Merged faces",
    value: "merged-faces",
  },
] as const satisfies readonly RasterSeamLabMergeModeOption[];

export const RASTER_SEAM_LAB_DEFAULT_ELEVATION_DEGREES = 22;
export const RASTER_SEAM_LAB_DEFAULT_DEPTH: RasterSeamLabDepth = 1;
export const RASTER_SEAM_LAB_DEFAULT_GRID_SIZE: RasterSeamLabGridSize = 2;
export const RASTER_SEAM_LAB_DEFAULT_MERGE_MODE: RasterSeamLabMergeMode = "source-over";
export const RASTER_SEAM_LAB_DEFAULT_ROTATION_DEGREES = 22;
export const RASTER_SEAM_LAB_DEFAULT_SOURCE_SIZE_PX = 24;
export const RASTER_SEAM_LAB_MIN_SOURCE_SIZE_PX = 1;
export const RASTER_SEAM_LAB_SOURCE_SIZE_STEP = 1;
export const RASTER_SEAM_LAB_DEFAULT_INFLATION_SCALE = 1.01;
export const RASTER_SEAM_LAB_MIN_INFLATION_SCALE = 1;
export const RASTER_SEAM_LAB_SLIDER_MAX_INFLATION_SCALE = 1.05;
export const RASTER_SEAM_LAB_INFLATION_SCALE_STEP = 0.001;
export const RASTER_SEAM_LAB_DEFAULT_SPACING_SCALE = 1;
export const RASTER_SEAM_LAB_MIN_SPACING_SCALE = 0;
export const RASTER_SEAM_LAB_SLIDER_MAX_SPACING_SCALE = 2;
export const RASTER_SEAM_LAB_SPACING_SCALE_STEP = 0.001;

export const RASTER_SEAM_LAB_EMPTY_STATS = {
  baseGridSize: RASTER_SEAM_LAB_DEFAULT_GRID_SIZE,
  effectiveGridSize: RASTER_SEAM_LAB_DEFAULT_GRID_SIZE,
  mergedFaceLoops: 0,
  mergedFacePoints: 0,
  mergedFaceRects: 0,
  occupiedCells: 0,
  recursiveTileDraws: 0,
} satisfies RasterSeamLabStats;

export function normalizeRasterSeamLabDepth(value: number | null | undefined): RasterSeamLabDepth {
  return value === 2 ? 2 : RASTER_SEAM_LAB_DEFAULT_DEPTH;
}

export function normalizeRasterSeamLabGridSize(
  value: number | null | undefined,
): RasterSeamLabGridSize {
  return value === 3 ? 3 : RASTER_SEAM_LAB_DEFAULT_GRID_SIZE;
}

export function normalizeRasterSeamLabSourceSizePx(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return RASTER_SEAM_LAB_DEFAULT_SOURCE_SIZE_PX;
  }

  return Math.max(RASTER_SEAM_LAB_MIN_SOURCE_SIZE_PX, Math.round(value));
}

export function normalizeRasterSeamLabInflationScale(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return RASTER_SEAM_LAB_DEFAULT_INFLATION_SCALE;
  }

  return Math.max(RASTER_SEAM_LAB_MIN_INFLATION_SCALE, value);
}

export function normalizeRasterSeamLabSpacingScale(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return RASTER_SEAM_LAB_DEFAULT_SPACING_SCALE;
  }

  return Math.max(RASTER_SEAM_LAB_MIN_SPACING_SCALE, value);
}
