import { DEFAULT_LOGO_FACE_TREATMENT, type LogoFaceTreatment } from "./logo/logoFaceTreatment";
import { createLogoIdentityViewSvgMarkup } from "./logo/logoStaticSvgAsset";
import { SAMEBASE_BRAND_COPY } from "../lib/samebaseBrandCopy";

const BRAND_PRIMARY_COLOR = "#394447";
const BRAND_BACKGROUND_COLOR = "#ffffff";
const SOCIAL_CARD_TEXT_X = 530;
const SOCIAL_CARD_SITE_NAME_Y = 292;
const SOCIAL_CARD_SITE_NAME_FONT_SIZE = 86;
const SOCIAL_CARD_TAGLINE_FIRST_LINE_Y = 356;
const SOCIAL_CARD_TAGLINE_FONT_SIZE = 34;
const SOCIAL_CARD_TAGLINE_LINE_HEIGHT = 42;
const SOCIAL_CARD_TAGLINE_MAX_CHARACTERS = 34;

function escapeSvgText(text: string): string {
  return text.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;");
}

function wrapSocialCardText(text: string): string[] {
  const words = text
    .trim()
    .split(/\s+/u)
    .filter((word) => word.length > 0);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    if (currentLine.length === 0) {
      currentLine = word;
      continue;
    }

    const nextLine = `${currentLine} ${word}`;
    if (nextLine.length <= SOCIAL_CARD_TAGLINE_MAX_CHARACTERS) {
      currentLine = nextLine;
      continue;
    }

    lines.push(currentLine);
    currentLine = word;
  }

  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  return lines.length > 0 ? lines : [""];
}

function createSocialCardTaglineTextMarkup(): string {
  return wrapSocialCardText(SAMEBASE_BRAND_COPY.socialCard.text)
    .map(
      (line, index) => `  <text
    x="${SOCIAL_CARD_TEXT_X}"
    y="${SOCIAL_CARD_TAGLINE_FIRST_LINE_Y + index * SOCIAL_CARD_TAGLINE_LINE_HEIGHT}"
    fill="${BRAND_PRIMARY_COLOR}"
    font-family="ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    font-size="${SOCIAL_CARD_TAGLINE_FONT_SIZE}"
    font-weight="430"
    letter-spacing="0"
  >
    ${escapeSvgText(line)}
  </text>`,
    )
    .join("\n");
}

function readSvgBody(svgMarkup: string): string {
  const openTagEnd = svgMarkup.indexOf(">");
  const closeTagStart = svgMarkup.lastIndexOf("</svg>");
  if (openTagEnd < 0 || closeTagStart <= openTagEnd) {
    throw new Error("Expected generated logo SVG markup.");
  }

  return svgMarkup.slice(openTagEnd + 1, closeTagStart);
}

function createLogoSvgBody(viewId: "side-diagonal" | "spatial", faceTreatment: LogoFaceTreatment) {
  return readSvgBody(createLogoIdentityViewSvgMarkup(viewId, { faceTreatment }));
}

export function createSamebaseSocialCardSvgMarkup({
  faceTreatment = DEFAULT_LOGO_FACE_TREATMENT,
}: {
  faceTreatment?: LogoFaceTreatment;
} = {}) {
  const logoBody = createLogoSvgBody("spatial", faceTreatment);
  const taglineTextMarkup = createSocialCardTaglineTextMarkup();

  return `<svg
  xmlns="http://www.w3.org/2000/svg"
  width="1200"
  height="630"
  viewBox="0 0 1200 630"
  role="img"
  aria-labelledby="title desc"
>
  <title id="title">${escapeSvgText(SAMEBASE_BRAND_COPY.socialCard.title)}</title>
  <desc id="desc">
    ${escapeSvgText(SAMEBASE_BRAND_COPY.socialCard.accessibleDescription)}
  </desc>

  <rect width="1200" height="630" fill="${BRAND_BACKGROUND_COLOR}" />

  <svg x="120" y="155" width="320" height="320" viewBox="0 0 360 360" aria-hidden="true">
${logoBody}
  </svg>

  <text
    x="${SOCIAL_CARD_TEXT_X}"
    y="${SOCIAL_CARD_SITE_NAME_Y}"
    fill="${BRAND_PRIMARY_COLOR}"
    font-family="ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    font-size="${SOCIAL_CARD_SITE_NAME_FONT_SIZE}"
    font-weight="650"
    letter-spacing="0"
  >
    ${escapeSvgText(SAMEBASE_BRAND_COPY.siteName)}
  </text>
${taglineTextMarkup}
</svg>`;
}

export function createSamebaseXProfileBannerSvgMarkup({
  faceTreatment = DEFAULT_LOGO_FACE_TREATMENT,
}: {
  faceTreatment?: LogoFaceTreatment;
} = {}) {
  const sideDiagonalLogoBody = createLogoSvgBody("side-diagonal", faceTreatment);
  const spatialLogoBody = createLogoSvgBody("spatial", faceTreatment);

  return `<svg
  xmlns="http://www.w3.org/2000/svg"
  width="1500"
  height="500"
  viewBox="0 0 1500 500"
  role="img"
  aria-labelledby="title desc"
>
  <title id="title">samebase.com profile banner</title>
  <desc id="desc">Three Samebase identity marks on a white background.</desc>

  <rect width="1500" height="500" fill="${BRAND_BACKGROUND_COLOR}" />

  <g aria-hidden="true">
    <rect x="562" y="158" width="136" height="136" fill="${BRAND_PRIMARY_COLOR}" />
    <rect x="607" y="203" width="46" height="46" fill="${BRAND_BACKGROUND_COLOR}" />
  </g>

  <svg x="800" y="145" width="170" height="170" viewBox="0 0 360 360" aria-hidden="true">
${sideDiagonalLogoBody}
  </svg>

  <svg x="1070" y="130" width="220" height="220" viewBox="0 0 360 360" aria-hidden="true">
${spatialLogoBody}
  </svg>
</svg>`;
}
