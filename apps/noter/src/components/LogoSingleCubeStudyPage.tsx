import { Button } from "@/components/ui/button";
import {
  SINGLE_CUBE_STUDY_CANVAS_SIZE,
  SINGLE_CUBE_STUDY_SAMPLE_ANGLES,
  drawSingleCubeStudy,
} from "@/components/logoSingleCubeStudyRenderer";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";

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

export function LogoSingleCubeStudyPage() {
  const location = useLocation();
  const [angleDegrees, setAngleDegrees] = useState(45);
  const [showEdges, setShowEdges] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [vividColors, setVividColors] = useState(true);
  const modeHref = (pathname: "/logo" | "/logo-iso" | "/logo-svg") =>
    location.search ? `${pathname}${location.search}` : pathname;

  return (
    <div className="min-h-screen bg-[#f5f4ef] text-black">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-2 border border-black/10 bg-white/88 p-2 backdrop-blur-sm">
          <Button asChild size="sm" variant="outline" className="rounded-none">
            <Link to={modeHref("/logo")}>3D</Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="rounded-none">
            <Link to={modeHref("/logo-iso")}>Iso</Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="rounded-none">
            <Link to={modeHref("/logo-svg")}>SVG</Link>
          </Button>
          <div
            aria-current="page"
            className="inline-flex h-9 items-center border border-black bg-black px-3 text-sm font-medium text-white"
          >
            Single Cube Study
          </div>
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
                One cube, one fixed camera pitch, multiple yaw angles. Use this
                to see which snapped views still produce legible pixel steps
                before we change the full logo again.
              </p>
            </div>

            <div className="grid gap-2">
              <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
                <label htmlFor="single-cube-study-yaw-range">Yaw</label>
                <span>{angleDegrees.toFixed(0)}°</span>
              </div>
              <input
                id="single-cube-study-yaw-range"
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
                {[0, 30, 45, 60].map((presetAngle) => (
                  <Button
                    key={presetAngle}
                    type="button"
                    aria-pressed={angleDegrees === presetAngle}
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
                  onClick={() => {
                    setShowEdges((currentValue) => !currentValue);
                  }}
                >
                  {showEdges ? "Hide edges" : "Show edges"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={vividColors ? "default" : "outline"}
                  className="justify-start rounded-none"
                  onClick={() => {
                    setVividColors((currentValue) => !currentValue);
                  }}
                >
                  {vividColors ? "Use standard colors" : "Use vivid colors"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={showGrid ? "default" : "outline"}
                  className="justify-start rounded-none"
                  onClick={() => {
                    setShowGrid((currentValue) => !currentValue);
                  }}
                >
                  {showGrid ? "Hide grid" : "Show grid"}
                </Button>
              </div>
            </div>

            <div className="border border-black/10 bg-[#fbfaf6] p-3 text-sm leading-6 text-black/60">
              <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
                What To Watch
              </div>
              <p className="mt-2">
                Look for repeated stair-step rhythms, readable top corners, and
                whether the side faces still feel like a cube instead of a
                warped diamond. The grid makes irregular jumps easier to spot.
              </p>
            </div>
          </div>

          <div className="grid gap-6">
            <div className="grid gap-3 border border-black/10 bg-white/88 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
                    Workspace
                  </div>
                  <div className="mt-1 text-sm text-black/60">
                    Current study angle: {angleDegrees.toFixed(0)}°
                  </div>
                </div>
                <div className="font-mono text-[11px] text-black/45">
                  pitch 35.264°
                </div>
              </div>
              <div className="flex min-h-[22rem] items-center justify-center border border-black/10 bg-[#fcfbf7] p-4">
                <CubeStudyCanvas
                  angleDegrees={angleDegrees}
                  className="h-[22rem] w-[22rem] max-w-full"
                  showEdges={showEdges}
                  showGrid={showGrid}
                  vividColors={vividColors}
                />
              </div>
            </div>

            <div className="grid gap-3 border border-black/10 bg-white/88 p-4">
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
                    className={`grid gap-2 border p-3 text-left transition-colors ${
                      angleDegrees === sampleAngle
                        ? "border-black bg-[#fcfbf7]"
                        : "border-black/10 bg-white hover:border-black/30"
                    }`}
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
                    <div className="flex items-center justify-center border border-black/10 bg-[#fcfbf7] p-2">
                      <CubeStudyCanvas
                        angleDegrees={sampleAngle}
                        className="h-28 w-28"
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
