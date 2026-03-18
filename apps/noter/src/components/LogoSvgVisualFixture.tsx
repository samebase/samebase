import { LogoIsoThumbnail } from "@/components/NLogoIsoScene";
import {
  DEFAULT_LOGO_ISOMETRIC_STYLE_ID,
  LOGO_ISOMETRIC_CANVAS_HEIGHT,
  LOGO_ISOMETRIC_CANVAS_WIDTH,
} from "@/components/logoIsometricRenderer";
import { DEFAULT_LOGO_ISOMETRIC_SVG_DATA_URL } from "@/components/logoStaticSvgAsset";
import {
  DEFAULT_FACE_COLORS,
  getTailwindColorHex,
} from "@/components/logoTailwindColors";
import { DEFAULT_VOXEL_STATE } from "@/components/logoVoxelState";

export type LogoSvgVisualMode = "logo-svg-parity";

const PREVIEW_SIZE = 1000;

export function LogoSvgVisualFixture() {
  const backgroundColor = getTailwindColorHex("background-base");
  const previewBackgroundColor = getTailwindColorHex("background-base");

  return (
    <div
      data-testid="logo-svg-visual-fixture"
      className="min-h-screen p-8 text-slate-900"
      style={{ backgroundColor }}
    >
      <div className="mx-auto grid max-w-[140rem] gap-6 border border-slate-300 bg-white p-8 shadow-sm">
        <div className="grid gap-1">
          <h1 className="text-xl font-semibold">Logo SVG Parity Fixture</h1>
          <p className="text-sm text-slate-600">
            Left: current canvas reference. Right: static SVG built from the
            same visible-face geometry.
          </p>
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          <section className="grid gap-3 rounded-md border border-slate-200 p-4">
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
                dataTestId="logo-svg-parity-reference"
                faceColors={DEFAULT_FACE_COLORS}
                size={PREVIEW_SIZE}
                styleId={DEFAULT_LOGO_ISOMETRIC_STYLE_ID}
                voxelState={DEFAULT_VOXEL_STATE}
              />
            </div>
          </section>

          <section className="grid gap-3 rounded-md border border-slate-200 p-4">
            <div className="text-sm font-medium text-slate-800">
              Static SVG Image
            </div>
            <div
              className="flex items-center justify-center border border-slate-200 p-4"
              style={{ backgroundColor: previewBackgroundColor }}
            >
              <img
                data-testid="logo-svg-parity-svg"
                src={DEFAULT_LOGO_ISOMETRIC_SVG_DATA_URL}
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
          </section>
        </div>
      </div>
    </div>
  );
}
