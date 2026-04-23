import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import { DraftPullRequestFeedbackBanner } from "./DraftPullRequestFeedbackBanner";

describe("DraftPullRequestFeedbackBanner", () => {
  it("matches the inline snapshot for a browser-blocked notice", () => {
    const markup = renderToStaticMarkup(
      <DraftPullRequestFeedbackBanner message="Draft pull request created, but the browser blocked opening a new tab." />,
    );

    expect(markup).toMatchInlineSnapshot(
      `"<div class="mb-3 corner-notch-1 border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">Draft pull request created, but the browser blocked opening a new tab.</div>"`,
    );
  });
});
