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

export function createLogoIsoCubePixelKey(x: number, y: number): string {
  return `${x},${y}`;
}

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
