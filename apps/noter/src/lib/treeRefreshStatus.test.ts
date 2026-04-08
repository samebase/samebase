import { describe, expect, it } from "vitest";

import {
  getTreeRefreshUiState,
  shouldAutoRefreshVault,
} from "./treeRefreshStatus";

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

describe("shouldAutoRefreshVault", () => {
  const now = Date.parse("2026-04-03T12:00:00Z");

  it("backfills metadata even before any active branch rows exist", () => {
    expect(
      shouldAutoRefreshVault({
        lastTreeRefreshAt: now - 1_000,
        remoteBranches: [],
        trigger: "page_load",
        now,
      }),
    ).toBe(true);
  });

  it("refreshes on page load even when metadata and tree timestamps look fresh", () => {
    expect(
      shouldAutoRefreshVault({
        lastTreeRefreshAt: now - 5_000,
        remoteBranches: [
          {
            remoteState: "active",
            lastSyncedAt: now - 30_000,
          },
        ],
        trigger: "page_load",
        now,
      }),
    ).toBe(true);
  });

  it("uses deleted-upstream rows as freshness fallback when active rows are absent", () => {
    expect(
      shouldAutoRefreshVault({
        lastTreeRefreshAt: now - 1_000,
        remoteBranches: [
          {
            remoteState: "deleted_upstream",
            lastSyncedAt: now - 30_000,
            pullRequestNumber: 42,
          },
        ],
        trigger: "visibility",
        now,
      }),
    ).toBe(false);
  });

  it("ignores deleted-upstream preview gaps when deciding metadata staleness", () => {
    expect(
      shouldAutoRefreshVault({
        lastTreeRefreshAt: now - 1_000,
        remoteBranches: [
          {
            remoteState: "deleted_upstream",
            lastSyncedAt: now - 30_000,
            pullRequestNumber: 42,
          },
          {
            remoteState: "active",
            lastSyncedAt: now - 30_000,
          },
        ],
        trigger: "visibility",
        now,
      }),
    ).toBe(false);
  });

  it("still refreshes page load checks when the tree timestamp is invalid", () => {
    expect(
      shouldAutoRefreshVault({
        lastTreeRefreshAt: Number.NaN,
        remoteBranches: [
          {
            remoteState: "active",
            lastSyncedAt: now - 30_000,
          },
        ],
        trigger: "page_load",
        now,
      }),
    ).toBe(true);
  });
});
