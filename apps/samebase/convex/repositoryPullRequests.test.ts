import { describe, expect, it } from "vite-plus/test";

import { normalizeGitHubPullRequestPage } from "./repositoryPullRequests";

function providerPage() {
  return {
    repository: {
      id: "R_base",
      databaseId: 123,
      nameWithOwner: "samebase/samebase",
      pullRequests: {
        totalCount: 1,
        pageInfo: { hasNextPage: true, endCursor: "cursor-1" },
        nodes: [
          {
            id: "PR_1",
            number: 1,
            title: "Keep provider truth",
            url: "https://github.com/samebase/samebase/pull/1",
            isDraft: false,
            isCrossRepository: false,
            additions: 4,
            deletions: 2,
            changedFiles: 3,
            updatedAt: "2026-07-21T10:00:00Z",
            baseRefName: "main",
            headRefName: "feature/provider-truth",
            headRefOid: "abc123",
            headRepository: {
              id: "R_base",
              nameWithOwner: "samebase/samebase",
              owner: { login: "samebase" },
            },
            labels: { nodes: [{ name: "product", color: "1a7f37" }] },
            commits: {
              nodes: [
                {
                  commit: {
                    oid: "abc123",
                    statusCheckRollup: {
                      state: "SUCCESS",
                      contexts: {
                        totalCount: 1,
                        checkRunCount: 1,
                        statusContextCount: 0,
                        checkRunCountsByState: [{ state: "SUCCESS", count: 1 }],
                        statusContextCountsByState: [],
                      },
                    },
                  },
                },
              ],
            },
          },
        ],
      },
    },
  };
}

describe("normalizeGitHubPullRequestPage", () => {
  it("keeps the provider page and cursor shape", () => {
    expect(normalizeGitHubPullRequestPage(providerPage())).toEqual({
      repository: {
        id: "R_base",
        databaseId: 123,
        nameWithOwner: "samebase/samebase",
        pullRequests: {
          totalCount: 1,
          pageInfo: { hasNextPage: true, endCursor: "cursor-1" },
          nodes: [
            expect.objectContaining({
              id: "PR_1",
              number: 1,
              headRefName: "feature/provider-truth",
              headRefOid: "abc123",
              labels: { nodes: [{ name: "product", color: "1a7f37" }] },
              statusCheckRollup: expect.objectContaining({ state: "SUCCESS" }),
            }),
          ],
        },
      },
    });
  });

  it("preserves GitHub's null repository result", () => {
    expect(normalizeGitHubPullRequestPage({ repository: null })).toEqual({ repository: null });
  });

  it("rejects a latest commit from another head generation", () => {
    const value = providerPage();
    value.repository.pullRequests.nodes[0].commits.nodes[0].commit.oid = "new-head";
    expect(() => normalizeGitHubPullRequestPage(value)).toThrow(
      "GitHub did not return the pull request head commit.",
    );
  });
});
