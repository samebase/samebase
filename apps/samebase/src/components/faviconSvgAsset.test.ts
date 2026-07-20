import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";

import {
  createFaviconSvgMarkup,
  FAVICON_BACKGROUND_COLOR,
  FAVICON_FOREGROUND_COLOR,
} from "@/components/faviconSvgAsset";

describe("faviconSvgAsset", () => {
  it("keeps the committed favicon source in sync with the generated markup", () => {
    const faviconSvg = readFileSync(
      new URL("../../public/brand/favicon/sierpinski-carpet-depth-2.svg", import.meta.url),
      "utf8",
    )
      .replace(/\r\n/g, "\n")
      .trim();

    expect(faviconSvg).toBe(createFaviconSvgMarkup().replace(/\r\n/g, "\n").trim());
  });

  it("uses the compact monochrome palette and the recursive carpet openings", () => {
    const generatedSvg = createFaviconSvgMarkup();

    expect(generatedSvg).toContain(`fill="${FAVICON_BACKGROUND_COLOR}"`);
    expect(generatedSvg).toContain(`fill="${FAVICON_FOREGROUND_COLOR}"`);
    expect(generatedSvg).toContain("M4 4h3v3H4z");
    expect(generatedSvg.match(/h1v1/g)).toHaveLength(8);
  });
});
