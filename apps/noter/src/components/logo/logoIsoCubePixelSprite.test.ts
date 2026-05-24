import { describe, expect, it } from "vite-plus/test";

import {
  applyLogoIsoCubePixelSpritePaint,
  createLogoIsoCubePixelKey,
  parseLogoIsoCubePixelKey,
  type LogoIsoCubePixelSprite,
} from "@/components/logo/logoIsoCubePixelSprite";

describe("logoIsoCubePixelSprite", () => {
  it("draws floored in-bounds pixels into a sparse sprite", () => {
    const sprite = applyLogoIsoCubePixelSpritePaint(undefined, {
      canvasHeight: 10,
      canvasWidth: 10,
      cubeSidePixels: 16,
      kind: "draw",
      pixels: [
        { x: 1.8, y: 2.2 },
        { x: 12, y: 2 },
      ],
    });

    expect(sprite?.pixelKeys).toEqual(new Set([createLogoIsoCubePixelKey(1, 2)]));
  });

  it("erases pixels and drops empty sprites", () => {
    const sprite: LogoIsoCubePixelSprite = {
      pixelKeys: new Set([createLogoIsoCubePixelKey(1, 2)]),
    };

    expect(
      applyLogoIsoCubePixelSpritePaint(sprite, {
        canvasHeight: 10,
        canvasWidth: 10,
        cubeSidePixels: 16,
        kind: "erase",
        pixels: [{ x: 1, y: 2 }],
      }),
    ).toBeUndefined();
  });

  it("parses only canonical pixel keys", () => {
    expect(parseLogoIsoCubePixelKey("3,4")).toEqual({ x: 3, y: 4 });
    expect(parseLogoIsoCubePixelKey("3")).toBeNull();
    expect(parseLogoIsoCubePixelKey("left,4")).toBeNull();
    expect(parseLogoIsoCubePixelKey("3px,4")).toBeNull();
  });
});
