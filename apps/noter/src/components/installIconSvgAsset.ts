import { createStaticLogoSvgMarkup } from "./logoStaticSvgAsset";
import { getTailwindColorHex } from "./logoTailwindColors";

export const INSTALL_ICON_BACKGROUND_COLOR = "#ffffff";
export const INSTALL_ICON_TOP_FACE_COLOR = getTailwindColorHex("primary-base");

/**
 * Install icons render on a white canvas, so the static logo's white top faces
 * are remapped to the light-theme primary to preserve contrast.
 */
export function createInstallIconSvgMarkup() {
  return createStaticLogoSvgMarkup()
    .replace(/="#ffffff"/g, `="${INSTALL_ICON_TOP_FACE_COLOR}"`)
    .replace('fill="transparent"', `fill="${INSTALL_ICON_BACKGROUND_COLOR}"`);
}
