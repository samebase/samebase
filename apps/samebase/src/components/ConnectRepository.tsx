import { GitHubLogoIcon, ClockIcon } from "@/lib/radixIcons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useAction, useMutation, useQuery as useConvexQuery } from "convex/react";
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
  type RepositorySearchMatch,
} from "@/lib/repositorySearch";
import { queueExistingRepositoryAndNavigateToDashboard } from "@/lib/existingRepositoryConnectHandoff";
import { PROVIDERS_ROUTE } from "@/lib/providersRoute";
import { tryParseRepositoryFullName } from "../../shared/repoName";

type Repository = FunctionReturnType<typeof api.github.listRepositoriesPreview>[number];

export type ConnectRepositoryRepository = Repository;

type ConnectRepositoryRow = {
  repo: Repository;
  searchMatch: RepositorySearchMatch;
};

type ConnectRepositoryPageContentProps = {
  connectingRepositoryFullName: string | null;
  directRepositoryFullName: string | null;
  emptyRepositoryMessage: string | null;
  error: string | null;
  githubConnected: boolean;
  loading: boolean;
  repositoryRows: ConnectRepositoryRow[];
  searchQuery: string;
  onConnectGithub: () => void;
  onConnectRepository: (repositoryFullName: string) => void;
  onSearchQueryChange: (value: string) => void;
};

const GITHUB_OAUTH_ORG_APPROVAL_DOCS_URL =
  "https://docs.github.com/en/organizations/managing-oauth-access-to-your-organizations-data/approving-oauth-apps-for-your-organization";
const GITHUB_OAUTH_MEMBER_REQUEST_DOCS_URL =
  "https://docs.github.com/en/account-and-profile/setting-up-and-managing-your-personal-account-on-github/managing-your-membership-in-organizations/requesting-organization-approval-for-oauth-apps";

function getCurrentRootRelativeUrl(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
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

export function ConnectRepository() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const listRepositoriesPreview = useAction(api.github.listRepositoriesPreview);
  const connectRepository = useAction(api.vault.actions.connectRepository);
  const getGithubOAuthUrl = useMutation(api.githubOAuth.getGithubOAuthUrl);
  const githubConnection = useConvexQuery(api.users.getGithubConnectionStatus);
  const githubConnected = githubConnection?.connected === true;
  const [connectError, setConnectError] = useState<string | null>(null);
  const [connectingRepositoryFullName, setConnectingRepositoryFullName] = useState<string | null>(
    null,
  );

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
  const repositories = githubConnected ? (repositoryPreview ?? []) : [];
  const hasSearchQuery = searchQuery.trim().length > 0;
  const exactRepository = tryParseRepositoryFullName(searchQuery.trim());
  const exactRepositoryFullName =
    exactRepository === null ? null : `${exactRepository.owner}/${exactRepository.name}`;
  const previewContainsExactRepository =
    exactRepositoryFullName !== null &&
    repositories.some(
      (repository) => repository.full_name.toLowerCase() === exactRepositoryFullName.toLowerCase(),
    );
  const directRepositoryCandidate =
    githubConnected && !previewContainsExactRepository ? exactRepositoryFullName : null;
  const membershipInputs = [
    ...repositories.map((repository) => ({
      githubRepositoryId: repository.id,
      repositoryFullName: repository.full_name,
    })),
    ...(directRepositoryCandidate === null
      ? []
      : [
          {
            githubRepositoryId: null,
            repositoryFullName: directRepositoryCandidate,
          },
        ]),
  ];
  const repositoryMemberships = useConvexQuery(
    api.vault.dashboard.getRepositoryConnectionMemberships,
    githubConnected && membershipInputs.length > 0 ? { repositories: membershipInputs } : "skip",
  );
  const membershipLoading = membershipInputs.length > 0 && repositoryMemberships === undefined;
  const loading = previewLoading || membershipLoading;
  const exactRepositoryConnected =
    exactRepositoryFullName !== null &&
    repositoryMemberships?.some(
      (membership) =>
        membership.repositoryFullName.toLowerCase() === exactRepositoryFullName.toLowerCase() &&
        membership.connected,
    ) === true;
  const directRepositoryFullName = exactRepositoryConnected ? null : directRepositoryCandidate;
  const emptyRepositoryMessage = exactRepositoryConnected
    ? "Repository is already connected"
    : hasSearchQuery
      ? "No preview repositories match"
      : null;

  const error =
    connectError ??
    (previewQueryError
      ? previewQueryError instanceof Error
        ? previewQueryError.message
        : "Failed to fetch repositories"
      : null);

  const filteredRepositories = repositories.flatMap((repo: Repository) => {
    if (
      repositoryMemberships?.some(
        (membership) => membership.repositoryFullName === repo.full_name && membership.connected,
      ) === true
    ) {
      return [];
    }

    const searchMatch = findRepositorySearchMatch(searchQuery, repo);
    if (searchMatch === null) {
      return [];
    }

    return [{ repo, searchMatch }];
  });

  const connectGithub = () => {
    void (async () => {
      setConnectError(null);
      try {
        const oauthUrl = await getGithubOAuthUrl({
          returnToPath: getCurrentRootRelativeUrl(),
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
  };

  const connectSelectedRepository = (repositoryFullName: string) => {
    if (connectingRepositoryFullName !== null) {
      return;
    }

    void (async () => {
      setConnectError(null);
      setConnectingRepositoryFullName(repositoryFullName);
      try {
        await queueExistingRepositoryAndNavigateToDashboard({
          connectRepository,
          repositoryFullName,
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
      directRepositoryFullName={directRepositoryFullName}
      emptyRepositoryMessage={emptyRepositoryMessage}
      error={error}
      githubConnected={githubConnected}
      loading={loading}
      repositoryRows={filteredRepositories}
      searchQuery={searchQuery}
      onConnectGithub={connectGithub}
      onConnectRepository={connectSelectedRepository}
      onSearchQueryChange={setSearchQuery}
    />
  );
}

export function ConnectRepositoryPageContent({
  connectingRepositoryFullName,
  directRepositoryFullName,
  emptyRepositoryMessage,
  error,
  githubConnected,
  loading,
  repositoryRows,
  searchQuery,
  onConnectGithub,
  onConnectRepository,
  onSearchQueryChange,
}: ConnectRepositoryPageContentProps) {
  return (
    <div className="container flex min-h-0 flex-1 flex-col py-6">
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

      {!githubConnected && (
        <div className="mb-6 corner-notch-1 border border-border bg-background p-4">
          <div className="text-sm font-medium">GitHub connection required</div>
          <p className="mt-1 text-sm text-muted-foreground">
            Connect GitHub to list your repositories.
          </p>
          <Button className="mt-3" onClick={onConnectGithub}>
            Connect GitHub
          </Button>
        </div>
      )}

      <div className="mb-6 flex-shrink-0">
        <Input
          placeholder="Search or enter owner/repo..."
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
          className="max-w-md"
          disabled={!githubConnected}
        />
        {githubConnected && (
          <>
            <p className="mt-2 max-w-2xl text-xs text-muted-foreground">
              Missing a private org repo?{" "}
              <Link to={PROVIDERS_ROUTE} className={linkStyle}>
                Review GitHub access
              </Link>{" "}
              to check granted scopes and repository listing. GitHub org policy can still block
              Samebase even when the token has the right scopes. If you're an org owner, approve
              Samebase in the org's Settings, then Third-party Access, then OAuth app policy.
              Otherwise request access from GitHub's Authorized OAuth Apps page if GitHub offers
              that option, or ask an org owner to approve Samebase.{" "}
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
          </>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {githubConnected && loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-muted-foreground">Loading repositories...</div>
          </div>
        ) : (
          <div className="space-y-2">
            {directRepositoryFullName !== null && (
              <div className="flex items-center justify-between p-4 border corner-notch-1 hover:bg-muted/50 transition-colors">
                <div className="min-w-0">
                  <div className="text-sm text-muted-foreground">
                    {directRepositoryFullName.split("/")[0]}/
                  </div>
                  <div className="font-semibold truncate">
                    {directRepositoryFullName.split("/")[1]}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onConnectRepository(directRepositoryFullName)}
                  disabled={connectingRepositoryFullName !== null}
                >
                  {connectingRepositoryFullName === directRepositoryFullName
                    ? "Connecting..."
                    : "Connect"}
                </Button>
              </div>
            )}
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
                        onClick={() => onConnectRepository(repo.full_name)}
                        disabled={connectingRepositoryFullName !== null}
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
          </div>
        )}

        {repositoryRows.length === 0 &&
          directRepositoryFullName === null &&
          !loading &&
          !error &&
          emptyRepositoryMessage !== null &&
          githubConnected && (
            <div className="text-center py-8">
              <div className="text-muted-foreground">{emptyRepositoryMessage}</div>
            </div>
          )}
      </div>
    </div>
  );
}
