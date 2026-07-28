import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";

import {
  createLogoIdentityViewSvgMarkup,
  createStaticLogoSvgMarkup,
} from "@/components/logo/logoStaticSvgAsset";
import {
  DEFAULT_LOGO_FACE_TREATMENT,
  LOGO_FACE_TREATMENTS,
} from "@samebase/logo-model/face-treatment";
import {
  LOGO_IDENTITY_VIEW_CONTRACTS,
  getLogoIdentityAssetPath,
} from "@/components/logo/logoStaticSvgContract";
import {
  STATIC_LOGO_ELEVATION_DEGREES,
  type LogoIdentityViewId,
} from "@samebase/logo-model/identity";

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
    const generatedSvg = createStaticLogoSvgMarkup().replace(/\r\n/g, "\n").trim();

    expect(staticLogoSvg).toBe(generatedSvg);
  });

  it("uses the duotone treatment for the default static logo", () => {
    const generatedSvg = createStaticLogoSvgMarkup();

    expect(DEFAULT_LOGO_FACE_TREATMENT).toBe("duotone");
    expect(generatedSvg).toContain('fill="#00b8db"');
    expect(generatedSvg).toContain('stroke="#00b8db"');
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
    expect(generatedStaticLogoSvgMarkup).toContain('<use href="#logo-recursive-level-5"');
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
      assetPath: "/logo-v2-side-diagonal.svg",
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

  it("renders the side-primary mark as one seam-free path", () => {
    for (const faceTreatment of LOGO_FACE_TREATMENTS) {
      const sidePrimarySvg = createLogoIdentityViewSvgMarkup("side-primary", {
        faceTreatment,
      });

      expect(sidePrimarySvg.match(/<path /g)).toHaveLength(1);
      expect(sidePrimarySvg).not.toContain("<polygon ");
    }

    expect(createLogoIdentityViewSvgMarkup("side-diagonal")).toContain("<polygon ");
    expect(createLogoIdentityViewSvgMarkup("spatial")).toContain("<polygon ");
  });

  it("keeps the committed logo identity svgs in sync with their view contract", () => {
    for (const view of LOGO_IDENTITY_VIEW_CONTRACTS) {
      const committedSvg = readPublicAsset(view.assetPath);
      const generatedSvg = createLogoIdentityViewSvgMarkup(view.id).replace(/\r\n/g, "\n").trim();

      expect(committedSvg).toBe(generatedSvg);

      for (const faceTreatment of LOGO_FACE_TREATMENTS) {
        const treatmentAssetPath = getLogoIdentityAssetPath({
          treatment: faceTreatment,
          viewId: view.id,
        });
        const treatmentSvg = readPublicAsset(treatmentAssetPath);
        const generatedTreatmentSvg = createLogoIdentityViewSvgMarkup(view.id, {
          faceTreatment,
        })
          .replace(/\r\n/g, "\n")
          .trim();

        expect(treatmentSvg).toBe(generatedTreatmentSvg);
      }
    }
  });
});
