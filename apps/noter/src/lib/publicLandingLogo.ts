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
export const PUBLIC_LANDING_LOGO_VIEW_SNAP_THRESHOLD_DEGREES = 2;
export const PUBLIC_LANDING_LOGO_ROTATION_SNAP_DEGREES = Array.from(
  { length: 8 },
  (_, index) => index * 45,
);
export const PUBLIC_LANDING_LOGO_ELEVATION_SNAP_DEGREES = [
  0,
  STATIC_LOGO_ELEVATION_DEGREES,
  180 - STATIC_LOGO_ELEVATION_DEGREES,
  90,
] as const satisfies readonly number[];
export const PUBLIC_LANDING_LOGO_VIEW_DRAG_CONFIG: LogoViewDragConfig = {
  elevationStepDegrees: PUBLIC_LANDING_LOGO_VIEW_STEP_DEGREES,
  rotationStepDegrees: PUBLIC_LANDING_LOGO_VIEW_STEP_DEGREES,
  snapAngles: {
    elevationDegrees: PUBLIC_LANDING_LOGO_ELEVATION_SNAP_DEGREES,
    rotationDegrees: PUBLIC_LANDING_LOGO_ROTATION_SNAP_DEGREES,
    thresholdDegrees: PUBLIC_LANDING_LOGO_VIEW_SNAP_THRESHOLD_DEGREES,
  },
};
