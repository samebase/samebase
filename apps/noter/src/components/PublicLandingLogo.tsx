import {
  PUBLIC_LANDING_LOGO_ALT,
  PUBLIC_LANDING_LOGO_CONTAINER_CLASS_NAME,
  PUBLIC_LANDING_LOGO_HEIGHT,
  PUBLIC_LANDING_LOGO_IMAGE_CLASS_NAME,
  PUBLIC_LANDING_LOGO_SRC,
  PUBLIC_LANDING_LOGO_TEST_ID,
  PUBLIC_LANDING_LOGO_WIDTH,
} from "@/lib/publicLandingLogo";

export function PublicLandingLogo() {
  return (
    <div className={PUBLIC_LANDING_LOGO_CONTAINER_CLASS_NAME}>
      <img
        data-testid={PUBLIC_LANDING_LOGO_TEST_ID}
        src={PUBLIC_LANDING_LOGO_SRC}
        alt={PUBLIC_LANDING_LOGO_ALT}
        width={PUBLIC_LANDING_LOGO_WIDTH}
        height={PUBLIC_LANDING_LOGO_HEIGHT}
        loading="eager"
        decoding="async"
        fetchPriority="high"
        className={PUBLIC_LANDING_LOGO_IMAGE_CLASS_NAME}
      />
    </div>
  );
}
