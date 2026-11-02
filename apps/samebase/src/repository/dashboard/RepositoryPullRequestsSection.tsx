import { Button } from "@/components/ui/button";
import {
  GitHubProviderLogo,
  SamebaseLogoMark,
} from "@/components/repository-dashboard/RepositoryDashboardLogos";
import { RepositoryChecksPopover } from "@/repository/dashboard/RepositoryChecksPopover";
import {
  PullRequestResources,
  RepositoryOverviewLoadingLines,
} from "@/repository/dashboard/RepositoryEnvironmentTree";
import type {
  PullRequestResourceState,
  RepositoryPullRequest,
  RepositoryPullRequestLoadMoreState,
  RepositoryPullRequestsState,
} from "@/repository/dashboard/useRepositoryPullRequests";
import { formatRelativeTimeAgo } from "@/lib/formatRelativeTime";
import { buildRepositoryFileRoute } from "@/lib/repositoryRoutes";
import { Link } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { UserRepositoryResult } from "../../../convex/repository/contracts/getUserRepositories";

const numberFormatter = new Intl.NumberFormat("en-US");

function SamebaseChangesLink({ href }: { href: string }) {
  return (
    <Link
      className="inline-flex min-h-10 items-center gap-1 font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground @4xl:min-h-8"
      title="View this branch's changes in Samebase"
      to={href}
    >
      <span aria-hidden="true" className="flex h-4 w-4 items-center justify-center">
        <SamebaseLogoMark />
      </span>
      View changes
    </Link>
  );
}

function PullRequestRow({
  filesReadEnabled,
  pullRequest,
  resource,
  repository,
}: {
  filesReadEnabled: boolean;
  pullRequest: RepositoryPullRequest;
  resource: PullRequestResourceState | undefined;
  repository: UserRepositoryResult;
}) {
  const [expanded, setExpanded] = useState(false);
  const sameRepository = !pullRequest.isCrossRepository && pullRequest.headRepository !== null;
  const samebaseUrl =
    filesReadEnabled && sameRepository
      ? buildRepositoryFileRoute({
          owner: repository.githubOwnerLogin,
          repoName: repository.githubRepositoryName,
          branch: pullRequest.headRefName,
        })
      : null;
  const headLabel =
    pullRequest.isCrossRepository && pullRequest.headRepository
      ? `${pullRequest.headRepository.nameWithOwner}:${pullRequest.headRefName}`
      : pullRequest.headRefName;
  const updatedAt = Date.parse(pullRequest.updatedAt);
  const updatedLabel = Number.isFinite(updatedAt)
    ? formatRelativeTimeAgo(updatedAt)
    : pullRequest.updatedAt;
  const detailsId = `pull-request-${pullRequest.number}-details`;
  const hasExpandedMetadata =
    pullRequest.isDraft || pullRequest.labels.length > 0 || samebaseUrl !== null;

  return (
    <article
      className="border-b border-border last:border-b-0"
      data-pull-request-number={pullRequest.number}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start">
        <div className="grid min-w-0 @4xl:grid-cols-[minmax(0,1fr)_auto] @4xl:items-start">
          <button
            aria-controls={detailsId}
            aria-expanded={expanded}
            className="min-w-0 pt-4 pr-1 pb-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 @4xl:py-4"
            type="button"
            onClick={() => setExpanded((current) => !current)}
          >
            <span className="line-clamp-3 text-sm font-medium leading-5 text-foreground [overflow-wrap:anywhere]">
              {pullRequest.title}
            </span>
            <span className="mt-1 block text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]">
              {headLabel}
            </span>
            <span className="block text-xs leading-5 text-muted-foreground">
              {updatedLabel} into {pullRequest.baseRefName}
            </span>
          </button>
          <div className="flex min-w-0 items-center justify-between gap-3 pb-4 @4xl:py-4 @4xl:pl-3">
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
              <RepositoryChecksPopover
                checks={pullRequest.checks}
                detailsUrl={`${pullRequest.url}/checks`}
                heading={`Pull request #${pullRequest.number} checks`}
                statusCheckRollup={pullRequest.statusCheckRollup}
                triggerTitle={`Show pull request #${pullRequest.number} checks`}
              />
              <span className="flex flex-wrap gap-x-2 text-xs leading-5 tabular-nums">
                <span className="text-emerald-600">
                  +{numberFormatter.format(pullRequest.additions)}
                </span>
                <span className="text-destructive">
                  −{numberFormatter.format(pullRequest.deletions)}
                </span>
                <span className="text-muted-foreground">
                  {numberFormatter.format(pullRequest.changedFiles)}{" "}
                  {pullRequest.changedFiles === 1 ? "file" : "files"}
                </span>
              </span>
            </div>
            <Button
              aria-controls={detailsId}
              aria-expanded={expanded}
              aria-label={
                expanded
                  ? `Hide pull request #${pullRequest.number} details`
                  : `Show pull request #${pullRequest.number} details`
              }
              className="size-10 @4xl:size-8"
              size="icon-sm"
              type="button"
              variant="ghost"
              onClick={() => setExpanded((current) => !current)}
            >
              <ChevronDown
                className={
                  expanded
                    ? "h-4 w-4 rotate-180 text-muted-foreground"
                    : "h-4 w-4 text-muted-foreground"
                }
              />
            </Button>
          </div>
        </div>
        <a
          aria-label={`Open pull request #${pullRequest.number} on GitHub`}
          className="mt-2 inline-flex min-h-8 items-center gap-1.5 px-2 text-xs font-medium text-muted-foreground no-underline hover:bg-muted hover:text-foreground hover:no-underline"
          href={pullRequest.url}
          rel="noreferrer noopener"
          target="_blank"
        >
          <span>#{pullRequest.number}</span>
          <span aria-hidden="true" className="flex h-4 w-4 items-center justify-center">
            <GitHubProviderLogo />
          </span>
        </a>
      </div>
      {expanded ? (
        <div id={detailsId} className="pb-4">
          {hasExpandedMetadata ? (
            <div className="mb-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {pullRequest.isDraft ? <span className="bg-muted px-1.5 py-0.5">Draft</span> : null}
              {pullRequest.labels.map((label) => (
                <span key={label.name} className="bg-muted px-1.5 py-0.5 text-foreground">
                  {label.name}
                </span>
              ))}
              {samebaseUrl ? <SamebaseChangesLink href={samebaseUrl} /> : null}
            </div>
          ) : null}
          <PullRequestResources resource={resource} />
        </div>
      ) : null}
    </article>
  );
}

export function PullRequestsSection({
  filesReadEnabled,
  pullRequests,
  repository,
}: {
  filesReadEnabled: boolean;
  pullRequests: RepositoryPullRequestsState;
  repository: UserRepositoryResult;
}) {
  if (pullRequests.state === "not_requested") {
    return null;
  }

  return (
    <section aria-labelledby="repository-pull-requests-heading">
      <h2
        id="repository-pull-requests-heading"
        className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground"
      >
        {pullRequests.state === "current" || pullRequests.state === "stale"
          ? pullRequests.openPullRequestCount === 0
            ? "No open pull requests"
            : `${pullRequests.openPullRequestCount} open ${pullRequests.openPullRequestCount === 1 ? "pull request" : "pull requests"}`
          : "Open pull requests"}
      </h2>
      <div className="border-t border-border">
        {pullRequests.state === "loading" ? (
          <div className="px-1 py-4">
            <RepositoryOverviewLoadingLines />
          </div>
        ) : pullRequests.state === "problem" ? (
          <div className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm text-muted-foreground">
            <span>Could not load pull requests from GitHub.</span>
            <Button size="sm" type="button" variant="outline" onClick={pullRequests.reload}>
              Retry
            </Button>
          </div>
        ) : (
          <>
            {pullRequests.allPullRequests.map((pullRequest) => (
              <PullRequestRow
                filesReadEnabled={filesReadEnabled}
                key={pullRequest.id}
                pullRequest={pullRequest}
                resource={pullRequests.resourcesByPullRequestId.get(pullRequest.id)}
                repository={repository}
              />
            ))}
            <RepositoryPullRequestLoadMore state={pullRequests.loadMore} />
          </>
        )}
      </div>
    </section>
  );
}

function RepositoryPullRequestLoadMore({ state }: { state: RepositoryPullRequestLoadMoreState }) {
  switch (state.state) {
    case "available":
      return <RepositoryPullRequestLoadMoreSentinel loadMore={state.load} />;
    case "loading":
      return <div className="py-3 text-xs text-muted-foreground">Loading more</div>;
    case "failed":
      return (
        <div className="py-3 text-xs text-muted-foreground">Could not load more pull requests.</div>
      );
    case "exhausted":
      return null;
  }
}

function RepositoryPullRequestLoadMoreSentinel({ loadMore }: { loadMore: () => void }) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) {
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        loadMore();
      }
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore]);

  return (
    <div
      ref={sentinelRef}
      aria-hidden="true"
      className="h-4"
      data-pull-request-load-more-sentinel=""
    />
  );
}
