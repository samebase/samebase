import { STATIC_LOGO_ELEVATION_DEGREES } from "@/components/logo/logoStaticSvgContract";
import { type LogoViewDragConfig } from "@/components/logo/logoViewDrag";

export const PUBLIC_LANDING_LOGO_ALT = "Noter logo";
export const PUBLIC_LANDING_LOGO_CONTAINER_CLASS_NAME = "mx-auto max-w-[11rem]";
export const PUBLIC_LANDING_LOGO_HEIGHT = 360;
export const PUBLIC_LANDING_LOGO_IMAGE_CLASS_NAME = "block h-auto w-full";
export const PUBLIC_LANDING_LOGO_STATIC_FALLBACK_ATTRIBUTE =
  "data-public-landing-logo-static-fallback";
export const PUBLIC_LANDING_LOGO_SCENE_TEST_ID = "public-landing-logo-scene";
export const PUBLIC_LANDING_LOGO_STAGE_CLASS_NAME = "relative w-full";
export const PUBLIC_LANDING_LOGO_STAGE_TEST_ID = "public-landing-logo-stage";
export const PUBLIC_LANDING_LOGO_TEST_ID = "public-landing-logo";
export const PUBLIC_LANDING_LOGO_WIDTH = 360;
export const PUBLIC_LANDING_LOGO_VIEW_SNAP_THRESHOLD_DEGREES = 4;
export const PUBLIC_LANDING_LOGO_ORTHOGRAPHIC_ROTATION_SNAP_DEGREES = [0, 90, 180, 270] as const;
export const PUBLIC_LANDING_LOGO_DIAGONAL_ROTATION_SNAP_DEGREES = [45, 135, 225, 315] as const;
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

export const PUBLIC_LANDING_LOGO_VIEW_DRAG_CONFIG: LogoViewDragConfig = {
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
