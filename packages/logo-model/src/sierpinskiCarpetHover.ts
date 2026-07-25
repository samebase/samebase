export const SIERPINSKI_CARPET_HOVER_DEPTHS = [1, 2, 3, 4, 5, 6] as const;
export const SIERPINSKI_CARPET_HOVER_MECHANICS = ["grow", "slide"] as const;
export const SIERPINSKI_CARPET_HOVER_FALLOFFS = ["per-depth", "shared"] as const;

export type SierpinskiCarpetHoverDepth = (typeof SIERPINSKI_CARPET_HOVER_DEPTHS)[number];

export type SierpinskiCarpetHoverMechanic = (typeof SIERPINSKI_CARPET_HOVER_MECHANICS)[number];

export type SierpinskiCarpetHoverFalloff = (typeof SIERPINSKI_CARPET_HOVER_FALLOFFS)[number];

export const SIERPINSKI_CARPET_HOVER_MAX_DEPTH: SierpinskiCarpetHoverDepth = 6;
export const SIERPINSKI_CARPET_HOVER_DEFAULT_DEPTH: SierpinskiCarpetHoverDepth = 5;
export const SIERPINSKI_CARPET_HOVER_DEFAULT_MECHANIC: SierpinskiCarpetHoverMechanic = "grow";
export const SIERPINSKI_CARPET_HOVER_DEFAULT_FALLOFF: SierpinskiCarpetHoverFalloff = "shared";
export const SIERPINSKI_CARPET_HOVER_MIN_REVEAL_RADIUS = 0.05;
export const SIERPINSKI_CARPET_HOVER_MAX_REVEAL_RADIUS = 1;
export const SIERPINSKI_CARPET_HOVER_DEFAULT_REVEAL_RADIUS = 0.55;
export const SIERPINSKI_CARPET_HOVER_PER_DEPTH_RADIUS_RATIO = 0.55;
export const SIERPINSKI_CARPET_HOVER_FULL_OPEN_RADIUS_FRACTION = 0.25;

export function normalizeSierpinskiCarpetHoverRevealRadius(value: number): number {
  if (!Number.isFinite(value)) {
    return SIERPINSKI_CARPET_HOVER_DEFAULT_REVEAL_RADIUS;
  }

  return Math.min(
    Math.max(value, SIERPINSKI_CARPET_HOVER_MIN_REVEAL_RADIUS),
    SIERPINSKI_CARPET_HOVER_MAX_REVEAL_RADIUS,
  );
}

export function readSierpinskiCarpetHoverDepth(value: number): SierpinskiCarpetHoverDepth {
  const rounded = Math.round(value);
  const matchedDepth = SIERPINSKI_CARPET_HOVER_DEPTHS.find((depth) => depth === rounded);
  if (matchedDepth !== undefined) {
    return matchedDepth;
  }

  return rounded > SIERPINSKI_CARPET_HOVER_MAX_DEPTH
    ? SIERPINSKI_CARPET_HOVER_MAX_DEPTH
    : SIERPINSKI_CARPET_HOVER_DEPTHS[0];
}

export type SierpinskiCarpetHoverPointer = {
  x: number;
  y: number;
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
  holes.push({
    centerX: originX + size / 2,
    centerY: originY + size / 2,
    depth,
    size: childSize,
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

type SierpinskiCarpetSlide = {
  signX: -1 | 1;
  signY: -1 | 1;
  weightX: number;
};

/**
The wipe splits across both axes by the pointer-to-center offset ratio, so
the opening is anchored at the pointer-facing corner and morphs continuously
as the mouse orbits a hole; a pure single-axis wipe only occurs when the
pointer sits straight beside one edge, where the sign flip of the other axis
lands while that dimension is at full size and stays invisible. Without a
pointer the wipe falls back to a left-edge strip.
*/
function readSlideAwayFromPointer(
  hole: SierpinskiCarpetHoverHole,
  pointer: SierpinskiCarpetHoverPointer | null,
): SierpinskiCarpetSlide {
  if (pointer === null) {
    return { signX: 1, signY: 1, weightX: 1 };
  }

  const deltaX = hole.centerX - pointer.x;
  const deltaY = hole.centerY - pointer.y;
  const totalDelta = Math.abs(deltaX) + Math.abs(deltaY);

  return {
    signX: deltaX >= 0 ? 1 : -1,
    signY: deltaY >= 0 ? 1 : -1,
    weightX: totalDelta > 0 ? Math.abs(deltaX) / totalDelta : 0.5,
  };
}

/**
The visible open area of a hole at the given openness, in unit carpet
coordinates. Grow keeps the opening centered; slide anchors it to the hole
corner facing the pointer and allocates openness across the two dimensions as
openness ** weight per axis, which keeps the revealed area equal to the
openness for every direction. Returns null while the hole is fully covered.
*/
export function readSierpinskiCarpetHoleRevealedRect(
  hole: SierpinskiCarpetHoverHole,
  openness: number,
  mechanic: SierpinskiCarpetHoverMechanic,
  pointer: SierpinskiCarpetHoverPointer | null,
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
      const slide = readSlideAwayFromPointer(hole, pointer);
      const width = hole.size * clampedOpenness ** slide.weightX;
      const height = hole.size * clampedOpenness ** (1 - slide.weightX);
      const left = hole.centerX - hole.size / 2;
      const top = hole.centerY - hole.size / 2;

      return {
        height,
        width,
        x: slide.signX === 1 ? left : left + hole.size - width,
        y: slide.signY === 1 ? top : top + hole.size - height,
      };
    }
    default:
      return mechanic satisfies never;
  }
}
