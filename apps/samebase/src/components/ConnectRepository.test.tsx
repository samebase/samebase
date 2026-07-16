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
    connectingRepositoryFullName: null,
    directRepositoryFullName: null,
    emptyRepositoryMessage: null,
    error: null,
    githubConnected: true,
    loading: false,
    repositoryRows: [],
    searchQuery: "",
    onConnectGithub: noop,
    onConnectRepository: noop,
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
  it("renders the disconnected GitHub state from the shipped page content", () => {
    const markup = renderConnectRepositoryContent({
      githubConnected: false,
    });

    expect(markup).toContain("Connect an existing repository");
    expect(markup).not.toContain("Back to Vaults");
    expect(markup).toContain("GitHub connection required");
    expect(markup).toContain("Connect GitHub to list your repositories.");
    expect(markup).toContain("Search or enter owner/repo...");
    expect(markup).not.toContain("Owner docs");
  });

  it("renders the repository preview without background scan state", () => {
    const firstRepository = buildRepository(1, "samebase/samebase");
    const secondRepository = buildRepository(2, "samebase/starter-kit");

    const markup = renderConnectRepositoryContent({
      githubConnected: true,
      repositoryRows: [
        buildRepositoryRow(firstRepository, ""),
        buildRepositoryRow(secondRepository, ""),
      ],
    });

    expect(markup).toContain("Owner docs");
    expect(markup).toContain("Member docs");
    expect(markup).toContain("Review GitHub access");
    expect(markup).toContain("to check granted scopes and repository listing");
    expect(markup).not.toContain("load the rest");
    expect(markup).not.toContain("Retry");
    expect(markup).toContain("samebase");
    expect(markup).toContain("samebase");
    expect(markup).toContain("starter-kit");
  });

  it("renders an in-button pending state for the connecting repository", () => {
    const repository = buildRepository(1, "samebase/samebase");

    const markup = renderConnectRepositoryContent({
      connectingRepositoryFullName: repository.full_name,
      repositoryRows: [buildRepositoryRow(repository, "")],
    });

    expect(markup).toContain("Connecting...");
    expect(markup).toContain("disabled");
  });

  it("offers an exact public repository that is absent from the preview", () => {
    const markup = renderConnectRepositoryContent({
      directRepositoryFullName: "facebook/react",
      githubConnected: true,
      repositoryRows: [],
      searchQuery: "facebook/react",
    });

    expect(markup).toContain("facebook/");
    expect(markup).toContain("react");
    expect(markup).toContain("Connect");
    expect(markup).not.toContain("No preview repositories match");
  });

  it("keeps the loading state and stays silent for default empty content", () => {
    const loadingMarkup = renderConnectRepositoryContent({
      githubConnected: true,
      loading: true,
      repositoryRows: [],
    });
    const emptyMarkup = renderConnectRepositoryContent({
      githubConnected: true,
      repositoryRows: [],
    });

    expect(loadingMarkup).toContain("Loading repositories...");
    expect(emptyMarkup).not.toContain("No repositories found");
  });
});
