import { keys } from "@noter-md/dependent/object";
import { type LogoRotationAxisMode } from "@/components/logo/logoRotationMath";
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
} from "@/components/logo/logoLeftFaceStyle";
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
  type RouteSearchParamMetadata,
  type RouteSearchParamMetadataByKey,
} from "@/lib/routeSearchParamMetadata";
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

const logoGridSizeSearchValue = after(routeSearchFiniteNumber, (numericValue) => {
  const gridSize = readLogoGridSize(numericValue);
  return typeof gridSize === "number" ? good(gridSize) : bad("unsupported-grid-size");
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
  axis: routeSearchValueParam(routeSearchStringValue(LOGO_ROTATION_AXIS_MODE_VALUES), {
    permission: "public",
    sampleValue: "screen-vertical",
    suggestion: "route",
    valueSuggestions: LOGO_ROTATION_AXIS_MODE_VALUES,
    valueType: "options",
  }),
  background: RouteSearchSchema_appThemeColor.shape.background,
  border: RouteSearchSchema_appThemeColor.shape.border,
  dark: RouteSearchSchema_rootThemeMode.shape.dark,
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
    permission: "public",
    sampleValue: `${LOGO_DISTANCE_SCALE.defaultValue + 1}`,
    suggestion: "route",
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
    permission: "public",
    sampleValue: `${DEFAULT_ELEVATION_DEGREES + 1}`,
    suggestion: "route",
    valueSuggestions: null,
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
  leftFace: routeSearchValueParam(logoLeftFaceStyleSearchValue, {
    permission: "public",
    sampleValue: "secondary",
    suggestion: "route",
    valueSuggestions: LOGO_LEFT_FACE_STYLE_KINDS,
    valueType: "options",
  }),
  light: RouteSearchSchema_rootThemeMode.shape.light,
  primary: RouteSearchSchema_appThemeColor.shape.primary,
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
    valueSuggestions: null,
    valueType: "numeric",
  }),
  secondary: RouteSearchSchema_appThemeColor.shape.secondary,
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
      permission: "public",
      sampleValue: `${normalizeLogoLeftFaceStripeAngleDegrees(
        LOGO_LEFT_FACE_STRIPE.angleDegrees.defaultValue + 1,
      )}`,
      suggestion: "route",
      valueSuggestions: null,
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
      numericDefaultValue: LOGO_LEFT_FACE_STRIPE.gap.defaultValue,
      numericRange: {
        maxValue: LOGO_LEFT_FACE_STRIPE.gap.max,
        minValue: LOGO_LEFT_FACE_STRIPE.gap.min,
        rangeType: "closed",
      },
      numericStepValue: LOGO_LEFT_FACE_STRIPE.gap.step,
      permission: "public",
      sampleValue: `${normalizeLogoLeftFaceStripeGap(LOGO_LEFT_FACE_STRIPE.gap.defaultValue + 1)}`,
      suggestion: "route",
      valueSuggestions: null,
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
      numericDefaultValue: LOGO_LEFT_FACE_STRIPE.offset.defaultValue,
      numericRange: {
        maxValue: LOGO_LEFT_FACE_STRIPE.offset.max,
        minValue: LOGO_LEFT_FACE_STRIPE.offset.min,
        rangeType: "closed",
      },
      numericStepValue: LOGO_LEFT_FACE_STRIPE.offset.step,
      permission: "public",
      sampleValue: `${normalizeLogoLeftFaceStripeOffset(LOGO_LEFT_FACE_STRIPE.offset.defaultValue + 1)}`,
      suggestion: "route",
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
      permission: "public",
      sampleValue: `${normalizeLogoLeftFaceStripeWidth(LOGO_LEFT_FACE_STRIPE.width.defaultValue + 1)}`,
      suggestion: "route",
      valueSuggestions: null,
      valueType: "numeric",
    },
  ),
  top: RouteSearchSchema_appThemeColor.shape.top,
  vox: routeSearchValueParam(canonicalVoxelStateSearchValue, {
    permission: "public",
    sampleValue: DEFAULT_LOGO_VOXEL_STATE_VALUE_SUGGESTION,
    suggestion: "route",
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
    permission: "public",
    sampleValue: "0.5",
    suggestion: "route",
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
      permission: "public",
      sampleValue: `${normalizeLogoIsometricCubeSidePixels(
        LOGO_ISOMETRIC_CUBE_SIDE_PIXELS.defaultValue + LOGO_ISOMETRIC_CUBE_SIDE_PIXELS.step,
      )}`,
      suggestion: "route",
      valueSuggestions: null,
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
    ...(typeof search.rot === "number" ? { rot: search.rot } : {}),
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

const LOGO_ISO_ROUTE_SEARCH_PARAM_METADATA = readRouteSearchParamMetadata(
  RouteSearchSchema_logoIso,
) satisfies RouteSearchParamMetadataByKey<LogoIsoRouteSearch>;

export const LOGO_ISO_ROUTE_SEARCH_KEYS = keys(LOGO_ISO_ROUTE_SEARCH_PARAM_METADATA);

const LOGO_ROUTE_PRESENCE_SEARCH_KEYS = readRouteSearchPresenceKeys(
  LOGO_ROUTE_SEARCH_PARAM_METADATA,
);

function readLogoDepthValueSuggestions(depthMax: number): NoterRouteSearchParamValueSuggestions {
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
): readonly NoterRouteSearchParamSuggestion[] {
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
): readonly NoterRouteSearchParamSuggestion[] {
  return readLogoRouteSearchParamSuggestionsWithDepthMax(
    renderer === "iso" ? LOGO_ISO_ROUTE_SEARCH_PARAM_METADATA : LOGO_ROUTE_SEARCH_PARAM_METADATA,
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
    RouteSearchSchema_logo.parse(normalizeLogoRouteColorSearchAliases(presenceNormalizedSearch)),
  );
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
    RouteSearchSchema_logoIso.parse(normalizeLogoRouteColorSearchAliases(presenceNormalizedSearch)),
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
  const zoom = normalizeLogoPreviewZoom(args.zoom);

  return {
    ...readRootThemeModeSearch(args.themeModeSearch ?? {}),
    ...buildLogoThemeColorSearch(args.themeColors),
    // Default-valued logo controls use own undefined tombstones so retained
    // root search cannot revive stale logo params after the serializer omits them.
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
    rot:
      args.rotationDegrees !== DEFAULT_ROTATION_DEGREES
        ? Number(args.rotationDegrees.toFixed(1))
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
