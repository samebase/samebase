import { describe, expect, it } from "vite-plus/test";

import { parseRepositoryFullName } from "../../shared/repoName";
import { resolveDisplayedRepositories } from "./connectRepositoryPicker";

function buildRepository(id: number, fullName: string) {
  const { owner, name } = parseRepositoryFullName(fullName);

  return {
    id,
    name,
    full_name: fullName,
    html_url: `https://github.com/${owner}/${name}`,
    description: null,
    private: true,
    fork: false,
    created_at: "2026-03-01T00:00:00Z",
    updated_at: "2026-03-10T00:00:00Z",
    language: "TypeScript",
    stargazers_count: 0,
    forks_count: 0,
  };
}

describe("resolveDisplayedRepositories", () => {
  it("prefers preview repositories when the preview is already complete", () => {
    const previewRepositories = [buildRepository(1, "owner/preview-repo")];
    const staleFullRepositories = [buildRepository(2, "owner/stale-full-repo")];

    expect(
      resolveDisplayedRepositories({
        githubConnected: true,
        repositoryPreview: {
          repositories: previewRepositories,
          hasMore: false,
        },
        fullRepositories: staleFullRepositories,
        hasFreshFullRepositories: false,
      }),
    ).toEqual(previewRepositories);
  });

  it("switches to the full repository scan once background loading finishes", () => {
    const previewRepositories = [buildRepository(1, "owner/preview-repo")];
    const fullRepositories = [
      buildRepository(1, "owner/preview-repo"),
      buildRepository(2, "owner/full-repo"),
    ];

    expect(
      resolveDisplayedRepositories({
        githubConnected: true,
        repositoryPreview: {
          repositories: previewRepositories,
          hasMore: true,
        },
        fullRepositories,
        hasFreshFullRepositories: true,
      }),
    ).toEqual(fullRepositories);
  });

  it("falls back to preview repositories while the full scan is still pending", () => {
    const previewRepositories = [buildRepository(1, "owner/preview-repo")];

    expect(
      resolveDisplayedRepositories({
        githubConnected: true,
        repositoryPreview: {
          repositories: previewRepositories,
          hasMore: true,
        },
        fullRepositories: undefined,
        hasFreshFullRepositories: false,
      }),
    ).toEqual(previewRepositories);
  });

  it("ignores cached full repositories until the current background scan succeeds", () => {
    const previewRepositories = [buildRepository(1, "owner/preview-repo")];
    const staleFullRepositories = [buildRepository(2, "owner/stale-full-repo")];

    expect(
      resolveDisplayedRepositories({
        githubConnected: true,
        repositoryPreview: {
          repositories: previewRepositories,
          hasMore: true,
        },
        fullRepositories: staleFullRepositories,
        hasFreshFullRepositories: false,
      }),
    ).toEqual(previewRepositories);
  });

  it("returns an empty list when GitHub is disconnected", () => {
    expect(
      resolveDisplayedRepositories({
        githubConnected: false,
        repositoryPreview: undefined,
        fullRepositories: [buildRepository(1, "owner/ignored-repo")],
        hasFreshFullRepositories: true,
      }),
    ).toEqual([]);
  });
});
