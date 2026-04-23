import { STATIC_LOGO_ELEVATION_DEGREES } from "@/components/logoStaticSvgContract";
import { type LogoViewDragConfig } from "@/components/logoViewDrag";

export const PUBLIC_LANDING_LOGO_ALT = "Noter logo";
export const PUBLIC_LANDING_LOGO_CONTAINER_CLASS_NAME =
  "mx-auto w-full max-w-[11rem]";
export const PUBLIC_LANDING_LOGO_HEIGHT = 360;
export const PUBLIC_LANDING_LOGO_IMAGE_CLASS_NAME = "block h-auto w-full";
export const PUBLIC_LANDING_LOGO_SCENE_TEST_ID = "public-landing-logo-scene";
export const PUBLIC_LANDING_LOGO_STAGE_CLASS_NAME = "relative w-full";
export const PUBLIC_LANDING_LOGO_STAGE_TEST_ID = "public-landing-logo-stage";
export const PUBLIC_LANDING_LOGO_TEST_ID = "public-landing-logo";
export const PUBLIC_LANDING_LOGO_WIDTH = 360;
export const PUBLIC_LANDING_LOGO_VIEW_STEP_DEGREES = 1;
export const PUBLIC_LANDING_LOGO_VIEW_SNAP_THRESHOLD_DEGREES = 4;
export const PUBLIC_LANDING_LOGO_ORTHOGRAPHIC_ROTATION_SNAP_DEGREES = [
  0, 90, 180, 270,
] as const;
export const PUBLIC_LANDING_LOGO_DIAGONAL_ROTATION_SNAP_DEGREES = [
  45, 135, 225, 315,
] as const;
export const PUBLIC_LANDING_LOGO_ROTATION_SNAP_DEGREES = Array.from(
  { length: 8 },
  (_, index) => index * 45,
);
export const PUBLIC_LANDING_LOGO_ORTHOGRAPHIC_ELEVATION_SNAP_DEGREES = [
  0, 45, 90, 135, 180, 225, 270, 315,
] as const satisfies readonly number[];
export const PUBLIC_LANDING_LOGO_DIAGONAL_ELEVATION_SNAP_DEGREES = [
  0,
  STATIC_LOGO_ELEVATION_DEGREES,
  90,
  180 - STATIC_LOGO_ELEVATION_DEGREES,
  180,
  180 + STATIC_LOGO_ELEVATION_DEGREES,
  270,
  360 - STATIC_LOGO_ELEVATION_DEGREES,
] as const satisfies readonly number[];
export const PUBLIC_LANDING_LOGO_ELEVATION_SNAP_DEGREES =
  PUBLIC_LANDING_LOGO_ORTHOGRAPHIC_ELEVATION_SNAP_DEGREES;
export const PUBLIC_LANDING_LOGO_LINK_REVEAL_ELEVATION_DEGREES = 0;
export const PUBLIC_LANDING_LOGO_LINK_REVEAL_ROTATION_DEGREES = [
  0, 180,
] as const;

type PublicLandingLogoLinkRevealView = {
  elevationDegrees: number;
  rotationDegrees: number;
};

function isPublicLandingLogoLinkRevealRotationDegrees(
  value: number,
): value is (typeof PUBLIC_LANDING_LOGO_LINK_REVEAL_ROTATION_DEGREES)[number] {
  return value === 0 || value === 180;
}

/**
 * The easter egg should only unlock on the darker straight-on face and its
 * opposite. The lighter orthographic face and the top/bottom single-face views
 * are intentionally excluded.
 */
export function shouldRevealPublicLandingLogoLink(
  view: PublicLandingLogoLinkRevealView,
): boolean {
  return (
    view.elevationDegrees ===
      PUBLIC_LANDING_LOGO_LINK_REVEAL_ELEVATION_DEGREES &&
    isPublicLandingLogoLinkRevealRotationDegrees(view.rotationDegrees)
  );
}

export const PUBLIC_LANDING_LOGO_VIEW_DRAG_CONFIG: LogoViewDragConfig = {
  elevationStepDegrees: PUBLIC_LANDING_LOGO_VIEW_STEP_DEGREES,
  rotationStepDegrees: PUBLIC_LANDING_LOGO_VIEW_STEP_DEGREES,
  snapAngles: {
    elevationDegrees: PUBLIC_LANDING_LOGO_ORTHOGRAPHIC_ELEVATION_SNAP_DEGREES,
    elevationSnapGroups: [
      {
        elevationDegrees: PUBLIC_LANDING_LOGO_DIAGONAL_ELEVATION_SNAP_DEGREES,
        rotationDegrees: PUBLIC_LANDING_LOGO_DIAGONAL_ROTATION_SNAP_DEGREES,
      },
    ],
    rotationDegrees: PUBLIC_LANDING_LOGO_ROTATION_SNAP_DEGREES,
    thresholdDegrees: PUBLIC_LANDING_LOGO_VIEW_SNAP_THRESHOLD_DEGREES,
  },
};
