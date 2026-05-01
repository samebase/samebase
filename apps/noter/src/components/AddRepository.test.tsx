import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import { findRepositorySearchMatch } from "@/lib/repositorySearch";
import { TestRouterProvider } from "@/test/TestRouterProvider";
import {
  AddRepositoryPageContent,
  type AddRepositoryRepository,
} from "./AddRepository";

type AddRepositoryPageContentProps = Parameters<
  typeof AddRepositoryPageContent
>[0];

const noop = () => {};

function buildRepository(
  id: number,
  fullName: string,
): AddRepositoryRepository {
  const slashIndex = fullName.indexOf("/");
  if (slashIndex === -1) {
    throw new Error(`Invalid repository full name: ${fullName}`);
  }

  const repoName = fullName.slice(slashIndex + 1);

  return {
    id,
    name: repoName,
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

function buildRepositoryRow(
  repository: AddRepositoryRepository,
  searchQuery: string,
) {
  const searchMatch = findRepositorySearchMatch(searchQuery, repository);
  if (searchMatch === null) {
    throw new Error(`${repository.full_name} does not match ${searchQuery}`);
  }

  return {
    repo: repository,
    searchMatch,
  };
}

function renderAddRepositoryContent(
  overrides: Partial<AddRepositoryPageContentProps>,
) {
  const props: AddRepositoryPageContentProps = {
    emptyRepositoryMessage: null,
    error: null,
    githubConnected: true,
    loading: false,
    loadingMore: false,
    repositoryPreviewCount: 0,
    repositoryRows: [],
    repositoryTotalCount: 0,
    retryingFullRepositories: false,
    searchQuery: "",
    showBackgroundError: false,
    onConnectGithub: noop,
    onConnectRepository: noop,
    onRetryFullRepositories: noop,
    onSearchQueryChange: noop,
    ...overrides,
  };

  const markup = renderToStaticMarkup(
    <TestRouterProvider initialEntries={["/add"]}>
      <AddRepositoryPageContent {...props} />
    </TestRouterProvider>,
  );

  return markup.split("&#x27;").join("'").split("&amp;").join("&");
}

describe("AddRepositoryPageContent", () => {
  it("renders the disconnected GitHub state from the shipped page content", () => {
    const markup = renderAddRepositoryContent({
      githubConnected: false,
    });

    expect(markup).toContain("Connect an existing repository");
    expect(markup).toContain("GitHub connection required");
    expect(markup).toContain("Connect GitHub to list your repositories.");
    expect(markup).toContain("Search repositories...");
    expect(markup).not.toContain("Owner docs");
  });

  it("renders partial repository discovery with retry copy and real rows", () => {
    const firstRepository = buildRepository(1, "noter-md/noter");
    const secondRepository = buildRepository(2, "noter-md/starter-kit");

    const markup = renderAddRepositoryContent({
      githubConnected: true,
      loadingMore: true,
      repositoryPreviewCount: 10,
      repositoryRows: [
        buildRepositoryRow(firstRepository, ""),
        buildRepositoryRow(secondRepository, ""),
      ],
      repositoryTotalCount: 2,
      showBackgroundError: true,
    });

    expect(markup).toContain("Owner docs");
    expect(markup).toContain("Member docs");
    expect(markup).toContain(
      "Showing the 10 most recently updated repositories while we load the rest.",
    );
    expect(markup).toContain(
      "Couldn't load the rest of your repositories. You're still seeing the most recently updated ones.",
    );
    expect(markup).toContain("Retry");
    expect(markup).toContain("noter-md");
    expect(markup).toContain("noter");
    expect(markup).toContain("starter-kit");
  });

  it("renders the search-empty background failure message", () => {
    const markup = renderAddRepositoryContent({
      emptyRepositoryMessage:
        "Couldn't finish loading the rest of your repositories. Retry to finish your search.",
      githubConnected: true,
      repositoryRows: [],
      repositoryTotalCount: 3,
      searchQuery: "transferred",
      showBackgroundError: true,
    });

    expect(markup).toContain(
      "Couldn't finish loading the rest of your repositories. Retry to finish your search.",
    );
  });

  it("keeps the loading and empty states in the production content", () => {
    const loadingMarkup = renderAddRepositoryContent({
      githubConnected: true,
      loading: true,
      repositoryRows: [],
      repositoryTotalCount: 0,
    });
    const emptyMarkup = renderAddRepositoryContent({
      githubConnected: true,
      repositoryRows: [],
      repositoryTotalCount: 0,
    });

    expect(loadingMarkup).toContain("Loading repositories...");
    expect(emptyMarkup).toContain("No repositories found");
  });
});
