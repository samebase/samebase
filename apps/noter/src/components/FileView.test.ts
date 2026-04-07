import { describe, expect, it } from "vite-plus/test";

import { buildFileViewRefreshDebounceKey } from "@/lib/fileViewRefresh";

describe("buildFileViewRefreshDebounceKey", () => {
  it("includes branch in debounce key", () => {
    expect(
      buildFileViewRefreshDebounceKey({
        owner: "octo",
        repoName: "repo",
        branch: "feature/login",
      }),
    ).toBe("octo/repo:branch:feature/login");
  });

  it("uses default bucket when branch is missing", () => {
    expect(
      buildFileViewRefreshDebounceKey({
        owner: "octo",
        repoName: "repo",
      }),
    ).toBe("octo/repo:default");
  });

  it("distinguishes explicit __default__ branch from branchless key", () => {
    const branchless = buildFileViewRefreshDebounceKey({
      owner: "octo",
      repoName: "repo",
    });
    const explicitDefaultBranch = buildFileViewRefreshDebounceKey({
      owner: "octo",
      repoName: "repo",
      branch: "__default__",
    });

    expect(branchless).toBe("octo/repo:default");
    expect(explicitDefaultBranch).toBe("octo/repo:branch:__default__");
    expect(branchless).not.toBe(explicitDefaultBranch);
  });
});
