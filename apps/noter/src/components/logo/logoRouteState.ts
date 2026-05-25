import {
  DEFAULT_LOGO_ISOMETRIC_CUBE_SIDE_PX,
  DEFAULT_LOGO_ISOMETRIC_STYLE_ID,
  isLogoIsometricStyleId,
  normalizeLogoIsometricCubeSidePixels,
  type LogoIsometricStyleId,
} from "@/components/logo/logoIsometricRenderer";
import {
  DEFAULT_LOGO_DISTANCE_SCALE,
  normalizeLogoDistanceScale,
} from "@/components/logo/logoDistanceScale";
import {
  areLogoLeftFaceStylesEqual,
  readLogoLeftFaceStyle,
  type LogoLeftFaceStyle,
} from "@/components/logo/logoLeftFaceStyle";
import {
  clampLogoFractalDepthForRenderer,
  type LogoDepthRenderer,
} from "@/components/logo/logoDepthLimits";
import { readLogoThemeColors } from "@/lib/appThemeColorSearch";
import { PUBLIC_LANDING_LOGO_VIEW_DRAG_CONFIG } from "@/lib/publicLandingLogo";
import {
  buildLogoRouteSearch,
  LOGO_ROUTE_SEARCH_KEYS,
  preserveLogoRouteDevModeSearch,
  type LogoRouteSearch,
} from "@/lib/logoRouteSearch";
import {
  DEFAULT_ELEVATION_DEGREES,
  DEFAULT_LOGO_FRACTAL_DEPTH,
  DEFAULT_ROTATION_DEGREES,
  createDefaultVoxelState,
  normalizeElevationDegrees,
  normalizeLogoGridSize,
  normalizeRotationDegrees,
  parseVoxelState,
  serializeVoxelState,
  type LogoGridSize,
} from "@/components/logo/logoVoxelState";
import { getLogoPresetSelection, type LogoPresetSelection } from "@/components/logo/logoPresets";
import { resolveLogoViewState, type LogoViewState } from "@/components/logo/logoViewDrag";
import { type LogoRotationAxisMode } from "@/components/logo/logoRotationMath";
import { type LogoThemeColors } from "@/components/logo/logoTailwindColors";

export type LogoRouteRenderMode = Exclude<LogoDepthRenderer, "svg">;

const DEFAULT_ROTATION_AXIS_MODE: LogoRotationAxisMode = "cube-y";

export type LogoRouteState = {
  distanceScale: number;
  elevationDegrees: number;
  fractalDepth: number;
  gridSize: LogoGridSize;
  isViewSnapEnabled: boolean;
  isoCubeSidePixels: number;
  isoStyleId: LogoIsometricStyleId;
  leftFaceStyle: LogoLeftFaceStyle;
  rotationAxisMode: LogoRotationAxisMode;
  rotationDegrees: number;
  selectedPresetId: LogoPresetSelection;
  themeColors: LogoThemeColors;
  voxelState: string;
};

export function readLogoRouteGridSize(routeSearch: LogoRouteSearch): LogoGridSize {
  return normalizeLogoGridSize(routeSearch.gridSize);
}

export function readLogoRouteVoxelState(
  routeSearch: LogoRouteSearch,
  gridSize: LogoGridSize,
): string {
  const parsedState = parseVoxelState(routeSearch.vox ?? null);
  if (parsedState === null || parsedState.gridSize !== gridSize) {
    return createDefaultVoxelState(gridSize);
  }

  return serializeVoxelState(parsedState.filledVoxels, gridSize);
}

function readLogoRouteIsoStyleId(routeSearch: LogoRouteSearch): LogoIsometricStyleId {
  const isoStyle = routeSearch.isoStyle ?? null;
  if (!isLogoIsometricStyleId(isoStyle)) {
    return DEFAULT_LOGO_ISOMETRIC_STYLE_ID;
  }

  return isoStyle;
}

function readLogoRouteIsoCubeSidePixels(routeSearch: LogoRouteSearch): number {
  if (typeof routeSearch.isoSide !== "number") {
    return DEFAULT_LOGO_ISOMETRIC_CUBE_SIDE_PX;
  }

  return normalizeLogoIsometricCubeSidePixels(routeSearch.isoSide);
}

function readLogoRouteRotationDegrees(routeSearch: LogoRouteSearch): number {
  if (typeof routeSearch.rot !== "number") {
    return DEFAULT_ROTATION_DEGREES;
  }

  return normalizeRotationDegrees(routeSearch.rot);
}

function isLogoRotationAxisMode(value: string | null): value is LogoRotationAxisMode {
  return value === "cube-y" || value === "screen-vertical";
}

function readLogoRouteRotationAxisMode(routeSearch: LogoRouteSearch): LogoRotationAxisMode {
  const value = routeSearch.axis ?? null;
  if (!isLogoRotationAxisMode(value)) {
    return DEFAULT_ROTATION_AXIS_MODE;
  }

  return value;
}

function readLogoRouteViewSnapEnabled(routeSearch: LogoRouteSearch): boolean {
  return !routeSearch.freeView;
}

export function resolveLogoRouteViewState(
  view: LogoViewState,
  viewSnapEnabled: boolean,
): LogoViewState {
  return resolveLogoViewState({
    config: viewSnapEnabled ? PUBLIC_LANDING_LOGO_VIEW_DRAG_CONFIG : undefined,
    view,
  });
}

function readLogoRouteView(routeSearch: LogoRouteSearch): LogoViewState & {
  viewSnapEnabled: boolean;
} {
  const viewSnapEnabled = readLogoRouteViewSnapEnabled(routeSearch);
  return {
    ...resolveLogoRouteViewState(
      {
        elevationDegrees: readLogoRouteElevationDegrees(routeSearch),
        rotationDegrees: readLogoRouteRotationDegrees(routeSearch),
      },
      viewSnapEnabled,
    ),
    viewSnapEnabled,
  };
}

export function readLogoRouteElevationDegrees(routeSearch: LogoRouteSearch): number {
  if (typeof routeSearch.elev !== "number") {
    return DEFAULT_ELEVATION_DEGREES;
  }

  return normalizeElevationDegrees(routeSearch.elev);
}

export function readLogoRouteDistanceScale(routeSearch: LogoRouteSearch): number {
  if (typeof routeSearch.dist !== "number") {
    return DEFAULT_LOGO_DISTANCE_SCALE;
  }

  return normalizeLogoDistanceScale(routeSearch.dist);
}

export function readLogoRouteFractalDepth(
  routeSearch: LogoRouteSearch,
  renderMode: LogoRouteRenderMode,
): number {
  if (typeof routeSearch.depth !== "number") {
    return DEFAULT_LOGO_FRACTAL_DEPTH;
  }

  return clampLogoFractalDepthForRenderer(routeSearch.depth, renderMode);
}

export function readLogoRouteState(
  routeSearch: LogoRouteSearch,
  renderMode: LogoRouteRenderMode,
): LogoRouteState {
  const view = readLogoRouteView(routeSearch);
  const gridSize = readLogoRouteGridSize(routeSearch);
  const voxelState = readLogoRouteVoxelState(routeSearch, gridSize);

  return {
    distanceScale: readLogoRouteDistanceScale(routeSearch),
    elevationDegrees: view.elevationDegrees,
    fractalDepth: readLogoRouteFractalDepth(routeSearch, renderMode),
    gridSize,
    isViewSnapEnabled: view.viewSnapEnabled,
    isoCubeSidePixels: readLogoRouteIsoCubeSidePixels(routeSearch),
    isoStyleId: readLogoRouteIsoStyleId(routeSearch),
    leftFaceStyle: readLogoLeftFaceStyle(routeSearch),
    rotationAxisMode: readLogoRouteRotationAxisMode(routeSearch),
    rotationDegrees: view.rotationDegrees,
    selectedPresetId: getLogoPresetSelection(voxelState, gridSize),
    themeColors: readLogoThemeColors(routeSearch),
    voxelState,
  };
}

export function areLogoRouteStatesEqual(left: LogoRouteState, right: LogoRouteState): boolean {
  return (
    left.elevationDegrees === right.elevationDegrees &&
    left.distanceScale === right.distanceScale &&
    left.fractalDepth === right.fractalDepth &&
    left.gridSize === right.gridSize &&
    left.isViewSnapEnabled === right.isViewSnapEnabled &&
    left.isoCubeSidePixels === right.isoCubeSidePixels &&
    left.isoStyleId === right.isoStyleId &&
    areLogoLeftFaceStylesEqual(left.leftFaceStyle, right.leftFaceStyle) &&
    left.rotationAxisMode === right.rotationAxisMode &&
    left.rotationDegrees === right.rotationDegrees &&
    left.selectedPresetId === right.selectedPresetId &&
    left.voxelState === right.voxelState &&
    areLogoThemeColorsEqual(left.themeColors, right.themeColors)
  );
}

export function buildLogoRouteStateSearch(
  routeState: LogoRouteState,
  routeSearch: LogoRouteSearch,
  renderMode: LogoRouteRenderMode,
): LogoRouteSearch {
  const resolvedView = resolveLogoRouteViewState(
    {
      elevationDegrees: routeState.elevationDegrees,
      rotationDegrees: routeState.rotationDegrees,
    },
    routeState.isViewSnapEnabled,
  );

  return preserveLogoRouteDevModeSearch(
    buildLogoRouteSearch({
      distanceScale: routeState.distanceScale,
      elevationDegrees: resolvedView.elevationDegrees,
      fractalDepth: clampLogoFractalDepthForRenderer(routeState.fractalDepth, renderMode),
      gridSize: routeState.gridSize,
      isoCubeSidePixels: routeState.isoCubeSidePixels,
      isoStyleId: routeState.isoStyleId,
      leftFaceStyle: routeState.leftFaceStyle,
      rotationAxisMode: routeState.rotationAxisMode,
      rotationDegrees: resolvedView.rotationDegrees,
      themeModeSearch: routeSearch,
      themeColors: routeState.themeColors,
      viewSnapEnabled: routeState.isViewSnapEnabled,
      voxelState: routeState.voxelState,
    }),
    routeSearch,
  );
}

export function applyLogoRouteViewState(
  state: LogoRouteState,
  nextView: LogoViewState,
  options?: { viewSnapEnabled?: boolean },
): LogoRouteState {
  const resolvedView = resolveLogoRouteViewState(
    nextView,
    options?.viewSnapEnabled ?? state.isViewSnapEnabled,
  );

  return {
    ...state,
    elevationDegrees: resolvedView.elevationDegrees,
    rotationDegrees: resolvedView.rotationDegrees,
  };
}

export function readCanonicalLogoRouteSearch(
  routeSearch: LogoRouteSearch,
  renderMode: LogoRouteRenderMode,
): LogoRouteSearch {
  return preserveLogoRouteDevModeSearch(
    buildLogoRouteSearch({
      distanceScale: readLogoRouteDistanceScale(routeSearch),
      elevationDegrees: readLogoRouteElevationDegrees(routeSearch),
      fractalDepth: readLogoRouteFractalDepth(routeSearch, renderMode),
      gridSize: readLogoRouteGridSize(routeSearch),
      isoCubeSidePixels: readLogoRouteIsoCubeSidePixels(routeSearch),
      isoStyleId: readLogoRouteIsoStyleId(routeSearch),
      leftFaceStyle: readLogoLeftFaceStyle(routeSearch),
      rotationAxisMode: readLogoRouteRotationAxisMode(routeSearch),
      rotationDegrees: readLogoRouteRotationDegrees(routeSearch),
      themeModeSearch: routeSearch,
      themeColors: readLogoThemeColors(routeSearch),
      viewSnapEnabled: readLogoRouteViewSnapEnabled(routeSearch),
      voxelState: readLogoRouteVoxelState(routeSearch, readLogoRouteGridSize(routeSearch)),
    }),
    routeSearch,
  );
}

export function areLogoRouteSearchesEqual(left: LogoRouteSearch, right: LogoRouteSearch): boolean {
  return LOGO_ROUTE_SEARCH_KEYS.every((key) => left[key] === right[key]);
}

function areLogoThemeColorsEqual(left: LogoThemeColors, right: LogoThemeColors): boolean {
  return (
    left.background === right.background &&
    left.border === right.border &&
    left.primary === right.primary &&
    left.secondary === right.secondary &&
    left.top === right.top
  );
}
