export const PUBLIC_LANDING_LOGO_ALT = "Samebase logo";
/**
The compact stage is the original sign-in-card size; the wide stage carries the
landing-page showcase placements where the logo is the section's main content;
the rail stage is the small zone-label mark on the landing overview.
*/
export const PUBLIC_LANDING_LOGO_CONTAINER_CLASS_NAME_BY_STAGE = {
  compact: "mx-auto max-w-[11rem]",
  rail: "w-28",
  wide: "mx-auto w-full max-w-[540px]",
} as const;
export type PublicLandingLogoStage = keyof typeof PUBLIC_LANDING_LOGO_CONTAINER_CLASS_NAME_BY_STAGE;
export const PUBLIC_LANDING_LOGO_HEIGHT = 360;
export const PUBLIC_LANDING_LOGO_IMAGE_CLASS_NAME = "block h-auto w-full";
export const PUBLIC_LANDING_LOGO_STATIC_FALLBACK_ATTRIBUTE =
  "data-public-landing-logo-static-fallback";
export const PUBLIC_LANDING_LOGO_SCENE_TEST_ID = "public-landing-logo-scene";
export const PUBLIC_LANDING_LOGO_STAGE_CLASS_NAME = "relative w-full";
export const PUBLIC_LANDING_LOGO_STAGE_TEST_ID = "public-landing-logo-stage";
export const PUBLIC_LANDING_LOGO_TEST_ID = "public-landing-logo";
export const PUBLIC_LANDING_LOGO_WIDTH = 360;
