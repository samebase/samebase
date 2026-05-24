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

const LOGO_ISO_CUBE_PIXEL_PATTERN_ORIGIN = {
  x: 4,
  y: 10,
};

const LOGO_ISO_QUARTER_DIAGONAL_PATTERN = `
.xxxx...
xxx.....
x....xxx
...xxxx.
.xxxx...
xxx....x
.....xxx
...xxxx.
`;

const LOGO_ISO_QUARTER_DIAGONAL_MIRROR_PATTERN = `
xxxx....
....xxx.
xxx....x
.xxxx...
...xxxx.
x....xxx
.xxx....
....xxxx
`;

export function createLogoIsoCubePixelKey(x: number, y: number): string {
  return `${x},${y}`;
}

function createLogoIsoCubePixelSpriteFromPattern({
  cubeSidePixels,
  pattern,
}: {
  cubeSidePixels: number;
  pattern: string;
}): LogoIsoCubePixelSprite {
  const rows = pattern.trim().split("\n");
  const pixels: LogoIsoCubePixelCoordinate[] = [];

  if (rows.length !== cubeSidePixels) {
    throw new Error(`Expected ${cubeSidePixels} sprite rows, received ${rows.length}`);
  }

  for (const [rowIndex, row] of rows.entries()) {
    if (row.length !== cubeSidePixels) {
      throw new Error(
        `Expected row ${rowIndex} to have ${cubeSidePixels} pixels, received ${row.length}`,
      );
    }

    for (const [columnIndex, pixelToken] of Array.from(row).entries()) {
      if (pixelToken === ".") {
        continue;
      }

      if (pixelToken !== "x") {
        throw new Error(`Unsupported sprite token "${pixelToken}" at ${columnIndex},${rowIndex}`);
      }

      pixels.push({
        x: LOGO_ISO_CUBE_PIXEL_PATTERN_ORIGIN.x + columnIndex,
        y: LOGO_ISO_CUBE_PIXEL_PATTERN_ORIGIN.y + rowIndex,
      });
    }
  }

  return {
    pixelKeys: new Set(pixels.map((pixel) => createLogoIsoCubePixelKey(pixel.x, pixel.y))),
  };
}

export const LOGO_ISO_CUBE_PIXEL_SPRITE_PRESETS = [
  {
    cubeSidePixels: 8,
    id: "quarter-diagonal",
    label: "Quarter diag",
    sprite: createLogoIsoCubePixelSpriteFromPattern({
      cubeSidePixels: 8,
      pattern: LOGO_ISO_QUARTER_DIAGONAL_PATTERN,
    }),
  },
  {
    cubeSidePixels: 8,
    id: "quarter-diagonal-mirror",
    label: "Mirror diag",
    sprite: createLogoIsoCubePixelSpriteFromPattern({
      cubeSidePixels: 8,
      pattern: LOGO_ISO_QUARTER_DIAGONAL_MIRROR_PATTERN,
    }),
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
