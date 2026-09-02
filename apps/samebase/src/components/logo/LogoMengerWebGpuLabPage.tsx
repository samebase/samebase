import { AppWorkspaceRouteChrome } from "@/components/AppWorkspaceShell";
import { LogoSquareTouchSurface } from "@/components/logo/LogoSquareTouchSurface";
import { MengerTypeGpuScene } from "@/components/logo/MengerTypeGpuScene";
import { type LogoViewState } from "@/components/logo/logoViewDrag";
import {
  MENGER_TYPE_GPU_MAXIMUM_DEPTH,
  MENGER_TYPE_GPU_MAXIMUM_RESOLUTION_SCALE,
  MENGER_TYPE_GPU_MINIMUM_DEPTH,
  MENGER_TYPE_GPU_MINIMUM_RESOLUTION_SCALE,
  MENGER_TYPE_GPU_RESOLUTION_SCALE_STEP,
  type MengerTypeGpuSettings,
} from "@/components/logo/mengerTypeGpuSettings";
import { Button } from "@/components/ui/button";
import { useResolvedAppThemeColorState } from "@/lib/appThemeColorSearch";
import { DEFAULT_ELEVATION_DEGREES, DEFAULT_ROTATION_DEGREES } from "@samebase/logo-model/voxel";
import { Link } from "@tanstack/react-router";
import { useMemo, useState, type ChangeEvent } from "react";

function readRangeValue(event: ChangeEvent<HTMLInputElement>): number {
  return Number(event.target.value);
}

export function LogoMengerWebGpuLabPage({
  depth,
  onSettingsChange,
  resolutionScale,
}: MengerTypeGpuSettings & {
  onSettingsChange: (nextSettings: MengerTypeGpuSettings) => void;
}) {
  const { backgroundColor, faceColors } = useResolvedAppThemeColorState({});
  const [view, setView] = useState<LogoViewState>({
    elevationDegrees: DEFAULT_ELEVATION_DEGREES,
    rotationDegrees: DEFAULT_ROTATION_DEGREES,
  });
  const conceptualCellCount = 20 ** depth;
  const controls = useMemo(
    () => (
      <div className="grid content-start gap-4 p-3" data-testid="logo-menger-webgpu-controls">
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild className="rounded-none" size="sm" variant="outline">
            <Link to="/logo/hover/menger">WebGL Menger</Link>
          </Button>
          <div
            aria-current="page"
            className="inline-flex h-8 items-center border border-foreground bg-foreground px-3 text-sm font-medium text-background"
          >
            TypeGPU Menger
          </div>
        </div>

        <div className="grid gap-2">
          <div className="flex items-center justify-between text-xs">
            <label htmlFor="menger-webgpu-depth">Depth</label>
            <output className="font-mono text-muted-foreground" htmlFor="menger-webgpu-depth">
              {depth}
            </output>
          </div>
          <input
            id="menger-webgpu-depth"
            aria-label="Menger depth"
            className="h-2 w-full cursor-pointer accent-foreground"
            max={MENGER_TYPE_GPU_MAXIMUM_DEPTH}
            min={MENGER_TYPE_GPU_MINIMUM_DEPTH}
            onChange={(event) => {
              onSettingsChange({
                depth: readRangeValue(event),
                resolutionScale,
              });
            }}
            step="1"
            type="range"
            value={depth}
          />
        </div>

        <div className="grid gap-2">
          <div className="flex items-center justify-between text-xs">
            <label htmlFor="menger-webgpu-resolution">Resolution</label>
            <output className="font-mono text-muted-foreground" htmlFor="menger-webgpu-resolution">
              {Math.round(resolutionScale * 100)}%
            </output>
          </div>
          <input
            id="menger-webgpu-resolution"
            aria-label="Render resolution"
            className="h-2 w-full cursor-pointer accent-foreground"
            max={MENGER_TYPE_GPU_MAXIMUM_RESOLUTION_SCALE}
            min={MENGER_TYPE_GPU_MINIMUM_RESOLUTION_SCALE}
            onChange={(event) => {
              onSettingsChange({
                depth,
                resolutionScale: readRangeValue(event),
              });
            }}
            step={MENGER_TYPE_GPU_RESOLUTION_SCALE_STEP}
            type="range"
            value={resolutionScale}
          />
        </div>

        <Button
          className="rounded-none"
          onClick={() => {
            setView({
              elevationDegrees: DEFAULT_ELEVATION_DEGREES,
              rotationDegrees: DEFAULT_ROTATION_DEGREES,
            });
          }}
          type="button"
          variant="outline"
        >
          Reset view
        </Button>

        <div className="grid gap-1 border-t pt-3 font-mono text-xs text-muted-foreground">
          <div>1 full-screen triangle</div>
          <div>{conceptualCellCount.toLocaleString()} conceptual cells</div>
          <div>128 maximum ray steps</div>
        </div>
      </div>
    ),
    [conceptualCellCount, depth, onSettingsChange, resolutionScale],
  );
  const leftPane = useMemo(() => ({ content: controls }), [controls]);

  return (
    <AppWorkspaceRouteChrome left={leftPane}>
      <div
        className="h-full min-h-0 w-full"
        data-conceptual-cell-count={conceptualCellCount}
        data-depth={depth}
        data-testid="logo-menger-webgpu-page"
        style={{ backgroundColor }}
      >
        <LogoSquareTouchSurface dataTestId="logo-menger-webgpu-scene-frame">
          <MengerTypeGpuScene
            backgroundColor={backgroundColor}
            depth={depth}
            elevationDegrees={view.elevationDegrees}
            faceColors={faceColors}
            onViewChange={setView}
            resolutionScale={resolutionScale}
            rotationDegrees={view.rotationDegrees}
          />
        </LogoSquareTouchSurface>
      </div>
    </AppWorkspaceRouteChrome>
  );
}
