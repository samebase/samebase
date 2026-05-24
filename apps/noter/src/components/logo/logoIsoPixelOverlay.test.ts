import { describe, expect, it } from "vite-plus/test";

import {
  applyLogoIsoPixelOverlayPaint,
  createLogoIsoPixelKey,
  parseLogoIsoPixelKey,
  type LogoIsoPixelOverlay,
} from "@/components/logo/logoIsoPixelOverlay";

describe("logoIsoPixelOverlay", () => {
  it("draws floored in-bounds pixels into a sparse overlay", () => {
    const overlay = applyLogoIsoPixelOverlayPaint(undefined, {
      canvasHeight: 10,
      canvasWidth: 10,
      cubeSidePixels: 16,
      kind: "draw",
      pixels: [
        { x: 1.8, y: 2.2 },
        { x: 12, y: 2 },
      ],
    });

    expect(overlay?.pixelKeys).toEqual(new Set([createLogoIsoPixelKey(1, 2)]));
  });

  it("erases pixels and drops empty overlays", () => {
    const overlay: LogoIsoPixelOverlay = {
      pixelKeys: new Set([createLogoIsoPixelKey(1, 2)]),
    };

    expect(
      applyLogoIsoPixelOverlayPaint(overlay, {
        canvasHeight: 10,
        canvasWidth: 10,
        cubeSidePixels: 16,
        kind: "erase",
        pixels: [{ x: 1, y: 2 }],
      }),
    ).toBeUndefined();
  });

  it("parses only canonical pixel keys", () => {
    expect(parseLogoIsoPixelKey("3,4")).toEqual({ x: 3, y: 4 });
    expect(parseLogoIsoPixelKey("3")).toBeNull();
    expect(parseLogoIsoPixelKey("left,4")).toBeNull();
    expect(parseLogoIsoPixelKey("3px,4")).toBeNull();
  });
});
