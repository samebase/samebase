import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { TestRouterProvider } from "@/test/TestRouterProvider";

vi.mock("@/components/CommitStatus", () => ({
  CommitStatus({
    owner,
    repo,
    commitSha,
    displayMode,
    retryEmptyResults,
  }: {
    owner: string;
    repo: string;
    commitSha?: string;
    displayMode?: "full" | "badgesOnly";
    retryEmptyResults?: boolean;
  }) {
    return (
      <span
        data-testid="commit-status"
        data-owner={owner}
        data-repo={repo}
        data-commit-sha={commitSha}
        data-display-mode={displayMode}
        data-retry-empty-results={
          retryEmptyResults === undefined ? "unset" : String(retryEmptyResults)
        }
      />
    );
  },
}));

import { VaultBranchLinkRow } from "./VaultDashboard";

describe("VaultBranchLinkRow", () => {
  it("renders dashboard commit checks quietly when enabled", () => {
    const markup = renderToStaticMarkup(
      <TestRouterProvider>
        <VaultBranchLinkRow
          repositoryFullName="octo/repo"
          branchName="codex/dashboard-checks"
          headCommitSha="1234567890abcdef1234567890abcdef12345678"
          isDefault={false}
          isDeletedUpstream={false}
          aheadBy={1}
          behindBy={0}
          showCommitChecks
          canDeleteBranch={false}
          isDeletingBranch={false}
          onDeleteBranch={() => {}}
        />
      </TestRouterProvider>,
    );

    expect(markup).toContain('data-testid="commit-status"');
    expect(markup).toContain('data-owner="octo"');
    expect(markup).toContain('data-repo="repo"');
    expect(markup).toContain(
      'data-commit-sha="1234567890abcdef1234567890abcdef12345678"',
    );
    expect(markup).toContain('data-display-mode="badgesOnly"');
    expect(markup).toContain('data-retry-empty-results="false"');
  });

  it("leaves fixture-style branch rows without check hooks by default", () => {
    const markup = renderToStaticMarkup(
      <TestRouterProvider>
        <VaultBranchLinkRow
          repositoryFullName="octo/repo"
          branchName="main"
          headCommitSha="1234567890abcdef1234567890abcdef12345678"
          isDefault={true}
          isDeletedUpstream={false}
          aheadBy={0}
          behindBy={0}
          canDeleteBranch={false}
          isDeletingBranch={false}
          onDeleteBranch={() => {}}
        />
      </TestRouterProvider>,
    );

    expect(markup).not.toContain('data-testid="commit-status"');
  });
});
