import { NLogoScene } from "@/components/NLogoScene";
import {
  LOGO_ISOMETRIC_CANVAS_HEIGHT,
  LOGO_ISOMETRIC_CANVAS_WIDTH,
  LOGO_ISOMETRIC_ELEVATION_DEGREES,
  LOGO_ISOMETRIC_ROTATION_DEGREES,
} from "@/components/logoIsometricRenderer";
import { DEFAULT_STATIC_LOGO_SVG_DATA_URL } from "@/components/logoStaticSvgAsset";
import {
  DEFAULT_FACE_COLORS,
  getTailwindColorHex,
} from "@/components/logoTailwindColors";
import { DEFAULT_VOXEL_STATE } from "@/components/logoVoxelState";
import { useEffect, useRef, useState } from "react";

export type LogoThreeVisualMode = "logo-three-reference";

const PREVIEW_SIZE = 1000;

export function LogoThreeVisualFixture() {
  const backgroundColor = getTailwindColorHex("background-base");
  const previewBackgroundColor = getTailwindColorHex("background-base");
  const referenceContainerRef = useRef<HTMLDivElement | null>(null);
  const svgImageRef = useRef<HTMLImageElement | null>(null);
  const diffCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [mismatchPixels, setMismatchPixels] = useState<number | null>(null);

  useEffect(() => {
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

      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => resolve());
        });
      });

      const referenceCanvas = referenceContainer.querySelector("canvas");
      if (!(referenceCanvas instanceof HTMLCanvasElement)) {
        return;
      }

      const compareWidth = PREVIEW_SIZE;
      const compareHeight = PREVIEW_SIZE;
      const background =
        window.getComputedStyle(referenceContainer).backgroundColor;

      const createRasterContext = () => {
        const canvas = document.createElement("canvas");
        canvas.width = compareWidth;
        canvas.height = compareHeight;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) {
          throw new Error("Missing raster context.");
        }
        context.fillStyle = background;
        context.fillRect(0, 0, compareWidth, compareHeight);
        context.imageSmoothingEnabled = true;
        return { canvas, context };
      };

      const referenceRaster = createRasterContext();
      referenceRaster.context.drawImage(
        referenceCanvas,
        0,
        0,
        compareWidth,
        compareHeight,
      );

      const svgRaster = createRasterContext();
      svgRaster.context.drawImage(svgImage, 0, 0, compareWidth, compareHeight);

      const referenceData = referenceRaster.context.getImageData(
        0,
        0,
        compareWidth,
        compareHeight,
      ).data;
      const svgData = svgRaster.context.getImageData(
        0,
        0,
        compareWidth,
        compareHeight,
      ).data;

      const diffContext = diffCanvas.getContext("2d", {
        willReadFrequently: true,
      });
      if (!diffContext) {
        return;
      }

      diffCanvas.width = compareWidth;
      diffCanvas.height = compareHeight;
      const diffImage = diffContext.createImageData(
        compareWidth,
        compareHeight,
      );
      let mismatches = 0;

      for (let index = 0; index < referenceData.length; index += 4) {
        const samePixel =
          referenceData[index] === svgData[index] &&
          referenceData[index + 1] === svgData[index + 1] &&
          referenceData[index + 2] === svgData[index + 2] &&
          referenceData[index + 3] === svgData[index + 3];

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
      setMismatchPixels(mismatches);
    };

    void renderDiff();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      data-testid="logo-three-visual-fixture"
      className="min-h-screen p-8 text-slate-900"
      style={{ backgroundColor }}
    >
      <div className="mx-auto grid max-w-[212rem] gap-6 border border-slate-300 bg-white p-8 shadow-sm">
        <div className="grid gap-1">
          <h1 className="text-xl font-semibold">
            Logo Three Reference Fixture
          </h1>
          <p className="text-sm text-slate-600">
            Left: current Three renderer at a fixed camera angle. Center:
            rasterized SVG at the same display size. Right: per-pixel browser
            diff after both are rasterized to a `1000x1000` comparison surface.
          </p>
        </div>

        <div className="grid gap-5 2xl:grid-cols-3">
          <section className="grid gap-3 border border-slate-200 p-4">
            <div className="text-sm font-medium text-slate-800">
              Three Reference
            </div>
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
                  elevationDegrees={LOGO_ISOMETRIC_ELEVATION_DEGREES}
                  faceColors={DEFAULT_FACE_COLORS}
                  onViewChange={(_nextView) => {}}
                  onVoxelEdit={(_edit) => {}}
                  rotationDegrees={LOGO_ISOMETRIC_ROTATION_DEGREES}
                  shuffleAnimation={{ enabled: false, parallelMoves: 1 }}
                  voxelState={DEFAULT_VOXEL_STATE}
                />
              </div>
            </div>
          </section>

          <section className="grid gap-3 border border-slate-200 p-4">
            <div className="text-sm font-medium text-slate-800">
              Static SVG Image
            </div>
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
                  src={DEFAULT_STATIC_LOGO_SVG_DATA_URL}
                  alt=""
                  width={LOGO_ISOMETRIC_CANVAS_WIDTH}
                  height={LOGO_ISOMETRIC_CANVAS_HEIGHT}
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
              <div className="text-sm font-medium text-slate-800">
                Raster Diff
              </div>
              <div
                data-testid="logo-three-parity-mismatch-count"
                className="text-sm tabular-nums text-slate-600"
              >
                {mismatchPixels === null
                  ? "Comparing..."
                  : `${mismatchPixels.toLocaleString()} mismatched pixels`}
              </div>
            </div>
            <div className="flex items-center justify-center border border-slate-200 p-4">
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
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
