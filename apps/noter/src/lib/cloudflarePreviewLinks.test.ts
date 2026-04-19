import { describe, expect, it } from "vitest";

import {
  hasCurrentCloudflareBranchPreview,
  shouldHydrateCloudflareBranchPreview,
} from "./cloudflarePreviewLinks";

describe("hasCurrentCloudflareBranchPreview", () => {
  it("returns true when the cached preview belongs to the current PR", () => {
    expect(
      hasCurrentCloudflareBranchPreview({
        pullRequestNumber: 42,
        cloudflareBranchPreviewUrl: "https://branch.pages.dev/",
        cloudflarePreviewPullRequestNumber: 42,
      }),
    ).toBe(true);
  });

  it("returns false when the cached preview belongs to a different PR", () => {
    expect(
      hasCurrentCloudflareBranchPreview({
        pullRequestNumber: 42,
        cloudflareBranchPreviewUrl: "https://branch.pages.dev/",
        cloudflarePreviewPullRequestNumber: 41,
      }),
    ).toBe(false);
  });

  it("returns false when the cached preview URL is missing", () => {
    expect(
      hasCurrentCloudflareBranchPreview({
        pullRequestNumber: 42,
        cloudflarePreviewPullRequestNumber: 42,
      }),
    ).toBe(false);
  });
});

describe("shouldHydrateCloudflareBranchPreview", () => {
  it("requests hydration when the current PR is missing a cached preview", () => {
    expect(
      shouldHydrateCloudflareBranchPreview({
        remoteState: "active",
        pullRequestNumber: 42,
      }),
    ).toBe(true);
  });

  it("requests hydration when the cached preview belongs to a different PR", () => {
    expect(
      shouldHydrateCloudflareBranchPreview({
        remoteState: "active",
        pullRequestNumber: 42,
        cloudflareBranchPreviewUrl: "https://branch.pages.dev/",
        cloudflarePreviewPullRequestNumber: 41,
      }),
    ).toBe(true);
  });

  it("skips hydration when the current PR already has a cached preview", () => {
    expect(
      shouldHydrateCloudflareBranchPreview({
        remoteState: "active",
        pullRequestNumber: 42,
        cloudflareBranchPreviewUrl: "https://branch.pages.dev/",
        cloudflarePreviewPullRequestNumber: 42,
      }),
    ).toBe(false);
  });

  it("skips hydration for deleted-upstream rows", () => {
    expect(
      shouldHydrateCloudflareBranchPreview({
        remoteState: "deleted_upstream",
        pullRequestNumber: 42,
      }),
    ).toBe(false);
  });
});
