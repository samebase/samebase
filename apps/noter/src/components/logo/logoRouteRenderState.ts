import {
  DEFAULT_LOGO_ISOMETRIC_STYLE_ID,
  LOGO_ISOMETRIC_CUBE_SIDE_PIXELS,
  isLogoIsometricStyleId,
  normalizeLogoIsometricCubeSidePixels,
  type LogoIsometricStyleId,
} from "@/components/logo/logoIsometricRenderer";
import {
  LOGO_DISTANCE_SCALE,
  normalizeLogoDistanceScale,
} from "@/components/logo/logoDistanceScale";
import {
  DEFAULT_LOGO_SHUFFLE_PARALLEL_MOVES,
  normalizeLogoShuffleParallelMoves,
} from "@/components/logo/logoShuffleAnimation";
import { LOGO_PREVIEW_ZOOM, normalizeLogoPreviewZoom } from "@/components/logo/logoPreviewZoom";
import {
  normalizeLogoLeftFaceStyle,
  readLogoLeftFaceStyle,
} from "@/components/logo/logoLeftFaceStyle";
import {
  clampLogoFractalDepthForRenderer,
  type LogoDepthRenderer,
} from "@/components/logo/logoDepthLimits";
import {
  DEFAULT_ELEVATION_DEGREES,
  DEFAULT_LOGO_FRACTAL_DEPTH,
  DEFAULT_ROTATION_DEGREES,
  createDefaultVoxelState,
  createLogoFractalVoxelGrid,
  normalizeElevationDegrees,
  normalizeLogoGridSize,
  normalizeRotationDegrees,
  parseVoxelState,
  serializeVoxelState,
  type LogoGridSize,
  type LogoVoxelGrid,
} from "@/components/logo/logoVoxelState";
import { type LogoRotationAxisMode } from "@/components/logo/logoRotationMath";
import { resolveLogoViewState, type LogoViewState } from "@/components/logo/logoViewDrag";
import { readLogoThemeColors } from "@/lib/appThemeColorSearch";
import {
  DEFAULT_LOGO_OPACITY,
  normalizeLogoOpacity,
  type LogoIsoRouteSearch,
  type LogoRouteSearchBuildState,
} from "@/routeSearch/logo";
import { PUBLIC_LANDING_LOGO_VIEW_DRAG_CONFIG } from "@/lib/publicLandingLogo";

export type LogoRouteRenderMode = Exclude<LogoDepthRenderer, "svg">;

export type LogoRouteRenderState = LogoRouteSearchBuildState;

export const DEFAULT_LOGO_ROUTE_VIEW_STATE: LogoViewState = {
  elevationDegrees: DEFAULT_ELEVATION_DEGREES,
  rotationDegrees: DEFAULT_ROTATION_DEGREES,
};

function readRouteGridSize(routeSearch: LogoIsoRouteSearch): LogoGridSize {
  return normalizeLogoGridSize(routeSearch.gridSize);
}

function readRouteVoxelState(routeSearch: LogoIsoRouteSearch, gridSize: LogoGridSize): string {
  const parsedState = parseVoxelState(routeSearch.vox ?? null);
  if (parsedState === null || parsedState.gridSize !== gridSize) {
    return createDefaultVoxelState(gridSize);
  }

  return serializeVoxelState(parsedState.filledVoxels, gridSize);
}

function readRouteIsoStyleId(routeSearch: LogoIsoRouteSearch): LogoIsometricStyleId {
  const isoStyle = routeSearch.isoStyle ?? null;
  if (!isLogoIsometricStyleId(isoStyle)) {
    return DEFAULT_LOGO_ISOMETRIC_STYLE_ID;
  }

  return isoStyle;
}

function readRouteIsoCubeSidePixels(routeSearch: LogoIsoRouteSearch): number {
  if (typeof routeSearch.isoSide !== "number") {
    return LOGO_ISOMETRIC_CUBE_SIDE_PIXELS.defaultValue;
  }

  return normalizeLogoIsometricCubeSidePixels(routeSearch.isoSide);
}

function readRouteRotationDegrees(
  routeSearch: LogoIsoRouteSearch,
  defaultView: LogoViewState,
): number {
  if (typeof routeSearch.rot !== "number") {
    return defaultView.rotationDegrees;
  }

  return normalizeRotationDegrees(routeSearch.rot);
}

function isLogoRotationAxisMode(value: string | null) {
  return value === "cube-y" || value === "screen-vertical";
}

function readRouteRotationAxisMode(routeSearch: LogoIsoRouteSearch): LogoRotationAxisMode {
  const value = routeSearch.axis ?? null;
  if (!isLogoRotationAxisMode(value)) {
    return "cube-y";
  }

  return value;
}

function readRouteViewSnapEnabled(routeSearch: LogoIsoRouteSearch, enableViewSnapping: boolean) {
  return enableViewSnapping && !routeSearch.freeView;
}

function hasRouteViewSearch(routeSearch: LogoIsoRouteSearch): boolean {
  return (
    typeof routeSearch.elev === "number" ||
    typeof routeSearch.rot === "number" ||
    routeSearch.freeView === true
  );
}

function readRouteElevationDegrees(
  routeSearch: LogoIsoRouteSearch,
  defaultView: LogoViewState,
): number {
  if (typeof routeSearch.elev !== "number") {
    return defaultView.elevationDegrees;
  }

  return normalizeElevationDegrees(routeSearch.elev);
}

function readRouteDistanceScale(routeSearch: LogoIsoRouteSearch): number {
  if (typeof routeSearch.dist !== "number") {
    return LOGO_DISTANCE_SCALE.defaultValue;
  }

  return normalizeLogoDistanceScale(routeSearch.dist);
}

function readRouteLogoOpacity(routeSearch: LogoIsoRouteSearch): number {
  if (typeof routeSearch.opacity !== "number") {
    return DEFAULT_LOGO_OPACITY;
  }

  return normalizeLogoOpacity(routeSearch.opacity);
}

function readRouteShuffleParallelMoves(routeSearch: LogoIsoRouteSearch) {
  if (typeof routeSearch.shuffleMoves !== "number") {
    return DEFAULT_LOGO_SHUFFLE_PARALLEL_MOVES;
  }

  return normalizeLogoShuffleParallelMoves(routeSearch.shuffleMoves);
}

function readRouteZoom(routeSearch: LogoIsoRouteSearch): number {
  if (typeof routeSearch.zoom !== "number") {
    return LOGO_PREVIEW_ZOOM.defaultValue;
  }

  return normalizeLogoPreviewZoom(routeSearch.zoom);
}

function readRouteFractalDepth(
  routeSearch: LogoIsoRouteSearch,
  renderMode: LogoRouteRenderMode,
): number {
  if (typeof routeSearch.depth !== "number") {
    return DEFAULT_LOGO_FRACTAL_DEPTH;
  }

  return clampLogoFractalDepthForRenderer(routeSearch.depth, renderMode);
}

function readRouteViewState({
  defaultView,
  enableViewSnapping,
  routeSearch,
  snapFallbackView,
}: {
  defaultView: LogoViewState;
  enableViewSnapping: boolean;
  routeSearch: LogoIsoRouteSearch;
  snapFallbackView: boolean;
}): LogoViewState & { viewSnapEnabled: boolean } {
  const viewSnapEnabled = readRouteViewSnapEnabled(routeSearch, enableViewSnapping);
  const hasSearchView = hasRouteViewSearch(routeSearch);
  const fallbackView = hasSearchView ? DEFAULT_LOGO_ROUTE_VIEW_STATE : defaultView;
  const view = {
    elevationDegrees: readRouteElevationDegrees(routeSearch, fallbackView),
    rotationDegrees: readRouteRotationDegrees(routeSearch, fallbackView),
  };

  return {
    ...resolveLogoViewState({
      config:
        viewSnapEnabled && (snapFallbackView || hasSearchView)
          ? PUBLIC_LANDING_LOGO_VIEW_DRAG_CONFIG
          : undefined,
      view,
    }),
    viewSnapEnabled,
  };
}

export function readLogoRouteRenderState({
  defaultView = DEFAULT_LOGO_ROUTE_VIEW_STATE,
  enableViewSnapping = true,
  renderMode = "three",
  routeSearch,
  snapFallbackView = true,
}: {
  defaultView?: LogoViewState;
  enableViewSnapping?: boolean;
  renderMode?: LogoRouteRenderMode;
  routeSearch: LogoIsoRouteSearch;
  snapFallbackView?: boolean;
}): LogoRouteRenderState {
  const view = readRouteViewState({
    defaultView,
    enableViewSnapping,
    routeSearch,
    snapFallbackView,
  });
  const gridSize = readRouteGridSize(routeSearch);
  const voxelState = readRouteVoxelState(routeSearch, gridSize);

  return {
    autoRotateEnabled: routeSearch["auto-rotate"] === true,
    autoShuffleEnabled: routeSearch["auto-shuffle"] === true,
    distanceScale: readRouteDistanceScale(routeSearch),
    elevationDegrees: view.elevationDegrees,
    faceColorAnimationEnabled: routeSearch["animate-colors"] === true,
    fractalDepth: readRouteFractalDepth(routeSearch, renderMode),
    gridSize,
    isoCubeSidePixels: readRouteIsoCubeSidePixels(routeSearch),
    isoStyleId: readRouteIsoStyleId(routeSearch),
    leftFaceStripeAnimationEnabled: routeSearch["animate-stripes"] === true,
    leftFaceStyle: normalizeLogoLeftFaceStyle(readLogoLeftFaceStyle(routeSearch)),
    logoOpacity: readRouteLogoOpacity(routeSearch),
    rotationAxisMode: readRouteRotationAxisMode(routeSearch),
    rotationDegrees: view.rotationDegrees,
    shuffleParallelMoves: readRouteShuffleParallelMoves(routeSearch),
    themeColors: readLogoThemeColors(routeSearch),
    viewSnapEnabled: view.viewSnapEnabled,
    voxelState,
    zoom: readRouteZoom(routeSearch),
  };
}

export function createLogoRouteVoxelGrid(
  routeState: Pick<LogoRouteRenderState, "fractalDepth" | "gridSize" | "voxelState">,
  depth = routeState.fractalDepth,
): LogoVoxelGrid {
  const parsedVoxelState = parseVoxelState(routeState.voxelState);
  const filledVoxels =
    parsedVoxelState && parsedVoxelState.gridSize === routeState.gridSize
      ? parsedVoxelState.filledVoxels
      : undefined;

  return createLogoFractalVoxelGrid({
    depth,
    filledVoxels,
    gridSize: routeState.gridSize,
  });
}
