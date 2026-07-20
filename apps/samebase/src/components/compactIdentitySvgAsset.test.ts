import { readFileSync } from "node:fs";
import { PNG } from "pngjs";
import { describe, expect, it } from "vite-plus/test";

import {
  COMPACT_IDENTITY_BACKGROUND_COLOR,
  COMPACT_IDENTITY_FOREGROUND_COLOR,
  COMPACT_IDENTITY_SOURCE_SVG_URL,
  COMPACT_IDENTITY_SVG_URL,
  INSTALL_ICON_SVG_URL,
  MASKABLE_COMPACT_IDENTITY_SOURCE_SVG_URL,
  createCompactIdentitySvgMarkup,
  createMaskableCompactIdentitySvgMarkup,
} from "@/components/compactIdentitySvgAsset";

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
    inset: 22,
    markSize: 135,
    openingInset: 67,
    openingSize: 45,
  },
  {
    canvasSize: 192,
    filename: "icon-192.png",
    inset: 24,
    markSize: 144,
    openingInset: 72,
    openingSize: 48,
  },
  {
    canvasSize: 256,
    filename: "chatgpt-app-icon.png",
    inset: 32,
    markSize: 192,
    openingInset: 96,
    openingSize: 64,
  },
  {
    canvasSize: 512,
    filename: "icon-512.png",
    inset: 64,
    markSize: 384,
    openingInset: 192,
    openingSize: 128,
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

  it("uses exact square geometry for the standard mark", () => {
    const generatedSvg = createCompactIdentitySvgMarkup();

    expect(generatedSvg).toContain(`fill="${COMPACT_IDENTITY_BACKGROUND_COLOR}"`);
    expect(generatedSvg).toContain(`fill="${COMPACT_IDENTITY_FOREGROUND_COLOR}"`);
    expect(generatedSvg).toContain('x="1" y="1" width="6" height="6"');
    expect(generatedSvg).toContain('x="3" y="3" width="2" height="2"');
  });

  it("keeps the maskable mark square and inside its safe area", () => {
    const generatedSvg = createMaskableCompactIdentitySvgMarkup().replace(/\r\n/g, "\n").trim();

    expect(readPublicSvg(MASKABLE_COMPACT_IDENTITY_SOURCE_SVG_URL)).toBe(generatedSvg);
    expect(generatedSvg).toContain('x="7" y="7" width="18" height="18"');
    expect(generatedSvg).toContain('x="13" y="13" width="6" height="6"');
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
          const expectedColor = insideMark && !insideOpening ? foreground : background;
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
