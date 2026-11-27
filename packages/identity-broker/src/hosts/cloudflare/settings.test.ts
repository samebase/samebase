import { describe, expect, test } from "vite-plus/test";
import { alarmPlan, CLEANUP_EVERY_MS, NEXT_BATCH_MS } from "./settings.ts";

describe("cleanup alarm", () => {
  const now = Date.UTC(2026, 10, 18, 12, 0);

  test("a run that has more keeps its first cutoff for every batch, then clears it and runs again 10 minutes later", () => {
    const first = alarmPlan(undefined, now);
    expect(first.cutoff).toBe(now);
    const kept = first.after(true);
    expect(kept).toEqual({ store: now, alarmAt: now + NEXT_BATCH_MS });

    const later = now + 5 * NEXT_BATCH_MS;
    const second = alarmPlan(kept.store, later);
    expect(second.cutoff).toBe(now);
    expect(second.after(false)).toEqual({ store: undefined, alarmAt: later + 10 * 60 * 1000 });
  });

  test("a duplicate delivery gives the same batch and the same next alarm", () => {
    const once = alarmPlan(now - 1000, now);
    const twice = alarmPlan(now - 1000, now);
    expect(twice.cutoff).toBe(once.cutoff);
    expect(twice.after(true)).toEqual(once.after(true));
    // After a run ended, a late duplicate starts a new run at its own time.
    const late = alarmPlan(undefined, now + 10);
    expect(late.after(false).alarmAt).toBe(now + 10 + CLEANUP_EVERY_MS);
  });
});
