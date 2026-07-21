import { linkStyle } from "@/components/styles";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CloudflareProviderLogo,
  ConvexProviderLogo,
  PullRequestStateLogo,
  SamebaseLogoMark,
} from "@/components/vault-dashboard/VaultDashboardLogos";
import {
  buildPullRequestLabelStyle,
  normalizePullRequestLabelColor,
} from "@/lib/pullRequestLabels";
import type {
  PullRequestResourceState,
  VaultPullRequest,
  VaultPullRequestsState,
} from "@/hooks/useVaultPullRequests";
import { useRouter } from "@tanstack/react-router";
import { clsx } from "clsx";
import {
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleDot,
  CircleX,
  GitBranch,
  Loader2,
} from "lucide-react";
import type { PullRequestWorkerResource } from "../../../convex/vault/pullRequestResources";

type PullRequest = VaultPullRequest;
type PullRequestChecks = PullRequest["checks"];

export type VaultPullRequestListProps = {
  buildSamebaseUrl: (branchName: string) => string | null;
  pullRequests: VaultPullRequestsState;
  repositoryFullName: string;
};

const numberFormatter = new Intl.NumberFormat("en-US");
const metadataLinkClassName = clsx(
  "-mx-1.5 inline-flex min-h-8 items-center gap-1.5 rounded-sm px-1.5 font-mono text-sm underline decoration-muted-foreground/40 underline-offset-4 transition-colors",
  linkStyle,
);

function SamebaseLink({ href }: { href: string }) {
  const router = useRouter();

  return (
    <a
      href={href}
      onClick={(event) => {
        if (
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }
        event.preventDefault();
        void router.navigate({ href });
      }}
      className={metadataLinkClassName}
      title="View this branch's changes in Samebase"
    >
      <SamebaseLogoMark />
      View changes
    </a>
  );
}

function checksLabel(checks: PullRequestChecks): string {
  switch (checks.state) {
    case "none":
      return "No checks";
    case "success":
      return checks.neutralCount > 0
        ? `${checks.successCount} passed · ${checks.neutralCount} neutral`
        : `${checks.successCount} passed`;
    case "failure":
      return `${checks.failureCount} failed`;
    case "running":
      return `${checks.runningCount} pending`;
    case "neutral":
      return `${checks.neutralCount} neutral`;
    case "unknown":
      return `${checks.totalCount} unknown`;
    default:
      checks.state satisfies never;
      return "Checks unavailable";
  }
}

function ChecksIcon({ checks }: { checks: PullRequestChecks }) {
  switch (checks.state) {
    case "success":
      return <CircleCheck aria-hidden="true" className="h-4 w-4" />;
    case "failure":
      return <CircleX aria-hidden="true" className="h-4 w-4" />;
    case "running":
      return <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />;
    case "none":
      return <CircleDashed aria-hidden="true" className="h-4 w-4" />;
    case "neutral":
      return <CircleDot aria-hidden="true" className="h-4 w-4" />;
    case "unknown":
      return <CircleAlert aria-hidden="true" className="h-4 w-4" />;
    default:
      checks.state satisfies never;
      return null;
  }
}

function CheckSummary({ checks }: { checks: PullRequestChecks }) {
  const className = (() => {
    switch (checks.state) {
      case "success":
        return "text-emerald-600";
      case "failure":
        return "text-destructive";
      case "running":
        return "text-blue-600";
      case "none":
      case "neutral":
      case "unknown":
        return "text-muted-foreground";
      default:
        checks.state satisfies never;
        return "text-muted-foreground";
    }
  })();

  return (
    <span
      className={clsx(
        "inline-flex min-h-8 items-center gap-1.5 rounded-sm px-1.5 font-mono text-sm tabular-nums",
        className,
      )}
      title={`${checks.totalCount} checks`}
    >
      <ChecksIcon checks={checks} />
      {checksLabel(checks)}
    </span>
  );
}

function BuildState({
  state,
}: {
  state: Extract<PullRequestWorkerResource, { state: "available" }>["buildState"];
}) {
  switch (state) {
    case "queued":
      return (
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <CircleDashed aria-hidden="true" className="h-3.5 w-3.5" />
          Queued
        </span>
      );
    case "running":
      return (
        <span className="inline-flex items-center gap-1 text-blue-600">
          <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
          Running
        </span>
      );
    case "success":
      return (
        <span className="inline-flex items-center gap-1 text-emerald-600">
          <CircleCheck aria-hidden="true" className="h-3.5 w-3.5" />
          Succeeded
        </span>
      );
    case "failure":
      return (
        <span className="inline-flex items-center gap-1 text-destructive">
          <CircleX aria-hidden="true" className="h-3.5 w-3.5" />
          Failed
        </span>
      );
    case "cancelled":
      return <span className="text-muted-foreground">Cancelled</span>;
    case "skipped":
      return <span className="text-muted-foreground">Skipped</span>;
    case "unknown":
      return <span className="text-muted-foreground">Unknown</span>;
    default:
      state satisfies never;
      return null;
  }
}

function WorkerResource({ worker }: { worker: PullRequestWorkerResource }) {
  if (worker.state === "absent") {
    return (
      <li className="inline-flex items-center gap-1.5 text-muted-foreground">
        <CloudflareProviderLogo />
        <span>{worker.workerName}</span>
        <span>No build</span>
      </li>
    );
  }
  if (worker.state === "unavailable") {
    return (
      <li className="inline-flex items-center gap-1.5 text-muted-foreground">
        <CloudflareProviderLogo />
        <span>{worker.workerName}</span>
        <CircleAlert aria-hidden="true" className="h-3.5 w-3.5" />
        <span>Unavailable</span>
      </li>
    );
  }

  return (
    <li className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <span className="inline-flex min-w-0 items-center gap-1.5 font-medium">
        <CloudflareProviderLogo />
        <span className="break-words">{worker.workerName}</span>
      </span>
      <span className="font-mono text-xs text-muted-foreground">{worker.rootDirectory}</span>
      <BuildState state={worker.buildState} />
      {worker.convexPreview.state === "available" ? (
        <a
          href={worker.convexPreview.dashboardUrl}
          target="_blank"
          rel="noreferrer noopener"
          className={metadataLinkClassName}
          title={`Open Convex preview deployment ${worker.convexPreview.deploymentName}`}
        >
          <ConvexProviderLogo />
          {worker.convexPreview.deploymentName}
        </a>
      ) : worker.convexPreview.state === "absent" ? (
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <ConvexProviderLogo />
          No preview
        </span>
      ) : worker.buildState === "success" ? (
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <ConvexProviderLogo />
          Preview unavailable
        </span>
      ) : null}
    </li>
  );
}

function PullRequestResources({ resource }: { resource: PullRequestResourceState | undefined }) {
  const className = "min-w-0 flex-1 basis-[19rem] text-sm leading-6";
  if (resource?.state === "loading") {
    return (
      <div className={className}>
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
          Checking deploys
        </span>
      </div>
    );
  }
  if (!resource || resource.state === "failed") {
    return null;
  }
  const resources = resource.resources;
  if (resources.workers.length === 0) {
    return null;
  }

  return (
    <div className={className}>
      <ul aria-label="Pull request deploys" className="space-y-2">
        {resources.workers.map((worker) => (
          <WorkerResource key={worker.workerId} worker={worker} />
        ))}
      </ul>
    </div>
  );
}

function PullRequestRow({
  buildSamebaseUrl,
  pullRequest,
  resource,
}: {
  buildSamebaseUrl: VaultPullRequestListProps["buildSamebaseUrl"];
  pullRequest: PullRequest;
  resource: PullRequestResourceState | undefined;
}) {
  const sameRepository = !pullRequest.isCrossRepository && pullRequest.headRepository !== null;
  const headLabel =
    pullRequest.isCrossRepository && pullRequest.headRepository !== null
      ? `${pullRequest.headRepository.nameWithOwner}:${pullRequest.headRefName}`
      : pullRequest.headRefName;
  const samebaseUrl = sameRepository ? buildSamebaseUrl(pullRequest.headRefName) : null;
  const changedFilesLabel = `${numberFormatter.format(pullRequest.changedFiles)} ${
    pullRequest.changedFiles === 1 ? "file" : "files"
  }`;

  return (
    <article
      data-pull-request-row=""
      data-pull-request-number={pullRequest.number}
      className="flex min-w-0 flex-wrap items-start gap-x-6 gap-y-3 border-b border-border/40 px-3 py-3.5 last:border-b-0"
    >
      <div className="min-w-0 flex-1 basis-[22rem] space-y-1.5">
        <a
          href={pullRequest.url}
          target="_blank"
          rel="noreferrer noopener"
          className={clsx(
            "-mx-1.5 flex min-h-9 max-w-full items-start gap-1.5 rounded-sm px-1.5 text-base font-medium leading-6 underline decoration-muted-foreground/40 underline-offset-4 transition-colors",
            linkStyle,
          )}
          aria-label={`Open pull request ${pullRequest.number} on GitHub`}
        >
          <span
            aria-hidden="true"
            className="mt-1 inline-flex h-4 w-5 shrink-0 items-center justify-center"
          >
            <PullRequestStateLogo isDraft={pullRequest.isDraft} />
          </span>
          <span className="min-w-0 break-words">
            PR #{pullRequest.number} {pullRequest.title}
          </span>
        </a>
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="inline-flex min-w-0 items-center gap-1.5 font-mono text-sm text-muted-foreground">
            <GitBranch aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span className="min-w-0 break-all">
              {headLabel} → {pullRequest.baseRefName}
            </span>
          </span>
          {pullRequest.isDraft ? (
            <Badge variant="outline" className="h-6 px-1.5 py-0 text-xs font-medium">
              draft
            </Badge>
          ) : null}
          {!sameRepository ? (
            <Badge variant="outline" className="h-6 px-1.5 py-0 text-xs font-medium">
              fork
            </Badge>
          ) : null}
          {pullRequest.labels.map((label) => (
            <Badge
              key={label.name}
              variant="outline"
              className="h-6 max-w-48 px-1.5 py-0 text-xs font-medium"
              style={buildPullRequestLabelStyle(normalizePullRequestLabelColor(label.color))}
              title={label.name}
            >
              <span className="truncate">{label.name}</span>
            </Badge>
          ))}
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
          <CheckSummary checks={pullRequest.checks} />
          <span className="font-mono text-sm tabular-nums">
            +{numberFormatter.format(pullRequest.additions)} −
            {numberFormatter.format(pullRequest.deletions)} · {changedFilesLabel}
          </span>
          {samebaseUrl ? <SamebaseLink href={samebaseUrl} /> : null}
        </div>
      </div>
      <PullRequestResources resource={resource} />
    </article>
  );
}

export function VaultPullRequestList({
  buildSamebaseUrl,
  pullRequests,
  repositoryFullName,
}: VaultPullRequestListProps) {
  if (pullRequests.state === "not_requested") {
    return null;
  }
  if (pullRequests.state === "loading") {
    return (
      <div className="flex min-h-14 items-center gap-2 px-3 py-3.5 text-sm text-muted-foreground">
        <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
        Loading pull requests
      </div>
    );
  }
  if (pullRequests.state === "problem") {
    return (
      <div className="flex min-h-14 items-center justify-between gap-3 px-3 py-3.5 text-sm">
        <span className="text-muted-foreground">Could not load pull requests</span>
        <Button type="button" variant="ghost" size="sm" onClick={pullRequests.reload}>
          Retry
        </Button>
      </div>
    );
  }

  const repositoryUrl = `https://github.com/${repositoryFullName}`;
  return (
    <section
      data-vault-pull-request-list=""
      aria-label="Open pull requests"
      aria-busy={pullRequests.refreshing}
    >
      {pullRequests.state === "stale" ? (
        <div className="flex items-center justify-between gap-3 border-b border-border/40 px-3 py-2 text-sm">
          <span className="text-muted-foreground">Pull requests may be out of date</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pullRequests.refreshing}
            onClick={pullRequests.reload}
          >
            {pullRequests.refreshing ? (
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            ) : null}
            {pullRequests.refreshing ? "Refreshing" : "Retry"}
          </Button>
        </div>
      ) : null}
      {pullRequests.resourceState === "failed" || pullRequests.resourceState === "stale" ? (
        <div className="flex items-center justify-between gap-3 border-b border-border/40 px-3 py-2 text-sm">
          <span className="text-muted-foreground">
            {pullRequests.resourceState === "stale"
              ? "Deploy status may be out of date"
              : "Deploy status unavailable"}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pullRequests.refreshing}
            onClick={pullRequests.reloadResources}
          >
            {pullRequests.refreshing ? (
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            ) : null}
            {pullRequests.refreshing ? "Refreshing" : "Retry"}
          </Button>
        </div>
      ) : null}
      {pullRequests.pullRequests.map((pullRequest) => (
        <PullRequestRow
          key={pullRequest.id}
          buildSamebaseUrl={buildSamebaseUrl}
          pullRequest={pullRequest}
          resource={pullRequests.resourcesByPullRequestId.get(pullRequest.id)}
        />
      ))}
      {pullRequests.pullRequests.length === 0 ? (
        <div className="px-3 py-3.5 text-sm text-muted-foreground">
          {pullRequests.hasMore
            ? "No matching pull requests loaded"
            : pullRequests.allPullRequests.length > 0
              ? "No matching pull requests"
              : "No open pull requests"}
        </div>
      ) : null}
      {pullRequests.hasMore ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/40 px-3 py-3 text-sm">
          <span className="text-muted-foreground">
            {pullRequests.loadMoreFailed
              ? "Could not load more pull requests"
              : "More pull requests available"}
          </span>
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!pullRequests.canLoadMore}
              onClick={pullRequests.loadMore}
            >
              {pullRequests.isLoadingMore ? (
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              ) : null}
              {pullRequests.isLoadingMore ? "Loading" : "Load more"}
            </Button>
            <a
              href={`${repositoryUrl}/pulls`}
              target="_blank"
              rel="noreferrer noopener"
              className={linkStyle}
            >
              GitHub
            </a>
          </div>
        </div>
      ) : null}
    </section>
  );
}
