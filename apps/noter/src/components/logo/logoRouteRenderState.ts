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
  DEFAULT_LOGO_PREVIEW_ZOOM,
  normalizeLogoPreviewZoom,
} from "@/components/logo/logoPreviewZoom";
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
import { type LogoRouteSearch, type LogoRouteSearchBuildState } from "@/lib/logoRouteSearch";
import { PUBLIC_LANDING_LOGO_VIEW_DRAG_CONFIG } from "@/lib/publicLandingLogo";

export type LogoRouteRenderMode = Exclude<LogoDepthRenderer, "svg">;

export type LogoRouteRenderState = LogoRouteSearchBuildState;

export const DEFAULT_LOGO_ROUTE_VIEW_STATE: LogoViewState = {
  elevationDegrees: DEFAULT_ELEVATION_DEGREES,
  rotationDegrees: DEFAULT_ROTATION_DEGREES,
};

function readRouteGridSize(routeSearch: LogoRouteSearch): LogoGridSize {
  return normalizeLogoGridSize(routeSearch.gridSize);
}

function readRouteVoxelState(routeSearch: LogoRouteSearch, gridSize: LogoGridSize): string {
  const parsedState = parseVoxelState(routeSearch.vox ?? null);
  if (parsedState === null || parsedState.gridSize !== gridSize) {
    return createDefaultVoxelState(gridSize);
  }

  return serializeVoxelState(parsedState.filledVoxels, gridSize);
}

function readRouteIsoStyleId(routeSearch: LogoRouteSearch): LogoIsometricStyleId {
  const isoStyle = routeSearch.isoStyle ?? null;
  if (!isLogoIsometricStyleId(isoStyle)) {
    return DEFAULT_LOGO_ISOMETRIC_STYLE_ID;
  }

  return isoStyle;
}

function readRouteIsoCubeSidePixels(routeSearch: LogoRouteSearch): number {
  if (typeof routeSearch.isoSide !== "number") {
    return DEFAULT_LOGO_ISOMETRIC_CUBE_SIDE_PX;
  }

  return normalizeLogoIsometricCubeSidePixels(routeSearch.isoSide);
}

function readRouteRotationDegrees(
  routeSearch: LogoRouteSearch,
  defaultView: LogoViewState,
): number {
  if (typeof routeSearch.rot !== "number") {
    return defaultView.rotationDegrees;
  }

  return normalizeRotationDegrees(routeSearch.rot);
}

function isLogoRotationAxisMode(value: string | null): value is LogoRotationAxisMode {
  return value === "cube-y" || value === "screen-vertical";
}

function readRouteRotationAxisMode(routeSearch: LogoRouteSearch): LogoRotationAxisMode {
  const value = routeSearch.axis ?? null;
  if (!isLogoRotationAxisMode(value)) {
    return "cube-y";
  }

  return value;
}

function readRouteViewSnapEnabled(routeSearch: LogoRouteSearch, enableViewSnapping: boolean) {
  return enableViewSnapping && !routeSearch.freeView;
}

function hasRouteViewSearch(routeSearch: LogoRouteSearch): boolean {
  return (
    typeof routeSearch.elev === "number" ||
    typeof routeSearch.rot === "number" ||
    routeSearch.freeView === true
  );
}

function readRouteElevationDegrees(
  routeSearch: LogoRouteSearch,
  defaultView: LogoViewState,
): number {
  if (typeof routeSearch.elev !== "number") {
    return defaultView.elevationDegrees;
  }

  return normalizeElevationDegrees(routeSearch.elev);
}

function readRouteDistanceScale(routeSearch: LogoRouteSearch): number {
  if (typeof routeSearch.dist !== "number") {
    return DEFAULT_LOGO_DISTANCE_SCALE;
  }

  return normalizeLogoDistanceScale(routeSearch.dist);
}

function readRouteZoom(routeSearch: LogoRouteSearch): number {
  if (typeof routeSearch.zoom !== "number") {
    return DEFAULT_LOGO_PREVIEW_ZOOM;
  }

  return normalizeLogoPreviewZoom(routeSearch.zoom);
}

function readRouteFractalDepth(
  routeSearch: LogoRouteSearch,
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
  routeSearch: LogoRouteSearch;
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
  routeSearch: LogoRouteSearch;
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
    distanceScale: readRouteDistanceScale(routeSearch),
    elevationDegrees: view.elevationDegrees,
    fractalDepth: readRouteFractalDepth(routeSearch, renderMode),
    gridSize,
    isoCubeSidePixels: readRouteIsoCubeSidePixels(routeSearch),
    isoStyleId: readRouteIsoStyleId(routeSearch),
    leftFaceStyle: normalizeLogoLeftFaceStyle(readLogoLeftFaceStyle(routeSearch)),
    rotationAxisMode: readRouteRotationAxisMode(routeSearch),
    rotationDegrees: view.rotationDegrees,
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
