import {
  SIERPINSKI_CARPET_HOVER_DEFAULT_REVEAL_RADIUS,
  SIERPINSKI_CARPET_HOVER_FULL_OPEN_RADIUS_FRACTION,
  SIERPINSKI_CARPET_HOVER_HOLES,
  SIERPINSKI_CARPET_HOVER_PER_DEPTH_RADIUS_RATIO,
  createSierpinskiCarpetHoverHoles,
  readSierpinskiCarpetHoleOpenness,
  readSierpinskiCarpetHoleRevealedRect,
  type SierpinskiCarpetHoverConfig,
  type SierpinskiCarpetHoverHole,
} from "../src/sierpinskiCarpetHover.ts";
import { describe, expect, it } from "vite-plus/test";

const SHARED_CONFIG: SierpinskiCarpetHoverConfig = {
  falloff: "shared",
  maxDepth: 4,
  revealRadius: SIERPINSKI_CARPET_HOVER_DEFAULT_REVEAL_RADIUS,
};

function makeHole(depth: SierpinskiCarpetHoverHole["depth"]): SierpinskiCarpetHoverHole {
  return {
    centerX: 0.5,
    centerY: 0.5,
    depth,
    size: 3 ** -depth,
    slide: { axis: "x", sign: 1 },
  };
}

describe("Sierpinski carpet hover", () => {
  it("enumerates every hole of the depth-four carpet", () => {
    expect(SIERPINSKI_CARPET_HOVER_HOLES).toHaveLength(585);

    const countsByDepth = new Map<number, number>();
    for (const hole of SIERPINSKI_CARPET_HOVER_HOLES) {
      countsByDepth.set(hole.depth, (countsByDepth.get(hole.depth) ?? 0) + 1);
      expect(hole.size).toBeCloseTo(3 ** -hole.depth, 12);
    }

    expect(countsByDepth.get(1)).toBe(1);
    expect(countsByDepth.get(2)).toBe(8);
    expect(countsByDepth.get(3)).toBe(64);
    expect(countsByDepth.get(4)).toBe(512);

    const depthOneHole = SIERPINSKI_CARPET_HOVER_HOLES[0];
    expect(depthOneHole?.depth).toBe(1);
    expect(depthOneHole?.centerX).toBeCloseTo(0.5, 12);
    expect(depthOneHole?.centerY).toBeCloseTo(0.5, 12);
  });

  it("keeps every hole disjoint from every other hole", () => {
    const holes = SIERPINSKI_CARPET_HOVER_HOLES;
    let overlapCount = 0;
    for (let leftIndex = 0; leftIndex < holes.length; leftIndex += 1) {
      const left = holes[leftIndex];
      if (!left) {
        continue;
      }

      for (let rightIndex = leftIndex + 1; rightIndex < holes.length; rightIndex += 1) {
        const right = holes[rightIndex];
        if (!right) {
          continue;
        }

        const minimumGap = (left.size + right.size) / 2 - 1e-9;
        if (
          Math.abs(left.centerX - right.centerX) < minimumGap &&
          Math.abs(left.centerY - right.centerY) < minimumGap
        ) {
          overlapCount += 1;
        }
      }
    }

    expect(overlapCount).toBe(0);
  });

  it("produces a deterministic hole order", () => {
    expect(createSierpinskiCarpetHoverHoles()).toEqual(SIERPINSKI_CARPET_HOVER_HOLES);

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
      expect(ordered).toBeLessThan(0);
    }
  });

  it("assigns deterministic slide directions covering all four directions", () => {
    const directionKeys = new Set(
      SIERPINSKI_CARPET_HOVER_HOLES.map((hole) => `${hole.slide.axis},${hole.slide.sign}`),
    );

    expect(directionKeys).toEqual(new Set(["x,-1", "x,1", "y,-1", "y,1"]));
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
    expect(readSierpinskiCarpetHoleOpenness(makeHole(4), pointer, cappedConfig)).toBe(0);
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

    expect(readSierpinskiCarpetHoleRevealedRect(hole, 0, "grow")).toBeNull();
    expect(readSierpinskiCarpetHoleRevealedRect(hole, Number.NaN, "grow")).toBeNull();

    const fullRect = readSierpinskiCarpetHoleRevealedRect(hole, 1, "grow");
    expect(fullRect?.width).toBeCloseTo(hole.size, 12);
    expect(fullRect?.height).toBeCloseTo(hole.size, 12);
    expect(fullRect?.x).toBeCloseTo(hole.centerX - hole.size / 2, 12);
    expect(fullRect?.y).toBeCloseTo(hole.centerY - hole.size / 2, 12);

    const halfRect = readSierpinskiCarpetHoleRevealedRect(hole, 0.5, "grow");
    expect(halfRect?.width).toBeCloseTo(hole.size / 2, 12);
    expect(halfRect?.height).toBeCloseTo(hole.size / 2, 12);
    expect(halfRect?.x).toBeCloseTo(hole.centerX - hole.size / 4, 12);
    expect(halfRect?.y).toBeCloseTo(hole.centerY - hole.size / 4, 12);
  });

  it("slides the revealed rectangle open from the retreating cover's edge", () => {
    const hole = makeHole(2);
    const left = hole.centerX - hole.size / 2;
    const top = hole.centerY - hole.size / 2;

    const positiveRect = readSierpinskiCarpetHoleRevealedRect(hole, 0.5, "slide");
    expect(positiveRect?.width).toBeCloseTo(hole.size / 2, 12);
    expect(positiveRect?.height).toBeCloseTo(hole.size, 12);
    expect(positiveRect?.x).toBeCloseTo(left, 12);
    expect(positiveRect?.y).toBeCloseTo(top, 12);

    const negativeRect = readSierpinskiCarpetHoleRevealedRect(
      { ...hole, slide: { axis: "x", sign: -1 } },
      0.5,
      "slide",
    );
    expect(negativeRect?.x).toBeCloseTo(left + hole.size / 2, 12);

    const verticalRect = readSierpinskiCarpetHoleRevealedRect(
      { ...hole, slide: { axis: "y", sign: -1 } },
      0.25,
      "slide",
    );
    expect(verticalRect?.width).toBeCloseTo(hole.size, 12);
    expect(verticalRect?.height).toBeCloseTo(hole.size / 4, 12);
    expect(verticalRect?.x).toBeCloseTo(left, 12);
    expect(verticalRect?.y).toBeCloseTo(top + hole.size * 0.75, 12);

    const clampedRect = readSierpinskiCarpetHoleRevealedRect(hole, 2, "slide");
    expect(clampedRect?.width).toBeCloseTo(hole.size, 12);
  });
});
