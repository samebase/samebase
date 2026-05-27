import { keys } from "@noter-md/dependent/object";
import { type LogoRotationAxisMode } from "@/components/logo/logoRotationMath";
import {
  DEFAULT_LOGO_ISOMETRIC_CUBE_SIDE_PX,
  DEFAULT_LOGO_ISOMETRIC_STYLE_ID,
  LOGO_ISOMETRIC_CUBE_SIDE_STEP_PX,
  MAX_LOGO_ISOMETRIC_CUBE_SIDE_PX,
  MIN_LOGO_ISOMETRIC_CUBE_SIDE_PX,
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
  DEFAULT_LOGO_DISTANCE_SCALE,
  MIN_LOGO_DISTANCE_SCALE,
  normalizeLogoDistanceScale,
} from "@/components/logo/logoDistanceScale";
import {
  DEFAULT_LOGO_LEFT_FACE_STYLE,
  LOGO_LEFT_FACE_STYLE_KINDS,
  DEFAULT_LOGO_LEFT_FACE_STRIPE_ANGLE_DEGREES,
  DEFAULT_LOGO_LEFT_FACE_STRIPE_BASIS,
  DEFAULT_LOGO_LEFT_FACE_STRIPE_GAP,
  DEFAULT_LOGO_LEFT_FACE_STRIPE_OFFSET,
  DEFAULT_LOGO_LEFT_FACE_STRIPE_WIDTH,
  LOGO_LEFT_FACE_STRIPE_ANGLE_STEP,
  LOGO_LEFT_FACE_STRIPE_BASIS_VALUES,
  LOGO_LEFT_FACE_STRIPE_GAP_STEP,
  LOGO_LEFT_FACE_STRIPE_OFFSET_STEP,
  LOGO_LEFT_FACE_STRIPE_WIDTH_STEP,
  MAX_LOGO_LEFT_FACE_STRIPE_ANGLE_DEGREES,
  MAX_LOGO_LEFT_FACE_STRIPE_GAP,
  MAX_LOGO_LEFT_FACE_STRIPE_OFFSET,
  MAX_LOGO_LEFT_FACE_STRIPE_WIDTH,
  MIN_LOGO_LEFT_FACE_STRIPE_ANGLE_DEGREES,
  MIN_LOGO_LEFT_FACE_STRIPE_GAP,
  MIN_LOGO_LEFT_FACE_STRIPE_OFFSET,
  MIN_LOGO_LEFT_FACE_STRIPE_WIDTH,
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
} from "@/components/logo/logoLeftFaceStyle";
import {
  appThemeColorSearchFieldSchema,
  buildLogoThemeColorSearch,
  readLogoThemeColorSearch,
} from "@/lib/appThemeColorSearch";
import {
  readRootThemeModeSearch,
  rootThemeModeSearchFieldSchema,
  type RootThemeModeSearch,
} from "@/lib/rootThemeModeSearch";
import {
  type NoterRouteSearchParamSuggestion,
  type NoterRouteSearchParamValueSuggestions,
} from "@/lib/routePermissions";
import {
  DEFAULT_ELEVATION_DEGREES,
  DEFAULT_LOGO_FRACTAL_DEPTH,
  DEFAULT_LOGO_GRID_SIZE,
  DEFAULT_ROTATION_DEGREES,
  MAX_ELEVATION_DEGREES,
  MIN_ELEVATION_DEGREES,
  MIN_LOGO_FRACTAL_DEPTH,
  LOGO_GRID_SIZE_2,
  LOGO_GRID_SIZE_3,
  createDefaultVoxelState,
  readLogoGridSize,
  normalizeLogoGridSize,
  normalizeElevationDegrees,
  normalizeRotationDegrees,
  parseVoxelState,
  serializeVoxelState,
  type LogoGridSize,
} from "@/components/logo/logoVoxelState";
import { LANDING_DEV_MODE_QUERY_PARAM } from "@/lib/landingDevMode";
import { DEFAULT_LOGO_PRESET_ID, LOGO_PRESETS, getLogoPreset } from "@/components/logo/logoPresets";
import { normalizeRouteSearchPresenceFlags } from "@/lib/routeSearchFlags";
import {
  defineRouteSearchParams,
  type InferRouteSearch,
  readRouteSearchParamSuggestions,
  readRouteSearchPresenceKeys,
  readRouteSearchParamMetadata,
  routeSearchFiniteNumber,
  routeSearchNormalizedFiniteNumber,
  routeSearchPresenceParam,
  routeSearchStringValue,
  routeSearchValueParam,
  type RouteSearchParamMetadataByKey,
} from "@/lib/routeSearchParamMetadata";
import { bad, good, pure } from "@samebase/sure";

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

const LOGO_GRID_SIZE_VALUE_SUGGESTIONS = [`${LOGO_GRID_SIZE_2}`, `${LOGO_GRID_SIZE_3}`] as const;
const [FIRST_LOGO_PRESET, ...REMAINING_LOGO_PRESETS] = LOGO_PRESETS;
const LOGO_VOXEL_STATE_VALUE_SUGGESTIONS = [
  FIRST_LOGO_PRESET.voxelState,
  ...REMAINING_LOGO_PRESETS.map((preset) => preset.voxelState),
] satisfies NoterRouteSearchParamValueSuggestions;
const DEFAULT_LOGO_VOXEL_STATE_VALUE_SUGGESTION = getLogoPreset(DEFAULT_LOGO_PRESET_ID).voxelState;

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

const logoGridSizeSearchValue = pure((value: unknown) => {
  const [isGood, numericValue] = routeSearchFiniteNumber(value);
  if (!isGood) {
    return bad(numericValue);
  }

  const gridSize = readLogoGridSize(numericValue);
  return typeof gridSize === "number" ? good(gridSize) : bad("unsupported-grid-size");
});

const logoIsometricStyleSearchValue = pure((value: unknown) => {
  const isoStyleId = readOptionalString(value);
  return typeof isoStyleId === "string" && isLogoIsometricStyleId(isoStyleId)
    ? good(isoStyleId)
    : bad("unsupported-iso-style");
});

const logoLeftFaceStyleSearchValue = pure((value: unknown) => {
  const leftFaceStyleKind = readOptionalString(value);
  return isLogoLeftFaceStyleKind(leftFaceStyleKind)
    ? good(leftFaceStyleKind)
    : bad("unsupported-left-face");
});

const logoLeftFaceStripeBasisSearchValue = pure((value: unknown) => {
  const leftFaceStripeBasis = readOptionalString(value);
  return isLogoLeftFaceStripeBasis(leftFaceStripeBasis)
    ? good(leftFaceStripeBasis)
    : bad("unsupported-stripe-basis");
});

const canonicalVoxelStateSearchValue = pure((value: unknown) => {
  const voxelState = readCanonicalVoxelState(value);
  return typeof voxelState === "string" ? good(voxelState) : bad("invalid-voxel-state");
});

const logoRouteSearchFieldSchema = defineRouteSearchParams({
  axis: routeSearchValueParam(routeSearchStringValue(LOGO_ROTATION_AXIS_MODE_VALUES), {
    permission: "public",
    sampleValue: "screen-vertical",
    suggestion: "route",
    valueSuggestions: LOGO_ROTATION_AXIS_MODE_VALUES,
    valueType: "options",
  }),
  background: appThemeColorSearchFieldSchema.shape.background,
  border: appThemeColorSearchFieldSchema.shape.border,
  dark: rootThemeModeSearchFieldSchema.shape.dark,
  [LANDING_DEV_MODE_QUERY_PARAM]: routeSearchPresenceParam({
    permission: "public",
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
      permission: "public",
      sampleValue: `${DEFAULT_LOGO_FRACTAL_DEPTH + 1}`,
      suggestion: "route",
      valueType: "numeric",
    },
  ),
  dist: routeSearchValueParam(routeSearchNormalizedFiniteNumber(normalizeLogoDistanceScale), {
    numericDefaultValue: DEFAULT_LOGO_DISTANCE_SCALE,
    numericRange: {
      minValue: MIN_LOGO_DISTANCE_SCALE,
      rangeType: "min",
    },
    numericStepValue: 1,
    permission: "public",
    sampleValue: `${DEFAULT_LOGO_DISTANCE_SCALE + 1}`,
    suggestion: "route",
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
    permission: "public",
    sampleValue: `${DEFAULT_ELEVATION_DEGREES + 1}`,
    suggestion: "route",
    valueType: "numeric",
  }),
  freeView: routeSearchPresenceParam({
    permission: "public",
    suggestion: "route",
  }),
  gridSize: routeSearchValueParam(logoGridSizeSearchValue, {
    numericDefaultValue: DEFAULT_LOGO_GRID_SIZE,
    permission: "public",
    sampleValue: `${LOGO_GRID_SIZE_2}`,
    suggestion: "route",
    valueSuggestions: LOGO_GRID_SIZE_VALUE_SUGGESTIONS,
    valueType: "numeric-options",
  }),
  isoSide: routeSearchValueParam(
    routeSearchNormalizedFiniteNumber(normalizeLogoIsometricCubeSidePixels),
    {
      numericDefaultValue: DEFAULT_LOGO_ISOMETRIC_CUBE_SIDE_PX,
      numericRange: {
        maxValue: MAX_LOGO_ISOMETRIC_CUBE_SIDE_PX,
        minValue: MIN_LOGO_ISOMETRIC_CUBE_SIDE_PX,
        rangeType: "closed",
      },
      numericStepValue: LOGO_ISOMETRIC_CUBE_SIDE_STEP_PX,
      permission: "public",
      sampleValue: `${normalizeLogoIsometricCubeSidePixels(
        DEFAULT_LOGO_ISOMETRIC_CUBE_SIDE_PX + LOGO_ISOMETRIC_CUBE_SIDE_STEP_PX,
      )}`,
      suggestion: "route",
      valueType: "numeric",
    },
  ),
  isoStyle: routeSearchValueParam(logoIsometricStyleSearchValue, {
    permission: "public",
    sampleValue: "shaded-edge",
    suggestion: "route",
    valueSuggestions: LOGO_ISOMETRIC_STYLE_VALUES,
    valueType: "options",
  }),
  leftFace: routeSearchValueParam(logoLeftFaceStyleSearchValue, {
    permission: "public",
    sampleValue: "secondary",
    suggestion: "route",
    valueSuggestions: LOGO_LEFT_FACE_STYLE_KINDS,
    valueType: "options",
  }),
  light: rootThemeModeSearchFieldSchema.shape.light,
  primary: appThemeColorSearchFieldSchema.shape.primary,
  rot: routeSearchValueParam(routeSearchNormalizedFiniteNumber(normalizeRotationDegrees), {
    numericDefaultValue: DEFAULT_ROTATION_DEGREES,
    numericRange: {
      maxValue: 360,
      minValue: 0,
      rangeType: "wrap",
    },
    numericStepValue: 1,
    permission: "public",
    sampleValue: `${DEFAULT_ROTATION_DEGREES + 1}`,
    suggestion: "route",
    valueType: "numeric",
  }),
  secondary: appThemeColorSearchFieldSchema.shape.secondary,
  stripeA: routeSearchValueParam(
    routeSearchNormalizedFiniteNumber(normalizeLogoLeftFaceStripeAngleDegrees),
    {
      numericDefaultValue: DEFAULT_LOGO_LEFT_FACE_STRIPE_ANGLE_DEGREES,
      numericRange: {
        maxValue: MAX_LOGO_LEFT_FACE_STRIPE_ANGLE_DEGREES,
        minValue: MIN_LOGO_LEFT_FACE_STRIPE_ANGLE_DEGREES,
        rangeType: "closed",
      },
      numericStepValue: LOGO_LEFT_FACE_STRIPE_ANGLE_STEP,
      permission: "public",
      sampleValue: `${normalizeLogoLeftFaceStripeAngleDegrees(
        DEFAULT_LOGO_LEFT_FACE_STRIPE_ANGLE_DEGREES + 1,
      )}`,
      suggestion: "route",
      valueType: "numeric",
    },
  ),
  stripeBasis: routeSearchValueParam(logoLeftFaceStripeBasisSearchValue, {
    permission: "public",
    sampleValue: "horizontal",
    suggestion: "route",
    valueSuggestions: LOGO_LEFT_FACE_STRIPE_BASIS_VALUES,
    valueType: "options",
  }),
  stripeG: routeSearchValueParam(
    routeSearchNormalizedFiniteNumber(normalizeLogoLeftFaceStripeGap),
    {
      numericDefaultValue: DEFAULT_LOGO_LEFT_FACE_STRIPE_GAP,
      numericRange: {
        maxValue: MAX_LOGO_LEFT_FACE_STRIPE_GAP,
        minValue: MIN_LOGO_LEFT_FACE_STRIPE_GAP,
        rangeType: "closed",
      },
      numericStepValue: LOGO_LEFT_FACE_STRIPE_GAP_STEP,
      permission: "public",
      sampleValue: `${normalizeLogoLeftFaceStripeGap(DEFAULT_LOGO_LEFT_FACE_STRIPE_GAP + 1)}`,
      suggestion: "route",
      valueType: "numeric",
    },
  ),
  stripeLink: routeSearchPresenceParam({
    permission: "public",
    suggestion: "route",
  }),
  stripeO: routeSearchValueParam(
    routeSearchNormalizedFiniteNumber(normalizeLogoLeftFaceStripeOffset),
    {
      numericDefaultValue: DEFAULT_LOGO_LEFT_FACE_STRIPE_OFFSET,
      numericRange: {
        maxValue: MAX_LOGO_LEFT_FACE_STRIPE_OFFSET,
        minValue: MIN_LOGO_LEFT_FACE_STRIPE_OFFSET,
        rangeType: "closed",
      },
      numericStepValue: LOGO_LEFT_FACE_STRIPE_OFFSET_STEP,
      permission: "public",
      sampleValue: `${normalizeLogoLeftFaceStripeOffset(DEFAULT_LOGO_LEFT_FACE_STRIPE_OFFSET + 1)}`,
      suggestion: "route",
      valueType: "numeric",
    },
  ),
  stripeW: routeSearchValueParam(
    routeSearchNormalizedFiniteNumber(normalizeLogoLeftFaceStripeWidth),
    {
      numericDefaultValue: DEFAULT_LOGO_LEFT_FACE_STRIPE_WIDTH,
      numericRange: {
        maxValue: MAX_LOGO_LEFT_FACE_STRIPE_WIDTH,
        minValue: MIN_LOGO_LEFT_FACE_STRIPE_WIDTH,
        rangeType: "closed",
      },
      numericStepValue: LOGO_LEFT_FACE_STRIPE_WIDTH_STEP,
      permission: "public",
      sampleValue: `${normalizeLogoLeftFaceStripeWidth(DEFAULT_LOGO_LEFT_FACE_STRIPE_WIDTH + 1)}`,
      suggestion: "route",
      valueType: "numeric",
    },
  ),
  top: appThemeColorSearchFieldSchema.shape.top,
  vox: routeSearchValueParam(canonicalVoxelStateSearchValue, {
    permission: "public",
    sampleValue: DEFAULT_LOGO_VOXEL_STATE_VALUE_SUGGESTION,
    suggestion: "route",
    valueSuggestions: LOGO_VOXEL_STATE_VALUE_SUGGESTIONS,
    valueType: "options",
  }),
});

type LogoRouteSearchFields = InferRouteSearch<typeof logoRouteSearchFieldSchema>;

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
    ...(typeof search.isoSide === "number" ? { isoSide: search.isoSide } : {}),
    ...(typeof search.isoStyle === "string" ? { isoStyle: search.isoStyle } : {}),
    ...readLogoLeftFaceStyleSearch(readLogoLeftFaceStyle(search)),
    ...(typeof search.rot === "number" ? { rot: search.rot } : {}),
    ...(typeof voxelState === "string" ? { vox: voxelState } : {}),
  };
}

export type LogoRouteSearch = ReturnType<typeof readLogoRouteSearchFields>;

export type LogoRouteSearchBuildState = {
  distanceScale: number;
  elevationDegrees: number;
  fractalDepth: number;
  gridSize: LogoGridSize;
  isoCubeSidePixels: number;
  isoStyleId: LogoIsometricStyleId;
  leftFaceStyle: LogoLeftFaceStyle;
  rotationAxisMode: LogoRotationAxisMode;
  rotationDegrees: number;
  themeColors: LogoThemeColors;
  viewSnapEnabled: boolean;
  voxelState: string;
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
  logoRouteSearchFieldSchema,
) satisfies RouteSearchParamMetadataByKey<LogoRouteSearch>;

export const LOGO_ROUTE_SEARCH_KEYS = keys(LOGO_ROUTE_SEARCH_PARAM_METADATA);

const LOGO_ROUTE_PRESENCE_SEARCH_KEYS = readRouteSearchPresenceKeys(
  LOGO_ROUTE_SEARCH_PARAM_METADATA,
);

function readLogoRouteSearchParamSuggestionsWithDepthMax(
  depthMax: number,
): readonly NoterRouteSearchParamSuggestion[] {
  const depthNumericRange = {
    maxValue: depthMax,
    minValue: MIN_LOGO_FRACTAL_DEPTH,
    rangeType: "closed" as const,
  };

  return readRouteSearchParamSuggestions(LOGO_ROUTE_SEARCH_PARAM_METADATA, "route").map(
    (suggestion) => {
      if (
        suggestion.key !== "depth" ||
        suggestion.valueKind !== "value" ||
        suggestion.valueType !== "numeric"
      ) {
        return suggestion;
      }

      return {
        ...suggestion,
        numericRange: depthNumericRange,
        sampleValue: `${Math.min(DEFAULT_LOGO_FRACTAL_DEPTH + 1, depthMax)}`,
      };
    },
  );
}

export const LOGO_ROUTE_SEARCH_PARAM_SUGGESTIONS =
  readLogoRouteSearchParamSuggestionsWithDepthMax(MAX_LOGO_FRACTAL_DEPTH);

export function readLogoRouteSearchParamSuggestionsForRenderer(
  renderer: LogoDepthRenderer,
): readonly NoterRouteSearchParamSuggestion[] {
  return readLogoRouteSearchParamSuggestionsWithDepthMax(
    getLogoRendererFractalDepthHardMax(renderer),
  );
}

function normalizeLogoRouteColorSearchAliases(search: Record<string, unknown>) {
  const background = search.background ?? search.base;
  if (typeof background === "undefined" || background === search.background) {
    return search;
  }

  return {
    ...search,
    background,
  };
}

export function validateLogoRouteSearch(search: Record<string, unknown>): LogoRouteSearch {
  const presenceNormalizedSearch = normalizeRouteSearchPresenceFlags(
    search,
    LOGO_ROUTE_PRESENCE_SEARCH_KEYS,
  );

  return readLogoRouteSearchFields(
    logoRouteSearchFieldSchema.parse(
      normalizeLogoRouteColorSearchAliases(presenceNormalizedSearch),
    ),
  );
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

  return {
    ...readRootThemeModeSearch(args.themeModeSearch ?? {}),
    ...buildLogoThemeColorSearch(args.themeColors),
    ...(args.rotationAxisMode !== "cube-y" ? { axis: args.rotationAxisMode } : {}),
    ...(args.elevationDegrees !== DEFAULT_ELEVATION_DEGREES
      ? { elev: Number(args.elevationDegrees.toFixed(1)) }
      : {}),
    // `depth` is retained by the root route, so default depth needs an own
    // undefined tombstone to clear a previous recursive preview value.
    depth: fractalDepth !== DEFAULT_LOGO_FRACTAL_DEPTH ? fractalDepth : undefined,
    dist:
      distanceScale !== DEFAULT_LOGO_DISTANCE_SCALE ? Number(distanceScale.toFixed(3)) : undefined,
    ...(args.viewSnapEnabled ? {} : { freeView: true }),
    gridSize: gridSize !== DEFAULT_LOGO_GRID_SIZE ? gridSize : undefined,
    ...(args.isoCubeSidePixels !== DEFAULT_LOGO_ISOMETRIC_CUBE_SIDE_PX
      ? { isoSide: args.isoCubeSidePixels }
      : {}),
    ...(args.isoStyleId !== DEFAULT_LOGO_ISOMETRIC_STYLE_ID ? { isoStyle: args.isoStyleId } : {}),
    ...buildLogoLeftFaceStyleSearch(leftFaceStyle),
    ...(args.rotationDegrees !== DEFAULT_ROTATION_DEGREES
      ? { rot: Number(args.rotationDegrees.toFixed(1)) }
      : {}),
    ...(voxelState !== defaultVoxelState ? { vox: voxelState } : {}),
  };
}

/**
 * Route parsing canonicalizes visible params only; explicit logo updates use
 * buildLogoLeftFaceStyleSearch when they need tombstones for retained keys.
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
    ...(leftFaceStyle.stripeAngleDegrees !== DEFAULT_LOGO_LEFT_FACE_STRIPE_ANGLE_DEGREES
      ? { stripeA: Number(leftFaceStyle.stripeAngleDegrees.toFixed(3)) }
      : {}),
    ...(leftFaceStyle.stripeBasis !== DEFAULT_LOGO_LEFT_FACE_STRIPE_BASIS
      ? { stripeBasis: leftFaceStyle.stripeBasis }
      : {}),
    ...(leftFaceStyle.stripeGap !== DEFAULT_LOGO_LEFT_FACE_STRIPE_GAP
      ? { stripeG: Number(leftFaceStyle.stripeGap.toFixed(2)) }
      : {}),
    ...(leftFaceStyle.stripeGapLinked ? { stripeLink: true as const } : {}),
    ...(leftFaceStyle.stripeOffset !== DEFAULT_LOGO_LEFT_FACE_STRIPE_OFFSET
      ? { stripeO: Number(leftFaceStyle.stripeOffset.toFixed(2)) }
      : {}),
    ...(leftFaceStyle.stripeWidth !== DEFAULT_LOGO_LEFT_FACE_STRIPE_WIDTH
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
      leftFaceStyle.stripeAngleDegrees !== DEFAULT_LOGO_LEFT_FACE_STRIPE_ANGLE_DEGREES
        ? Number(leftFaceStyle.stripeAngleDegrees.toFixed(3))
        : undefined,
    stripeBasis:
      leftFaceStyle.stripeBasis !== DEFAULT_LOGO_LEFT_FACE_STRIPE_BASIS
        ? leftFaceStyle.stripeBasis
        : undefined,
    stripeG:
      leftFaceStyle.stripeGap !== DEFAULT_LOGO_LEFT_FACE_STRIPE_GAP
        ? Number(leftFaceStyle.stripeGap.toFixed(2))
        : undefined,
    stripeLink: leftFaceStyle.stripeGapLinked ? true : undefined,
    stripeO:
      leftFaceStyle.stripeOffset !== DEFAULT_LOGO_LEFT_FACE_STRIPE_OFFSET
        ? Number(leftFaceStyle.stripeOffset.toFixed(2))
        : undefined,
    stripeW:
      leftFaceStyle.stripeWidth !== DEFAULT_LOGO_LEFT_FACE_STRIPE_WIDTH
        ? Number(leftFaceStyle.stripeWidth.toFixed(2))
        : undefined,
  };
}

/**
 * Logo control updates rebuild route state; keep the public dev flag only while
 * the operator has that root shell mode enabled.
 */
export function preserveLogoRouteDevModeSearch(
  nextSearch: LogoRouteSearch,
  currentSearch: LogoRouteSearch,
): LogoRouteSearch {
  if (!currentSearch.dev) {
    return nextSearch;
  }

  return {
    ...nextSearch,
    dev: true as const,
  };
}
