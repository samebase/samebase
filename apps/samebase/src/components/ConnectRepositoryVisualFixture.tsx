import {
  ConnectRepositoryPageContent,
  type ConnectRepositoryRepository,
} from "@/components/ConnectRepository";
import { findRepositorySearchMatch } from "@/lib/repositorySearch";

export type ConnectRepositoryVisualMode = "connect-repository-loading-more";

const repositories = [
  {
    id: 1,
    name: "samebase",
    full_name: "samebase/samebase",
    html_url: "https://github.com/samebase/samebase",
    description: null,
    private: true,
    fork: false,
    created_at: "2026-03-01T00:00:00Z",
    updated_at: "2026-08-02T12:00:00Z",
    language: "TypeScript",
    stargazers_count: 0,
    forks_count: 0,
  },
  {
    id: 2,
    name: "starter-kit",
    full_name: "samebase/starter-kit",
    html_url: "https://github.com/samebase/starter-kit",
    description: null,
    private: true,
    fork: false,
    created_at: "2026-02-01T00:00:00Z",
    updated_at: "2026-07-30T12:00:00Z",
    language: "TypeScript",
    stargazers_count: 0,
    forks_count: 0,
  },
] satisfies ConnectRepositoryRepository[];

export function ConnectRepositoryVisualFixture() {
  const repositoryRows = repositories.map((repo) => {
    const searchMatch = findRepositorySearchMatch("", repo);
    if (searchMatch === null) {
      throw new Error(`Expected ${repo.full_name} to match an empty repository search.`);
    }

    return { repo, searchMatch };
  });

  return (
    <ConnectRepositoryPageContent
      connectingRepositoryFullName={null}
      emptyRepositoryMessage={null}
      error={null}
      loading={false}
      loadingMore
      repositoryPreviewCount={10}
      repositoryRows={repositoryRows}
      repositoryTotalCount={repositories.length}
      retryingFullRepositories={false}
      searchQuery=""
      showBackgroundError={false}
      onConnectRepository={() => {}}
      onRetryFullRepositories={() => {}}
      onSearchQueryChange={() => {}}
    />
  );
}
