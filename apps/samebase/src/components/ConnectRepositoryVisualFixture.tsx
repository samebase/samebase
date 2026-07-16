import {
  ConnectRepositoryPageContent,
  type ConnectRepositoryRepository,
} from "@/components/ConnectRepository";
import { findRepositorySearchMatch } from "@/lib/repositorySearch";

export type ConnectRepositoryVisualMode = "connect-repository-exact-public";

const SEARCH_QUERY = "samebase/samebase";
const PREVIEW_REPOSITORY_NAMES = [
  "samebase-starter",
  "samebase-docs",
  "samebase-examples",
  "samebase-cli",
  "samebase-app",
  "samebase-template",
  "samebase-components",
  "samebase-labs",
  "samebase-sdk",
  "samebase-cloudflare",
] as const;

function buildPreviewRepository(
  name: (typeof PREVIEW_REPOSITORY_NAMES)[number],
  index: number,
): ConnectRepositoryRepository {
  const fullName = `samebase/${name}`;
  const now = Date.now();

  return {
    id: 1_000 + index,
    name,
    full_name: fullName,
    html_url: `https://github.com/${fullName}`,
    description: null,
    private: false,
    fork: false,
    created_at: new Date(now - (index + 40) * 24 * 60 * 60 * 1_000).toISOString(),
    updated_at: new Date(now - (index + 1) * 60 * 60 * 1_000).toISOString(),
    language: "TypeScript",
    stargazers_count: 0,
    forks_count: 0,
  };
}

const repositoryRows = PREVIEW_REPOSITORY_NAMES.flatMap((name, index) => {
  const repo = buildPreviewRepository(name, index);
  const searchMatch = findRepositorySearchMatch(SEARCH_QUERY, repo);

  return searchMatch === null ? [] : [{ repo, searchMatch }];
});

export function ConnectRepositoryVisualFixture() {
  return (
    <ConnectRepositoryPageContent
      connectingRepositoryFullName={null}
      directRepositoryFullName={SEARCH_QUERY}
      emptyRepositoryMessage={null}
      error={null}
      githubConnected
      loading={false}
      repositoryRows={repositoryRows}
      searchQuery={SEARCH_QUERY}
      onConnectGithub={() => {}}
      onConnectRepository={() => {}}
      onSearchQueryChange={() => {}}
    />
  );
}
