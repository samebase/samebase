import { describe, expect, it } from "vite-plus/test";

import { getTreeRefreshUiState } from "./treeRefreshStatus";

describe("getTreeRefreshUiState", () => {
  const now = Date.parse("2026-03-26T18:00:00Z");

  it("prefers syncing while a non-stale refresh is in progress", () => {
    expect(
      getTreeRefreshUiState({
        now,
        treeRefreshStartedAt: now - 5_000,
        treeRefreshCooldownUntil: now + 60_000,
        treeRefreshFailureKind: "rate_limited",
      }),
    ).toEqual({ kind: "syncing" });
  });

  it("returns rate-limited while cooldown is active for GitHub limits", () => {
    expect(
      getTreeRefreshUiState({
        now,
        lastTreeRefreshAt: now - 10_000,
        lastTreeRefreshFailedAt: now - 2_000,
        treeRefreshFailureKind: "rate_limited",
        treeRefreshCooldownUntil: now + 4 * 60 * 1000,
      }),
    ).toEqual({
      kind: "rate_limited",
      cooldownUntil: now + 4 * 60 * 1000,
    });
  });

  it("returns generic cooldown for non-rate-limit failures", () => {
    expect(
      getTreeRefreshUiState({
        now,
        lastTreeRefreshAt: now - 10_000,
        lastTreeRefreshFailedAt: now - 2_000,
        treeRefreshFailureKind: "failed",
        treeRefreshCooldownUntil: now + 60_000,
      }),
    ).toEqual({
      kind: "cooldown",
      cooldownUntil: now + 60_000,
    });
  });

  it("returns failed after the cooldown expires but before a later success", () => {
    expect(
      getTreeRefreshUiState({
        now,
        lastTreeRefreshAt: now - 2 * 60 * 1000,
        lastTreeRefreshFailedAt: now - 10_000,
        treeRefreshFailureKind: "failed",
      }),
    ).toEqual({ kind: "failed" });
  });

  it("returns idle once a later success exists", () => {
    expect(
      getTreeRefreshUiState({
        now,
        lastTreeRefreshAt: now - 5_000,
        lastTreeRefreshFailedAt: now - 10_000,
        treeRefreshFailureKind: "failed",
      }),
    ).toEqual({ kind: "idle" });
  });
});
