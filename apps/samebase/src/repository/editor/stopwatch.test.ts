import { describe, expect, it } from "vite-plus/test";
import { formatStopwatchDuration } from "@/repository/editor/stopwatch";

describe("formatStopwatchDuration", () => {
  it("formats sub-minute durations with tenths", () => {
    expect(formatStopwatchDuration(4823)).toBe("00:04.8");
  });

  it("formats minute-long durations with zero-padded seconds", () => {
    expect(formatStopwatchDuration(65043)).toBe("01:05.0");
  });

  it("includes hours when the duration exceeds one hour", () => {
    expect(formatStopwatchDuration(3723456)).toBe("1:02:03.4");
  });

  it("clamps negative durations to zero", () => {
    expect(formatStopwatchDuration(-250)).toBe("00:00.0");
  });
});
