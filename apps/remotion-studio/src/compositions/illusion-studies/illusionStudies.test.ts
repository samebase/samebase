import { describe, expect, test } from "vitest";

import { cubeOrHoleBeats, cubeOrHoleFps, readCubeOrHoleFrame } from "./cubeOrHoleTimeline";
import {
  endlessPullbackFps,
  endlessPullbackSeconds,
  hazeLiftPeriods,
  pullbackPeriod,
  readEndlessPullbackFrame,
} from "./endlessPullbackTimeline";

describe("endless pull back", () => {
  test("repeats exactly one period later once the haze has lifted", () => {
    const steadyFrom = pullbackPeriod * hazeLiftPeriods + pullbackPeriod / 2;
    for (let time = steadyFrom; time + pullbackPeriod < endlessPullbackSeconds; time += 0.37) {
      const { cameras, haze, light } = readEndlessPullbackFrame(time, 1);
      const later = readEndlessPullbackFrame(time + pullbackPeriod, 1);
      expect(later.cameras[0].target[0]).toBeCloseTo(cameras[0].target[0], 9);
      expect(later.cameras[1].halfHeight).toBeCloseTo(cameras[1].halfHeight, 9);
      expect(later.haze.density).toBeCloseTo(haze.density, 9);
      expect(later.haze.start).toBeCloseTo(haze.start, 9);
      expect(later.light.aoScale).toBeCloseTo(light.aoScale, 9);
    }
  });

  test("keeps the render scale between 1 and 3 for the whole shutter", () => {
    for (let frame = 0; frame < endlessPullbackSeconds * endlessPullbackFps; frame += 1) {
      const { cameras } = readEndlessPullbackFrame(frame / endlessPullbackFps, 1);
      for (const camera of cameras) {
        expect(camera.halfHeight / 2.6).toBeGreaterThan(0.99);
        expect(camera.halfHeight / 2.6).toBeLessThan(3.01);
      }
    }
  });
});

describe("cube or hole", () => {
  test("swaps the hole for the cube only while the camera rests at the key view", () => {
    const swapFrame = Math.round(cubeOrHoleBeats.swap * cubeOrHoleFps);
    const before = readCubeOrHoleFrame((swapFrame - 1) / cubeOrHoleFps, "plain", 1);
    const after = readCubeOrHoleFrame(swapFrame / cubeOrHoleFps, "plain", 1);
    expect(before.scene.kind === "notch" && before.scene.notch).toBe("hole");
    expect(after.scene.kind === "notch" && after.scene.notch).toBe("cube");
    for (const frame of [before, after]) {
      expect(frame.cameras[0]).toEqual(frame.cameras[1]);
      expect(frame.cameras[0].tanHalfFieldOfView).toBe(0);
      expect(frame.light.shadowStrength).toBe(0);
    }
    expect(after.cameras[0]).toEqual(before.cameras[0]);
  });

  test("ends where it starts, so the clip loops", () => {
    const lastFrame = Math.round(cubeOrHoleBeats.end * cubeOrHoleFps) - 1;
    const first = readCubeOrHoleFrame(0, "plain", 1);
    const last = readCubeOrHoleFrame(lastFrame / cubeOrHoleFps, "plain", 1);
    expect(last.cameras).toEqual(first.cameras);
    expect(last.light).toEqual(first.light);
  });
});
