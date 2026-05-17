import {
  LOGO_SHUFFLE_PARALLEL_OPTIONS,
  NLogoScene,
  type LogoShuffleParallelMoves,
} from "@/components/NLogoScene";
import { NLogoRasterScene } from "@/components/NLogoRasterScene";
import { type LogoRotationAxisMode } from "@/components/logoRotationMath";
import { LogoIsoThumbnail, NLogoIsoScene } from "@/components/NLogoIsoScene";
import {
  DEFAULT_LOGO_ISOMETRIC_CUBE_SIDE_PX,
  DEFAULT_LOGO_ISOMETRIC_STYLE_ID,
  LOGO_ISOMETRIC_CUBE_SIDE_STEP_PX,
  LOGO_ISOMETRIC_STYLES,
  MAX_LOGO_ISOMETRIC_CUBE_SIDE_PX,
  MIN_LOGO_ISOMETRIC_CUBE_SIDE_PX,
  getLogoIsometricStyle,
  isLogoIsometricStyleId,
  normalizeLogoIsometricCubeSidePixels,
  type LogoIsometricStyleId,
} from "@/components/logoIsometricRenderer";
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
} from "@/components/logoTailwindColors";
import {
  CUSTOM_LOGO_PRESET_ID,
  DEFAULT_LOGO_PRESET_ID,
  LOGO_PRESETS,
  getLogoPreset,
  getLogoPresetSelection,
  type LogoPresetId,
  type LogoPresetSelection,
} from "@/components/logoPresets";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Layout, PublicLayoutShell } from "@/Layout";
import {
  DEFAULT_ELEVATION_DEGREES,
  DEFAULT_LOGO_FRACTAL_DEPTH,
  DEFAULT_ROTATION_DEGREES,
  DEFAULT_VOXEL_STATE,
  MAX_ELEVATION_DEGREES,
  MIN_LOGO_FRACTAL_DEPTH,
  MIN_ELEVATION_DEGREES,
  applyVoxelEdit,
  createDefaultFilledVoxelSet,
  createLogoFractalVoxelGrid,
  normalizeElevationDegrees,
  normalizeLogoFractalDepth,
  normalizeRotationDegrees,
  parseVoxelState,
  serializeVoxelState,
  type VoxelEdit,
} from "@/components/logoVoxelState";
import {
  resolveLogoViewState,
  type LogoViewState,
} from "@/components/logoViewDrag";
import {
  readLogoThemeColors,
  useResolvedAppThemeColorState,
} from "@/lib/appThemeColorSearch";
import {
  buildLogoRouteSearch,
  preserveLogoRouteDevModeSearch,
  type LogoRouteSearch,
} from "@/lib/logoRouteSearch";
import { PUBLIC_LANDING_LOGO_VIEW_DRAG_CONFIG } from "@/lib/publicLandingLogo";
import { useAnimationFrameLoop } from "@/lib/useAnimationFrameLoop";
import { usePacedCommittedState } from "@/lib/usePacedCommittedState";
import { cn } from "@/lib/utils";
import { useCreateStore, useSelector } from "@tanstack/react-store";
import { Link } from "@tanstack/react-router";
import { PaletteIcon } from "lucide-react";
import {
  useId,
  useMemo,
  useRef,
  type ChangeEvent,
  type ReactNode,
} from "react";

const AUTO_ROTATE_DEGREES_PER_SECOND = 18;
const DEFAULT_LOGO_OPACITY = 1;
const DEFAULT_ROTATION_AXIS_MODE: LogoRotationAxisMode = "cube-y";
const LOGO_PREVIEW_ROUTE_COMMIT_DEBOUNCE_MS = 150;
const MIN_LOGO_OPACITY = 0;
const MAX_LOGO_OPACITY = 1;
const LOGO_OPACITY_STEP = 0.01;
const LOGO_FRACTAL_DEPTH_SLIDER_MAX = 5;
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
const LOGO_CONTROL_NUMBER_INPUT_CLASS_NAME =
  "h-9 w-full max-w-32 rounded-none border-border bg-background px-2 font-mono text-sm";

type LogoPreviewRenderMode = "three" | "iso" | "raster";
type LogoPreviewPageProps = {
  renderMode?: LogoPreviewRenderMode;
  replaceRouteSearch: (nextSearch: LogoRouteSearch) => void;
  routeSearch: LogoRouteSearch;
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

function clampLogoOpacity(value: number): number {
  return Math.min(Math.max(value, MIN_LOGO_OPACITY), MAX_LOGO_OPACITY);
}

function parseShuffleParallelMoves(value: string): LogoShuffleParallelMoves {
  switch (value) {
    case "2":
      return 2;
    case "3":
      return 3;
    default:
      return 1;
  }
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

function ColorSwatch({
  color,
  size = "default",
}: {
  color: string;
  size?: ColorSwatchSize;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "shrink-0 border border-border",
        COLOR_SWATCH_SIZE_CLASS_NAMES[size],
      )}
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
  onCustomColorChange: (
    themeColorKey: LogoThemeColorKey,
    nextColor: string,
  ) => void;
  onFamilyChange: (
    themeColorKey: LogoThemeColorKey,
    nextFamily: string,
  ) => void;
  onShadeChange: (themeColorKey: LogoThemeColorKey, nextShade: string) => void;
}) {
  const currentColorHex = getTailwindColorHex(currentToken);
  const colorInputValue = readColorInputValue(currentToken);
  const isTailwindToken = isTailwindColorToken(currentToken);
  const currentFamily = isTailwindToken
    ? getTailwindColorFamily(currentToken)
    : null;
  const currentShade = isTailwindToken
    ? getTailwindColorShade(currentToken)
    : null;
  const currentLabel = isTailwindToken ? currentToken : colorInputValue;
  const availableShades =
    currentFamily === null ? [] : getTailwindColorShades(currentFamily);
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
              <span className="truncate font-mono text-xs text-foreground">
                {currentLabel}
              </span>
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
          <span className="truncate font-mono text-xs text-muted-foreground">
            {currentLabel}
          </span>
        </div>

        <div className="flex items-center gap-2 border border-border bg-background p-2">
          <Input
            aria-label={`${themeColorLabel} custom color`}
            className="h-10 w-14 shrink-0 cursor-pointer rounded-none border-border bg-background p-1 shadow-none"
            type="color"
            value={colorInputValue}
            onChange={(event) =>
              onCustomColorChange(themeColorKey, event.target.value)
            }
          />
          <div className="min-w-0">
            <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Custom
            </div>
            <div className="truncate font-mono text-xs text-foreground">
              {colorInputValue}
            </div>
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
                      isSelected
                        ? "border-foreground"
                        : "border-border hover:border-foreground/60",
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
                    isSelected
                      ? "border-foreground"
                      : "border-border hover:border-foreground/60",
                  )}
                  type="button"
                  onClick={() => onFamilyChange(themeColorKey, family)}
                >
                  <ColorSwatch
                    color={getTailwindColorFamilyHex(family)}
                    size="compact"
                  />
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

function readVoxelState(routeSearch: LogoRouteSearch): string {
  const parsedState = parseVoxelState(routeSearch.vox ?? null);
  if (parsedState === null) {
    return DEFAULT_VOXEL_STATE;
  }

  return serializeVoxelState(parsedState);
}

function readLogoPresetSelection(
  routeSearch: LogoRouteSearch,
): LogoPresetSelection {
  return getLogoPresetSelection(readVoxelState(routeSearch));
}

function readIsoStyleId(routeSearch: LogoRouteSearch): LogoIsometricStyleId {
  const isoStyle = routeSearch.isoStyle ?? null;
  if (!isLogoIsometricStyleId(isoStyle)) {
    return DEFAULT_LOGO_ISOMETRIC_STYLE_ID;
  }

  return isoStyle;
}

function readIsoCubeSidePixels(routeSearch: LogoRouteSearch): number {
  if (typeof routeSearch.isoSide !== "number") {
    return DEFAULT_LOGO_ISOMETRIC_CUBE_SIDE_PX;
  }

  return normalizeLogoIsometricCubeSidePixels(routeSearch.isoSide);
}

function readRotationDegrees(routeSearch: LogoRouteSearch): number {
  if (typeof routeSearch.rot !== "number") {
    return DEFAULT_ROTATION_DEGREES;
  }

  return normalizeRotationDegrees(routeSearch.rot);
}

function isLogoRotationAxisMode(
  value: string | null,
): value is LogoRotationAxisMode {
  return value === "cube-y" || value === "screen-vertical";
}

function readRotationAxisMode(
  routeSearch: LogoRouteSearch,
): LogoRotationAxisMode {
  const value = routeSearch.axis ?? null;
  if (!isLogoRotationAxisMode(value)) {
    return DEFAULT_ROTATION_AXIS_MODE;
  }

  return value;
}

function readViewSnapEnabled(routeSearch: LogoRouteSearch): boolean {
  return !routeSearch.freeView;
}

function resolveLogoPreviewViewState(
  view: LogoViewState,
  viewSnapEnabled: boolean,
): LogoViewState {
  return resolveLogoViewState({
    config: viewSnapEnabled ? PUBLIC_LANDING_LOGO_VIEW_DRAG_CONFIG : undefined,
    view,
  });
}

function readLogoPreviewView(routeSearch: LogoRouteSearch): LogoViewState & {
  viewSnapEnabled: boolean;
} {
  const viewSnapEnabled = readViewSnapEnabled(routeSearch);
  return {
    ...resolveLogoPreviewViewState(
      {
        elevationDegrees: readElevationDegrees(routeSearch),
        rotationDegrees: readRotationDegrees(routeSearch),
      },
      viewSnapEnabled,
    ),
    viewSnapEnabled,
  };
}

function readElevationDegrees(routeSearch: LogoRouteSearch): number {
  if (typeof routeSearch.elev !== "number") {
    return DEFAULT_ELEVATION_DEGREES;
  }

  return normalizeElevationDegrees(routeSearch.elev);
}

function readLogoFractalDepth(routeSearch: LogoRouteSearch): number {
  if (typeof routeSearch.depth !== "number") {
    return DEFAULT_LOGO_FRACTAL_DEPTH;
  }

  return normalizeLogoFractalDepth(routeSearch.depth);
}

type LogoPreviewRouteState = {
  elevationDegrees: number;
  fractalDepth: number;
  isViewSnapEnabled: boolean;
  isoCubeSidePixels: number;
  isoStyleId: LogoIsometricStyleId;
  rotationAxisMode: LogoRotationAxisMode;
  rotationDegrees: number;
  selectedPresetId: LogoPresetSelection;
  themeColors: LogoThemeColors;
  voxelState: string;
};

type LogoPreviewLocalStoreState = {
  editMode: VoxelEdit["kind"];
  isAutoRotating: boolean;
  isFaceColorAnimationEnabled: boolean;
  isSceneInteracting: boolean;
  isShuffleEnabled: boolean;
  logoOpacity: number;
  shuffleParallelMoves: LogoShuffleParallelMoves;
};

type LogoPreviewState = LogoPreviewRouteState & LogoPreviewLocalStoreState;

function readLogoPreviewRouteState(
  routeSearch: LogoRouteSearch,
): LogoPreviewRouteState {
  const view = readLogoPreviewView(routeSearch);

  return {
    elevationDegrees: view.elevationDegrees,
    fractalDepth: readLogoFractalDepth(routeSearch),
    isViewSnapEnabled: view.viewSnapEnabled,
    isoCubeSidePixels: readIsoCubeSidePixels(routeSearch),
    isoStyleId: readIsoStyleId(routeSearch),
    rotationAxisMode: readRotationAxisMode(routeSearch),
    rotationDegrees: view.rotationDegrees,
    selectedPresetId: readLogoPresetSelection(routeSearch),
    themeColors: readLogoThemeColors(routeSearch),
    voxelState: readVoxelState(routeSearch),
  };
}

function readLogoPreviewLocalStoreState(): LogoPreviewLocalStoreState {
  return {
    editMode: "add",
    isAutoRotating: false,
    isFaceColorAnimationEnabled: false,
    isSceneInteracting: false,
    isShuffleEnabled: false,
    logoOpacity: DEFAULT_LOGO_OPACITY,
    shuffleParallelMoves: 3,
  };
}

function areLogoPreviewRouteStatesEqual(
  left: LogoPreviewRouteState,
  right: LogoPreviewRouteState,
): boolean {
  return (
    left.elevationDegrees === right.elevationDegrees &&
    left.fractalDepth === right.fractalDepth &&
    left.isViewSnapEnabled === right.isViewSnapEnabled &&
    left.isoCubeSidePixels === right.isoCubeSidePixels &&
    left.isoStyleId === right.isoStyleId &&
    left.rotationAxisMode === right.rotationAxisMode &&
    left.rotationDegrees === right.rotationDegrees &&
    left.selectedPresetId === right.selectedPresetId &&
    left.voxelState === right.voxelState &&
    areLogoThemeColorsEqual(left.themeColors, right.themeColors)
  );
}

function buildLogoPreviewRouteSearch(
  routeState: LogoPreviewRouteState,
  routeSearch: LogoRouteSearch,
): LogoRouteSearch {
  const resolvedView = resolveLogoPreviewViewState(
    {
      elevationDegrees: routeState.elevationDegrees,
      rotationDegrees: routeState.rotationDegrees,
    },
    routeState.isViewSnapEnabled,
  );

  return preserveLogoRouteDevModeSearch(
    buildLogoRouteSearch({
      elevationDegrees: resolvedView.elevationDegrees,
      fractalDepth: routeState.fractalDepth,
      isoCubeSidePixels: routeState.isoCubeSidePixels,
      isoStyleId: routeState.isoStyleId,
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

function replaceLogoPreviewRouteSearch({
  replaceRouteSearch,
  routeSearch,
  routeState,
}: {
  replaceRouteSearch: LogoPreviewPageProps["replaceRouteSearch"];
  routeSearch: LogoRouteSearch;
  routeState: LogoPreviewRouteState;
}) {
  const nextSearch = buildLogoPreviewRouteSearch(routeState, routeSearch);

  if (
    !areLogoRouteSearchesEqual(
      nextSearch,
      readCanonicalLogoRouteSearch(routeSearch),
    )
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
    options?.viewSnapEnabled ?? state.isViewSnapEnabled,
  );

  return {
    ...state,
    elevationDegrees: resolvedView.elevationDegrees,
    rotationDegrees: resolvedView.rotationDegrees,
  };
}

function useLogoPreviewStore() {
  return useCreateStore(readLogoPreviewLocalStoreState(), ({ setState }) => ({
    setAutoRotating: (isAutoRotating: boolean) => {
      setState((state) => ({
        ...state,
        isAutoRotating,
      }));
    },
    setEditMode: (editMode: VoxelEdit["kind"]) => {
      setState((state) => ({
        ...state,
        editMode,
      }));
    },
    setFaceColorAnimationEnabled: (isFaceColorAnimationEnabled: boolean) => {
      setState((state) => ({
        ...state,
        isFaceColorAnimationEnabled,
      }));
    },
    setLogoOpacity: (logoOpacity: number) => {
      setState((state) => ({
        ...state,
        logoOpacity: clampLogoOpacity(logoOpacity),
      }));
    },
    setSceneInteracting: (isSceneInteracting: boolean) => {
      setState((state) => ({
        ...state,
        isSceneInteracting,
      }));
    },
    setShuffleEnabled: (isShuffleEnabled: boolean) => {
      setState((state) => ({
        ...state,
        isShuffleEnabled,
      }));
    },
    setShuffleParallelMoves: (
      shuffleParallelMoves: LogoShuffleParallelMoves,
    ) => {
      setState((state) => ({
        ...state,
        shuffleParallelMoves,
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
 * `usePacedCommittedState` so sliders, dragging, and auto-rotation can update
 * the UI immediately while noisy URL commits are debounced or flushed on end.
 * The returned `controls` are React-bound controller callbacks, not pure
 * TanStack Store actions.
 */
function useLogoPreviewController({
  replaceRouteSearch,
  routeSearch,
}: Pick<LogoPreviewPageProps, "replaceRouteSearch" | "routeSearch">) {
  const store = useLogoPreviewStore();
  const localState = useSelector(store);
  const routeState = useMemo(
    () => readLogoPreviewRouteState(routeSearch),
    [routeSearch],
  );
  const routeSearchRef = useRef(routeSearch);
  routeSearchRef.current = routeSearch;
  const pacedRouteState = usePacedCommittedState({
    committed: routeState,
    commit: (nextRouteState) => {
      const latestRouteSearch = routeSearchRef.current;
      replaceLogoPreviewRouteSearch({
        replaceRouteSearch,
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
  ) => updater(pacedRouteState.value);
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
      advanceAutoRotation: (deltaSeconds: number) => {
        setRouteStateDraft((currentState) => ({
          ...currentState,
          rotationDegrees: normalizeRotationDegrees(
            currentState.rotationDegrees +
              deltaSeconds * AUTO_ROTATE_DEGREES_PER_SECOND,
          ),
        }));
      },
      applyPreset: (presetId: Exclude<LogoPresetSelection, "custom">) => {
        const preset = getLogoPreset(presetId);
        store.actions.setAutoRotating(false);
        store.actions.setShuffleEnabled(false);
        commitRouteState((currentState) => ({
          ...currentState,
          selectedPresetId: presetId,
          voxelState: preset.voxelState,
        }));
      },
      applyViewState: (
        nextView: LogoViewState,
        options?: { viewSnapEnabled?: boolean },
      ) => {
        setRouteStateDraft((currentState) =>
          applyLogoPreviewViewState(currentState, nextView, options),
        );
      },
      editVoxel: (edit: VoxelEdit) => {
        store.actions.setShuffleEnabled(false);
        commitRouteState((currentState) => {
          const voxelState = applyVoxelEdit(currentState.voxelState, edit);

          return {
            ...currentState,
            selectedPresetId: getLogoPresetSelection(voxelState),
            voxelState,
          };
        });
      },
      endSceneInteraction: () => {
        store.actions.setSceneInteracting(false);
        pacedRouteState.commitCurrent();
      },
      resetView: () => {
        store.actions.setAutoRotating(false);
        commitRouteState((currentState) => ({
          ...applyLogoPreviewViewState(currentState, {
            elevationDegrees: DEFAULT_ELEVATION_DEGREES,
            rotationDegrees: DEFAULT_ROTATION_DEGREES,
          }),
          rotationAxisMode: DEFAULT_ROTATION_AXIS_MODE,
        }));
      },
      resetShape: () => {
        store.actions.setAutoRotating(false);
        store.actions.setShuffleEnabled(false);
        commitRouteState((currentState) => {
          const presetId =
            currentState.selectedPresetId === CUSTOM_LOGO_PRESET_ID
              ? DEFAULT_LOGO_PRESET_ID
              : currentState.selectedPresetId;
          const preset = getLogoPreset(presetId);

          return {
            ...currentState,
            selectedPresetId: presetId,
            voxelState: preset.voxelState,
          };
        });
      },
      rotateByDegrees: (deltaDegrees: number) => {
        commitRouteState((currentState) =>
          applyLogoPreviewViewState(currentState, {
            elevationDegrees: currentState.elevationDegrees,
            rotationDegrees: normalizeRotationDegrees(
              currentState.rotationDegrees + deltaDegrees,
            ),
          }),
        );
      },
      setAutoRotating: (isAutoRotating: boolean) => {
        store.actions.setAutoRotating(isAutoRotating);
        if (isAutoRotating) {
          pacedRouteState.cancelCommit();
          return;
        }

        pacedRouteState.commitCurrent();
      },
      setEditMode: store.actions.setEditMode,
      setElevationDegrees: (elevationDegrees: number) => {
        store.actions.setAutoRotating(false);
        debounceRouteState((currentState) =>
          applyLogoPreviewViewState(currentState, {
            elevationDegrees: normalizeElevationDegrees(elevationDegrees),
            rotationDegrees: currentState.rotationDegrees,
          }),
        );
      },
      setFaceColorAnimationEnabled: store.actions.setFaceColorAnimationEnabled,
      setFractalDepth: (fractalDepth: number) => {
        const nextFractalDepth = normalizeLogoFractalDepth(fractalDepth);
        commitRouteState((currentState) => ({
          ...currentState,
          fractalDepth: nextFractalDepth,
        }));
      },
      setIsoCubeSidePixels: (isoCubeSidePixels: number) => {
        debounceRouteState((currentState) => ({
          ...currentState,
          isoCubeSidePixels:
            normalizeLogoIsometricCubeSidePixels(isoCubeSidePixels),
        }));
      },
      setIsoStyleId: (isoStyleId: LogoIsometricStyleId) => {
        commitRouteState((currentState) => ({
          ...currentState,
          isoStyleId,
        }));
      },
      setLogoOpacity: store.actions.setLogoOpacity,
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
        store.actions.setAutoRotating(false);
        debounceRouteState((currentState) =>
          applyLogoPreviewViewState(currentState, {
            elevationDegrees: currentState.elevationDegrees,
            rotationDegrees: normalizeRotationDegrees(rotationDegrees),
          }),
        );
      },
      setShuffleEnabled: store.actions.setShuffleEnabled,
      setShuffleParallelMoves: store.actions.setShuffleParallelMoves,
      setThemeColorFamily: (
        themeColorKey: LogoThemeColorKey,
        nextFamily: string,
      ) => {
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
      setThemeColorShade: (
        themeColorKey: LogoThemeColorKey,
        nextShade: string,
      ) => {
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
        commitRouteState((currentState) => ({
          ...currentState,
          themeColors,
        }));
      },
      setThemeCustomColor: (
        themeColorKey: LogoThemeColorKey,
        nextColor: string,
      ) => {
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
      setViewSnapEnabled: (isViewSnapEnabled: boolean) => {
        commitRouteState((currentState) => {
          if (!isViewSnapEnabled) {
            return {
              ...currentState,
              isViewSnapEnabled: false,
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
            isViewSnapEnabled: true,
          };
        });
      },
      startSceneInteraction: () => {
        pacedRouteState.cancelCommit();
        store.actions.setAutoRotating(false);
        store.actions.setSceneInteracting(true);
      },
    },
    state,
  };
}

function isLogoPresetId(value: string): value is LogoPresetId {
  return LOGO_PRESETS.some((preset) => preset.id === value);
}

function readCanonicalLogoRouteSearch(
  routeSearch: LogoRouteSearch,
): LogoRouteSearch {
  return preserveLogoRouteDevModeSearch(
    buildLogoRouteSearch({
      elevationDegrees: readElevationDegrees(routeSearch),
      fractalDepth: readLogoFractalDepth(routeSearch),
      isoCubeSidePixels: readIsoCubeSidePixels(routeSearch),
      isoStyleId: readIsoStyleId(routeSearch),
      rotationAxisMode: readRotationAxisMode(routeSearch),
      rotationDegrees: readRotationDegrees(routeSearch),
      themeModeSearch: routeSearch,
      themeColors: readLogoThemeColors(routeSearch),
      viewSnapEnabled: readViewSnapEnabled(routeSearch),
      voxelState: readVoxelState(routeSearch),
    }),
    routeSearch,
  );
}

const LOGO_ROUTE_SEARCH_KEYS = [
  "axis",
  ...LOGO_THEME_COLOR_KEYS,
  "dev",
  "depth",
  "elev",
  "freeView",
  "isoSide",
  "isoStyle",
  "dark",
  "light",
  "rot",
  "vox",
] as const satisfies readonly (keyof LogoRouteSearch)[];

function areLogoRouteSearchesEqual(
  left: LogoRouteSearch,
  right: LogoRouteSearch,
): boolean {
  return LOGO_ROUTE_SEARCH_KEYS.every((key) => left[key] === right[key]);
}

function areLogoThemeColorsEqual(
  left: LogoThemeColors,
  right: LogoThemeColors,
): boolean {
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
      className={cn(
        "flex flex-col gap-2 border-t border-border py-2 first:border-t-0",
        className,
      )}
      data-testid={testId}
    >
      <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        {title}
      </div>
      {children}
    </section>
  );
}

function LogoRangeControl({
  allowValueAboveMax = false,
  label,
  max,
  min,
  onSliderChange,
  onValueChange,
  sliderAriaLabel,
  step,
  value,
  valueAriaLabel,
  valueInputMode = "decimal",
  valueLabel,
  valueText,
}: {
  allowValueAboveMax?: boolean;
  label: string;
  max: number | string;
  min: number | string;
  onSliderChange: (value: number) => void;
  onValueChange: (value: number) => void;
  sliderAriaLabel: string;
  step: number | string;
  value: number | string;
  valueAriaLabel: string;
  valueInputMode?: "decimal" | "numeric";
  valueLabel: string | number;
  valueText: string;
}) {
  const handleSliderChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextValue = Number(event.target.value);
    if (Number.isNaN(nextValue)) {
      return;
    }

    onSliderChange(nextValue);
  };

  const handleValueChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextValue = Number(event.target.value);
    if (Number.isNaN(nextValue)) {
      return;
    }

    onValueChange(nextValue);
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
          value={value}
          onChange={handleSliderChange}
          className="h-2 min-w-40 flex-[999_1_10rem] cursor-pointer accent-[#8a88ac]"
        />
        <div className="ml-auto flex min-w-28 flex-[1_0_7rem] justify-end">
          <Input
            aria-label={valueAriaLabel}
            type="number"
            inputMode={valueInputMode}
            min={min}
            max={allowValueAboveMax ? undefined : max}
            step={step}
            value={valueLabel}
            onChange={handleValueChange}
            className={LOGO_CONTROL_NUMBER_INPUT_CLASS_NAME}
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
  const { controls, state } = useLogoPreviewController({
    replaceRouteSearch,
    routeSearch,
  });
  const { backgroundColor, faceColors } = useResolvedAppThemeColorState(
    state.themeColors,
  );
  const viewSnapCheckboxId = useId();
  const faceColorAnimationCheckboxId = useId();

  useAnimationFrameLoop({
    isRunning: state.isAutoRotating && renderMode === "three",
    onFrame: (deltaSeconds) => {
      controls.advanceAutoRotation(deltaSeconds);
    },
  });

  const selectedPreset =
    state.selectedPresetId === CUSTOM_LOGO_PRESET_ID
      ? null
      : getLogoPreset(state.selectedPresetId);
  const selectedIsoStyle = getLogoIsometricStyle(state.isoStyleId);
  const rotationAngleControlLabel =
    ROTATION_ANGLE_CONTROL_LABELS[state.rotationAxisMode];
  const baseFilledVoxels = useMemo(
    () => parseVoxelState(state.voxelState) ?? createDefaultFilledVoxelSet(),
    [state.voxelState],
  );
  const isRecursiveDepth = state.fractalDepth > DEFAULT_LOGO_FRACTAL_DEPTH;
  const logoVoxelGrid = useMemo(
    () =>
      renderMode === "iso" && isRecursiveDepth
        ? createLogoFractalVoxelGrid({
            depth: state.fractalDepth,
            filledVoxels: baseFilledVoxels,
          })
        : undefined,
    [baseFilledVoxels, isRecursiveDepth, renderMode, state.fractalDepth],
  );
  const shuffleAnimation = {
    enabled: state.isShuffleEnabled,
    parallelMoves: state.shuffleParallelMoves,
  };

  const modeSearch = preserveLogoRouteDevModeSearch(
    buildLogoRouteSearch({
      elevationDegrees: state.elevationDegrees,
      fractalDepth: state.fractalDepth,
      isoCubeSidePixels: state.isoCubeSidePixels,
      isoStyleId: state.isoStyleId,
      rotationAxisMode: state.rotationAxisMode,
      rotationDegrees: state.rotationDegrees,
      themeModeSearch: routeSearch,
      themeColors: state.themeColors,
      viewSnapEnabled: state.isViewSnapEnabled,
      voxelState: state.voxelState,
    }),
    routeSearch,
  );

  const logoScene =
    renderMode === "iso" ? (
      <NLogoIsoScene
        backgroundColor={backgroundColor}
        className="absolute inset-0 h-full w-full touch-none select-none"
        cubeSidePixels={state.isoCubeSidePixels}
        editMode={state.editMode}
        faceColors={faceColors}
        onVoxelEdit={controls.editVoxel}
        shuffleAnimation={shuffleAnimation}
        styleId={state.isoStyleId}
        voxelEditingEnabled={!isRecursiveDepth}
        voxelGrid={logoVoxelGrid}
        voxelState={state.voxelState}
      />
    ) : renderMode === "raster" ? (
      <NLogoRasterScene
        backgroundColor={backgroundColor}
        className={cn(
          "absolute inset-0 h-full w-full touch-none select-none",
          state.isSceneInteracting ? "cursor-grabbing" : "cursor-grab",
        )}
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
        viewDragConfig={
          state.isViewSnapEnabled
            ? PUBLIC_LANDING_LOGO_VIEW_DRAG_CONFIG
            : undefined
        }
        voxelState={state.voxelState}
      />
    ) : (
      <NLogoScene
        backgroundColor={backgroundColor}
        className={cn(
          "absolute inset-0 h-full w-full touch-none select-none",
          state.isSceneInteracting ? "cursor-grabbing" : "cursor-grab",
        )}
        editMode={state.editMode}
        elevationDegrees={state.elevationDegrees}
        faceColors={faceColors}
        opacity={state.logoOpacity}
        onInteractionStart={controls.startSceneInteraction}
        onInteractionEnd={controls.endSceneInteraction}
        onViewChange={controls.applyViewState}
        onVoxelEdit={controls.editVoxel}
        rotationAxisMode={state.rotationAxisMode}
        rotationDegrees={state.rotationDegrees}
        shuffleAnimation={shuffleAnimation}
        animateFaceColors={state.isFaceColorAnimationEnabled}
        fractalDepth={state.fractalDepth}
        voxelEditingEnabled={!isRecursiveDepth}
        voxelGrid={logoVoxelGrid}
        viewDragConfig={
          state.isViewSnapEnabled
            ? PUBLIC_LANDING_LOGO_VIEW_DRAG_CONFIG
            : undefined
        }
        voxelState={state.voxelState}
      />
    );

  const sceneContent = (
    <div
      className="flex h-full min-h-0 items-center justify-center @container-[size]"
      style={{ backgroundColor }}
    >
      {/* Keep touch capture square so mobile top/bottom drag lanes stay free. */}
      <div className="relative h-[min(100cqw,100cqh)] w-[min(100cqw,100cqh)]">
        {logoScene}
      </div>
    </div>
  );

  const controlsContent = (
    <div
      data-testid="logo-preview-controls"
      className="flex min-h-full flex-col gap-0 px-1 py-2"
    >
      <LogoPreviewSection title="Pages">
        <div className={LOGO_CONTROL_BUTTON_ROW_CLASS_NAME}>
          <Button
            asChild
            size="sm"
            variant={renderMode === "iso" ? "outline" : "default"}
            className={LOGO_CONTROL_BUTTON_CLASS_NAME}
          >
            <Link search={modeSearch} to="/logo">
              3D
            </Link>
          </Button>
          <Button
            asChild
            size="sm"
            variant={renderMode === "raster" ? "default" : "outline"}
            className={LOGO_CONTROL_BUTTON_CLASS_NAME}
          >
            <Link search={modeSearch} to="/logo/raster">
              Raster
            </Link>
          </Button>
          <Button
            asChild
            size="sm"
            variant={renderMode === "iso" ? "default" : "outline"}
            className={LOGO_CONTROL_BUTTON_CLASS_NAME}
          >
            <Link search={modeSearch} to="/logo/iso">
              Iso
            </Link>
          </Button>
          <Button
            asChild
            size="sm"
            variant="outline"
            className={LOGO_CONTROL_BUTTON_CLASS_NAME}
          >
            <Link search={modeSearch} to="/logo/svg">
              SVG
            </Link>
          </Button>
          <Button
            asChild
            size="sm"
            variant="outline"
            className={LOGO_CONTROL_BUTTON_CLASS_NAME}
          >
            <Link search={modeSearch} to="/logo/single-cube">
              Study
            </Link>
          </Button>
        </div>
      </LogoPreviewSection>

      <LogoPreviewSection title="Shape">
        <LogoRangeControl
          allowValueAboveMax
          label="Depth"
          max={LOGO_FRACTAL_DEPTH_SLIDER_MAX}
          min={MIN_LOGO_FRACTAL_DEPTH}
          onSliderChange={controls.setFractalDepth}
          onValueChange={controls.setFractalDepth}
          sliderAriaLabel="Depth slider"
          step="1"
          value={state.fractalDepth}
          valueAriaLabel="Depth value"
          valueInputMode="numeric"
          valueLabel={state.fractalDepth}
          valueText={`${state.fractalDepth}`}
        />

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
          <SelectContent className="rounded-none border-border">
            <SelectItem value={CUSTOM_LOGO_PRESET_ID} className="rounded-none">
              Custom
            </SelectItem>
            {LOGO_PRESETS.map((preset) => (
              <SelectItem
                key={preset.id}
                value={preset.id}
                className="rounded-none"
              >
                <div className="flex flex-col gap-0.5">
                  <span>{preset.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {preset.description}
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
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
              label="Cube side"
              max={MAX_LOGO_ISOMETRIC_CUBE_SIDE_PX}
              min={MIN_LOGO_ISOMETRIC_CUBE_SIDE_PX}
              onSliderChange={controls.setIsoCubeSidePixels}
              onValueChange={controls.setIsoCubeSidePixels}
              sliderAriaLabel="Cube side"
              step={LOGO_ISOMETRIC_CUBE_SIDE_STEP_PX}
              value={state.isoCubeSidePixels}
              valueAriaLabel="Cube side pixels"
              valueInputMode="numeric"
              valueLabel={state.isoCubeSidePixels}
              valueText={`${state.isoCubeSidePixels}px`}
            />
            <div className="text-xs text-muted-foreground">
              {state.isoCubeSidePixels}px edge / {state.isoCubeSidePixels / 2}px
              rise
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-full rounded-none"
              onClick={() => {
                controls.setIsoCubeSidePixels(
                  DEFAULT_LOGO_ISOMETRIC_CUBE_SIDE_PX,
                );
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
              <SelectContent className="rounded-none border-border">
                {LOGO_ISOMETRIC_STYLES.map((style) => (
                  <SelectItem
                    key={style.id}
                    value={style.id}
                    className="rounded-none"
                  >
                    <div className="flex flex-col gap-0.5">
                      <span>{style.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {style.capWidth}px cap
                        {style.edgeMode === "shaded" ? " + edge" : ""}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            {[16, 32, 64].map((size) => (
              <div key={size} className="flex flex-col items-center gap-1">
                <div className="flex min-h-16 min-w-16 items-center justify-center border border-border bg-background p-2">
                  <LogoIsoThumbnail
                    backgroundColor={backgroundColor}
                    cubeSidePixels={state.isoCubeSidePixels}
                    faceColors={faceColors}
                    size={size}
                    styleId={state.isoStyleId}
                    voxelGrid={logoVoxelGrid}
                    voxelState={state.voxelState}
                  />
                </div>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {size}px
                </span>
              </div>
            ))}
          </div>
        </LogoPreviewSection>
      ) : (
        <LogoPreviewSection title="View">
          <div className="flex items-start gap-3">
            <Checkbox
              id={viewSnapCheckboxId}
              checked={state.isViewSnapEnabled}
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
                Uses the same drag snapping as the landing page. Hold Alt or
                Shift while dragging to bypass it.
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
                  variant={
                    state.rotationAxisMode === mode ? "default" : "outline"
                  }
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
                Vertical mode rotates around the current screen-up axis, so
                changing elevation changes the resulting pose.
              </div>
            ) : null}
          </div>

          <LogoRangeControl
            label={rotationAngleControlLabel}
            max="360"
            min="0"
            onSliderChange={controls.setRotationDegrees}
            onValueChange={controls.setRotationDegrees}
            sliderAriaLabel={`${rotationAngleControlLabel} slider`}
            step="0.1"
            value={state.rotationDegrees}
            valueAriaLabel={`${rotationAngleControlLabel} value`}
            valueLabel={state.rotationDegrees.toFixed(1)}
            valueText={`${state.rotationDegrees.toFixed(1)}°`}
          />

          <LogoRangeControl
            label="Elevation"
            max={MAX_ELEVATION_DEGREES}
            min={MIN_ELEVATION_DEGREES}
            onSliderChange={controls.setElevationDegrees}
            onValueChange={controls.setElevationDegrees}
            sliderAriaLabel="Elevation slider"
            step="0.1"
            value={state.elevationDegrees}
            valueAriaLabel="Elevation value"
            valueLabel={state.elevationDegrees.toFixed(1)}
            valueText={`${state.elevationDegrees.toFixed(1)}°`}
          />

          <LogoRangeControl
            label="Opacity"
            max={MAX_LOGO_OPACITY}
            min={MIN_LOGO_OPACITY}
            onSliderChange={controls.setLogoOpacity}
            onValueChange={controls.setLogoOpacity}
            sliderAriaLabel="Opacity slider"
            step={LOGO_OPACITY_STEP}
            value={state.logoOpacity}
            valueAriaLabel="Opacity value"
            valueLabel={state.logoOpacity.toFixed(2)}
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

      <LogoPreviewSection title="Motion">
        <div className={LOGO_CONTROL_STACK_CLASS_NAME}>
          {renderMode === "three" ? (
            <Button
              type="button"
              size="sm"
              variant={state.isAutoRotating ? "default" : "outline"}
              className="w-full rounded-none"
              onClick={() => {
                controls.setAutoRotating(!state.isAutoRotating);
              }}
            >
              {state.isAutoRotating ? "Stop auto rotate" : "Start auto rotate"}
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant={state.isShuffleEnabled ? "default" : "outline"}
            className="w-full rounded-none"
            onClick={() => {
              controls.setShuffleEnabled(!state.isShuffleEnabled);
            }}
          >
            {state.isShuffleEnabled ? "Stop shuffle" : "Start shuffle"}
          </Button>
        </div>

        <div className={LOGO_CONTROL_STACK_CLASS_NAME}>
          <Label className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Parallel cubes
          </Label>
          <Select
            value={`${state.shuffleParallelMoves}`}
            onValueChange={(value) => {
              controls.setShuffleParallelMoves(
                parseShuffleParallelMoves(value),
              );
            }}
          >
            <SelectTrigger className="h-9 rounded-none border-border bg-background px-2 text-sm shadow-none">
              {state.shuffleParallelMoves}{" "}
              {state.shuffleParallelMoves === 1 ? "cube" : "cubes"}
            </SelectTrigger>
            <SelectContent className="rounded-none border-border">
              {LOGO_SHUFFLE_PARALLEL_OPTIONS.map((option) => (
                <SelectItem
                  key={option}
                  value={`${option}`}
                  className="rounded-none"
                >
                  {option} {option === 1 ? "cube" : "cubes"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {renderMode === "three" ? (
          <div className="flex items-start gap-3">
            <Checkbox
              id={faceColorAnimationCheckboxId}
              checked={state.isFaceColorAnimationEnabled}
              onCheckedChange={(checked) =>
                controls.setFaceColorAnimationEnabled(checked === true)
              }
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
    <Layout>
      <PublicLayoutShell
        defaultLeftOpen
        defaultMobilePane="left"
        left={{
          content: controlsContent,
        }}
        leftToggleVisibility="all"
        main={{
          content: sceneContent,
          headerTestId: "logo-preview-main-header",
        }}
      />
    </Layout>
  );
}
