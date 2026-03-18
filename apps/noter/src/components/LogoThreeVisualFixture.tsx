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

export type LogoThreeVisualMode = "logo-three-reference";

const PREVIEW_SIZE = 360;
const PREVIEW_BACKGROUND_COLOR = "#f8fafc";

export function LogoThreeVisualFixture() {
  const backgroundColor = getTailwindColorHex("background-base");

  return (
    <div
      data-testid="logo-three-visual-fixture"
      className="min-h-screen p-8 text-slate-900"
      style={{ backgroundColor }}
    >
      <div className="mx-auto grid max-w-5xl gap-5 border border-slate-300 bg-white p-6 shadow-sm">
        <div className="grid gap-1">
          <h1 className="text-xl font-semibold">
            Logo Three Reference Fixture
          </h1>
          <p className="text-sm text-slate-600">
            Left: current Three renderer at a fixed camera angle. Right: static
            SVG asset built from four-point face polygons.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <section className="grid gap-3 border border-slate-200 p-4">
            <div className="text-sm font-medium text-slate-800">
              Three Reference
            </div>
            <div className="flex items-center justify-center border border-slate-200 p-4">
              <div
                data-testid="logo-three-parity-reference"
                className="h-[360px] w-[360px] overflow-hidden border border-slate-200"
                style={{ backgroundColor: PREVIEW_BACKGROUND_COLOR }}
              >
                <NLogoScene
                  backgroundColor={PREVIEW_BACKGROUND_COLOR}
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
                  backgroundColor: PREVIEW_BACKGROUND_COLOR,
                  height: `${PREVIEW_SIZE}px`,
                  width: `${PREVIEW_SIZE}px`,
                }}
              >
                <img
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
        </div>
      </div>
    </div>
  );
}
