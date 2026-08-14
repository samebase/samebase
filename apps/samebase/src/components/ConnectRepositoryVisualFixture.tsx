import {
  ConnectRepositoryPageContent,
  type ConnectRepositoryRepository,
} from "@/components/ConnectRepository";
import { findRepositorySearchMatch } from "@/lib/repositorySearch";

export type ConnectRepositoryVisualMode =
  | "connect-repository-loading-more"
  | "connect-repository-provider-blocked";

const repositories = [
  {
    id: 1,
    name: "app",
    owner: { id: 10, login: "acme" },
    full_name: "acme/app",
    html_url: "https://github.com/acme/app",
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
    name: "docs",
    owner: { id: 10, login: "acme" },
    full_name: "acme/docs",
    html_url: "https://github.com/acme/docs",
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

export function ConnectRepositoryVisualFixture({ mode }: { mode: ConnectRepositoryVisualMode }) {
  const repositoryRows = repositories.map((repo) => {
    const searchMatch = findRepositorySearchMatch("", repo);
    if (searchMatch === null) {
      throw new Error(`Expected ${repo.full_name} to match an empty repository search.`);
    }

    return { repo, searchMatch };
  });

  return (
    <ConnectRepositoryPageContent
      canConnectRepositories={mode !== "connect-repository-provider-blocked"}
      connectingRepositoryFullName={null}
      emptyRepositoryMessage={null}
      error={null}
      loading={false}
      loadingMore={mode === "connect-repository-loading-more"}
      repositoryPreviewCount={10}
      repositoryRows={repositoryRows}
      repositoryTotalCount={repositories.length}
      providerDestinationsLoaded
      retryingFullRepositories={false}
      searchQuery=""
      showBackgroundError={false}
      onConnectRepository={() => {}}
      onRetryFullRepositories={() => {}}
      onSearchQueryChange={() => {}}
    />
  );
}
