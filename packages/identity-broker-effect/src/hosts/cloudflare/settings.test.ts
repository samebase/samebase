import { describe, expect, test } from "vite-plus/test";
import { alarmPlan, nextDailyAt, NEXT_BATCH_MS } from "./settings.ts";

describe("cleanup alarm", () => {
  const now = Date.UTC(2026, 10, 18, 12, 0);

  test("the daily alarm is the next 04:17 UTC, strictly in the future", () => {
    expect(nextDailyAt(now)).toBe(Date.UTC(2026, 10, 19, 4, 17));
    expect(nextDailyAt(Date.UTC(2026, 10, 18, 3, 0))).toBe(Date.UTC(2026, 10, 18, 4, 17));
    expect(nextDailyAt(Date.UTC(2026, 10, 18, 4, 17))).toBe(Date.UTC(2026, 10, 19, 4, 17));
  });

  test("a run that has more keeps its first cutoff for every batch, then clears it", () => {
    const first = alarmPlan(undefined, now);
    expect(first.cutoff).toBe(now);
    const kept = first.after(true);
    expect(kept).toEqual({ store: now, alarmAt: now + NEXT_BATCH_MS });

    const later = now + 5 * NEXT_BATCH_MS;
    const second = alarmPlan(kept.store, later);
    expect(second.cutoff).toBe(now);
    expect(second.after(false)).toEqual({ store: undefined, alarmAt: nextDailyAt(later) });
  });

  test("a duplicate delivery gives the same batch and the same next alarm", () => {
    const once = alarmPlan(now - 1000, now);
    const twice = alarmPlan(now - 1000, now);
    expect(twice.cutoff).toBe(once.cutoff);
    expect(twice.after(true)).toEqual(once.after(true));
    // After a run ended, a late duplicate starts a new run at its own time and arms the same day.
    const late = alarmPlan(undefined, now + 10);
    expect(late.after(false).alarmAt).toBe(nextDailyAt(now));
  });
});
