import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  createInstallIconSvgMarkup,
  INSTALL_ICON_BACKGROUND_COLOR,
} from "@/components/installIconSvgAsset";

describe("installIconSvgAsset", () => {
  it("keeps the committed install icon svg in sync with the generated markup", () => {
    const installIconSvg = readFileSync(
      new URL("../../public/install-icon.svg", import.meta.url),
      "utf8",
    )
      .replace(/\r\n/g, "\n")
      .trim();
    const generatedSvg = createInstallIconSvgMarkup()
      .replace(/\r\n/g, "\n")
      .trim();

    expect(installIconSvg).toBe(generatedSvg);
  });

  it("uses a white canvas and preserves the white-mode top faces", () => {
    const generatedSvg = createInstallIconSvgMarkup();

    expect(generatedSvg).toContain(`fill="${INSTALL_ICON_BACKGROUND_COLOR}"`);
    expect(generatedSvg).not.toContain('fill="transparent"');
    expect(generatedSvg).toContain('stroke="#ffffff"');
  });
});
