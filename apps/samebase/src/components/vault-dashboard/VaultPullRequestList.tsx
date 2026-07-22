import { linkStyle } from "@/components/styles";
import { Badge } from "@/components/ui/badge";
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
import { useEffect, useRef } from "react";
import type { PullRequestWorkerResource } from "../../../convex/vault/pullRequestResources";

type PullRequest = VaultPullRequest;
type PullRequestChecks = PullRequest["checks"];

export type VaultPullRequestListProps = {
  buildSamebaseUrl: (branchName: string) => string | null;
  pullRequests: VaultPullRequestsState;
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
  state: Extract<PullRequestWorkerResource, { state: "available" }>["cloudflareBuild"]["state"];
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

function CloudflareBuildResource({
  build,
  workerName,
}: {
  build: Extract<PullRequestWorkerResource, { state: "available" }>["cloudflareBuild"];
  workerName: string;
}) {
  return (
    <>
      <BuildState state={build.state} />
      <a
        href={build.logsUrl}
        target="_blank"
        rel="noreferrer noopener"
        className={metadataLinkClassName}
        title={`Open Cloudflare build logs for ${workerName}`}
      >
        Build logs
      </a>
    </>
  );
}

function CloudflarePreviewResource({
  preview,
  workerName,
}: {
  preview: Extract<PullRequestWorkerResource, { state: "available" }>["cloudflarePreview"];
  workerName: string;
}) {
  if (preview.state !== "available") {
    return null;
  }

  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noreferrer noopener"
      className={metadataLinkClassName}
      title={`Open Cloudflare preview for ${workerName}`}
    >
      {new URL(preview.url).hostname}
    </a>
  );
}

function ConvexPreviewResource({
  preview,
  buildState,
}: {
  preview: Extract<PullRequestWorkerResource, { state: "available" }>["convexPreview"];
  buildState: Extract<
    PullRequestWorkerResource,
    { state: "available" }
  >["cloudflareBuild"]["state"];
}) {
  if (preview.state === "available") {
    return (
      <>
        <a
          href={preview.dashboardUrl}
          target="_blank"
          rel="noreferrer noopener"
          className={metadataLinkClassName}
          title={`Open Convex preview deployment ${preview.deploymentName}`}
        >
          <ConvexProviderLogo />
          {preview.deploymentName}
        </a>
        <a
          href={`${preview.dashboardUrl}/data`}
          target="_blank"
          rel="noreferrer noopener"
          className={metadataLinkClassName}
          title={`Open preview data for ${preview.deploymentName}`}
        >
          Data
        </a>
      </>
    );
  }
  if (preview.state === "absent") {
    return (
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        <ConvexProviderLogo />
        No preview
      </span>
    );
  }
  if (buildState !== "success") {
    return null;
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
      <ConvexProviderLogo />
      Preview unavailable
    </span>
  );
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
      <CloudflareBuildResource build={worker.cloudflareBuild} workerName={worker.workerName} />
      <CloudflarePreviewResource
        preview={worker.cloudflarePreview}
        workerName={worker.workerName}
      />
      <ConvexPreviewResource
        preview={worker.convexPreview}
        buildState={worker.cloudflareBuild.state}
      />
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

function PullRequestLoadMoreSentinel({ loadMore }: { loadMore: () => void }) {
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

export function VaultPullRequestList({
  buildSamebaseUrl,
  pullRequests,
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
      <div className="min-h-14 px-3 py-3.5 text-sm text-muted-foreground">
        Could not load pull requests
      </div>
    );
  }

  const statusMessage =
    pullRequests.state === "stale" || pullRequests.resourceState === "stale"
      ? "Pull request data may be out of date"
      : pullRequests.resourceState === "failed"
        ? "Deploy status unavailable"
        : null;
  return (
    <section
      data-vault-pull-request-list=""
      aria-label="Open pull requests"
      aria-busy={pullRequests.refreshing}
    >
      {statusMessage ? (
        <div className="border-b border-border/40 px-3 py-2 text-sm text-muted-foreground">
          {statusMessage}
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
      {pullRequests.isLoadingMore ? (
        <div
          role="status"
          aria-live="polite"
          className="flex h-8 items-center gap-2 px-3 text-sm text-muted-foreground"
        >
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          Loading more pull requests
        </div>
      ) : pullRequests.loadMoreFailed ? (
        <div role="status" className="px-3 py-2 text-sm text-muted-foreground">
          Could not load more pull requests
        </div>
      ) : pullRequests.canLoadMore ? (
        <PullRequestLoadMoreSentinel loadMore={pullRequests.loadMore} />
      ) : null}
    </section>
  );
}
