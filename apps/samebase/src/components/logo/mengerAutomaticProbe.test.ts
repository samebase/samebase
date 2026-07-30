import {
  MENGER_AUTOMATIC_PROBE_PATHS,
  normalizeMengerAutomaticProbeExtent,
  normalizeMengerAutomaticProbeLoopDurationSeconds,
  normalizeMengerAutomaticProbeRestDurationSeconds,
  readMengerAutomaticProbePoint,
} from "@/components/logo/mengerAutomaticProbe";
import { describe, expect, it } from "vite-plus/test";

describe("Menger automatic probe", () => {
  it("keeps every path centered and inside its configured extents", () => {
    for (const path of MENGER_AUTOMATIC_PROBE_PATHS) {
      const points = Array.from({ length: 65 }, (_, index) =>
        readMengerAutomaticProbePoint(path, index / 64, 0.3, 0.55),
      );

      expect(points[0]?.x).toBeCloseTo(points.at(-1)?.x ?? Number.NaN);
      expect(points[0]?.y).toBeCloseTo(points.at(-1)?.y ?? Number.NaN);
      expect(Math.min(...points.map((point) => point.x))).toBeCloseTo(0.35);
      expect(Math.max(...points.map((point) => point.x))).toBeCloseTo(0.65);
      expect(Math.min(...points.map((point) => point.y))).toBeCloseTo(0.225);
      expect(Math.max(...points.map((point) => point.y))).toBeCloseTo(0.775);
    }
  });

  it("makes the default vertical figure eight taller than it is wide", () => {
    const top = readMengerAutomaticProbePoint("vertical-8", 0.25, 0.3, 0.55);
    const right = readMengerAutomaticProbePoint("vertical-8", 0.125, 0.3, 0.55);

    expect(top.x).toBeCloseTo(0.5);
    expect(top.y).toBeCloseTo(0.225);
    expect(right.x).toBeCloseTo(0.65);
    expect(right.y).toBeGreaterThan(top.y);
  });

  it("keeps time and size inputs in their valid semantic domains", () => {
    expect(normalizeMengerAutomaticProbeExtent(-1)).toBe(0);
    expect(normalizeMengerAutomaticProbeLoopDurationSeconds(0)).toBe(0.1);
    expect(normalizeMengerAutomaticProbeRestDurationSeconds(-1)).toBe(0);
  });
});
