import { describe, expect, it } from "vite-plus/test";

import { hasCurrentCloudflareBranchPreview } from "./cloudflarePreviewLinks";

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
