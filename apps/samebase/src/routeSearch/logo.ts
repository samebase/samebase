import { includes } from "@samebase/dependent";
import { keys } from "@samebase/dependent/object";
import { type LogoRotationAxisMode } from "@samebase/logo-model/rotation";
import {
  DEFAULT_LOGO_ISOMETRIC_STYLE_ID,
  LOGO_ISOMETRIC_CUBE_SIDE_PIXELS,
  isLogoIsometricStyleId,
  normalizeLogoIsometricCubeSidePixels,
  type LogoIsometricStyleId,
} from "@/components/logo/logoIsometricRenderer";
import {
  clampLogoFractalDepthForRenderer,
  getLogoRendererFractalDepthHardMax,
  MAX_LOGO_FRACTAL_DEPTH,
  normalizeLogoFractalDepthForRoute,
  type LogoDepthRenderer,
} from "@/components/logo/logoDepthLimits";
import { type LogoThemeColors } from "@/components/logo/logoTailwindColors";
import {
  LOGO_DISTANCE_SCALE,
  normalizeLogoDistanceScale,
} from "@/components/logo/logoDistanceScale";
import {
  DEFAULT_LOGO_SHUFFLE_PARALLEL_MOVES,
  normalizeLogoShuffleParallelMoves,
  readLogoShuffleParallelMoves,
  type LogoShuffleParallelMoves,
} from "@/components/logo/logoShuffleAnimation";
import { LOGO_PREVIEW_ZOOM, normalizeLogoPreviewZoom } from "@/components/logo/logoPreviewZoom";
import {
  DEFAULT_LOGO_LEFT_FACE_STYLE,
  LOGO_LEFT_FACE_STYLE_KINDS,
  LOGO_LEFT_FACE_STRIPE,
  LOGO_LEFT_FACE_STRIPE_BASIS_VALUES,
  areLogoLeftFaceStylesEqual,
  normalizeLogoLeftFaceStyle,
  normalizeLogoLeftFaceStripeAngleDegrees,
  normalizeLogoLeftFaceStripeGap,
  normalizeLogoLeftFaceStripeOffset,
  normalizeLogoLeftFaceStripeWidth,
  readLogoLeftFaceStyle,
  isLogoLeftFaceStripeBasis,
  isLogoLeftFaceStyleKind,
  type LogoLeftFaceStyle,
  type LogoLeftFaceStyleKind,
  type LogoLeftFaceStripeBasis,
} from "@samebase/logo-model/left-face-style";
import {
  RouteSearchSchema_appThemeColor,
  buildLogoThemeColorSearch,
  readLogoThemeColorSearch,
} from "@/lib/appThemeColorSearch";
import {
  readRootThemeModeSearch,
  RouteSearchSchema_rootThemeMode,
  type RootThemeModeSearch,
} from "@/lib/rootThemeModeSearch";
import {
  type RouteSearchParamSuggestion,
  type RouteSearchParamValueSuggestions,
} from "@/routing/permissions";
import {
  DEFAULT_ELEVATION_DEGREES,
  DEFAULT_LOGO_FRACTAL_DEPTH,
  DEFAULT_LOGO_GRID_SIZE,
  DEFAULT_ROTATION_DEGREES,
  MAX_ELEVATION_DEGREES,
  MAX_LOGO_GRID_SIZE,
  MIN_ELEVATION_DEGREES,
  MIN_LOGO_GRID_SIZE,
  MIN_LOGO_FRACTAL_DEPTH,
  createDefaultVoxelState,
  readLogoGridSize,
  normalizeLogoGridSize,
  normalizeElevationDegrees,
  normalizeRotationDegrees,
  parseVoxelState,
  serializeVoxelState,
  type LogoGridSize,
} from "@samebase/logo-model/voxel";
import { LANDING_DEV_MODE_QUERY_PARAM } from "@/lib/landingDevMode";
import { DEFAULT_LOGO_PRESET_ID, LOGO_PRESETS, getLogoPreset } from "@/components/logo/logoPresets";
import { normalizeRouteSearchPresenceFlags } from "@/routing/searchFlags";
import {
  defineRouteSearchParams,
  type InferRouteSearch,
  readRouteSearchParamAccess,
  readRouteSearchParamSuggestions,
  readRouteSearchPresenceKeys,
  readRouteSearchParamMetadata,
  routeSearchFiniteNumber,
  routeSearchNormalizedFiniteNumber,
  routeSearchPresenceParam,
  routeSearchStringValue,
  routeSearchValueParam,
  type RouteSearchParamMetadata,
  type RouteSearchParamMetadataByKey,
} from "@/routing/searchParamMetadata";
import { after, bad, good, pure } from "@samebase/sure";

const LOGO_ROTATION_AXIS_MODE_VALUES = [
  "cube-y",
  "screen-vertical",
] as const satisfies readonly LogoRotationAxisMode[];

const LOGO_ISOMETRIC_STYLE_VALUES = [
  "flat",
  "shaded-edge",
  "cap-3",
  "cap-4",
] as const satisfies readonly LogoIsometricStyleId[];

const LOGO_SHUFFLE_PARALLEL_MOVES_VALUE_SUGGESTIONS = [
  "1",
  "2",
  "3",
] as const satisfies RouteSearchParamValueSuggestions;
const [FIRST_LOGO_PRESET, ...REMAINING_LOGO_PRESETS] = LOGO_PRESETS;
const LOGO_VOXEL_STATE_VALUE_SUGGESTIONS = [
  FIRST_LOGO_PRESET.voxelState,
  ...REMAINING_LOGO_PRESETS.map((preset) => preset.voxelState),
] satisfies RouteSearchParamValueSuggestions;
const DEFAULT_LOGO_VOXEL_STATE_VALUE_SUGGESTION = getLogoPreset(DEFAULT_LOGO_PRESET_ID).voxelState;
const logoFunRouteSearchSuggestion = {
  group: "fun",
  suggestion: "route",
} as const;
export const MIN_LOGO_OPACITY = 0;
export const MAX_LOGO_OPACITY = 1;
export const LOGO_OPACITY_STEP = 0.01;
export const DEFAULT_LOGO_OPACITY = 1;

export function normalizeLogoOpacity(value: number): number {
  return Math.min(Math.max(value, MIN_LOGO_OPACITY), MAX_LOGO_OPACITY);
}

function readOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : undefined;
}

function readCanonicalVoxelState(value: unknown): string | undefined {
  const voxelState = readOptionalString(value);
  if (typeof voxelState !== "string") {
    return undefined;
  }

  const parsedVoxelState = parseVoxelState(voxelState);
  return parsedVoxelState === null
    ? undefined
    : serializeVoxelState(parsedVoxelState.filledVoxels, parsedVoxelState.gridSize);
}

const logoGridSizeSearchValue = after(routeSearchFiniteNumber, (numericValue) => {
  const gridSize = readLogoGridSize(numericValue);
  return typeof gridSize === "number" ? good(gridSize) : bad("unsupported-grid-size");
});

const logoShuffleParallelMovesSearchValue = after(routeSearchFiniteNumber, (numericValue) => {
  const parallelMoves = readLogoShuffleParallelMoves(numericValue);
  return parallelMoves === null ? bad("unsupported-shuffle-parallel-moves") : good(parallelMoves);
});

const logoIsometricStyleSearchValue = pure((value) => {
  const isoStyleId = readOptionalString(value);
  return typeof isoStyleId === "string" && isLogoIsometricStyleId(isoStyleId)
    ? good(isoStyleId)
    : bad("unsupported-iso-style");
});

const logoLeftFaceStyleSearchValue = pure((value) => {
  const leftFaceStyleKind = readOptionalString(value);
  return isLogoLeftFaceStyleKind(leftFaceStyleKind)
    ? good(leftFaceStyleKind)
    : bad("unsupported-left-face");
});

const logoLeftFaceStripeBasisSearchValue = pure((value) => {
  const leftFaceStripeBasis = readOptionalString(value);
  return isLogoLeftFaceStripeBasis(leftFaceStripeBasis)
    ? good(leftFaceStripeBasis)
    : bad("unsupported-stripe-basis");
});

const canonicalVoxelStateSearchValue = pure((value) => {
  const voxelState = readCanonicalVoxelState(value);
  return typeof voxelState === "string" ? good(voxelState) : bad("invalid-voxel-state");
});

const RouteSearchSchema_logo = defineRouteSearchParams({
  "animate-colors": routeSearchPresenceParam({
    access: "access_public",
    ...logoFunRouteSearchSuggestion,
  }),
  "animate-stripes": routeSearchPresenceParam({
    access: "access_public",
    ...logoFunRouteSearchSuggestion,
  }),
  "auto-rotate": routeSearchPresenceParam({
    access: "access_public",
    ...logoFunRouteSearchSuggestion,
  }),
  "auto-shuffle": routeSearchPresenceParam({
    access: "access_public",
    ...logoFunRouteSearchSuggestion,
  }),
  axis: routeSearchValueParam(routeSearchStringValue(LOGO_ROTATION_AXIS_MODE_VALUES), {
    access: "access_public",
    sampleValue: "screen-vertical",
    ...logoFunRouteSearchSuggestion,
    valueSuggestions: LOGO_ROTATION_AXIS_MODE_VALUES,
    valueType: "options",
  }),
  background: RouteSearchSchema_appThemeColor.shape.background,
  border: RouteSearchSchema_appThemeColor.shape.border,
  dark: RouteSearchSchema_rootThemeMode.shape.dark,
  [LANDING_DEV_MODE_QUERY_PARAM]: routeSearchPresenceParam({
    access: "access_public",
    suggestion: "hidden",
  }),
  depth: routeSearchValueParam(
    routeSearchNormalizedFiniteNumber(normalizeLogoFractalDepthForRoute),
    {
      numericDefaultValue: DEFAULT_LOGO_FRACTAL_DEPTH,
      numericRange: {
        maxValue: MAX_LOGO_FRACTAL_DEPTH,
        minValue: MIN_LOGO_FRACTAL_DEPTH,
        rangeType: "closed",
      },
      numericStepValue: 1,
      access: "access_public",
      sampleValue: `${DEFAULT_LOGO_FRACTAL_DEPTH + 1}`,
      ...logoFunRouteSearchSuggestion,
      valueSuggestions: null,
      valueType: "numeric",
    },
  ),
  dist: routeSearchValueParam(routeSearchNormalizedFiniteNumber(normalizeLogoDistanceScale), {
    numericDefaultValue: LOGO_DISTANCE_SCALE.defaultValue,
    numericRange: {
      minValue: LOGO_DISTANCE_SCALE.min,
      rangeType: "min",
    },
    numericStepValue: 1,
    access: "access_public",
    sampleValue: `${LOGO_DISTANCE_SCALE.defaultValue + 1}`,
    ...logoFunRouteSearchSuggestion,
    valueSuggestions: ["1", "1.2", "1.4", "1.6", "1.8", "2"],
    valueType: "numeric",
  }),
  elev: routeSearchValueParam(routeSearchNormalizedFiniteNumber(normalizeElevationDegrees), {
    numericDefaultValue: DEFAULT_ELEVATION_DEGREES,
    numericRange: {
      maxValue: MAX_ELEVATION_DEGREES,
      minValue: MIN_ELEVATION_DEGREES,
      rangeType: "wrap",
    },
    numericStepValue: 1,
    access: "access_public",
    sampleValue: `${DEFAULT_ELEVATION_DEGREES + 1}`,
    ...logoFunRouteSearchSuggestion,
    valueSuggestions: null,
    valueType: "numeric",
  }),
  freeView: routeSearchPresenceParam({
    access: "access_public",
    ...logoFunRouteSearchSuggestion,
  }),
  gridSize: routeSearchValueParam(logoGridSizeSearchValue, {
    numericDefaultValue: DEFAULT_LOGO_GRID_SIZE,
    numericRange: {
      maxValue: MAX_LOGO_GRID_SIZE,
      minValue: MIN_LOGO_GRID_SIZE,
      rangeType: "closed",
    },
    numericStepValue: 1,
    access: "access_public",
    sampleValue: `${MIN_LOGO_GRID_SIZE}`,
    ...logoFunRouteSearchSuggestion,
    valueSuggestions: null,
    valueType: "numeric",
  }),
  leftFace: routeSearchValueParam(logoLeftFaceStyleSearchValue, {
    access: "access_public",
    sampleValue: "secondary",
    ...logoFunRouteSearchSuggestion,
    valueSuggestions: LOGO_LEFT_FACE_STYLE_KINDS,
    valueType: "options",
  }),
  light: RouteSearchSchema_rootThemeMode.shape.light,
  opacity: routeSearchValueParam(routeSearchNormalizedFiniteNumber(normalizeLogoOpacity), {
    numericDefaultValue: DEFAULT_LOGO_OPACITY,
    numericRange: {
      maxValue: MAX_LOGO_OPACITY,
      minValue: MIN_LOGO_OPACITY,
      rangeType: "closed",
    },
    numericStepValue: LOGO_OPACITY_STEP,
    access: "access_public",
    sampleValue: "0.5",
    ...logoFunRouteSearchSuggestion,
    valueSuggestions: ["0", "0.25", "0.5", "0.75", "1"],
    valueType: "numeric",
  }),
  primary: RouteSearchSchema_appThemeColor.shape.primary,
  rot: routeSearchValueParam(routeSearchNormalizedFiniteNumber(normalizeRotationDegrees), {
    numericDefaultValue: DEFAULT_ROTATION_DEGREES,
    numericRange: {
      maxValue: 360,
      minValue: 0,
      rangeType: "wrap",
    },
    numericStepValue: 1,
    access: "access_public",
    sampleValue: `${DEFAULT_ROTATION_DEGREES + 1}`,
    ...logoFunRouteSearchSuggestion,
    valueSuggestions: null,
    valueType: "numeric",
  }),
  secondary: RouteSearchSchema_appThemeColor.shape.secondary,
  shuffleMoves: routeSearchValueParam(logoShuffleParallelMovesSearchValue, {
    numericDefaultValue: DEFAULT_LOGO_SHUFFLE_PARALLEL_MOVES,
    access: "access_public",
    sampleValue: "2",
    ...logoFunRouteSearchSuggestion,
    valueSuggestions: LOGO_SHUFFLE_PARALLEL_MOVES_VALUE_SUGGESTIONS,
    valueType: "numeric-options",
  }),
  stripeA: routeSearchValueParam(
    routeSearchNormalizedFiniteNumber(normalizeLogoLeftFaceStripeAngleDegrees),
    {
      numericDefaultValue: LOGO_LEFT_FACE_STRIPE.angleDegrees.defaultValue,
      numericRange: {
        maxValue: LOGO_LEFT_FACE_STRIPE.angleDegrees.max,
        minValue: LOGO_LEFT_FACE_STRIPE.angleDegrees.min,
        rangeType: "closed",
      },
      numericStepValue: LOGO_LEFT_FACE_STRIPE.angleDegrees.step,
      access: "access_public",
      sampleValue: `${normalizeLogoLeftFaceStripeAngleDegrees(
        LOGO_LEFT_FACE_STRIPE.angleDegrees.defaultValue + 1,
      )}`,
      ...logoFunRouteSearchSuggestion,
      valueSuggestions: null,
      valueType: "numeric",
    },
  ),
  stripeBasis: routeSearchValueParam(logoLeftFaceStripeBasisSearchValue, {
    access: "access_public",
    sampleValue: "horizontal",
    ...logoFunRouteSearchSuggestion,
    valueSuggestions: LOGO_LEFT_FACE_STRIPE_BASIS_VALUES,
    valueType: "options",
  }),
  stripeG: routeSearchValueParam(
    routeSearchNormalizedFiniteNumber(normalizeLogoLeftFaceStripeGap),
    {
      numericDefaultValue: LOGO_LEFT_FACE_STRIPE.gap.defaultValue,
      numericRange: {
        maxValue: LOGO_LEFT_FACE_STRIPE.gap.max,
        minValue: LOGO_LEFT_FACE_STRIPE.gap.min,
        rangeType: "closed",
      },
      numericStepValue: LOGO_LEFT_FACE_STRIPE.gap.step,
      access: "access_public",
      sampleValue: `${normalizeLogoLeftFaceStripeGap(LOGO_LEFT_FACE_STRIPE.gap.defaultValue + 1)}`,
      ...logoFunRouteSearchSuggestion,
      valueSuggestions: null,
      valueType: "numeric",
    },
  ),
  stripeLink: routeSearchPresenceParam({
    access: "access_public",
    ...logoFunRouteSearchSuggestion,
  }),
  stripeO: routeSearchValueParam(
    routeSearchNormalizedFiniteNumber(normalizeLogoLeftFaceStripeOffset),
    {
      numericDefaultValue: LOGO_LEFT_FACE_STRIPE.offset.defaultValue,
      numericRange: {
        maxValue: LOGO_LEFT_FACE_STRIPE.offset.max,
        minValue: LOGO_LEFT_FACE_STRIPE.offset.min,
        rangeType: "closed",
      },
      numericStepValue: LOGO_LEFT_FACE_STRIPE.offset.step,
      access: "access_public",
      sampleValue: `${normalizeLogoLeftFaceStripeOffset(LOGO_LEFT_FACE_STRIPE.offset.defaultValue + 1)}`,
      ...logoFunRouteSearchSuggestion,
      valueSuggestions: null,
      valueType: "numeric",
    },
  ),
  stripeW: routeSearchValueParam(
    routeSearchNormalizedFiniteNumber(normalizeLogoLeftFaceStripeWidth),
    {
      numericDefaultValue: LOGO_LEFT_FACE_STRIPE.width.defaultValue,
      numericRange: {
        maxValue: LOGO_LEFT_FACE_STRIPE.width.max,
        minValue: LOGO_LEFT_FACE_STRIPE.width.min,
        rangeType: "closed",
      },
      numericStepValue: LOGO_LEFT_FACE_STRIPE.width.step,
      access: "access_public",
      sampleValue: `${normalizeLogoLeftFaceStripeWidth(LOGO_LEFT_FACE_STRIPE.width.defaultValue + 1)}`,
      ...logoFunRouteSearchSuggestion,
      valueSuggestions: null,
      valueType: "numeric",
    },
  ),
  top: RouteSearchSchema_appThemeColor.shape.top,
  vox: routeSearchValueParam(canonicalVoxelStateSearchValue, {
    access: "access_public",
    sampleValue: DEFAULT_LOGO_VOXEL_STATE_VALUE_SUGGESTION,
    ...logoFunRouteSearchSuggestion,
    valueSuggestions: LOGO_VOXEL_STATE_VALUE_SUGGESTIONS,
    valueType: "options",
  }),
  zoom: routeSearchValueParam(routeSearchNormalizedFiniteNumber(normalizeLogoPreviewZoom), {
    numericDefaultValue: LOGO_PREVIEW_ZOOM.defaultValue,
    numericRange: {
      maxValue: LOGO_PREVIEW_ZOOM.max,
      minValue: LOGO_PREVIEW_ZOOM.min,
      rangeType: "closed",
    },
    numericStepValue: LOGO_PREVIEW_ZOOM.step,
    access: "access_public",
    sampleValue: "0.5",
    ...logoFunRouteSearchSuggestion,
    valueSuggestions: ["0.1", "0.2", "0.3", "0.4", "0.5", "0.6", "0.7", "0.8", "0.9", "1"],
    valueType: "numeric",
  }),
});

/**
The isometric renderer params are owned by the /logo/iso route alone; every
other logo route (and root retention) accepts only the shared schema keys.
*/
const RouteSearchSchema_logoIso = defineRouteSearchParams({
  ...RouteSearchSchema_logo.shape,
  isoSide: routeSearchValueParam(
    routeSearchNormalizedFiniteNumber(normalizeLogoIsometricCubeSidePixels),
    {
      numericDefaultValue: LOGO_ISOMETRIC_CUBE_SIDE_PIXELS.defaultValue,
      numericRange: {
        maxValue: LOGO_ISOMETRIC_CUBE_SIDE_PIXELS.max,
        minValue: LOGO_ISOMETRIC_CUBE_SIDE_PIXELS.min,
        rangeType: "closed",
      },
      numericStepValue: LOGO_ISOMETRIC_CUBE_SIDE_PIXELS.step,
      access: "access_public",
      sampleValue: `${normalizeLogoIsometricCubeSidePixels(
        LOGO_ISOMETRIC_CUBE_SIDE_PIXELS.defaultValue + LOGO_ISOMETRIC_CUBE_SIDE_PIXELS.step,
      )}`,
      ...logoFunRouteSearchSuggestion,
      valueSuggestions: null,
      valueType: "numeric",
    },
  ),
  isoStyle: routeSearchValueParam(logoIsometricStyleSearchValue, {
    access: "access_public",
    sampleValue: "shaded-edge",
    ...logoFunRouteSearchSuggestion,
    valueSuggestions: LOGO_ISOMETRIC_STYLE_VALUES,
    valueType: "options",
  }),
});

type LogoRouteSearchFields = InferRouteSearch<typeof RouteSearchSchema_logo>;

type LogoIsoRouteSearchFields = InferRouteSearch<typeof RouteSearchSchema_logoIso>;

function readLogoRouteSearchFields(search: LogoRouteSearchFields) {
  const themeModeSearch = readRootThemeModeSearch(search);
  const parsedVoxelState = parseVoxelState(search.vox ?? null);
  const gridSize =
    typeof search.gridSize === "number"
      ? normalizeLogoGridSize(search.gridSize)
      : (parsedVoxelState?.gridSize ?? DEFAULT_LOGO_GRID_SIZE);
  const voxelState =
    parsedVoxelState && parsedVoxelState.gridSize === gridSize
      ? serializeVoxelState(parsedVoxelState.filledVoxels, gridSize)
      : undefined;
  return {
    ...(search["animate-colors"] ? { "animate-colors": true as const } : {}),
    ...(search["animate-stripes"] ? { "animate-stripes": true as const } : {}),
    ...(search["auto-rotate"] ? { "auto-rotate": true as const } : {}),
    ...(search["auto-shuffle"] ? { "auto-shuffle": true as const } : {}),
    ...(themeModeSearch.dark ? { dark: true as const } : {}),
    ...(themeModeSearch.light ? { light: true as const } : {}),
    ...readLogoThemeColorSearch(search),
    ...(typeof search.axis === "string" ? { axis: search.axis } : {}),
    ...(search.dev ? { dev: true as const } : {}),
    ...(typeof search.depth === "number" ? { depth: search.depth } : {}),
    ...(typeof search.dist === "number" ? { dist: search.dist } : {}),
    ...(typeof search.elev === "number" ? { elev: search.elev } : {}),
    ...(search.freeView ? { freeView: true } : {}),
    ...(gridSize !== DEFAULT_LOGO_GRID_SIZE ? { gridSize } : {}),
    ...readLogoLeftFaceStyleSearch(readLogoLeftFaceStyle(search)),
    ...(typeof search.opacity === "number" ? { opacity: search.opacity } : {}),
    ...(typeof search.rot === "number" ? { rot: search.rot } : {}),
    ...(typeof search.shuffleMoves === "number" ? { shuffleMoves: search.shuffleMoves } : {}),
    ...(typeof voxelState === "string" ? { vox: voxelState } : {}),
    ...(typeof search.zoom === "number" ? { zoom: search.zoom } : {}),
  };
}

function readLogoIsoRouteSearchFields(search: LogoIsoRouteSearchFields) {
  return {
    ...readLogoRouteSearchFields(search),
    ...(typeof search.isoSide === "number" ? { isoSide: search.isoSide } : {}),
    ...(typeof search.isoStyle === "string" ? { isoStyle: search.isoStyle } : {}),
  };
}

export type LogoRouteSearch = ReturnType<typeof readLogoRouteSearchFields>;

export type LogoIsoRouteSearch = ReturnType<typeof readLogoIsoRouteSearchFields>;

export type LogoRouteSearchBuildState = {
  autoRotateEnabled: boolean;
  autoShuffleEnabled: boolean;
  distanceScale: number;
  elevationDegrees: number;
  faceColorAnimationEnabled: boolean;
  fractalDepth: number;
  gridSize: LogoGridSize;
  isoCubeSidePixels: number;
  isoStyleId: LogoIsometricStyleId;
  leftFaceStripeAnimationEnabled: boolean;
  leftFaceStyle: LogoLeftFaceStyle;
  logoOpacity: number;
  rotationAxisMode: LogoRotationAxisMode;
  rotationDegrees: number;
  shuffleParallelMoves: LogoShuffleParallelMoves;
  themeColors: LogoThemeColors;
  viewSnapEnabled: boolean;
  voxelState: string;
  zoom: number;
};

type LogoLeftFaceStyleSearch = {
  leftFace?: LogoLeftFaceStyleKind;
  stripeA?: number;
  stripeBasis?: LogoLeftFaceStripeBasis;
  stripeG?: number;
  stripeLink?: true;
  stripeO?: number;
  stripeW?: number;
};

export const LOGO_ROUTE_SEARCH_PARAM_METADATA = readRouteSearchParamMetadata(
  RouteSearchSchema_logo,
) satisfies RouteSearchParamMetadataByKey<LogoRouteSearch>;

export const LOGO_ROUTE_SEARCH_KEYS = keys(LOGO_ROUTE_SEARCH_PARAM_METADATA);

export const LOGO_ROUTE_SEARCH_PARAM_ACCESS = readRouteSearchParamAccess(
  LOGO_ROUTE_SEARCH_PARAM_METADATA,
);

const PUBLIC_LANDING_LOGO_STATIC_FALLBACK_SAFE_SEARCH_KEYS = [
  "zoom",
] as const satisfies readonly (typeof LOGO_ROUTE_SEARCH_KEYS)[number][];

/**
These keys can make the requested public landing logo differ from the static
SSG fallback before React has read the route search. The prehydration head
script and PublicLandingLogo both use this list: first to hide the SSG fallback
before paint, then to keep the SVG hidden until the interactive scene is ready
or rendering fails.
*/
export const PUBLIC_LANDING_LOGO_STATIC_FALLBACK_UNSAFE_SEARCH_KEYS = LOGO_ROUTE_SEARCH_KEYS.filter(
  (key) => !includes(PUBLIC_LANDING_LOGO_STATIC_FALLBACK_SAFE_SEARCH_KEYS, key),
);

export function hasPublicLandingLogoStaticFallbackUnsafeSearch(search: LogoRouteSearch): boolean {
  for (const key of PUBLIC_LANDING_LOGO_STATIC_FALLBACK_UNSAFE_SEARCH_KEYS) {
    if (typeof search[key] !== "undefined") return true;
  }

  return false;
}

const LOGO_ISO_ROUTE_SEARCH_PARAM_METADATA = readRouteSearchParamMetadata(
  RouteSearchSchema_logoIso,
) satisfies RouteSearchParamMetadataByKey<LogoIsoRouteSearch>;

export const LOGO_ISO_ROUTE_SEARCH_KEYS = keys(LOGO_ISO_ROUTE_SEARCH_PARAM_METADATA);

export const LOGO_ISO_ROUTE_SEARCH_PARAM_ACCESS = readRouteSearchParamAccess(
  LOGO_ISO_ROUTE_SEARCH_PARAM_METADATA,
);

const LOGO_ROUTE_PRESENCE_SEARCH_KEYS = readRouteSearchPresenceKeys(
  LOGO_ROUTE_SEARCH_PARAM_METADATA,
);

function readLogoDepthValueSuggestions(depthMax: number): RouteSearchParamValueSuggestions {
  if (depthMax <= 3) {
    return ["1", "2", "3"];
  }

  if (depthMax <= 5) {
    return ["1", "2", "3", "4", "5"];
  }

  return ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];
}

function readLogoRouteSearchParamSuggestionsWithDepthMax(
  metadata: Readonly<Record<string, RouteSearchParamMetadata>>,
  depthMax: number,
): readonly RouteSearchParamSuggestion[] {
  const depthNumericRange = {
    maxValue: depthMax,
    minValue: MIN_LOGO_FRACTAL_DEPTH,
    rangeType: "closed" as const,
  };

  return readRouteSearchParamSuggestions(metadata, "route").map((suggestion) => {
    if (
      suggestion.key !== "depth" ||
      suggestion.searchParamKind !== "value" ||
      suggestion.valueType !== "numeric"
    ) {
      return suggestion;
    }

    return {
      ...suggestion,
      numericRange: depthNumericRange,
      sampleValue: `${Math.min(DEFAULT_LOGO_FRACTAL_DEPTH + 1, depthMax)}`,
      valueSuggestions: readLogoDepthValueSuggestions(depthMax),
    };
  });
}

export const LOGO_ROUTE_SEARCH_PARAM_SUGGESTIONS = readLogoRouteSearchParamSuggestionsWithDepthMax(
  LOGO_ROUTE_SEARCH_PARAM_METADATA,
  MAX_LOGO_FRACTAL_DEPTH,
);

export function readLogoRouteSearchParamSuggestionsForRenderer(
  renderer: LogoDepthRenderer,
): readonly RouteSearchParamSuggestion[] {
  return readLogoRouteSearchParamSuggestionsWithDepthMax(
    renderer === "iso" ? LOGO_ISO_ROUTE_SEARCH_PARAM_METADATA : LOGO_ROUTE_SEARCH_PARAM_METADATA,
    getLogoRendererFractalDepthHardMax(renderer),
  );
}

export function validateLogoRouteSearch(search: Record<string, unknown>): LogoRouteSearch {
  const presenceNormalizedSearch = normalizeRouteSearchPresenceFlags(
    search,
    LOGO_ROUTE_PRESENCE_SEARCH_KEYS,
  );

  return readLogoRouteSearchFields(RouteSearchSchema_logo.parse(presenceNormalizedSearch));
}

/**
The /logo/iso route validator: parses the iso schema and bakes in the iso
renderer's depth recovery cap, mirroring validateLogoRouteSearchForRenderer.
*/
export function validateLogoIsoRouteSearch(search: Record<string, unknown>): LogoIsoRouteSearch {
  const presenceNormalizedSearch = normalizeRouteSearchPresenceFlags(
    search,
    LOGO_ROUTE_PRESENCE_SEARCH_KEYS,
  );
  const parsedSearch = readLogoIsoRouteSearchFields(
    RouteSearchSchema_logoIso.parse(presenceNormalizedSearch),
  );
  if (typeof parsedSearch.depth !== "number") {
    return parsedSearch;
  }

  const depth = clampLogoFractalDepthForRenderer(parsedSearch.depth, "iso");
  if (depth === parsedSearch.depth) {
    return parsedSearch;
  }

  return {
    ...parsedSearch,
    depth,
  };
}

/**
 * Enforces the destination renderer's recovery cap on parsed route state.
 * Only `depth` changes; already-safe searches keep object identity.
 */
export function clampLogoRouteSearchForRenderer(
  search: LogoRouteSearch,
  renderer: LogoDepthRenderer,
): LogoRouteSearch {
  if (typeof search.depth !== "number") {
    return search;
  }

  const depth = clampLogoFractalDepthForRenderer(search.depth, renderer);
  if (depth === search.depth) {
    return search;
  }

  return {
    ...search,
    depth,
  };
}

/**
 * Route validators use the shared logo parser first, then clamp depth for the
 * page renderer so URL-edited depth never exceeds that renderer's hard cap.
 */
export function validateLogoRouteSearchForRenderer(
  renderer: LogoDepthRenderer,
): (search: Record<string, unknown>) => LogoRouteSearch {
  return (search) => clampLogoRouteSearchForRenderer(validateLogoRouteSearch(search), renderer);
}

export function buildLogoRouteSearch(
  args: LogoRouteSearchBuildState & {
    themeModeSearch?: RootThemeModeSearch;
  },
): LogoRouteSearch {
  const fractalDepth = normalizeLogoFractalDepthForRoute(args.fractalDepth);
  const gridSize = normalizeLogoGridSize(args.gridSize);
  const defaultVoxelState = createDefaultVoxelState(gridSize);
  const parsedVoxelState = parseVoxelState(args.voxelState);
  const voxelState =
    parsedVoxelState && parsedVoxelState.gridSize === gridSize
      ? serializeVoxelState(parsedVoxelState.filledVoxels, gridSize)
      : defaultVoxelState;
  const distanceScale = normalizeLogoDistanceScale(args.distanceScale);
  const leftFaceStyle = normalizeLogoLeftFaceStyle(args.leftFaceStyle);
  const logoOpacity = normalizeLogoOpacity(args.logoOpacity);
  const shuffleParallelMoves = normalizeLogoShuffleParallelMoves(args.shuffleParallelMoves);
  const zoom = normalizeLogoPreviewZoom(args.zoom);

  return {
    ...readRootThemeModeSearch(args.themeModeSearch ?? {}),
    ...buildLogoThemeColorSearch(args.themeColors),
    // Default-valued logo controls use own undefined tombstones so retained
    // root search cannot revive stale logo params after the serializer omits them.
    "animate-colors": args.faceColorAnimationEnabled ? true : undefined,
    "animate-stripes": args.leftFaceStripeAnimationEnabled ? true : undefined,
    "auto-rotate": args.autoRotateEnabled ? true : undefined,
    "auto-shuffle": args.autoShuffleEnabled ? true : undefined,
    axis: args.rotationAxisMode !== "cube-y" ? args.rotationAxisMode : undefined,
    elev:
      args.elevationDegrees !== DEFAULT_ELEVATION_DEGREES
        ? Number(args.elevationDegrees.toFixed(1))
        : undefined,
    depth: fractalDepth !== DEFAULT_LOGO_FRACTAL_DEPTH ? fractalDepth : undefined,
    dist:
      distanceScale !== LOGO_DISTANCE_SCALE.defaultValue
        ? Number(distanceScale.toFixed(3))
        : undefined,
    freeView: args.viewSnapEnabled ? undefined : true,
    gridSize: gridSize !== DEFAULT_LOGO_GRID_SIZE ? gridSize : undefined,
    ...buildLogoLeftFaceStyleSearch(leftFaceStyle),
    opacity: logoOpacity !== DEFAULT_LOGO_OPACITY ? Number(logoOpacity.toFixed(2)) : undefined,
    rot:
      args.rotationDegrees !== DEFAULT_ROTATION_DEGREES
        ? Number(args.rotationDegrees.toFixed(1))
        : undefined,
    shuffleMoves:
      shuffleParallelMoves !== DEFAULT_LOGO_SHUFFLE_PARALLEL_MOVES
        ? shuffleParallelMoves
        : undefined,
    vox: voxelState !== defaultVoxelState ? voxelState : undefined,
    zoom: zoom !== LOGO_PREVIEW_ZOOM.defaultValue ? Number(zoom.toFixed(2)) : undefined,
  };
}

export function buildLogoIsoRouteSearch(
  args: LogoRouteSearchBuildState & {
    themeModeSearch?: RootThemeModeSearch;
  },
): LogoIsoRouteSearch {
  return {
    ...buildLogoRouteSearch(args),
    // Default-valued iso controls use own undefined tombstones like the shared
    // build, so /logo/iso search replaces cannot revive stale iso params.
    isoSide:
      args.isoCubeSidePixels !== LOGO_ISOMETRIC_CUBE_SIDE_PIXELS.defaultValue
        ? args.isoCubeSidePixels
        : undefined,
    isoStyle: args.isoStyleId !== DEFAULT_LOGO_ISOMETRIC_STYLE_ID ? args.isoStyleId : undefined,
  };
}

/**
 * Route parsing canonicalizes visible params only; explicit logo updates use
 * buildLogoLeftFaceStyleSearch for left-face tombstones.
 */
function readLogoLeftFaceStyleSearch(leftFaceStyle: LogoLeftFaceStyle): LogoLeftFaceStyleSearch {
  if (areLogoLeftFaceStylesEqual(leftFaceStyle, DEFAULT_LOGO_LEFT_FACE_STYLE)) {
    return {};
  }

  if (leftFaceStyle.kind === "secondary") {
    return {
      leftFace: "secondary",
    };
  }

  return {
    leftFace: "striped",
    ...(leftFaceStyle.stripeAngleDegrees !== LOGO_LEFT_FACE_STRIPE.angleDegrees.defaultValue
      ? { stripeA: Number(leftFaceStyle.stripeAngleDegrees.toFixed(3)) }
      : {}),
    ...(leftFaceStyle.stripeBasis !== LOGO_LEFT_FACE_STRIPE.basis.defaultValue
      ? { stripeBasis: leftFaceStyle.stripeBasis }
      : {}),
    ...(leftFaceStyle.stripeGap !== LOGO_LEFT_FACE_STRIPE.gap.defaultValue
      ? { stripeG: Number(leftFaceStyle.stripeGap.toFixed(2)) }
      : {}),
    ...(leftFaceStyle.stripeGapLinked ? { stripeLink: true as const } : {}),
    ...(leftFaceStyle.stripeOffset !== LOGO_LEFT_FACE_STRIPE.offset.defaultValue
      ? { stripeO: Number(leftFaceStyle.stripeOffset.toFixed(2)) }
      : {}),
    ...(leftFaceStyle.stripeWidth !== LOGO_LEFT_FACE_STRIPE.width.defaultValue
      ? { stripeW: Number(leftFaceStyle.stripeWidth.toFixed(2)) }
      : {}),
  };
}

function buildLogoLeftFaceStyleSearch(leftFaceStyle: LogoLeftFaceStyle): LogoLeftFaceStyleSearch {
  if (areLogoLeftFaceStylesEqual(leftFaceStyle, DEFAULT_LOGO_LEFT_FACE_STYLE)) {
    return {
      leftFace: undefined,
      stripeA: undefined,
      stripeBasis: undefined,
      stripeG: undefined,
      stripeLink: undefined,
      stripeO: undefined,
      stripeW: undefined,
    };
  }

  if (leftFaceStyle.kind === "secondary") {
    return {
      leftFace: "secondary",
      stripeA: undefined,
      stripeBasis: undefined,
      stripeG: undefined,
      stripeLink: undefined,
      stripeO: undefined,
      stripeW: undefined,
    };
  }

  return {
    leftFace: "striped",
    stripeA:
      leftFaceStyle.stripeAngleDegrees !== LOGO_LEFT_FACE_STRIPE.angleDegrees.defaultValue
        ? Number(leftFaceStyle.stripeAngleDegrees.toFixed(3))
        : undefined,
    stripeBasis:
      leftFaceStyle.stripeBasis !== LOGO_LEFT_FACE_STRIPE.basis.defaultValue
        ? leftFaceStyle.stripeBasis
        : undefined,
    stripeG:
      leftFaceStyle.stripeGap !== LOGO_LEFT_FACE_STRIPE.gap.defaultValue
        ? Number(leftFaceStyle.stripeGap.toFixed(2))
        : undefined,
    stripeLink: leftFaceStyle.stripeGapLinked ? true : undefined,
    stripeO:
      leftFaceStyle.stripeOffset !== LOGO_LEFT_FACE_STRIPE.offset.defaultValue
        ? Number(leftFaceStyle.stripeOffset.toFixed(2))
        : undefined,
    stripeW:
      leftFaceStyle.stripeWidth !== LOGO_LEFT_FACE_STRIPE.width.defaultValue
        ? Number(leftFaceStyle.stripeWidth.toFixed(2))
        : undefined,
  };
}

/**
 * Logo control updates rebuild route state; keep the public dev flag only while
 * the operator has that root shell mode enabled.
 */
export function preserveLogoRouteDevModeSearch(
  nextSearch: LogoIsoRouteSearch,
  currentSearch: LogoIsoRouteSearch,
): LogoIsoRouteSearch {
  if (!currentSearch.dev) {
    return nextSearch;
  }

  return {
    ...nextSearch,
    dev: true as const,
  };
}
