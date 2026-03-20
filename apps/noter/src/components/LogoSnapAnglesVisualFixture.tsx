import { NLogoScene } from "@/components/NLogoScene";
import {
  DEFAULT_FACE_COLORS,
  getTailwindColorHex,
} from "@/components/logoTailwindColors";
import {
  STATIC_LOGO_ELEVATION_DEGREES,
  STATIC_LOGO_VOXEL_STATE,
} from "@/components/logoStaticSvgContract";
import { PUBLIC_LANDING_LOGO_ROTATION_SNAP_DEGREES } from "@/lib/publicLandingLogo";

export type LogoSnapAnglesVisualMode = "logo-snap-angles";

const PREVIEW_SIZE = 360;
const SNAP_CARD_BASE_CLASS =
  "grid gap-2 border border-slate-400 bg-gray-400 p-2";
const DIAGONAL_ROTATION_PREVIEW_DEGREES =
  PUBLIC_LANDING_LOGO_ROTATION_SNAP_DEGREES.filter(
    (rotationDegrees) => rotationDegrees % 90 !== 0,
  );

type LogoSnapCase = {
  elevationDegrees: number;
  rotationDegrees: number;
};

const ORTHOGRAPHIC_ELEVATION_PREVIEW_DEGREES = [0, 45, 90] as const;

function formatAngleLabel(angleDegrees: number): string {
  const normalizedAngle = angleDegrees % 360;
  const isWholeNumber = Number.isInteger(normalizedAngle);
  return `${isWholeNumber ? normalizedAngle.toFixed(0) : normalizedAngle.toFixed(3)}°`;
}

function formatAngleSlug(angleDegrees: number): string {
  const normalizedAngle = angleDegrees % 360;
  const angleText = Number.isInteger(normalizedAngle)
    ? normalizedAngle.toFixed(0)
    : normalizedAngle.toFixed(3).replace(".", "_");
  return angleText.replace("-", "neg-");
}

const LOGO_SNAP_CASES: readonly LogoSnapCase[] = [
  ...DIAGONAL_ROTATION_PREVIEW_DEGREES.map((rotationDegrees) => ({
    elevationDegrees: STATIC_LOGO_ELEVATION_DEGREES,
    rotationDegrees,
  })),
  ...ORTHOGRAPHIC_ELEVATION_PREVIEW_DEGREES.map((elevationDegrees) => ({
    elevationDegrees,
    rotationDegrees: 0,
  })),
] as const;

export function LogoSnapAnglesVisualFixture() {
  const backgroundColor = getTailwindColorHex("gray-400");

  return (
    <div
      data-testid="logo-snap-angles-visual-fixture"
      className="min-h-screen p-6"
      style={{ backgroundColor }}
    >
      <div className="mx-auto grid max-w-[140rem] gap-4">
        <div className="grid gap-2 text-slate-800">
          <h1 className="text-xl font-semibold">
            Logo Snap Angles Visual Fixture
          </h1>
          <p className="text-sm text-slate-600">
            Each card is a Three.js render at one configured snap angle.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {LOGO_SNAP_CASES.map((snapCase) => {
            const rotationSlug = formatAngleSlug(snapCase.rotationDegrees);
            const elevationSlug = formatAngleSlug(snapCase.elevationDegrees);
            const label = `Rotation ${formatAngleLabel(snapCase.rotationDegrees)}, Elevation ${formatAngleLabel(snapCase.elevationDegrees)}`;

            return (
              <article
                key={`rotation-${rotationSlug}-elevation-${elevationSlug}`}
                data-testid={`logo-snap-rotation-${rotationSlug}-elevation-${elevationSlug}`}
                className={SNAP_CARD_BASE_CLASS}
              >
                <div className="text-xs font-medium text-slate-800">
                  {label}
                </div>
                <div
                  className="border border-slate-200"
                  style={{
                    backgroundColor,
                    height: `${PREVIEW_SIZE}px`,
                    width: `${PREVIEW_SIZE}px`,
                  }}
                >
                  <NLogoScene
                    backgroundColor={backgroundColor}
                    className="h-full w-full"
                    editMode="add"
                    elevationDegrees={snapCase.elevationDegrees}
                    faceColors={DEFAULT_FACE_COLORS}
                    opacity={1}
                    onViewChange={() => {}}
                    onVoxelEdit={() => {}}
                    rotationDegrees={snapCase.rotationDegrees}
                    shuffleAnimation={{ enabled: false, parallelMoves: 1 }}
                    animateFaceColors={false}
                    voxelState={STATIC_LOGO_VOXEL_STATE}
                  />
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}
