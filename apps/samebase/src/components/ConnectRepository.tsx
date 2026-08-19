import { GitHubLogoIcon, ClockIcon } from "@/lib/radixIcons";
import type { ViewerOrganization } from "@/lib/organizationContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useCacheQuery as useQuery } from "@/lib/convexQueryCache";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useQuery as useReactQuery } from "@tanstack/react-query";
import { useState, type ReactElement } from "react";
import { linkStyle } from "./styles";
import type { FunctionReturnType } from "convex/server";
import {
  findRepositorySearchMatch,
  splitRepositoryFullNameMatch,
  type RepositorySearchMatch,
} from "@/lib/repositorySearch";
import {
  isGitHubRepositoryConnected,
  resolveDisplayedRepositories,
} from "@/lib/connectRepositoryPicker";
import { queueExistingRepositoryAndNavigateToDashboard } from "@/lib/existingRepositoryConnectHandoff";
import { Loader2 } from "lucide-react";

type Repository = FunctionReturnType<typeof api.github.listRepositories>[number];

export type ConnectRepositoryRepository = Repository;

type ConnectRepositoryRow = {
  repo: Repository;
  searchMatch: RepositorySearchMatch;
};

type ConnectRepositoryPageContentProps = {
  connectingRepositoryFullName: string | null;
  emptyRepositoryMessage: string | null;
  error: string | null;
  loading: boolean;
  loadingMore: boolean;
  githubUnavailable: boolean;
  repositoryPreviewCount: number;
  repositoryRows: ConnectRepositoryRow[];
  repositoryTotalCount: number;
  retryingFullRepositories: boolean;
  searchQuery: string;
  showBackgroundError: boolean;
  onConnectRepository: (repository: Repository) => void;
  onRetryFullRepositories: () => void;
  onSearchQueryChange: (value: string) => void;
};

const githubUnavailableError = "GitHub App installation is not connected.";

function isGitHubUnavailable(error: string | null): boolean {
  return error?.includes(githubUnavailableError) ?? false;
}

function formatTimeAgo(timestamp: number) {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  if (hours < 24) {
    return `${hours}h ago`;
  }

  return `${days}d ago`;
}

function renderHighlightedText(target: string, matchedIndices: number[]): ReactElement {
  if (matchedIndices.length === 0) {
    return <span>{target}</span>;
  }
  const targetOriginal = target.split("");
  const elements: ReactElement[] = [];
  let lastIndex = 0;

  matchedIndices.forEach((index, i) => {
    if (index > lastIndex) {
      elements.push(
        <span key={`text-${i}`}>{targetOriginal.slice(lastIndex, index).join("")}</span>,
      );
    }

    elements.push(
      <mark key={`mark-${i}`} className="bg-yellow-200">
        {targetOriginal[index]}
      </mark>,
    );

    lastIndex = index + 1;
  });

  if (lastIndex < targetOriginal.length) {
    elements.push(<span key="text-end">{targetOriginal.slice(lastIndex).join("")}</span>);
  }

  return <span>{elements}</span>;
}

export function ConnectRepository({ organization }: { organization: ViewerOrganization }) {
  const location = useLocation();
  const navigate = useNavigate();
  const vaults = useQuery(api.vault.dashboard.getUserVaults);
  const [searchQuery, setSearchQuery] = useState("");
  const [retryingFullRepositories, setRetryingFullRepositories] = useState(false);
  const listRepositoriesPreview = useAction(api.github.listRepositoriesPreview);
  const listRepositories = useAction(api.github.listRepositories);
  const connectRepository = useAction(api.vault.actions.connectRepository);
  const organizationId = organization.organizationId;
  const [connectError, setConnectError] = useState<string | null>(null);
  const [connectingRepositoryFullName, setConnectingRepositoryFullName] = useState<string | null>(
    null,
  );

  const {
    data: repositoryPreview,
    isLoading: previewLoading,
    error: previewQueryError,
  } = useReactQuery({
    queryKey: ["github-repositories-preview", organizationId],
    queryFn: async () => await listRepositoriesPreview({ organizationId }),
  });

  // Keep the fast preview and the full discovery scan separate so /connect-repo can
  // paint recent repositories immediately without regressing eventual search completeness.
  const {
    data: fullRepositories,
    error: fullQueryError,
    refetch: refetchFullRepositories,
    fetchStatus: fullRepositoriesFetchStatus,
    isFetchedAfterMount: fullRepositoriesFetchedAfterMount,
  } = useReactQuery({
    queryKey: ["github-repositories", organizationId],
    queryFn: async () => await listRepositories({ organizationId }),
    enabled: repositoryPreview?.hasMore === true,
  });

  const hasFreshFullRepositories =
    repositoryPreview?.hasMore === true &&
    fullRepositoriesFetchedAfterMount &&
    fullQueryError == null;
  const repositories = resolveDisplayedRepositories({
    githubConnected: true,
    repositoryPreview,
    fullRepositories,
    hasFreshFullRepositories,
  });
  const loading = previewLoading;
  // Until the full query succeeds, every search result is still partial even
  // though the first page is already interactive.
  const hasPartialResults = repositoryPreview?.hasMore === true && !hasFreshFullRepositories;
  const loadingMore = hasPartialResults && fullRepositoriesFetchStatus === "fetching";
  const hasSearchQuery = searchQuery.trim().length > 0;
  const showBackgroundError =
    hasPartialResults && (fullQueryError != null || retryingFullRepositories);
  const emptyRepositoryMessage =
    showBackgroundError && !retryingFullRepositories
      ? hasSearchQuery
        ? "Couldn't finish loading the rest of your repositories. Retry to finish your search."
        : "Couldn't finish loading the rest of your repositories."
      : hasPartialResults
        ? hasSearchQuery
          ? "Loading more repositories to finish your search..."
          : "Loading more repositories..."
        : hasSearchQuery
          ? "No repositories match your search"
          : null;

  const previewError =
    previewQueryError === null
      ? null
      : previewQueryError instanceof Error
        ? previewQueryError.message
        : "Failed to fetch repositories";
  const githubUnavailable = isGitHubUnavailable(connectError) || isGitHubUnavailable(previewError);
  const error = githubUnavailable ? null : (connectError ?? previewError);

  const connectedVaults = vaults || [];

  const filteredRepositories = repositories.flatMap((repo: Repository) => {
    if (isGitHubRepositoryConnected({ repository: repo, vaults: connectedVaults })) {
      return [];
    }

    const searchMatch = findRepositorySearchMatch(searchQuery, repo);
    if (searchMatch === null) {
      return [];
    }

    return [{ repo, searchMatch }];
  });

  const retryFullRepositories = () => {
    setRetryingFullRepositories(true);
    void refetchFullRepositories().finally(() => {
      setRetryingFullRepositories(false);
    });
  };

  const connectSelectedRepository = (repository: Repository) => {
    if (connectingRepositoryFullName !== null || githubUnavailable) {
      return;
    }

    void (async () => {
      setConnectError(null);
      setConnectingRepositoryFullName(repository.full_name);
      try {
        await queueExistingRepositoryAndNavigateToDashboard({
          connectRepository: async (args) => {
            return await connectRepository({
              organizationId,
              ghRepoId: args.ghRepoId,
            });
          },
          ghRepoId: String(repository.id),
          search: location.search,
          navigateByHref: async (href) => {
            await navigate({ href });
          },
        });
      } catch (connectRepositoryError) {
        setConnectError(
          connectRepositoryError instanceof Error
            ? connectRepositoryError.message
            : "Failed to connect repository",
        );
      } finally {
        setConnectingRepositoryFullName(null);
      }
    })();
  };

  return (
    <ConnectRepositoryPageContent
      connectingRepositoryFullName={connectingRepositoryFullName}
      emptyRepositoryMessage={emptyRepositoryMessage}
      error={error}
      loading={loading}
      loadingMore={loadingMore}
      githubUnavailable={githubUnavailable}
      repositoryPreviewCount={repositoryPreview?.repositories.length ?? 0}
      repositoryRows={filteredRepositories}
      repositoryTotalCount={repositories.length}
      retryingFullRepositories={retryingFullRepositories}
      searchQuery={searchQuery}
      showBackgroundError={showBackgroundError}
      onConnectRepository={connectSelectedRepository}
      onRetryFullRepositories={retryFullRepositories}
      onSearchQueryChange={setSearchQuery}
    />
  );
}

export function ConnectRepositoryPageContent({
  connectingRepositoryFullName,
  emptyRepositoryMessage,
  error,
  loading,
  loadingMore,
  githubUnavailable,
  repositoryPreviewCount,
  repositoryRows,
  repositoryTotalCount,
  retryingFullRepositories,
  searchQuery,
  showBackgroundError,
  onConnectRepository,
  onRetryFullRepositories,
  onSearchQueryChange,
}: ConnectRepositoryPageContentProps) {
  return (
    <div
      data-testid="connect-repository-page"
      className="container flex min-h-0 flex-1 flex-col py-6"
    >
      <div className="flex flex-col @2xl:flex-row @2xl:items-center @2xl:justify-between gap-4 mb-6 flex-shrink-0">
        <div className="flex items-center gap-2">
          <GitHubLogoIcon className="h-5 w-5 @2xl:h-6 @2xl:w-6" />
          <h1 className="text-xl @2xl:text-2xl font-semibold">Connect an existing repository</h1>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 text-sm text-red-600 bg-red-50 corner-notch-1 border border-red-200 flex-shrink-0">
          {error}
        </div>
      )}

      {githubUnavailable ? (
        <div className="mb-4 max-w-md text-sm text-muted-foreground">
          Connect GitHub in Providers before connecting a repository.
        </div>
      ) : null}
      <div className="mb-6 flex-shrink-0">
        <Input
          placeholder="Search repositories..."
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.target.value)}
          className="max-w-md"
        />
        {loadingMore && (
          <p className="mt-2 max-w-2xl text-xs text-muted-foreground">
            Showing {repositoryPreviewCount} repositories while we load the rest. Search results
            stay partial until loading finishes.
          </p>
        )}

        {showBackgroundError && (
          <div className="mt-3 flex max-w-2xl items-center justify-between gap-3 border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 corner-notch-1">
            <div>
              Couldn&apos;t load the rest of your repositories. You&apos;re still seeing the loaded
              preview.
            </div>
            <Button
              variant="outline"
              size="sm"
              className="border-amber-300 bg-transparent"
              onClick={onRetryFullRepositories}
              disabled={retryingFullRepositories}
            >
              {retryingFullRepositories ? "Retrying..." : "Retry"}
            </Button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && repositoryTotalCount === 0 ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-muted-foreground">Loading repositories...</div>
          </div>
        ) : (
          <div className="space-y-2">
            {repositoryRows.map(({ repo, searchMatch }) => {
              const ownerName = repo.full_name.split("/")[0];
              const repoName = repo.name;
              let ownerHighlight = <span>{ownerName}</span>;
              let repoHighlight = <span>{repoName}</span>;
              let slashHighlighted = false;

              if (searchMatch.kind === "owner") {
                ownerHighlight = renderHighlightedText(ownerName, searchMatch.indices);
              } else if (searchMatch.kind === "repo") {
                repoHighlight = renderHighlightedText(repoName, searchMatch.indices);
              } else if (searchMatch.kind === "full_name") {
                const fullNameMatch = splitRepositoryFullNameMatch({
                  ownerName,
                  indices: searchMatch.indices,
                });
                ownerHighlight = renderHighlightedText(ownerName, fullNameMatch.ownerIndices);
                repoHighlight = renderHighlightedText(repoName, fullNameMatch.repoIndices);
                slashHighlighted = fullNameMatch.slashMatched;
              }

              return (
                <div
                  key={repo.id}
                  className="flex items-center justify-between p-4 border corner-notch-1 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col items-start">
                        <span className={`text-sm text-muted-foreground ${linkStyle}`}>
                          {ownerHighlight}
                          {slashHighlighted ? <mark className="bg-yellow-200">/</mark> : "/"}
                        </span>
                        <h3 className="font-semibold truncate">
                          <span className={linkStyle}>{repoHighlight}</span>
                        </h3>
                      </div>
                    </div>

                    <div className="flex flex-col items-end text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <ClockIcon className="h-3 w-3" />
                        <span className="text-xs">
                          {formatTimeAgo(new Date(repo.updated_at).getTime())}
                        </span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2"
                        onClick={() => onConnectRepository(repo)}
                        disabled={connectingRepositoryFullName !== null || githubUnavailable}
                      >
                        {connectingRepositoryFullName === repo.full_name
                          ? "Connecting..."
                          : "Connect"}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}

            {loadingMore && repositoryRows.length > 0 ? (
              <div
                data-testid="connect-repository-loading-more"
                role="status"
                aria-live="polite"
                className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground"
              >
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                Loading more repositories...
              </div>
            ) : null}
          </div>
        )}

        {repositoryRows.length === 0 &&
          !loading &&
          !error &&
          repositoryTotalCount > 0 &&
          emptyRepositoryMessage !== null && (
            <div className="text-center py-8">
              <div className="text-muted-foreground">{emptyRepositoryMessage}</div>
            </div>
          )}
      </div>
    </div>
  );
}
