import { Button } from "@/components/ui/button";
import {
  RASTER_SEAM_LAB_DEFAULT_DEPTH,
  RASTER_SEAM_LAB_DEFAULT_ELEVATION_DEGREES,
  RASTER_SEAM_LAB_DEFAULT_GRID_SIZE,
  RASTER_SEAM_LAB_DEFAULT_MERGE_MODE,
  RASTER_SEAM_LAB_DEFAULT_ROTATION_DEGREES,
  RASTER_SEAM_LAB_DEPTHS,
  RASTER_SEAM_LAB_EMPTY_STATS,
  RASTER_SEAM_LAB_GRID_SIZES,
  RASTER_SEAM_LAB_DEFAULT_SOURCE_SIZE_PX,
  RASTER_SEAM_LAB_MERGE_MODES,
  RASTER_SEAM_LAB_SAMPLE_ROTATIONS,
  RASTER_SEAM_LAB_SOURCE_SIZES,
  drawLogoRasterSeamLabImage,
  getLogoRasterSeamLabStats,
  normalizeRasterSeamLabDepth,
  normalizeRasterSeamLabGridSize,
  type RasterSeamLabDepth,
  type RasterSeamLabGridSize,
  type RasterSeamLabImageKind,
  type RasterSeamLabMergeMode,
  type RasterSeamLabResult,
} from "@/components/logoRasterSeamLabRenderer";
import {
  normalizeElevationDegrees,
  normalizeRotationDegrees,
} from "@/components/logoVoxelState";
import { type LogoRouteSearch } from "@/lib/logoRouteSearch";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

type SeamLabZoom = "large" | "small";

const EMPTY_SEAM_RESULT = {
  coveredPixels: 0,
  meanSquaredError: 0,
  seamPixels: 0,
  stats: RASTER_SEAM_LAB_EMPTY_STATS,
} satisfies RasterSeamLabResult;

const ZOOM_CLASS_NAMES = {
  large: "h-[28rem] w-[28rem] max-w-full",
  small: "h-32 w-32",
} as const satisfies Record<SeamLabZoom, string>;

const IMAGE_KIND_LABELS = {
  composed: "Composed",
  mask: "Mask",
  reference: "Reference",
} as const satisfies Record<RasterSeamLabImageKind, string>;

function getMergeModeLabel(mergeMode: RasterSeamLabMergeMode) {
  return (
    RASTER_SEAM_LAB_MERGE_MODES.find((mode) => mode.value === mergeMode)
      ?.label ?? mergeMode
  );
}

function SeamLabCanvas({
  depth,
  elevationDegrees,
  gridSize,
  imageKind,
  mergeMode,
  rotationDegrees,
  sourceSizePx,
  zoom,
}: {
  depth: RasterSeamLabDepth;
  elevationDegrees: number;
  gridSize: RasterSeamLabGridSize;
  imageKind: RasterSeamLabImageKind;
  mergeMode: RasterSeamLabMergeMode;
  rotationDegrees: number;
  sourceSizePx: number;
  zoom: SeamLabZoom;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [result, setResult] = useState<RasterSeamLabResult>(EMPTY_SEAM_RESULT);

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

    setResult(
      drawLogoRasterSeamLabImage(context, {
        depth,
        elevationDegrees,
        gridSize,
        imageKind,
        mergeMode,
        rotationDegrees,
        sourceSizePx,
      }),
    );
  }, [
    depth,
    elevationDegrees,
    gridSize,
    imageKind,
    mergeMode,
    rotationDegrees,
    sourceSizePx,
  ]);

  const seamRatio =
    result.coveredPixels > 0 ? result.seamPixels / result.coveredPixels : 0;

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="font-medium text-black/80">
          {IMAGE_KIND_LABELS[imageKind]}
        </span>
        <span className="font-mono text-black/50">
          {result.seamPixels} / {result.coveredPixels} (
          {(seamRatio * 100).toFixed(1)}%) err{" "}
          {(result.meanSquaredError * 100).toFixed(1)}%
        </span>
      </div>
      <div className="flex items-center justify-center border border-black/10 bg-white p-0">
        <canvas
          ref={canvasRef}
          className={ZOOM_CLASS_NAMES[zoom]}
          data-logo-raster-seam-lab={imageKind}
          height={sourceSizePx}
          style={{ imageRendering: "pixelated" }}
          width={sourceSizePx}
        />
      </div>
    </div>
  );
}

function AngleSweepCanvas({
  depth,
  elevationDegrees,
  gridSize,
  mergeMode,
  rotationDegrees,
  sourceSizePx,
}: {
  depth: RasterSeamLabDepth;
  elevationDegrees: number;
  gridSize: RasterSeamLabGridSize;
  mergeMode: RasterSeamLabMergeMode;
  rotationDegrees: number;
  sourceSizePx: number;
}) {
  return (
    <div className="grid gap-2 border border-black/10 bg-white p-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-black/80">
          {rotationDegrees}°
        </span>
        <span className="font-mono text-[10px] text-black/45">
          {sourceSizePx}px
        </span>
      </div>
      <SeamLabCanvas
        depth={depth}
        elevationDegrees={elevationDegrees}
        gridSize={gridSize}
        imageKind="mask"
        mergeMode={mergeMode}
        rotationDegrees={rotationDegrees}
        sourceSizePx={sourceSizePx}
        zoom="small"
      />
    </div>
  );
}

function MergeModeSweepCanvas({
  depth,
  elevationDegrees,
  gridSize,
  mergeMode,
  rotationDegrees,
  sourceSizePx,
}: {
  depth: RasterSeamLabDepth;
  elevationDegrees: number;
  gridSize: RasterSeamLabGridSize;
  mergeMode: RasterSeamLabMergeMode;
  rotationDegrees: number;
  sourceSizePx: number;
}) {
  return (
    <div className="grid gap-2 border border-black/10 bg-white p-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-black/80">
          {getMergeModeLabel(mergeMode)}
        </span>
        <span className="font-mono text-[10px] text-black/45">
          {sourceSizePx}px
        </span>
      </div>
      <SeamLabCanvas
        depth={depth}
        elevationDegrees={elevationDegrees}
        gridSize={gridSize}
        imageKind="mask"
        mergeMode={mergeMode}
        rotationDegrees={rotationDegrees}
        sourceSizePx={sourceSizePx}
        zoom="small"
      />
    </div>
  );
}

export function LogoRasterSeamLabPage({
  routeSearch,
}: {
  routeSearch: LogoRouteSearch;
}) {
  const [baseGridSize, setBaseGridSize] = useState(
    normalizeRasterSeamLabGridSize(RASTER_SEAM_LAB_DEFAULT_GRID_SIZE),
  );
  const [sourceSizePx, setSourceSizePx] = useState(
    RASTER_SEAM_LAB_DEFAULT_SOURCE_SIZE_PX,
  );
  const [recursiveDepth, setRecursiveDepth] = useState(
    normalizeRasterSeamLabDepth(
      routeSearch.depth ?? RASTER_SEAM_LAB_DEFAULT_DEPTH,
    ),
  );
  const [rotationDegrees, setRotationDegrees] = useState(
    normalizeRotationDegrees(
      routeSearch.rot ?? RASTER_SEAM_LAB_DEFAULT_ROTATION_DEGREES,
    ),
  );
  const [elevationDegrees, setElevationDegrees] = useState(
    normalizeElevationDegrees(
      routeSearch.elev ?? RASTER_SEAM_LAB_DEFAULT_ELEVATION_DEGREES,
    ),
  );
  const [mergeMode, setMergeMode] = useState<RasterSeamLabMergeMode>(
    RASTER_SEAM_LAB_DEFAULT_MERGE_MODE,
  );
  const labStats = getLogoRasterSeamLabStats({
    depth: recursiveDepth,
    elevationDegrees,
    gridSize: baseGridSize,
    rotationDegrees,
    sourceSizePx,
  });

  return (
    <div className="min-h-screen bg-[#f5f4ef] text-black">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-2 border border-black/10 bg-white/88 p-2 backdrop-blur-sm">
          <Button asChild size="sm" variant="outline" className="rounded-none">
            <Link search={routeSearch} to="/logo/raster">
              Raster
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="rounded-none">
            <Link search={routeSearch} to="/logo/single-cube">
              Single Cube
            </Link>
          </Button>
          <Button size="sm" className="rounded-none">
            Raster Seams
          </Button>
        </div>

        <div className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
          <div className="grid content-start gap-4 border border-black/10 bg-white/88 p-4">
            <div>
              <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
                {baseGridSize}x{baseGridSize} Image Tile
              </div>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight">
                Raster Seam Lab
              </h1>
            </div>

            <div className="grid gap-2">
              <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
                <span>Base</span>
                <span>
                  {baseGridSize}x{baseGridSize}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {RASTER_SEAM_LAB_GRID_SIZES.map((nextGridSize) => (
                  <Button
                    key={nextGridSize}
                    type="button"
                    size="sm"
                    variant={
                      baseGridSize === nextGridSize ? "default" : "outline"
                    }
                    className="rounded-none"
                    onClick={() => {
                      setBaseGridSize(nextGridSize);
                    }}
                  >
                    {nextGridSize}x{nextGridSize}
                  </Button>
                ))}
              </div>
            </div>

            <div className="grid gap-2">
              <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
                <span>Source</span>
                <span>{sourceSizePx}px</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {RASTER_SEAM_LAB_SOURCE_SIZES.map((nextSourceSizePx) => (
                  <Button
                    key={nextSourceSizePx}
                    type="button"
                    size="sm"
                    variant={
                      sourceSizePx === nextSourceSizePx ? "default" : "outline"
                    }
                    className="rounded-none"
                    onClick={() => {
                      setSourceSizePx(nextSourceSizePx);
                    }}
                  >
                    {nextSourceSizePx}px
                  </Button>
                ))}
              </div>
            </div>

            <div className="grid gap-2">
              <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
                <span>Depth</span>
                <span>
                  {labStats.effectiveGridSize}x{labStats.effectiveGridSize}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {RASTER_SEAM_LAB_DEPTHS.map((nextDepth) => (
                  <Button
                    key={nextDepth}
                    type="button"
                    size="sm"
                    variant={
                      recursiveDepth === nextDepth ? "default" : "outline"
                    }
                    className="rounded-none"
                    onClick={() => {
                      setRecursiveDepth(nextDepth);
                    }}
                  >
                    {nextDepth}
                  </Button>
                ))}
              </div>
            </div>

            <div className="grid gap-2">
              <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
                <span>Merge</span>
                <span>{getMergeModeLabel(mergeMode)}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {RASTER_SEAM_LAB_MERGE_MODES.map((mode) => (
                  <Button
                    key={mode.value}
                    type="button"
                    size="sm"
                    variant={mergeMode === mode.value ? "default" : "outline"}
                    className="rounded-none"
                    onClick={() => {
                      setMergeMode(mode.value);
                    }}
                  >
                    {mode.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="grid gap-2">
              <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
                <span>Rotation</span>
                <span>{rotationDegrees.toFixed(0)}°</span>
              </div>
              <input
                type="range"
                min="0"
                max="90"
                step="1"
                value={rotationDegrees}
                onChange={(event) => {
                  setRotationDegrees(Number(event.target.value));
                }}
                className="h-2 w-full cursor-pointer accent-black"
              />
            </div>

            <div className="grid gap-2">
              <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
                <span>Elevation</span>
                <span>{elevationDegrees.toFixed(0)}°</span>
              </div>
              <input
                type="range"
                min="0"
                max="70"
                step="1"
                value={elevationDegrees}
                onChange={(event) => {
                  setElevationDegrees(Number(event.target.value));
                }}
                className="h-2 w-full cursor-pointer accent-black"
              />
            </div>
          </div>

          <div className="grid gap-6">
            <div
              className="grid gap-3 border border-black/10 bg-white/88 p-3"
              data-testid="logo-raster-seam-lab-current-case"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
                    Current Case
                  </div>
                  <div className="mt-1 text-sm text-black/60">
                    {baseGridSize}x{baseGridSize} base, depth {recursiveDepth}
                    {" -> "}
                    {labStats.effectiveGridSize}x{labStats.effectiveGridSize}x
                    {labStats.effectiveGridSize}, {sourceSizePx}px source,{" "}
                    {getMergeModeLabel(mergeMode)}, rotation{" "}
                    {rotationDegrees.toFixed(0)}°, elevation{" "}
                    {elevationDegrees.toFixed(0)}°
                  </div>
                  <div className="mt-1 font-mono text-[11px] text-black/45">
                    {labStats.occupiedCells} cells{" | "}
                    {labStats.recursiveTileDraws} cached draws{" | "}
                    {labStats.mergedFaceRects} visible rects
                    {" -> "}
                    {labStats.mergedFaceLoops} loops /{" "}
                    {labStats.mergedFacePoints} points
                  </div>
                </div>
                <div className="font-mono text-[11px] text-black/45">
                  magenta = mismatch
                </div>
              </div>
              <div className="grid gap-3 xl:grid-cols-3">
                <SeamLabCanvas
                  depth={recursiveDepth}
                  elevationDegrees={elevationDegrees}
                  gridSize={baseGridSize}
                  imageKind="composed"
                  mergeMode={mergeMode}
                  rotationDegrees={rotationDegrees}
                  sourceSizePx={sourceSizePx}
                  zoom="large"
                />
                <SeamLabCanvas
                  depth={recursiveDepth}
                  elevationDegrees={elevationDegrees}
                  gridSize={baseGridSize}
                  imageKind="reference"
                  mergeMode={mergeMode}
                  rotationDegrees={rotationDegrees}
                  sourceSizePx={sourceSizePx}
                  zoom="large"
                />
                <SeamLabCanvas
                  depth={recursiveDepth}
                  elevationDegrees={elevationDegrees}
                  gridSize={baseGridSize}
                  imageKind="mask"
                  mergeMode={mergeMode}
                  rotationDegrees={rotationDegrees}
                  sourceSizePx={sourceSizePx}
                  zoom="large"
                />
              </div>
            </div>

            <div className="grid gap-3 border border-black/10 bg-white/88 p-3">
              <div>
                <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
                  Merge Sweep
                </div>
                <div className="mt-1 text-sm text-black/60">
                  Same angle and source, different composition and geometry
                  strategies.
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
                {RASTER_SEAM_LAB_MERGE_MODES.map((mode) => (
                  <button
                    key={mode.value}
                    type="button"
                    aria-pressed={mergeMode === mode.value}
                    className="text-left aria-pressed:outline aria-pressed:outline-2 aria-pressed:outline-black"
                    onClick={() => {
                      setMergeMode(mode.value);
                    }}
                  >
                    <MergeModeSweepCanvas
                      depth={recursiveDepth}
                      elevationDegrees={elevationDegrees}
                      gridSize={baseGridSize}
                      mergeMode={mode.value}
                      rotationDegrees={rotationDegrees}
                      sourceSizePx={sourceSizePx}
                    />
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 border border-black/10 bg-white/88 p-3">
              <div>
                <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
                  Angle Sweep
                </div>
                <div className="mt-1 text-sm text-black/60">
                  Same tiny source, different awkward rotations.
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {RASTER_SEAM_LAB_SAMPLE_ROTATIONS.map((sampleRotation) => (
                  <button
                    key={sampleRotation}
                    type="button"
                    aria-pressed={rotationDegrees === sampleRotation}
                    className="text-left aria-pressed:outline aria-pressed:outline-2 aria-pressed:outline-black"
                    onClick={() => {
                      setRotationDegrees(sampleRotation);
                    }}
                  >
                    <AngleSweepCanvas
                      depth={recursiveDepth}
                      elevationDegrees={elevationDegrees}
                      gridSize={baseGridSize}
                      mergeMode={mergeMode}
                      rotationDegrees={sampleRotation}
                      sourceSizePx={sourceSizePx}
                    />
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 border border-black/10 bg-white/88 p-3">
              <div>
                <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
                  Source Sweep
                </div>
                <div className="mt-1 text-sm text-black/60">
                  Same angle, smaller source rasters make seam pixels easier to
                  catch.
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {RASTER_SEAM_LAB_SOURCE_SIZES.map((sampleSourceSizePx) => (
                  <button
                    key={sampleSourceSizePx}
                    type="button"
                    aria-pressed={sourceSizePx === sampleSourceSizePx}
                    className="text-left aria-pressed:outline aria-pressed:outline-2 aria-pressed:outline-black"
                    onClick={() => {
                      setSourceSizePx(sampleSourceSizePx);
                    }}
                  >
                    <AngleSweepCanvas
                      depth={recursiveDepth}
                      elevationDegrees={elevationDegrees}
                      gridSize={baseGridSize}
                      mergeMode={mergeMode}
                      rotationDegrees={rotationDegrees}
                      sourceSizePx={sampleSourceSizePx}
                    />
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
