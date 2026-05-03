import {
  LOGO_SHUFFLE_PARALLEL_OPTIONS,
  NLogoScene,
  type LogoShuffleParallelMoves,
} from "@/components/NLogoScene";
import { usePublicRightSidebarPane } from "@/components/PublicRightSidebar";
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
  APP_THEME_COLOR_KEYS,
  DEFAULT_APP_THEME_COLORS,
  TAILWIND_COLOR_FAMILIES,
  getTailwindColorHex,
  getTailwindColorFamily,
  getTailwindColorFamilyHex,
  getTailwindColorShade,
  getTailwindColorShades,
  getTailwindColorTokenForSelection,
  isLogoColorToken,
  isTailwindColorToken,
  type AppThemeColorKey,
  type AppThemeColors,
  type LogoColorToken,
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
import { SidebarProvider } from "@/components/sidebar";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/input";
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
import {
  WORKSPACE_LAYOUT_V2_DESKTOP_SIDEBAR_MIN_WIDTH_PX,
  WORKSPACE_LAYOUT_V2_MOBILE_SIDEBAR_DEFAULT_WIDTH_PX,
  WorkspaceLayoutV2FullPage,
} from "@/components/workspace-layout-v2/WorkspaceLayoutV2";
import { type MobileSidebarPane } from "@/hooks/use-sidebar";
import { Layout } from "@/Layout";
import {
  DEFAULT_ELEVATION_DEGREES,
  DEFAULT_ROTATION_DEGREES,
  DEFAULT_VOXEL_STATE,
  MAX_ELEVATION_DEGREES,
  MIN_ELEVATION_DEGREES,
  applyVoxelEdit,
  normalizeElevationDegrees,
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
  readAppThemeColors,
  useResolvedAppThemeColorState,
} from "@/lib/appThemeColorSearch";
import {
  buildLogoRouteSearch,
  preserveLogoRouteDevModeSearch,
  type LogoRouteSearch,
} from "@/lib/logoRouteSearch";
import { shouldSyncLogoPreviewQueryState } from "@/lib/logoPreviewQuerySync";
import { PUBLIC_LANDING_LOGO_VIEW_DRAG_CONFIG } from "@/lib/publicLandingLogo";
import { cn } from "@/lib/utils";
import { useCreateStore, useSelector } from "@tanstack/react-store";
import { Link } from "@tanstack/react-router";
import { PaletteIcon } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  type ChangeEvent,
  type ReactNode,
} from "react";

const AUTO_ROTATE_DEGREES_PER_SECOND = 18;
const DEFAULT_LOGO_OPACITY = 1;
const DEFAULT_ROTATION_AXIS_MODE: LogoRotationAxisMode = "cube-y";
const LOGO_PREVIEW_SIDEBAR_WIDTH_PX = 256;
const MIN_LOGO_OPACITY = 0;
const MAX_LOGO_OPACITY = 1;
const LOGO_OPACITY_STEP = 0.01;
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

type LogoPreviewRenderMode = "three" | "iso";
type LogoPreviewPageProps = {
  renderMode?: LogoPreviewRenderMode;
  replaceRouteSearch: (nextSearch: LogoRouteSearch) => void;
  routeSearch: LogoRouteSearch;
};

const THEME_COLOR_LABELS: Record<AppThemeColorKey, string> = {
  base: "Base",
  primary: "Primary",
  secondary: "Secondary",
};
const RGB_THEME_COLORS: AppThemeColors = {
  base: "blue-500",
  primary: "green-500",
  secondary: "red-500",
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
  themeColorKey: AppThemeColorKey;
  onCustomColorChange: (
    themeColorKey: AppThemeColorKey,
    nextColor: string,
  ) => void;
  onFamilyChange: (themeColorKey: AppThemeColorKey, nextFamily: string) => void;
  onShadeChange: (themeColorKey: AppThemeColorKey, nextShade: string) => void;
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
  return routeSearch.freeView !== true;
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

type LogoPreviewRouteStoreState = {
  elevationDegrees: number;
  isViewSnapEnabled: boolean;
  isoCubeSidePixels: number;
  isoStyleId: LogoIsometricStyleId;
  rotationAxisMode: LogoRotationAxisMode;
  rotationDegrees: number;
  selectedPresetId: LogoPresetSelection;
  themeColors: AppThemeColors;
  voxelState: string;
};

type LogoPreviewStoreState = LogoPreviewRouteStoreState & {
  editMode: VoxelEdit["kind"];
  isAutoRotating: boolean;
  isFaceColorAnimationEnabled: boolean;
  isSceneInteracting: boolean;
  isShuffleEnabled: boolean;
  logoOpacity: number;
  mobilePane: MobileSidebarPane;
  shuffleParallelMoves: LogoShuffleParallelMoves;
};

function readLogoPreviewRouteStoreState(
  routeSearch: LogoRouteSearch,
): LogoPreviewRouteStoreState {
  const view = readLogoPreviewView(routeSearch);

  return {
    elevationDegrees: view.elevationDegrees,
    isViewSnapEnabled: view.viewSnapEnabled,
    isoCubeSidePixels: readIsoCubeSidePixels(routeSearch),
    isoStyleId: readIsoStyleId(routeSearch),
    rotationAxisMode: readRotationAxisMode(routeSearch),
    rotationDegrees: view.rotationDegrees,
    selectedPresetId: readLogoPresetSelection(routeSearch),
    themeColors: readAppThemeColors(routeSearch),
    voxelState: readVoxelState(routeSearch),
  };
}

function readLogoPreviewStoreState(
  routeSearch: LogoRouteSearch,
): LogoPreviewStoreState {
  return {
    ...readLogoPreviewRouteStoreState(routeSearch),
    editMode: "add",
    isAutoRotating: false,
    isFaceColorAnimationEnabled: false,
    isSceneInteracting: false,
    isShuffleEnabled: false,
    logoOpacity: DEFAULT_LOGO_OPACITY,
    mobilePane: "left",
    shuffleParallelMoves: 3,
  };
}

function areLogoPreviewRouteStoreStatesEqual(
  left: LogoPreviewRouteStoreState,
  right: LogoPreviewRouteStoreState,
): boolean {
  return (
    left.elevationDegrees === right.elevationDegrees &&
    left.isViewSnapEnabled === right.isViewSnapEnabled &&
    left.isoCubeSidePixels === right.isoCubeSidePixels &&
    left.isoStyleId === right.isoStyleId &&
    left.rotationAxisMode === right.rotationAxisMode &&
    left.rotationDegrees === right.rotationDegrees &&
    left.selectedPresetId === right.selectedPresetId &&
    left.voxelState === right.voxelState &&
    areAppThemeColorsEqual(left.themeColors, right.themeColors)
  );
}

function applyLogoPreviewViewState(
  state: LogoPreviewStoreState,
  nextView: LogoViewState,
  options?: { viewSnapEnabled?: boolean },
): LogoPreviewStoreState {
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

function useLogoPreviewStore(routeSearch: LogoRouteSearch) {
  return useCreateStore(
    readLogoPreviewStoreState(routeSearch),
    ({ setState }) => ({
      advanceAutoRotation: (deltaSeconds: number) => {
        setState((state) => ({
          ...state,
          rotationDegrees: normalizeRotationDegrees(
            state.rotationDegrees +
              deltaSeconds * AUTO_ROTATE_DEGREES_PER_SECOND,
          ),
        }));
      },
      applyPreset: (presetId: Exclude<LogoPresetSelection, "custom">) => {
        const preset = getLogoPreset(presetId);
        setState((state) => ({
          ...state,
          isAutoRotating: false,
          isShuffleEnabled: false,
          selectedPresetId: presetId,
          voxelState: preset.voxelState,
        }));
      },
      applyViewState: (
        nextView: LogoViewState,
        options?: { viewSnapEnabled?: boolean },
      ) => {
        setState((state) =>
          applyLogoPreviewViewState(state, nextView, options),
        );
      },
      editVoxel: (edit: VoxelEdit) => {
        setState((state) => ({
          ...state,
          isShuffleEnabled: false,
          voxelState: applyVoxelEdit(state.voxelState, edit),
        }));
      },
      resetView: () => {
        setState((state) => {
          const nextState = applyLogoPreviewViewState(state, {
            elevationDegrees: DEFAULT_ELEVATION_DEGREES,
            rotationDegrees: DEFAULT_ROTATION_DEGREES,
          });

          return {
            ...nextState,
            isAutoRotating: false,
            rotationAxisMode: DEFAULT_ROTATION_AXIS_MODE,
          };
        });
      },
      resetShape: () => {
        setState((state) => {
          const presetId =
            state.selectedPresetId === CUSTOM_LOGO_PRESET_ID
              ? DEFAULT_LOGO_PRESET_ID
              : state.selectedPresetId;
          const preset = getLogoPreset(presetId);

          return {
            ...state,
            isAutoRotating: false,
            isShuffleEnabled: false,
            selectedPresetId: presetId,
            voxelState: preset.voxelState,
          };
        });
      },
      rotateByDegrees: (deltaDegrees: number) => {
        setState((state) =>
          applyLogoPreviewViewState(state, {
            elevationDegrees: state.elevationDegrees,
            rotationDegrees: normalizeRotationDegrees(
              state.rotationDegrees + deltaDegrees,
            ),
          }),
        );
      },
      setElevationDegrees: (elevationDegrees: number) => {
        setState((state) => ({
          ...applyLogoPreviewViewState(state, {
            elevationDegrees: normalizeElevationDegrees(elevationDegrees),
            rotationDegrees: state.rotationDegrees,
          }),
          isAutoRotating: false,
        }));
      },
      setRotationDegrees: (rotationDegrees: number) => {
        setState((state) => ({
          ...applyLogoPreviewViewState(state, {
            elevationDegrees: state.elevationDegrees,
            rotationDegrees: normalizeRotationDegrees(rotationDegrees),
          }),
          isAutoRotating: false,
        }));
      },
      setViewSnapEnabled: (isViewSnapEnabled: boolean) => {
        setState((state) => {
          if (!isViewSnapEnabled) {
            return {
              ...state,
              isViewSnapEnabled: false,
            };
          }

          return {
            ...applyLogoPreviewViewState(
              state,
              {
                elevationDegrees: state.elevationDegrees,
                rotationDegrees: state.rotationDegrees,
              },
              { viewSnapEnabled: true },
            ),
            isViewSnapEnabled: true,
          };
        });
      },
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
      setIsoCubeSidePixels: (isoCubeSidePixels: number) => {
        setState((state) => ({
          ...state,
          isoCubeSidePixels:
            normalizeLogoIsometricCubeSidePixels(isoCubeSidePixels),
        }));
      },
      setIsoStyleId: (isoStyleId: LogoIsometricStyleId) => {
        setState((state) => ({
          ...state,
          isoStyleId,
        }));
      },
      setLogoOpacity: (logoOpacity: number) => {
        setState((state) => ({
          ...state,
          logoOpacity: clampLogoOpacity(logoOpacity),
        }));
      },
      setMobilePane: (mobilePane: MobileSidebarPane) => {
        setState((state) => ({
          ...state,
          mobilePane,
        }));
      },
      setPresetToCustom: () => {
        setState((state) => ({
          ...state,
          selectedPresetId: CUSTOM_LOGO_PRESET_ID,
        }));
      },
      setRotationAxisMode: (rotationAxisMode: LogoRotationAxisMode) => {
        setState((state) => ({
          ...state,
          rotationAxisMode,
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
      setThemeColorFamily: (
        themeColorKey: AppThemeColorKey,
        nextFamily: string,
      ) => {
        setState((state) => ({
          ...state,
          themeColors: {
            ...state.themeColors,
            [themeColorKey]: getTailwindColorTokenForSelection(
              nextFamily,
              getTailwindColorShade(state.themeColors[themeColorKey]),
              state.themeColors[themeColorKey],
            ),
          },
        }));
      },
      setThemeColorShade: (
        themeColorKey: AppThemeColorKey,
        nextShade: string,
      ) => {
        setState((state) => ({
          ...state,
          themeColors: {
            ...state.themeColors,
            [themeColorKey]: getTailwindColorTokenForSelection(
              getTailwindColorFamily(state.themeColors[themeColorKey]),
              nextShade,
              state.themeColors[themeColorKey],
            ),
          },
        }));
      },
      setThemeCustomColor: (
        themeColorKey: AppThemeColorKey,
        nextColor: string,
      ) => {
        const normalizedColor = expandHexColorToken(nextColor);
        if (!isLogoColorToken(normalizedColor)) {
          return;
        }

        setState((state) => ({
          ...state,
          themeColors: {
            ...state.themeColors,
            [themeColorKey]: normalizedColor,
          },
        }));
      },
      setThemeColors: (themeColors: AppThemeColors) => {
        setState((state) => ({
          ...state,
          themeColors,
        }));
      },
      syncRouteStoreState: (
        nextRouteStoreState: LogoPreviewRouteStoreState,
      ) => {
        setState((state) =>
          areLogoPreviewRouteStoreStatesEqual(state, nextRouteStoreState)
            ? state
            : {
                ...state,
                ...nextRouteStoreState,
              },
        );
      },
    }),
  );
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
      isoCubeSidePixels: readIsoCubeSidePixels(routeSearch),
      isoStyleId: readIsoStyleId(routeSearch),
      rotationAxisMode: readRotationAxisMode(routeSearch),
      rotationDegrees: readRotationDegrees(routeSearch),
      themeModeSearch: routeSearch,
      themeColors: readAppThemeColors(routeSearch),
      viewSnapEnabled: readViewSnapEnabled(routeSearch),
      voxelState: readVoxelState(routeSearch),
    }),
    routeSearch,
  );
}

const LOGO_ROUTE_SEARCH_KEYS = [
  "axis",
  "base",
  "dev",
  "elev",
  "freeView",
  "isoSide",
  "isoStyle",
  "dark",
  "light",
  "primary",
  "secondary",
  "rot",
  "vox",
] as const satisfies readonly (keyof LogoRouteSearch)[];

function areLogoRouteSearchesEqual(
  left: LogoRouteSearch,
  right: LogoRouteSearch,
): boolean {
  return LOGO_ROUTE_SEARCH_KEYS.every((key) => left[key] === right[key]);
}

function areAppThemeColorsEqual(
  left: AppThemeColors,
  right: AppThemeColors,
): boolean {
  return APP_THEME_COLOR_KEYS.every((key) => left[key] === right[key]);
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
          className="h-2 min-w-[10rem] flex-[999_1_10rem] cursor-pointer accent-[#8a88ac]"
        />
        <div className="ml-auto flex min-w-[7rem] flex-[1_0_7rem] justify-end">
          <Input
            aria-label={valueAriaLabel}
            type="number"
            inputMode={valueInputMode}
            min={min}
            max={max}
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
  const publicRightSidebarPane = usePublicRightSidebarPane();
  const isIsometricMode = renderMode === "iso";
  const store = useLogoPreviewStore(routeSearch);
  const state = useSelector(store);
  const { actions } = store;
  const { backgroundColor, faceColors } = useResolvedAppThemeColorState(
    state.themeColors,
  );
  const isAutoRotatingRef = useRef(state.isAutoRotating);
  const lastFrameTimeRef = useRef<number | null>(null);
  const viewSnapCheckboxId = useId();
  const faceColorAnimationCheckboxId = useId();
  const isSceneInteractingRef = useRef(state.isSceneInteracting);

  /**
   * Mirrors store flags needed by async callbacks so route-sync guards can read
   * the latest interaction state without waiting for a React render.
   */
  useEffect(() => {
    const syncLatestStateRefs = (latestState: LogoPreviewStoreState) => {
      isAutoRotatingRef.current = latestState.isAutoRotating;
      isSceneInteractingRef.current = latestState.isSceneInteracting;
    };

    syncLatestStateRefs(store.state);
    const subscription = store.subscribe(syncLatestStateRefs);

    return () => {
      subscription.unsubscribe();
    };
  }, [store]);

  /**
   * Pulls URL-owned logo state into the local store after navigation while
   * preserving local-only controls such as pane, motion, and edit mode.
   */
  useEffect(() => {
    if (
      !shouldSyncLogoPreviewQueryState({
        isAutoRotating: isAutoRotatingRef.current,
        isSceneInteracting: isSceneInteractingRef.current,
      })
    ) {
      return;
    }

    actions.syncRouteStoreState(readLogoPreviewRouteStoreState(routeSearch));
  }, [actions, routeSearch]);

  /**
   * Writes canonical shareable logo state back to route search once scene
   * interaction and auto-rotation are idle enough to avoid fighting live input.
   */
  useEffect(() => {
    if (
      !shouldSyncLogoPreviewQueryState({
        isAutoRotating: state.isAutoRotating,
        isSceneInteracting: state.isSceneInteracting,
      })
    ) {
      return;
    }

    const resolvedView = resolveLogoPreviewViewState(
      {
        elevationDegrees: state.elevationDegrees,
        rotationDegrees: state.rotationDegrees,
      },
      state.isViewSnapEnabled,
    );

    const nextSearch = preserveLogoRouteDevModeSearch(
      buildLogoRouteSearch({
        elevationDegrees: resolvedView.elevationDegrees,
        isoCubeSidePixels: state.isoCubeSidePixels,
        isoStyleId: state.isoStyleId,
        rotationAxisMode: state.rotationAxisMode,
        rotationDegrees: resolvedView.rotationDegrees,
        themeModeSearch: routeSearch,
        themeColors: state.themeColors,
        viewSnapEnabled: state.isViewSnapEnabled,
        voxelState: state.voxelState,
      }),
      routeSearch,
    );

    if (
      !areLogoRouteSearchesEqual(
        nextSearch,
        readCanonicalLogoRouteSearch(routeSearch),
      )
    ) {
      replaceRouteSearch(nextSearch);
    }
  }, [
    state.elevationDegrees,
    state.isAutoRotating,
    state.isSceneInteracting,
    state.isViewSnapEnabled,
    state.isoCubeSidePixels,
    state.isoStyleId,
    state.rotationAxisMode,
    state.rotationDegrees,
    state.themeColors,
    state.voxelState,
    replaceRouteSearch,
    routeSearch,
  ]);

  /**
   * Drives 3D auto-rotation with frame deltas and resets timing whenever
   * auto-rotation stops or the renderer switches away from 3D.
   */
  useEffect(() => {
    if (isIsometricMode || !state.isAutoRotating) {
      lastFrameTimeRef.current = null;
      return;
    }

    let animationFrameId = 0;

    const step = (timestamp: number) => {
      const lastFrameTime = lastFrameTimeRef.current;
      if (lastFrameTime !== null) {
        const deltaSeconds = (timestamp - lastFrameTime) / 1000;
        actions.advanceAutoRotation(deltaSeconds);
      }
      lastFrameTimeRef.current = timestamp;
      animationFrameId = window.requestAnimationFrame(step);
    };

    animationFrameId = window.requestAnimationFrame(step);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      lastFrameTimeRef.current = null;
    };
  }, [actions, state.isAutoRotating, isIsometricMode]);

  const selectedPreset =
    state.selectedPresetId === CUSTOM_LOGO_PRESET_ID
      ? null
      : getLogoPreset(state.selectedPresetId);
  const selectedIsoStyle = getLogoIsometricStyle(state.isoStyleId);
  const rotationAngleControlLabel =
    ROTATION_ANGLE_CONTROL_LABELS[state.rotationAxisMode];

  const modeSearch = preserveLogoRouteDevModeSearch(
    buildLogoRouteSearch({
      elevationDegrees: state.elevationDegrees,
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

  const logoScene = isIsometricMode ? (
    <NLogoIsoScene
      backgroundColor={backgroundColor}
      className="absolute inset-0 h-full w-full touch-none select-none"
      cubeSidePixels={state.isoCubeSidePixels}
      editMode={state.editMode}
      faceColors={faceColors}
      onVoxelEdit={actions.editVoxel}
      shuffleAnimation={{
        enabled: state.isShuffleEnabled,
        parallelMoves: state.shuffleParallelMoves,
      }}
      styleId={state.isoStyleId}
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
      onInteractionStart={() => {
        actions.setAutoRotating(false);
        actions.setSceneInteracting(true);
      }}
      onInteractionEnd={() => {
        actions.setSceneInteracting(false);
      }}
      onViewChange={actions.applyViewState}
      onVoxelEdit={actions.editVoxel}
      rotationAxisMode={state.rotationAxisMode}
      rotationDegrees={state.rotationDegrees}
      shuffleAnimation={{
        enabled: state.isShuffleEnabled,
        parallelMoves: state.shuffleParallelMoves,
      }}
      animateFaceColors={state.isFaceColorAnimationEnabled}
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
      className="flex h-full min-h-0 items-center justify-center [container-type:size]"
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
            variant={isIsometricMode ? "outline" : "default"}
            className={LOGO_CONTROL_BUTTON_CLASS_NAME}
          >
            <Link search={modeSearch} to="/logo">
              3D
            </Link>
          </Button>
          <Button
            asChild
            size="sm"
            variant={isIsometricMode ? "default" : "outline"}
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
        <Select
          value={state.selectedPresetId}
          onValueChange={(value) => {
            if (value === CUSTOM_LOGO_PRESET_ID) {
              actions.setPresetToCustom();
              return;
            }

            if (isLogoPresetId(value)) {
              actions.applyPreset(value);
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

        <div className={LOGO_CONTROL_BUTTON_ROW_CLASS_NAME}>
          <Button
            type="button"
            size="sm"
            variant={state.editMode === "add" ? "default" : "outline"}
            className={LOGO_CONTROL_BUTTON_CLASS_NAME}
            aria-pressed={state.editMode === "add"}
            onClick={() => {
              actions.setEditMode("add");
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
              actions.setEditMode("remove");
            }}
          >
            Remove
          </Button>
        </div>

        <div className={LOGO_CONTROL_STACK_CLASS_NAME}>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-full rounded-none"
            onClick={() => {
              actions.setThemeColors(DEFAULT_APP_THEME_COLORS);
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
              actions.setThemeColors(RGB_THEME_COLORS);
            }}
          >
            RGB colors
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-full rounded-none"
            onClick={actions.resetShape}
          >
            Reset shape
          </Button>
        </div>
      </LogoPreviewSection>

      {isIsometricMode ? (
        <LogoPreviewSection title="Isometric">
          <div className={LOGO_CONTROL_STACK_CLASS_NAME}>
            <LogoRangeControl
              label="Cube side"
              max={MAX_LOGO_ISOMETRIC_CUBE_SIDE_PX}
              min={MIN_LOGO_ISOMETRIC_CUBE_SIDE_PX}
              onSliderChange={actions.setIsoCubeSidePixels}
              onValueChange={actions.setIsoCubeSidePixels}
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
                actions.setIsoCubeSidePixels(
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
                  actions.setIsoStyleId(value);
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
                actions.setViewSnapEnabled(checked === true);
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
                    actions.setRotationAxisMode(mode);
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
            onSliderChange={actions.setRotationDegrees}
            onValueChange={actions.setRotationDegrees}
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
            onSliderChange={actions.setElevationDegrees}
            onValueChange={actions.setElevationDegrees}
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
            onSliderChange={actions.setLogoOpacity}
            onValueChange={actions.setLogoOpacity}
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
              onClick={actions.resetView}
            >
              Reset view
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={LOGO_CONTROL_BUTTON_CLASS_NAME}
              onClick={() => {
                actions.rotateByDegrees(45);
              }}
            >
              +45°
            </Button>
          </div>
        </LogoPreviewSection>
      )}

      <LogoPreviewSection title="Motion">
        <div className={LOGO_CONTROL_STACK_CLASS_NAME}>
          {!isIsometricMode ? (
            <Button
              type="button"
              size="sm"
              variant={state.isAutoRotating ? "default" : "outline"}
              className="w-full rounded-none"
              onClick={() => {
                actions.setAutoRotating(!state.isAutoRotating);
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
              actions.setShuffleEnabled(!state.isShuffleEnabled);
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
              actions.setShuffleParallelMoves(parseShuffleParallelMoves(value));
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

        {!isIsometricMode ? (
          <div className="flex items-start gap-3">
            <Checkbox
              id={faceColorAnimationCheckboxId}
              checked={state.isFaceColorAnimationEnabled}
              onCheckedChange={(checked) =>
                actions.setFaceColorAnimationEnabled(checked === true)
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
          {APP_THEME_COLOR_KEYS.map((themeColorKey) => (
            <ColorSwatch
              key={themeColorKey}
              color={getTailwindColorHex(state.themeColors[themeColorKey])}
              size="compact"
            />
          ))}
        </div>

        {APP_THEME_COLOR_KEYS.map((themeColorKey) => {
          const currentToken = state.themeColors[themeColorKey];

          return (
            <ThemeColorPicker
              key={themeColorKey}
              currentToken={currentToken}
              themeColorKey={themeColorKey}
              onCustomColorChange={actions.setThemeCustomColor}
              onFamilyChange={actions.setThemeColorFamily}
              onShadeChange={actions.setThemeColorShade}
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
      <SidebarProvider
        defaultOpen={true}
        defaultLeftDesktopWidthPx={LOGO_PREVIEW_SIDEBAR_WIDTH_PX}
        defaultLeftMobileWidthPx={LOGO_PREVIEW_SIDEBAR_WIDTH_PX}
        defaultRightOpen={true}
        defaultRightDesktopWidthPx={
          WORKSPACE_LAYOUT_V2_DESKTOP_SIDEBAR_MIN_WIDTH_PX
        }
        defaultRightMobileWidthPx={
          WORKSPACE_LAYOUT_V2_MOBILE_SIDEBAR_DEFAULT_WIDTH_PX
        }
        mobilePane={state.mobilePane}
        onMobilePaneChange={actions.setMobilePane}
        shortcutSidebarSide="left"
      >
        <WorkspaceLayoutV2FullPage
          left={{
            content: controlsContent,
          }}
          main={{
            content: sceneContent,
            headerTestId: "logo-preview-main-header",
          }}
          right={publicRightSidebarPane}
          leftToggleVisibility="all"
        />
      </SidebarProvider>
    </Layout>
  );
}
