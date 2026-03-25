import { createStaticLogoSvgMarkup } from "./logoStaticSvgAsset";

export const INSTALL_ICON_BACKGROUND_COLOR = "#ffffff";

/**
 * Install icons keep the white-mode logo colors but render on an explicit white
 * canvas instead of a transparent or dark fallback.
 */
export function createInstallIconSvgMarkup() {
  return createStaticLogoSvgMarkup().replace(
    'fill="transparent"',
    `fill="${INSTALL_ICON_BACKGROUND_COLOR}"`,
  );
}
