import { GitHubLogoIcon, ClockIcon } from "@/lib/radixIcons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/input";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useCacheQuery as useQuery } from "@/lib/convexQueryCache";
import {
  useAction,
  useMutation,
  useQuery as useConvexQuery,
} from "convex/react";
import { api } from "../../convex/_generated/api";
import { useQuery as useReactQuery } from "@tanstack/react-query";
import { useState, type ReactElement } from "react";
import { linkStyle } from "./styles";
import type { FunctionReturnType } from "convex/server";
import { isInIframe } from "@/authClient";
import { openGithubOAuthPopup } from "@/lib/githubOAuthFlow";
import {
  findRepositorySearchMatch,
  splitRepositoryFullNameMatch,
} from "@/lib/repositorySearch";
import { resolveDisplayedRepositories } from "@/lib/addRepositoryPicker";

type Repository = FunctionReturnType<
  typeof api.github.listRepositories
>[number];

const GITHUB_OAUTH_ORG_APPROVAL_DOCS_URL =
  "https://docs.github.com/en/organizations/managing-oauth-access-to-your-organizations-data/approving-oauth-apps-for-your-organization";
const GITHUB_OAUTH_MEMBER_REQUEST_DOCS_URL =
  "https://docs.github.com/en/account-and-profile/setting-up-and-managing-your-personal-account-on-github/managing-your-membership-in-organizations/requesting-organization-approval-for-oauth-apps";

export function AddRepository() {
  const location = useLocation();
  const navigate = useNavigate();
  const vaults = useQuery(api.vault.getUserVaults);
  const [searchQuery, setSearchQuery] = useState("");
  const [retryingFullRepositories, setRetryingFullRepositories] =
    useState(false);
  const listRepositoriesPreview = useAction(api.github.listRepositoriesPreview);
  const listRepositories = useAction(api.github.listRepositories);
  const connectRepository = useAction(api.vaultActions.connectRepository);
  const getGithubOAuthUrl = useMutation(api.githubOAuth.getGithubOAuthUrl);
  const githubConnection = useConvexQuery(api.users.getGithubConnectionStatus);
  const githubConnected = githubConnection?.connected === true;
  const [connectError, setConnectError] = useState<string | null>(null);

  const {
    data: repositoryPreview,
    isLoading: previewLoading,
    error: previewQueryError,
  } = useReactQuery({
    queryKey: ["github-repositories-preview"],
    queryFn: async () => {
      return await listRepositoriesPreview();
    },
    enabled: githubConnected,
  });

  // Keep the fast preview and the full discovery scan separate so /add can
  // paint recent repositories immediately without regressing eventual search completeness.
  const {
    data: fullRepositories,
    error: fullQueryError,
    refetch: refetchFullRepositories,
    fetchStatus: fullRepositoriesFetchStatus,
    isFetchedAfterMount: fullRepositoriesFetchedAfterMount,
  } = useReactQuery({
    queryKey: ["github-repositories"],
    queryFn: async () => {
      return await listRepositories();
    },
    enabled: githubConnected && repositoryPreview?.hasMore === true,
  });

  const hasFreshFullRepositories =
    repositoryPreview?.hasMore === true &&
    fullRepositoriesFetchedAfterMount &&
    fullQueryError == null;
  const repositories = resolveDisplayedRepositories({
    githubConnected,
    repositoryPreview,
    fullRepositories,
    hasFreshFullRepositories,
  });
  const loading = previewLoading;
  // Until the full query succeeds, every search result is still partial even
  // though the first page is already interactive.
  const hasPartialResults =
    githubConnected &&
    repositoryPreview?.hasMore === true &&
    !hasFreshFullRepositories;
  const loadingMore =
    hasPartialResults && fullRepositoriesFetchStatus === "fetching";
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

  const error =
    connectError ??
    (previewQueryError
      ? previewQueryError instanceof Error
        ? previewQueryError.message
        : "Failed to fetch repositories"
      : null);

  const formatTimeAgo = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (minutes < 60) {
      return `${minutes}m ago`;
    } else if (hours < 24) {
      return `${hours}h ago`;
    } else {
      return `${days}d ago`;
    }
  };

  const renderHighlightedText = (
    target: string,
    matchedIndices: number[],
  ): ReactElement => {
    if (matchedIndices.length === 0) {
      return <span>{target}</span>;
    }
    const targetOriginal = target.split("");

    // Build highlighted JSX
    const elements: ReactElement[] = [];
    let lastIndex = 0;

    matchedIndices.forEach((index, i) => {
      // Add non-highlighted text before this match
      if (index > lastIndex) {
        elements.push(
          <span key={`text-${i}`}>
            {targetOriginal.slice(lastIndex, index).join("")}
          </span>,
        );
      }

      // Add highlighted character
      elements.push(
        <mark key={`mark-${i}`} className="bg-yellow-200">
          {targetOriginal[index]}
        </mark>,
      );

      lastIndex = index + 1;
    });

    // Add remaining text
    if (lastIndex < targetOriginal.length) {
      elements.push(
        <span key="text-end">{targetOriginal.slice(lastIndex).join("")}</span>,
      );
    }

    return <span>{elements}</span>;
  };

  const connectedVaults = vaults || [];

  const filteredRepositories = repositories.flatMap((repo: Repository) => {
    const isConnected = connectedVaults.some(
      (vault: (typeof connectedVaults)[number]) =>
        vault.repositoryFullName === repo.full_name,
    );
    if (isConnected) {
      return [];
    }

    const searchMatch = findRepositorySearchMatch(searchQuery, repo);
    if (searchMatch === null) {
      return [];
    }

    return [{ repo, searchMatch }];
  });

  return (
    <div className="container flex min-h-0 flex-1 flex-col py-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 flex-shrink-0">
        <div className="flex items-center gap-2">
          <GitHubLogoIcon className="h-5 w-5 sm:h-6 sm:w-6" />
          <h1 className="text-xl sm:text-2xl font-semibold">
            Connect an existing repository
          </h1>
        </div>
        <Button variant="outline" asChild className="shrink-0">
          <Link to="/">
            <span className="sm:hidden">Back</span>
            <span className="hidden sm:inline">Back to Vaults</span>
          </Link>
        </Button>
      </div>

      {error && (
        <div className="mb-4 p-4 text-sm text-red-600 bg-red-50 corner-notch-1 border border-red-200 flex-shrink-0">
          {error}
        </div>
      )}

      {!githubConnected && (
        <div className="mb-6 corner-notch-1 border border-border bg-background p-4">
          <div className="text-sm font-medium">GitHub connection required</div>
          <p className="mt-1 text-sm text-muted-foreground">
            Connect GitHub to list your repositories.
          </p>
          <Button
            className="mt-3"
            onClick={() => {
              void (async () => {
                setConnectError(null);
                try {
                  const oauthUrl = await getGithubOAuthUrl({
                    returnToPath: location.href,
                  });
                  if (isInIframe()) {
                    const popup = openGithubOAuthPopup(oauthUrl);
                    if (popup) {
                      return;
                    }
                  }
                  window.location.assign(oauthUrl);
                } catch (connectGithubError) {
                  setConnectError(
                    connectGithubError instanceof Error
                      ? connectGithubError.message
                      : "Failed to start GitHub OAuth",
                  );
                }
              })();
            }}
          >
            Connect GitHub
          </Button>
        </div>
      )}

      <div className="mb-6 flex-shrink-0">
        <Input
          placeholder="Search repositories..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-md"
          disabled={!githubConnected}
        />
        {githubConnected && (
          <>
            <p className="mt-2 max-w-2xl text-xs text-muted-foreground">
              Missing a private org repo? GitHub may be blocking Noter's OAuth
              app. If you're an org owner, approve Noter in the org's Settings,
              then Third-party Access, then OAuth app policy. Otherwise request
              access from GitHub's Authorized OAuth Apps page if GitHub offers
              that option, or ask an org owner to approve Noter.{" "}
              <a
                href={GITHUB_OAUTH_ORG_APPROVAL_DOCS_URL}
                target="_blank"
                rel="noreferrer"
                className={linkStyle}
              >
                Owner docs
              </a>{" "}
              /{" "}
              <a
                href={GITHUB_OAUTH_MEMBER_REQUEST_DOCS_URL}
                target="_blank"
                rel="noreferrer"
                className={linkStyle}
              >
                Member docs
              </a>
            </p>

            {showBackgroundError && (
              <div className="mt-3 flex max-w-2xl items-center justify-between gap-3 border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 corner-notch-1">
                <div>
                  Couldn&apos;t load the rest of your repositories. You&apos;re
                  still seeing the most recently updated ones.
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-amber-300 bg-transparent"
                  onClick={() => {
                    setRetryingFullRepositories(true);
                    void refetchFullRepositories().finally(() => {
                      setRetryingFullRepositories(false);
                    });
                  }}
                  disabled={retryingFullRepositories}
                >
                  {retryingFullRepositories ? "Retrying..." : "Retry"}
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {githubConnected && loading && repositories.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-muted-foreground">Loading repositories...</div>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredRepositories.map(({ repo, searchMatch }) => {
              const ownerName = repo.full_name.split("/")[0];
              const repoName = repo.name;
              let ownerHighlight = <span>{ownerName}</span>;
              let repoHighlight = <span>{repoName}</span>;
              let slashHighlighted = false;

              if (searchMatch.kind === "owner") {
                ownerHighlight = renderHighlightedText(
                  ownerName,
                  searchMatch.indices,
                );
              } else if (searchMatch.kind === "repo") {
                repoHighlight = renderHighlightedText(
                  repoName,
                  searchMatch.indices,
                );
              } else if (searchMatch.kind === "full_name") {
                const fullNameMatch = splitRepositoryFullNameMatch({
                  ownerName,
                  indices: searchMatch.indices,
                });
                ownerHighlight = renderHighlightedText(
                  ownerName,
                  fullNameMatch.ownerIndices,
                );
                repoHighlight = renderHighlightedText(
                  repoName,
                  fullNameMatch.repoIndices,
                );
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
                        <span
                          className={`text-sm text-muted-foreground ${linkStyle}`}
                        >
                          {ownerHighlight}
                          {slashHighlighted ? (
                            <mark className="bg-yellow-200">/</mark>
                          ) : (
                            "/"
                          )}
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
                        onClick={() => {
                          void connectRepository({
                            repositoryFullName: repo.full_name,
                          })
                            .then((val) => {
                              console.log(val);
                              void navigate({ to: "/" });
                            })
                            .catch((err) => {
                              console.error(err);
                            });
                        }}
                      >
                        Connect
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}

            {loadingMore && filteredRepositories.length > 0 && (
              <div className="py-4 text-center text-sm text-muted-foreground">
                Showing the {repositoryPreview.repositories.length} most
                recently updated repositories while we load the rest. Search
                results stay partial until loading finishes.
              </div>
            )}
          </div>
        )}

        {filteredRepositories.length === 0 &&
          !loading &&
          !error &&
          repositories.length > 0 &&
          emptyRepositoryMessage !== null &&
          githubConnected && (
            <div className="text-center py-8">
              <div className="text-muted-foreground">
                {emptyRepositoryMessage}
              </div>
            </div>
          )}

        {repositories.length === 0 && !loading && !error && githubConnected && (
          <div className="text-center py-8">
            <div className="text-muted-foreground">No repositories found</div>
          </div>
        )}
      </div>
    </div>
  );
}
