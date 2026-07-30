import { NLogoScene } from "@/components/logo/NLogoScene";
import { NLogoRasterScene } from "@/components/logo/NLogoRasterScene";
import {
  LOGO_AUTO_ROTATE_SPEED,
  normalizeLogoAutoRotateDegreesPerSecond,
} from "@samebase/logo-model/auto-rotation";
import { type LogoRotationAxisMode } from "@samebase/logo-model/rotation";
import {
  readLogoRouteRenderState,
  type LogoRouteRenderMode,
  type LogoRouteRenderState,
} from "@/components/logo/logoRouteRenderState";
import {
  LOGO_ISO_CUBE_PIXEL_SPRITE_PRESETS,
  applyLogoIsoCubePixelSpritePaint,
  parseLogoIsoCubePixelSpritePattern,
  serializeLogoIsoCubePixelSpritePattern,
  type LogoIsoCubePixelEditKind,
  type LogoIsoCubePixelSprite,
  type LogoIsoCubePixelSpritePaint,
  type LogoIsoCubePixelSpritePreset,
} from "@/components/logo/logoIsoCubePixelSprite";
import {
  LogoIsoCubePixelEditor,
  LogoIsoThumbnail,
  NLogoIsoScene,
} from "@/components/logo/NLogoIsoScene";
import {
  LOGO_ISOMETRIC_CUBE_SIDE_PIXELS,
  LOGO_ISOMETRIC_STYLES,
  getLogoIsometricStyle,
  isLogoIsometricStyleId,
  normalizeLogoIsometricCubeSidePixels,
  type LogoIsometricStyleId,
} from "@/components/logo/logoIsometricRenderer";
import {
  LOGO_DISTANCE_SCALE,
  normalizeLogoDistanceScale,
} from "@/components/logo/logoDistanceScale";
import {
  LOGO_SHUFFLE_PARALLEL_OPTIONS,
  normalizeLogoShuffleParallelMoves,
  type LogoShuffleParallelMoves,
} from "@/components/logo/logoShuffleAnimation";
import { LOGO_PREVIEW_ZOOM, normalizeLogoPreviewZoom } from "@/components/logo/logoPreviewZoom";
import {
  LOGO_LEFT_FACE_STRIPE_BASIS_VALUES,
  LOGO_LEFT_FACE_STRIPE,
  LOGO_SINGLE_COLOR_STRIPED_LEFT_FACE_STYLE,
  areLogoLeftFaceStylesEqual,
  normalizeLogoLeftFaceStyle,
  normalizeLogoLeftFaceStripeAngleDegrees,
  normalizeLogoLeftFaceStripeGap,
  normalizeLogoLeftFaceStripeOffset,
  normalizeLogoLeftFaceStripeWidth,
  type LogoLeftFaceStyle,
  type LogoLeftFaceStyleKind,
  type LogoLeftFaceStripeBasis,
  type LogoStripedLeftFaceStyle,
} from "@samebase/logo-model/left-face-style";
import {
  clampLogoFractalDepthForRenderer,
  getLogoRendererFractalDepthHardMax,
  getLogoRendererFractalDepthSliderMax,
} from "@/components/logo/logoDepthLimits";
import {
  DEFAULT_LOGO_THEME_COLORS,
  LOGO_THEME_COLOR_KEYS,
  RGB_LOGO_THEME_COLORS,
  TAILWIND_COLOR_FAMILIES,
  getTailwindColorHex,
  getTailwindColorFamily,
  getTailwindColorFamilyHex,
  getTailwindColorShade,
  getTailwindColorShades,
  getTailwindColorTokenForSelection,
  isLogoColorToken,
  isTailwindColorToken,
  type LogoColorToken,
  type LogoThemeColorKey,
  type LogoThemeColors,
} from "@/components/logo/logoTailwindColors";
import {
  CUSTOM_LOGO_PRESET_ID,
  LOGO_PRESETS,
  getLogoPreset,
  getLogoPresetSelection,
  type LogoPresetSelection,
} from "@/components/logo/logoPresets";
import { includes } from "@samebase/dependent";
import { AppSelectContent, AppSelectItem } from "@/components/AppSelect";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LogoNumberInput } from "@/components/logo/LogoNumberInput";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectTrigger } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AppWorkspaceRouteChrome } from "@/components/AppWorkspaceShell";
import {
  DEFAULT_ELEVATION_DEGREES,
  DEFAULT_LOGO_FRACTAL_DEPTH,
  DEFAULT_ROTATION_DEGREES,
  MAX_LOGO_GRID_SIZE,
  MAX_ELEVATION_DEGREES,
  MIN_LOGO_GRID_SIZE,
  MIN_LOGO_FRACTAL_DEPTH,
  MIN_ELEVATION_DEGREES,
  applyVoxelEdit,
  createDefaultVoxelState,
  normalizeElevationDegrees,
  normalizeLogoGridSize,
  normalizeRotationDegrees,
  type VoxelEdit,
} from "@samebase/logo-model/voxel";
import { resolveLogoViewState, type LogoViewState } from "@/components/logo/logoViewDrag";
import {
  buildLogoThemeColorSearch,
  syncDocumentThemeColorSearch,
  useResolvedAppThemeColorState,
} from "@/lib/appThemeColorSearch";
import {
  LOGO_ISO_ROUTE_SEARCH_KEYS,
  MAX_LOGO_OPACITY,
  MIN_LOGO_OPACITY,
  buildLogoIsoRouteSearch,
  buildLogoRouteSearch,
  normalizeLogoOpacity,
  preserveLogoRouteDevModeSearch,
  LOGO_OPACITY_STEP,
  type LogoIsoRouteSearch,
} from "@/routeSearch/logo";
import { PUBLIC_LANDING_LOGO_VIEW_DRAG_CONFIG } from "@/lib/publicLandingLogo";
import { usePacedCommittedState } from "@/lib/usePacedCommittedState";
import { cn } from "@/lib/utils";
import { useCreateStore, useSelector } from "@tanstack/react-store";
import { PaletteIcon } from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useCallback,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";

const DEFAULT_ROTATION_AXIS_MODE: LogoRotationAxisMode = "cube-y";
const LOGO_PREVIEW_ROUTE_COMMIT_DEBOUNCE_MS = 150;
const LOGO_DISTANCE_INPUT_DECIMALS = 3;
const ROTATION_AXIS_MODE_LABELS: Record<LogoRotationAxisMode, string> = {
  "cube-y": "Cube axis",
  "screen-vertical": "Vertical",
};
const ROTATION_ANGLE_CONTROL_LABELS: Record<LogoRotationAxisMode, string> = {
  "cube-y": "Yaw",
  "screen-vertical": "Rotation",
};
const ROTATION_AXIS_MODE_OPTIONS = [
  "cube-y",
  "screen-vertical",
] as const satisfies readonly LogoRotationAxisMode[];
const LOGO_CONTROL_STACK_CLASS_NAME = "flex flex-col gap-2";
const LOGO_CONTROL_BUTTON_CLASS_NAME = "min-w-0 flex-[1_0_10rem] rounded-none";
const LOGO_CONTROL_BUTTON_ROW_CLASS_NAME = "flex flex-wrap gap-2";
const LEFT_FACE_STYLE_LABELS: Record<LogoLeftFaceStyleKind, string> = {
  secondary: "Secondary",
  striped: "Stripes",
};
const LEFT_FACE_STYLE_OPTIONS = [
  "secondary",
  "striped",
] as const satisfies readonly LogoLeftFaceStyleKind[];
const LEFT_FACE_STRIPE_BASIS_LABELS: Record<LogoLeftFaceStripeBasis, string> = {
  auto: "Auto",
  horizontal: "Horizontal",
  vertical: "Vertical",
  raw: "Perpendicular",
};
type LogoPreviewRenderMode = LogoRouteRenderMode;
type LogoPreviewPageProps = {
  renderMode?: LogoPreviewRenderMode;
  replaceRouteSearch: (nextSearch: LogoIsoRouteSearch) => void;
  routeSearch: LogoIsoRouteSearch;
};

const THEME_COLOR_LABELS: Record<LogoThemeColorKey, string> = {
  background: "Background",
  border: "Border",
  primary: "Primary",
  secondary: "Secondary",
  top: "Top",
};
const COLOR_SWATCH_SIZE_CLASS_NAMES = {
  default: "h-4 w-4",
  compact: "h-3.5 w-3.5",
} as const;
type ColorSwatchSize = keyof typeof COLOR_SWATCH_SIZE_CLASS_NAMES;

function formatLogoDistanceInput(value: number): string {
  return normalizeLogoDistanceScale(value).toFixed(LOGO_DISTANCE_INPUT_DECIMALS);
}

function preserveLogoNumberInputValue(value: number) {
  return value;
}

function readDefaultStripedLeftFaceStyle(): LogoStripedLeftFaceStyle {
  return {
    ...LOGO_SINGLE_COLOR_STRIPED_LEFT_FACE_STYLE,
  };
}

function readStripedLeftFaceStyle(leftFaceStyle: LogoLeftFaceStyle): LogoStripedLeftFaceStyle {
  return leftFaceStyle.kind === "striped" ? leftFaceStyle : readDefaultStripedLeftFaceStyle();
}

function updateStripedLeftFaceStyle(
  state: LogoPreviewRouteState,
  update: (style: LogoStripedLeftFaceStyle) => LogoStripedLeftFaceStyle,
): LogoPreviewRouteState {
  return {
    ...state,
    leftFaceStyle: normalizeLogoLeftFaceStyle(
      update(readStripedLeftFaceStyle(state.leftFaceStyle)),
    ),
  };
}

function parseShuffleParallelMoves(value: string): LogoShuffleParallelMoves {
  return normalizeLogoShuffleParallelMoves(Number(value));
}

function expandHexColorToken(token: string): string {
  if (!/^#[0-9a-f]{3}$/i.test(token)) {
    return token.toLowerCase();
  }

  const [, red, green, blue] = token;
  return `#${red}${red}${green}${green}${blue}${blue}`.toLowerCase();
}

function readColorInputValue(token: LogoColorToken): string {
  return expandHexColorToken(getTailwindColorHex(token));
}

function ColorSwatch({ color, size = "default" }: { color: string; size?: ColorSwatchSize }) {
  return (
    <span
      aria-hidden="true"
      className={cn("shrink-0 border border-border", COLOR_SWATCH_SIZE_CLASS_NAMES[size])}
      style={{ backgroundColor: color }}
    />
  );
}

function ThemeColorPicker({
  currentToken,
  themeColorKey,
  onCustomColorChange,
  onFamilyChange,
  onShadeChange,
}: {
  currentToken: LogoColorToken;
  themeColorKey: LogoThemeColorKey;
  onCustomColorChange: (themeColorKey: LogoThemeColorKey, nextColor: string) => void;
  onFamilyChange: (themeColorKey: LogoThemeColorKey, nextFamily: string) => void;
  onShadeChange: (themeColorKey: LogoThemeColorKey, nextShade: string) => void;
}) {
  const currentColorHex = getTailwindColorHex(currentToken);
  const colorInputValue = readColorInputValue(currentToken);
  const isTailwindToken = isTailwindColorToken(currentToken);
  const currentFamily = isTailwindToken ? getTailwindColorFamily(currentToken) : null;
  const currentShade = isTailwindToken ? getTailwindColorShade(currentToken) : null;
  const currentLabel = isTailwindToken ? currentToken : colorInputValue;
  const availableShades = currentFamily === null ? [] : getTailwindColorShades(currentFamily);
  const themeColorLabel = THEME_COLOR_LABELS[themeColorKey];

  return (
    <Popover>
      <PopoverTrigger asChild nativeButton>
        <Button
          aria-label={`${themeColorLabel} color picker`}
          className="h-auto w-full justify-between gap-3 rounded-none border-border bg-background px-2 py-2 text-left shadow-none"
          type="button"
          variant="outline"
        >
          <span className="flex min-w-0 items-center gap-2">
            <ColorSwatch color={currentColorHex} />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                {themeColorLabel}
              </span>
              <span className="truncate font-mono text-xs text-foreground">{currentLabel}</span>
            </span>
          </span>
          <PaletteIcon className="size-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="max-h-[min(32rem,calc(100vh-4rem))] w-72 gap-3 overflow-y-auto rounded-none border-border p-3 shadow-md"
        data-testid={`logo-color-picker-${themeColorKey}`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ColorSwatch color={currentColorHex} />
            <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              {themeColorLabel}
            </span>
          </div>
          <span className="truncate font-mono text-xs text-muted-foreground">{currentLabel}</span>
        </div>

        <div className="flex items-center gap-2 border border-border bg-background p-2">
          <Input
            aria-label={`${themeColorLabel} custom color`}
            className="h-10 w-14 shrink-0 cursor-pointer rounded-none border-border bg-background p-1 shadow-none"
            type="color"
            value={colorInputValue}
            onChange={(event) => onCustomColorChange(themeColorKey, event.target.value)}
          />
          <div className="min-w-0">
            <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Custom
            </div>
            <div className="truncate font-mono text-xs text-foreground">{colorInputValue}</div>
          </div>
        </div>

        {currentFamily !== null ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              <span>Tailwind shade</span>
              <span>{currentFamily}</span>
            </div>
            <div className="grid grid-cols-4 gap-1">
              {availableShades.map((shade) => {
                const shadeToken = getTailwindColorTokenForSelection(
                  currentFamily,
                  shade,
                  currentToken,
                );
                const shadeHex = getTailwindColorHex(shadeToken);
                const isSelected = shade === currentShade;

                return (
                  <button
                    key={shade}
                    aria-label={`${currentFamily} ${shade}`}
                    aria-pressed={isSelected}
                    className={cn(
                      "flex h-10 min-w-0 flex-col gap-1 border bg-background p-1 text-[10px] text-muted-foreground",
                      isSelected ? "border-foreground" : "border-border hover:border-foreground/60",
                    )}
                    type="button"
                    onClick={() => onShadeChange(themeColorKey, shade)}
                  >
                    <span
                      aria-hidden="true"
                      className="block h-3 w-full border border-border"
                      style={{ backgroundColor: shadeHex }}
                    />
                    <span className="truncate">{shade}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Tailwind family
          </div>
          <div className="grid grid-cols-2 gap-1">
            {TAILWIND_COLOR_FAMILIES.map((family) => {
              const isSelected = family === currentFamily;

              return (
                <button
                  key={family}
                  aria-label={`${family} family`}
                  aria-pressed={isSelected}
                  className={cn(
                    "flex h-8 min-w-0 items-center gap-2 border bg-background px-2 text-left text-xs text-foreground",
                    isSelected ? "border-foreground" : "border-border hover:border-foreground/60",
                  )}
                  type="button"
                  onClick={() => onFamilyChange(themeColorKey, family)}
                >
                  <ColorSwatch color={getTailwindColorFamilyHex(family)} size="compact" />
                  <span className="truncate">{family}</span>
                </button>
              );
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

type LogoPreviewRouteState = LogoRouteRenderState & {
  selectedPresetId: LogoPresetSelection;
};

type LogoPreviewLocalStoreState = {
  editMode: VoxelEdit["kind"];
  isSceneInteracting: boolean;
  isoCubePixelSpritesByCubeSide: ReadonlyMap<number, LogoIsoCubePixelSprite>;
  isoCubePixelTool: LogoIsoCubePixelEditKind | null;
};

type LogoPreviewState = LogoPreviewRouteState & LogoPreviewLocalStoreState;

function readLogoPreviewRouteState(
  routeSearch: LogoIsoRouteSearch,
  renderMode: LogoPreviewRenderMode,
): LogoPreviewRouteState {
  const routeState = readLogoRouteRenderState({
    renderMode,
    routeSearch,
  });

  return {
    ...routeState,
    selectedPresetId: getLogoPresetSelection(routeState.voxelState, routeState.gridSize),
  };
}

function readLogoPreviewLocalStoreState(): LogoPreviewLocalStoreState {
  return {
    editMode: "add",
    isSceneInteracting: false,
    isoCubePixelSpritesByCubeSide: new Map(),
    isoCubePixelTool: null,
  };
}

function areLogoPreviewRouteStatesEqual(
  left: LogoPreviewRouteState,
  right: LogoPreviewRouteState,
): boolean {
  return (
    left.autoRotateEnabled === right.autoRotateEnabled &&
    left.autoRotationDegreesPerSecond === right.autoRotationDegreesPerSecond &&
    left.autoShuffleEnabled === right.autoShuffleEnabled &&
    left.elevationDegrees === right.elevationDegrees &&
    left.distanceScale === right.distanceScale &&
    left.faceColorAnimationEnabled === right.faceColorAnimationEnabled &&
    left.fractalDepth === right.fractalDepth &&
    left.gridSize === right.gridSize &&
    left.viewSnapEnabled === right.viewSnapEnabled &&
    left.isoCubeSidePixels === right.isoCubeSidePixels &&
    left.isoStyleId === right.isoStyleId &&
    left.leftFaceStripeAnimationEnabled === right.leftFaceStripeAnimationEnabled &&
    areLogoLeftFaceStylesEqual(left.leftFaceStyle, right.leftFaceStyle) &&
    left.logoOpacity === right.logoOpacity &&
    left.rotationAxisMode === right.rotationAxisMode &&
    left.rotationDegrees === right.rotationDegrees &&
    left.selectedPresetId === right.selectedPresetId &&
    left.shuffleParallelMoves === right.shuffleParallelMoves &&
    left.voxelState === right.voxelState &&
    left.zoom === right.zoom &&
    areLogoThemeColorsEqual(left.themeColors, right.themeColors)
  );
}

function resolveLogoPreviewViewState(view: LogoViewState, viewSnapEnabled: boolean): LogoViewState {
  return resolveLogoViewState({
    config: viewSnapEnabled ? PUBLIC_LANDING_LOGO_VIEW_DRAG_CONFIG : undefined,
    view,
  });
}

function buildLogoPreviewRouteSearch(
  routeState: LogoRouteRenderState,
  routeSearch: LogoIsoRouteSearch,
  renderMode: LogoPreviewRenderMode,
): LogoIsoRouteSearch {
  const resolvedView = resolveLogoPreviewViewState(
    {
      elevationDegrees: routeState.elevationDegrees,
      rotationDegrees: routeState.rotationDegrees,
    },
    routeState.viewSnapEnabled,
  );

  const buildArgs = {
    ...routeState,
    elevationDegrees: resolvedView.elevationDegrees,
    fractalDepth: clampLogoFractalDepthForRenderer(routeState.fractalDepth, renderMode),
    rotationDegrees: resolvedView.rotationDegrees,
    themeModeSearch: routeSearch,
  };

  return preserveLogoRouteDevModeSearch(
    // Only /logo/iso owns the iso params; other renderers must not write them.
    renderMode === "iso" ? buildLogoIsoRouteSearch(buildArgs) : buildLogoRouteSearch(buildArgs),
    routeSearch,
  );
}

function replaceLogoPreviewRouteSearch({
  replaceRouteSearch,
  routeSearch,
  routeState,
  renderMode,
}: {
  replaceRouteSearch: LogoPreviewPageProps["replaceRouteSearch"];
  routeSearch: LogoIsoRouteSearch;
  routeState: LogoPreviewRouteState;
  renderMode: LogoPreviewRenderMode;
}) {
  const nextSearch = buildLogoPreviewRouteSearch(routeState, routeSearch, renderMode);

  if (
    !areLogoRouteSearchesEqual(nextSearch, readCanonicalLogoRouteSearch(routeSearch, renderMode))
  ) {
    replaceRouteSearch(nextSearch);
  }
}

function applyLogoPreviewViewState(
  state: LogoPreviewRouteState,
  nextView: LogoViewState,
  options?: { viewSnapEnabled?: boolean },
): LogoPreviewRouteState {
  const resolvedView = resolveLogoPreviewViewState(
    nextView,
    options?.viewSnapEnabled ?? state.viewSnapEnabled,
  );

  return {
    ...state,
    elevationDegrees: resolvedView.elevationDegrees,
    rotationDegrees: resolvedView.rotationDegrees,
  };
}

function useLogoPreviewStore() {
  return useCreateStore(readLogoPreviewLocalStoreState(), ({ setState }) => ({
    setEditMode: (editMode: VoxelEdit["kind"]) => {
      setState((state) => ({
        ...state,
        editMode,
      }));
    },
    clearIsoCubePixelSprite: (cubeSidePixels: number) => {
      setState((state) => {
        if (!state.isoCubePixelSpritesByCubeSide.has(cubeSidePixels)) {
          return state;
        }

        const isoCubePixelSpritesByCubeSide = new Map(state.isoCubePixelSpritesByCubeSide);
        isoCubePixelSpritesByCubeSide.delete(cubeSidePixels);
        return {
          ...state,
          isoCubePixelSpritesByCubeSide,
        };
      });
    },
    setIsoCubePixelSprite: (
      cubeSidePixels: number,
      isoCubePixelSprite: LogoIsoCubePixelSprite | undefined,
    ) => {
      setState((state) => {
        const currentSprite = state.isoCubePixelSpritesByCubeSide.get(cubeSidePixels);
        if (currentSprite === isoCubePixelSprite) {
          return state;
        }

        const isoCubePixelSpritesByCubeSide = new Map(state.isoCubePixelSpritesByCubeSide);
        if (isoCubePixelSprite) {
          isoCubePixelSpritesByCubeSide.set(cubeSidePixels, isoCubePixelSprite);
        } else {
          isoCubePixelSpritesByCubeSide.delete(cubeSidePixels);
        }
        return {
          ...state,
          isoCubePixelSpritesByCubeSide,
        };
      });
    },
    paintIsoCubePixelSprite: (paint: LogoIsoCubePixelSpritePaint) => {
      setState((state) => {
        const currentSprite = state.isoCubePixelSpritesByCubeSide.get(paint.cubeSidePixels);
        const nextSprite = applyLogoIsoCubePixelSpritePaint(currentSprite, paint);
        if (nextSprite === currentSprite) {
          return state;
        }

        const isoCubePixelSpritesByCubeSide = new Map(state.isoCubePixelSpritesByCubeSide);
        if (nextSprite) {
          isoCubePixelSpritesByCubeSide.set(paint.cubeSidePixels, nextSprite);
        } else {
          isoCubePixelSpritesByCubeSide.delete(paint.cubeSidePixels);
        }

        return {
          ...state,
          isoCubePixelSpritesByCubeSide,
        };
      });
    },
    setIsoCubePixelTool: (isoCubePixelTool: LogoIsoCubePixelEditKind | null) => {
      setState((state) => ({
        ...state,
        isoCubePixelTool,
      }));
    },
    setSceneInteracting: (isSceneInteracting: boolean) => {
      setState((state) => ({
        ...state,
        isSceneInteracting,
      }));
    },
  }));
}

/**
 * Builds the React controller that combines local store actions with
 * route-owned logo state.
 *
 * `routeSearch` is the committed source for shareable view, shape, and color
 * state; `replaceRouteSearch` writes those changes back to TanStack Router.
 * The TanStack Store created here owns local-only controls such as edit mode,
 * animation toggles, opacity, and pane selection. Route writes go through
 * `usePacedCommittedState` so sliders and dragging can update the UI
 * immediately while noisy URL commits are debounced or flushed on end.
 * The Three scene reports its live auto-rotation through a ref so animation
 * frames do not schedule React renders.
 * The returned `controls` are React-bound controller callbacks, not pure
 * TanStack Store actions.
 */
function useLogoPreviewController({
  autoRotatedViewRef,
  replaceRouteSearch,
  renderMode,
  routeSearch,
}: {
  autoRotatedViewRef: { current: LogoViewState | null };
  replaceRouteSearch: LogoPreviewPageProps["replaceRouteSearch"];
  renderMode: LogoPreviewRenderMode;
  routeSearch: LogoIsoRouteSearch;
}) {
  const store = useLogoPreviewStore();
  const localState = useSelector(store);
  const routeState = useMemo(
    () => readLogoPreviewRouteState(routeSearch, renderMode),
    [renderMode, routeSearch],
  );
  const routeSearchRef = useRef(routeSearch);
  routeSearchRef.current = routeSearch;
  const pacedRouteState = usePacedCommittedState({
    committed: routeState,
    commit: (nextRouteState) => {
      const latestRouteSearch = routeSearchRef.current;
      replaceLogoPreviewRouteSearch({
        replaceRouteSearch,
        renderMode,
        routeSearch: latestRouteSearch,
        routeState: nextRouteState,
      });
    },
    equals: areLogoPreviewRouteStatesEqual,
    wait: LOGO_PREVIEW_ROUTE_COMMIT_DEBOUNCE_MS,
  });
  const state: LogoPreviewState = {
    ...pacedRouteState.value,
    ...localState,
  };
  const updateRouteState = (
    updater: (currentState: LogoPreviewRouteState) => LogoPreviewRouteState,
  ) => {
    const autoRotatedView = autoRotatedViewRef.current;
    const currentState =
      pacedRouteState.value.autoRotateEnabled && autoRotatedView !== null
        ? {
            ...pacedRouteState.value,
            elevationDegrees: autoRotatedView.elevationDegrees,
            rotationDegrees: autoRotatedView.rotationDegrees,
          }
        : pacedRouteState.value;
    return updater(currentState);
  };
  const commitRouteState = (
    updater: (currentState: LogoPreviewRouteState) => LogoPreviewRouteState,
  ) => {
    pacedRouteState.commitValue(updateRouteState(updater));
  };
  const debounceRouteState = (
    updater: (currentState: LogoPreviewRouteState) => LogoPreviewRouteState,
  ) => {
    pacedRouteState.debounceValue(updateRouteState(updater));
  };
  const setRouteStateDraft = (
    updater: (currentState: LogoPreviewRouteState) => LogoPreviewRouteState,
  ) => {
    pacedRouteState.setDraftValue(updateRouteState(updater));
  };

  return {
    controls: {
      applyPreset: (presetId: Exclude<LogoPresetSelection, "custom">) => {
        const preset = getLogoPreset(presetId);
        commitRouteState((currentState) => ({
          ...currentState,
          autoRotateEnabled: false,
          autoShuffleEnabled: false,
          gridSize: preset.gridSize,
          selectedPresetId: presetId,
          voxelState: preset.voxelState,
        }));
      },
      applyViewState: (nextView: LogoViewState, options?: { viewSnapEnabled?: boolean }) => {
        setRouteStateDraft((currentState) =>
          applyLogoPreviewViewState(currentState, nextView, options),
        );
      },
      editVoxel: (edit: VoxelEdit) => {
        commitRouteState((currentState) => {
          const voxelState = applyVoxelEdit(currentState.voxelState, currentState.gridSize, edit);

          return {
            ...currentState,
            autoShuffleEnabled: false,
            selectedPresetId: getLogoPresetSelection(voxelState, currentState.gridSize),
            voxelState,
          };
        });
      },
      applyIsoCubePixelSpritePreset: (preset: LogoIsoCubePixelSpritePreset) => {
        store.actions.setIsoCubePixelTool(null);
        store.actions.setIsoCubePixelSprite(preset.cubeSidePixels, preset.sprite);
        commitRouteState((currentState) => ({
          ...currentState,
          isoCubeSidePixels: preset.cubeSidePixels,
        }));
      },
      clearIsoCubePixelSprite: store.actions.clearIsoCubePixelSprite,
      endSceneInteraction: () => {
        store.actions.setSceneInteracting(false);
        pacedRouteState.commitCurrent();
      },
      paintIsoCubePixelSprite: store.actions.paintIsoCubePixelSprite,
      resetView: () => {
        commitRouteState((currentState) => ({
          ...applyLogoPreviewViewState(currentState, {
            elevationDegrees: DEFAULT_ELEVATION_DEGREES,
            rotationDegrees: DEFAULT_ROTATION_DEGREES,
          }),
          autoRotateEnabled: false,
          distanceScale: LOGO_DISTANCE_SCALE.defaultValue,
          rotationAxisMode: DEFAULT_ROTATION_AXIS_MODE,
          zoom: LOGO_PREVIEW_ZOOM.defaultValue,
        }));
      },
      resetShape: () => {
        commitRouteState((currentState) => {
          const voxelState = createDefaultVoxelState(currentState.gridSize);

          return {
            ...currentState,
            autoRotateEnabled: false,
            autoShuffleEnabled: false,
            selectedPresetId: getLogoPresetSelection(voxelState, currentState.gridSize),
            voxelState,
          };
        });
      },
      rotateByDegrees: (deltaDegrees: number) => {
        commitRouteState((currentState) =>
          applyLogoPreviewViewState(currentState, {
            elevationDegrees: currentState.elevationDegrees,
            rotationDegrees: normalizeRotationDegrees(currentState.rotationDegrees + deltaDegrees),
          }),
        );
      },
      setAutoRotating: (autoRotateEnabled: boolean) => {
        if (autoRotateEnabled) {
          autoRotatedViewRef.current = null;
          pacedRouteState.cancelCommit();
        }

        commitRouteState((currentState) => ({
          ...currentState,
          autoRotateEnabled,
        }));
        if (!autoRotateEnabled) {
          autoRotatedViewRef.current = null;
        }
      },
      setEditMode: (editMode: VoxelEdit["kind"]) => {
        store.actions.setIsoCubePixelTool(null);
        store.actions.setEditMode(editMode);
      },
      setElevationDegrees: (elevationDegrees: number) => {
        debounceRouteState((currentState) =>
          applyLogoPreviewViewState(
            {
              ...currentState,
              autoRotateEnabled: false,
            },
            {
              elevationDegrees: normalizeElevationDegrees(elevationDegrees),
              rotationDegrees: currentState.rotationDegrees,
            },
          ),
        );
      },
      setFaceColorAnimationEnabled: (faceColorAnimationEnabled: boolean) => {
        commitRouteState((currentState) => ({
          ...currentState,
          faceColorAnimationEnabled,
        }));
      },
      setDistanceScale: (distanceScale: number) => {
        debounceRouteState((currentState) => ({
          ...currentState,
          distanceScale: normalizeLogoDistanceScale(distanceScale),
        }));
      },
      setFractalDepth: (fractalDepth: number) => {
        const nextFractalDepth = clampLogoFractalDepthForRenderer(fractalDepth, renderMode);
        commitRouteState((currentState) => ({
          ...currentState,
          fractalDepth: nextFractalDepth,
        }));
      },
      setGridSize: (gridSize: number) => {
        const normalizedGridSize = normalizeLogoGridSize(gridSize);
        const voxelState = createDefaultVoxelState(normalizedGridSize);
        commitRouteState((currentState) => ({
          ...currentState,
          autoRotateEnabled: false,
          autoShuffleEnabled: false,
          gridSize: normalizedGridSize,
          selectedPresetId: getLogoPresetSelection(voxelState, normalizedGridSize),
          voxelState,
        }));
      },
      setIsoCubeSidePixels: (isoCubeSidePixels: number) => {
        debounceRouteState((currentState) => ({
          ...currentState,
          isoCubeSidePixels: normalizeLogoIsometricCubeSidePixels(isoCubeSidePixels),
        }));
      },
      setIsoStyleId: (isoStyleId: LogoIsometricStyleId) => {
        commitRouteState((currentState) => ({
          ...currentState,
          isoStyleId,
        }));
      },
      setIsoCubePixelTool: (isoCubePixelTool: LogoIsoCubePixelEditKind | null) => {
        if (isoCubePixelTool) {
          commitRouteState((currentState) => ({
            ...currentState,
            autoShuffleEnabled: false,
          }));
        }
        store.actions.setIsoCubePixelTool(isoCubePixelTool);
      },
      setIsoCubePixelSprite: store.actions.setIsoCubePixelSprite,
      setLeftFaceStyleKind: (kind: LogoLeftFaceStyleKind) => {
        commitRouteState((currentState) => {
          if (kind === "secondary") {
            return {
              ...currentState,
              leftFaceStyle: { kind: "secondary" },
            };
          }

          return {
            ...currentState,
            leftFaceStyle:
              currentState.leftFaceStyle.kind === "striped"
                ? currentState.leftFaceStyle
                : readDefaultStripedLeftFaceStyle(),
          };
        });
      },
      setLeftFaceStripeAnimationEnabled: (leftFaceStripeAnimationEnabled: boolean) => {
        commitRouteState((currentState) => ({
          ...currentState,
          leftFaceStripeAnimationEnabled,
        }));
      },
      setLeftFaceStripeAngleDegrees: (stripeAngleDegrees: number) => {
        debounceRouteState((currentState) =>
          updateStripedLeftFaceStyle(currentState, (style) => ({
            ...style,
            stripeAngleDegrees: normalizeLogoLeftFaceStripeAngleDegrees(stripeAngleDegrees),
          })),
        );
      },
      setLeftFaceStripeBasis: (stripeBasis: LogoLeftFaceStripeBasis) => {
        commitRouteState((currentState) =>
          updateStripedLeftFaceStyle(currentState, (style) => ({
            ...style,
            stripeBasis,
          })),
        );
      },
      setLeftFaceStripeGap: (stripeGap: number) => {
        debounceRouteState((currentState) =>
          updateStripedLeftFaceStyle(currentState, (style) => {
            const normalizedGap = normalizeLogoLeftFaceStripeGap(stripeGap);

            return {
              ...style,
              stripeGap: normalizedGap,
              stripeWidth: style.stripeGapLinked ? normalizedGap : style.stripeWidth,
            };
          }),
        );
      },
      setLeftFaceStripeGapLinked: (stripeGapLinked: boolean) => {
        commitRouteState((currentState) =>
          updateStripedLeftFaceStyle(currentState, (style) => ({
            ...style,
            stripeGap: stripeGapLinked ? style.stripeWidth : style.stripeGap,
            stripeGapLinked,
          })),
        );
      },
      setLeftFaceStripeOffset: (stripeOffset: number) => {
        debounceRouteState((currentState) =>
          updateStripedLeftFaceStyle(currentState, (style) => ({
            ...style,
            stripeOffset: normalizeLogoLeftFaceStripeOffset(stripeOffset),
          })),
        );
      },
      setLeftFaceStripeWidth: (stripeWidth: number) => {
        debounceRouteState((currentState) =>
          updateStripedLeftFaceStyle(currentState, (style) => {
            const normalizedWidth = normalizeLogoLeftFaceStripeWidth(stripeWidth);

            return {
              ...style,
              stripeGap: style.stripeGapLinked ? normalizedWidth : style.stripeGap,
              stripeWidth: normalizedWidth,
            };
          }),
        );
      },
      setLogoOpacity: (logoOpacity: number) => {
        debounceRouteState((currentState) => ({
          ...currentState,
          logoOpacity: normalizeLogoOpacity(logoOpacity),
        }));
      },
      setPresetToCustom: () => {
        setRouteStateDraft((currentState) => ({
          ...currentState,
          selectedPresetId: CUSTOM_LOGO_PRESET_ID,
        }));
      },
      setRotationAxisMode: (rotationAxisMode: LogoRotationAxisMode) => {
        commitRouteState((currentState) => ({
          ...currentState,
          rotationAxisMode,
        }));
      },
      setRotationDegrees: (rotationDegrees: number) => {
        debounceRouteState((currentState) =>
          applyLogoPreviewViewState(
            {
              ...currentState,
              autoRotateEnabled: false,
            },
            {
              elevationDegrees: currentState.elevationDegrees,
              rotationDegrees: normalizeRotationDegrees(rotationDegrees),
            },
          ),
        );
      },
      setRotationSpeed: (autoRotationDegreesPerSecond: number) => {
        debounceRouteState((currentState) => ({
          ...currentState,
          autoRotationDegreesPerSecond: normalizeLogoAutoRotateDegreesPerSecond(
            autoRotationDegreesPerSecond,
          ),
        }));
      },
      setShuffleEnabled: (autoShuffleEnabled: boolean) => {
        if (autoShuffleEnabled) {
          store.actions.setIsoCubePixelTool(null);
        }
        commitRouteState((currentState) => ({
          ...currentState,
          autoShuffleEnabled,
        }));
      },
      setShuffleParallelMoves: (shuffleParallelMoves: LogoShuffleParallelMoves) => {
        commitRouteState((currentState) => ({
          ...currentState,
          shuffleParallelMoves,
        }));
      },
      setThemeColorFamily: (themeColorKey: LogoThemeColorKey, nextFamily: string) => {
        commitRouteState((currentState) => ({
          ...currentState,
          themeColors: {
            ...currentState.themeColors,
            [themeColorKey]: getTailwindColorTokenForSelection(
              nextFamily,
              getTailwindColorShade(currentState.themeColors[themeColorKey]),
              currentState.themeColors[themeColorKey],
            ),
          },
        }));
      },
      setThemeColorShade: (themeColorKey: LogoThemeColorKey, nextShade: string) => {
        commitRouteState((currentState) => ({
          ...currentState,
          themeColors: {
            ...currentState.themeColors,
            [themeColorKey]: getTailwindColorTokenForSelection(
              getTailwindColorFamily(currentState.themeColors[themeColorKey]),
              nextShade,
              currentState.themeColors[themeColorKey],
            ),
          },
        }));
      },
      setThemeColors: (themeColors: LogoThemeColors) => {
        syncDocumentThemeColorSearch(buildLogoThemeColorSearch(themeColors));
        commitRouteState((currentState) => ({
          ...currentState,
          themeColors,
        }));
      },
      setThemeCustomColor: (themeColorKey: LogoThemeColorKey, nextColor: string) => {
        const normalizedColor = expandHexColorToken(nextColor);
        if (!isLogoColorToken(normalizedColor)) {
          return;
        }

        debounceRouteState((currentState) => ({
          ...currentState,
          themeColors: {
            ...currentState.themeColors,
            [themeColorKey]: normalizedColor,
          },
        }));
      },
      setViewSnapEnabled: (viewSnapEnabled: boolean) => {
        commitRouteState((currentState) => {
          if (!viewSnapEnabled) {
            return {
              ...currentState,
              viewSnapEnabled: false,
            };
          }

          return {
            ...applyLogoPreviewViewState(
              currentState,
              {
                elevationDegrees: currentState.elevationDegrees,
                rotationDegrees: currentState.rotationDegrees,
              },
              { viewSnapEnabled: true },
            ),
            viewSnapEnabled: true,
          };
        });
      },
      setZoom: (zoom: number) => {
        debounceRouteState((currentState) => ({
          ...currentState,
          zoom: normalizeLogoPreviewZoom(zoom),
        }));
      },
      startSceneInteraction: () => {
        pacedRouteState.cancelCommit();
        setRouteStateDraft((currentState) => ({
          ...currentState,
          autoRotateEnabled: false,
        }));
        autoRotatedViewRef.current = null;
        store.actions.setSceneInteracting(true);
      },
    },
    state,
  };
}

const LOGO_PRESET_IDS = LOGO_PRESETS.map((preset) => preset.id);

function isLogoPresetId(value: string) {
  return includes(LOGO_PRESET_IDS, value);
}

function readCanonicalLogoRouteSearch(
  routeSearch: LogoIsoRouteSearch,
  renderMode: LogoPreviewRenderMode,
): LogoIsoRouteSearch {
  return buildLogoPreviewRouteSearch(
    readLogoPreviewRouteState(routeSearch, renderMode),
    routeSearch,
    renderMode,
  );
}

function areLogoRouteSearchesEqual(left: LogoIsoRouteSearch, right: LogoIsoRouteSearch): boolean {
  return LOGO_ISO_ROUTE_SEARCH_KEYS.every((key) => left[key] === right[key]);
}

function areLogoThemeColorsEqual(left: LogoThemeColors, right: LogoThemeColors): boolean {
  return LOGO_THEME_COLOR_KEYS.every((key) => left[key] === right[key]);
}

function LogoPreviewSection({
  children,
  className,
  testId,
  title,
}: {
  children: ReactNode;
  className?: string;
  testId?: string;
  title: string;
}) {
  return (
    <section
      className={cn("flex flex-col gap-2 border-t border-border py-2 first:border-t-0", className)}
      data-testid={testId}
    >
      <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        {title}
      </div>
      {children}
    </section>
  );
}

function LogoIsoCubePixelPatternTextarea({
  cubeSidePixels,
  disabled,
  onSpriteChange,
  sprite,
}: {
  cubeSidePixels: number;
  disabled: boolean;
  onSpriteChange: (sprite: LogoIsoCubePixelSprite | undefined) => void;
  sprite: LogoIsoCubePixelSprite | undefined;
}) {
  const serializedPattern = useMemo(
    () =>
      serializeLogoIsoCubePixelSpritePattern({
        cubeSidePixels,
        sprite,
      }),
    [cubeSidePixels, sprite],
  );
  const [isEditing, setIsEditing] = useState(false);
  const [draftPattern, setDraftPattern] = useState(serializedPattern);
  const previousSerializedPatternRef = useRef(serializedPattern);
  const value = isEditing ? draftPattern : serializedPattern;
  const parsedPattern = useMemo(
    () =>
      parseLogoIsoCubePixelSpritePattern({
        cubeSidePixels,
        pattern: value,
      }),
    [cubeSidePixels, value],
  );
  const textareaRows = serializedPattern.split("\n").length;
  const isInvalid = parsedPattern.kind === "invalid";

  useEffect(() => {
    if (!isEditing) {
      setDraftPattern(serializedPattern);
    }
  }, [isEditing, serializedPattern]);

  // Presets and canvas drawing can replace the sprite while the textarea has
  // a draft; keep that draft only when it already matches the serialized sprite.
  useEffect(() => {
    if (previousSerializedPatternRef.current === serializedPattern) {
      return;
    }

    previousSerializedPatternRef.current = serializedPattern;
    if (draftPattern !== serializedPattern) {
      setIsEditing(false);
      setDraftPattern(serializedPattern);
    }
  }, [draftPattern, serializedPattern]);

  return (
    <div className="w-full">
      <Textarea
        aria-invalid={isInvalid}
        aria-label="Cube pixel pattern"
        autoCapitalize="off"
        autoCorrect="off"
        className="min-h-0 w-full resize-none overflow-hidden rounded-none font-mono leading-4 shadow-none [tab-size:1]"
        disabled={disabled}
        onBlur={() => {
          setIsEditing(false);
          setDraftPattern(serializedPattern);
        }}
        onChange={(event) => {
          const nextPattern = event.target.value;
          setIsEditing(true);
          setDraftPattern(nextPattern);

          const nextParsedPattern = parseLogoIsoCubePixelSpritePattern({
            cubeSidePixels,
            pattern: nextPattern,
          });
          if (nextParsedPattern.kind === "valid") {
            onSpriteChange(nextParsedPattern.sprite);
          }
        }}
        onFocus={() => {
          setIsEditing(true);
          setDraftPattern(serializedPattern);
        }}
        rows={textareaRows}
        spellCheck={false}
        value={value}
        wrap="off"
      />
    </div>
  );
}

function LogoRangeControl({
  formatValue,
  label,
  max,
  min,
  normalizeValue = preserveLogoNumberInputValue,
  onSliderChange,
  onValueChange,
  sliderAriaLabel,
  step,
  value,
  valueAriaLabel,
  valueInputMax,
  valueInputMode = "decimal",
  valueText,
}: {
  formatValue: (value: number) => string;
  label: string;
  max: number | string;
  min: number | string;
  normalizeValue?: (value: number) => number;
  onSliderChange: (value: number) => void;
  onValueChange: (value: number) => void;
  sliderAriaLabel: string;
  step: number | string;
  value: number;
  valueAriaLabel: string;
  valueInputMax?: number | string;
  valueInputMode?: "decimal" | "numeric";
  valueText: string;
}) {
  const normalizedValue = normalizeValue(value);
  const rangeMin = Number(min);
  const rangeMax = Number(max);
  const sliderValue =
    Number.isFinite(rangeMin) && Number.isFinite(rangeMax)
      ? Math.min(Math.max(normalizedValue, rangeMin), rangeMax)
      : normalizedValue;
  const handleSliderChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextValue = Number(event.target.value);
    if (Number.isNaN(nextValue)) {
      return;
    }

    onSliderChange(nextValue);
  };

  return (
    <div className={LOGO_CONTROL_STACK_CLASS_NAME}>
      <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
        <span>{label}</span>
        <span>{valueText}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          aria-label={sliderAriaLabel}
          type="range"
          min={min}
          max={max}
          step={step}
          value={sliderValue}
          onChange={handleSliderChange}
          className="h-2 min-w-40 flex-[999_1_10rem] cursor-pointer accent-[#8a88ac]"
        />
        <div className="ml-auto flex min-w-28 flex-[1_0_7rem] justify-end">
          <LogoNumberInput
            ariaLabel={valueAriaLabel}
            formatValue={formatValue}
            inputMode={valueInputMode}
            min={min}
            max={valueInputMax}
            normalizeValue={normalizeValue}
            onValueChange={onValueChange}
            step={step}
            value={normalizedValue}
            variant="preview"
          />
        </div>
      </div>
    </div>
  );
}

function LogoDistanceScaleControl({
  onValueChange,
  value,
}: {
  onValueChange: (value: number) => void;
  value: number;
}) {
  const normalizedValue = normalizeLogoDistanceScale(value);

  return (
    <div className={LOGO_CONTROL_STACK_CLASS_NAME}>
      <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
        <span>Distance</span>
        <span>{formatLogoDistanceInput(normalizedValue)}x</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          aria-label="Distance slider"
          type="range"
          min={LOGO_DISTANCE_SCALE.min}
          max={LOGO_DISTANCE_SCALE.sliderMax}
          step={LOGO_DISTANCE_SCALE.step}
          value={Math.min(normalizedValue, LOGO_DISTANCE_SCALE.sliderMax)}
          onChange={(event) => {
            const nextValue = Number(event.target.value);
            if (Number.isFinite(nextValue)) {
              onValueChange(nextValue);
            }
          }}
          className="h-2 min-w-40 flex-[999_1_10rem] cursor-pointer accent-[#8a88ac]"
        />
        <div className="ml-auto flex min-w-28 flex-[1_0_7rem] justify-end">
          <LogoNumberInput
            ariaLabel="Distance scale"
            formatValue={formatLogoDistanceInput}
            min={LOGO_DISTANCE_SCALE.min}
            normalizeValue={normalizeLogoDistanceScale}
            onValueChange={onValueChange}
            step={LOGO_DISTANCE_SCALE.step}
            value={normalizedValue}
            variant="preview"
          />
        </div>
      </div>
    </div>
  );
}

export function LogoPreviewPage({
  renderMode = "three",
  replaceRouteSearch,
  routeSearch,
}: LogoPreviewPageProps) {
  const autoRotatedViewRef = useRef<LogoViewState | null>(null);
  const recordAutoRotatedView = useCallback((nextView: LogoViewState) => {
    autoRotatedViewRef.current = nextView;
  }, []);
  const { controls, state } = useLogoPreviewController({
    autoRotatedViewRef,
    replaceRouteSearch,
    renderMode,
    routeSearch,
  });
  const { backgroundColor, faceColors } = useResolvedAppThemeColorState(state.themeColors);
  const viewSnapCheckboxId = useId();
  const faceColorAnimationCheckboxId = useId();
  const stripeGapLinkedCheckboxId = useId();
  const stripeAnimationCheckboxId = useId();
  const autoRotation = useMemo(
    () =>
      state.autoRotateEnabled
        ? {
            degreesPerSecond: state.autoRotationDegreesPerSecond,
            onViewChange: recordAutoRotatedView,
          }
        : undefined,
    [recordAutoRotatedView, state.autoRotateEnabled, state.autoRotationDegreesPerSecond],
  );

  const selectedPreset =
    state.selectedPresetId === CUSTOM_LOGO_PRESET_ID ? null : getLogoPreset(state.selectedPresetId);
  const selectedIsoStyle = getLogoIsometricStyle(state.isoStyleId);
  const fractalDepthHardMax = getLogoRendererFractalDepthHardMax(renderMode);
  const fractalDepthSliderMax = getLogoRendererFractalDepthSliderMax(renderMode);
  const rotationAngleControlLabel = ROTATION_ANGLE_CONTROL_LABELS[state.rotationAxisMode];
  const isRecursiveDepth = state.fractalDepth > DEFAULT_LOGO_FRACTAL_DEPTH;
  const shuffleAnimation = {
    enabled: state.autoShuffleEnabled,
    parallelMoves: state.shuffleParallelMoves,
  };
  const stripedLeftFaceStyle = state.leftFaceStyle.kind === "striped" ? state.leftFaceStyle : null;
  const isoCubePixelSprite = state.isoCubePixelSpritesByCubeSide.get(state.isoCubeSidePixels);
  const isoCubePixelCount = isoCubePixelSprite ? isoCubePixelSprite.pixelKeys.size : 0;
  const matchingIsoCubePixelSpritePresets = LOGO_ISO_CUBE_PIXEL_SPRITE_PRESETS.filter(
    (preset) => preset.cubeSidePixels === state.isoCubeSidePixels,
  );
  const visibleIsoCubePixelSpritePresets =
    matchingIsoCubePixelSpritePresets.length > 0
      ? matchingIsoCubePixelSpritePresets
      : LOGO_ISO_CUBE_PIXEL_SPRITE_PRESETS.filter((preset) => preset.cubeSidePixels === 8);

  const logoScene =
    renderMode === "iso" ? (
      <NLogoIsoScene
        baseGridSize={state.gridSize}
        backgroundColor={backgroundColor}
        className={cn(
          "absolute inset-0 h-full w-full touch-none select-none",
          state.isoCubePixelTool && !isRecursiveDepth ? "cursor-crosshair" : "",
        )}
        cubeSidePixels={state.isoCubeSidePixels}
        editMode={state.editMode}
        faceColors={faceColors}
        fractalDepth={state.fractalDepth}
        isoCubePixelSprite={isoCubePixelSprite}
        isoCubePixelTool={isRecursiveDepth ? null : state.isoCubePixelTool}
        onIsoCubePixelSpritePaint={controls.paintIsoCubePixelSprite}
        onVoxelEdit={controls.editVoxel}
        shuffleAnimation={shuffleAnimation}
        styleId={state.isoStyleId}
        voxelEditingEnabled={!isRecursiveDepth}
        voxelState={state.voxelState}
      />
    ) : renderMode === "raster" ? (
      <NLogoRasterScene
        baseGridSize={state.gridSize}
        backgroundColor={backgroundColor}
        className={cn(
          "absolute inset-0 h-full w-full touch-none select-none",
          state.isSceneInteracting ? "cursor-grabbing" : "cursor-grab",
        )}
        distanceScale={state.distanceScale}
        elevationDegrees={state.elevationDegrees}
        faceColors={faceColors}
        fractalDepth={state.fractalDepth}
        opacity={state.logoOpacity}
        onInteractionStart={controls.startSceneInteraction}
        onInteractionEnd={controls.endSceneInteraction}
        onViewChange={controls.applyViewState}
        rotationAxisMode={state.rotationAxisMode}
        rotationDegrees={state.rotationDegrees}
        shuffleAnimation={shuffleAnimation}
        viewDragConfig={state.viewSnapEnabled ? PUBLIC_LANDING_LOGO_VIEW_DRAG_CONFIG : undefined}
        voxelState={state.voxelState}
      />
    ) : (
      <NLogoScene
        autoRotation={autoRotation}
        baseGridSize={state.gridSize}
        backgroundColor={backgroundColor}
        className={cn(
          "absolute inset-0 h-full w-full touch-none select-none",
          state.isSceneInteracting ? "cursor-grabbing" : "cursor-grab",
        )}
        distanceScale={state.distanceScale}
        editMode={state.editMode}
        elevationDegrees={state.elevationDegrees}
        faceColors={faceColors}
        leftFaceStyle={state.leftFaceStyle}
        opacity={state.logoOpacity}
        onInteractionStart={controls.startSceneInteraction}
        onInteractionEnd={controls.endSceneInteraction}
        onViewChange={controls.applyViewState}
        onVoxelEdit={controls.editVoxel}
        rotationAxisMode={state.rotationAxisMode}
        rotationDegrees={state.rotationDegrees}
        shuffleAnimation={shuffleAnimation}
        animateFaceColors={state.faceColorAnimationEnabled}
        animateLeftFaceStripes={state.leftFaceStripeAnimationEnabled}
        fractalDepth={state.fractalDepth}
        voxelEditingEnabled={!isRecursiveDepth}
        viewDragConfig={state.viewSnapEnabled ? PUBLIC_LANDING_LOGO_VIEW_DRAG_CONFIG : undefined}
        voxelState={state.voxelState}
      />
    );

  const logoSceneSizeContainerPercent = `${(normalizeLogoPreviewZoom(state.zoom) * 100).toFixed(
    2,
  )}`;
  const logoSceneSizeValue = `min(${logoSceneSizeContainerPercent}cqw, ${logoSceneSizeContainerPercent}cqh)`;
  const sceneUsesDefaultBackground =
    state.themeColors.background === DEFAULT_LOGO_THEME_COLORS.background;
  const sceneContent = (
    <div
      data-testid="logo-preview-scene"
      className={cn(
        "flex h-full min-h-0 items-center justify-center @container-[size]",
        sceneUsesDefaultBackground ? "bg-background" : "",
      )}
      style={sceneUsesDefaultBackground ? undefined : { backgroundColor }}
    >
      {/* Keep touch capture square so mobile top/bottom drag lanes stay free. */}
      <div className="relative" style={{ height: logoSceneSizeValue, width: logoSceneSizeValue }}>
        {logoScene}
      </div>
    </div>
  );

  const controlsContent = (
    <div data-testid="logo-preview-controls" className="flex min-h-full flex-col gap-0 px-1 py-2">
      <LogoPreviewSection title="Shape">
        <LogoRangeControl
          formatValue={(value) => Math.round(value).toString()}
          label="Depth"
          max={fractalDepthSliderMax}
          min={MIN_LOGO_FRACTAL_DEPTH}
          normalizeValue={(value) => clampLogoFractalDepthForRenderer(value, renderMode)}
          onSliderChange={controls.setFractalDepth}
          onValueChange={controls.setFractalDepth}
          sliderAriaLabel="Depth slider"
          step="1"
          value={state.fractalDepth}
          valueAriaLabel="Depth value"
          valueInputMax={fractalDepthHardMax}
          valueInputMode="numeric"
          valueText={`${state.fractalDepth}`}
        />

        <div className={LOGO_CONTROL_STACK_CLASS_NAME}>
          <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
            <span>Grid</span>
            <span>
              {state.gridSize}x{state.gridSize}
            </span>
          </div>
          <LogoNumberInput
            ariaLabel="Grid size"
            formatValue={(value) => Math.round(value).toString()}
            inputMode="numeric"
            min={MIN_LOGO_GRID_SIZE}
            max={MAX_LOGO_GRID_SIZE}
            normalizeValue={normalizeLogoGridSize}
            onValueChange={controls.setGridSize}
            step="1"
            value={state.gridSize}
            variant="preview"
          />
        </div>

        <Select
          value={state.selectedPresetId}
          onValueChange={(value) => {
            if (value === CUSTOM_LOGO_PRESET_ID) {
              controls.setPresetToCustom();
              return;
            }

            if (isLogoPresetId(value)) {
              controls.applyPreset(value);
            }
          }}
        >
          <SelectTrigger className="h-9 rounded-none border-border bg-background px-2 text-sm shadow-none">
            {selectedPreset === null ? "Custom" : selectedPreset.label}
          </SelectTrigger>
          <AppSelectContent className="rounded-none border-border">
            <AppSelectItem value={CUSTOM_LOGO_PRESET_ID} className="rounded-none">
              Custom
            </AppSelectItem>
            {LOGO_PRESETS.map((preset) => (
              <AppSelectItem key={preset.id} value={preset.id} className="rounded-none">
                <div className="flex flex-col gap-0.5">
                  <span>{preset.label}</span>
                  <span className="text-xs text-muted-foreground">{preset.description}</span>
                </div>
              </AppSelectItem>
            ))}
          </AppSelectContent>
        </Select>

        {!isRecursiveDepth ? (
          <div className={LOGO_CONTROL_BUTTON_ROW_CLASS_NAME}>
            <Button
              type="button"
              size="sm"
              variant={state.editMode === "add" ? "default" : "outline"}
              className={LOGO_CONTROL_BUTTON_CLASS_NAME}
              aria-pressed={state.editMode === "add"}
              onClick={() => {
                controls.setEditMode("add");
              }}
            >
              Add
            </Button>
            <Button
              type="button"
              size="sm"
              variant={state.editMode === "remove" ? "default" : "outline"}
              className={LOGO_CONTROL_BUTTON_CLASS_NAME}
              aria-pressed={state.editMode === "remove"}
              onClick={() => {
                controls.setEditMode("remove");
              }}
            >
              Remove
            </Button>
          </div>
        ) : null}

        <div className={LOGO_CONTROL_STACK_CLASS_NAME}>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-full rounded-none"
            onClick={() => {
              controls.setThemeColors(DEFAULT_LOGO_THEME_COLORS);
            }}
          >
            Default colors
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-full rounded-none"
            onClick={() => {
              controls.setThemeColors(RGB_LOGO_THEME_COLORS);
            }}
          >
            RGB colors
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-full rounded-none"
            onClick={controls.resetShape}
          >
            Reset shape
          </Button>
        </div>
      </LogoPreviewSection>

      {renderMode === "iso" ? (
        <LogoPreviewSection title="Isometric">
          <div className={LOGO_CONTROL_STACK_CLASS_NAME}>
            <LogoRangeControl
              formatValue={(value) => Math.round(value).toString()}
              label="Cube side"
              max={LOGO_ISOMETRIC_CUBE_SIDE_PIXELS.max}
              min={LOGO_ISOMETRIC_CUBE_SIDE_PIXELS.min}
              normalizeValue={normalizeLogoIsometricCubeSidePixels}
              onSliderChange={controls.setIsoCubeSidePixels}
              onValueChange={controls.setIsoCubeSidePixels}
              sliderAriaLabel="Cube side"
              step={LOGO_ISOMETRIC_CUBE_SIDE_PIXELS.step}
              value={state.isoCubeSidePixels}
              valueAriaLabel="Cube side pixels"
              valueInputMax={LOGO_ISOMETRIC_CUBE_SIDE_PIXELS.max}
              valueInputMode="numeric"
              valueText={`${state.isoCubeSidePixels}px`}
            />
            <div className="text-xs text-muted-foreground">
              {state.isoCubeSidePixels}px edge / {state.isoCubeSidePixels / 2}px rise
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-full rounded-none"
              onClick={() => {
                controls.setIsoCubeSidePixels(LOGO_ISOMETRIC_CUBE_SIDE_PIXELS.defaultValue);
              }}
            >
              Reset size
            </Button>
          </div>

          <div className={LOGO_CONTROL_STACK_CLASS_NAME}>
            <Label className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
              Style
            </Label>
            <Select
              value={state.isoStyleId}
              onValueChange={(value) => {
                if (isLogoIsometricStyleId(value)) {
                  controls.setIsoStyleId(value);
                }
              }}
            >
              <SelectTrigger className="h-9 rounded-none border-border bg-background px-2 text-sm shadow-none">
                {selectedIsoStyle.label}
              </SelectTrigger>
              <AppSelectContent className="rounded-none border-border">
                {LOGO_ISOMETRIC_STYLES.map((style) => (
                  <AppSelectItem key={style.id} value={style.id} className="rounded-none">
                    <div className="flex flex-col gap-0.5">
                      <span>{style.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {style.capWidth}px cap
                        {style.edgeMode === "shaded" ? " + edge" : ""}
                      </span>
                    </div>
                  </AppSelectItem>
                ))}
              </AppSelectContent>
            </Select>
          </div>

          <div className={LOGO_CONTROL_STACK_CLASS_NAME} data-testid="logo-iso-pixel-controls">
            <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
              <span>Pixels</span>
              <span>{isoCubePixelCount}</span>
            </div>
            <div className="flex justify-center border border-border bg-background p-2">
              <LogoIsoCubePixelEditor
                backgroundColor={backgroundColor}
                cubePixelSprite={isoCubePixelSprite}
                cubePixelTool={isRecursiveDepth ? null : state.isoCubePixelTool}
                cubeSidePixels={state.isoCubeSidePixels}
                disabled={isRecursiveDepth}
                faceColors={faceColors}
                onCubePixelSpritePaint={controls.paintIsoCubePixelSprite}
                styleId={state.isoStyleId}
              />
            </div>
            <div className="flex justify-center">
              <LogoIsoCubePixelPatternTextarea
                cubeSidePixels={state.isoCubeSidePixels}
                disabled={isRecursiveDepth}
                onSpriteChange={(sprite) => {
                  controls.setIsoCubePixelSprite(state.isoCubeSidePixels, sprite);
                }}
                sprite={isoCubePixelSprite}
              />
            </div>
            <div className={LOGO_CONTROL_BUTTON_ROW_CLASS_NAME}>
              <Button
                type="button"
                size="sm"
                variant={state.isoCubePixelTool === "draw" ? "default" : "outline"}
                className={LOGO_CONTROL_BUTTON_CLASS_NAME}
                aria-pressed={state.isoCubePixelTool === "draw"}
                disabled={isRecursiveDepth}
                onClick={() => {
                  controls.setIsoCubePixelTool(state.isoCubePixelTool === "draw" ? null : "draw");
                }}
              >
                Draw
              </Button>
              <Button
                type="button"
                size="sm"
                variant={state.isoCubePixelTool === "erase" ? "default" : "outline"}
                className={LOGO_CONTROL_BUTTON_CLASS_NAME}
                aria-pressed={state.isoCubePixelTool === "erase"}
                disabled={isRecursiveDepth}
                onClick={() => {
                  controls.setIsoCubePixelTool(state.isoCubePixelTool === "erase" ? null : "erase");
                }}
              >
                Erase
              </Button>
            </div>
            <div className={LOGO_CONTROL_BUTTON_ROW_CLASS_NAME}>
              {visibleIsoCubePixelSpritePresets.map((preset) => (
                <Button
                  key={`${preset.id}:${preset.cubeSidePixels}`}
                  type="button"
                  size="sm"
                  variant="outline"
                  className={LOGO_CONTROL_BUTTON_CLASS_NAME}
                  disabled={isRecursiveDepth}
                  onClick={() => {
                    controls.applyIsoCubePixelSpritePreset(preset);
                  }}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-full rounded-none"
              disabled={isoCubePixelCount === 0}
              onClick={() => {
                controls.clearIsoCubePixelSprite(state.isoCubeSidePixels);
              }}
            >
              Clear pixels
            </Button>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            {[16, 32, 64].map((size) => (
              <div key={size} className="flex flex-col items-center gap-1">
                <div className="flex min-h-16 min-w-16 items-center justify-center border border-border bg-background p-2">
                  <LogoIsoThumbnail
                    baseGridSize={state.gridSize}
                    backgroundColor={backgroundColor}
                    cubeSidePixels={state.isoCubeSidePixels}
                    faceColors={faceColors}
                    fractalDepth={state.fractalDepth}
                    isoCubePixelSprite={isoCubePixelSprite}
                    size={size}
                    styleId={state.isoStyleId}
                    voxelState={state.voxelState}
                  />
                </div>
                <span className="font-mono text-[10px] text-muted-foreground">{size}px</span>
              </div>
            ))}
          </div>
        </LogoPreviewSection>
      ) : (
        <LogoPreviewSection title="View" testId="logo-preview-view-section">
          <div className="flex items-start gap-3">
            <Checkbox
              id={viewSnapCheckboxId}
              checked={state.viewSnapEnabled}
              onCheckedChange={(checked) => {
                controls.setViewSnapEnabled(checked === true);
              }}
              className="mt-0.5 border-border"
            />
            <label
              htmlFor={viewSnapCheckboxId}
              className="flex flex-col gap-1 text-xs text-muted-foreground"
            >
              <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                Snap view
              </span>
              <span>
                Uses the same drag snapping as the landing page. Hold Alt or Shift while dragging to
                bypass it.
              </span>
            </label>
          </div>

          <div className={LOGO_CONTROL_STACK_CLASS_NAME}>
            <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
              <span>Rotation axis</span>
              <span>{ROTATION_AXIS_MODE_LABELS[state.rotationAxisMode]}</span>
            </div>
            <div className={LOGO_CONTROL_BUTTON_ROW_CLASS_NAME}>
              {ROTATION_AXIS_MODE_OPTIONS.map((mode) => (
                <Button
                  key={mode}
                  type="button"
                  size="sm"
                  variant={state.rotationAxisMode === mode ? "default" : "outline"}
                  className={LOGO_CONTROL_BUTTON_CLASS_NAME}
                  onClick={() => {
                    controls.setRotationAxisMode(mode);
                  }}
                >
                  {ROTATION_AXIS_MODE_LABELS[mode]}
                </Button>
              ))}
            </div>
            {state.rotationAxisMode === "screen-vertical" ? (
              <div className="text-xs text-muted-foreground">
                Vertical mode rotates around the current screen-up axis, so changing elevation
                changes the resulting pose.
              </div>
            ) : null}
          </div>

          <LogoRangeControl
            formatValue={(value) => value.toFixed(1)}
            label={rotationAngleControlLabel}
            max="360"
            min="0"
            normalizeValue={normalizeRotationDegrees}
            onSliderChange={controls.setRotationDegrees}
            onValueChange={controls.setRotationDegrees}
            sliderAriaLabel={`${rotationAngleControlLabel} slider`}
            step="0.1"
            value={state.rotationDegrees}
            valueAriaLabel={`${rotationAngleControlLabel} value`}
            valueText={`${state.rotationDegrees.toFixed(1)}°`}
          />

          <LogoRangeControl
            formatValue={(value) => value.toFixed(1)}
            label="Elevation"
            max={MAX_ELEVATION_DEGREES}
            min={MIN_ELEVATION_DEGREES}
            normalizeValue={normalizeElevationDegrees}
            onSliderChange={controls.setElevationDegrees}
            onValueChange={controls.setElevationDegrees}
            sliderAriaLabel="Elevation slider"
            step="0.1"
            value={state.elevationDegrees}
            valueAriaLabel="Elevation value"
            valueText={`${state.elevationDegrees.toFixed(1)}°`}
          />

          <LogoDistanceScaleControl
            value={state.distanceScale}
            onValueChange={controls.setDistanceScale}
          />

          <LogoRangeControl
            formatValue={(value) => value.toFixed(2)}
            label="Zoom"
            max={LOGO_PREVIEW_ZOOM.max}
            min={LOGO_PREVIEW_ZOOM.min}
            normalizeValue={normalizeLogoPreviewZoom}
            onSliderChange={controls.setZoom}
            onValueChange={controls.setZoom}
            sliderAriaLabel="Zoom slider"
            step={LOGO_PREVIEW_ZOOM.step}
            value={state.zoom}
            valueAriaLabel="Zoom value"
            valueInputMax={LOGO_PREVIEW_ZOOM.max}
            valueText={`${state.zoom.toFixed(2)}x`}
          />

          <LogoRangeControl
            formatValue={(value) => value.toFixed(2)}
            label="Opacity"
            max={MAX_LOGO_OPACITY}
            min={MIN_LOGO_OPACITY}
            normalizeValue={normalizeLogoOpacity}
            onSliderChange={controls.setLogoOpacity}
            onValueChange={controls.setLogoOpacity}
            sliderAriaLabel="Opacity slider"
            step={LOGO_OPACITY_STEP}
            value={state.logoOpacity}
            valueAriaLabel="Opacity value"
            valueInputMax={MAX_LOGO_OPACITY}
            valueText={state.logoOpacity.toFixed(2)}
          />

          <div className={LOGO_CONTROL_BUTTON_ROW_CLASS_NAME}>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={LOGO_CONTROL_BUTTON_CLASS_NAME}
              onClick={controls.resetView}
            >
              Reset view
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={LOGO_CONTROL_BUTTON_CLASS_NAME}
              onClick={() => {
                controls.rotateByDegrees(45);
              }}
            >
              +45°
            </Button>
          </div>
        </LogoPreviewSection>
      )}

      <LogoPreviewSection title="Motion" testId="logo-preview-motion-section">
        <div className={LOGO_CONTROL_STACK_CLASS_NAME}>
          {renderMode === "three" ? (
            <>
              <Button
                type="button"
                size="sm"
                variant={state.autoRotateEnabled ? "default" : "outline"}
                className="w-full rounded-none"
                onClick={() => {
                  controls.setAutoRotating(!state.autoRotateEnabled);
                }}
              >
                {state.autoRotateEnabled ? "Stop auto rotate" : "Start auto rotate"}
              </Button>
              <LogoRangeControl
                formatValue={(value) => value.toFixed(1)}
                label="Rotation speed"
                max={LOGO_AUTO_ROTATE_SPEED.sliderMax}
                min={LOGO_AUTO_ROTATE_SPEED.min}
                normalizeValue={normalizeLogoAutoRotateDegreesPerSecond}
                onSliderChange={controls.setRotationSpeed}
                onValueChange={controls.setRotationSpeed}
                sliderAriaLabel="Rotation speed slider"
                step={LOGO_AUTO_ROTATE_SPEED.step}
                value={state.autoRotationDegreesPerSecond}
                valueAriaLabel="Rotation speed value"
                valueText={`${state.autoRotationDegreesPerSecond.toFixed(1)}°/s`}
              />
            </>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant={state.autoShuffleEnabled ? "default" : "outline"}
            className="w-full rounded-none"
            onClick={() => {
              controls.setShuffleEnabled(!state.autoShuffleEnabled);
            }}
          >
            {state.autoShuffleEnabled ? "Stop shuffle" : "Start shuffle"}
          </Button>
        </div>

        <div className={LOGO_CONTROL_STACK_CLASS_NAME}>
          <Label className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Parallel cubes
          </Label>
          <Select
            value={`${state.shuffleParallelMoves}`}
            onValueChange={(value) => {
              controls.setShuffleParallelMoves(parseShuffleParallelMoves(value));
            }}
          >
            <SelectTrigger className="h-9 rounded-none border-border bg-background px-2 text-sm shadow-none">
              {state.shuffleParallelMoves} {state.shuffleParallelMoves === 1 ? "cube" : "cubes"}
            </SelectTrigger>
            <AppSelectContent className="rounded-none border-border">
              {LOGO_SHUFFLE_PARALLEL_OPTIONS.map((option) => (
                <AppSelectItem key={option} value={`${option}`} className="rounded-none">
                  {option} {option === 1 ? "cube" : "cubes"}
                </AppSelectItem>
              ))}
            </AppSelectContent>
          </Select>
        </div>

        {renderMode === "three" ? (
          <div className="flex items-start gap-3">
            <Checkbox
              id={faceColorAnimationCheckboxId}
              checked={state.faceColorAnimationEnabled}
              onCheckedChange={(checked) => controls.setFaceColorAnimationEnabled(checked === true)}
              className="mt-0.5 border-border"
            />
            <label
              htmlFor={faceColorAnimationCheckboxId}
              className="flex flex-col gap-1 text-xs text-muted-foreground"
            >
              <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                Animate face colors
              </span>
              <span>Cycle the visible faces through nearby hues.</span>
            </label>
          </div>
        ) : null}
      </LogoPreviewSection>

      {renderMode === "three" ? (
        <LogoPreviewSection title="Left Face" testId="logo-preview-left-face-section">
          <div className={LOGO_CONTROL_BUTTON_ROW_CLASS_NAME}>
            {LEFT_FACE_STYLE_OPTIONS.map((kind) => (
              <Button
                key={kind}
                type="button"
                size="sm"
                variant={state.leftFaceStyle.kind === kind ? "default" : "outline"}
                className={LOGO_CONTROL_BUTTON_CLASS_NAME}
                onClick={() => {
                  controls.setLeftFaceStyleKind(kind);
                }}
              >
                {LEFT_FACE_STYLE_LABELS[kind]}
              </Button>
            ))}
          </div>

          {stripedLeftFaceStyle ? (
            <>
              <LogoRangeControl
                formatValue={(value) => value.toFixed(2)}
                label="Width"
                max={LOGO_LEFT_FACE_STRIPE.width.max}
                min={LOGO_LEFT_FACE_STRIPE.width.min}
                normalizeValue={normalizeLogoLeftFaceStripeWidth}
                onSliderChange={controls.setLeftFaceStripeWidth}
                onValueChange={controls.setLeftFaceStripeWidth}
                sliderAriaLabel="Stripe width slider"
                step={LOGO_LEFT_FACE_STRIPE.width.step}
                value={stripedLeftFaceStyle.stripeWidth}
                valueAriaLabel="Stripe width"
                valueText={stripedLeftFaceStyle.stripeWidth.toFixed(2)}
              />

              <LogoRangeControl
                formatValue={(value) => value.toFixed(2)}
                label="Gap"
                max={LOGO_LEFT_FACE_STRIPE.gap.max}
                min={LOGO_LEFT_FACE_STRIPE.gap.min}
                normalizeValue={normalizeLogoLeftFaceStripeGap}
                onSliderChange={controls.setLeftFaceStripeGap}
                onValueChange={controls.setLeftFaceStripeGap}
                sliderAriaLabel="Stripe gap slider"
                step={LOGO_LEFT_FACE_STRIPE.gap.step}
                value={stripedLeftFaceStyle.stripeGap}
                valueAriaLabel="Stripe gap"
                valueText={stripedLeftFaceStyle.stripeGap.toFixed(2)}
              />

              <div className="flex items-center gap-3">
                <Checkbox
                  id={stripeGapLinkedCheckboxId}
                  checked={stripedLeftFaceStyle.stripeGapLinked}
                  onCheckedChange={(checked) => {
                    controls.setLeftFaceStripeGapLinked(checked === true);
                  }}
                  className="border-border"
                />
                <label
                  htmlFor={stripeGapLinkedCheckboxId}
                  className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground"
                >
                  Link width/gap
                </label>
              </div>

              <div className={LOGO_CONTROL_STACK_CLASS_NAME}>
                <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                  Width basis
                </div>
                <div className={LOGO_CONTROL_BUTTON_ROW_CLASS_NAME}>
                  {LOGO_LEFT_FACE_STRIPE_BASIS_VALUES.map((stripeBasis) => (
                    <Button
                      key={stripeBasis}
                      type="button"
                      size="sm"
                      variant={
                        stripedLeftFaceStyle.stripeBasis === stripeBasis ? "default" : "outline"
                      }
                      className={LOGO_CONTROL_BUTTON_CLASS_NAME}
                      onClick={() => {
                        controls.setLeftFaceStripeBasis(stripeBasis);
                      }}
                    >
                      {LEFT_FACE_STRIPE_BASIS_LABELS[stripeBasis]}
                    </Button>
                  ))}
                </div>
              </div>

              <LogoRangeControl
                formatValue={(value) => value.toFixed(3)}
                label="Angle"
                max={LOGO_LEFT_FACE_STRIPE.angleDegrees.max}
                min={LOGO_LEFT_FACE_STRIPE.angleDegrees.min}
                normalizeValue={normalizeLogoLeftFaceStripeAngleDegrees}
                onSliderChange={controls.setLeftFaceStripeAngleDegrees}
                onValueChange={controls.setLeftFaceStripeAngleDegrees}
                sliderAriaLabel="Stripe angle slider"
                step={LOGO_LEFT_FACE_STRIPE.angleDegrees.step}
                value={stripedLeftFaceStyle.stripeAngleDegrees}
                valueAriaLabel="Stripe angle"
                valueText={`${stripedLeftFaceStyle.stripeAngleDegrees.toFixed(3)}°`}
              />

              <LogoRangeControl
                formatValue={(value) => value.toFixed(2)}
                label="Offset"
                max={LOGO_LEFT_FACE_STRIPE.offset.max}
                min={LOGO_LEFT_FACE_STRIPE.offset.min}
                normalizeValue={normalizeLogoLeftFaceStripeOffset}
                onSliderChange={controls.setLeftFaceStripeOffset}
                onValueChange={controls.setLeftFaceStripeOffset}
                sliderAriaLabel="Stripe offset slider"
                step={LOGO_LEFT_FACE_STRIPE.offset.step}
                value={stripedLeftFaceStyle.stripeOffset}
                valueAriaLabel="Stripe offset"
                valueText={stripedLeftFaceStyle.stripeOffset.toFixed(2)}
              />

              <div className="flex items-center gap-3">
                <Checkbox
                  id={stripeAnimationCheckboxId}
                  checked={state.leftFaceStripeAnimationEnabled}
                  onCheckedChange={(checked) => {
                    controls.setLeftFaceStripeAnimationEnabled(checked === true);
                  }}
                  className="border-border"
                />
                <label
                  htmlFor={stripeAnimationCheckboxId}
                  className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground"
                >
                  Animate stripes
                </label>
              </div>
            </>
          ) : null}
        </LogoPreviewSection>
      ) : null}

      <LogoPreviewSection title="Colors" testId="logo-preview-colors-section">
        <div className="flex items-center gap-1">
          {LOGO_THEME_COLOR_KEYS.map((themeColorKey) => (
            <ColorSwatch
              key={themeColorKey}
              color={getTailwindColorHex(state.themeColors[themeColorKey])}
              size="compact"
            />
          ))}
        </div>

        {LOGO_THEME_COLOR_KEYS.map((themeColorKey) => {
          const currentToken = state.themeColors[themeColorKey];

          return (
            <ThemeColorPicker
              key={themeColorKey}
              currentToken={currentToken}
              themeColorKey={themeColorKey}
              onCustomColorChange={controls.setThemeCustomColor}
              onFamilyChange={controls.setThemeColorFamily}
              onShadeChange={controls.setThemeColorShade}
            />
          );
        })}
      </LogoPreviewSection>

      <LogoPreviewSection title="Voxel Map">
        <pre className="overflow-x-auto border border-border bg-background p-2 font-mono text-[11px] text-muted-foreground">
          {state.voxelState}
        </pre>
      </LogoPreviewSection>
    </div>
  );

  return (
    <AppWorkspaceRouteChrome left={{ content: controlsContent }}>
      {sceneContent}
    </AppWorkspaceRouteChrome>
  );
}
