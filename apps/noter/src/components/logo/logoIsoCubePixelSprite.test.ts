import { describe, expect, it } from "vite-plus/test";

import {
  LOGO_ISO_CUBE_PIXEL_SPRITE_PRESETS,
  applyLogoIsoCubePixelSpritePaint,
  createLogoIsoCubePixelKey,
  parseLogoIsoCubePixelSpritePattern,
  parseLogoIsoCubePixelKey,
  serializeLogoIsoCubePixelSpritePattern,
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

  it("keeps the saved quarter diagonal preset exact for 8px cubes", () => {
    const preset = LOGO_ISO_CUBE_PIXEL_SPRITE_PRESETS.find(
      (candidate) => candidate.id === "quarter-diagonal",
    );

    if (!preset) {
      throw new Error("Missing quarter diagonal preset");
    }

    expect(preset.cubeSidePixels).toBe(8);
    expect(preset.sprite.pixelKeys).toEqual(
      new Set([
        createLogoIsoCubePixelKey(5, 10),
        createLogoIsoCubePixelKey(6, 10),
        createLogoIsoCubePixelKey(7, 10),
        createLogoIsoCubePixelKey(8, 10),
        createLogoIsoCubePixelKey(4, 11),
        createLogoIsoCubePixelKey(5, 11),
        createLogoIsoCubePixelKey(6, 11),
        createLogoIsoCubePixelKey(4, 12),
        createLogoIsoCubePixelKey(9, 12),
        createLogoIsoCubePixelKey(10, 12),
        createLogoIsoCubePixelKey(11, 12),
        createLogoIsoCubePixelKey(7, 13),
        createLogoIsoCubePixelKey(8, 13),
        createLogoIsoCubePixelKey(9, 13),
        createLogoIsoCubePixelKey(10, 13),
        createLogoIsoCubePixelKey(5, 14),
        createLogoIsoCubePixelKey(6, 14),
        createLogoIsoCubePixelKey(7, 14),
        createLogoIsoCubePixelKey(8, 14),
        createLogoIsoCubePixelKey(4, 15),
        createLogoIsoCubePixelKey(5, 15),
        createLogoIsoCubePixelKey(6, 15),
        createLogoIsoCubePixelKey(11, 15),
        createLogoIsoCubePixelKey(9, 16),
        createLogoIsoCubePixelKey(10, 16),
        createLogoIsoCubePixelKey(11, 16),
        createLogoIsoCubePixelKey(7, 17),
        createLogoIsoCubePixelKey(8, 17),
        createLogoIsoCubePixelKey(9, 17),
        createLogoIsoCubePixelKey(10, 17),
      ]),
    );
  });

  it("serializes and parses the editable stripe pattern", () => {
    const pattern = [
      ".",
      "...",
      ".xxxx",
      "xxx....",
      "x....xxx",
      "...xxxx.",
      ".xxxx...",
      "xxx....x",
      " ....xxx",
      "   xxxx.",
      "     ...",
      "       .",
    ].join("\n");
    const parsedPattern = parseLogoIsoCubePixelSpritePattern({
      cubeSidePixels: 8,
      pattern,
    });

    if (parsedPattern.kind === "invalid") {
      throw new Error("Expected editable stripe pattern to parse");
    }

    expect(parsedPattern.sprite).toBeDefined();
    expect(
      serializeLogoIsoCubePixelSpritePattern({
        cubeSidePixels: 8,
        sprite: parsedPattern.sprite,
      }),
    ).toBe(pattern);
  });

  it("parses the visible pixels even when the stagger spaces are missing", () => {
    const pattern = [
      ".",
      "...",
      ".xxxx",
      "xxx....",
      "x....xxx",
      "...xxxx.",
      ".xxxx...",
      "xxx....x",
      "....xxx",
      "xxxx.",
      "...",
      ".",
    ].join("\n");
    const parsedPattern = parseLogoIsoCubePixelSpritePattern({
      cubeSidePixels: 8,
      pattern,
    });

    if (parsedPattern.kind === "invalid") {
      throw new Error("Expected compact editable stripe pattern to parse");
    }

    expect(
      serializeLogoIsoCubePixelSpritePattern({
        cubeSidePixels: 8,
        sprite: parsedPattern.sprite,
      }),
    ).toBe(
      [
        ".",
        "...",
        ".xxxx",
        "xxx....",
        "x....xxx",
        "...xxxx.",
        ".xxxx...",
        "xxx....x",
        " ....xxx",
        "   xxxx.",
        "     ...",
        "       .",
      ].join("\n"),
    );
  });

  it("rejects pattern text that does not match the cube side", () => {
    expect(
      parseLogoIsoCubePixelSpritePattern({
        cubeSidePixels: 8,
        pattern: "x",
      }),
    ).toEqual({ kind: "invalid" });
  });
});
