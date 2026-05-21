import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vite-plus/test";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    className,
    disabled,
    size,
    variant,
  }: {
    children?: ReactNode;
    className?: string;
    disabled?: boolean;
    size?: string;
    variant?: string;
  }) => (
    <button className={className} disabled={disabled} data-size={size} data-variant={variant}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/PullRequestLink", () => ({
  PullRequestLink: ({
    pullRequestNumber,
    pullRequestUrl,
    className,
  }: {
    pullRequestNumber?: number;
    pullRequestUrl: string;
    className?: string;
  }) => (
    <a
      className={className}
      data-component="PullRequestLink"
      data-pull-request-number={pullRequestNumber}
      href={pullRequestUrl}
    >
      {typeof pullRequestNumber === "number" ? `#${pullRequestNumber}` : "PR"}
    </a>
  ),
}));

import { FileViewPushActions } from "./FileViewPushActions";

describe("FileViewPushActions", () => {
  it("matches the default-branch draft and push snapshot", () => {
    const markup = renderToStaticMarkup(
      <FileViewPushActions
        canCreateDraftPullRequest
        draftButtonLabel="draft"
        hasChangesToCommit
        isCreatingDraftPullRequest={false}
        isPushing={false}
        onCreateDraftPullRequest={() => {}}
        onManualCommit={() => {}}
      />,
    );

    expect(markup).toMatchInlineSnapshot(
      `"<button class="h-6 px-2 text-xs border-sky-500 text-sky-700 hover:bg-sky-50" data-size="sm" data-variant="outline">draft</button><button class="h-6 px-2 text-xs bg-green-600 hover:bg-green-700 text-white" data-size="sm" data-variant="default">push</button>"`,
    );
  });

  it("matches the branch create-draft and push snapshot", () => {
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

    expect(markup).toMatchInlineSnapshot(
      `"<button class="h-6 px-2 text-xs border-sky-500 text-sky-700 hover:bg-sky-50" data-size="sm" data-variant="outline">create draft</button><button class="h-6 px-2 text-xs bg-green-600 hover:bg-green-700 text-white" data-size="sm" data-variant="default">push</button>"`,
    );
  });

  it("matches the existing PR and synced snapshot", () => {
    const markup = renderToStaticMarkup(
      <FileViewPushActions
        canCreateDraftPullRequest={false}
        currentPullRequestNumber={999}
        currentPullRequestUrl="https://github.com/noter-md/noter/pull/999"
        draftButtonLabel="create draft"
        hasChangesToCommit={false}
        isCreatingDraftPullRequest={false}
        isPushing={false}
        onCreateDraftPullRequest={() => {}}
        onManualCommit={() => {}}
      />,
    );

    expect(markup).toMatchInlineSnapshot(
      `"<a class="text-xs" data-component="PullRequestLink" data-pull-request-number="999" href="https://github.com/noter-md/noter/pull/999">#999</a><button class="h-6 px-2 text-xs border-green-500 text-green-600 hover:bg-green-50" disabled="" data-size="sm" data-variant="outline">All Synced</button>"`,
    );
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

    expect(markup).toMatchInlineSnapshot(
      `"<button class="h-6 px-2 text-xs border-sky-500 text-sky-700 hover:bg-sky-50" disabled="" data-size="sm" data-variant="outline">Creating...</button><button class="h-6 px-2 text-xs bg-green-600 hover:bg-green-700 text-white" disabled="" data-size="sm" data-variant="default">push</button>"`,
    );
  });
});
