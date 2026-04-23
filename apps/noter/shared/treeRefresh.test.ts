import { describe, expect, it } from "vite-plus/test";

import {
  doesTreeRefreshClaimMatch,
  getLastRepositoryMetadataRefreshAt,
  isRepositoryMetadataStale,
  shouldPreserveTreeRefreshCooldownAfterSuccess,
  shouldPreserveTreeRefreshFailureAfterSuccess,
} from "./treeRefresh";

describe("getLastRepositoryMetadataRefreshAt", () => {
  it("returns the newest branch metadata timestamp", () => {
    expect(
      getLastRepositoryMetadataRefreshAt([
        { lastSyncedAt: 10 },
        { lastSyncedAt: 25 },
        { lastSyncedAt: 15 },
      ]),
    ).toBe(25);
  });

  it("returns undefined for an empty cache", () => {
    expect(getLastRepositoryMetadataRefreshAt([])).toBeUndefined();
  });
});

describe("isRepositoryMetadataStale", () => {
  const now = Date.parse("2026-03-27T12:00:00Z");

  it("treats missing metadata as stale", () => {
    expect(
      isRepositoryMetadataStale({
        now,
      }),
    ).toBe(true);
  });

  it("treats fresh metadata inside the stale window as fresh", () => {
    expect(
      isRepositoryMetadataStale({
        lastRepositoryMetadataRefreshAt: now - 9 * 60 * 1000,
        now,
      }),
    ).toBe(false);
  });

  it("treats metadata older than the stale window as stale", () => {
    expect(
      isRepositoryMetadataStale({
        lastRepositoryMetadataRefreshAt: now - 11 * 60 * 1000,
        now,
      }),
    ).toBe(true);
  });
});

describe("shouldPreserveTreeRefreshFailureAfterSuccess", () => {
  it("preserves a newer failure recorded after the refresh claimed the lock", () => {
    expect(
      shouldPreserveTreeRefreshFailureAfterSuccess({
        claimedStartedAt: 10,
        lastTreeRefreshFailedAt: 15,
      }),
    ).toBe(true);
  });

  it("clears older failure state once a later success completes", () => {
    expect(
      shouldPreserveTreeRefreshFailureAfterSuccess({
        claimedStartedAt: 15,
        lastTreeRefreshFailedAt: 10,
      }),
    ).toBe(false);
  });
});

describe("doesTreeRefreshClaimMatch", () => {
  it("accepts the worker that still owns the current lock", () => {
    expect(
      doesTreeRefreshClaimMatch({
        claimedStartedAt: 15,
        treeRefreshStartedAt: 15,
      }),
    ).toBe(true);
  });

  it("rejects stale workers once a newer lock was claimed", () => {
    expect(
      doesTreeRefreshClaimMatch({
        claimedStartedAt: 15,
        treeRefreshStartedAt: 20,
      }),
    ).toBe(false);
  });
});

describe("shouldPreserveTreeRefreshCooldownAfterSuccess", () => {
  const now = Date.parse("2026-04-03T12:00:00Z");

  it("preserves cooldowns that were already active before the refresh started", () => {
    expect(
      shouldPreserveTreeRefreshCooldownAfterSuccess({
        claimedStartedAt: now - 5_000,
        cooldownUntil: now + 60_000,
        now,
      }),
    ).toBe(true);
  });

  it("does not preserve expired cooldowns without a newer failure", () => {
    expect(
      shouldPreserveTreeRefreshCooldownAfterSuccess({
        claimedStartedAt: now - 5_000,
        cooldownUntil: now - 1,
        now,
      }),
    ).toBe(false);
  });
});
