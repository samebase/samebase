import {
  SIERPINSKI_CARPET_HOVER_DEFAULT_REVEAL_RADIUS,
  SIERPINSKI_CARPET_HOVER_DEPTHS,
  SIERPINSKI_CARPET_HOVER_FULL_OPEN_RADIUS_FRACTION,
  SIERPINSKI_CARPET_HOVER_HOLES,
  SIERPINSKI_CARPET_HOVER_MAX_DEPTH,
  SIERPINSKI_CARPET_HOVER_MAX_REVEAL_RADIUS,
  SIERPINSKI_CARPET_HOVER_MIN_REVEAL_RADIUS,
  createSierpinskiCarpetHoverHoles,
  normalizeSierpinskiCarpetHoverRevealRadius,
  readSierpinskiCarpetHoleOpenness,
  readSierpinskiCarpetHoleRevealedRect,
  readSierpinskiCarpetHoverDepth,
  type SierpinskiCarpetHoverConfig,
  type SierpinskiCarpetHoverHole,
} from "../src/sierpinskiCarpetHover.ts";
import { describe, expect, it } from "vite-plus/test";

const CONFIG: SierpinskiCarpetHoverConfig = {
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
    expect(readSierpinskiCarpetHoleOpenness(makeHole(1), null, CONFIG)).toBe(1);
    expect(readSierpinskiCarpetHoleOpenness(makeHole(2), null, CONFIG)).toBe(0);
  });

  it("opens fully under the pointer and closes beyond the reveal radius", () => {
    const hole = makeHole(2);
    const radius = CONFIG.revealRadius;

    expect(readSierpinskiCarpetHoleOpenness(hole, { x: 0.5, y: 0.5 }, CONFIG)).toBe(1);
    expect(
      readSierpinskiCarpetHoleOpenness(
        hole,
        { x: 0.5 + radius * SIERPINSKI_CARPET_HOVER_FULL_OPEN_RADIUS_FRACTION, y: 0.5 },
        CONFIG,
      ),
    ).toBeCloseTo(1, 12);
    expect(readSierpinskiCarpetHoleOpenness(hole, { x: 0.5 + radius, y: 0.5 }, CONFIG)).toBe(0);
    expect(readSierpinskiCarpetHoleOpenness(hole, { x: 0.5 + radius * 2, y: 0.5 }, CONFIG)).toBe(0);

    const nearOpenness = readSierpinskiCarpetHoleOpenness(
      hole,
      { x: 0.5 + radius * 0.4, y: 0.5 },
      CONFIG,
    );
    const farOpenness = readSierpinskiCarpetHoleOpenness(
      hole,
      { x: 0.5 + radius * 0.8, y: 0.5 },
      CONFIG,
    );
    expect(nearOpenness).toBeGreaterThan(farOpenness);
    expect(farOpenness).toBeGreaterThan(0);
  });

  it("caps reveal at the configured depth", () => {
    const cappedConfig: SierpinskiCarpetHoverConfig = { ...CONFIG, maxDepth: 2 };
    const pointer = { x: 0.5, y: 0.5 };

    expect(readSierpinskiCarpetHoleOpenness(makeHole(2), pointer, cappedConfig)).toBe(1);
    expect(readSierpinskiCarpetHoleOpenness(makeHole(3), pointer, cappedConfig)).toBe(0);
    expect(readSierpinskiCarpetHoleOpenness(makeHole(6), pointer, cappedConfig)).toBe(0);
  });

  it("uses the same reveal radius for every depth", () => {
    const radius = CONFIG.revealRadius;
    const pointer = { x: 0.5 + radius * 0.4, y: 0.5 };

    const depthTwoOpenness = readSierpinskiCarpetHoleOpenness(makeHole(2), pointer, CONFIG);
    const depthThreeOpenness = readSierpinskiCarpetHoleOpenness(makeHole(3), pointer, CONFIG);
    const depthFourOpenness = readSierpinskiCarpetHoleOpenness(makeHole(4), pointer, CONFIG);

    expect(depthTwoOpenness).toBeGreaterThan(0);
    expect(depthThreeOpenness).toBe(depthTwoOpenness);
    expect(depthFourOpenness).toBe(depthTwoOpenness);
  });

  it("treats non-finite reveal input as closed", () => {
    const hole = makeHole(2);

    expect(readSierpinskiCarpetHoleOpenness(hole, { x: Number.NaN, y: 0.5 }, CONFIG)).toBe(0);
    expect(
      readSierpinskiCarpetHoleOpenness(
        hole,
        { x: 0.5, y: 0.5 },
        { ...CONFIG, revealRadius: Number.NaN },
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

    // Diagonal pointers split the wipe across both axes by the offset ratio,
    // anchored at the pointer-facing corner, with area equal to the openness.
    const fromMostlyAbove = readSierpinskiCarpetHoleRevealedRect(hole, 0.5, "slide", {
      x: 0.4,
      y: 0.1,
    });
    expect(fromMostlyAbove?.x).toBeCloseTo(left, 12);
    expect(fromMostlyAbove?.y).toBeCloseTo(top, 12);
    expect(fromMostlyAbove?.width).toBeCloseTo(hole.size * 0.5 ** 0.2, 12);
    expect(fromMostlyAbove?.height).toBeCloseTo(hole.size * 0.5 ** 0.8, 12);
    expect((fromMostlyAbove?.width ?? 0) * (fromMostlyAbove?.height ?? 0)).toBeCloseTo(
      hole.size * hole.size * 0.5,
      12,
    );

    // Crossing the vertical through the hole center keeps the rect continuous
    // because the horizontal anchor shift saturates only beyond the hole's
    // own bounds, so the wipe does not jump as the pointer orbits.
    const justLeftOfVertical = readSierpinskiCarpetHoleRevealedRect(hole, 0.5, "slide", {
      x: 0.5 - 1e-6,
      y: 0.2,
    });
    const justRightOfVertical = readSierpinskiCarpetHoleRevealedRect(hole, 0.5, "slide", {
      x: 0.5 + 1e-6,
      y: 0.2,
    });
    expect(justLeftOfVertical?.x).toBeCloseTo(justRightOfVertical?.x ?? Number.NaN, 5);
    expect(justLeftOfVertical?.width).toBeCloseTo(justRightOfVertical?.width ?? Number.NaN, 5);
    expect(justLeftOfVertical?.height).toBeCloseTo(justRightOfVertical?.height ?? Number.NaN, 5);

    // A diagonal crossing straight through the hole center is continuous too:
    // at the exact center the opening is centered, and points just either
    // side produce nearly identical rects even at partial openness.
    const atCenter = readSierpinskiCarpetHoleRevealedRect(hole, 0.25, "slide", {
      x: 0.5,
      y: 0.5,
    });
    expect(atCenter?.x).toBeCloseTo(hole.centerX - (atCenter?.width ?? 0) / 2, 12);
    expect(atCenter?.y).toBeCloseTo(hole.centerY - (atCenter?.height ?? 0) / 2, 12);

    const justBeforeCenter = readSierpinskiCarpetHoleRevealedRect(hole, 0.25, "slide", {
      x: 0.5 - 1e-6,
      y: 0.5 - 1e-6,
    });
    const justAfterCenter = readSierpinskiCarpetHoleRevealedRect(hole, 0.25, "slide", {
      x: 0.5 + 1e-6,
      y: 0.5 + 1e-6,
    });
    expect(justBeforeCenter?.x).toBeCloseTo(justAfterCenter?.x ?? Number.NaN, 4);
    expect(justBeforeCenter?.y).toBeCloseTo(justAfterCenter?.y ?? Number.NaN, 4);
    expect(justBeforeCenter?.width).toBeCloseTo(justAfterCenter?.width ?? Number.NaN, 4);
    expect(justBeforeCenter?.height).toBeCloseTo(justAfterCenter?.height ?? Number.NaN, 4);

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

  it("keeps cardinal center crossings continuous", () => {
    const hole = makeHole(2);

    // Crossing horizontally straight through the hole center: near the
    // center the axis split relaxes to an even blend, so the rect approaches
    // the centered square instead of flipping between wide and tall strips.
    const atCenter = readSierpinskiCarpetHoleRevealedRect(hole, 0.25, "slide", { x: 0.5, y: 0.5 });
    const justBeforeCenter = readSierpinskiCarpetHoleRevealedRect(hole, 0.25, "slide", {
      x: 0.5 - 1e-6,
      y: 0.5,
    });
    const justAfterCenter = readSierpinskiCarpetHoleRevealedRect(hole, 0.25, "slide", {
      x: 0.5 + 1e-6,
      y: 0.5,
    });
    expect(justBeforeCenter?.width).toBeCloseTo(atCenter?.width ?? Number.NaN, 4);
    expect(justBeforeCenter?.height).toBeCloseTo(atCenter?.height ?? Number.NaN, 4);
    expect(justBeforeCenter?.x).toBeCloseTo(justAfterCenter?.x ?? Number.NaN, 4);
    expect(justBeforeCenter?.y).toBeCloseTo(justAfterCenter?.y ?? Number.NaN, 4);
    expect(justBeforeCenter?.width).toBeCloseTo(justAfterCenter?.width ?? Number.NaN, 4);
    expect(justBeforeCenter?.height).toBeCloseTo(justAfterCenter?.height ?? Number.NaN, 4);

    // Halfway into the blend zone the split leans toward the approach axis
    // while the revealed area still equals the openness.
    const midBlend = readSierpinskiCarpetHoleRevealedRect(hole, 0.25, "slide", {
      x: 0.5 - hole.size / 4,
      y: 0.5,
    });
    expect(midBlend?.width).toBeCloseTo(hole.size * 0.25 ** 0.75, 12);
    expect(midBlend?.height).toBeCloseTo(hole.size * 0.25 ** 0.25, 12);
    expect((midBlend?.width ?? 0) * (midBlend?.height ?? 0)).toBeCloseTo(
      hole.size * hole.size * 0.25,
      12,
    );

    // Beyond half a hole-side the split stays fully directional, matching
    // the pure-axis expectations above.
    const outsideBlend = readSierpinskiCarpetHoleRevealedRect(hole, 0.25, "slide", {
      x: 0.5 - hole.size,
      y: 0.5,
    });
    expect(outsideBlend?.width).toBeCloseTo(hole.size * 0.25, 12);
    expect(outsideBlend?.height).toBeCloseTo(hole.size, 12);
  });
});
