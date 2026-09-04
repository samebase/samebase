import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import { DraftPullRequestFeedbackBanner } from "./DraftPullRequestFeedbackBanner";

describe("DraftPullRequestFeedbackBanner", () => {
  it("matches the inline snapshot for a browser-blocked notice", () => {
    const markup = renderToStaticMarkup(
      <DraftPullRequestFeedbackBanner
        message="Draft pull request created, but the browser blocked opening a new tab."
        branchPullRequestLookupFailed={false}
      />,
    );

    expect(markup).toMatchInlineSnapshot(
      `"<div role="alert" class="mb-3 corner-notch-1 border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">Draft pull request created, but the browser blocked opening a new tab.</div>"`,
    );
  });

  it("turns a terminal branch pull request lookup failure into reload guidance", () => {
    const markup = renderToStaticMarkup(
      <DraftPullRequestFeedbackBanner message={null} branchPullRequestLookupFailed />,
    );

    expect(markup).toContain(
      "Could not check whether this branch already has an open pull request. Reload the page to try again.",
    );
  });

  it("keeps a draft action error when the branch lookup also failed", () => {
    const markup = renderToStaticMarkup(
      <DraftPullRequestFeedbackBanner
        message="GitHub rejected the draft pull request."
        branchPullRequestLookupFailed
      />,
    );

    expect(markup).toContain("GitHub rejected the draft pull request.");
    expect(markup).not.toContain("Reload the page to try again.");
  });
});
