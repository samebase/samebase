import { describe, expect, it } from "vite-plus/test";

import {
  resolveInfraStateAfterWorkflowFailure,
  selectCloudflareBuildConfigTreeData,
} from "./infraProvisioning";
import type { GithubTreeData } from "./schema";

const branchTreeData = {
  sha: "branch-tree",
  truncated: false,
  tree: [
    {
      path: "apps/noter/package.json",
      mode: "100644",
      type: "blob",
      sha: "package-sha",
    },
  ],
} satisfies GithubTreeData;
describe("selectCloudflareBuildConfigTreeData", () => {
  it("prefers the branch tree cache", () => {
    expect(
      selectCloudflareBuildConfigTreeData({
        branchTreeData,
      }),
    ).toBe(branchTreeData);
  });

  it("fails before provider side effects when no tree is cached", () => {
    expect(() =>
      selectCloudflareBuildConfigTreeData({
        branchTreeData: null,
      }),
    ).toThrow("Default branch tree is not synced yet.");
  });
});

describe("resolveInfraStateAfterWorkflowFailure", () => {
  it("marks failures before provider progress as failed", () => {
    expect(
      resolveInfraStateAfterWorkflowFailure({
        convexProjectId: undefined,
        cloudflare: undefined,
      }),
    ).toBe("failed");
  });

  it("marks failures after Convex progress as partial", () => {
    expect(
      resolveInfraStateAfterWorkflowFailure({
        convexProjectId: "project-123",
        cloudflare: undefined,
      }),
    ).toBe("partial");
  });

  it("marks failures after Cloudflare progress as partial", () => {
    expect(
      resolveInfraStateAfterWorkflowFailure({
        convexProjectId: undefined,
        cloudflare: { provider: "cloudflare" },
      }),
    ).toBe("partial");
  });
});
