import { Button } from "@/components/button";
import { createTransformLabScene } from "@/components/logoTransitionTransformFaces";
import { normalizeRotationDegrees } from "@/components/logoVoxelState";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

const ROTATION_PRESETS = [0, 45, 90, 135, 180, 225, 270, 315] as const;
const ROTATION_STEP_INTERVAL_MS = 40;
const DEFAULT_ROTATION_SPEED = 24;
const DEFAULT_ROTATION_DEGREES = 0;
const DEFAULT_ELEVATION_DEGREES = 0;
const ELEVATION_MIN_DEGREES = -85;
const ELEVATION_MAX_DEGREES = 85;

export function LogoTransitionTransformsLabPage() {
  const [elevationDegrees, setElevationDegrees] = useState(
    DEFAULT_ELEVATION_DEGREES,
  );
  const [rotationDegrees, setRotationDegrees] = useState(
    DEFAULT_ROTATION_DEGREES,
  );
  const [rotationSpeed, setRotationSpeed] = useState(DEFAULT_ROTATION_SPEED);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (!isAnimating) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setRotationDegrees((currentRotationDegrees) =>
        normalizeRotationDegrees(
          currentRotationDegrees +
            (rotationSpeed * ROTATION_STEP_INTERVAL_MS) / 1000,
        ),
      );
    }, ROTATION_STEP_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isAnimating, rotationSpeed]);

  const scene = useMemo(
    () =>
      createTransformLabScene({
        elevationDegrees,
        rotationDegrees,
      }),
    [elevationDegrees, rotationDegrees],
  );

  return (
    <div className="min-h-screen bg-[#f5f4ef] text-black">
      <div className="mx-auto flex min-h-screen w-full max-w-full flex-col gap-4 px-3 py-3">
        <div className="flex flex-wrap items-center gap-2 border border-black/10 bg-white/88 p-2 backdrop-blur-sm">
          <Button asChild size="sm" variant="outline" className="rounded-none">
            <Link to="/logo">3D</Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="rounded-none">
            <Link to="/logo-iso">Iso</Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="rounded-none">
            <Link to="/logo-svg">SVG</Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="rounded-none">
            <Link to="/logo-iso-study">Study</Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="rounded-none">
            <Link to="/logo-transition-lab">Literal Lab</Link>
          </Button>
          <div
            aria-current="page"
            className="inline-flex h-9 items-center border border-black bg-black px-3 text-sm font-medium text-white"
          >
            Transform Lab
          </div>
        </div>

        <div className="grid gap-3">
          <details className="border border-black/10 bg-white/88">
            <summary className="cursor-pointer list-none px-3 py-2 text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
              Controls
            </summary>
            <div className="grid gap-3 border-t border-black/10 p-3">
              <div className="grid gap-2">
                <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
                  <span>Elevation</span>
                  <span>{elevationDegrees.toFixed(2)}°</span>
                </div>
                <input
                  type="range"
                  min={ELEVATION_MIN_DEGREES}
                  max={ELEVATION_MAX_DEGREES}
                  step="0.1"
                  value={elevationDegrees}
                  onChange={(event) => {
                    setElevationDegrees(Number(event.target.value));
                  }}
                  className="h-2 w-full cursor-pointer accent-black"
                />
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="rounded-none"
                    onClick={() => {
                      setElevationDegrees(DEFAULT_ELEVATION_DEGREES);
                    }}
                  >
                    Reset 0°
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="rounded-none"
                    onClick={() => {
                      setElevationDegrees(0);
                    }}
                  >
                    Flat 0°
                  </Button>
                </div>
              </div>

              <div className="grid gap-2">
                <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
                  <span>Rotation</span>
                  <span>{rotationDegrees.toFixed(2)}°</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="360"
                  step="0.1"
                  value={rotationDegrees}
                  onChange={(event) => {
                    setRotationDegrees(Number(event.target.value));
                  }}
                  className="h-2 w-full cursor-pointer accent-black"
                />
                <div className="grid grid-cols-4 gap-2">
                  {ROTATION_PRESETS.map((presetAngle) => (
                    <Button
                      key={presetAngle}
                      type="button"
                      size="sm"
                      variant={
                        Math.round(rotationDegrees) === presetAngle
                          ? "default"
                          : "outline"
                      }
                      className="rounded-none"
                      onClick={() => {
                        setRotationDegrees(presetAngle);
                      }}
                    >
                      {presetAngle}°
                    </Button>
                  ))}
                </div>
              </div>

              <div className="grid gap-2 border border-black/10 bg-[#fbfaf6] p-2">
                <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
                  <span>Orbit</span>
                  <span>{rotationSpeed.toFixed(0)}°/s</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={isAnimating ? "default" : "outline"}
                    className="rounded-none"
                    onClick={() => {
                      setIsAnimating((currentValue) => !currentValue);
                    }}
                  >
                    {isAnimating ? "Pause" : "Play"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="rounded-none"
                    onClick={() => {
                      setRotationDegrees(DEFAULT_ROTATION_DEGREES);
                    }}
                  >
                    Reset 0°
                  </Button>
                </div>
                <input
                  type="range"
                  min="6"
                  max="90"
                  step="1"
                  value={rotationSpeed}
                  onChange={(event) => {
                    setRotationSpeed(Number(event.target.value));
                  }}
                  className="h-2 w-full cursor-pointer accent-black"
                />
              </div>

              <div className="grid gap-1 text-sm leading-6 text-black/65">
                <span>{`Faces: ${scene.faces.length}`}</span>
                <span>{`Elevation: ${elevationDegrees.toFixed(2)}°`}</span>
                <span>{`Rotation: ${rotationDegrees.toFixed(2)}°`}</span>
              </div>
            </div>
          </details>

          <div className="grid gap-3">
            <div className="grid gap-2 border border-black/10 bg-white/88 p-2">
              <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
                Preview
              </div>
              <div className="flex min-h-[16.8rem] h-[30.8vh] items-center justify-center border border-black/10 bg-[#fcfbf7] p-2">
                <div
                  className="block h-auto w-full"
                  dangerouslySetInnerHTML={{ __html: scene.svgMarkup }}
                />
              </div>
            </div>
          </div>

          <div className="border border-black/10 bg-white/88 p-2">
            <textarea
              spellCheck={false}
              value={scene.svgMarkup}
              className="h-[70vh] w-full resize-y border border-black/10 bg-[#fcfbf7] p-2 font-mono text-xs leading-5 text-black outline-none"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
