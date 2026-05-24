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

export type LogoIsoCubePixelSpritePatternParseResult =
  | {
      kind: "valid";
      sprite: LogoIsoCubePixelSprite | undefined;
    }
  | {
      kind: "invalid";
    };

const LOGO_ISO_CUBE_PIXEL_PATTERN_ORIGIN_X = 4;
const LOGO_ISO_CUBE_PIXEL_PATTERN_FRAME_PADDING = 4;

const LOGO_ISO_QUARTER_DIAGONAL_PATTERN = `
.
...
.xxxx
xxx....
x....xxx
...xxxx.
.xxxx...
xxx....x
 ....xxx
   xxxx.
     ...
       .
`;

const LOGO_ISO_QUARTER_DIAGONAL_MIRROR_PATTERN = `
.
...
xxxx.
....xxx
xxx....x
.xxxx...
...xxxx.
x....xxx
 .xxx...
   .xxxx
     ...
       .
`;

export function createLogoIsoCubePixelKey(x: number, y: number): string {
  return `${x},${y}`;
}

type LogoIsoCubePixelSpritePatternRow = {
  startX: number;
  width: number;
  y: number;
};

function getLogoIsoCubePixelSpritePatternRows(
  cubeSidePixels: number,
): readonly LogoIsoCubePixelSpritePatternRow[] {
  // These rows mirror the rasterized secondary face; leading spaces in the
  // textarea are only outside-face stagger, not editable pixels.
  const halfCubeSidePixels = Math.round(cubeSidePixels / 2);
  const topY = LOGO_ISO_CUBE_PIXEL_PATTERN_FRAME_PADDING + halfCubeSidePixels;
  const rowCount = cubeSidePixels + halfCubeSidePixels;
  const rows: LogoIsoCubePixelSpritePatternRow[] = [];

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const leftInset =
      rowIndex < cubeSidePixels
        ? 0
        : Math.min(cubeSidePixels - 1, (rowIndex - cubeSidePixels) * 2 + 1);
    const visibleWidth =
      rowIndex < halfCubeSidePixels
        ? Math.min(cubeSidePixels, rowIndex * 2 + 1)
        : cubeSidePixels - leftInset;

    rows.push({
      startX: LOGO_ISO_CUBE_PIXEL_PATTERN_ORIGIN_X + leftInset,
      width: visibleWidth,
      y: topY + rowIndex,
    });
  }

  return rows;
}

export function parseLogoIsoCubePixelSpritePattern({
  cubeSidePixels,
  pattern,
}: {
  cubeSidePixels: number;
  pattern: string;
}): LogoIsoCubePixelSpritePatternParseResult {
  const trimmedPattern = pattern.trim();
  if (trimmedPattern.length === 0) {
    return {
      kind: "valid",
      sprite: undefined,
    };
  }

  const rows = trimmedPattern.split("\n").map((row) => row.trim());
  const patternRows = getLogoIsoCubePixelSpritePatternRows(cubeSidePixels);
  const pixels: LogoIsoCubePixelCoordinate[] = [];

  if (rows.length !== patternRows.length) {
    return { kind: "invalid" };
  }

  for (const [rowIndex, row] of rows.entries()) {
    const patternRow = patternRows[rowIndex];
    if (row.length !== patternRow.width) {
      return { kind: "invalid" };
    }

    for (const [columnIndex, pixelToken] of Array.from(row).entries()) {
      if (pixelToken === ".") {
        continue;
      }

      if (pixelToken !== "x") {
        return { kind: "invalid" };
      }

      pixels.push({
        x: patternRow.startX + columnIndex,
        y: patternRow.y,
      });
    }
  }

  return {
    kind: "valid",
    sprite:
      pixels.length > 0
        ? {
            pixelKeys: new Set(pixels.map((pixel) => createLogoIsoCubePixelKey(pixel.x, pixel.y))),
          }
        : undefined,
  };
}

export function serializeLogoIsoCubePixelSpritePattern({
  cubeSidePixels,
  sprite,
}: {
  cubeSidePixels: number;
  sprite: LogoIsoCubePixelSprite | undefined;
}): string {
  const patternRows = getLogoIsoCubePixelSpritePatternRows(cubeSidePixels);
  const rows: string[] = [];

  for (const patternRow of patternRows) {
    let row = " ".repeat(patternRow.startX - LOGO_ISO_CUBE_PIXEL_PATTERN_ORIGIN_X);
    for (let columnIndex = 0; columnIndex < patternRow.width; columnIndex += 1) {
      row += sprite?.pixelKeys.has(
        createLogoIsoCubePixelKey(patternRow.startX + columnIndex, patternRow.y),
      )
        ? "x"
        : ".";
    }
    rows.push(row);
  }

  return rows.join("\n");
}

function readLogoIsoCubePixelSpritePattern({
  cubeSidePixels,
  pattern,
}: {
  cubeSidePixels: number;
  pattern: string;
}): LogoIsoCubePixelSprite {
  const result = parseLogoIsoCubePixelSpritePattern({ cubeSidePixels, pattern });
  if (result.kind === "invalid") {
    throw new Error("Invalid logo iso cube pixel sprite pattern");
  }

  return result.sprite ?? { pixelKeys: new Set() };
}

export const LOGO_ISO_CUBE_PIXEL_SPRITE_PRESETS = [
  {
    cubeSidePixels: 8,
    id: "quarter-diagonal",
    label: "Quarter diag",
    sprite: readLogoIsoCubePixelSpritePattern({
      cubeSidePixels: 8,
      pattern: LOGO_ISO_QUARTER_DIAGONAL_PATTERN,
    }),
  },
  {
    cubeSidePixels: 8,
    id: "quarter-diagonal-mirror",
    label: "Mirror diag",
    sprite: readLogoIsoCubePixelSpritePattern({
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
