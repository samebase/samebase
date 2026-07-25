import {
  SIERPINSKI_CARPET_HOVER_DEFAULT_REVEAL_RADIUS,
  SIERPINSKI_CARPET_HOVER_DEPTHS,
  SIERPINSKI_CARPET_HOVER_FULL_OPEN_RADIUS_FRACTION,
  SIERPINSKI_CARPET_HOVER_HOLES,
  SIERPINSKI_CARPET_HOVER_MAX_DEPTH,
  SIERPINSKI_CARPET_HOVER_MAX_REVEAL_RADIUS,
  SIERPINSKI_CARPET_HOVER_MIN_REVEAL_RADIUS,
  SIERPINSKI_CARPET_HOVER_PER_DEPTH_RADIUS_RATIO,
  createSierpinskiCarpetHoverHoles,
  normalizeSierpinskiCarpetHoverRevealRadius,
  readSierpinskiCarpetHoleOpenness,
  readSierpinskiCarpetHoleRevealedRect,
  readSierpinskiCarpetHoverDepth,
  type SierpinskiCarpetHoverConfig,
  type SierpinskiCarpetHoverHole,
} from "../src/sierpinskiCarpetHover.ts";
import { describe, expect, it } from "vite-plus/test";

const SHARED_CONFIG: SierpinskiCarpetHoverConfig = {
  falloff: "shared",
  maxDepth: 6,
  revealRadius: SIERPINSKI_CARPET_HOVER_DEFAULT_REVEAL_RADIUS,
};

function makeHole(depth: SierpinskiCarpetHoverHole["depth"]): SierpinskiCarpetHoverHole {
  return {
    centerX: 0.5,
    centerY: 0.5,
    depth,
    size: 3 ** -depth,
  };
}

describe("Sierpinski carpet hover", () => {
  it("enumerates every hole of the depth-six carpet", () => {
    expect(SIERPINSKI_CARPET_HOVER_HOLES).toHaveLength(37_449);

    const countsByDepth = new Map<number, number>();
    let sizeMismatchCount = 0;
    for (const hole of SIERPINSKI_CARPET_HOVER_HOLES) {
      countsByDepth.set(hole.depth, (countsByDepth.get(hole.depth) ?? 0) + 1);
      if (Math.abs(hole.size - 3 ** -hole.depth) > 1e-12) {
        sizeMismatchCount += 1;
      }
    }

    expect(sizeMismatchCount).toBe(0);
    for (const depth of SIERPINSKI_CARPET_HOVER_DEPTHS) {
      expect(countsByDepth.get(depth)).toBe(8 ** (depth - 1));
    }

    const depthOneHole = SIERPINSKI_CARPET_HOVER_HOLES[0];
    expect(depthOneHole?.depth).toBe(1);
    expect(depthOneHole?.centerX).toBeCloseTo(0.5, 12);
    expect(depthOneHole?.centerY).toBeCloseTo(0.5, 12);
  });

  it("keeps every hole disjoint from every other hole", () => {
    // Base-3 digit membership: a point sits inside some hole exactly when the
    // first digit position where both coordinate digits equal 1 exists. Every
    // hole center must hit (1, 1) first at its own depth, which rules out
    // containment in shallower holes; same-depth holes occupy distinct cells,
    // whose centers sit three hole-sides apart, so they cannot overlap either.
    let membershipViolationCount = 0;
    const cellKeys = new Set<string>();
    for (const hole of SIERPINSKI_CARPET_HOVER_HOLES) {
      const cellScale = 3 ** hole.depth;
      cellKeys.add(
        `${hole.depth}:${Math.floor(hole.centerX * cellScale)}:${Math.floor(hole.centerY * cellScale)}`,
      );

      for (const depth of SIERPINSKI_CARPET_HOVER_DEPTHS) {
        if (depth > hole.depth) {
          break;
        }

        const digitScale = 3 ** depth;
        const digitX = Math.floor(hole.centerX * digitScale) % 3;
        const digitY = Math.floor(hole.centerY * digitScale) % 3;
        const inHoleCell = digitX === 1 && digitY === 1;
        if (depth === hole.depth ? !inHoleCell : inHoleCell) {
          membershipViolationCount += 1;
        }
      }
    }

    expect(membershipViolationCount).toBe(0);
    expect(cellKeys.size).toBe(SIERPINSKI_CARPET_HOVER_HOLES.length);
  });

  it("produces a deterministic hole order", () => {
    expect(createSierpinskiCarpetHoverHoles()).toEqual(SIERPINSKI_CARPET_HOVER_HOLES);

    let orderViolationCount = 0;
    for (let index = 1; index < SIERPINSKI_CARPET_HOVER_HOLES.length; index += 1) {
      const previous = SIERPINSKI_CARPET_HOVER_HOLES[index - 1];
      const current = SIERPINSKI_CARPET_HOVER_HOLES[index];
      if (!previous || !current) {
        throw new Error("Every carpet hole index must resolve a hole.");
      }

      const ordered =
        previous.depth - current.depth ||
        previous.centerY - current.centerY ||
        previous.centerX - current.centerX;
      if (ordered >= 0) {
        orderViolationCount += 1;
      }
    }

    expect(orderViolationCount).toBe(0);
  });

  it("normalizes reveal radius and depth inputs to the model bounds", () => {
    expect(normalizeSierpinskiCarpetHoverRevealRadius(0.5)).toBe(0.5);
    expect(normalizeSierpinskiCarpetHoverRevealRadius(0)).toBe(
      SIERPINSKI_CARPET_HOVER_MIN_REVEAL_RADIUS,
    );
    expect(normalizeSierpinskiCarpetHoverRevealRadius(9)).toBe(
      SIERPINSKI_CARPET_HOVER_MAX_REVEAL_RADIUS,
    );
    expect(normalizeSierpinskiCarpetHoverRevealRadius(Number.NaN)).toBe(
      SIERPINSKI_CARPET_HOVER_DEFAULT_REVEAL_RADIUS,
    );

    expect(readSierpinskiCarpetHoverDepth(5.4)).toBe(5);
    expect(readSierpinskiCarpetHoverDepth(9)).toBe(SIERPINSKI_CARPET_HOVER_MAX_DEPTH);
    expect(readSierpinskiCarpetHoverDepth(0)).toBe(1);
  });

  it("keeps the depth-one hole open and hidden depths closed without a pointer", () => {
    expect(readSierpinskiCarpetHoleOpenness(makeHole(1), null, SHARED_CONFIG)).toBe(1);
    expect(readSierpinskiCarpetHoleOpenness(makeHole(2), null, SHARED_CONFIG)).toBe(0);
  });

  it("opens fully under the pointer and closes beyond the reveal radius", () => {
    const hole = makeHole(2);
    const radius = SHARED_CONFIG.revealRadius;

    expect(readSierpinskiCarpetHoleOpenness(hole, { x: 0.5, y: 0.5 }, SHARED_CONFIG)).toBe(1);
    expect(
      readSierpinskiCarpetHoleOpenness(
        hole,
        { x: 0.5 + radius * SIERPINSKI_CARPET_HOVER_FULL_OPEN_RADIUS_FRACTION, y: 0.5 },
        SHARED_CONFIG,
      ),
    ).toBeCloseTo(1, 12);
    expect(readSierpinskiCarpetHoleOpenness(hole, { x: 0.5 + radius, y: 0.5 }, SHARED_CONFIG)).toBe(
      0,
    );
    expect(
      readSierpinskiCarpetHoleOpenness(hole, { x: 0.5 + radius * 2, y: 0.5 }, SHARED_CONFIG),
    ).toBe(0);

    const nearOpenness = readSierpinskiCarpetHoleOpenness(
      hole,
      { x: 0.5 + radius * 0.4, y: 0.5 },
      SHARED_CONFIG,
    );
    const farOpenness = readSierpinskiCarpetHoleOpenness(
      hole,
      { x: 0.5 + radius * 0.8, y: 0.5 },
      SHARED_CONFIG,
    );
    expect(nearOpenness).toBeGreaterThan(farOpenness);
    expect(farOpenness).toBeGreaterThan(0);
  });

  it("caps reveal at the configured depth", () => {
    const cappedConfig: SierpinskiCarpetHoverConfig = { ...SHARED_CONFIG, maxDepth: 2 };
    const pointer = { x: 0.5, y: 0.5 };

    expect(readSierpinskiCarpetHoleOpenness(makeHole(2), pointer, cappedConfig)).toBe(1);
    expect(readSierpinskiCarpetHoleOpenness(makeHole(3), pointer, cappedConfig)).toBe(0);
    expect(readSierpinskiCarpetHoleOpenness(makeHole(6), pointer, cappedConfig)).toBe(0);
  });

  it("requires a closer pointer for deeper holes with per-depth falloff", () => {
    const perDepthConfig: SierpinskiCarpetHoverConfig = { ...SHARED_CONFIG, falloff: "per-depth" };
    const radius = perDepthConfig.revealRadius;
    const pointer = { x: 0.5 + radius * 0.4, y: 0.5 };

    const depthTwoOpenness = readSierpinskiCarpetHoleOpenness(makeHole(2), pointer, perDepthConfig);
    const depthThreeOpenness = readSierpinskiCarpetHoleOpenness(
      makeHole(3),
      pointer,
      perDepthConfig,
    );
    expect(depthTwoOpenness).toBeGreaterThan(depthThreeOpenness);
    expect(depthThreeOpenness).toBeGreaterThan(0);

    // The same distance closes depth four entirely: its radius shrinks by the
    // ratio squared, which falls below the pointer distance of 0.4 * radius.
    expect(SIERPINSKI_CARPET_HOVER_PER_DEPTH_RADIUS_RATIO ** 2).toBeLessThan(0.4);
    expect(readSierpinskiCarpetHoleOpenness(makeHole(4), pointer, perDepthConfig)).toBe(0);

    expect(readSierpinskiCarpetHoleOpenness(makeHole(3), pointer, SHARED_CONFIG)).toBe(
      readSierpinskiCarpetHoleOpenness(makeHole(2), pointer, SHARED_CONFIG),
    );
  });

  it("treats non-finite reveal input as closed", () => {
    const hole = makeHole(2);

    expect(readSierpinskiCarpetHoleOpenness(hole, { x: Number.NaN, y: 0.5 }, SHARED_CONFIG)).toBe(
      0,
    );
    expect(
      readSierpinskiCarpetHoleOpenness(
        hole,
        { x: 0.5, y: 0.5 },
        { ...SHARED_CONFIG, revealRadius: Number.NaN },
      ),
    ).toBe(0);
  });

  it("grows the revealed rectangle from the hole center", () => {
    const hole = makeHole(2);

    expect(readSierpinskiCarpetHoleRevealedRect(hole, 0, "grow", null)).toBeNull();
    expect(readSierpinskiCarpetHoleRevealedRect(hole, Number.NaN, "grow", null)).toBeNull();

    const fullRect = readSierpinskiCarpetHoleRevealedRect(hole, 1, "grow", null);
    expect(fullRect?.width).toBeCloseTo(hole.size, 12);
    expect(fullRect?.height).toBeCloseTo(hole.size, 12);
    expect(fullRect?.x).toBeCloseTo(hole.centerX - hole.size / 2, 12);
    expect(fullRect?.y).toBeCloseTo(hole.centerY - hole.size / 2, 12);

    const halfRect = readSierpinskiCarpetHoleRevealedRect(hole, 0.5, "grow", null);
    expect(halfRect?.width).toBeCloseTo(hole.size / 2, 12);
    expect(halfRect?.height).toBeCloseTo(hole.size / 2, 12);
    expect(halfRect?.x).toBeCloseTo(hole.centerX - hole.size / 4, 12);
    expect(halfRect?.y).toBeCloseTo(hole.centerY - hole.size / 4, 12);
  });

  it("slides the opening in from the hole edge facing the pointer", () => {
    const hole = makeHole(2);
    const left = hole.centerX - hole.size / 2;
    const top = hole.centerY - hole.size / 2;

    const fromAbove = readSierpinskiCarpetHoleRevealedRect(hole, 0.5, "slide", {
      x: 0.5,
      y: 0.2,
    });
    expect(fromAbove?.width).toBeCloseTo(hole.size, 12);
    expect(fromAbove?.height).toBeCloseTo(hole.size / 2, 12);
    expect(fromAbove?.x).toBeCloseTo(left, 12);
    expect(fromAbove?.y).toBeCloseTo(top, 12);

    const fromBelow = readSierpinskiCarpetHoleRevealedRect(hole, 0.5, "slide", {
      x: 0.5,
      y: 0.8,
    });
    expect(fromBelow?.y).toBeCloseTo(top + hole.size / 2, 12);

    const fromLeft = readSierpinskiCarpetHoleRevealedRect(hole, 0.25, "slide", {
      x: 0.1,
      y: 0.5,
    });
    expect(fromLeft?.width).toBeCloseTo(hole.size / 4, 12);
    expect(fromLeft?.height).toBeCloseTo(hole.size, 12);
    expect(fromLeft?.x).toBeCloseTo(left, 12);
    expect(fromLeft?.y).toBeCloseTo(top, 12);

    const fromRight = readSierpinskiCarpetHoleRevealedRect(hole, 0.25, "slide", {
      x: 0.9,
      y: 0.5,
    });
    expect(fromRight?.x).toBeCloseTo(left + hole.size * 0.75, 12);

    // The dominant offset axis wins for diagonal pointers.
    const fromMostlyAbove = readSierpinskiCarpetHoleRevealedRect(hole, 0.5, "slide", {
      x: 0.4,
      y: 0.1,
    });
    expect(fromMostlyAbove?.y).toBeCloseTo(top, 12);
    expect(fromMostlyAbove?.height).toBeCloseTo(hole.size / 2, 12);

    // Without a pointer the wipe stays deterministic and anchored left.
    const fallback = readSierpinskiCarpetHoleRevealedRect(hole, 0.5, "slide", null);
    expect(fallback?.x).toBeCloseTo(left, 12);
    expect(fallback?.width).toBeCloseTo(hole.size / 2, 12);

    const clampedRect = readSierpinskiCarpetHoleRevealedRect(hole, 2, "slide", {
      x: 0.5,
      y: 0.2,
    });
    expect(clampedRect?.height).toBeCloseTo(hole.size, 12);
  });
});
