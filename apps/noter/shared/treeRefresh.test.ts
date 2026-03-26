import { describe, expect, it } from "vitest";

import {
  getLastRepositoryMetadataRefreshAt,
  isRepositoryMetadataStale,
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
