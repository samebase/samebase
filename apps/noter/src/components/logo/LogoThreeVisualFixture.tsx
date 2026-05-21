import { NLogoScene } from "@/components/logo/NLogoScene";
import {
  DEFAULT_STATIC_LOGO_SVG_NATURAL_SIZE,
  DEFAULT_STATIC_LOGO_SVG_URL,
  STATIC_LOGO_ELEVATION_DEGREES,
  STATIC_LOGO_ROTATION_DEGREES,
  STATIC_LOGO_VOXEL_STATE,
} from "@/components/logo/logoStaticSvgContract";
import { DEFAULT_FACE_COLORS, getTailwindColorHex } from "@/components/logo/logoTailwindColors";
import { useEffect, useRef, useState } from "react";

export type LogoThreeVisualMode = "logo-three-reference";

const PREVIEW_SIZE = 1000;
const SECONDARY_PREVIEW_SIZES = [240, 128, 64, 32] as const;

function LogoThreeScalePreview({
  isReferenceUnavailable,
  mismatchPixels,
  onRenderUnavailable,
  size,
}: {
  isReferenceUnavailable: boolean;
  mismatchPixels: number | null;
  onRenderUnavailable: () => void;
  size: (typeof SECONDARY_PREVIEW_SIZES)[number];
}) {
  const previewBackgroundColor = getTailwindColorHex("background-base");

  return (
    <section className="grid gap-3 border border-slate-200 p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="text-sm font-medium text-slate-800">{size}px</div>
        <div className="text-xs tabular-nums text-slate-600">
          {mismatchPixels === null
            ? isReferenceUnavailable
              ? "WebGL unavailable"
              : "Comparing..."
            : `${mismatchPixels.toLocaleString()} mismatches`}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Three</div>
          <div
            className="overflow-hidden border border-slate-200"
            style={{
              backgroundColor: previewBackgroundColor,
              height: `${size}px`,
              width: `${size}px`,
            }}
          >
            <NLogoScene
              backgroundColor={previewBackgroundColor}
              className="h-full w-full"
              editMode="add"
              elevationDegrees={STATIC_LOGO_ELEVATION_DEGREES}
              faceColors={DEFAULT_FACE_COLORS}
              opacity={1}
              onRenderUnavailable={onRenderUnavailable}
              onViewChange={(_nextView) => {}}
              onVoxelEdit={(_edit) => {}}
              rotationDegrees={STATIC_LOGO_ROTATION_DEGREES}
              shuffleAnimation={{ enabled: false, parallelMoves: 1 }}
              animateFaceColors={false}
              voxelState={STATIC_LOGO_VOXEL_STATE}
            />
          </div>
        </div>

        <div className="grid gap-2">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">SVG</div>
          <div
            className="flex items-center justify-center border border-slate-200"
            style={{
              backgroundColor: previewBackgroundColor,
              height: `${size}px`,
              width: `${size}px`,
            }}
          >
            <img
              src={DEFAULT_STATIC_LOGO_SVG_URL}
              alt=""
              width={DEFAULT_STATIC_LOGO_SVG_NATURAL_SIZE.width}
              height={DEFAULT_STATIC_LOGO_SVG_NATURAL_SIZE.height}
              className="block"
              style={{
                height: `${size}px`,
                width: `${size}px`,
              }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

export function LogoThreeVisualFixture() {
  const backgroundColor = getTailwindColorHex("background-base");
  const previewBackgroundColor = getTailwindColorHex("background-base");
  const referenceContainerRef = useRef<HTMLDivElement | null>(null);
  const svgImageRef = useRef<HTMLImageElement | null>(null);
  const diffCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isReferenceReady, setIsReferenceReady] = useState(false);
  const [isReferenceUnavailable, setIsReferenceUnavailable] = useState(false);
  const [mismatchPixelsBySize, setMismatchPixelsBySize] = useState<Partial<Record<number, number>>>(
    {},
  );

  useEffect(() => {
    if (!isReferenceUnavailable) {
      return;
    }

    setMismatchPixelsBySize({});
  }, [isReferenceUnavailable]);

  useEffect(() => {
    if (!isReferenceReady || isReferenceUnavailable) {
      return;
    }

    let cancelled = false;

    const renderDiff = async () => {
      const referenceContainer = referenceContainerRef.current;
      const svgImage = svgImageRef.current;
      const diffCanvas = diffCanvasRef.current;
      if (!referenceContainer || !svgImage || !diffCanvas) {
        return;
      }

      if (!svgImage.complete) {
        await new Promise<void>((resolve) => {
          svgImage.addEventListener("load", () => resolve(), { once: true });
          svgImage.addEventListener("error", () => resolve(), { once: true });
        });
      }

      if (typeof svgImage.decode === "function") {
        try {
          await svgImage.decode();
        } catch {
          // Browsers can reject decode() on already-decoded SVG data URLs.
        }
      }

      const referenceCanvas = await new Promise<HTMLCanvasElement | null>((resolve) => {
        const waitForSizedCanvas = () => {
          if (cancelled) {
            resolve(null);
            return;
          }

          const nextReferenceCanvas = referenceContainer.querySelector("canvas");
          if (!(nextReferenceCanvas instanceof HTMLCanvasElement)) {
            window.requestAnimationFrame(waitForSizedCanvas);
            return;
          }

          const containerRect = referenceContainer.getBoundingClientRect();
          const canvasRect = nextReferenceCanvas.getBoundingClientRect();
          const hasStableSize =
            Math.abs(canvasRect.width - containerRect.width) <= 2 &&
            Math.abs(canvasRect.height - containerRect.height) <= 2 &&
            nextReferenceCanvas.width > 0 &&
            nextReferenceCanvas.height > 0;

          if (!hasStableSize) {
            window.requestAnimationFrame(waitForSizedCanvas);
            return;
          }

          resolve(nextReferenceCanvas);
        };

        waitForSizedCanvas();
      });
      if (!(referenceCanvas instanceof HTMLCanvasElement)) {
        return;
      }

      const compareWidth = PREVIEW_SIZE;
      const compareHeight = PREVIEW_SIZE;
      const background = window.getComputedStyle(referenceContainer).backgroundColor;

      const createRasterContext = (size: number) => {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) {
          throw new Error("Missing raster context.");
        }
        context.fillStyle = background;
        context.fillRect(0, 0, size, size);
        context.imageSmoothingEnabled = true;
        return context;
      };

      const collectDiff = (size: number) => {
        const referenceContext = createRasterContext(size);
        referenceContext.drawImage(referenceCanvas, 0, 0, size, size);

        const svgContext = createRasterContext(size);
        svgContext.drawImage(svgImage, 0, 0, size, size);

        const referenceData = referenceContext.getImageData(0, 0, size, size).data;
        const svgData = svgContext.getImageData(0, 0, size, size).data;

        return {
          referenceData,
          svgData,
        };
      };

      const diffContext = diffCanvas.getContext("2d", {
        willReadFrequently: true,
      });
      if (!diffContext) {
        return;
      }

      diffCanvas.width = compareWidth;
      diffCanvas.height = compareHeight;
      const diffImage = diffContext.createImageData(compareWidth, compareHeight);
      const primaryDiff = collectDiff(PREVIEW_SIZE);
      let mismatches = 0;

      for (let index = 0; index < primaryDiff.referenceData.length; index += 4) {
        const samePixel =
          primaryDiff.referenceData[index] === primaryDiff.svgData[index] &&
          primaryDiff.referenceData[index + 1] === primaryDiff.svgData[index + 1] &&
          primaryDiff.referenceData[index + 2] === primaryDiff.svgData[index + 2] &&
          primaryDiff.referenceData[index + 3] === primaryDiff.svgData[index + 3];

        if (!samePixel) {
          mismatches += 1;
        }

        diffImage.data[index] = samePixel ? 255 : 255;
        diffImage.data[index + 1] = samePixel ? 255 : 0;
        diffImage.data[index + 2] = samePixel ? 255 : 96;
        diffImage.data[index + 3] = 255;
      }

      if (cancelled) {
        return;
      }

      diffContext.putImageData(diffImage, 0, 0);
      const nextMismatchPixelsBySize: Partial<Record<number, number>> = {
        [PREVIEW_SIZE]: mismatches,
      };

      for (const size of SECONDARY_PREVIEW_SIZES) {
        const diff = collectDiff(size);
        let sizeMismatches = 0;
        for (let index = 0; index < diff.referenceData.length; index += 4) {
          const samePixel =
            diff.referenceData[index] === diff.svgData[index] &&
            diff.referenceData[index + 1] === diff.svgData[index + 1] &&
            diff.referenceData[index + 2] === diff.svgData[index + 2] &&
            diff.referenceData[index + 3] === diff.svgData[index + 3];

          if (!samePixel) {
            sizeMismatches += 1;
          }
        }

        nextMismatchPixelsBySize[size] = sizeMismatches;
      }

      setMismatchPixelsBySize(nextMismatchPixelsBySize);
    };

    void renderDiff();

    return () => {
      cancelled = true;
    };
  }, [isReferenceReady, isReferenceUnavailable]);

  return (
    <div
      data-testid="logo-three-visual-fixture"
      className="min-h-screen p-8 text-slate-900"
      style={{ backgroundColor }}
    >
      <div className="mx-auto grid max-w-[212rem] gap-6 border border-slate-300 bg-white p-8 shadow-sm">
        <div className="grid gap-1">
          <h1 className="text-xl font-semibold">Logo Three Reference Fixture</h1>
          <p className="text-sm text-slate-600">
            Left: current Three renderer at a fixed camera angle. Center: rasterized SVG at the same
            display size. Right: per-pixel browser diff after both are rasterized to a `1000x1000`
            comparison surface. The lower row shows how the same pair behaves at smaller display
            sizes.
          </p>
        </div>

        <div className="grid gap-5 2xl:grid-cols-3">
          <section className="grid gap-3 border border-slate-200 p-4">
            <div className="text-sm font-medium text-slate-800">Three Reference</div>
            <div className="flex items-center justify-center border border-slate-200 p-4">
              <div
                ref={referenceContainerRef}
                data-testid="logo-three-parity-reference"
                className="overflow-hidden border border-slate-200"
                style={{
                  backgroundColor: previewBackgroundColor,
                  height: `${PREVIEW_SIZE}px`,
                  width: `${PREVIEW_SIZE}px`,
                }}
              >
                <NLogoScene
                  backgroundColor={previewBackgroundColor}
                  className="h-full w-full"
                  editMode="add"
                  elevationDegrees={STATIC_LOGO_ELEVATION_DEGREES}
                  faceColors={DEFAULT_FACE_COLORS}
                  opacity={1}
                  onRenderReady={() => {
                    setIsReferenceReady(true);
                  }}
                  onRenderUnavailable={() => {
                    setIsReferenceUnavailable(true);
                  }}
                  onViewChange={(_nextView) => {}}
                  onVoxelEdit={(_edit) => {}}
                  rotationDegrees={STATIC_LOGO_ROTATION_DEGREES}
                  shuffleAnimation={{ enabled: false, parallelMoves: 1 }}
                  animateFaceColors={false}
                  voxelState={STATIC_LOGO_VOXEL_STATE}
                />
              </div>
            </div>
          </section>

          <section className="grid gap-3 border border-slate-200 p-4">
            <div className="text-sm font-medium text-slate-800">Static SVG Image</div>
            <div className="flex items-center justify-center border border-slate-200 p-4">
              <div
                className="flex items-center justify-center border border-slate-200"
                style={{
                  backgroundColor: previewBackgroundColor,
                  height: `${PREVIEW_SIZE}px`,
                  width: `${PREVIEW_SIZE}px`,
                }}
              >
                <img
                  ref={svgImageRef}
                  data-testid="logo-three-parity-svg"
                  src={DEFAULT_STATIC_LOGO_SVG_URL}
                  alt=""
                  width={DEFAULT_STATIC_LOGO_SVG_NATURAL_SIZE.width}
                  height={DEFAULT_STATIC_LOGO_SVG_NATURAL_SIZE.height}
                  className="block"
                  style={{
                    height: `${PREVIEW_SIZE}px`,
                    width: `${PREVIEW_SIZE}px`,
                  }}
                />
              </div>
            </div>
          </section>

          <section className="grid gap-3 border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="text-sm font-medium text-slate-800">Raster Diff</div>
              <div
                data-testid="logo-three-parity-mismatch-count"
                className="text-sm tabular-nums text-slate-600"
              >
                {mismatchPixelsBySize[PREVIEW_SIZE] === undefined
                  ? isReferenceUnavailable
                    ? "WebGL unavailable"
                    : "Comparing..."
                  : `${mismatchPixelsBySize[PREVIEW_SIZE].toLocaleString()} mismatched pixels`}
              </div>
            </div>
            <div className="flex items-center justify-center border border-slate-200 p-4">
              {isReferenceUnavailable ? (
                <div
                  className="flex items-center justify-center border border-slate-200 text-sm text-slate-500"
                  style={{
                    backgroundColor: "#ffffff",
                    height: `${PREVIEW_SIZE}px`,
                    width: `${PREVIEW_SIZE}px`,
                  }}
                >
                  WebGL unavailable
                </div>
              ) : (
                <canvas
                  ref={diffCanvasRef}
                  data-testid="logo-three-parity-diff"
                  className="block border border-slate-200"
                  style={{
                    backgroundColor: "#ffffff",
                    height: `${PREVIEW_SIZE}px`,
                    width: `${PREVIEW_SIZE}px`,
                  }}
                  width={PREVIEW_SIZE}
                  height={PREVIEW_SIZE}
                />
              )}
            </div>
          </section>
        </div>

        <div className="grid gap-5 xl:grid-cols-2 2xl:grid-cols-4">
          {SECONDARY_PREVIEW_SIZES.map((size) => (
            <LogoThreeScalePreview
              key={size}
              isReferenceUnavailable={isReferenceUnavailable}
              mismatchPixels={mismatchPixelsBySize[size] ?? null}
              onRenderUnavailable={() => {
                setIsReferenceUnavailable(true);
              }}
              size={size}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
