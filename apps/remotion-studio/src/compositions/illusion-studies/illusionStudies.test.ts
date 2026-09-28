import { describe, expect, test } from "vitest";

import {
  cubeOrHoleBeats,
  cubeOrHoleFps,
  readCubeOrHoleFrame,
  readSwing,
  showsCube,
  swapFrame,
} from "./cubeOrHoleTimeline";
import {
  clearingGoneAt,
  endlessPullbackFps,
  endlessPullbackSeconds,
  pullbackPeriod,
  readEndlessPullbackFrame,
  readZoomLog,
} from "./endlessPullbackTimeline";

describe("endless pull back", () => {
  test("repeats exactly one period later once the clearing is gone", () => {
    const steadyFrom = pullbackPeriod * clearingGoneAt + pullbackPeriod / 2;
    expect(readZoomLog(steadyFrom)).toBeCloseTo(clearingGoneAt, 9);
    for (let time = steadyFrom; time + pullbackPeriod < endlessPullbackSeconds; time += 0.37) {
      const { cameras, haze, light } = readEndlessPullbackFrame(time, 1);
      const later = readEndlessPullbackFrame(time + pullbackPeriod, 1);
      expect(later.cameras[0].target[0]).toBeCloseTo(cameras[0].target[0], 9);
      expect(later.cameras[1].halfHeight).toBeCloseTo(cameras[1].halfHeight, 9);
      expect(later.haze.density).toBeCloseTo(haze.density, 9);
      expect(later.haze.start).toBeCloseTo(haze.start, 9);
      expect(later.haze.clearing.radius).toBe(haze.clearing.radius);
      expect(later.light.aoScale).toBeCloseTo(light.aoScale, 9);
    }
  });

  test("stays orthographic and keeps the render scale between 1 and 3 for the whole shutter", () => {
    for (let frame = 0; frame < endlessPullbackSeconds * endlessPullbackFps; frame += 1) {
      for (const camera of readEndlessPullbackFrame(frame / endlessPullbackFps, 1).cameras) {
        expect(camera.tanHalfFieldOfView).toBe(0);
        expect(camera.halfHeight / 2.6).toBeGreaterThan(0.99);
        expect(camera.halfHeight / 2.6).toBeLessThan(3.01);
      }
    }
  });
});

describe("cube or hole", () => {
  test("swaps the hole for the cube only on the frame exactly at the key view", () => {
    const frames = Math.round(cubeOrHoleBeats.end * cubeOrHoleFps);
    const swaps: number[] = [];
    for (let frame = 1; frame < frames; frame += 1) {
      if (showsCube(frame / cubeOrHoleFps) !== showsCube((frame - 1) / cubeOrHoleFps)) {
        swaps.push(frame);
      }
    }
    expect(swaps).toEqual([swapFrame + 1]);
    expect(readSwing(swapFrame / cubeOrHoleFps)).toBeCloseTo(0, 9);
    expect(readSwing((swapFrame - 1) / cubeOrHoleFps)).toBeGreaterThan(0);
    expect(readSwing((swapFrame + 1) / cubeOrHoleFps)).toBeLessThan(0);
  });

  test("stays orthographic and rests at the key view at both ends, so the clip loops", () => {
    const frames = Math.round(cubeOrHoleBeats.end * cubeOrHoleFps);
    for (let frame = 0; frame < frames; frame += 1) {
      for (const camera of readCubeOrHoleFrame(frame / cubeOrHoleFps, 1).cameras) {
        expect(camera.tanHalfFieldOfView).toBe(0);
      }
    }
    expect(readSwing(0)).toBe(0);
    expect(readSwing((frames - 1) / cubeOrHoleFps)).toBe(0);
  });
});
