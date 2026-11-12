import { Button } from "@/components/ui/button";
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

/**
The diff size is also the link to the pull request's changes in Samebase, so the row needs no
separate edit button. Without file access, or for a fork, it stays plain text.
*/
function PullRequestDiffStats({
  changesHref,
  pullRequest,
}: {
  changesHref: string | null;
  pullRequest: RepositoryPullRequest;
}) {
  // One inline run, so a link underline continues under the spaces between the numbers.
  const stats = (
    <span>
      <span className="text-emerald-600">+{numberFormatter.format(pullRequest.additions)}</span>{" "}
      <span className="text-destructive">−{numberFormatter.format(pullRequest.deletions)}</span>{" "}
      <span className="text-muted-foreground">
        {numberFormatter.format(pullRequest.changedFiles)}{" "}
        {pullRequest.changedFiles === 1 ? "file" : "files"}
      </span>
    </span>
  );
  return changesHref ? (
    <Link
      className="inline-flex min-h-10 items-center text-xs tabular-nums underline decoration-border underline-offset-4 hover:decoration-foreground @4xl:min-h-8"
      search={{ compare: true }}
      title="View this pull request's changes in Samebase"
      to={changesHref}
    >
      {stats}
    </Link>
  ) : (
    <span className="inline-flex min-h-10 items-center text-xs tabular-nums @4xl:min-h-8">
      {stats}
    </span>
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
  const changesHref =
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

  return (
    <article
      className="border-b border-border py-2 last:border-b-0"
      data-pull-request-number={pullRequest.number}
    >
      {/* Same shape as the main branch row: branch and time on top, checks at the right. */}
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-x-3">
        <div className="flex min-w-0 flex-[1_1_6rem] flex-wrap gap-x-2.5 text-xs leading-5 text-muted-foreground">
          {/* Most pull requests target the default branch, so only another base is named. */}
          <span className="[overflow-wrap:anywhere]">
            {headLabel}
            {pullRequest.baseRefName === repository.defaultBranch
              ? null
              : ` → ${pullRequest.baseRefName}`}
          </span>
          <span>{updatedLabel}</span>
        </div>
        <RepositoryChecksPopover
          checks={pullRequest.checks}
          detailsUrl={`${pullRequest.url}/checks`}
          heading={`Pull request #${pullRequest.number} checks`}
          statusCheckRollup={pullRequest.statusCheckRollup}
          triggerTitle={`Show pull request #${pullRequest.number} checks`}
        />
      </div>
      {/* The number is inline text in the title's size, so it lines up with the title, and one
      link underlines both from the row's left edge. */}
      <p className="text-sm font-medium leading-5 [overflow-wrap:anywhere]">
        <a
          className="text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
          href={pullRequest.url}
          rel="noreferrer noopener"
          target="_blank"
          title="Open on GitHub"
        >
          <span className="font-normal text-muted-foreground tabular-nums">
            #{pullRequest.number}
          </span>{" "}
          {pullRequest.title}
        </a>
      </p>
      <div className="flex min-w-0 items-center gap-2">
        <div className="min-w-0 flex-1">
          <PullRequestDiffStats changesHref={changesHref} pullRequest={pullRequest} />
        </div>
        {/* The negative margin puts the arrow on the right edge, where the main branch checks end. */}
        <button
          aria-controls={detailsId}
          aria-expanded={expanded}
          aria-label={
            expanded
              ? `Hide pull request #${pullRequest.number} details`
              : `Show pull request #${pullRequest.number} details`
          }
          className="-mr-3 inline-flex h-10 w-10 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground @4xl:-mr-2 @4xl:h-8 @4xl:w-8"
          type="button"
          onClick={() => setExpanded((current) => !current)}
        >
          <ChevronDown aria-hidden="true" className={expanded ? "h-4 w-4 rotate-180" : "h-4 w-4"} />
        </button>
      </div>
      {expanded ? (
        <div id={detailsId} className="pb-2">
          {pullRequest.isDraft || pullRequest.labels.length > 0 ? (
            <div className="mb-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {pullRequest.isDraft ? <span className="bg-muted px-1.5 py-0.5">Draft</span> : null}
              {pullRequest.labels.map((label) => (
                <span key={label.name} className="bg-muted px-1.5 py-0.5 text-foreground">
                  {label.name}
                </span>
              ))}
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
