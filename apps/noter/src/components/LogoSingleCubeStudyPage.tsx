import { Button } from "#src/components/ui/button.tsx";
import { type LogoRouteSearch } from "#src/lib/logoRouteSearch.ts";
import {
  SINGLE_CUBE_STUDY_CANVAS_SIZE,
  SINGLE_CUBE_STUDY_SAMPLE_ANGLES,
  drawSingleCubeStudy,
} from "#src/components/logoSingleCubeStudyRenderer.ts";
import { useCreateStore, useSelector } from "@tanstack/react-store";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

type LogoSingleCubeStudyState = {
  angleDegrees: number;
  showEdges: boolean;
  showGrid: boolean;
  vividColors: boolean;
};

const LOGO_SINGLE_CUBE_STUDY_INITIAL_STATE: LogoSingleCubeStudyState = {
  angleDegrees: 45,
  showEdges: false,
  showGrid: false,
  vividColors: true,
};

function useLogoSingleCubeStudyStore() {
  // Keep this store scoped to the route; the single-cube lab has no shareable
  // state beyond the surrounding dev-shell query params.
  return useCreateStore(
    LOGO_SINGLE_CUBE_STUDY_INITIAL_STATE,
    ({ setState }) => ({
      setAngleDegrees: (angleDegrees: number) => {
        setState((state) => ({
          ...state,
          angleDegrees,
        }));
      },
      toggleShowEdges: () => {
        setState((state) => ({
          ...state,
          showEdges: !state.showEdges,
        }));
      },
      toggleShowGrid: () => {
        setState((state) => ({
          ...state,
          showGrid: !state.showGrid,
        }));
      },
      toggleVividColors: () => {
        setState((state) => ({
          ...state,
          vividColors: !state.vividColors,
        }));
      },
    }),
  );
}

function CubeStudyCanvas({
  angleDegrees,
  className,
  showEdges,
  showGrid,
  vividColors,
}: {
  angleDegrees: number;
  className?: string;
  showEdges: boolean;
  showGrid: boolean;
  vividColors: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  /**
   * Redraws the pixel canvas when cube-study controls change because the canvas
   * bitmap is imperative output rather than React-managed DOM.
   */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d", {
      willReadFrequently: true,
    });
    if (!context) {
      return;
    }

    drawSingleCubeStudy(context, {
      showEdges,
      showGrid,
      vividColors,
      yawDegrees: angleDegrees,
    });
  }, [angleDegrees, showEdges, showGrid, vividColors]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      height={SINGLE_CUBE_STUDY_CANVAS_SIZE}
      style={{
        imageRendering: "pixelated",
      }}
      width={SINGLE_CUBE_STUDY_CANVAS_SIZE}
    />
  );
}

export function LogoSingleCubeStudyPage({
  routeSearch,
}: {
  routeSearch: LogoRouteSearch;
}) {
  const store = useLogoSingleCubeStudyStore();
  const { angleDegrees, showEdges, showGrid, vividColors } = useSelector(store);
  const {
    setAngleDegrees,
    toggleShowEdges,
    toggleShowGrid,
    toggleVividColors,
  } = store.actions;

  return (
    <div className="min-h-screen bg-[#f5f4ef] text-black">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-2 border border-black/10 bg-white/88 p-2 backdrop-blur-sm">
          <Button asChild size="sm" variant="outline" className="rounded-none">
            <Link search={routeSearch} to="/logo">
              3D
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="rounded-none">
            <Link search={routeSearch} to="/logo/iso">
              Iso
            </Link>
          </Button>
          <Button size="sm" className="rounded-none">
            Single Cube Study
          </Button>
        </div>

        <div className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
          <div className="grid content-start gap-4 border border-black/10 bg-white/88 p-4">
            <div>
              <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
                Angle Study
              </div>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight">
                Single Cube Rotation Lab
              </h1>
              <p className="mt-2 text-sm leading-6 text-black/60">
                One cube, one exact pixel baseline at 45°, and cleaner integer
                variants between 0° and 90°. Use this to see which snapped views
                still produce legible pixel steps before we change the full logo
                again.
              </p>
            </div>

            <div className="grid gap-2">
              <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
                <span>Yaw</span>
                <span>{angleDegrees.toFixed(0)}°</span>
              </div>
              <input
                type="range"
                min="0"
                max="90"
                step="1"
                value={angleDegrees}
                onChange={(event) => {
                  setAngleDegrees(Number(event.target.value));
                }}
                className="h-2 w-full cursor-pointer accent-black"
              />
              <div className="grid grid-cols-4 gap-2">
                {SINGLE_CUBE_STUDY_SAMPLE_ANGLES.map((presetAngle) => (
                  <Button
                    key={presetAngle}
                    type="button"
                    size="sm"
                    variant={
                      angleDegrees === presetAngle ? "default" : "outline"
                    }
                    className="rounded-none"
                    onClick={() => {
                      setAngleDegrees(presetAngle);
                    }}
                  >
                    {presetAngle}°
                  </Button>
                ))}
              </div>
            </div>

            <div className="grid gap-2">
              <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
                Overlays
              </div>
              <div className="grid grid-cols-1 gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={showEdges ? "default" : "outline"}
                  className="justify-start rounded-none"
                  onClick={toggleShowEdges}
                >
                  {showEdges ? "Hide edges" : "Show edges"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={vividColors ? "default" : "outline"}
                  className="justify-start rounded-none"
                  onClick={toggleVividColors}
                >
                  {vividColors ? "Use standard colors" : "Use vivid colors"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={showGrid ? "default" : "outline"}
                  className="justify-start rounded-none"
                  onClick={toggleShowGrid}
                >
                  {showGrid ? "Hide pixel grid" : "Show pixel grid"}
                </Button>
              </div>
            </div>

            <div className="border border-black/10 bg-[#fbfaf6] p-3 text-sm leading-6 text-black/60">
              <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
                What To Watch
              </div>
              <p className="mt-2">
                Look for repeated stair-step rhythms, readable top corners, and
                whether 45° matches the expected 2:1 diagonal baseline. Turn on
                the pixel grid only when you need it.
              </p>
            </div>
          </div>

          <div className="grid gap-6">
            <div className="grid gap-3 border border-black/10 bg-white/88 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
                    Workspace
                  </div>
                  <div className="mt-1 text-sm text-black/60">
                    Tight crop, enlarged pixels, current angle{" "}
                    {angleDegrees.toFixed(0)}°
                  </div>
                </div>
                <div className="font-mono text-[11px] text-black/45">
                  45° = exact 2:1
                </div>
              </div>
              <div className="flex min-h-[40rem] items-center justify-center border border-black/10 bg-[#fcfbf7] p-0">
                <CubeStudyCanvas
                  angleDegrees={angleDegrees}
                  className="h-[40rem] w-[40rem] max-w-full"
                  showEdges={showEdges}
                  showGrid={showGrid}
                  vividColors={vividColors}
                />
              </div>
            </div>

            <div className="grid gap-3 border border-black/10 bg-white/88 p-3">
              <div>
                <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
                  Snap Comparison
                </div>
                <div className="mt-1 text-sm text-black/60">
                  Quick read on the usual candidate angles between 0° and 90°.
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {SINGLE_CUBE_STUDY_SAMPLE_ANGLES.map((sampleAngle) => (
                  <button
                    key={sampleAngle}
                    type="button"
                    aria-pressed={angleDegrees === sampleAngle}
                    className="grid gap-2 border border-black/10 p-2 text-left aria-pressed:border-black"
                    onClick={() => {
                      setAngleDegrees(sampleAngle);
                    }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-black/80">
                        {sampleAngle}°
                      </span>
                      <span className="font-mono text-[10px] text-black/45">
                        yaw
                      </span>
                    </div>
                    <div className="flex items-center justify-center border border-black/10 bg-[#fcfbf7] p-0">
                      <CubeStudyCanvas
                        angleDegrees={sampleAngle}
                        className="h-44 w-44"
                        showEdges={showEdges}
                        showGrid={showGrid}
                        vividColors={vividColors}
                      />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
