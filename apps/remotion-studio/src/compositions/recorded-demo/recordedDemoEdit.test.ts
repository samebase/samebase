import { describe, expect, it } from "vite-plus/test";

import { createWaitPlaybackRates } from "./recordedDemoEdit";

describe("createWaitPlaybackRates", () => {
  it.each([
    { maximumPlaybackRate: 32, rampDurationInSeconds: 2 },
    { maximumPlaybackRate: 64, rampDurationInSeconds: 2 },
    { maximumPlaybackRate: 32, rampDurationInSeconds: 4 },
  ])(
    "covers the source with $rampDurationInSeconds-second ramps at $maximumPlaybackRate×",
    (settings) => {
      const fps = 30;
      const sourceDurationInFrames = (14 * 60 + 35 - (1 * 60 + 58)) * fps;
      const rates = createWaitPlaybackRates({ fps, sourceDurationInFrames, ...settings });
      const rampFrames = settings.rampDurationInSeconds * fps;

      expect(rates[0]).toBe(1);
      expect(rates.at(-1)).toBe(1);
      expect(rates.indexOf(settings.maximumPlaybackRate)).toBe(rampFrames - 1);
      expect(rates.lastIndexOf(settings.maximumPlaybackRate)).toBe(rates.length - rampFrames);
      expect(Math.min(...rates)).toBe(1);
      expect(Math.max(...rates)).toBe(settings.maximumPlaybackRate);
      expect(rates.reduce((sum, rate) => sum + rate, 0)).toBeCloseTo(sourceDurationInFrames, 6);
      expect(rates.slice(0, rampFrames)).toEqual([...rates.slice(-rampFrames)].reverse());
      expect(rates.slice(0, rampFrames)).toEqual(
        [...rates.slice(0, rampFrames)].sort((a, b) => a - b),
      );
    },
  );

  it.each([0, -1, 1 / 30, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects an unusable ramp duration of %s seconds",
    (rampDurationInSeconds) => {
      expect(() =>
        createWaitPlaybackRates({
          fps: 30,
          maximumPlaybackRate: 32,
          rampDurationInSeconds,
          sourceDurationInFrames: 22_710,
        }),
      ).toThrow("must last at least three frames");
    },
  );
});
