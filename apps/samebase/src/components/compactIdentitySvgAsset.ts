export const COMPACT_IDENTITY_BACKGROUND_COLOR = "#ffffff";
export const COMPACT_IDENTITY_FOREGROUND_COLOR = "#394447";
export const COMPACT_IDENTITY_SVG_URL = "/samebase-icon.svg";
export const INSTALL_ICON_SVG_URL = "/install-icon.svg";
export const COMPACT_IDENTITY_SOURCE_SVG_URL = "/brand/icon/compact-v1.svg";
export const LANDING_INLINE_80_PERCENT_MARK_SVG_URL =
  "/brand/icon/compact-v1-landing-inline-80.svg";
export const MASKABLE_COMPACT_IDENTITY_SOURCE_SVG_URL = "/brand/icon/compact-v1-maskable.svg";

type CompactIdentityGeometry = {
  backgroundColor: string;
  foregroundColor: string;
  inset: number;
  markSize: number;
  openingInset: number;
  openingSize: number;
  viewBoxSize: number;
};

function createCompactIdentitySvgMarkupForGeometry({
  backgroundColor,
  foregroundColor,
  inset,
  markSize,
  openingInset,
  openingSize,
  viewBoxSize,
}: CompactIdentityGeometry) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${viewBoxSize}" height="${viewBoxSize}" viewBox="0 0 ${viewBoxSize} ${viewBoxSize}" shape-rendering="crispEdges">
  <rect width="${viewBoxSize}" height="${viewBoxSize}" fill="${backgroundColor}" />
  <rect x="${inset}" y="${inset}" width="${markSize}" height="${markSize}" fill="${foregroundColor}" />
  <rect x="${openingInset}" y="${openingInset}" width="${openingSize}" height="${openingSize}" fill="${backgroundColor}" />
</svg>`;
}

/**
 * The compact Samebase identity is the clean, straight-on version 1 mark.
 * The dark square occupies 70% of the canvas, leaving its corners visibly
 * inside a circular crop. Its opening remains one third of the dark square.
 */
export function createCompactIdentitySvgMarkup() {
  return createCompactIdentitySvgMarkupForGeometry({
    backgroundColor: COMPACT_IDENTITY_BACKGROUND_COLOR,
    foregroundColor: COMPACT_IDENTITY_FOREGROUND_COLOR,
    inset: 9,
    markSize: 42,
    openingInset: 23,
    openingSize: 14,
    viewBoxSize: 60,
  });
}

/**
 * The ChatGPT dark-mode icon keeps the compact geometry and swaps the
 * foreground and background colors.
 */
export function createDarkCompactIdentitySvgMarkup() {
  return createCompactIdentitySvgMarkupForGeometry({
    backgroundColor: COMPACT_IDENTITY_FOREGROUND_COLOR,
    foregroundColor: COMPACT_IDENTITY_BACKGROUND_COLOR,
    inset: 9,
    markSize: 42,
    openingInset: 23,
    openingSize: 14,
    viewBoxSize: 60,
  });
}

/**
 * Browser favicons use a 75% visible mark on the denser 8px grid so their
 * edges align exactly when rasterized at 16px and 32px.
 */
export function createFaviconCompactIdentitySvgMarkup() {
  return createCompactIdentitySvgMarkupForGeometry({
    backgroundColor: COMPACT_IDENTITY_BACKGROUND_COLOR,
    foregroundColor: COMPACT_IDENTITY_FOREGROUND_COLOR,
    inset: 1,
    markSize: 6,
    openingInset: 3,
    openingSize: 2,
    viewBoxSize: 8,
  });
}

/** The 60-unit grid gives the 80% square and its one-third opening integer coordinates. */
export function createLandingInline80PercentMarkSvgMarkup() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 60 60" shape-rendering="crispEdges">
  <rect width="60" height="60" fill="${COMPACT_IDENTITY_BACKGROUND_COLOR}" />
  <path d="M6 6h48v48H6z M22 22h16v16H22z" fill="${COMPACT_IDENTITY_FOREGROUND_COLOR}" fill-rule="evenodd" />
</svg>`;
}

/**
 * Android maskable icons keep the same mark but add enough white space for the
 * full dark square to remain inside the platform's circular safe zone.
 */
export function createMaskableCompactIdentitySvgMarkup() {
  return createCompactIdentitySvgMarkupForGeometry({
    backgroundColor: COMPACT_IDENTITY_BACKGROUND_COLOR,
    foregroundColor: COMPACT_IDENTITY_FOREGROUND_COLOR,
    inset: 7,
    markSize: 18,
    openingInset: 13,
    openingSize: 6,
    viewBoxSize: 32,
  });
}
