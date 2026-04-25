import {
  LOGO_SHUFFLE_PARALLEL_OPTIONS,
  NLogoScene,
  type LogoShuffleParallelMoves,
} from "@/components/NLogoScene";
import { AppSidebarMetaSection } from "@/components/AppSidebarMetaSection";
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
  DEFAULT_FACE_COLORS,
  FACE_COLOR_KEYS,
  TAILWIND_COLOR_FAMILIES,
  getTailwindColorHex,
  getTailwindColorFamily,
  getTailwindColorFamilyHex,
  getTailwindColorShade,
  getTailwindColorShades,
  getTailwindColorTokenForSelection,
  isTailwindColorToken,
  type FaceColorKey,
  type FaceColors,
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
  buildLogoRouteSearch,
  type LogoRouteSearch,
} from "@/lib/logoRouteSearch";
import { shouldSyncLogoPreviewQueryState } from "@/lib/logoPreviewQuerySync";
import { PUBLIC_LANDING_LOGO_VIEW_DRAG_CONFIG } from "@/lib/publicLandingLogo";
import { cn } from "@/lib/utils";
import { Link } from "@tanstack/react-router";
import { PaletteIcon } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
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

const FACE_COLOR_LABELS: Record<FaceColorKey, string> = {
  left: "Left",
  right: "Right",
  top: "Top",
};
const RGB_FACE_COLORS: FaceColors = {
  left: "red-500",
  right: "green-500",
  top: "blue-500",
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

function readColorInputValue(token: string): string {
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

function FaceColorPicker({
  currentToken,
  faceColorKey,
  onCustomColorChange,
  onFamilyChange,
  onShadeChange,
}: {
  currentToken: string;
  faceColorKey: FaceColorKey;
  onCustomColorChange: (faceColorKey: FaceColorKey, nextColor: string) => void;
  onFamilyChange: (faceColorKey: FaceColorKey, nextFamily: string) => void;
  onShadeChange: (faceColorKey: FaceColorKey, nextShade: string) => void;
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
  const faceColorLabel = FACE_COLOR_LABELS[faceColorKey];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          aria-label={`${faceColorLabel} color picker`}
          className="h-auto w-full justify-between gap-3 rounded-none border-border bg-background px-2 py-2 text-left shadow-none"
          type="button"
          variant="outline"
        >
          <span className="flex min-w-0 items-center gap-2">
            <ColorSwatch color={currentColorHex} />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                {faceColorLabel}
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
        data-testid={`logo-color-picker-${faceColorKey}`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ColorSwatch color={currentColorHex} />
            <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              {faceColorLabel}
            </span>
          </div>
          <span className="truncate font-mono text-xs text-muted-foreground">
            {currentLabel}
          </span>
        </div>

        <div className="flex items-center gap-2 border border-border bg-background p-2">
          <Input
            aria-label={`${faceColorLabel} custom color`}
            className="h-10 w-14 shrink-0 cursor-pointer rounded-none border-border bg-background p-1 shadow-none"
            type="color"
            value={colorInputValue}
            onChange={(event) =>
              onCustomColorChange(faceColorKey, event.target.value)
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
                    onClick={() => onShadeChange(faceColorKey, shade)}
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
                  onClick={() => onFamilyChange(faceColorKey, family)}
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

function readFaceColors(routeSearch: LogoRouteSearch): FaceColors {
  return {
    left: routeSearch.leftColor ?? DEFAULT_FACE_COLORS.left,
    right: routeSearch.rightColor ?? DEFAULT_FACE_COLORS.right,
    top: routeSearch.topColor ?? DEFAULT_FACE_COLORS.top,
  };
}

function isLogoPresetId(value: string): value is LogoPresetId {
  return LOGO_PRESETS.some((preset) => preset.id === value);
}

function readCanonicalLogoRouteSearch(
  routeSearch: LogoRouteSearch,
): LogoRouteSearch {
  return buildLogoRouteSearch({
    elevationDegrees: readElevationDegrees(routeSearch),
    faceColors: readFaceColors(routeSearch),
    isoCubeSidePixels: readIsoCubeSidePixels(routeSearch),
    isoStyleId: readIsoStyleId(routeSearch),
    rotationAxisMode: readRotationAxisMode(routeSearch),
    rotationDegrees: readRotationDegrees(routeSearch),
    viewSnapEnabled: readViewSnapEnabled(routeSearch),
    voxelState: readVoxelState(routeSearch),
  });
}

const LOGO_ROUTE_SEARCH_KEYS = [
  "axis",
  "elev",
  "freeView",
  "isoSide",
  "isoStyle",
  "leftColor",
  "rightColor",
  "rot",
  "topColor",
  "vox",
] as const satisfies readonly (keyof LogoRouteSearch)[];

function areLogoRouteSearchesEqual(
  left: LogoRouteSearch,
  right: LogoRouteSearch,
): boolean {
  if (Object.keys(left).length !== Object.keys(right).length) {
    return false;
  }

  return LOGO_ROUTE_SEARCH_KEYS.every((key) => left[key] === right[key]);
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
  onSliderChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onValueChange: (event: ChangeEvent<HTMLInputElement>) => void;
  sliderAriaLabel: string;
  step: number | string;
  value: number | string;
  valueAriaLabel: string;
  valueInputMode?: "decimal" | "numeric";
  valueLabel: string | number;
  valueText: string;
}) {
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
          onChange={onSliderChange}
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
            onChange={onValueChange}
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
  const isIsometricMode = renderMode === "iso";
  const backgroundColor = getTailwindColorHex("background-base");
  const currentRouteSearch = readCanonicalLogoRouteSearch(routeSearch);
  const [mobilePane, setMobilePane] = useState<MobileSidebarPane>("left");
  const [isViewSnapEnabled, setIsViewSnapEnabled] = useState(() =>
    readViewSnapEnabled(routeSearch),
  );
  const [rotationDegrees, setRotationDegrees] = useState(
    () => readLogoPreviewView(routeSearch).rotationDegrees,
  );
  const [rotationAxisMode, setRotationAxisMode] = useState(() =>
    readRotationAxisMode(routeSearch),
  );
  const [elevationDegrees, setElevationDegrees] = useState(
    () => readLogoPreviewView(routeSearch).elevationDegrees,
  );
  const [voxelState, setVoxelState] = useState(() =>
    readVoxelState(routeSearch),
  );
  const [editMode, setEditMode] = useState<VoxelEdit["kind"]>("add");
  const [selectedPresetId, setSelectedPresetId] = useState<LogoPresetSelection>(
    () => readLogoPresetSelection(routeSearch),
  );
  const [isoCubeSidePixels, setIsoCubeSidePixels] = useState(() =>
    readIsoCubeSidePixels(routeSearch),
  );
  const [isoStyleId, setIsoStyleId] = useState<LogoIsometricStyleId>(() =>
    readIsoStyleId(routeSearch),
  );
  const [faceColors, setFaceColors] = useState<FaceColors>(() =>
    readFaceColors(routeSearch),
  );
  const [logoOpacity, setLogoOpacity] = useState(DEFAULT_LOGO_OPACITY);
  const [isFaceColorAnimationEnabled, setIsFaceColorAnimationEnabled] =
    useState(false);
  const [isAutoRotating, setIsAutoRotating] = useState(false);
  const isAutoRotatingRef = useRef(isAutoRotating);
  const [isShuffleEnabled, setIsShuffleEnabled] = useState(false);
  const [shuffleParallelMoves, setShuffleParallelMoves] =
    useState<LogoShuffleParallelMoves>(3);
  const lastFrameTimeRef = useRef<number | null>(null);
  const viewSnapCheckboxId = useId();
  const faceColorAnimationCheckboxId = useId();
  const [isSceneInteracting, setIsSceneInteracting] = useState(false);
  const isSceneInteractingRef = useRef(false);

  const setSceneInteracting = (nextValue: boolean) => {
    isSceneInteractingRef.current = nextValue;
    setIsSceneInteracting(nextValue);
  };

  useEffect(() => {
    isAutoRotatingRef.current = isAutoRotating;
  }, [isAutoRotating]);

  useEffect(() => {
    if (
      !shouldSyncLogoPreviewQueryState({
        isAutoRotating: isAutoRotatingRef.current,
        isSceneInteracting: isSceneInteractingRef.current,
      })
    ) {
      return;
    }

    const nextView = readLogoPreviewView(routeSearch);
    setRotationDegrees(nextView.rotationDegrees);
    setRotationAxisMode(readRotationAxisMode(routeSearch));
    setIsViewSnapEnabled(nextView.viewSnapEnabled);
    setElevationDegrees(nextView.elevationDegrees);
    setVoxelState(readVoxelState(routeSearch));
    setSelectedPresetId(readLogoPresetSelection(routeSearch));
    setIsoCubeSidePixels(readIsoCubeSidePixels(routeSearch));
    setIsoStyleId(readIsoStyleId(routeSearch));
    setFaceColors(readFaceColors(routeSearch));
  }, [routeSearch]);

  useEffect(() => {
    if (
      !shouldSyncLogoPreviewQueryState({
        isAutoRotating,
        isSceneInteracting,
      })
    ) {
      return;
    }

    const resolvedView = resolveLogoPreviewViewState(
      {
        elevationDegrees,
        rotationDegrees,
      },
      isViewSnapEnabled,
    );

    const nextSearch = buildLogoRouteSearch({
      elevationDegrees: resolvedView.elevationDegrees,
      faceColors,
      isoCubeSidePixels,
      isoStyleId,
      rotationAxisMode,
      rotationDegrees: resolvedView.rotationDegrees,
      viewSnapEnabled: isViewSnapEnabled,
      voxelState,
    });

    if (!areLogoRouteSearchesEqual(nextSearch, currentRouteSearch)) {
      replaceRouteSearch(nextSearch);
    }
  }, [
    currentRouteSearch,
    elevationDegrees,
    faceColors,
    isAutoRotating,
    isSceneInteracting,
    isViewSnapEnabled,
    isoCubeSidePixels,
    isoStyleId,
    replaceRouteSearch,
    rotationAxisMode,
    rotationDegrees,
    routeSearch,
    voxelState,
  ]);

  useEffect(() => {
    if (isIsometricMode || !isAutoRotating) {
      lastFrameTimeRef.current = null;
      return;
    }

    let animationFrameId = 0;

    const step = (timestamp: number) => {
      const lastFrameTime = lastFrameTimeRef.current;
      if (lastFrameTime !== null) {
        const deltaSeconds = (timestamp - lastFrameTime) / 1000;
        setRotationDegrees((currentRotationDegrees) =>
          normalizeRotationDegrees(
            currentRotationDegrees +
              deltaSeconds * AUTO_ROTATE_DEGREES_PER_SECOND,
          ),
        );
      }
      lastFrameTimeRef.current = timestamp;
      animationFrameId = window.requestAnimationFrame(step);
    };

    animationFrameId = window.requestAnimationFrame(step);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      lastFrameTimeRef.current = null;
    };
  }, [isAutoRotating, isIsometricMode]);

  useEffect(() => {
    if (!isIsometricMode) {
      return;
    }

    setIsAutoRotating(false);
  }, [isIsometricMode]);

  const applyViewState = (
    nextView: LogoViewState,
    options?: { viewSnapEnabled?: boolean },
  ) => {
    const resolvedView = resolveLogoPreviewViewState(
      nextView,
      options?.viewSnapEnabled ?? isViewSnapEnabled,
    );
    setRotationDegrees(resolvedView.rotationDegrees);
    setElevationDegrees(resolvedView.elevationDegrees);
  };

  const handleRotationChange = (event: ChangeEvent<HTMLInputElement>) => {
    setIsAutoRotating(false);
    applyViewState({
      elevationDegrees,
      rotationDegrees: normalizeRotationDegrees(Number(event.target.value)),
    });
  };

  const handleElevationChange = (event: ChangeEvent<HTMLInputElement>) => {
    setIsAutoRotating(false);
    applyViewState({
      elevationDegrees: normalizeElevationDegrees(Number(event.target.value)),
      rotationDegrees,
    });
  };

  const handleRotationInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextValue = Number(event.target.value);
    if (Number.isNaN(nextValue)) {
      return;
    }
    setIsAutoRotating(false);
    applyViewState({
      elevationDegrees,
      rotationDegrees: normalizeRotationDegrees(nextValue),
    });
  };

  const handleElevationInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextValue = Number(event.target.value);
    if (Number.isNaN(nextValue)) {
      return;
    }
    setIsAutoRotating(false);
    applyViewState({
      elevationDegrees: normalizeElevationDegrees(nextValue),
      rotationDegrees,
    });
  };

  const handleOpacityChange = (event: ChangeEvent<HTMLInputElement>) => {
    setLogoOpacity(clampLogoOpacity(Number(event.target.value)));
  };

  const handleOpacityInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextValue = Number(event.target.value);
    if (Number.isNaN(nextValue)) {
      return;
    }

    setLogoOpacity(clampLogoOpacity(nextValue));
  };

  const handleIsoCubeSidePixelsChange = (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    setIsoCubeSidePixels(
      normalizeLogoIsometricCubeSidePixels(Number(event.target.value)),
    );
  };

  const handleIsoCubeSidePixelsInputChange = (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const nextValue = Number(event.target.value);
    if (!Number.isFinite(nextValue)) {
      return;
    }

    setIsoCubeSidePixels(normalizeLogoIsometricCubeSidePixels(nextValue));
  };

  const handleSceneViewChange = ({
    elevationDegrees: nextElevationDegrees,
    rotationDegrees: nextRotationDegrees,
  }: {
    elevationDegrees: number;
    rotationDegrees: number;
  }) => {
    applyViewState({
      elevationDegrees: nextElevationDegrees,
      rotationDegrees: nextRotationDegrees,
    });
  };

  const handleVoxelEdit = (edit: VoxelEdit) => {
    setIsShuffleEnabled(false);
    setVoxelState((currentVoxelState) =>
      applyVoxelEdit(currentVoxelState, edit),
    );
  };

  const selectedPreset =
    selectedPresetId === CUSTOM_LOGO_PRESET_ID
      ? null
      : getLogoPreset(selectedPresetId);
  const selectedIsoStyle = getLogoIsometricStyle(isoStyleId);
  const rotationAngleControlLabel =
    ROTATION_ANGLE_CONTROL_LABELS[rotationAxisMode];
  const applyPreset = (presetId: Exclude<LogoPresetSelection, "custom">) => {
    const preset = getLogoPreset(presetId);
    setIsAutoRotating(false);
    setIsShuffleEnabled(false);
    setSelectedPresetId(presetId);
    setVoxelState(preset.voxelState);
  };

  const handleFaceColorFamilyChange = (
    faceColorKey: FaceColorKey,
    nextFamily: string,
  ) => {
    setFaceColors((currentFaceColors) => ({
      ...currentFaceColors,
      [faceColorKey]: getTailwindColorTokenForSelection(
        nextFamily,
        getTailwindColorShade(currentFaceColors[faceColorKey]),
        currentFaceColors[faceColorKey],
      ),
    }));
  };

  const handleFaceColorShadeChange = (
    faceColorKey: FaceColorKey,
    nextShade: string,
  ) => {
    setFaceColors((currentFaceColors) => ({
      ...currentFaceColors,
      [faceColorKey]: getTailwindColorTokenForSelection(
        getTailwindColorFamily(currentFaceColors[faceColorKey]),
        nextShade,
        currentFaceColors[faceColorKey],
      ),
    }));
  };

  const handleFaceColorPickerChange = (
    faceColorKey: FaceColorKey,
    nextColor: string,
  ) => {
    const normalizedColor = expandHexColorToken(nextColor);
    setFaceColors((currentFaceColors) => ({
      ...currentFaceColors,
      [faceColorKey]: normalizedColor,
    }));
  };

  const modeSearch = buildLogoRouteSearch({
    elevationDegrees,
    faceColors,
    isoCubeSidePixels,
    isoStyleId,
    rotationAxisMode,
    rotationDegrees,
    viewSnapEnabled: isViewSnapEnabled,
    voxelState,
  });

  const resetView = () => {
    setIsAutoRotating(false);
    setRotationAxisMode(DEFAULT_ROTATION_AXIS_MODE);
    applyViewState({
      elevationDegrees: DEFAULT_ELEVATION_DEGREES,
      rotationDegrees: DEFAULT_ROTATION_DEGREES,
    });
  };

  const resetShape = () => {
    if (selectedPreset !== null) {
      applyPreset(selectedPreset.id);
      return;
    }

    applyPreset(DEFAULT_LOGO_PRESET_ID);
  };

  const logoScene = isIsometricMode ? (
    <NLogoIsoScene
      backgroundColor={backgroundColor}
      className="absolute inset-0 h-full w-full touch-none select-none"
      cubeSidePixels={isoCubeSidePixels}
      editMode={editMode}
      faceColors={faceColors}
      onVoxelEdit={handleVoxelEdit}
      shuffleAnimation={{
        enabled: isShuffleEnabled,
        parallelMoves: shuffleParallelMoves,
      }}
      styleId={isoStyleId}
      voxelState={voxelState}
    />
  ) : (
    <NLogoScene
      backgroundColor={backgroundColor}
      className={cn(
        "absolute inset-0 h-full w-full touch-none select-none",
        isSceneInteracting ? "cursor-grabbing" : "cursor-grab",
      )}
      editMode={editMode}
      elevationDegrees={elevationDegrees}
      faceColors={faceColors}
      opacity={logoOpacity}
      onInteractionStart={() => {
        setIsAutoRotating(false);
        setSceneInteracting(true);
      }}
      onInteractionEnd={() => {
        setSceneInteracting(false);
      }}
      onViewChange={handleSceneViewChange}
      onVoxelEdit={handleVoxelEdit}
      rotationAxisMode={rotationAxisMode}
      rotationDegrees={rotationDegrees}
      shuffleAnimation={{
        enabled: isShuffleEnabled,
        parallelMoves: shuffleParallelMoves,
      }}
      animateFaceColors={isFaceColorAnimationEnabled}
      viewDragConfig={
        isViewSnapEnabled ? PUBLIC_LANDING_LOGO_VIEW_DRAG_CONFIG : undefined
      }
      voxelState={voxelState}
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
          value={selectedPresetId}
          onValueChange={(value) => {
            if (value === CUSTOM_LOGO_PRESET_ID) {
              setSelectedPresetId(CUSTOM_LOGO_PRESET_ID);
              return;
            }

            if (isLogoPresetId(value)) {
              applyPreset(value);
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
            variant={editMode === "add" ? "default" : "outline"}
            className={LOGO_CONTROL_BUTTON_CLASS_NAME}
            aria-pressed={editMode === "add"}
            onClick={() => {
              setEditMode("add");
            }}
          >
            Add
          </Button>
          <Button
            type="button"
            size="sm"
            variant={editMode === "remove" ? "default" : "outline"}
            className={LOGO_CONTROL_BUTTON_CLASS_NAME}
            aria-pressed={editMode === "remove"}
            onClick={() => {
              setEditMode("remove");
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
              setFaceColors(DEFAULT_FACE_COLORS);
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
              setFaceColors(RGB_FACE_COLORS);
            }}
          >
            RGB colors
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-full rounded-none"
            onClick={resetShape}
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
              onSliderChange={handleIsoCubeSidePixelsChange}
              onValueChange={handleIsoCubeSidePixelsInputChange}
              sliderAriaLabel="Cube side"
              step={LOGO_ISOMETRIC_CUBE_SIDE_STEP_PX}
              value={isoCubeSidePixels}
              valueAriaLabel="Cube side pixels"
              valueInputMode="numeric"
              valueLabel={isoCubeSidePixels}
              valueText={`${isoCubeSidePixels}px`}
            />
            <div className="text-xs text-muted-foreground">
              {isoCubeSidePixels}px edge / {isoCubeSidePixels / 2}px rise
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-full rounded-none"
              onClick={() => {
                setIsoCubeSidePixels(DEFAULT_LOGO_ISOMETRIC_CUBE_SIDE_PX);
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
              value={isoStyleId}
              onValueChange={(value) => {
                if (isLogoIsometricStyleId(value)) {
                  setIsoStyleId(value);
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
                    cubeSidePixels={isoCubeSidePixels}
                    faceColors={faceColors}
                    size={size}
                    styleId={isoStyleId}
                    voxelState={voxelState}
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
              checked={isViewSnapEnabled}
              onCheckedChange={(checked) => {
                const nextViewSnapEnabled = checked === true;
                setIsViewSnapEnabled(nextViewSnapEnabled);
                if (!nextViewSnapEnabled) {
                  return;
                }
                applyViewState(
                  {
                    elevationDegrees,
                    rotationDegrees,
                  },
                  { viewSnapEnabled: true },
                );
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
              <span>{ROTATION_AXIS_MODE_LABELS[rotationAxisMode]}</span>
            </div>
            <div className={LOGO_CONTROL_BUTTON_ROW_CLASS_NAME}>
              {ROTATION_AXIS_MODE_OPTIONS.map((mode) => (
                <Button
                  key={mode}
                  type="button"
                  size="sm"
                  variant={rotationAxisMode === mode ? "default" : "outline"}
                  className={LOGO_CONTROL_BUTTON_CLASS_NAME}
                  onClick={() => {
                    setRotationAxisMode(mode);
                  }}
                >
                  {ROTATION_AXIS_MODE_LABELS[mode]}
                </Button>
              ))}
            </div>
            {rotationAxisMode === "screen-vertical" ? (
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
            onSliderChange={handleRotationChange}
            onValueChange={handleRotationInputChange}
            sliderAriaLabel={`${rotationAngleControlLabel} slider`}
            step="0.1"
            value={rotationDegrees}
            valueAriaLabel={`${rotationAngleControlLabel} value`}
            valueLabel={rotationDegrees.toFixed(1)}
            valueText={`${rotationDegrees.toFixed(1)}°`}
          />

          <LogoRangeControl
            label="Elevation"
            max={MAX_ELEVATION_DEGREES}
            min={MIN_ELEVATION_DEGREES}
            onSliderChange={handleElevationChange}
            onValueChange={handleElevationInputChange}
            sliderAriaLabel="Elevation slider"
            step="0.1"
            value={elevationDegrees}
            valueAriaLabel="Elevation value"
            valueLabel={elevationDegrees.toFixed(1)}
            valueText={`${elevationDegrees.toFixed(1)}°`}
          />

          <LogoRangeControl
            label="Opacity"
            max={MAX_LOGO_OPACITY}
            min={MIN_LOGO_OPACITY}
            onSliderChange={handleOpacityChange}
            onValueChange={handleOpacityInputChange}
            sliderAriaLabel="Opacity slider"
            step={LOGO_OPACITY_STEP}
            value={logoOpacity}
            valueAriaLabel="Opacity value"
            valueLabel={logoOpacity.toFixed(2)}
            valueText={logoOpacity.toFixed(2)}
          />

          <div className={LOGO_CONTROL_BUTTON_ROW_CLASS_NAME}>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={LOGO_CONTROL_BUTTON_CLASS_NAME}
              onClick={resetView}
            >
              Reset view
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={LOGO_CONTROL_BUTTON_CLASS_NAME}
              onClick={() => {
                applyViewState({
                  elevationDegrees,
                  rotationDegrees: normalizeRotationDegrees(
                    rotationDegrees + 45,
                  ),
                });
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
              variant={isAutoRotating ? "default" : "outline"}
              className="w-full rounded-none"
              onClick={() => {
                setIsAutoRotating((currentValue) => !currentValue);
              }}
            >
              {isAutoRotating ? "Stop auto rotate" : "Start auto rotate"}
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant={isShuffleEnabled ? "default" : "outline"}
            className="w-full rounded-none"
            onClick={() => {
              setIsShuffleEnabled((currentValue) => !currentValue);
            }}
          >
            {isShuffleEnabled ? "Stop shuffle" : "Start shuffle"}
          </Button>
        </div>

        <div className={LOGO_CONTROL_STACK_CLASS_NAME}>
          <Label className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Parallel cubes
          </Label>
          <Select
            value={`${shuffleParallelMoves}`}
            onValueChange={(value) => {
              setShuffleParallelMoves(parseShuffleParallelMoves(value));
            }}
          >
            <SelectTrigger className="h-9 rounded-none border-border bg-background px-2 text-sm shadow-none">
              {shuffleParallelMoves}{" "}
              {shuffleParallelMoves === 1 ? "cube" : "cubes"}
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
              checked={isFaceColorAnimationEnabled}
              onCheckedChange={(checked) =>
                setIsFaceColorAnimationEnabled(checked === true)
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
          {FACE_COLOR_KEYS.map((faceColorKey) => (
            <ColorSwatch
              key={faceColorKey}
              color={getTailwindColorHex(faceColors[faceColorKey])}
              size="compact"
            />
          ))}
        </div>

        {FACE_COLOR_KEYS.map((faceColorKey) => {
          const currentToken = faceColors[faceColorKey];

          return (
            <FaceColorPicker
              key={faceColorKey}
              currentToken={currentToken}
              faceColorKey={faceColorKey}
              onCustomColorChange={handleFaceColorPickerChange}
              onFamilyChange={handleFaceColorFamilyChange}
              onShadeChange={handleFaceColorShadeChange}
            />
          );
        })}
      </LogoPreviewSection>

      <LogoPreviewSection title="Voxel Map">
        <pre className="overflow-x-auto border border-border bg-background p-2 font-mono text-[11px] text-muted-foreground">
          {voxelState}
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
        mobilePane={mobilePane}
        onMobilePaneChange={setMobilePane}
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
          right={{
            footer: <AppSidebarMetaSection side="right" />,
          }}
          leftToggleVisibility="all"
        />
      </SidebarProvider>
    </Layout>
  );
}
