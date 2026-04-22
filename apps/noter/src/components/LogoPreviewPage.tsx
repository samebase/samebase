import {
  LOGO_SHUFFLE_PARALLEL_OPTIONS,
  NLogoScene,
  type LogoShuffleParallelMoves,
} from "@/components/NLogoScene";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/collapsible";
import { Input } from "@/components/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
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
import { ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";

const AUTO_ROTATE_DEGREES_PER_SECOND = 18;
const CONTROLS_POPOVER_SIDE_OFFSET_PX = 10;
const CONTROLS_POPOVER_VIEWPORT_PADDING_PX = 16;
const DEFAULT_CONTROLS_POPOVER_MAX_HEIGHT =
  "calc(100dvh - env(safe-area-inset-top, 0px) - 5.5rem)";
const DEFAULT_LOGO_OPACITY = 1;
const DEFAULT_ROTATION_AXIS_MODE: LogoRotationAxisMode = "cube-y";
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
const EDIT_MODE_BUTTON_CLASS_NAMES: Record<VoxelEdit["kind"], string> = {
  add: "border-emerald-500/30 bg-emerald-500/15 text-emerald-950 hover:bg-emerald-500/25",
  remove: "border-red-500/30 bg-red-500/15 text-red-950 hover:bg-red-500/25",
};

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

function ColorSwatch({
  color,
  sizeClassName = "h-4 w-4",
}: {
  color: string;
  sizeClassName?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`${sizeClassName} shrink-0 border border-black/10`}
      style={{ backgroundColor: color }}
    />
  );
}

function ColorOptionContent({
  color,
  label,
}: {
  color: string;
  label: string;
}) {
  return (
    <div
      className="flex items-center gap-2 corner-notch-1 border px-2 py-1"
      style={{
        backgroundColor: `${color}18`,
        borderColor: `${color}40`,
      }}
    >
      <ColorSwatch color={color} />
      <span className="font-medium text-black/80">{label}</span>
    </div>
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

export function LogoPreviewPage({
  renderMode = "three",
  replaceRouteSearch,
  routeSearch,
}: LogoPreviewPageProps) {
  const isIsometricMode = renderMode === "iso";
  const backgroundColor = getTailwindColorHex("background-base");
  const controlsToolbarRef = useRef<HTMLDivElement | null>(null);
  const currentRouteSearch = readCanonicalLogoRouteSearch(routeSearch);
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
  const [isControlsOpen, setIsControlsOpen] = useState(false);
  const [isViewControlsOpen, setIsViewControlsOpen] = useState(false);
  const [isFaceColorsOpen, setIsFaceColorsOpen] = useState(false);
  const [isVoxelMapOpen, setIsVoxelMapOpen] = useState(false);
  const lastFrameTimeRef = useRef<number | null>(null);
  const [controlsPopoverMaxHeight, setControlsPopoverMaxHeight] = useState(
    DEFAULT_CONTROLS_POPOVER_MAX_HEIGHT,
  );
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
    const documentElementStyle = document.documentElement.style;
    const bodyStyle = document.body.style;
    const previousDocumentOverflow = documentElementStyle.overflow;
    const previousDocumentOverscrollBehavior =
      documentElementStyle.overscrollBehavior;
    const previousBodyOverflow = bodyStyle.overflow;
    const previousBodyOverscrollBehavior = bodyStyle.overscrollBehavior;

    documentElementStyle.overflow = "hidden";
    documentElementStyle.overscrollBehavior = "none";
    bodyStyle.overflow = "hidden";
    bodyStyle.overscrollBehavior = "none";

    return () => {
      documentElementStyle.overflow = previousDocumentOverflow;
      documentElementStyle.overscrollBehavior =
        previousDocumentOverscrollBehavior;
      bodyStyle.overflow = previousBodyOverflow;
      bodyStyle.overscrollBehavior = previousBodyOverscrollBehavior;
    };
  }, []);

  useEffect(() => {
    const toolbar = controlsToolbarRef.current;
    if (!toolbar) {
      return;
    }

    const updateControlsPopoverMaxHeight = () => {
      const nextMaxHeight = Math.max(
        window.innerHeight -
          toolbar.getBoundingClientRect().bottom -
          CONTROLS_POPOVER_SIDE_OFFSET_PX -
          CONTROLS_POPOVER_VIEWPORT_PADDING_PX,
        160,
      );
      setControlsPopoverMaxHeight(`${nextMaxHeight}px`);
    };

    updateControlsPopoverMaxHeight();

    const resizeObserver = new ResizeObserver(() => {
      window.requestAnimationFrame(updateControlsPopoverMaxHeight);
    });
    resizeObserver.observe(toolbar);

    window.addEventListener("resize", updateControlsPopoverMaxHeight);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateControlsPopoverMaxHeight);
    };
  }, []);

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
    setIsViewControlsOpen(false);
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
  const isPresetDirty =
    selectedPreset !== null && selectedPreset.voxelState !== voxelState;

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

  return (
    <div className="fixed inset-0 overflow-hidden" style={{ backgroundColor }}>
      {isIsometricMode ? (
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
      )}
      <div
        className="pointer-events-none absolute inset-x-3 top-0 z-10 flex items-start justify-between gap-3 pt-3 sm:inset-x-4 sm:pt-4"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <Popover open={isControlsOpen} onOpenChange={setIsControlsOpen}>
          <div
            ref={controlsToolbarRef}
            className="pointer-events-auto flex flex-wrap items-center gap-1.5 border border-black/10 bg-white/84 p-1.5 backdrop-blur-sm sm:gap-2 sm:p-2"
          >
            <PopoverTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="rounded-none"
              >
                Controls
              </Button>
            </PopoverTrigger>
            <div className="flex items-center gap-1 border border-black/10 bg-white/70 p-1">
              <Button
                asChild
                size="sm"
                variant={isIsometricMode ? "outline" : "default"}
                className="rounded-none"
              >
                <Link search={modeSearch} to="/logo">
                  3D
                </Link>
              </Button>
              <Button
                asChild
                size="sm"
                variant={isIsometricMode ? "default" : "outline"}
                className="rounded-none"
              >
                <Link search={modeSearch} to="/logo-iso">
                  Iso
                </Link>
              </Button>
              <Button
                asChild
                size="sm"
                variant="outline"
                className="rounded-none"
              >
                <Link search={modeSearch} to="/logo-svg">
                  SVG
                </Link>
              </Button>
              <Button
                asChild
                size="sm"
                variant="outline"
                className="rounded-none"
              >
                <Link search={modeSearch} to="/logo-iso-study">
                  Study
                </Link>
              </Button>
            </div>
            {!isIsometricMode && (
              <Button
                type="button"
                size="sm"
                className="rounded-none"
                onClick={() => {
                  setIsAutoRotating((currentValue) => !currentValue);
                }}
              >
                {isAutoRotating ? "Stop" : "Auto"}
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant={isShuffleEnabled ? "default" : "outline"}
              className="rounded-none"
              onClick={() => {
                setIsShuffleEnabled((currentValue) => !currentValue);
              }}
            >
              Shuffle
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-label={`Current edit mode: ${editMode}. Tap to switch modes.`}
              className={`rounded-none border-black/10 text-xs ${EDIT_MODE_BUTTON_CLASS_NAMES[editMode]}`}
              onClick={() => {
                setEditMode((currentMode) =>
                  currentMode === "add" ? "remove" : "add",
                );
              }}
            >
              {editMode === "add" ? "Add" : "Remove"}
            </Button>
          </div>
          <PopoverContent
            aria-label="Logo controls"
            align="start"
            side="bottom"
            sideOffset={CONTROLS_POPOVER_SIDE_OFFSET_PX}
            className="w-[min(22rem,calc(100vw-1.5rem))] overflow-y-auto overscroll-contain rounded-none border-black/10 bg-white/92 p-3 shadow-lg backdrop-blur-sm"
            style={{
              maxHeight: controlsPopoverMaxHeight,
            }}
          >
            <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
              Logo Controls
            </div>
            <div className="mt-1 text-xs text-black/55">
              {isIsometricMode
                ? `Fixed isometric view. Tap or click to ${editMode}. Use the green or red toolbar toggle to switch modes.`
                : `Drag to orbit. Tap or click to ${editMode}. Use the green or red toolbar toggle to switch modes.`}
            </div>
            <div className="mt-4 grid gap-3">
              {!isIsometricMode && (
                <>
                  <Collapsible
                    open={isViewControlsOpen}
                    onOpenChange={setIsViewControlsOpen}
                  >
                    <CollapsibleTrigger asChild>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between border border-black/10 bg-white/70 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.2em] text-black/55"
                      >
                        <span>View</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[10px] tracking-normal text-black/60">
                            {rotationDegrees.toFixed(0)}° /{" "}
                            {elevationDegrees.toFixed(0)}°
                          </span>
                          <ChevronDown
                            className={`h-4 w-4 transition-transform ${
                              isViewControlsOpen ? "rotate-180" : ""
                            }`}
                          />
                        </div>
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-3">
                      <div className="grid gap-3">
                        <div className="flex items-start gap-3 border border-black/10 bg-white/80 p-3">
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
                            className="mt-0.5 border-black/20"
                          />
                          <label
                            htmlFor={viewSnapCheckboxId}
                            className="grid gap-1 text-xs text-black/55"
                          >
                            <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
                              Snap View
                            </span>
                            <span>
                              Uses the same elevation and rotation snapping as
                              the landing page. Hold Alt or Shift while dragging
                              to bypass it.
                            </span>
                          </label>
                        </div>
                        <div className="grid gap-2">
                          <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
                            <span>Rotation Axis</span>
                            <span>
                              {ROTATION_AXIS_MODE_LABELS[rotationAxisMode]}
                            </span>
                          </div>
                          {rotationAxisMode === "screen-vertical" && (
                            <div className="text-xs text-black/55">
                              Experimental mode. It rotates around the current
                              screen-up axis, so changing elevation also changes
                              the resulting pose.
                            </div>
                          )}
                          <div className="grid grid-cols-2 gap-2">
                            {ROTATION_AXIS_MODE_OPTIONS.map((mode) => (
                              <Button
                                key={mode}
                                type="button"
                                size="sm"
                                variant={
                                  rotationAxisMode === mode
                                    ? "default"
                                    : "outline"
                                }
                                className="rounded-none"
                                onClick={() => {
                                  setRotationAxisMode(mode);
                                }}
                              >
                                {ROTATION_AXIS_MODE_LABELS[mode]}
                              </Button>
                            ))}
                          </div>
                        </div>
                        <div className="grid gap-2">
                          <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
                            <span>{rotationAngleControlLabel}</span>
                            <span>{rotationDegrees.toFixed(1)}°</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="range"
                              min="0"
                              max="360"
                              step="0.1"
                              value={rotationDegrees}
                              onChange={handleRotationChange}
                              className="h-2 w-full cursor-pointer accent-[#8a88ac]"
                            />
                            <Input
                              type="number"
                              inputMode="decimal"
                              min="0"
                              max="360"
                              step="0.1"
                              value={rotationDegrees.toFixed(1)}
                              onChange={handleRotationInputChange}
                              className="h-9 w-20 rounded-none border-black/10 bg-white/90 px-2 font-mono text-sm"
                            />
                          </div>
                        </div>
                        <div className="grid gap-2">
                          <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
                            <span>Elevation</span>
                            <span>{elevationDegrees.toFixed(1)}°</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="range"
                              min={MIN_ELEVATION_DEGREES}
                              max={MAX_ELEVATION_DEGREES}
                              step="0.1"
                              value={elevationDegrees}
                              onChange={handleElevationChange}
                              className="h-2 w-full cursor-pointer accent-[#8a88ac]"
                            />
                            <Input
                              type="number"
                              inputMode="decimal"
                              min={MIN_ELEVATION_DEGREES}
                              max={MAX_ELEVATION_DEGREES}
                              step="0.1"
                              value={elevationDegrees.toFixed(1)}
                              onChange={handleElevationInputChange}
                              className="h-9 w-20 rounded-none border-black/10 bg-white/90 px-2 font-mono text-sm"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="rounded-none"
                            onClick={() => {
                              setIsAutoRotating(false);
                              setRotationAxisMode(DEFAULT_ROTATION_AXIS_MODE);
                              applyViewState({
                                elevationDegrees: DEFAULT_ELEVATION_DEGREES,
                                rotationDegrees: DEFAULT_ROTATION_DEGREES,
                              });
                            }}
                          >
                            Reset view
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="rounded-none"
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
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                  <div className="grid gap-3 border border-black/10 bg-white/70 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
                          Material
                        </div>
                        <div className="mt-1 text-xs text-black/55">
                          Drives Three.js material opacity for quick alpha
                          studies.
                        </div>
                      </div>
                      <span className="font-mono text-[11px] text-black/60">
                        {(logoOpacity * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="grid gap-2">
                      <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
                        <span>Opacity</span>
                        <span>{logoOpacity.toFixed(2)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min={MIN_LOGO_OPACITY}
                          max={MAX_LOGO_OPACITY}
                          step={LOGO_OPACITY_STEP}
                          value={logoOpacity}
                          onChange={handleOpacityChange}
                          className="h-2 w-full cursor-pointer accent-[#8a88ac]"
                        />
                        <Input
                          type="number"
                          inputMode="decimal"
                          min={MIN_LOGO_OPACITY}
                          max={MAX_LOGO_OPACITY}
                          step={LOGO_OPACITY_STEP}
                          value={logoOpacity.toFixed(2)}
                          onChange={handleOpacityInputChange}
                          className="h-9 w-20 rounded-none border-black/10 bg-white/90 px-2 font-mono text-sm"
                        />
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="rounded-none"
                      onClick={() => {
                        setLogoOpacity(DEFAULT_LOGO_OPACITY);
                      }}
                    >
                      Reset opacity
                    </Button>
                  </div>
                </>
              )}
              <div className="grid gap-2 border border-black/10 bg-white/70 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
                      Shape Preset
                    </div>
                    <div className="mt-1 text-xs text-black/55">
                      {selectedPreset === null
                        ? "Current URL shape is custom."
                        : isPresetDirty
                          ? `Edited from ${selectedPreset.label}.`
                          : selectedPreset.description}
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="rounded-none"
                    disabled={selectedPreset === null}
                    onClick={() => {
                      if (selectedPreset !== null) {
                        applyPreset(selectedPreset.id);
                      }
                    }}
                  >
                    Reset preset
                  </Button>
                </div>
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
                  <SelectTrigger className="h-9 rounded-none border-black/10 bg-white/90 px-2 text-sm text-black/80 shadow-none">
                    {selectedPreset === null ? "Custom" : selectedPreset.label}
                  </SelectTrigger>
                  <SelectContent className="rounded-none border-black/10">
                    <SelectItem
                      value={CUSTOM_LOGO_PRESET_ID}
                      className="rounded-none"
                    >
                      Custom
                    </SelectItem>
                    {LOGO_PRESETS.map((preset) => (
                      <SelectItem
                        key={preset.id}
                        value={preset.id}
                        className="rounded-none"
                      >
                        <div className="grid gap-0.5">
                          <span>{preset.label}</span>
                          <span className="text-xs text-black/55">
                            {preset.description}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {isIsometricMode && (
                <div className="grid gap-2 border border-black/10 bg-white/70 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
                        Iso Studies
                      </div>
                      <div className="mt-1 text-xs text-black/55">
                        Compare alternate cube treatments before choosing a
                        favicon direction.
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
                        Active
                      </div>
                      <div className="mt-1 text-xs text-black/70">
                        {selectedIsoStyle.label}
                      </div>
                    </div>
                  </div>
                  <div className="grid gap-3 border-b border-black/10 pb-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
                          Cube Side
                        </div>
                        <div className="mt-1 text-xs text-black/55">
                          Raster source edge length. Two-pixel steps keep the
                          2:1 iso rise on whole pixels.
                        </div>
                      </div>
                      <span className="font-mono text-[11px] text-black/60">
                        {isoCubeSidePixels}px
                      </span>
                    </div>
                    <div className="grid gap-2">
                      <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
                        <span>Source Edge</span>
                        <span>
                          {isoCubeSidePixels}px / {isoCubeSidePixels / 2}px rise
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          aria-label="Cube side"
                          type="range"
                          min={MIN_LOGO_ISOMETRIC_CUBE_SIDE_PX}
                          max={MAX_LOGO_ISOMETRIC_CUBE_SIDE_PX}
                          step={LOGO_ISOMETRIC_CUBE_SIDE_STEP_PX}
                          value={isoCubeSidePixels}
                          onChange={handleIsoCubeSidePixelsChange}
                          className="h-2 w-full cursor-pointer accent-[#8a88ac]"
                        />
                        <Input
                          aria-label="Cube side pixels"
                          type="number"
                          inputMode="numeric"
                          min={MIN_LOGO_ISOMETRIC_CUBE_SIDE_PX}
                          max={MAX_LOGO_ISOMETRIC_CUBE_SIDE_PX}
                          step={LOGO_ISOMETRIC_CUBE_SIDE_STEP_PX}
                          value={isoCubeSidePixels}
                          onChange={handleIsoCubeSidePixelsInputChange}
                          className="h-9 w-20 rounded-none border-black/10 bg-white/90 px-2 font-mono text-sm"
                        />
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="rounded-none"
                      onClick={() => {
                        setIsoCubeSidePixels(
                          DEFAULT_LOGO_ISOMETRIC_CUBE_SIDE_PX,
                        );
                      }}
                    >
                      Reset size
                    </Button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {LOGO_ISOMETRIC_STYLES.map((style) => (
                      <button
                        key={style.id}
                        type="button"
                        aria-pressed={isoStyleId === style.id}
                        className={`grid gap-2 border p-2 text-left transition-colors ${
                          isoStyleId === style.id
                            ? "border-black bg-white"
                            : "border-black/10 bg-white/90 hover:border-black/30"
                        }`}
                        onClick={() => {
                          setIsoStyleId(style.id);
                        }}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-medium text-black/80">
                            {style.label}
                          </div>
                          <div className="font-mono text-[10px] text-black/45">
                            {style.capWidth}px cap
                            {style.edgeMode === "shaded" ? " + edge" : ""}
                          </div>
                        </div>
                        <div className="grid gap-2">
                          <div className="flex min-h-20 min-w-20 items-center justify-center border border-black/10 bg-white p-2">
                            <LogoIsoThumbnail
                              backgroundColor={backgroundColor}
                              cubeSidePixels={isoCubeSidePixels}
                              faceColors={faceColors}
                              size={72}
                              styleId={style.id}
                              voxelState={voxelState}
                            />
                          </div>
                          <div className="text-xs leading-5 text-black/55">
                            {style.description}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                  <div className="border-t border-black/10 pt-2">
                    <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
                      Icon Preview
                    </div>
                    <div className="mt-1 text-xs text-black/55">
                      Active style at favicon-relevant sizes.
                    </div>
                    <div className="mt-2 flex items-end gap-3">
                      {[16, 32, 64].map((size) => (
                        <div
                          key={size}
                          className="grid justify-items-center gap-1"
                        >
                          <div className="flex min-h-16 min-w-16 items-center justify-center border border-black/10 bg-white/90 p-2">
                            <LogoIsoThumbnail
                              backgroundColor={backgroundColor}
                              cubeSidePixels={isoCubeSidePixels}
                              faceColors={faceColors}
                              size={size}
                              styleId={isoStyleId}
                              voxelState={voxelState}
                            />
                          </div>
                          <span className="font-mono text-[10px] text-black/55">
                            {size}px
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <div className="grid gap-2 border border-black/10 bg-white/70 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
                      Cube Shuffle
                    </div>
                    <div className="mt-1 text-xs text-black/55">
                      Staggered starts. No immediate repeat on the same cube.
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant={isShuffleEnabled ? "default" : "outline"}
                    className="rounded-none"
                    onClick={() => {
                      setIsShuffleEnabled((currentValue) => !currentValue);
                    }}
                  >
                    {isShuffleEnabled ? "Stop" : "Start"}
                  </Button>
                </div>
                <div className="grid gap-2">
                  <Label className="text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
                    Parallel Cubes
                  </Label>
                  <Select
                    value={`${shuffleParallelMoves}`}
                    onValueChange={(value) => {
                      setShuffleParallelMoves(parseShuffleParallelMoves(value));
                    }}
                  >
                    <SelectTrigger className="h-9 rounded-none border-black/10 bg-white/90 px-2 text-sm text-black/80 shadow-none">
                      {shuffleParallelMoves}{" "}
                      {shuffleParallelMoves === 1 ? "cube" : "cubes"}
                    </SelectTrigger>
                    <SelectContent className="rounded-none border-black/10">
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
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="rounded-none"
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
                  className="rounded-none"
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
                  className="rounded-none"
                  onClick={() => {
                    if (selectedPreset !== null) {
                      applyPreset(selectedPreset.id);
                      return;
                    }

                    applyPreset(DEFAULT_LOGO_PRESET_ID);
                  }}
                >
                  Reset shape
                </Button>
              </div>
              {!isIsometricMode && (
                <div className="flex items-start gap-3 border border-black/10 bg-white/70 p-3">
                  <Checkbox
                    id={faceColorAnimationCheckboxId}
                    checked={isFaceColorAnimationEnabled}
                    onCheckedChange={(checked) =>
                      setIsFaceColorAnimationEnabled(checked === true)
                    }
                    className="mt-0.5 border-black/20"
                  />
                  <label
                    htmlFor={faceColorAnimationCheckboxId}
                    className="grid gap-1 text-xs text-black/55"
                  >
                    <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
                      Animate Face Colors
                    </span>
                    <span>
                      Slowly cycle the visible cube faces through nearby hues
                      from the current palette.
                    </span>
                  </label>
                </div>
              )}
              <Collapsible
                open={isFaceColorsOpen}
                onOpenChange={setIsFaceColorsOpen}
              >
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between border border-black/10 bg-white/70 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.2em] text-black/55"
                  >
                    <span>Face Colors</span>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        {FACE_COLOR_KEYS.map((faceColorKey) => (
                          <ColorSwatch
                            key={faceColorKey}
                            color={getTailwindColorHex(
                              faceColors[faceColorKey],
                            )}
                            sizeClassName="h-3.5 w-3.5"
                          />
                        ))}
                      </div>
                      <ChevronDown
                        className={`h-4 w-4 transition-transform ${
                          isFaceColorsOpen ? "rotate-180" : ""
                        }`}
                      />
                    </div>
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3">
                  <div className="grid gap-3">
                    {FACE_COLOR_KEYS.map((faceColorKey) => {
                      const currentToken = faceColors[faceColorKey];
                      const currentFamily =
                        getTailwindColorFamily(currentToken);
                      const currentShade = getTailwindColorShade(currentToken);
                      const availableShades =
                        getTailwindColorShades(currentFamily);
                      const currentFamilyHex =
                        getTailwindColorFamilyHex(currentFamily);

                      return (
                        <div key={faceColorKey} className="grid gap-2">
                          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
                            <ColorSwatch
                              color={getTailwindColorHex(currentToken)}
                              sizeClassName="h-3.5 w-3.5"
                            />
                            <Label className="text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
                              {FACE_COLOR_LABELS[faceColorKey]}
                            </Label>
                          </div>
                          <div className="grid gap-2 sm:grid-cols-2">
                            <Select
                              value={currentFamily}
                              onValueChange={(value) =>
                                handleFaceColorFamilyChange(faceColorKey, value)
                              }
                            >
                              <SelectTrigger
                                aria-label={`${FACE_COLOR_LABELS[faceColorKey]} family`}
                                className="h-9 rounded-none border-black/10 bg-white/90 px-2 text-sm text-black/80 shadow-none"
                              >
                                <ColorOptionContent
                                  color={currentFamilyHex}
                                  label={currentFamily}
                                />
                              </SelectTrigger>
                              <SelectContent className="rounded-none border-black/10">
                                {TAILWIND_COLOR_FAMILIES.map((family) => (
                                  <SelectItem
                                    key={family}
                                    value={family}
                                    className="rounded-none"
                                  >
                                    <ColorOptionContent
                                      color={getTailwindColorFamilyHex(family)}
                                      label={family}
                                    />
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Select
                              value={currentShade}
                              onValueChange={(value) =>
                                handleFaceColorShadeChange(faceColorKey, value)
                              }
                            >
                              <SelectTrigger
                                aria-label={`${FACE_COLOR_LABELS[faceColorKey]} shade`}
                                className="h-9 rounded-none border-black/10 bg-white/90 px-2 text-sm text-black/80 shadow-none"
                              >
                                <ColorOptionContent
                                  color={getTailwindColorHex(currentToken)}
                                  label={currentShade}
                                />
                              </SelectTrigger>
                              <SelectContent className="rounded-none border-black/10">
                                {availableShades.map((shade) => {
                                  const shadeToken =
                                    getTailwindColorTokenForSelection(
                                      currentFamily,
                                      shade,
                                      currentToken,
                                    );
                                  const shadeHex =
                                    getTailwindColorHex(shadeToken);

                                  return (
                                    <SelectItem
                                      key={shade}
                                      value={shade}
                                      className="rounded-none"
                                    >
                                      <ColorOptionContent
                                        color={shadeHex}
                                        label={shade}
                                      />
                                    </SelectItem>
                                  );
                                })}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CollapsibleContent>
              </Collapsible>
              <Collapsible
                open={isVoxelMapOpen}
                onOpenChange={setIsVoxelMapOpen}
              >
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between border border-black/10 bg-white/70 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.2em] text-black/55"
                  >
                    <span>Voxel Map</span>
                    <ChevronDown
                      className={`h-4 w-4 transition-transform ${
                        isVoxelMapOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3">
                  <pre className="overflow-x-auto border border-black/10 bg-white/90 p-3 font-mono text-[11px] text-black/70">
                    {voxelState}
                  </pre>
                </CollapsibleContent>
              </Collapsible>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
