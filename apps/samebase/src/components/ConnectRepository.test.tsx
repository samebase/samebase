import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import { findRepositorySearchMatch } from "@/lib/repositorySearch";
import { TestRouterProvider } from "@/test/TestRouterProvider";
import { parseRepositoryFullName } from "../../shared/repoName";
import {
  ConnectRepositoryPageContent,
  type ConnectRepositoryRepository,
} from "./ConnectRepository";

type ConnectRepositoryPageContentProps = Parameters<typeof ConnectRepositoryPageContent>[0];

const noop = () => {};

function buildRepository(id: number, fullName: string): ConnectRepositoryRepository {
  const { name } = parseRepositoryFullName(fullName);

  return {
    id,
    name,
    full_name: fullName,
    html_url: `https://github.com/${fullName}`,
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

function buildRepositoryRow(repository: ConnectRepositoryRepository, searchQuery: string) {
  const searchMatch = findRepositorySearchMatch(searchQuery, repository);
  if (searchMatch === null) {
    throw new Error(`${repository.full_name} does not match ${searchQuery}`);
  }

  return {
    repo: repository,
    searchMatch,
  };
}

function renderConnectRepositoryContent(overrides: Partial<ConnectRepositoryPageContentProps>) {
  const props: ConnectRepositoryPageContentProps = {
    canListRepositories: true,
    connectingRepositoryFullName: null,
    emptyRepositoryMessage: null,
    error: null,
    githubOwners: [],
    githubOwnersLoaded: false,
    installingGitHubApp: false,
    loading: false,
    loadingMore: false,
    repositoryPreviewCount: 0,
    repositoryRows: [],
    repositoryTotalCount: 0,
    retryingFullRepositories: false,
    searchQuery: "",
    selectedOrganizationId: null,
    showBackgroundError: false,
    onConnectRepository: noop,
    onInstallGitHubApp: noop,
    onOrganizationChange: noop,
    onRetryFullRepositories: noop,
    onSearchQueryChange: noop,
    ...overrides,
  };

  const markup = renderToStaticMarkup(
    <TestRouterProvider initialEntries={["/connect-repo"]}>
      <ConnectRepositoryPageContent {...props} />
    </TestRouterProvider>,
  );

  return markup.split("&#x27;").join("'").split("&amp;").join("&");
}

describe("ConnectRepositoryPageContent", () => {
  it("offers GitHub App installation when the user has no GitHub owners", () => {
    const markup = renderConnectRepositoryContent({
      canListRepositories: false,
      githubOwnersLoaded: true,
    });

    expect(markup).toContain("Connect an existing repository");
    expect(markup).not.toContain("Back to Vaults");
    expect(markup).toContain("Install GitHub App");
    expect(markup).not.toContain("Search repositories...");
  });

  it("renders partial repository discovery with retry copy and real rows", () => {
    const firstRepository = buildRepository(1, "samebase/samebase");
    const secondRepository = buildRepository(2, "samebase/starter-kit");

    const markup = renderConnectRepositoryContent({
      loadingMore: true,
      repositoryPreviewCount: 10,
      repositoryRows: [
        buildRepositoryRow(firstRepository, ""),
        buildRepositoryRow(secondRepository, ""),
      ],
      repositoryTotalCount: 2,
      showBackgroundError: true,
    });

    expect(markup).toContain(
      "Showing the 10 most recently updated repositories while we load the rest.",
    );
    expect(markup).toContain(
      "Couldn't load the rest of your repositories. You're still seeing the most recently updated ones.",
    );
    expect(markup).toContain("Retry");
    expect(markup).toContain("samebase");
    expect(markup).toContain("samebase");
    expect(markup).toContain("starter-kit");
    expect(markup).toContain('data-testid="connect-repository-loading-more"');
    expect(markup).toContain('role="status"');
    expect(markup).toContain("Loading more repositories...");
    expect(markup.indexOf("Loading more repositories...")).toBeGreaterThan(
      markup.indexOf("starter-kit"),
    );
  });

  it("renders an in-button pending state for the connecting repository", () => {
    const repository = buildRepository(1, "samebase/samebase");

    const markup = renderConnectRepositoryContent({
      connectingRepositoryFullName: repository.full_name,
      repositoryRows: [buildRepositoryRow(repository, "")],
      repositoryTotalCount: 1,
    });

    expect(markup).toContain("Connecting...");
    expect(markup).toContain("disabled");
    expect(markup).not.toContain("Loading more repositories...");
  });

  it("renders the search-empty background failure message", () => {
    const markup = renderConnectRepositoryContent({
      emptyRepositoryMessage:
        "Couldn't finish loading the rest of your repositories. Retry to finish your search.",
      repositoryRows: [],
      repositoryTotalCount: 3,
      searchQuery: "transferred",
      showBackgroundError: true,
    });

    expect(markup).toContain(
      "Couldn't finish loading the rest of your repositories. Retry to finish your search.",
    );
  });

  it("keeps the loading state and stays silent for default empty content", () => {
    const loadingMarkup = renderConnectRepositoryContent({
      loading: true,
      repositoryRows: [],
      repositoryTotalCount: 0,
    });
    const emptyMarkup = renderConnectRepositoryContent({
      repositoryRows: [],
      repositoryTotalCount: 0,
    });

    expect(loadingMarkup).toContain("Loading repositories...");
    expect(emptyMarkup).not.toContain("No repositories found");
  });
});
