import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { TREE_REFRESH_DEBOUNCE_MS } from "../../shared/treeRefresh";
import { claimRefreshDebounce, releaseRefreshDebounce } from "./refreshDebounce";

const scope = "file_view";
const key = "samebase/samebase:branch:missing";

afterEach(() => {
  releaseRefreshDebounce(scope, key);
  vi.useRealTimers();
});

describe("claimRefreshDebounce", () => {
  it("keeps a confirmed missing branch from being requested again on immediate focus", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-17T10:00:00Z"));

    expect(claimRefreshDebounce(scope, key)).toBe(true);
    expect(claimRefreshDebounce(scope, key)).toBe(false);

    vi.advanceTimersByTime(TREE_REFRESH_DEBOUNCE_MS - 1);
    expect(claimRefreshDebounce(scope, key)).toBe(false);

    vi.advanceTimersByTime(1);
    expect(claimRefreshDebounce(scope, key)).toBe(true);
  });
});
