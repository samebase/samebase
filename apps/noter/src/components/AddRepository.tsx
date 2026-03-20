import { GitHubLogoIcon, ClockIcon } from "@radix-ui/react-icons";
import { Button } from "@/components/button";
import { Input } from "@/components/input";
import { Link, useNavigate } from "react-router-dom";
import { useCacheQuery as useQuery } from "@/lib/convexQueryCache";
import {
  useAction,
  useMutation,
  useQuery as useConvexQuery,
} from "convex/react";
import { api } from "../../convex/_generated/api";
import { useQuery as useReactQuery } from "@tanstack/react-query";
import { useState } from "react";
import { linkStyle } from "./styles";
import type { FunctionReturnType } from "convex/server";
import { isInIframe } from "@/authClient";
import {
  findRepositorySearchMatch,
  splitRepositoryFullNameMatch,
} from "@/lib/repositorySearch";

type Repository = FunctionReturnType<
  typeof api.github.listRepositories
>[number];

export function AddRepository() {
  const navigate = useNavigate();
  const vaults = useQuery(api.vault.getUserVaults);
  const [searchQuery, setSearchQuery] = useState("");
  const listRepositories = useAction(api.github.listRepositories);
  const connectRepository = useAction(api.vaultActions.connectRepository);
  const getGithubOAuthUrl = useMutation(api.githubOAuth.getGithubOAuthUrl);
  const githubConnection = useConvexQuery(api.users.getGithubConnectionStatus);
  const githubConnected = githubConnection?.connected === true;
  const [connectError, setConnectError] = useState<string | null>(null);

  const {
    data: repositories = [],
    isLoading: loading,
    error: queryError,
    refetch: _refetch,
  } = useReactQuery({
    queryKey: ["github-repositories"],
    queryFn: async () => {
      return await listRepositories();
    },
    enabled: githubConnected,
  });

  const error =
    connectError ??
    (queryError
      ? queryError instanceof Error
        ? queryError.message
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
  ): JSX.Element => {
    if (matchedIndices.length === 0) {
      return <span>{target}</span>;
    }
    const targetOriginal = target.split("");

    // Build highlighted JSX
    const elements: JSX.Element[] = [];
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
    <div className="container py-6 h-screen flex flex-col">
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
                  const oauthUrl = await getGithubOAuthUrl();
                  if (isInIframe()) {
                    const popup = window.open(
                      oauthUrl,
                      "github-oauth",
                      "width=600,height=700,popup=true",
                    );
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
                              void navigate("/");
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
          </div>
        )}

        {filteredRepositories.length === 0 &&
          !loading &&
          !error &&
          repositories.length > 0 &&
          githubConnected && (
            <div className="text-center py-8">
              <div className="text-muted-foreground">
                No repositories match your search
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
