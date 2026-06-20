import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";

import {
  createSamebaseSocialCardSvgMarkup,
  createSamebaseXProfileBannerSvgMarkup,
} from "@/components/socialLogoAssets";

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

  it("keeps the committed profile banner svg in sync with the generated default treatment", () => {
    expect(readPublicAsset("samebase-x-profile-banner.svg")).toBe(
      createSamebaseXProfileBannerSvgMarkup().replace(/\r\n/g, "\n").trim(),
    );
  });

  it("keeps social logo svgs on the striped treatment by default", () => {
    expect(createSamebaseSocialCardSvgMarkup()).not.toContain("#ecfccb");
    expect(createSamebaseXProfileBannerSvgMarkup()).not.toContain("#ecfccb");
  });
});
