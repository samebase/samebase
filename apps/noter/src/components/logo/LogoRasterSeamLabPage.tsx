import { Button } from "@/components/ui/button";
import { Layout, PublicLayoutShell } from "@/Layout";
import { LogoNumberInput } from "@/components/logo/LogoNumberInput";
import {
  drawLogoRasterSeamLabImage,
  getLogoRasterSeamLabStats,
} from "@/components/logo/logoRasterSeamLabRenderer";
import {
  RASTER_SEAM_LAB_DEFAULT_DEPTH,
  RASTER_SEAM_LAB_DEFAULT_ELEVATION_DEGREES,
  RASTER_SEAM_LAB_DEFAULT_GRID_SIZE,
  RASTER_SEAM_LAB_DEFAULT_INFLATION_SCALE,
  RASTER_SEAM_LAB_DEFAULT_MERGE_MODE,
  RASTER_SEAM_LAB_DEFAULT_ROTATION_DEGREES,
  RASTER_SEAM_LAB_DEFAULT_SPACING_SCALE,
  RASTER_SEAM_LAB_DEPTHS,
  RASTER_SEAM_LAB_EMPTY_STATS,
  RASTER_SEAM_LAB_GRID_SIZES,
  RASTER_SEAM_LAB_DEFAULT_SOURCE_SIZE_PX,
  RASTER_SEAM_LAB_INFLATION_SCALE_STEP,
  RASTER_SEAM_LAB_MERGE_MODES,
  RASTER_SEAM_LAB_MIN_INFLATION_SCALE,
  RASTER_SEAM_LAB_MIN_SPACING_SCALE,
  RASTER_SEAM_LAB_MIN_SOURCE_SIZE_PX,
  RASTER_SEAM_LAB_SAMPLE_ROTATIONS,
  RASTER_SEAM_LAB_SLIDER_MAX_INFLATION_SCALE,
  RASTER_SEAM_LAB_SLIDER_MAX_SPACING_SCALE,
  RASTER_SEAM_LAB_SOURCE_SIZES,
  RASTER_SEAM_LAB_SOURCE_SIZE_STEP,
  RASTER_SEAM_LAB_SPACING_SCALE_STEP,
  normalizeRasterSeamLabDepth,
  normalizeRasterSeamLabGridSize,
  normalizeRasterSeamLabInflationScale,
  normalizeRasterSeamLabSpacingScale,
  normalizeRasterSeamLabSourceSizePx,
  type RasterSeamLabDepth,
  type RasterSeamLabGridSize,
  type RasterSeamLabImageKind,
  type RasterSeamLabMergeMode,
  type RasterSeamLabResult,
} from "@/components/logo/logoRasterSeamLabModel";
import {
  normalizeElevationDegrees,
  normalizeRotationDegrees,
} from "@/components/logo/logoVoxelState";
import { type LogoRouteSearch } from "@/lib/logoRouteSearch";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

type SeamLabZoom = "large" | "small";

type SeamLabRenderConfig = {
  depth: RasterSeamLabDepth;
  elevationDegrees: number;
  gridSize: RasterSeamLabGridSize;
  inflationScale: number;
  mergeMode: RasterSeamLabMergeMode;
  rotationDegrees: number;
  spacingScale: number;
  sourceSizePx: number;
};

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
  source: "Source tile",
} as const satisfies Record<RasterSeamLabImageKind, string>;

const CURRENT_CASE_IMAGE_KINDS = [
  "source",
  "composed",
  "reference",
  "mask",
] as const satisfies readonly RasterSeamLabImageKind[];

function getMergeModeLabel(mergeMode: RasterSeamLabMergeMode) {
  return RASTER_SEAM_LAB_MERGE_MODES.find((mode) => mode.value === mergeMode)?.label ?? mergeMode;
}

function formatScaleInput(value: number) {
  return value.toFixed(3);
}

function formatSourceSizeInput(value: number) {
  return value.toString();
}

function formatAngleDegrees(value: number) {
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
}

function formatAngleInput(value: number) {
  return formatAngleDegrees(value);
}

function SeamLabRangeNumberControl({
  ariaLabel,
  displayValue,
  formatValue,
  label,
  min,
  normalizeValue,
  onValueChange,
  sliderMax,
  step,
  value,
}: {
  ariaLabel: string;
  displayValue: string;
  formatValue: (value: number) => string;
  label: string;
  min: number;
  normalizeValue: (value: number) => number;
  onValueChange: (value: number) => void;
  sliderMax: number;
  step: number | string;
  value: number;
}) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
        <span>{label}</span>
        <span>{displayValue}</span>
      </div>
      <input
        type="range"
        min={min}
        max={sliderMax}
        step={step}
        value={Math.min(value, sliderMax)}
        onChange={(event) => {
          onValueChange(Number(event.target.value));
        }}
        className="h-2 w-full cursor-pointer accent-black"
      />
      <LogoNumberInput
        ariaLabel={ariaLabel}
        formatValue={formatValue}
        min={min}
        normalizeValue={normalizeValue}
        onValueChange={onValueChange}
        step={step}
        value={value}
        variant="seamLab"
      />
    </div>
  );
}

function SeamLabCanvas({
  config,
  imageKind,
  zoom,
}: {
  config: SeamLabRenderConfig;
  imageKind: RasterSeamLabImageKind;
  zoom: SeamLabZoom;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [result, setResult] = useState<RasterSeamLabResult>(EMPTY_SEAM_RESULT);
  const {
    depth,
    elevationDegrees,
    gridSize,
    inflationScale,
    mergeMode,
    rotationDegrees,
    spacingScale,
    sourceSizePx,
  } = config;

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
        inflationScale,
        mergeMode,
        rotationDegrees,
        spacingScale,
        sourceSizePx,
      }),
    );
  }, [
    depth,
    elevationDegrees,
    gridSize,
    imageKind,
    inflationScale,
    mergeMode,
    rotationDegrees,
    spacingScale,
    sourceSizePx,
  ]);

  const seamRatio = result.coveredPixels > 0 ? result.seamPixels / result.coveredPixels : 0;

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="font-medium text-black/80">{IMAGE_KIND_LABELS[imageKind]}</span>
        <span className="font-mono text-black/50">
          {result.seamPixels} / {result.coveredPixels} ({(seamRatio * 100).toFixed(1)}%) err{" "}
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

function AngleSweepCanvas({ config }: { config: SeamLabRenderConfig }) {
  return (
    <div className="grid gap-2 border border-black/10 bg-white p-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-black/80">
          {formatAngleDegrees(config.rotationDegrees)}°
        </span>
        <span className="font-mono text-[10px] text-black/45">{config.sourceSizePx}px</span>
      </div>
      <SeamLabCanvas config={config} imageKind="mask" zoom="small" />
    </div>
  );
}

function MergeModeSweepCanvas({ config }: { config: SeamLabRenderConfig }) {
  return (
    <div className="grid gap-2 border border-black/10 bg-white p-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-black/80">
          {getMergeModeLabel(config.mergeMode)}
        </span>
        <span className="font-mono text-[10px] text-black/45">{config.sourceSizePx}px</span>
      </div>
      <SeamLabCanvas config={config} imageKind="mask" zoom="small" />
    </div>
  );
}

export function LogoRasterSeamLabPage({ routeSearch }: { routeSearch: LogoRouteSearch }) {
  const initialRotationDegrees = normalizeRotationDegrees(
    routeSearch.rot ?? RASTER_SEAM_LAB_DEFAULT_ROTATION_DEGREES,
  );
  const initialElevationDegrees = normalizeElevationDegrees(
    routeSearch.elev ?? RASTER_SEAM_LAB_DEFAULT_ELEVATION_DEGREES,
  );
  const [baseGridSize, setBaseGridSize] = useState(
    normalizeRasterSeamLabGridSize(RASTER_SEAM_LAB_DEFAULT_GRID_SIZE),
  );
  const [sourceSizePx, setSourceSizePx] = useState(
    normalizeRasterSeamLabSourceSizePx(RASTER_SEAM_LAB_DEFAULT_SOURCE_SIZE_PX),
  );
  const [recursiveDepth, setRecursiveDepth] = useState(
    normalizeRasterSeamLabDepth(routeSearch.depth ?? RASTER_SEAM_LAB_DEFAULT_DEPTH),
  );
  const [rotationDegrees, setRotationDegrees] = useState(initialRotationDegrees);
  const [elevationDegrees, setElevationDegrees] = useState(initialElevationDegrees);
  const [mergeMode, setMergeMode] = useState<RasterSeamLabMergeMode>(
    RASTER_SEAM_LAB_DEFAULT_MERGE_MODE,
  );
  const [spacingScale, setSpacingScale] = useState(RASTER_SEAM_LAB_DEFAULT_SPACING_SCALE);
  const [inflationScale, setInflationScale] = useState(RASTER_SEAM_LAB_DEFAULT_INFLATION_SCALE);
  const setCommittedSourceSizePx = (value: number) => {
    setSourceSizePx(normalizeRasterSeamLabSourceSizePx(value));
  };
  const setCommittedSpacingScale = (value: number) => {
    setSpacingScale(normalizeRasterSeamLabSpacingScale(value));
  };
  const setCommittedInflationScale = (value: number) => {
    setInflationScale(normalizeRasterSeamLabInflationScale(value));
  };
  const setCommittedRotationDegrees = (value: number) => {
    setRotationDegrees(normalizeRotationDegrees(value));
  };
  const setCommittedElevationDegrees = (value: number) => {
    setElevationDegrees(normalizeElevationDegrees(value));
  };
  const labStats = getLogoRasterSeamLabStats({
    depth: recursiveDepth,
    elevationDegrees,
    gridSize: baseGridSize,
    rotationDegrees,
    sourceSizePx,
  });
  const seamLabConfig = {
    depth: recursiveDepth,
    elevationDegrees,
    gridSize: baseGridSize,
    inflationScale,
    mergeMode,
    rotationDegrees,
    spacingScale,
    sourceSizePx,
  } satisfies SeamLabRenderConfig;
  const inflationScaleLabel = `${inflationScale.toFixed(3)}x`;
  const spacingScaleLabel = `${spacingScale.toFixed(3)}x`;

  return (
    <Layout>
      <PublicLayoutShell>
        <div className="min-h-full bg-[#f5f4ef] text-black">
          <div className="mx-auto flex min-h-full w-full max-w-7xl flex-col gap-6 px-4 py-4 sm:px-6">
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
                  <h1 className="mt-2 text-2xl font-semibold tracking-tight">Raster Seam Lab</h1>
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
                        variant={baseGridSize === nextGridSize ? "default" : "outline"}
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
                        variant={sourceSizePx === nextSourceSizePx ? "default" : "outline"}
                        className="rounded-none"
                        onClick={() => {
                          setCommittedSourceSizePx(nextSourceSizePx);
                        }}
                      >
                        {nextSourceSizePx}px
                      </Button>
                    ))}
                  </div>
                  <LogoNumberInput
                    ariaLabel="Source size"
                    formatValue={formatSourceSizeInput}
                    inputMode="numeric"
                    min={RASTER_SEAM_LAB_MIN_SOURCE_SIZE_PX}
                    normalizeValue={normalizeRasterSeamLabSourceSizePx}
                    onValueChange={setCommittedSourceSizePx}
                    step={RASTER_SEAM_LAB_SOURCE_SIZE_STEP}
                    value={sourceSizePx}
                    variant="seamLab"
                  />
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
                        variant={recursiveDepth === nextDepth ? "default" : "outline"}
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

                <SeamLabRangeNumberControl
                  ariaLabel="Spacing scale"
                  displayValue={spacingScaleLabel}
                  formatValue={formatScaleInput}
                  label="Spacing"
                  min={RASTER_SEAM_LAB_MIN_SPACING_SCALE}
                  normalizeValue={normalizeRasterSeamLabSpacingScale}
                  onValueChange={setCommittedSpacingScale}
                  sliderMax={RASTER_SEAM_LAB_SLIDER_MAX_SPACING_SCALE}
                  step={RASTER_SEAM_LAB_SPACING_SCALE_STEP}
                  value={spacingScale}
                />

                <SeamLabRangeNumberControl
                  ariaLabel="Inflation scale"
                  displayValue={inflationScaleLabel}
                  formatValue={formatScaleInput}
                  label="Inflate"
                  min={RASTER_SEAM_LAB_MIN_INFLATION_SCALE}
                  normalizeValue={normalizeRasterSeamLabInflationScale}
                  onValueChange={setCommittedInflationScale}
                  sliderMax={RASTER_SEAM_LAB_SLIDER_MAX_INFLATION_SCALE}
                  step={RASTER_SEAM_LAB_INFLATION_SCALE_STEP}
                  value={inflationScale}
                />

                <SeamLabRangeNumberControl
                  ariaLabel="Rotation degrees"
                  displayValue={`${formatAngleDegrees(rotationDegrees)}°`}
                  formatValue={formatAngleInput}
                  label="Rotation"
                  min={0}
                  normalizeValue={normalizeRotationDegrees}
                  onValueChange={setCommittedRotationDegrees}
                  sliderMax={90}
                  step="0.1"
                  value={rotationDegrees}
                />

                <SeamLabRangeNumberControl
                  ariaLabel="Elevation degrees"
                  displayValue={`${formatAngleDegrees(elevationDegrees)}°`}
                  formatValue={formatAngleInput}
                  label="Elevation"
                  min={0}
                  normalizeValue={normalizeElevationDegrees}
                  onValueChange={setCommittedElevationDegrees}
                  sliderMax={70}
                  step="0.1"
                  value={elevationDegrees}
                />
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
                        {formatAngleDegrees(rotationDegrees)}°, elevation{" "}
                        {formatAngleDegrees(elevationDegrees)}°, inflate {inflationScaleLabel}
                      </div>
                      <div className="mt-1 font-mono text-[11px] text-black/45">
                        {labStats.occupiedCells} cells{" | "}
                        {labStats.recursiveTileDraws} cached draws{" | "}
                        {labStats.mergedFaceRects} visible rects
                        {" -> "}
                        {labStats.mergedFaceLoops} loops / {labStats.mergedFacePoints} points
                      </div>
                    </div>
                    <div className="font-mono text-[11px] text-black/45">magenta = mismatch</div>
                  </div>
                  <div className="grid gap-3 xl:grid-cols-2 2xl:grid-cols-4">
                    {CURRENT_CASE_IMAGE_KINDS.map((imageKind) => (
                      <SeamLabCanvas
                        key={imageKind}
                        config={seamLabConfig}
                        imageKind={imageKind}
                        zoom="large"
                      />
                    ))}
                  </div>
                </div>

                <div
                  className="grid gap-3 border border-black/10 bg-white/88 p-3"
                  data-testid="logo-raster-seam-lab-merge-sweep"
                >
                  <div>
                    <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-black/55">
                      Merge Sweep
                    </div>
                    <div className="mt-1 text-sm text-black/60">
                      Same angle and source, different composition and geometry strategies.
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {RASTER_SEAM_LAB_MERGE_MODES.map((mode) => (
                      <button
                        key={mode.value}
                        type="button"
                        aria-pressed={mergeMode === mode.value}
                        className="min-w-48 flex-1 text-left aria-pressed:outline aria-pressed:outline-2 aria-pressed:outline-black"
                        onClick={() => {
                          setMergeMode(mode.value);
                        }}
                      >
                        <MergeModeSweepCanvas
                          config={{ ...seamLabConfig, mergeMode: mode.value }}
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
                          config={{
                            ...seamLabConfig,
                            rotationDegrees: sampleRotation,
                          }}
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
                      Same angle, smaller source rasters make seam pixels easier to catch.
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
                          config={{
                            ...seamLabConfig,
                            sourceSizePx: sampleSourceSizePx,
                          }}
                        />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </PublicLayoutShell>
    </Layout>
  );
}
