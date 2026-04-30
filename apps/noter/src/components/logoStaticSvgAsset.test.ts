import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";

import {
  createLogoIdentityViewSvgMarkup,
  createStaticLogoSvgMarkup,
} from "@/components/logoStaticSvgAsset";
import {
  LOGO_IDENTITY_EDIT_MARK_SVG_URL,
  LOGO_IDENTITY_VIEW_CONTRACTS,
  STATIC_LOGO_ELEVATION_DEGREES,
  type LogoIdentityViewId,
} from "@/components/logoStaticSvgContract";

function readPublicAsset(assetPath: string) {
  return readFileSync(
    new URL(`../../public/${assetPath.replace(/^\//, "")}`, import.meta.url),
    "utf8",
  )
    .replace(/\r\n/g, "\n")
    .trim();
}

function getLogoIdentityView(viewId: LogoIdentityViewId) {
  const view = LOGO_IDENTITY_VIEW_CONTRACTS.find(({ id }) => id === viewId);
  if (!view) {
    throw new Error(`Missing logo identity view ${viewId}`);
  }
  return view;
}

describe("logoStaticSvgAsset", () => {
  it("keeps the committed static logo svg in sync with the generated markup", () => {
    const staticLogoSvg = readPublicAsset("/logo-static.svg");
    const generatedSvg = createStaticLogoSvgMarkup()
      .replace(/\r\n/g, "\n")
      .trim();

    expect(staticLogoSvg).toBe(generatedSvg);
  });

  it("exports real face polygons instead of a raster traced into one-pixel rects", () => {
    const generatedStaticLogoSvgMarkup = createStaticLogoSvgMarkup();

    expect(generatedStaticLogoSvgMarkup).toContain("<polygon ");
    expect(generatedStaticLogoSvgMarkup).not.toContain(' height="1" ');
  });

  it("defines the three logo identity views as stable generated assets", () => {
    const sidePrimary = getLogoIdentityView("side-primary");
    const sideDiagonal = getLogoIdentityView("side-diagonal");
    const spatial = getLogoIdentityView("spatial");

    expect(sidePrimary).toMatchObject({
      assetPath: "/logo-v1-side-primary.svg",
      elevationDegrees: 0,
      rotationDegrees: 0,
      version: 1,
    });
    expect(sideDiagonal).toMatchObject({
      assetPath: LOGO_IDENTITY_EDIT_MARK_SVG_URL,
      elevationDegrees: 0,
      rotationDegrees: 45,
      version: 2,
    });
    expect(spatial).toMatchObject({
      assetPath: "/logo-static.svg",
      elevationDegrees: STATIC_LOGO_ELEVATION_DEGREES,
      rotationDegrees: 45,
      version: 3,
    });
  });

  it("keeps the committed logo identity svgs in sync with their view contract", () => {
    for (const view of LOGO_IDENTITY_VIEW_CONTRACTS) {
      const committedSvg = readPublicAsset(view.assetPath);
      const generatedSvg = createLogoIdentityViewSvgMarkup(view.id)
        .replace(/\r\n/g, "\n")
        .trim();

      expect(committedSvg).toBe(generatedSvg);
    }
  });
});
