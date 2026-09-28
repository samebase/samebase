import {
  DEFAULT_LOGO_FACE_TREATMENT,
  type LogoFaceTreatment,
} from "@samebase/logo-model/face-treatment";
import { createLogoIdentityViewSvgMarkup } from "./logoStaticSvgAsset";
import { SAMEBASE_BRAND_COPY } from "../publicSite/samebaseBrandCopy";

const BRAND_PRIMARY_COLOR = "#394447";
const BRAND_BACKGROUND_COLOR = "#ffffff";
const SOCIAL_CARD_WIDTH = 1200;
const SOCIAL_CARD_HEIGHT = 630;
const SOCIAL_CARD_TEXT_X = 433;
const SOCIAL_CARD_SITE_NAME_Y = 262;
const SOCIAL_CARD_SITE_NAME_FONT_SIZE = 82;
const SOCIAL_CARD_TAGLINE_LINE_ONE_Y = 356;
const SOCIAL_CARD_TAGLINE_LINE_TWO_Y = 413;
const SOCIAL_CARD_TAGLINE_FONT_SIZE = 48;
const X_PROFILE_LOGO_VIEWPORT_SIZE = 220;

function escapeSvgText(text: string): string {
  return text.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;");
}

function readSvgBody(svgMarkup: string): string {
  const openTagEnd = svgMarkup.indexOf(">");
  const closeTagStart = svgMarkup.lastIndexOf("</svg>");
  if (openTagEnd < 0 || closeTagStart <= openTagEnd) {
    throw new Error("Expected generated logo SVG markup.");
  }

  return svgMarkup.slice(openTagEnd + 1, closeTagStart);
}

function createLogoSvgBody(
  viewId: "side-primary" | "side-diagonal" | "spatial",
  faceTreatment: LogoFaceTreatment,
) {
  return readSvgBody(createLogoIdentityViewSvgMarkup(viewId, { faceTreatment }));
}

export function createSamebaseSocialCardSvgMarkup({
  faceTreatment = DEFAULT_LOGO_FACE_TREATMENT,
}: {
  faceTreatment?: LogoFaceTreatment;
} = {}) {
  const logoBody = createLogoSvgBody("side-primary", faceTreatment);

  return `<svg
  xmlns="http://www.w3.org/2000/svg"
  width="${SOCIAL_CARD_WIDTH}"
  height="${SOCIAL_CARD_HEIGHT}"
  viewBox="0 0 ${SOCIAL_CARD_WIDTH} ${SOCIAL_CARD_HEIGHT}"
  role="img"
  aria-labelledby="title desc"
>
  <title id="title">${escapeSvgText(SAMEBASE_BRAND_COPY.socialCard.title)}</title>
  <desc id="desc">
    ${escapeSvgText(SAMEBASE_BRAND_COPY.socialCard.accessibleDescription)}
  </desc>

  <rect width="${SOCIAL_CARD_WIDTH}" height="${SOCIAL_CARD_HEIGHT}" fill="${BRAND_BACKGROUND_COLOR}" />

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
  <text
    fill="${BRAND_PRIMARY_COLOR}"
    font-family="ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    font-size="${SOCIAL_CARD_TAGLINE_FONT_SIZE}"
    font-weight="460"
    letter-spacing="0"
  >
    <tspan
      x="${SOCIAL_CARD_TEXT_X}"
      y="${SOCIAL_CARD_TAGLINE_LINE_ONE_Y}"
    >
      ${escapeSvgText(SAMEBASE_BRAND_COPY.socialCard.textLines[0])}
    </tspan>
    <tspan
      x="${SOCIAL_CARD_TEXT_X}"
      y="${SOCIAL_CARD_TAGLINE_LINE_TWO_Y}"
    >
      ${escapeSvgText(SAMEBASE_BRAND_COPY.socialCard.textLines[1])}
    </tspan>
  </text>
</svg>`;
}

export function createSamebaseXProfileBannerSvgMarkup({
  faceTreatment = DEFAULT_LOGO_FACE_TREATMENT,
}: {
  faceTreatment?: LogoFaceTreatment;
} = {}) {
  const sidePrimaryLogoBody = createLogoSvgBody("side-primary", faceTreatment);
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

  <svg x="520" y="116" width="${X_PROFILE_LOGO_VIEWPORT_SIZE}" height="${X_PROFILE_LOGO_VIEWPORT_SIZE}" viewBox="0 0 360 360" aria-hidden="true">
${sidePrimaryLogoBody}
  </svg>

  <svg x="775" y="120" width="${X_PROFILE_LOGO_VIEWPORT_SIZE}" height="${X_PROFILE_LOGO_VIEWPORT_SIZE}" viewBox="0 0 360 360" aria-hidden="true">
${sideDiagonalLogoBody}
  </svg>

  <svg x="1070" y="130" width="${X_PROFILE_LOGO_VIEWPORT_SIZE}" height="${X_PROFILE_LOGO_VIEWPORT_SIZE}" viewBox="0 0 360 360" aria-hidden="true">
${spatialLogoBody}
  </svg>
</svg>`;
}
