import {
  MENGER_AUTOMATIC_PROBE_PATHS,
  normalizeMengerAutomaticProbeExtent,
  normalizeMengerAutomaticProbeLoopDurationSeconds,
  normalizeMengerAutomaticProbeRestDurationSeconds,
  normalizeMengerAutomaticProbeStartProgress,
  normalizeMengerAutomaticProbeVerticalOffset,
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

  it("starts and ends the default vertical figure eight at its top point", () => {
    const start = readMengerAutomaticProbePoint("vertical-8", 0, 0.3, 0.55);
    const end = readMengerAutomaticProbePoint("vertical-8", 1, 0.3, 0.55);
    const side = readMengerAutomaticProbePoint("vertical-8", 0.375, 0.3, 0.55);

    expect(start.x).toBeCloseTo(0.5);
    expect(start.y).toBeCloseTo(0.225);
    expect(end.x).toBeCloseTo(start.x);
    expect(end.y).toBeCloseTo(start.y);
    expect(side.x).toBeCloseTo(0.65);
    expect(side.y).toBeGreaterThan(start.y);
  });

  it("supports taller paths and shifts every point by the same vertical offset", () => {
    const points = Array.from({ length: 65 }, (_, index) =>
      readMengerAutomaticProbePoint("vertical-8", index / 64, 0.3, 1.375, 0.25, 0.4),
    );
    const unshiftedPoints = Array.from({ length: 65 }, (_, index) =>
      readMengerAutomaticProbePoint("vertical-8", index / 64, 0.3, 1.375, 0.25),
    );

    expect(Math.min(...points.map((point) => point.y))).toBeCloseTo(0.2125);
    expect(Math.max(...points.map((point) => point.y))).toBeCloseTo(1.5875);
    expect(points.every((point, index) => point.x === unshiftedPoints[index]?.x)).toBe(true);
    expect(points[0]?.y).toBeCloseTo((unshiftedPoints[0]?.y ?? Number.NaN) + 0.4);
  });

  it("keeps time and size inputs in their valid semantic domains", () => {
    expect(normalizeMengerAutomaticProbeExtent(-1)).toBe(0);
    expect(normalizeMengerAutomaticProbeExtent(1e308)).toBe(1e308);
    expect(normalizeMengerAutomaticProbeExtent(Number.POSITIVE_INFINITY)).toBe(0);
    expect(normalizeMengerAutomaticProbeLoopDurationSeconds(0)).toBe(0.1);
    expect(normalizeMengerAutomaticProbeLoopDurationSeconds(1e308)).toBe(1e308);
    expect(normalizeMengerAutomaticProbeLoopDurationSeconds(Number.NaN)).toBe(0.1);
    expect(normalizeMengerAutomaticProbeRestDurationSeconds(-1)).toBe(0);
    expect(normalizeMengerAutomaticProbeRestDurationSeconds(1e308)).toBe(1e308);
    expect(normalizeMengerAutomaticProbeRestDurationSeconds(Number.POSITIVE_INFINITY)).toBe(0);
    expect(normalizeMengerAutomaticProbeStartProgress(-1)).toBe(0);
    expect(normalizeMengerAutomaticProbeStartProgress(0.6)).toBe(0.6);
    expect(normalizeMengerAutomaticProbeStartProgress(2)).toBe(1);
    expect(normalizeMengerAutomaticProbeStartProgress(Number.NaN)).toBe(0);
    expect(normalizeMengerAutomaticProbeVerticalOffset(-2)).toBe(-1);
    expect(normalizeMengerAutomaticProbeVerticalOffset(0.4)).toBe(0.4);
    expect(normalizeMengerAutomaticProbeVerticalOffset(2)).toBe(1);
    expect(normalizeMengerAutomaticProbeVerticalOffset(Number.NaN)).toBe(0);
  });
});
