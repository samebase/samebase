import { describe, expect, it } from "vite-plus/test";

import { buildMonacoAppliedCacheKey } from "./editorCacheKeys";

describe("buildMonacoAppliedCacheKey", () => {
  it("changes with the repository, branch, and tree SHA", () => {
    const input = {
      repositoryId: "repository_123",
      branch: "feature/login",
      treeSHA: "tree_sha_1",
      scopePrefix: "repo",
    };
    const key = buildMonacoAppliedCacheKey(input);

    expect(buildMonacoAppliedCacheKey({ ...input, repositoryId: "repository_456" })).not.toBe(key);
    expect(buildMonacoAppliedCacheKey({ ...input, branch: "main" })).not.toBe(key);
    expect(buildMonacoAppliedCacheKey({ ...input, treeSHA: "tree_sha_2" })).not.toBe(key);
  });

  it("keeps distinct keys for different scopes on same branch/tree", () => {
    const mainKey = buildMonacoAppliedCacheKey({
      repositoryId: "repository_123",
      branch: "main",
      treeSHA: "tree_sha_1",
      scopePrefix: "apps/samebase/",
    });
    const featureKey = buildMonacoAppliedCacheKey({
      repositoryId: "repository_123",
      branch: "main",
      treeSHA: "tree_sha_1",
      scopePrefix: "packages/shared/",
    });

    expect(mainKey).not.toBe(featureKey);
  });
});
