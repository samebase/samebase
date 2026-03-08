import { describe, expect, it } from "vitest";

import { buildFileViewRefreshDebounceKey } from "@/lib/fileViewRefresh";

describe("buildFileViewRefreshDebounceKey", () => {
  it("includes branch in debounce key", () => {
    expect(
      buildFileViewRefreshDebounceKey({
        owner: "octo",
        repoName: "repo",
        branch: "feature/login",
      }),
    ).toBe("octo/repo:feature/login");
  });

  it("uses default bucket when branch is missing", () => {
    expect(
      buildFileViewRefreshDebounceKey({
        owner: "octo",
        repoName: "repo",
      }),
    ).toBe("octo/repo:__default__");
  });
});
