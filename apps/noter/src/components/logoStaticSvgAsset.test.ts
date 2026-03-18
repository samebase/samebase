import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  STATIC_LOGO_BACKGROUND_COLOR,
  STATIC_LOGO_ELEVATION_DEGREES,
  STATIC_LOGO_FACE_COLORS,
  STATIC_LOGO_ROTATION_DEGREES,
  STATIC_LOGO_VOXEL_COORDINATES,
} from "@/components/logoStaticSvgContract";
import { createLogoThreeSvgMarkup } from "@/components/logoThreeSvgRenderer";
import { createFilledVoxelSet } from "@/components/logoVoxelState";

const generatedStaticLogoSvgMarkup = createLogoThreeSvgMarkup({
  backgroundColor: STATIC_LOGO_BACKGROUND_COLOR,
  elevationDegrees: STATIC_LOGO_ELEVATION_DEGREES,
  faceColors: STATIC_LOGO_FACE_COLORS,
  filledVoxels: createFilledVoxelSet(STATIC_LOGO_VOXEL_COORDINATES),
  rotationDegrees: STATIC_LOGO_ROTATION_DEGREES,
});

describe("logoStaticSvgAsset", () => {
  it("keeps the committed favicon svg in sync with the generated markup", () => {
    const faviconSvg = readFileSync(
      new URL("../../public/favicon.svg", import.meta.url),
      "utf8",
    )
      .replace(/\r\n/g, "\n")
      .trim();
    const generatedSvg = generatedStaticLogoSvgMarkup
      .replace(/\r\n/g, "\n")
      .trim();

    expect(faviconSvg).toBe(generatedSvg);
  });

  it("exports real face polygons instead of a raster traced into one-pixel rects", () => {
    expect(generatedStaticLogoSvgMarkup).toContain("<polygon ");
    expect(generatedStaticLogoSvgMarkup).not.toContain(' height="1" ');
  });
});
