import { NLogoScene } from "@/components/NLogoScene";
import {
  DEFAULT_FACE_COLORS,
  getTailwindColorHex,
} from "@/components/logoTailwindColors";
import { STATIC_LOGO_VOXEL_STATE } from "@/components/logoStaticSvgContract";
import {
  PUBLIC_LANDING_LOGO_DIAGONAL_ELEVATION_SNAP_DEGREES,
  PUBLIC_LANDING_LOGO_DIAGONAL_ROTATION_SNAP_DEGREES,
  PUBLIC_LANDING_LOGO_ORTHOGRAPHIC_ELEVATION_SNAP_DEGREES,
  PUBLIC_LANDING_LOGO_ORTHOGRAPHIC_ROTATION_SNAP_DEGREES,
} from "@/lib/publicLandingLogo";

export type LogoSnapAnglesVisualMode = "logo-snap-angles";

const PREVIEW_SIZE = 180;
const MATRIX_HEADER_SIZE = 96;
const MATRIX_CORNER_CLASS =
  "border border-slate-300 bg-slate-200 text-slate-800";
const MATRIX_COLUMN_HEADER_CLASS =
  "flex items-center justify-center border border-slate-300 bg-slate-100 px-2 py-3 text-sm font-semibold text-slate-800";
const MATRIX_ROW_HEADER_CLASS =
  "flex items-center justify-end border border-slate-300 bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-800";
const MATRIX_CELL_CLASS = "border border-slate-300";

type LogoSnapMatrix = {
  description: string;
  elevationDegrees: readonly number[];
  rotationDegrees: readonly number[];
  title: string;
};

function formatAngleLabel(angleDegrees: number): string {
  const normalizedAngle = angleDegrees % 360;
  const isWholeNumber = Number.isInteger(normalizedAngle);
  return `${isWholeNumber ? normalizedAngle.toFixed(0) : normalizedAngle.toFixed(3)}°`;
}

const LOGO_SNAP_MATRICES = [
  {
    description:
      "Orthographic rotations use only orthographic elevation snap points.",
    elevationDegrees: PUBLIC_LANDING_LOGO_ORTHOGRAPHIC_ELEVATION_SNAP_DEGREES,
    rotationDegrees: PUBLIC_LANDING_LOGO_ORTHOGRAPHIC_ROTATION_SNAP_DEGREES,
    title: "Orthographic snap matrix",
  },
  {
    description:
      "Diagonal rotations use only the isometric elevation snap family.",
    elevationDegrees: PUBLIC_LANDING_LOGO_DIAGONAL_ELEVATION_SNAP_DEGREES,
    rotationDegrees: PUBLIC_LANDING_LOGO_DIAGONAL_ROTATION_SNAP_DEGREES,
    title: "Diagonal snap matrix",
  },
] as const satisfies readonly LogoSnapMatrix[];

function LogoSnapMatrixSection({
  backgroundColor,
  description,
  elevationDegrees,
  rotationDegrees,
  title,
}: {
  backgroundColor: string;
  description: string;
  elevationDegrees: readonly number[];
  rotationDegrees: readonly number[];
  title: string;
}) {
  const gridTemplateColumns = `${MATRIX_HEADER_SIZE}px repeat(${rotationDegrees.length}, ${PREVIEW_SIZE}px)`;

  return (
    <section className="grid gap-3">
      <div className="grid gap-1 text-slate-800">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-slate-600">{description}</p>
      </div>

      <div
        className="grid gap-px rounded-sm border border-slate-300 bg-slate-300"
        style={{ gridTemplateColumns }}
      >
        <div className={MATRIX_CORNER_CLASS} />
        {rotationDegrees.map((rotationDegreesValue) => (
          <div
            key={`rotation-header-${rotationDegreesValue}`}
            className={MATRIX_COLUMN_HEADER_CLASS}
          >
            Rot {formatAngleLabel(rotationDegreesValue)}
          </div>
        ))}

        {elevationDegrees.flatMap((elevationDegreesValue) => [
          <div
            key={`elevation-header-${elevationDegreesValue}`}
            className={MATRIX_ROW_HEADER_CLASS}
          >
            Elev {formatAngleLabel(elevationDegreesValue)}
          </div>,
          ...rotationDegrees.map((rotationDegreesValue) => (
            <div
              key={`rotation-${rotationDegreesValue}-elevation-${elevationDegreesValue}`}
              className={MATRIX_CELL_CLASS}
              data-testid={`logo-snap-cell-rotation-${rotationDegreesValue}-elevation-${elevationDegreesValue}`}
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
                elevationDegrees={elevationDegreesValue}
                faceColors={DEFAULT_FACE_COLORS}
                opacity={1}
                onViewChange={() => {}}
                onVoxelEdit={() => {}}
                rotationDegrees={rotationDegreesValue}
                shuffleAnimation={{ enabled: false, parallelMoves: 1 }}
                animateFaceColors={false}
                voxelState={STATIC_LOGO_VOXEL_STATE}
              />
            </div>
          )),
        ])}
      </div>
    </section>
  );
}

export function LogoSnapAnglesVisualFixture() {
  const backgroundColor = getTailwindColorHex("gray-400");

  return (
    <div
      data-testid="logo-snap-angles-visual-fixture"
      className="min-h-screen p-6"
      style={{ backgroundColor }}
    >
      <div className="mx-auto grid max-w-[72rem] gap-6">
        <div className="grid gap-2 text-slate-800">
          <h1 className="text-xl font-semibold">Logo Snap Angle Matrix</h1>
          <p className="text-sm text-slate-600">
            Single-image contact sheet for every configured logo snap view.
          </p>
        </div>

        <div className="grid gap-8">
          {LOGO_SNAP_MATRICES.map((matrix) => (
            <LogoSnapMatrixSection
              key={matrix.title}
              backgroundColor={backgroundColor}
              description={matrix.description}
              elevationDegrees={matrix.elevationDegrees}
              rotationDegrees={matrix.rotationDegrees}
              title={matrix.title}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
