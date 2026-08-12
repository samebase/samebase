import { describe, expect, it } from "vite-plus/test";

import { buildMonacoAppliedCacheKey } from "./editorCacheKeys";

describe("buildMonacoAppliedCacheKey", () => {
  it("includes vault, branch, and tree SHA", () => {
    expect(
      buildMonacoAppliedCacheKey({
        vaultId: "vault_123",
        branch: "feature/login",
        treeSHA: "tree_sha_1",
        scopePrefix: "repo",
      }),
    ).toBe("vault_123:feature/login:tree_sha_1:repo");
  });

  it("keeps distinct keys for different scopes on same branch/tree", () => {
    const mainKey = buildMonacoAppliedCacheKey({
      vaultId: "vault_123",
      branch: "main",
      treeSHA: "tree_sha_1",
      scopePrefix: "apps/samebase/",
    });
    const featureKey = buildMonacoAppliedCacheKey({
      vaultId: "vault_123",
      branch: "main",
      treeSHA: "tree_sha_1",
      scopePrefix: "packages/shared/",
    });

    expect(mainKey).not.toBe(featureKey);
  });
});
