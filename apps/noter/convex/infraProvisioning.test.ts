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
const legacyTreeData = {
  sha: "legacy-tree",
  truncated: false,
  tree: [],
} satisfies GithubTreeData;

describe("selectCloudflareBuildConfigTreeData", () => {
  it("prefers the branch tree cache", () => {
    expect(
      selectCloudflareBuildConfigTreeData({
        branchTreeData,
        legacyTreeData,
      }),
    ).toBe(branchTreeData);
  });

  it("falls back to the legacy vault mirror while migration is incomplete", () => {
    expect(
      selectCloudflareBuildConfigTreeData({
        branchTreeData: null,
        legacyTreeData,
      }),
    ).toBe(legacyTreeData);
  });

  it("fails before provider side effects when no tree is cached", () => {
    expect(() =>
      selectCloudflareBuildConfigTreeData({
        branchTreeData: null,
        legacyTreeData: undefined,
      }),
    ).toThrow("Default branch tree is not synced yet.");
  });
});

describe("resolveInfraStateAfterWorkflowFailure", () => {
  it("marks failures before provider progress as failed", () => {
    expect(
      resolveInfraStateAfterWorkflowFailure({
        convexProjectId: undefined,
        hosting: undefined,
      }),
    ).toBe("failed");
  });

  it("marks failures after Convex progress as partial", () => {
    expect(
      resolveInfraStateAfterWorkflowFailure({
        convexProjectId: "project-123",
        hosting: undefined,
      }),
    ).toBe("partial");
  });

  it("marks failures after hosting progress as partial", () => {
    expect(
      resolveInfraStateAfterWorkflowFailure({
        convexProjectId: undefined,
        hosting: { provider: "cloudflare" },
      }),
    ).toBe("partial");
  });
});
