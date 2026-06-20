import { createStaticLogoSvgMarkup } from "./logo/logoStaticSvgAsset";
import { DEFAULT_LOGO_FACE_TREATMENT, type LogoFaceTreatment } from "./logo/logoFaceTreatment";

export const INSTALL_ICON_BACKGROUND_COLOR = "#ffffff";

/**
 * Install icons keep the white-mode logo colors but render on an explicit white
 * canvas instead of a transparent or dark fallback.
 */
export function createInstallIconSvgMarkup({
  faceTreatment = DEFAULT_LOGO_FACE_TREATMENT,
}: {
  faceTreatment?: LogoFaceTreatment;
} = {}) {
  return createStaticLogoSvgMarkup({ faceTreatment }).replace(
    'fill="transparent"',
    `fill="${INSTALL_ICON_BACKGROUND_COLOR}"`,
  );
}
