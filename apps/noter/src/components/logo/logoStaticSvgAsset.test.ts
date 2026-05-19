import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";

import {
  createInteractiveLogoSvgMarkup,
  createLogoIdentityViewSvgMarkup,
  createStaticLogoSvgMarkup,
} from "@/components/logo/logoStaticSvgAsset";
import {
  INTERACTIVE_LOGO_SVG_URL,
  LOGO_IDENTITY_EDIT_MARK_SVG_URL,
  LOGO_IDENTITY_VIEW_CONTRACTS,
  STATIC_LOGO_ELEVATION_DEGREES,
  type LogoIdentityViewId,
} from "@/components/logo/logoStaticSvgContract";

function readPublicAsset(assetPath: string) {
  return readFileSync(
    new URL(`../../../public/${assetPath.replace(/^\//, "")}`, import.meta.url),
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

  it("keeps recursive static SVG output bounded with nested reuse", () => {
    const generatedStaticLogoSvgMarkup = createStaticLogoSvgMarkup({
      depth: 5,
    });

    expect(generatedStaticLogoSvgMarkup).toContain("<polygon ");
    expect(generatedStaticLogoSvgMarkup).toContain(
      '<use href="#logo-recursive-level-5"',
    );
    expect(generatedStaticLogoSvgMarkup.match(/<use /g) ?? []).toHaveLength(49);
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

  it("keeps the interactive logo svg in sync with the generated identity states", () => {
    const committedSvg = readPublicAsset(INTERACTIVE_LOGO_SVG_URL);
    const generatedSvg = createInteractiveLogoSvgMarkup()
      .replace(/\r\n/g, "\n")
      .trim();

    expect(committedSvg).toBe(generatedSvg);
  });

  it("switches the interactive logo from version 1 to version 2 on hover and version 3 while active", () => {
    const generatedSvg = createInteractiveLogoSvgMarkup();

    expect(generatedSvg).toContain('data-logo-view="side-primary"');
    expect(generatedSvg).toContain('data-logo-version="1"');
    expect(generatedSvg).toContain('data-logo-view="side-diagonal"');
    expect(generatedSvg).toContain('data-logo-version="2"');
    expect(generatedSvg).toContain('data-logo-view="spatial"');
    expect(generatedSvg).toContain('data-logo-version="3"');
    expect(generatedSvg).toContain(
      ".noter-logo-interactive-svg:hover .noter-logo-state-v2",
    );
    expect(generatedSvg).toContain(
      ".noter-logo-interactive-svg:active .noter-logo-state-v3",
    );
  });
});
