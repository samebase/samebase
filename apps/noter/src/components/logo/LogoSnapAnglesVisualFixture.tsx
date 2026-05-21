import { NLogoScene } from "@/components/logo/NLogoScene";
import { DEFAULT_FACE_COLORS, getTailwindColorHex } from "@/components/logo/logoTailwindColors";
import { STATIC_LOGO_VOXEL_STATE } from "@/components/logo/logoStaticSvgContract";
import {
  PUBLIC_LANDING_LOGO_ORTHOGRAPHIC_ELEVATION_SNAP_DEGREES,
  PUBLIC_LANDING_LOGO_ORTHOGRAPHIC_ROTATION_SNAP_DEGREES,
} from "@/lib/publicLandingLogo";
import { useState } from "react";

export type LogoSnapAnglesVisualMode = "logo-snap-angles";

const PREVIEW_SIZE = 180;

function formatAngleLabel(angleDegrees: number): string {
  const normalizedAngle = angleDegrees % 360;
  const isWholeNumber = Number.isInteger(normalizedAngle);
  return `${isWholeNumber ? normalizedAngle.toFixed(0) : normalizedAngle.toFixed(3)}°`;
}

function readAngleParam(name: string, fallback: number): number {
  const rawValue = new URLSearchParams(window.location.search).get(name);
  if (!rawValue) {
    return fallback;
  }

  const parsedValue = Number(rawValue);
  if (!Number.isFinite(parsedValue)) {
    return fallback;
  }

  return parsedValue;
}

export function LogoSnapAnglesVisualFixture() {
  const backgroundColor = getTailwindColorHex("gray-400");
  const [isRenderReady, setIsRenderReady] = useState(false);
  const rotationDegrees = readAngleParam(
    "rotation",
    PUBLIC_LANDING_LOGO_ORTHOGRAPHIC_ROTATION_SNAP_DEGREES[0],
  );
  const elevationDegrees = readAngleParam(
    "elevation",
    PUBLIC_LANDING_LOGO_ORTHOGRAPHIC_ELEVATION_SNAP_DEGREES[0],
  );

  return (
    <div
      data-testid="logo-snap-angles-visual-fixture"
      className="min-h-screen p-6"
      style={{ backgroundColor }}
    >
      <div className="mx-auto grid max-w-xl gap-4 text-slate-800">
        <div className="grid gap-1">
          <h1 className="text-xl font-semibold">Logo Snap Angle Fixture</h1>
          <p className="text-sm text-slate-700">
            Rot {formatAngleLabel(rotationDegrees)} / Elev {formatAngleLabel(elevationDegrees)}
          </p>
        </div>

        <div
          data-testid="logo-snap-angle-cell"
          data-render-ready={isRenderReady ? "true" : "false"}
          className="border border-slate-300"
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
            elevationDegrees={elevationDegrees}
            faceColors={DEFAULT_FACE_COLORS}
            opacity={1}
            onRenderReady={() => {
              setIsRenderReady(true);
            }}
            onViewChange={() => {}}
            onVoxelEdit={() => {}}
            rotationDegrees={rotationDegrees}
            shuffleAnimation={{ enabled: false, parallelMoves: 1 }}
            animateFaceColors={false}
            voxelState={STATIC_LOGO_VOXEL_STATE}
          />
        </div>
      </div>
    </div>
  );
}
