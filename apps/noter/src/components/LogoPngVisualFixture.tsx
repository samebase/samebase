import { LogoIsoThumbnail } from "@/components/NLogoIsoScene";
import {
  DEFAULT_LOGO_ISOMETRIC_STYLE_ID,
  LOGO_ISOMETRIC_CANVAS_HEIGHT,
  LOGO_ISOMETRIC_CANVAS_WIDTH,
} from "@/components/logoIsometricRenderer";
import {
  DEFAULT_FACE_COLORS,
  getTailwindColorHex,
} from "@/components/logoTailwindColors";
import { DEFAULT_VOXEL_STATE } from "@/components/logoVoxelState";

export type LogoPngVisualMode = "logo-png-parity";

const PREVIEW_SCALE = 10;
const PREVIEW_WIDTH = LOGO_ISOMETRIC_CANVAS_WIDTH * PREVIEW_SCALE;
const PREVIEW_HEIGHT = LOGO_ISOMETRIC_CANVAS_HEIGHT * PREVIEW_SCALE;
const STATIC_LOGO_PNG_PATH = "/logo-isometric.png";

export function LogoPngVisualFixture() {
  const backgroundColor = getTailwindColorHex("background-base");
  const previewBackgroundColor = getTailwindColorHex("background-base");

  return (
    <div
      data-testid="logo-png-visual-fixture"
      className="min-h-screen p-8 text-slate-900"
      style={{ backgroundColor }}
    >
      <div className="mx-auto grid max-w-[160rem] gap-6 border border-slate-300 bg-white p-8 shadow-sm">
        <div className="grid gap-1">
          <h1 className="text-xl font-semibold">Logo Pixel PNG Fixture</h1>
          <p className="text-sm text-slate-600">
            Left: the live pixel-art canvas renderer. Right: the committed PNG
            asset displayed by the browser at the same 10x integer scale with
            `image-rendering: pixelated`.
          </p>
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          <section className="grid gap-3 border border-slate-200 p-4">
            <div className="text-sm font-medium text-slate-800">
              Canvas Reference
            </div>
            <div
              className="flex items-center justify-center border border-slate-200 p-4"
              style={{ backgroundColor: previewBackgroundColor }}
            >
              <LogoIsoThumbnail
                backgroundColor="transparent"
                className="block"
                dataTestId="logo-png-parity-reference"
                faceColors={DEFAULT_FACE_COLORS}
                size={PREVIEW_WIDTH}
                styleId={DEFAULT_LOGO_ISOMETRIC_STYLE_ID}
                voxelState={DEFAULT_VOXEL_STATE}
              />
            </div>
          </section>

          <section className="grid gap-3 border border-slate-200 p-4">
            <div className="text-sm font-medium text-slate-800">
              Static PNG Image
            </div>
            <div
              className="flex items-center justify-center border border-slate-200 p-4"
              style={{ backgroundColor: previewBackgroundColor }}
            >
              <img
                data-testid="logo-png-parity-image"
                src={STATIC_LOGO_PNG_PATH}
                alt=""
                width={LOGO_ISOMETRIC_CANVAS_WIDTH}
                height={LOGO_ISOMETRIC_CANVAS_HEIGHT}
                className="block"
                style={{
                  height: `${PREVIEW_HEIGHT}px`,
                  imageRendering: "pixelated",
                  width: `${PREVIEW_WIDTH}px`,
                }}
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
