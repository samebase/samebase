import { includes } from "@samebase/dependent";
import { keys } from "@samebase/dependent/object";
import {
  LOGO_AUTO_ROTATE_SPEED,
  normalizeLogoAutoRotateDegreesPerSecond,
} from "@samebase/logo-model/auto-rotation";
import { type LogoRotationAxisMode } from "@samebase/logo-model/rotation";
import {
  SIERPINSKI_CARPET_HOVER_DEFAULT_DEPTH,
  SIERPINSKI_CARPET_HOVER_DEFAULT_MECHANIC,
  SIERPINSKI_CARPET_HOVER_DEFAULT_REVEAL_RADIUS,
  SIERPINSKI_CARPET_HOVER_MAX_DEPTH,
  SIERPINSKI_CARPET_HOVER_MAX_REVEAL_RADIUS,
  SIERPINSKI_CARPET_HOVER_MECHANICS,
  SIERPINSKI_CARPET_HOVER_MIN_REVEAL_RADIUS,
  normalizeSierpinskiCarpetHoverRevealRadius,
  type SierpinskiCarpetHoverDepth,
  type SierpinskiCarpetHoverMechanic,
} from "@samebase/logo-model/sierpinski-carpet-hover";
import {
  MENGER_HOVER_DEFAULT_DEPTH,
  MENGER_HOVER_MAX_DEPTH,
} from "@samebase/logo-model/menger-hover";
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
  LOGO_PRESENTATION_TILT_DEFAULT_RADIUS_SCALE,
  LOGO_PRESENTATION_TILT_DEFAULT_STRENGTH_SCALE,
  normalizeLogoPresentationTiltRadiusScale,
  normalizeLogoPresentationTiltStrengthScale,
} from "@/components/logo/logoPresentationTilt";
import {
  MENGER_AUTOMATIC_PROBE_DEFAULT_SETTINGS,
  MENGER_AUTOMATIC_PROBE_DEFAULT_HEIGHT,
  MENGER_AUTOMATIC_PROBE_DEFAULT_LOOP_DURATION_SECONDS,
  MENGER_AUTOMATIC_PROBE_DEFAULT_PATH,
  MENGER_AUTOMATIC_PROBE_DEFAULT_REST_DURATION_SECONDS,
  MENGER_AUTOMATIC_PROBE_DEFAULT_START_PROGRESS,
  MENGER_AUTOMATIC_PROBE_DEFAULT_VERTICAL_OFFSET,
  MENGER_AUTOMATIC_PROBE_DEFAULT_WIDTH,
  MENGER_AUTOMATIC_PROBE_PATHS,
  normalizeMengerAutomaticProbeExtent,
  normalizeMengerAutomaticProbeLoopDurationSeconds,
  normalizeMengerAutomaticProbeRestDurationSeconds,
  normalizeMengerAutomaticProbeStartProgress,
  normalizeMengerAutomaticProbeVerticalOffset,
  type MengerAutomaticProbeSettings,
} from "@/components/logo/mengerAutomaticProbe";
import {
  MENGER_TYPE_GPU_DEFAULT_RESOLUTION_SCALE,
  MENGER_TYPE_GPU_MAXIMUM_DEPTH,
  MENGER_TYPE_GPU_MAXIMUM_RESOLUTION_SCALE,
  MENGER_TYPE_GPU_MINIMUM_RESOLUTION_SCALE,
  MENGER_TYPE_GPU_RESOLUTION_SCALE_STEP,
  normalizeMengerTypeGpuDepth,
  normalizeMengerTypeGpuResolutionScale,
  type MengerHoverRenderer,
} from "@/components/logo/mengerTypeGpuSettings";
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

export const LOGO_CARPET_SHUFFLE_DEFAULT_MECHANIC = "grow" satisfies SierpinskiCarpetHoverMechanic;

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
const logoRouteSearchSuggestion = {
  group: "logo",
  suggestion: "route",
} as const;
const logoMotionRouteSearchSuggestion = {
  group: "logo-motion",
  suggestion: "route",
} as const;
const logoViewRouteSearchSuggestion = {
  group: "logo-view",
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
    ...logoMotionRouteSearchSuggestion,
  }),
  "animate-stripes": routeSearchPresenceParam({
    access: "access_public",
    ...logoMotionRouteSearchSuggestion,
  }),
  "auto-rotate": routeSearchPresenceParam({
    access: "access_public",
    ...logoMotionRouteSearchSuggestion,
  }),
  "auto-shuffle": routeSearchPresenceParam({
    access: "access_public",
    ...logoMotionRouteSearchSuggestion,
  }),
  axis: routeSearchValueParam(routeSearchStringValue(LOGO_ROTATION_AXIS_MODE_VALUES), {
    access: "access_public",
    sampleValue: "screen-vertical",
    ...logoMotionRouteSearchSuggestion,
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
      ...logoRouteSearchSuggestion,
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
    ...logoViewRouteSearchSuggestion,
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
    ...logoViewRouteSearchSuggestion,
    valueSuggestions: null,
    valueType: "numeric",
  }),
  freeView: routeSearchPresenceParam({
    access: "access_public",
    ...logoViewRouteSearchSuggestion,
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
    ...logoRouteSearchSuggestion,
    valueSuggestions: null,
    valueType: "numeric",
  }),
  leftFace: routeSearchValueParam(logoLeftFaceStyleSearchValue, {
    access: "access_public",
    sampleValue: "secondary",
    ...logoRouteSearchSuggestion,
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
    ...logoRouteSearchSuggestion,
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
    ...logoViewRouteSearchSuggestion,
    valueSuggestions: null,
    valueType: "numeric",
  }),
  rotationSpeed: routeSearchValueParam(
    routeSearchNormalizedFiniteNumber(normalizeLogoAutoRotateDegreesPerSecond),
    {
      numericDefaultValue: LOGO_AUTO_ROTATE_SPEED.defaultValue,
      numericRange: {
        minValue: LOGO_AUTO_ROTATE_SPEED.min,
        rangeType: "min",
      },
      numericStepValue: LOGO_AUTO_ROTATE_SPEED.step,
      access: "access_public",
      sampleValue: "24",
      ...logoMotionRouteSearchSuggestion,
      valueSuggestions: ["0", "6", "12", "24", "36", "60"],
      valueType: "numeric",
    },
  ),
  secondary: RouteSearchSchema_appThemeColor.shape.secondary,
  shuffleMoves: routeSearchValueParam(logoShuffleParallelMovesSearchValue, {
    numericDefaultValue: DEFAULT_LOGO_SHUFFLE_PARALLEL_MOVES,
    access: "access_public",
    sampleValue: "2",
    ...logoMotionRouteSearchSuggestion,
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
      ...logoRouteSearchSuggestion,
      valueSuggestions: null,
      valueType: "numeric",
    },
  ),
  stripeBasis: routeSearchValueParam(logoLeftFaceStripeBasisSearchValue, {
    access: "access_public",
    sampleValue: "horizontal",
    ...logoRouteSearchSuggestion,
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
      ...logoRouteSearchSuggestion,
      valueSuggestions: null,
      valueType: "numeric",
    },
  ),
  stripeLink: routeSearchPresenceParam({
    access: "access_public",
    ...logoRouteSearchSuggestion,
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
      ...logoRouteSearchSuggestion,
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
      ...logoRouteSearchSuggestion,
      valueSuggestions: null,
      valueType: "numeric",
    },
  ),
  top: RouteSearchSchema_appThemeColor.shape.top,
  vox: routeSearchValueParam(canonicalVoxelStateSearchValue, {
    access: "access_public",
    sampleValue: DEFAULT_LOGO_VOXEL_STATE_VALUE_SUGGESTION,
    ...logoRouteSearchSuggestion,
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
    ...logoViewRouteSearchSuggestion,
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
      ...logoRouteSearchSuggestion,
      valueSuggestions: null,
      valueType: "numeric",
    },
  ),
  isoStyle: routeSearchValueParam(logoIsometricStyleSearchValue, {
    access: "access_public",
    sampleValue: "shaded-edge",
    ...logoRouteSearchSuggestion,
    valueSuggestions: LOGO_ISOMETRIC_STYLE_VALUES,
    valueType: "options",
  }),
});

/**
The pointer-reveal params are owned by the /logo/hover/carpet route alone;
every other logo route accepts only the shared schema keys. The shared depth
key doubles as the carpet reveal depth with the carpet's own default and cap.
*/
const RouteSearchSchema_logoCarpetHover = defineRouteSearchParams({
  ...RouteSearchSchema_logo.shape,
  mechanic: routeSearchValueParam(routeSearchStringValue(SIERPINSKI_CARPET_HOVER_MECHANICS), {
    access: "access_public",
    sampleValue: "slide",
    ...logoRouteSearchSuggestion,
    valueSuggestions: SIERPINSKI_CARPET_HOVER_MECHANICS,
    valueType: "options",
  }),
  radius: routeSearchValueParam(
    routeSearchNormalizedFiniteNumber(normalizeSierpinskiCarpetHoverRevealRadius),
    {
      numericDefaultValue: SIERPINSKI_CARPET_HOVER_DEFAULT_REVEAL_RADIUS,
      numericRange: {
        maxValue: SIERPINSKI_CARPET_HOVER_MAX_REVEAL_RADIUS,
        minValue: SIERPINSKI_CARPET_HOVER_MIN_REVEAL_RADIUS,
        rangeType: "closed",
      },
      numericStepValue: 0.01,
      access: "access_public",
      sampleValue: "0.5",
      ...logoRouteSearchSuggestion,
      valueSuggestions: ["0.2", "0.35", "0.5", "0.8", "1"],
      valueType: "numeric",
    },
  ),
});

/** Landing-style pointer and automatic-probe options belong only to the Menger hover lab. */
const RouteSearchSchema_logoMengerHover = defineRouteSearchParams({
  ...RouteSearchSchema_logo.shape,
  resolution: routeSearchValueParam(
    routeSearchNormalizedFiniteNumber(normalizeMengerTypeGpuResolutionScale),
    {
      numericDefaultValue: MENGER_TYPE_GPU_DEFAULT_RESOLUTION_SCALE,
      numericRange: {
        maxValue: MENGER_TYPE_GPU_MAXIMUM_RESOLUTION_SCALE,
        minValue: MENGER_TYPE_GPU_MINIMUM_RESOLUTION_SCALE,
        rangeType: "closed",
      },
      numericStepValue: MENGER_TYPE_GPU_RESOLUTION_SCALE_STEP,
      access: "access_public",
      sampleValue: `${MENGER_TYPE_GPU_MAXIMUM_RESOLUTION_SCALE}`,
      ...logoViewRouteSearchSuggestion,
      valueSuggestions: null,
      valueType: "numeric",
    },
  ),
  three: routeSearchPresenceParam({
    access: "access_public",
    ...logoViewRouteSearchSuggestion,
  }),
  probe: routeSearchPresenceParam({
    access: "access_public",
    ...logoMotionRouteSearchSuggestion,
  }),
  probeDisabled: routeSearchPresenceParam({
    access: "access_public",
    suggestion: "hidden",
  }),
  probeHeight: routeSearchValueParam(
    routeSearchNormalizedFiniteNumber(normalizeMengerAutomaticProbeExtent),
    {
      numericDefaultValue: MENGER_AUTOMATIC_PROBE_DEFAULT_HEIGHT,
      numericRange: {
        minValue: 0,
        rangeType: "min",
      },
      numericStepValue: 0.05,
      access: "access_public",
      sampleValue: "1.3",
      ...logoMotionRouteSearchSuggestion,
      valueSuggestions: ["0.3", "0.4", "0.55", "0.7", "1"],
      valueType: "numeric",
    },
  ),
  probeOffset: routeSearchValueParam(
    routeSearchNormalizedFiniteNumber(normalizeMengerAutomaticProbeVerticalOffset),
    {
      numericDefaultValue: MENGER_AUTOMATIC_PROBE_DEFAULT_VERTICAL_OFFSET,
      numericRange: {
        minValue: -Number.MAX_VALUE,
        rangeType: "min",
      },
      numericStepValue: 0.05,
      access: "access_public",
      sampleValue: "-0.15",
      ...logoMotionRouteSearchSuggestion,
      valueSuggestions: ["-1", "-0.5", "0", "0.5", "1"],
      valueType: "numeric",
    },
  ),
  probeLanding: routeSearchPresenceParam({
    access: "access_public",
    ...logoViewRouteSearchSuggestion,
  }),
  probeLandingOff: routeSearchPresenceParam({
    access: "access_public",
    suggestion: "hidden",
  }),
  probeLoop: routeSearchValueParam(
    routeSearchNormalizedFiniteNumber(normalizeMengerAutomaticProbeLoopDurationSeconds),
    {
      numericDefaultValue: MENGER_AUTOMATIC_PROBE_DEFAULT_LOOP_DURATION_SECONDS,
      numericRange: {
        minValue: 0.1,
        rangeType: "min",
      },
      numericStepValue: 0.5,
      access: "access_public",
      sampleValue: "12",
      ...logoMotionRouteSearchSuggestion,
      valueSuggestions: ["3", "4", "5.5", "7", "10"],
      valueType: "numeric",
    },
  ),
  probePath: routeSearchValueParam(routeSearchStringValue(MENGER_AUTOMATIC_PROBE_PATHS), {
    access: "access_public",
    sampleValue: "vertical-8",
    ...logoMotionRouteSearchSuggestion,
    valueSuggestions: MENGER_AUTOMATIC_PROBE_PATHS,
    valueType: "options",
  }),
  probePathVisible: routeSearchPresenceParam({
    access: "access_public",
    ...logoViewRouteSearchSuggestion,
  }),
  probePathHidden: routeSearchPresenceParam({
    access: "access_public",
    suggestion: "hidden",
  }),
  probeRest: routeSearchValueParam(
    routeSearchNormalizedFiniteNumber(normalizeMengerAutomaticProbeRestDurationSeconds),
    {
      numericDefaultValue: MENGER_AUTOMATIC_PROBE_DEFAULT_REST_DURATION_SECONDS,
      numericRange: {
        minValue: 0,
        rangeType: "min",
      },
      numericStepValue: 0.5,
      access: "access_public",
      sampleValue: "0",
      ...logoMotionRouteSearchSuggestion,
      valueSuggestions: ["0", "0.5", "1.5", "2", "3"],
      valueType: "numeric",
    },
  ),
  probeStart: routeSearchValueParam(
    routeSearchNormalizedFiniteNumber(normalizeMengerAutomaticProbeStartProgress),
    {
      numericDefaultValue: MENGER_AUTOMATIC_PROBE_DEFAULT_START_PROGRESS,
      numericRange: {
        maxValue: 1,
        minValue: 0,
        rangeType: "closed",
      },
      numericStepValue: 0.01,
      access: "access_public",
      sampleValue: "0.25",
      ...logoMotionRouteSearchSuggestion,
      valueSuggestions: ["0", "0.25", "0.5", "0.75", "1"],
      valueType: "numeric",
    },
  ),
  probeWidth: routeSearchValueParam(
    routeSearchNormalizedFiniteNumber(normalizeMengerAutomaticProbeExtent),
    {
      numericDefaultValue: MENGER_AUTOMATIC_PROBE_DEFAULT_WIDTH,
      numericRange: {
        minValue: 0,
        rangeType: "min",
      },
      numericStepValue: 0.05,
      access: "access_public",
      sampleValue: "0.55",
      ...logoMotionRouteSearchSuggestion,
      valueSuggestions: ["0.2", "0.3", "0.4", "0.55", "0.8"],
      valueType: "numeric",
    },
  ),
  tilt: routeSearchPresenceParam({
    access: "access_public",
    ...logoViewRouteSearchSuggestion,
  }),
  tiltRadius: routeSearchValueParam(
    routeSearchNormalizedFiniteNumber(normalizeLogoPresentationTiltRadiusScale),
    {
      numericDefaultValue: LOGO_PRESENTATION_TILT_DEFAULT_RADIUS_SCALE,
      numericRange: {
        minValue: 0,
        rangeType: "min",
      },
      numericStepValue: 0.05,
      access: "access_public",
      sampleValue: "1.2",
      ...logoViewRouteSearchSuggestion,
      valueSuggestions: ["0.5", "0.75", "1", "1.25", "1.5", "2"],
      valueType: "numeric",
    },
  ),
  tiltStrength: routeSearchValueParam(
    routeSearchNormalizedFiniteNumber(normalizeLogoPresentationTiltStrengthScale),
    {
      numericDefaultValue: LOGO_PRESENTATION_TILT_DEFAULT_STRENGTH_SCALE,
      numericRange: {
        minValue: 0,
        rangeType: "min",
      },
      numericStepValue: 0.05,
      access: "access_public",
      sampleValue: "1.5",
      ...logoViewRouteSearchSuggestion,
      valueSuggestions: ["0", "0.5", "0.75", "1", "1.25", "1.5", "1.67", "2"],
      valueType: "numeric",
    },
  ),
});

type LogoRouteSearchFields = InferRouteSearch<typeof RouteSearchSchema_logo>;

type LogoIsoRouteSearchFields = InferRouteSearch<typeof RouteSearchSchema_logoIso>;

type LogoCarpetHoverRouteSearchFields = InferRouteSearch<typeof RouteSearchSchema_logoCarpetHover>;

type LogoMengerHoverRouteSearchFields = InferRouteSearch<typeof RouteSearchSchema_logoMengerHover>;

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
    ...(typeof search.rotationSpeed === "number" ? { rotationSpeed: search.rotationSpeed } : {}),
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

function readLogoCarpetHoverRouteSearchFields(search: LogoCarpetHoverRouteSearchFields) {
  return {
    ...readLogoRouteSearchFields(search),
    ...(typeof search.mechanic === "string" ? { mechanic: search.mechanic } : {}),
    ...(typeof search.radius === "number" ? { radius: search.radius } : {}),
  };
}

function readLogoMengerHoverRouteSearchFields(search: LogoMengerHoverRouteSearchFields) {
  return {
    ...readLogoRouteSearchFields(search),
    ...(typeof search.resolution === "number" ? { resolution: search.resolution } : {}),
    ...(search.three ? { three: true as const } : {}),
    ...(search.probe ? { probe: true as const } : {}),
    ...(search.probeDisabled ? { probeDisabled: true as const } : {}),
    ...(typeof search.probeHeight === "number" ? { probeHeight: search.probeHeight } : {}),
    ...(search.probeLanding ? { probeLanding: true as const } : {}),
    ...(search.probeLandingOff ? { probeLandingOff: true as const } : {}),
    ...(typeof search.probeLoop === "number" ? { probeLoop: search.probeLoop } : {}),
    ...(typeof search.probePath === "string" ? { probePath: search.probePath } : {}),
    ...(search.probePathVisible ? { probePathVisible: true as const } : {}),
    ...(search.probePathHidden ? { probePathHidden: true as const } : {}),
    ...(typeof search.probeOffset === "number" ? { probeOffset: search.probeOffset } : {}),
    ...(typeof search.probeRest === "number" ? { probeRest: search.probeRest } : {}),
    ...(typeof search.probeStart === "number" ? { probeStart: search.probeStart } : {}),
    ...(typeof search.probeWidth === "number" ? { probeWidth: search.probeWidth } : {}),
    ...(search.tilt ? { tilt: true as const } : {}),
    ...(typeof search.tiltRadius === "number" ? { tiltRadius: search.tiltRadius } : {}),
    ...(typeof search.tiltStrength === "number" ? { tiltStrength: search.tiltStrength } : {}),
  };
}

export type LogoRouteSearch = ReturnType<typeof readLogoRouteSearchFields>;

export type LogoIsoRouteSearch = ReturnType<typeof readLogoIsoRouteSearchFields>;

export type LogoCarpetHoverRouteSearch = ReturnType<typeof readLogoCarpetHoverRouteSearchFields>;

export type LogoMengerHoverRouteSearch = ReturnType<typeof readLogoMengerHoverRouteSearchFields>;

export type LogoRouteSearchBuildState = {
  autoRotateEnabled: boolean;
  autoRotationDegreesPerSecond: number;
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
  "rotationSpeed",
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

const LOGO_CARPET_HOVER_ROUTE_SEARCH_PARAM_METADATA = readRouteSearchParamMetadata(
  RouteSearchSchema_logoCarpetHover,
) satisfies RouteSearchParamMetadataByKey<LogoCarpetHoverRouteSearch>;

export const LOGO_CARPET_HOVER_ROUTE_SEARCH_KEYS = keys(
  LOGO_CARPET_HOVER_ROUTE_SEARCH_PARAM_METADATA,
);

export const LOGO_CARPET_HOVER_ROUTE_SEARCH_PARAM_ACCESS = readRouteSearchParamAccess(
  LOGO_CARPET_HOVER_ROUTE_SEARCH_PARAM_METADATA,
);

const LOGO_MENGER_HOVER_ROUTE_SEARCH_PARAM_METADATA = readRouteSearchParamMetadata(
  RouteSearchSchema_logoMengerHover,
) satisfies RouteSearchParamMetadataByKey<LogoMengerHoverRouteSearch>;

export const LOGO_MENGER_HOVER_ROUTE_SEARCH_KEYS = keys(
  LOGO_MENGER_HOVER_ROUTE_SEARCH_PARAM_METADATA,
);

export const LOGO_MENGER_HOVER_ROUTE_SEARCH_PARAM_ACCESS = readRouteSearchParamAccess(
  LOGO_MENGER_HOVER_ROUTE_SEARCH_PARAM_METADATA,
);

const LOGO_ROUTE_PRESENCE_SEARCH_KEYS = readRouteSearchPresenceKeys(
  LOGO_ROUTE_SEARCH_PARAM_METADATA,
);

const LOGO_MENGER_HOVER_ROUTE_PRESENCE_SEARCH_KEYS = readRouteSearchPresenceKeys(
  LOGO_MENGER_HOVER_ROUTE_SEARCH_PARAM_METADATA,
);

function readLogoDepthValueSuggestions(depthMax: number): RouteSearchParamValueSuggestions {
  const cappedDepthMax = Math.min(depthMax, MAX_LOGO_FRACTAL_DEPTH);
  const deeperValues: string[] = [];
  for (let depth = 2; depth <= cappedDepthMax; depth += 1) {
    deeperValues.push(`${depth}`);
  }

  return ["1", ...deeperValues];
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

export const LOGO_CARPET_HOVER_ROUTE_SEARCH_PARAM_SUGGESTIONS =
  readLogoRouteSearchParamSuggestionsWithDepthMax(
    LOGO_CARPET_HOVER_ROUTE_SEARCH_PARAM_METADATA,
    SIERPINSKI_CARPET_HOVER_MAX_DEPTH,
  );

export const LOGO_MENGER_HOVER_ROUTE_SEARCH_PARAM_SUGGESTIONS =
  readLogoRouteSearchParamSuggestionsWithDepthMax(
    LOGO_MENGER_HOVER_ROUTE_SEARCH_PARAM_METADATA,
    MENGER_TYPE_GPU_MAXIMUM_DEPTH,
  );

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
The /logo/hover/carpet route validator: parses the carpet schema and bakes in
the carpet model's depth-six enumeration cap, mirroring the iso validator.
*/
export function validateLogoCarpetHoverRouteSearch(
  search: Record<string, unknown>,
): LogoCarpetHoverRouteSearch {
  const presenceNormalizedSearch = normalizeRouteSearchPresenceFlags(
    search,
    LOGO_ROUTE_PRESENCE_SEARCH_KEYS,
  );
  const parsedSearch = readLogoCarpetHoverRouteSearchFields(
    RouteSearchSchema_logoCarpetHover.parse(presenceNormalizedSearch),
  );
  if (
    typeof parsedSearch.depth !== "number" ||
    parsedSearch.depth <= SIERPINSKI_CARPET_HOVER_MAX_DEPTH
  ) {
    return parsedSearch;
  }

  return {
    ...parsedSearch,
    depth: SIERPINSKI_CARPET_HOVER_MAX_DEPTH,
  };
}

export function validateLogoMengerHoverRouteSearch(
  search: Record<string, unknown>,
): LogoMengerHoverRouteSearch {
  const presenceNormalizedSearch = normalizeRouteSearchPresenceFlags(
    search,
    LOGO_MENGER_HOVER_ROUTE_PRESENCE_SEARCH_KEYS,
  );
  const parsedSearch = readLogoMengerHoverRouteSearchFields(
    RouteSearchSchema_logoMengerHover.parse(presenceNormalizedSearch),
  );
  const maximumDepth = parsedSearch.three ? MENGER_HOVER_MAX_DEPTH : MENGER_TYPE_GPU_MAXIMUM_DEPTH;
  if (typeof parsedSearch.depth !== "number" || parsedSearch.depth <= maximumDepth) {
    return parsedSearch;
  }

  return {
    ...parsedSearch,
    depth: maximumDepth,
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
  const autoRotationDegreesPerSecond = normalizeLogoAutoRotateDegreesPerSecond(
    args.autoRotationDegreesPerSecond,
  );
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
    rotationSpeed:
      autoRotationDegreesPerSecond !== LOGO_AUTO_ROTATE_SPEED.defaultValue
        ? Number(autoRotationDegreesPerSecond.toFixed(3))
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

export function buildLogoCarpetHoverRouteSearch(
  args: LogoRouteSearchBuildState & {
    carpetMechanic: SierpinskiCarpetHoverMechanic;
    carpetRevealDepth: SierpinskiCarpetHoverDepth;
    carpetRevealRadius: number;
    themeModeSearch?: RootThemeModeSearch;
  },
): LogoCarpetHoverRouteSearch {
  const revealRadius = normalizeSierpinskiCarpetHoverRevealRadius(args.carpetRevealRadius);
  const defaultMechanic = args.autoShuffleEnabled
    ? LOGO_CARPET_SHUFFLE_DEFAULT_MECHANIC
    : SIERPINSKI_CARPET_HOVER_DEFAULT_MECHANIC;

  return {
    ...buildLogoRouteSearch(args),
    // Default-valued carpet controls use own undefined tombstones like the
    // shared build. The shared depth key carries the carpet reveal depth, so
    // its tombstone compares against the carpet default instead of the shared
    // fractal-depth default.
    depth:
      args.carpetRevealDepth !== SIERPINSKI_CARPET_HOVER_DEFAULT_DEPTH
        ? args.carpetRevealDepth
        : undefined,
    mechanic: args.carpetMechanic !== defaultMechanic ? args.carpetMechanic : undefined,
    radius:
      revealRadius !== SIERPINSKI_CARPET_HOVER_DEFAULT_REVEAL_RADIUS ? revealRadius : undefined,
  };
}

export function buildLogoMengerHoverRouteSearch(
  args: LogoRouteSearchBuildState & {
    mengerAutomaticProbe: MengerAutomaticProbeSettings;
    mengerHoverDepth: number;
    mengerHoverRenderer: MengerHoverRenderer;
    mengerHoverResolutionScale: number;
    mengerHoverTiltEnabled: boolean;
    mengerHoverTiltRadiusScale: number;
    mengerHoverTiltStrengthScale: number;
    themeModeSearch?: RootThemeModeSearch;
  },
): LogoMengerHoverRouteSearch {
  const depth =
    args.mengerHoverRenderer === "three"
      ? clampLogoFractalDepthForRenderer(args.mengerHoverDepth, "three")
      : normalizeMengerTypeGpuDepth(args.mengerHoverDepth);
  const resolutionScale = normalizeMengerTypeGpuResolutionScale(args.mengerHoverResolutionScale);
  const tiltRadiusScale = normalizeLogoPresentationTiltRadiusScale(args.mengerHoverTiltRadiusScale);
  const tiltStrengthScale = normalizeLogoPresentationTiltStrengthScale(
    args.mengerHoverTiltStrengthScale,
  );

  return {
    ...buildLogoRouteSearch(args),
    depth: depth !== MENGER_HOVER_DEFAULT_DEPTH ? depth : undefined,
    resolution:
      resolutionScale !== MENGER_TYPE_GPU_DEFAULT_RESOLUTION_SCALE ? resolutionScale : undefined,
    three: args.mengerHoverRenderer === "three" ? true : undefined,
    probe:
      args.mengerAutomaticProbe.enabled !== MENGER_AUTOMATIC_PROBE_DEFAULT_SETTINGS.enabled &&
      args.mengerAutomaticProbe.enabled
        ? true
        : undefined,
    probeDisabled:
      args.mengerAutomaticProbe.enabled !== MENGER_AUTOMATIC_PROBE_DEFAULT_SETTINGS.enabled &&
      !args.mengerAutomaticProbe.enabled
        ? true
        : undefined,
    probeHeight:
      args.mengerAutomaticProbe.height !== MENGER_AUTOMATIC_PROBE_DEFAULT_HEIGHT
        ? normalizeMengerAutomaticProbeExtent(args.mengerAutomaticProbe.height)
        : undefined,
    probeLanding:
      args.mengerAutomaticProbe.landingSize !==
        MENGER_AUTOMATIC_PROBE_DEFAULT_SETTINGS.landingSize && args.mengerAutomaticProbe.landingSize
        ? true
        : undefined,
    probeLandingOff:
      args.mengerAutomaticProbe.landingSize !==
        MENGER_AUTOMATIC_PROBE_DEFAULT_SETTINGS.landingSize &&
      !args.mengerAutomaticProbe.landingSize
        ? true
        : undefined,
    probeLoop:
      args.mengerAutomaticProbe.loopDurationSeconds !==
      MENGER_AUTOMATIC_PROBE_DEFAULT_LOOP_DURATION_SECONDS
        ? normalizeMengerAutomaticProbeLoopDurationSeconds(
            args.mengerAutomaticProbe.loopDurationSeconds,
          )
        : undefined,
    probePath:
      args.mengerAutomaticProbe.path !== MENGER_AUTOMATIC_PROBE_DEFAULT_PATH
        ? args.mengerAutomaticProbe.path
        : undefined,
    probePathVisible:
      args.mengerAutomaticProbe.showPath !== MENGER_AUTOMATIC_PROBE_DEFAULT_SETTINGS.showPath &&
      args.mengerAutomaticProbe.showPath
        ? true
        : undefined,
    probePathHidden:
      args.mengerAutomaticProbe.showPath !== MENGER_AUTOMATIC_PROBE_DEFAULT_SETTINGS.showPath &&
      !args.mengerAutomaticProbe.showPath
        ? true
        : undefined,
    probeOffset:
      args.mengerAutomaticProbe.verticalOffset !== MENGER_AUTOMATIC_PROBE_DEFAULT_VERTICAL_OFFSET
        ? normalizeMengerAutomaticProbeVerticalOffset(args.mengerAutomaticProbe.verticalOffset)
        : undefined,
    probeRest:
      args.mengerAutomaticProbe.restDurationSeconds !==
      MENGER_AUTOMATIC_PROBE_DEFAULT_REST_DURATION_SECONDS
        ? normalizeMengerAutomaticProbeRestDurationSeconds(
            args.mengerAutomaticProbe.restDurationSeconds,
          )
        : undefined,
    probeStart:
      args.mengerAutomaticProbe.startProgress !== MENGER_AUTOMATIC_PROBE_DEFAULT_START_PROGRESS
        ? normalizeMengerAutomaticProbeStartProgress(args.mengerAutomaticProbe.startProgress)
        : undefined,
    probeWidth:
      args.mengerAutomaticProbe.width !== MENGER_AUTOMATIC_PROBE_DEFAULT_WIDTH
        ? normalizeMengerAutomaticProbeExtent(args.mengerAutomaticProbe.width)
        : undefined,
    tilt: args.mengerHoverTiltEnabled ? true : undefined,
    tiltRadius:
      tiltRadiusScale !== LOGO_PRESENTATION_TILT_DEFAULT_RADIUS_SCALE ? tiltRadiusScale : undefined,
    tiltStrength:
      tiltStrengthScale !== LOGO_PRESENTATION_TILT_DEFAULT_STRENGTH_SCALE
        ? tiltStrengthScale
        : undefined,
  };
}

/**
 * Logo control updates rebuild route state; keep the public dev flag only while
 * the operator has that root shell mode enabled.
 */
export function preserveLogoRouteDevModeSearch<Search extends LogoRouteSearch>(
  nextSearch: Search,
  currentSearch: Search,
): Search {
  if (!currentSearch.dev) {
    return nextSearch;
  }

  return {
    ...nextSearch,
    dev: true as const,
  };
}
