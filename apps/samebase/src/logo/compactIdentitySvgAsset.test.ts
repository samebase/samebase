import { readFileSync } from "node:fs";
import { PNG } from "pngjs";
import { describe, expect, it } from "vite-plus/test";

import {
  COMPACT_IDENTITY_BACKGROUND_COLOR,
  COMPACT_IDENTITY_FOREGROUND_COLOR,
  COMPACT_IDENTITY_SOURCE_SVG_URL,
  COMPACT_IDENTITY_SVG_URL,
  LANDING_INLINE_80_PERCENT_MARK_SVG_URL,
  INSTALL_ICON_SVG_URL,
  MASKABLE_COMPACT_IDENTITY_SOURCE_SVG_URL,
  createCompactIdentitySvgMarkup,
  createDarkCompactIdentitySvgMarkup,
  createFaviconCompactIdentitySvgMarkup,
  createLandingInline80PercentMarkSvgMarkup,
  createMaskableCompactIdentitySvgMarkup,
} from "@/logo/compactIdentitySvgAsset";

function readPublicSvg(assetPath: string) {
  return readFileSync(
    new URL(`../../public/${assetPath.replace(/^\//, "")}`, import.meta.url),
    "utf8",
  )
    .replace(/\r\n/g, "\n")
    .trim();
}

function readHexColor(color: string): [number, number, number] {
  if (!/^#[0-9a-f]{6}$/i.test(color)) {
    throw new Error(`Expected a six-digit hex color, received ${color}.`);
  }

  return [
    Number.parseInt(color.slice(1, 3), 16),
    Number.parseInt(color.slice(3, 5), 16),
    Number.parseInt(color.slice(5, 7), 16),
  ];
}

const rasterContracts = [
  {
    canvasSize: 16,
    filename: "favicon.png",
    inset: 2,
    markSize: 12,
    openingInset: 6,
    openingSize: 4,
  },
  {
    canvasSize: 32,
    filename: "favicon-32.png",
    inset: 4,
    markSize: 24,
    openingInset: 12,
    openingSize: 8,
  },
  {
    canvasSize: 180,
    filename: "apple-touch-icon.png",
    inset: 27,
    markSize: 126,
    openingInset: 69,
    openingSize: 42,
  },
  {
    canvasSize: 192,
    filename: "icon-192.png",
    inset: 29,
    markSize: 134,
    openingInset: 74,
    openingSize: 44,
  },
  {
    canvasSize: 256,
    filename: "chatgpt-app-icon.png",
    inset: 38,
    markSize: 180,
    openingInset: 98,
    openingSize: 60,
  },
  {
    canvasSize: 256,
    filename: "chatgpt-app-icon-dark.png",
    inset: 38,
    inverted: true,
    markSize: 180,
    openingInset: 98,
    openingSize: 60,
  },
  {
    canvasSize: 512,
    filename: "icon-512.png",
    inset: 77,
    markSize: 358,
    openingInset: 196,
    openingSize: 120,
  },
  {
    canvasSize: 192,
    filename: "icon-maskable-192.png",
    inset: 42,
    markSize: 108,
    openingInset: 78,
    openingSize: 36,
  },
  {
    canvasSize: 512,
    filename: "icon-maskable-512.png",
    inset: 112,
    markSize: 288,
    openingInset: 208,
    openingSize: 96,
  },
] as const;

describe("compactIdentitySvgAsset", () => {
  it("keeps every standard compact SVG alias on the canonical version 1 mark", () => {
    const generatedSvg = createCompactIdentitySvgMarkup().replace(/\r\n/g, "\n").trim();

    expect(readPublicSvg(COMPACT_IDENTITY_SOURCE_SVG_URL)).toBe(generatedSvg);
    expect(readPublicSvg(COMPACT_IDENTITY_SVG_URL)).toBe(generatedSvg);
    expect(readPublicSvg(INSTALL_ICON_SVG_URL)).toBe(generatedSvg);
  });

  it("keeps the standard mark inside a circular crop", () => {
    const generatedSvg = createCompactIdentitySvgMarkup();

    expect(generatedSvg).toContain(`fill="${COMPACT_IDENTITY_BACKGROUND_COLOR}"`);
    expect(generatedSvg).toContain(`fill="${COMPACT_IDENTITY_FOREGROUND_COLOR}"`);
    expect(generatedSvg).toContain('d="M9 9h42v42H9z M23 23h14v14H23z"');
  });

  it("keeps the favicon visible mark at 75% on the 8px grid", () => {
    const generatedSvg = createFaviconCompactIdentitySvgMarkup();

    expect(generatedSvg).toContain('d="M1 1h6v6H1z M3 3h2v2H3z"');
  });

  it("keeps the landing-page inline visible mark at 80%", () => {
    const generatedSvg = createLandingInline80PercentMarkSvgMarkup().replace(/\r\n/g, "\n").trim();

    expect(readPublicSvg(LANDING_INLINE_80_PERCENT_MARK_SVG_URL)).toBe(generatedSvg);
    expect(generatedSvg).toContain('viewBox="0 0 60 60"');
    expect(generatedSvg).toContain('d="M6 6h48v48H6z M22 22h16v16H22z"');
    expect(generatedSvg).toContain('fill-rule="evenodd"');
    expect(generatedSvg).toContain(
      `<rect width="60" height="60" fill="${COMPACT_IDENTITY_BACKGROUND_COLOR}" />`,
    );
    expect(
      readFileSync(
        new URL("../../../../templates/base/public/favicon.svg", import.meta.url),
        "utf8",
      ).trim(),
    ).toBe(generatedSvg);
  });

  it("keeps the dark ChatGPT icon on the inverse compact identity", () => {
    const generatedSvg = createDarkCompactIdentitySvgMarkup();

    expect(generatedSvg).toContain(`fill="${COMPACT_IDENTITY_FOREGROUND_COLOR}"`);
    expect(generatedSvg).toContain(`fill="${COMPACT_IDENTITY_BACKGROUND_COLOR}"`);
    expect(generatedSvg).toContain('d="M9 9h42v42H9z M23 23h14v14H23z"');
  });

  it("keeps the maskable mark square and inside its safe area", () => {
    const generatedSvg = createMaskableCompactIdentitySvgMarkup().replace(/\r\n/g, "\n").trim();

    expect(readPublicSvg(MASKABLE_COMPACT_IDENTITY_SOURCE_SVG_URL)).toBe(generatedSvg);
    expect(generatedSvg).toContain('d="M7 7h18v18H7z M13 13h6v6H13z"');
  });

  it("keeps every raster export on exact square geometry", () => {
    const background = readHexColor(COMPACT_IDENTITY_BACKGROUND_COLOR);
    const foreground = readHexColor(COMPACT_IDENTITY_FOREGROUND_COLOR);

    for (const contract of rasterContracts) {
      const png = PNG.sync.read(
        readFileSync(new URL(`../../public/${contract.filename}`, import.meta.url)),
      );
      expect({ height: png.height, width: png.width }).toEqual({
        height: contract.canvasSize,
        width: contract.canvasSize,
      });

      for (let y = 0; y < png.height; y += 1) {
        for (let x = 0; x < png.width; x += 1) {
          const insideMark =
            x >= contract.inset &&
            x < contract.inset + contract.markSize &&
            y >= contract.inset &&
            y < contract.inset + contract.markSize;
          const insideOpening =
            x >= contract.openingInset &&
            x < contract.openingInset + contract.openingSize &&
            y >= contract.openingInset &&
            y < contract.openingInset + contract.openingSize;
          const inverted = "inverted" in contract && contract.inverted;
          const canvasColor = inverted ? foreground : background;
          const markColor = inverted ? background : foreground;
          const expectedColor = insideMark && !insideOpening ? markColor : canvasColor;
          const pixelOffset = (y * png.width + x) * 4;

          if (
            png.data[pixelOffset] !== expectedColor[0] ||
            png.data[pixelOffset + 1] !== expectedColor[1] ||
            png.data[pixelOffset + 2] !== expectedColor[2] ||
            png.data[pixelOffset + 3] !== 255
          ) {
            throw new Error(`${contract.filename} has an unexpected pixel at ${x},${y}.`);
          }
        }
      }
    }
  });
});
