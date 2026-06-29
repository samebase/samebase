import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import {
  STATIC_LOGO_ELEVATION_DEGREES,
  STATIC_LOGO_ROTATION_DEGREES,
} from "@/components/logo/logoStaticSvgContract";
import {
  TRANSFORM_LAB_VIEW_BOX,
  createTransformLabScene,
} from "@/components/logo/logoTransitionTransformFaces";
import { normalizeRotationDegrees } from "@/components/logo/logoVoxelState";
import { useEffect, useMemo, useState } from "react";

const ROTATION_PRESETS = [0, 45, 90, 135, 180, 225, 270, 315] as const;
const ROTATION_STEP_INTERVAL_MS = 40;
const DEFAULT_ROTATION_SPEED = 24;
const ELEVATION_MIN_DEGREES = -85;
const ELEVATION_MAX_DEGREES = 85;

export function LogoTransitionTransformsLabPage() {
  const [elevationDegrees, setElevationDegrees] = useState(STATIC_LOGO_ELEVATION_DEGREES);
  const [rotationDegrees, setRotationDegrees] = useState(STATIC_LOGO_ROTATION_DEGREES);
  const [rotationSpeed, setRotationSpeed] = useState(DEFAULT_ROTATION_SPEED);
  const [isAnimating, setIsAnimating] = useState(true);

  useEffect(() => {
    if (!isAnimating) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setRotationDegrees((currentRotationDegrees) =>
        normalizeRotationDegrees(
          currentRotationDegrees + (rotationSpeed * ROTATION_STEP_INTERVAL_MS) / 1000,
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
    <div className="mx-auto grid max-w-7xl gap-6 p-4 text-black sm:px-6">
      <div className="flex flex-wrap items-center gap-2 border border-black/10 bg-white p-2">
        <Button asChild size="sm" variant="outline" className="rounded-none">
          <Link to="/logo">3D</Link>
        </Button>
        <Button asChild size="sm" variant="outline" className="rounded-none">
          <Link to="/logo/iso">Iso</Link>
        </Button>
        <Button asChild size="sm" variant="outline" className="rounded-none">
          <Link to="/logo/svg">SVG</Link>
        </Button>
        <Button asChild size="sm" variant="outline" className="rounded-none">
          <Link to="/logo/single-cube">Study</Link>
        </Button>
        <Button asChild size="sm" variant="outline" className="rounded-none">
          <Link to="/logo/transition">Literal Lab</Link>
        </Button>
        <div
          aria-current="page"
          className="inline-flex h-9 items-center border border-black bg-black px-3 text-sm font-medium text-white"
        >
          Transform Lab
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="grid content-start gap-4 border border-black/10 bg-white p-4">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
              Setup
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">
              Single Cube Transform Lab
            </h1>
            <p className="mt-2 text-sm leading-6 text-black/60">
              This version starts from one canonical cube. All face corners are defined in unit{" "}
              <code>0/1</code> coordinates, then the SVG is assembled from <code>&lt;use&gt;</code>{" "}
              transforms plus a projected X/Y/Z axis guide.
            </p>
          </div>

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
                  setElevationDegrees(STATIC_LOGO_ELEVATION_DEGREES);
                }}
              >
                Reset Elevation
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
                  variant={Math.round(rotationDegrees) === presetAngle ? "default" : "outline"}
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

          <div className="grid gap-2 border border-black/10 bg-[#fbfaf6] p-3">
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
                  setRotationDegrees(STATIC_LOGO_ROTATION_DEGREES);
                }}
              >
                Reset 45°
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

          <div className="grid gap-2 border border-black/10 bg-[#fbfaf6] p-3 text-sm leading-6 text-black/65">
            <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
              Readout
            </div>
            <div>{`Faces: ${scene.faces.length}`}</div>
            <div>{`Elevation: ${elevationDegrees.toFixed(6)}°`}</div>
            <div>{`Rotation: ${rotationDegrees.toFixed(6)}°`}</div>
            <div>{`ViewBox: ${TRANSFORM_LAB_VIEW_BOX.width} × ${TRANSFORM_LAB_VIEW_BOX.height}`}</div>
          </div>

          <div className="border border-black/10 bg-[#fbfaf6] p-3 text-sm leading-6 text-black/60">
            <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
              Notes
            </div>
            <p className="mt-2">
              The preview and the textarea below are the same string. As the view changes, the exact
              SVG markup updates with the current face transform matrices and projected axis
              overlay.
            </p>
          </div>
        </div>

        <div className="grid gap-4">
          <div className="grid gap-3 border border-black/10 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
                  Workspace
                </div>
                <div className="mt-1 text-sm text-black/60">
                  Single cube preview with projected axes. Current rotation{" "}
                  {rotationDegrees.toFixed(2)}°, elevation {elevationDegrees.toFixed(2)}°
                </div>
              </div>
              <div className="font-mono text-[11px] text-black/45">
                /logo-transition-lab-transforms
              </div>
            </div>
            <div className="flex min-h-[38rem] items-center justify-center border border-black/10 bg-[#fcfbf7] p-4">
              <div
                className="w-full max-w-[42rem]"
                dangerouslySetInnerHTML={{ __html: scene.svgMarkup }}
              />
            </div>
          </div>

          <div className="grid gap-3 border border-black/10 bg-white p-4">
            <div>
              <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
                Live SVG
              </div>
              <div className="mt-1 text-sm text-black/60">
                Exact source for the current frame. This stays visible even while the preview is
                animating.
              </div>
            </div>
            <textarea
              readOnly
              spellCheck={false}
              value={scene.svgMarkup}
              className="min-h-[18rem] w-full resize-y border border-black/10 bg-[#fcfbf7] p-4 font-mono text-base leading-6 text-black"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
