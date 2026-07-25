export const SIERPINSKI_CARPET_HOVER_DEPTHS = [1, 2, 3, 4] as const;
export const SIERPINSKI_CARPET_HOVER_DEFAULT_REVEAL_RADIUS = 0.35;
export const SIERPINSKI_CARPET_HOVER_PER_DEPTH_RADIUS_RATIO = 0.55;
export const SIERPINSKI_CARPET_HOVER_FULL_OPEN_RADIUS_FRACTION = 0.25;

export type SierpinskiCarpetHoverDepth = (typeof SIERPINSKI_CARPET_HOVER_DEPTHS)[number];

export type SierpinskiCarpetHoverMechanic = "grow" | "slide";

export type SierpinskiCarpetHoverFalloff = "per-depth" | "shared";

export type SierpinskiCarpetHoverPointer = {
  x: number;
  y: number;
};

export type SierpinskiCarpetHoverSlide = {
  axis: "x" | "y";
  sign: -1 | 1;
};

/**
Unit carpet coordinates: the full carpet spans [0, 1] on both axes with the
origin at the top-left corner. A depth-d hole is the open center ninth of a
solid depth-(d-1) cell, so its side is 3 ** -d and holes never overlap.
*/
export type SierpinskiCarpetHoverHole = {
  centerX: number;
  centerY: number;
  depth: SierpinskiCarpetHoverDepth;
  size: number;
  slide: SierpinskiCarpetHoverSlide;
};

export type SierpinskiCarpetHoverConfig = {
  falloff: SierpinskiCarpetHoverFalloff;
  maxDepth: SierpinskiCarpetHoverDepth;
  revealRadius: number;
};

export type SierpinskiCarpetHoverRect = {
  height: number;
  width: number;
  x: number;
  y: number;
};

const SLIDE_DIRECTIONS: readonly SierpinskiCarpetHoverSlide[] = [
  { axis: "x", sign: -1 },
  { axis: "x", sign: 1 },
  { axis: "y", sign: -1 },
  { axis: "y", sign: 1 },
];

function readSlideDirection(
  centerX: number,
  centerY: number,
  depth: SierpinskiCarpetHoverDepth,
): SierpinskiCarpetHoverSlide {
  const value = Math.sin(centerX * 12.9898 + centerY * 78.233 + depth * 37.719) * 43_758.5453;
  const noise = value - Math.floor(value);
  const direction = SLIDE_DIRECTIONS[Math.floor(noise * SLIDE_DIRECTIONS.length)];
  if (!direction) {
    throw new Error("Every carpet hole must resolve a slide direction.");
  }

  return direction;
}

function collectHoles(
  depthIndex: number,
  originX: number,
  originY: number,
  size: number,
  holes: SierpinskiCarpetHoverHole[],
): void {
  const depth = SIERPINSKI_CARPET_HOVER_DEPTHS[depthIndex];
  if (depth === undefined) {
    return;
  }

  const childSize = size / 3;
  const centerX = originX + size / 2;
  const centerY = originY + size / 2;
  holes.push({
    centerX,
    centerY,
    depth,
    size: childSize,
    slide: readSlideDirection(centerX, centerY, depth),
  });

  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      if (row === 1 && column === 1) {
        continue;
      }

      collectHoles(
        depthIndex + 1,
        originX + column * childSize,
        originY + row * childSize,
        childSize,
        holes,
      );
    }
  }
}

export function createSierpinskiCarpetHoverHoles(): SierpinskiCarpetHoverHole[] {
  const holes: SierpinskiCarpetHoverHole[] = [];
  collectHoles(0, 0, 0, 1, holes);
  holes.sort(
    (left, right) =>
      left.depth - right.depth || left.centerY - right.centerY || left.centerX - right.centerX,
  );

  return holes;
}

export const SIERPINSKI_CARPET_HOVER_HOLES = createSierpinskiCarpetHoverHoles();

function readDepthRevealRadius(
  depth: SierpinskiCarpetHoverDepth,
  config: SierpinskiCarpetHoverConfig,
): number {
  const baseRadius =
    Number.isFinite(config.revealRadius) && config.revealRadius > 0 ? config.revealRadius : 0;
  switch (config.falloff) {
    case "shared":
      return baseRadius;
    case "per-depth":
      return baseRadius * SIERPINSKI_CARPET_HOVER_PER_DEPTH_RADIUS_RATIO ** (depth - 2);
    default:
      return config.falloff satisfies never;
  }
}

/**
Openness is a pure function of the current pointer position: 1 is the hole at
its natural size, 0 is fully covered. The depth-one hole is the resting logo
state and stays open without a pointer; every deeper hole closes when the
pointer leaves or sits beyond that depth's reveal radius, and is fully open
within SIERPINSKI_CARPET_HOVER_FULL_OPEN_RADIUS_FRACTION of the radius.
*/
export function readSierpinskiCarpetHoleOpenness(
  hole: SierpinskiCarpetHoverHole,
  pointer: SierpinskiCarpetHoverPointer | null,
  config: SierpinskiCarpetHoverConfig,
): number {
  if (hole.depth === 1) {
    return 1;
  }
  if (pointer === null || hole.depth > config.maxDepth) {
    return 0;
  }

  const radius = readDepthRevealRadius(hole.depth, config);
  if (radius <= 0) {
    return 0;
  }

  const distance = Math.hypot(pointer.x - hole.centerX, pointer.y - hole.centerY);
  const closeness = 1 - distance / radius;
  // The negated comparison also routes non-finite pointer math to "closed".
  if (!(closeness > 0)) {
    return 0;
  }

  const normalized = Math.min(
    closeness / (1 - SIERPINSKI_CARPET_HOVER_FULL_OPEN_RADIUS_FRACTION),
    1,
  );

  return normalized * normalized * (3 - 2 * normalized);
}

/**
The visible open area of a hole at the given openness, in unit carpet
coordinates. Grow keeps the opening centered; slide anchors it to the edge the
cover retreats from, so the hole wipes open toward hole.slide. Returns null
while the hole is fully covered.
*/
export function readSierpinskiCarpetHoleRevealedRect(
  hole: SierpinskiCarpetHoverHole,
  openness: number,
  mechanic: SierpinskiCarpetHoverMechanic,
): SierpinskiCarpetHoverRect | null {
  const clampedOpenness = Number.isFinite(openness) ? Math.min(Math.max(openness, 0), 1) : 0;
  if (clampedOpenness === 0) {
    return null;
  }

  switch (mechanic) {
    case "grow": {
      const side = hole.size * clampedOpenness;

      return {
        height: side,
        width: side,
        x: hole.centerX - side / 2,
        y: hole.centerY - side / 2,
      };
    }
    case "slide": {
      const span = hole.size * clampedOpenness;
      const left = hole.centerX - hole.size / 2;
      const top = hole.centerY - hole.size / 2;
      if (hole.slide.axis === "x") {
        return {
          height: hole.size,
          width: span,
          x: hole.slide.sign === 1 ? left : left + hole.size - span,
          y: top,
        };
      }

      return {
        height: span,
        width: hole.size,
        x: left,
        y: hole.slide.sign === 1 ? top : top + hole.size - span,
      };
    }
    default:
      return mechanic satisfies never;
  }
}
