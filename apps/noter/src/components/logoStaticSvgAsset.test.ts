import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { DEFAULT_STATIC_LOGO_SVG_MARKUP } from "@/components/logoStaticSvgAsset";

describe("logoStaticSvgAsset", () => {
  it("keeps the committed favicon svg in sync with the generated markup", () => {
    const faviconSvg = readFileSync(
      new URL("../../public/favicon.svg", import.meta.url),
      "utf8",
    )
      .replace(/\r\n/g, "\n")
      .trim();
    const generatedSvg = DEFAULT_STATIC_LOGO_SVG_MARKUP.replace(
      /\r\n/g,
      "\n",
    ).trim();

    expect(faviconSvg).toBe(generatedSvg);
  });
});
