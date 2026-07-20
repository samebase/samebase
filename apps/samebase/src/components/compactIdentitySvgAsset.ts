export const COMPACT_IDENTITY_BACKGROUND_COLOR = "#ffffff";
export const COMPACT_IDENTITY_FOREGROUND_COLOR = "#394447";
export const COMPACT_IDENTITY_SVG_URL = "/samebase-icon.svg";
export const INSTALL_ICON_SVG_URL = "/install-icon.svg";
export const COMPACT_IDENTITY_SOURCE_SVG_URL = "/brand/icon/compact-v1.svg";
export const MASKABLE_COMPACT_IDENTITY_SOURCE_SVG_URL = "/brand/icon/compact-v1-maskable.svg";

type CompactIdentityGeometry = {
  inset: number;
  markSize: number;
  openingInset: number;
  openingSize: number;
  viewBoxSize: number;
};

function createCompactIdentitySvgMarkupForGeometry({
  inset,
  markSize,
  openingInset,
  openingSize,
  viewBoxSize,
}: CompactIdentityGeometry) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${viewBoxSize}" height="${viewBoxSize}" viewBox="0 0 ${viewBoxSize} ${viewBoxSize}" shape-rendering="crispEdges">
  <rect width="${viewBoxSize}" height="${viewBoxSize}" fill="${COMPACT_IDENTITY_BACKGROUND_COLOR}" />
  <rect x="${inset}" y="${inset}" width="${markSize}" height="${markSize}" fill="${COMPACT_IDENTITY_FOREGROUND_COLOR}" />
  <rect x="${openingInset}" y="${openingInset}" width="${openingSize}" height="${openingSize}" fill="${COMPACT_IDENTITY_BACKGROUND_COLOR}" />
</svg>`;
}

/**
 * The compact Samebase identity is the clean, straight-on version 1 mark.
 * Its outer edge is one eighth of the canvas and its opening is one third of
 * the dark square, so every edge stays square at 16px and 32px.
 */
export function createCompactIdentitySvgMarkup() {
  return createCompactIdentitySvgMarkupForGeometry({
    inset: 1,
    markSize: 6,
    openingInset: 3,
    openingSize: 2,
    viewBoxSize: 8,
  });
}

/**
 * Android maskable icons keep the same mark but add enough white space for the
 * full dark square to remain inside the platform's circular safe zone.
 */
export function createMaskableCompactIdentitySvgMarkup() {
  return createCompactIdentitySvgMarkupForGeometry({
    inset: 7,
    markSize: 18,
    openingInset: 13,
    openingSize: 6,
    viewBoxSize: 32,
  });
}
