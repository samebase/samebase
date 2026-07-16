import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { VaultSyncStatusContent } from "./VaultSyncStatus";

const now = Date.parse("2026-07-15T12:00:00Z");

describe("VaultSyncStatusContent", () => {
  it("renders the published inventory check summary without starting a second monitor", () => {
    const markup = renderToStaticMarkup(
      <VaultSyncStatusContent
        repositoryFullName="samebase/samebase"
        branch="feature/inventory"
        commitSha="1234567890abcdef1234567890abcdef12345678"
        checks={{
          state: "running",
          totalCount: 5,
          checkRunCount: 4,
          statusContextCount: 1,
          successCount: 3,
          failureCount: 0,
          runningCount: 2,
          neutralCount: 0,
          unknownCount: 0,
        }}
        stagedFiles={[]}
        now={now}
      />,
    );

    expect(markup).toContain(">2 pending<");
    expect(markup).toContain("5 checks total • 4 check runs • 1 status context");
    expect(markup).toContain(
      'href="https://github.com/samebase/samebase/commit/1234567890abcdef1234567890abcdef12345678/checks"',
    );
    expect(markup).not.toContain("Loading checks");
  });

  it("shows a completed zero-check inventory without a provider link", () => {
    const markup = renderToStaticMarkup(
      <VaultSyncStatusContent
        repositoryFullName="samebase/samebase"
        branch="main"
        commitSha="1234567890abcdef1234567890abcdef12345678"
        checks={{
          state: "success",
          totalCount: 0,
          checkRunCount: 0,
          statusContextCount: 0,
          successCount: 0,
          failureCount: 0,
          runningCount: 0,
          neutralCount: 0,
          unknownCount: 0,
        }}
        stagedFiles={[]}
        now={now}
      />,
    );

    expect(markup).toContain(">No checks<");
    expect(markup).not.toContain('/checks"');
  });

  it("keeps published checks and commit visible while the file tree synchronizes", () => {
    const markup = renderToStaticMarkup(
      <VaultSyncStatusContent
        repositoryFullName="renamed/repository"
        branch="main"
        commitSha="1234567890abcdef1234567890abcdef12345678"
        checks={{
          state: "success",
          totalCount: 1,
          checkRunCount: 1,
          statusContextCount: 0,
          successCount: 1,
          failureCount: 0,
          runningCount: 0,
          neutralCount: 0,
          unknownCount: 0,
        }}
        treeRefreshStartedAt={now - 5_000}
        lastTreeRefreshAt={now - 60_000}
        stagedFiles={[]}
        now={now}
      />,
    );

    expect(markup).toContain("Syncing…");
    expect(markup).toContain(">1 passed<");
    expect(markup).toContain(
      'href="https://github.com/renamed/repository/commit/1234567890abcdef1234567890abcdef12345678"',
    );
  });
});
