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
  viewBoxSize: number;
};

function createCompactIdentitySvgMarkupForGeometry({
  backgroundColor,
  foregroundColor,
  inset,
  viewBoxSize,
}: CompactIdentityGeometry) {
  const markSize = viewBoxSize - 2 * inset;
  const openingSize = markSize / 3;
  const openingInset = inset + openingSize;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${viewBoxSize}" height="${viewBoxSize}" viewBox="0 0 ${viewBoxSize} ${viewBoxSize}" shape-rendering="crispEdges">
  <rect width="${viewBoxSize}" height="${viewBoxSize}" fill="${backgroundColor}" />
  <path d="M${inset} ${inset}h${markSize}v${markSize}H${inset}z M${openingInset} ${openingInset}h${openingSize}v${openingSize}H${openingInset}z" fill="${foregroundColor}" fill-rule="evenodd" />
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
    viewBoxSize: 8,
  });
}

/** The 60-unit grid gives the 80% square and its one-third opening integer coordinates. */
export function createLandingInline80PercentMarkSvgMarkup() {
  return createCompactIdentitySvgMarkupForGeometry({
    backgroundColor: COMPACT_IDENTITY_BACKGROUND_COLOR,
    foregroundColor: COMPACT_IDENTITY_FOREGROUND_COLOR,
    inset: 6,
    viewBoxSize: 60,
  });
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
    viewBoxSize: 32,
  });
}
