import { NLogoScene } from "@/components/NLogoScene";
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
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  clampElevationDegrees,
  normalizeRotationDegrees,
  parseVoxelState,
  serializeVoxelState,
  type VoxelEdit,
} from "@/components/logoVoxelState";
import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useSearchParams } from "react-router-dom";

const AUTO_ROTATE_DEGREES_PER_SECOND = 18;
const FACE_COLOR_LABELS: Record<FaceColorKey, string> = {
  left: "Left",
  right: "Right",
  top: "Top",
};

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

export function LogoPreviewPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [rotationDegrees, setRotationDegrees] = useState(
    DEFAULT_ROTATION_DEGREES,
  );
  const [elevationDegrees, setElevationDegrees] = useState(
    DEFAULT_ELEVATION_DEGREES,
  );
  const [voxelState, setVoxelState] = useState(() =>
    readVoxelState(searchParams),
  );
  const [faceColors, setFaceColors] = useState<FaceColors>(DEFAULT_FACE_COLORS);
  const [isAutoRotating, setIsAutoRotating] = useState(false);
  const [isFaceColorsOpen, setIsFaceColorsOpen] = useState(false);
  const [isVoxelMapOpen, setIsVoxelMapOpen] = useState(false);
  const lastFrameTimeRef = useRef<number | null>(null);

  useEffect(() => {
    setVoxelState(readVoxelState(searchParams));
  }, [searchParams]);

  useEffect(() => {
    const nextSearchParams = new URLSearchParams();
    nextSearchParams.set("vox", voxelState);

    if (nextSearchParams.toString() !== searchParams.toString()) {
      setSearchParams(nextSearchParams, { replace: true });
    }
  }, [searchParams, setSearchParams, voxelState]);

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
    setElevationDegrees(clampElevationDegrees(Number(event.target.value)));
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
    setElevationDegrees(clampElevationDegrees(nextValue));
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
    setVoxelState((currentVoxelState) =>
      applyVoxelEdit(currentVoxelState, edit),
    );
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
    <div className="min-h-screen w-full bg-[#f5f5f0]">
      <div className="mx-auto grid min-h-screen w-full max-w-[1280px] gap-4 px-4 py-4 sm:px-8 lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-6 lg:px-8 lg:py-6">
        <div className="border border-black/10 bg-white/80 p-3 backdrop-blur-sm lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:self-start lg:overflow-y-auto">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
                Logo
              </div>
              <div className="mt-1 text-xs text-black/55">
                Drag to orbit. Left adds. Right removes.
              </div>
            </div>
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
          </div>
          <div className="mt-4 grid gap-3">
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
                  setIsAutoRotating(false);
                  setVoxelState(DEFAULT_VOXEL_STATE);
                }}
              >
                Reset shape
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="rounded-none"
                onClick={() => {
                  setRotationDegrees((currentRotationDegrees) =>
                    normalizeRotationDegrees(currentRotationDegrees + 45),
                  );
                }}
              >
                +45°
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
                          color={getTailwindColorHex(faceColors[faceColorKey])}
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
                    const currentFamily = getTailwindColorFamily(currentToken);
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
            <Collapsible open={isVoxelMapOpen} onOpenChange={setIsVoxelMapOpen}>
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
        </div>
        <div className="flex min-h-[52vh] items-center justify-center lg:min-h-[calc(100vh-3rem)]">
          <NLogoScene
            className="h-[52vh] min-h-[360px] w-full cursor-grab touch-none select-none active:cursor-grabbing lg:h-[calc(100vh-3rem)]"
            elevationDegrees={elevationDegrees}
            faceColors={faceColors}
            onInteractionStart={() => {
              setIsAutoRotating(false);
            }}
            onViewChange={handleSceneViewChange}
            onVoxelEdit={handleVoxelEdit}
            rotationDegrees={rotationDegrees}
            voxelState={voxelState}
          />
        </div>
      </div>
    </div>
  );
}
