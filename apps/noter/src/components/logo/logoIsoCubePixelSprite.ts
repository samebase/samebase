export type LogoIsoCubePixelEditKind = "draw" | "erase";

export type LogoIsoCubePixelCoordinate = {
  x: number;
  y: number;
};

export type LogoIsoCubePixelSprite = {
  pixelKeys: ReadonlySet<string>;
};

export type LogoIsoCubePixelSpritePaint = {
  canvasHeight: number;
  canvasWidth: number;
  cubeSidePixels: number;
  kind: LogoIsoCubePixelEditKind;
  pixels: readonly LogoIsoCubePixelCoordinate[];
};

export type LogoIsoCubePixelSpritePresetId = "quarter-diagonal" | "quarter-diagonal-mirror";

export type LogoIsoCubePixelSpritePreset = {
  cubeSidePixels: number;
  id: LogoIsoCubePixelSpritePresetId;
  label: string;
  sprite: LogoIsoCubePixelSprite;
};

const LOGO_ISO_QUARTER_DIAGONAL_PIXELS = [
  { x: 5, y: 10 },
  { x: 6, y: 10 },
  { x: 7, y: 10 },
  { x: 8, y: 10 },
  { x: 4, y: 11 },
  { x: 5, y: 11 },
  { x: 6, y: 11 },
  { x: 4, y: 12 },
  { x: 9, y: 12 },
  { x: 10, y: 12 },
  { x: 11, y: 12 },
  { x: 7, y: 13 },
  { x: 8, y: 13 },
  { x: 9, y: 13 },
  { x: 10, y: 13 },
  { x: 5, y: 14 },
  { x: 6, y: 14 },
  { x: 7, y: 14 },
  { x: 8, y: 14 },
  { x: 4, y: 15 },
  { x: 5, y: 15 },
  { x: 6, y: 15 },
  { x: 11, y: 15 },
  { x: 9, y: 16 },
  { x: 10, y: 16 },
  { x: 11, y: 16 },
  { x: 7, y: 17 },
  { x: 8, y: 17 },
  { x: 9, y: 17 },
  { x: 10, y: 17 },
] as const satisfies readonly LogoIsoCubePixelCoordinate[];

const LOGO_ISO_QUARTER_DIAGONAL_MIRROR_PIXELS = [
  { x: 4, y: 10 },
  { x: 5, y: 10 },
  { x: 6, y: 10 },
  { x: 7, y: 10 },
  { x: 8, y: 11 },
  { x: 9, y: 11 },
  { x: 10, y: 11 },
  { x: 4, y: 12 },
  { x: 5, y: 12 },
  { x: 6, y: 12 },
  { x: 11, y: 12 },
  { x: 5, y: 13 },
  { x: 6, y: 13 },
  { x: 7, y: 13 },
  { x: 8, y: 13 },
  { x: 7, y: 14 },
  { x: 8, y: 14 },
  { x: 9, y: 14 },
  { x: 10, y: 14 },
  { x: 4, y: 15 },
  { x: 9, y: 15 },
  { x: 10, y: 15 },
  { x: 11, y: 15 },
  { x: 5, y: 16 },
  { x: 6, y: 16 },
  { x: 7, y: 16 },
  { x: 8, y: 17 },
  { x: 9, y: 17 },
  { x: 10, y: 17 },
  { x: 11, y: 17 },
] as const satisfies readonly LogoIsoCubePixelCoordinate[];

export function createLogoIsoCubePixelKey(x: number, y: number): string {
  return `${x},${y}`;
}

function createLogoIsoCubePixelSprite(
  pixels: readonly LogoIsoCubePixelCoordinate[],
): LogoIsoCubePixelSprite {
  return {
    pixelKeys: new Set(pixels.map((pixel) => createLogoIsoCubePixelKey(pixel.x, pixel.y))),
  };
}

export const LOGO_ISO_CUBE_PIXEL_SPRITE_PRESETS = [
  {
    cubeSidePixels: 8,
    id: "quarter-diagonal",
    label: "Quarter diag",
    sprite: createLogoIsoCubePixelSprite(LOGO_ISO_QUARTER_DIAGONAL_PIXELS),
  },
  {
    cubeSidePixels: 8,
    id: "quarter-diagonal-mirror",
    label: "Mirror diag",
    sprite: createLogoIsoCubePixelSprite(LOGO_ISO_QUARTER_DIAGONAL_MIRROR_PIXELS),
  },
] as const satisfies readonly LogoIsoCubePixelSpritePreset[];

export function parseLogoIsoCubePixelKey(pixelKey: string): LogoIsoCubePixelCoordinate | null {
  const separatorIndex = pixelKey.indexOf(",");
  if (separatorIndex <= 0 || separatorIndex === pixelKey.length - 1) {
    return null;
  }

  const x = Number(pixelKey.slice(0, separatorIndex));
  const y = Number(pixelKey.slice(separatorIndex + 1));

  if (!Number.isInteger(x) || !Number.isInteger(y)) {
    return null;
  }

  return { x, y };
}

function normalizeLogoIsoCubePixelCoordinate(
  pixel: LogoIsoCubePixelCoordinate,
): LogoIsoCubePixelCoordinate | null {
  if (!Number.isFinite(pixel.x) || !Number.isFinite(pixel.y)) {
    return null;
  }

  return {
    x: Math.floor(pixel.x),
    y: Math.floor(pixel.y),
  };
}

function isLogoIsoCubePixelInBounds({
  canvasHeight,
  canvasWidth,
  pixel,
}: {
  canvasHeight: number;
  canvasWidth: number;
  pixel: LogoIsoCubePixelCoordinate;
}): boolean {
  return pixel.x >= 0 && pixel.x < canvasWidth && pixel.y >= 0 && pixel.y < canvasHeight;
}

export function applyLogoIsoCubePixelSpritePaint(
  sprite: LogoIsoCubePixelSprite | undefined,
  paint: LogoIsoCubePixelSpritePaint,
): LogoIsoCubePixelSprite | undefined {
  const nextPixelKeys = new Set(sprite?.pixelKeys);
  let changed = false;

  for (const rawPixel of paint.pixels) {
    const pixel = normalizeLogoIsoCubePixelCoordinate(rawPixel);
    if (
      !pixel ||
      !isLogoIsoCubePixelInBounds({
        canvasHeight: paint.canvasHeight,
        canvasWidth: paint.canvasWidth,
        pixel,
      })
    ) {
      continue;
    }

    const pixelKey = createLogoIsoCubePixelKey(pixel.x, pixel.y);
    if (paint.kind === "draw") {
      if (!nextPixelKeys.has(pixelKey)) {
        nextPixelKeys.add(pixelKey);
        changed = true;
      }
      continue;
    }

    if (nextPixelKeys.delete(pixelKey)) {
      changed = true;
    }
  }

  if (!changed) {
    return sprite;
  }

  if (nextPixelKeys.size === 0) {
    return undefined;
  }

  return {
    pixelKeys: nextPixelKeys,
  };
}
