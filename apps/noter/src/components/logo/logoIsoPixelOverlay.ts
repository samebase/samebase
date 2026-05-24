export type LogoIsoPixelOverlayEditKind = "draw" | "erase";

export type LogoIsoPixelCoordinate = {
  x: number;
  y: number;
};

export type LogoIsoPixelOverlay = {
  pixelKeys: ReadonlySet<string>;
};

export type LogoIsoPixelOverlayPaint = {
  canvasHeight: number;
  canvasWidth: number;
  cubeSidePixels: number;
  kind: LogoIsoPixelOverlayEditKind;
  pixels: readonly LogoIsoPixelCoordinate[];
};

export function createLogoIsoPixelKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function parseLogoIsoPixelKey(pixelKey: string): LogoIsoPixelCoordinate | null {
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

function normalizeLogoIsoPixelCoordinate(
  pixel: LogoIsoPixelCoordinate,
): LogoIsoPixelCoordinate | null {
  if (!Number.isFinite(pixel.x) || !Number.isFinite(pixel.y)) {
    return null;
  }

  return {
    x: Math.floor(pixel.x),
    y: Math.floor(pixel.y),
  };
}

function isLogoIsoPixelInBounds({
  canvasHeight,
  canvasWidth,
  pixel,
}: {
  canvasHeight: number;
  canvasWidth: number;
  pixel: LogoIsoPixelCoordinate;
}): boolean {
  return pixel.x >= 0 && pixel.x < canvasWidth && pixel.y >= 0 && pixel.y < canvasHeight;
}

export function applyLogoIsoPixelOverlayPaint(
  overlay: LogoIsoPixelOverlay | undefined,
  paint: LogoIsoPixelOverlayPaint,
): LogoIsoPixelOverlay | undefined {
  const nextPixelKeys = new Set(overlay?.pixelKeys);
  let changed = false;

  for (const rawPixel of paint.pixels) {
    const pixel = normalizeLogoIsoPixelCoordinate(rawPixel);
    if (
      !pixel ||
      !isLogoIsoPixelInBounds({
        canvasHeight: paint.canvasHeight,
        canvasWidth: paint.canvasWidth,
        pixel,
      })
    ) {
      continue;
    }

    const pixelKey = createLogoIsoPixelKey(pixel.x, pixel.y);
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
    return overlay;
  }

  if (nextPixelKeys.size === 0) {
    return undefined;
  }

  return {
    pixelKeys: nextPixelKeys,
  };
}
