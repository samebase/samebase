import {
  LOGO_SHUFFLE_PARALLEL_OPTIONS,
  NLogoScene,
  type LogoShuffleParallelMoves,
} from "@/components/NLogoScene";
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
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useSearchParams } from "react-router-dom";

const AUTO_ROTATE_DEGREES_PER_SECOND = 18;
const CONTROLS_POPOVER_TOP_OFFSET = "5.5rem";
const FACE_COLOR_LABELS: Record<FaceColorKey, string> = {
  left: "Left",
  right: "Right",
  top: "Top",
};

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
      className="flex items-center gap-2 rounded-sm border px-2 py-1"
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

function readVoxelState(searchParams: URLSearchParams): string {
  const parsedState = parseVoxelState(searchParams.get("vox"));
  if (parsedState === null) {
    return DEFAULT_VOXEL_STATE;
  }
  return serializeVoxelState(parsedState);
}

function readLogoPresetSelection(
  searchParams: URLSearchParams,
): LogoPresetSelection {
  return getLogoPresetSelection(readVoxelState(searchParams));
}

function isLogoPresetId(value: string): value is LogoPresetId {
  return LOGO_PRESETS.some((preset) => preset.id === value);
}

export function LogoPreviewPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const backgroundColor = getTailwindColorHex("background-base");
  const [rotationDegrees, setRotationDegrees] = useState(
    DEFAULT_ROTATION_DEGREES,
  );
  const [elevationDegrees, setElevationDegrees] = useState(
    DEFAULT_ELEVATION_DEGREES,
  );
  const [voxelState, setVoxelState] = useState(() =>
    readVoxelState(searchParams),
  );
  const [selectedPresetId, setSelectedPresetId] = useState<LogoPresetSelection>(
    () => readLogoPresetSelection(searchParams),
  );
  const [faceColors, setFaceColors] = useState<FaceColors>(DEFAULT_FACE_COLORS);
  const [isAutoRotating, setIsAutoRotating] = useState(false);
  const [isShuffleEnabled, setIsShuffleEnabled] = useState(false);
  const [shuffleParallelMoves, setShuffleParallelMoves] =
    useState<LogoShuffleParallelMoves>(3);
  const [isControlsOpen, setIsControlsOpen] = useState(false);
  const [isViewControlsOpen, setIsViewControlsOpen] = useState(false);
  const [isFaceColorsOpen, setIsFaceColorsOpen] = useState(false);
  const [isVoxelMapOpen, setIsVoxelMapOpen] = useState(false);
  const lastFrameTimeRef = useRef<number | null>(null);

  useEffect(() => {
    setVoxelState(readVoxelState(searchParams));
    setSelectedPresetId(readLogoPresetSelection(searchParams));
  }, [searchParams]);

  useEffect(() => {
    const nextSearchParams = new URLSearchParams();
    nextSearchParams.set("vox", voxelState);

    if (nextSearchParams.toString() !== searchParams.toString()) {
      setSearchParams(nextSearchParams, { replace: true });
    }
  }, [searchParams, setSearchParams, voxelState]);

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
    if (!isAutoRotating) {
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
  }, [isAutoRotating]);

  const handleRotationChange = (event: ChangeEvent<HTMLInputElement>) => {
    setIsAutoRotating(false);
    setRotationDegrees(normalizeRotationDegrees(Number(event.target.value)));
  };

  const handleElevationChange = (event: ChangeEvent<HTMLInputElement>) => {
    setIsAutoRotating(false);
    setElevationDegrees(normalizeElevationDegrees(Number(event.target.value)));
  };

  const handleRotationInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextValue = Number(event.target.value);
    if (Number.isNaN(nextValue)) {
      return;
    }
    setIsAutoRotating(false);
    setRotationDegrees(normalizeRotationDegrees(nextValue));
  };

  const handleElevationInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextValue = Number(event.target.value);
    if (Number.isNaN(nextValue)) {
      return;
    }
    setIsAutoRotating(false);
    setElevationDegrees(normalizeElevationDegrees(nextValue));
  };

  const handleSceneViewChange = ({
    elevationDegrees: nextElevationDegrees,
    rotationDegrees: nextRotationDegrees,
  }: {
    elevationDegrees: number;
    rotationDegrees: number;
  }) => {
    setRotationDegrees(nextRotationDegrees);
    setElevationDegrees(nextElevationDegrees);
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

  return (
    <div className="fixed inset-0 overflow-hidden" style={{ backgroundColor }}>
      <NLogoScene
        backgroundColor={backgroundColor}
        className="absolute inset-0 h-full w-full cursor-grab touch-none select-none active:cursor-grabbing"
        elevationDegrees={elevationDegrees}
        faceColors={faceColors}
        onInteractionStart={() => {
          setIsAutoRotating(false);
        }}
        onViewChange={handleSceneViewChange}
        onVoxelEdit={handleVoxelEdit}
        rotationDegrees={rotationDegrees}
        shuffleAnimation={{
          enabled: isShuffleEnabled,
          parallelMoves: shuffleParallelMoves,
        }}
        voxelState={voxelState}
      />
      <div
        className="pointer-events-none fixed inset-x-3 top-3 z-10 flex items-start justify-between gap-3 sm:inset-x-4 sm:top-4"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <Popover open={isControlsOpen} onOpenChange={setIsControlsOpen}>
          <div className="pointer-events-auto flex items-center gap-2 border border-black/10 bg-white/84 p-2 backdrop-blur-sm">
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
          </div>
          <PopoverContent
            align="start"
            side="bottom"
            sideOffset={10}
            className="w-[min(22rem,calc(100vw-1.5rem))] overflow-y-auto overscroll-contain rounded-none border-black/10 bg-white/92 p-3 shadow-lg backdrop-blur-sm"
            style={{
              maxHeight: `calc(100dvh - env(safe-area-inset-top, 0px) - ${CONTROLS_POPOVER_TOP_OFFSET})`,
            }}
          >
            <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
              Logo Controls
            </div>
            <div className="mt-1 text-xs text-black/55">
              Drag to orbit. Left adds. Right removes.
            </div>
            <div className="mt-4 grid gap-3">
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
                    <div className="grid gap-2">
                      <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
                        <span>Yaw</span>
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
                          setRotationDegrees(DEFAULT_ROTATION_DEGREES);
                          setElevationDegrees(DEFAULT_ELEVATION_DEGREES);
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
                          setRotationDegrees((currentRotationDegrees) =>
                            normalizeRotationDegrees(
                              currentRotationDegrees + 45,
                            ),
                          );
                        }}
                      >
                        +45°
                      </Button>
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
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
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="rounded-none"
                  onClick={() => {
                    setFaceColors(DEFAULT_FACE_COLORS);
                  }}
                >
                  Reset colors
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
