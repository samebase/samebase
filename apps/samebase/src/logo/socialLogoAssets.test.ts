import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";

import {
  createSamebaseSocialCardSvgMarkup,
  createSamebaseXProfileBannerSvgMarkup,
} from "@/logo/socialLogoAssets";
import { createLogoIdentityViewSvgMarkup } from "@/logo/logoStaticSvgAsset";

function readPublicAsset(assetPath: string) {
  return readFileSync(new URL(`../../public/${assetPath}`, import.meta.url), "utf8")
    .replace(/\r\n/g, "\n")
    .trim();
}

describe("socialLogoAssets", () => {
  it("keeps the committed social card svg in sync with the generated default treatment", () => {
    expect(readPublicAsset("samebase-social-card.svg")).toBe(
      createSamebaseSocialCardSvgMarkup().replace(/\r\n/g, "\n").trim(),
    );
  });

  it("renders the variant 1 side-primary mark on the social card", () => {
    const variantOneSvg = createLogoIdentityViewSvgMarkup("side-primary");
    const variantOneBody = variantOneSvg.slice(
      variantOneSvg.indexOf(">") + 1,
      variantOneSvg.lastIndexOf("</svg>"),
    );

    expect(createSamebaseSocialCardSvgMarkup()).toContain(variantOneBody);
  });

  it("keeps the committed profile banner svg in sync with the generated default treatment", () => {
    expect(readPublicAsset("samebase-x-profile-banner.svg")).toBe(
      createSamebaseXProfileBannerSvgMarkup().replace(/\r\n/g, "\n").trim(),
    );
  });

  it("keeps the profile banner on the duotone treatment by default", () => {
    expect(createSamebaseXProfileBannerSvgMarkup()).toContain("#00b8db");
  });

  it("renders all three profile banner marks at the same cube scale", () => {
    const logoViewports = createSamebaseXProfileBannerSvgMarkup().match(
      /width="220" height="220" viewBox="0 0 360 360"/gu,
    );

    expect(logoViewports).toHaveLength(3);
  });
});
