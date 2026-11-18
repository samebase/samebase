import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vite-plus/test";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, disabled }: { children?: ReactNode; disabled?: boolean }) => (
    <button disabled={disabled}>{children}</button>
  ),
}));

vi.mock("@/components/PullRequestLink", () => ({
  PullRequestLink: ({ pullRequestUrl }: { pullRequestUrl: string }) => <a href={pullRequestUrl} />,
}));

import { FileViewPushActions } from "./FileViewPushActions";

function readButtons(markup: string) {
  return [...markup.matchAll(/<button([^>]*)>([^<]*)<\/button>/g)].map(([, attributes, label]) => ({
    label,
    disabled: attributes.includes("disabled"),
  }));
}

describe("FileViewPushActions", () => {
  it("offers the draft and push actions when there are changes", () => {
    const markup = renderToStaticMarkup(
      <FileViewPushActions
        canCreateDraftPullRequest
        draftButtonLabel="create draft"
        hasChangesToCommit
        isCreatingDraftPullRequest={false}
        isPushing={false}
        onCreateDraftPullRequest={() => {}}
        onManualCommit={() => {}}
      />,
    );

    expect(readButtons(markup)).toEqual([
      { label: "create draft", disabled: false },
      { label: "push", disabled: false },
    ]);
  });

  it("links the existing pull request and shows a disabled synced state", () => {
    const markup = renderToStaticMarkup(
      <FileViewPushActions
        canCreateDraftPullRequest={false}
        currentPullRequestNumber={999}
        currentPullRequestUrl="https://github.com/samebase/samebase/pull/999"
        draftButtonLabel="create draft"
        hasChangesToCommit={false}
        isCreatingDraftPullRequest={false}
        isPushing={false}
        onCreateDraftPullRequest={() => {}}
        onManualCommit={() => {}}
      />,
    );

    expect(markup).toContain('href="https://github.com/samebase/samebase/pull/999"');
    expect(readButtons(markup)).toEqual([{ label: "All Synced", disabled: true }]);
  });

  it("disables push while a draft pull request is being created", () => {
    const markup = renderToStaticMarkup(
      <FileViewPushActions
        canCreateDraftPullRequest
        draftButtonLabel="create draft"
        hasChangesToCommit
        isCreatingDraftPullRequest
        isPushing={false}
        onCreateDraftPullRequest={() => {}}
        onManualCommit={() => {}}
      />,
    );

    expect(readButtons(markup)).toEqual([
      { label: "Creating...", disabled: true },
      { label: "push", disabled: true },
    ]);
  });
});
