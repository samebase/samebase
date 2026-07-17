import { Badge } from "@/components/ui/badge";
import {
  CloudflareProviderLogo,
  PullRequestStateLogo,
  SamebaseLogoMark,
} from "@/components/vault-dashboard/VaultDashboardLogos";
import { linkStyle } from "@/components/styles";
import {
  buildPullRequestLabelStyle,
  normalizePullRequestLabelColor,
} from "@/lib/pullRequestLabels";
import { Link } from "@tanstack/react-router";
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

export type VaultPullRequestLabel = {
  name: string;
  color?: string;
};

type VaultPullRequestCheckCounts = {
  totalCount: number;
  checkRunCount: number;
  statusContextCount: number;
  successCount: number;
  failureCount: number;
  runningCount: number;
  neutralCount: number;
  unknownCount: number;
};

export type VaultPullRequestChecks =
  | {
      state: "none";
      totalCount: 0;
      checkRunCount: 0;
      statusContextCount: 0;
      successCount: 0;
      failureCount: 0;
      runningCount: 0;
      neutralCount: 0;
      unknownCount: 0;
    }
  | ({ state: "success" } & VaultPullRequestCheckCounts)
  | ({ state: "failure" } & VaultPullRequestCheckCounts)
  | ({ state: "running" } & VaultPullRequestCheckCounts)
  | ({ state: "neutral" } & VaultPullRequestCheckCounts)
  | ({ state: "unknown" } & VaultPullRequestCheckCounts);

type VaultCloudflarePreviewPending = {
  state: "pending";
};

type VaultCloudflarePreviewReady = {
  state: "ready";
  versionUrl: string;
  branchAlias:
    | { state: "ready"; branchName: string; url: string }
    | { state: "not_provided" }
    | {
        state: "provider_unknown";
        reason: "branch_unavailable" | "conflicting_branch_evidence";
        providerUrl: string;
      };
};

type VaultCloudflarePreviewDisabled = {
  state: "disabled";
};

type VaultCloudflarePreviewUnavailable = {
  state: "unavailable";
};

type VaultCloudflarePreviewProviderUnknown = {
  state: "provider_unknown";
  reason: "configuration_unavailable" | "invalid_provider_output" | "unrecognized_build_state";
};

export type VaultCloudflarePreview =
  | VaultCloudflarePreviewPending
  | VaultCloudflarePreviewReady
  | VaultCloudflarePreviewDisabled
  | VaultCloudflarePreviewUnavailable
  | VaultCloudflarePreviewProviderUnknown;

type VaultCloudflareBuildFields = {
  source:
    | { state: "github_check_run"; checkRunId: string }
    | { state: "cloudflare_build"; checkRunId: string; buildId: string };
  checkName: string;
  workerName: string;
  rootDirectory: { state: "known"; value: string } | { state: "unknown" };
  branch:
    | { state: "known"; name: string }
    | { state: "unknown" }
    | { state: "conflicting_evidence"; suiteBranch: string | null };
  providerStatus: string;
  providerConclusion: { state: "provided"; value: string } | { state: "not_provided" };
};

export type VaultCloudflareBuild =
  | ({
      state: "queued";
      preview:
        | VaultCloudflarePreviewPending
        | VaultCloudflarePreviewDisabled
        | VaultCloudflarePreviewProviderUnknown;
    } & VaultCloudflareBuildFields)
  | ({
      state: "running";
      preview:
        | VaultCloudflarePreviewPending
        | VaultCloudflarePreviewReady
        | VaultCloudflarePreviewDisabled
        | VaultCloudflarePreviewProviderUnknown;
    } & VaultCloudflareBuildFields)
  | ({
      state: "success";
      preview:
        | VaultCloudflarePreviewReady
        | VaultCloudflarePreviewDisabled
        | VaultCloudflarePreviewProviderUnknown;
    } & VaultCloudflareBuildFields)
  | ({
      state: "failure";
      preview:
        | VaultCloudflarePreviewUnavailable
        | VaultCloudflarePreviewReady
        | VaultCloudflarePreviewDisabled
        | VaultCloudflarePreviewProviderUnknown;
    } & VaultCloudflareBuildFields)
  | ({
      state: "cancelled";
      preview:
        | VaultCloudflarePreviewUnavailable
        | VaultCloudflarePreviewReady
        | VaultCloudflarePreviewDisabled
        | VaultCloudflarePreviewProviderUnknown;
    } & VaultCloudflareBuildFields)
  | ({
      state: "skipped";
      preview:
        | VaultCloudflarePreviewUnavailable
        | VaultCloudflarePreviewReady
        | VaultCloudflarePreviewDisabled
        | VaultCloudflarePreviewProviderUnknown;
    } & VaultCloudflareBuildFields)
  | ({
      state: "provider_unknown";
      preview:
        | VaultCloudflarePreviewReady
        | VaultCloudflarePreviewDisabled
        | VaultCloudflarePreviewProviderUnknown;
    } & VaultCloudflareBuildFields);

export type VaultCloudflareBuilds = {
  first: VaultCloudflareBuild;
  rest: readonly VaultCloudflareBuild[];
};

type VaultCloudflarePreviousObservation =
  | { state: "ready"; builds: VaultCloudflareBuilds }
  | { state: "fresh_absence" };

type VaultObservationBudgetReason = "rate_limit" | "request_budget";
type VaultObservationUnavailableReason =
  | "github_connection_unavailable"
  | "repository_unavailable"
  | "head_unavailable";
type VaultObservationFailureReason = "request_failed" | "invalid_response" | "incomplete_response";

type VaultObservationRefreshProblem =
  | { state: "not_requested" }
  | { state: "loading" }
  | { state: "budget_deferred"; reason: VaultObservationBudgetReason; retryAt: number }
  | { state: "provider_unavailable"; reason: VaultObservationUnavailableReason }
  | { state: "provider_failure"; reason: VaultObservationFailureReason };

export type VaultCloudflareObservation =
  | { state: "not_requested" }
  | { state: "loading" }
  | { state: "ready"; builds: VaultCloudflareBuilds }
  | { state: "fresh_absence" }
  | {
      state: "stale";
      lastKnown: VaultCloudflarePreviousObservation;
      refresh: VaultObservationRefreshProblem;
    }
  | { state: "budget_deferred"; reason: VaultObservationBudgetReason; retryAt: number }
  | { state: "provider_unavailable"; reason: VaultObservationUnavailableReason }
  | { state: "provider_failure"; reason: VaultObservationFailureReason };

export type VaultDefaultBranchSummary = {
  name: string;
  githubUrl: string;
  samebaseUrl: string;
  headSha: string;
  headUrl: string;
  checks: VaultPullRequestChecks;
};

export type VaultPullRequestHead =
  | {
      kind: "local";
      branchName: string;
      samebaseUrl: string;
    }
  | {
      kind: "fork";
      branchName: string;
      repositoryFullName: string;
    };

export type VaultPullRequestListItem = {
  id: string;
  number: number;
  title: string;
  url: string;
  isDraft: boolean;
  head: VaultPullRequestHead;
  baseBranchName: string;
  labels: readonly VaultPullRequestLabel[];
  additions: number;
  deletions: number;
  changedFiles: number;
  checks: VaultPullRequestChecks;
  cloudflare: VaultCloudflareObservation;
};

export type VaultPullRequestListProps = {
  defaultBranch: VaultDefaultBranchSummary;
  pullRequests: readonly VaultPullRequestListItem[];
};

const numberFormatter = new Intl.NumberFormat("en-US");

const metadataLinkClassName = clsx(
  "-mx-1.5 inline-flex min-h-8 items-center gap-1.5 rounded-sm px-1.5 font-mono text-sm underline decoration-muted-foreground/40 underline-offset-4 transition-colors",
  linkStyle,
);

function formatChecksLabel(checks: VaultPullRequestChecks): string {
  switch (checks.state) {
    case "none":
      return "No checks";
    case "success":
      return `${checks.successCount + checks.neutralCount} passed`;
    case "failure":
      return `${checks.failureCount} failed`;
    case "running":
      return `${checks.runningCount} pending`;
    case "neutral":
      return `${checks.neutralCount} neutral`;
    case "unknown":
      return `${checks.totalCount} unknown`;
    default: {
      checks satisfies never;
      return "Checks unknown";
    }
  }
}

function formatChecksTitle(checks: VaultPullRequestChecks): string {
  if (checks.state === "none") {
    return "No checks reported for this commit";
  }

  return [
    `${checks.totalCount} total`,
    `${checks.successCount} passed`,
    `${checks.failureCount} failed`,
    `${checks.runningCount} pending`,
    `${checks.neutralCount} neutral`,
    `${checks.unknownCount} unknown`,
  ].join(" · ");
}

function getChecksClassName(checks: VaultPullRequestChecks): string {
  switch (checks.state) {
    case "success":
      return "text-emerald-600 hover:text-emerald-700";
    case "failure":
      return "text-destructive hover:text-destructive";
    case "running":
      return "text-blue-600 hover:text-blue-700";
    case "none":
    case "neutral":
    case "unknown":
      return "text-muted-foreground hover:text-foreground";
    default: {
      checks satisfies never;
      return "text-muted-foreground";
    }
  }
}

function ChecksIcon({ checks }: { checks: VaultPullRequestChecks }) {
  switch (checks.state) {
    case "success":
      return <CircleCheck aria-hidden="true" className="h-4 w-4" strokeWidth={2} />;
    case "failure":
      return <CircleX aria-hidden="true" className="h-4 w-4" strokeWidth={2} />;
    case "running":
      return <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" strokeWidth={2} />;
    case "none":
      return <CircleDashed aria-hidden="true" className="h-4 w-4" strokeWidth={2} />;
    case "neutral":
      return <CircleDot aria-hidden="true" className="h-4 w-4" strokeWidth={2} />;
    case "unknown":
      return <CircleAlert aria-hidden="true" className="h-4 w-4" strokeWidth={2} />;
    default: {
      checks satisfies never;
      return null;
    }
  }
}

function CheckSummary({ checks }: { checks: VaultPullRequestChecks }) {
  const className = clsx(
    "inline-flex min-h-8 items-center gap-1.5 rounded-sm px-1.5 font-mono text-sm tabular-nums",
    getChecksClassName(checks),
  );
  const title = formatChecksTitle(checks);

  return (
    <span className={className} title={title}>
      <ChecksIcon checks={checks} />
      <span>{formatChecksLabel(checks)}</span>
    </span>
  );
}

function BuildState({ state }: { state: VaultCloudflareBuild["state"] }) {
  switch (state) {
    case "queued":
      return (
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <CircleDashed aria-hidden="true" className="h-3.5 w-3.5" /> Queued
        </span>
      );
    case "running":
      return (
        <span className="inline-flex items-center gap-1 text-blue-600">
          <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" /> Running
        </span>
      );
    case "success":
      return (
        <span className="inline-flex items-center gap-1 text-emerald-600">
          <CircleCheck aria-hidden="true" className="h-3.5 w-3.5" /> Succeeded
        </span>
      );
    case "failure":
      return (
        <span className="inline-flex items-center gap-1 text-destructive">
          <CircleX aria-hidden="true" className="h-3.5 w-3.5" /> Failed
        </span>
      );
    case "cancelled":
      return (
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <CircleX aria-hidden="true" className="h-3.5 w-3.5" /> Cancelled
        </span>
      );
    case "skipped":
      return (
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <CircleDot aria-hidden="true" className="h-3.5 w-3.5" /> Skipped
        </span>
      );
    case "provider_unknown":
      return (
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <CircleAlert aria-hidden="true" className="h-3.5 w-3.5" /> Build state unknown
        </span>
      );
    default: {
      state satisfies never;
      return null;
    }
  }
}

function PreviewResult({ preview }: { preview: VaultCloudflarePreview }) {
  switch (preview.state) {
    case "pending":
      return <span className="text-muted-foreground">Preview pending</span>;
    case "disabled":
      return <span className="text-muted-foreground">Preview disabled</span>;
    case "unavailable":
      return <span className="text-muted-foreground">No preview</span>;
    case "provider_unknown":
      return <span className="text-muted-foreground">Preview result unknown</span>;
    case "ready":
      return (
        <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
          {preview.branchAlias.state === "ready" ? (
            <a
              href={preview.branchAlias.url}
              target="_blank"
              rel="noreferrer noopener"
              className={metadataLinkClassName}
              title={`Open the latest preview for ${preview.branchAlias.branchName}`}
            >
              Preview
            </a>
          ) : preview.branchAlias.state === "not_provided" ? (
            <span className="text-muted-foreground">Branch preview not provided</span>
          ) : (
            <span className="text-muted-foreground">Branch preview unknown</span>
          )}
          <a
            href={preview.versionUrl}
            target="_blank"
            rel="noreferrer noopener"
            className={metadataLinkClassName}
            title="Open this immutable Worker version"
          >
            Version
          </a>
        </span>
      );
    default: {
      preview satisfies never;
      return null;
    }
  }
}

function CloudflareBuildList({ builds }: { builds: VaultCloudflareBuilds }) {
  const allBuilds = [builds.first, ...builds.rest];

  return (
    <ul aria-label="Cloudflare builds" className="min-w-0 space-y-2">
      {allBuilds.map((build) => (
        <li
          key={
            build.source.state === "cloudflare_build"
              ? `cloudflare-build:${build.source.checkRunId}:${build.source.buildId}`
              : `github-check-run:${build.source.checkRunId}`
          }
          className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm leading-6"
        >
          <span className="inline-flex min-w-0 items-center gap-1.5 font-medium">
            <CloudflareProviderLogo />
            <span className="min-w-0 break-words">{build.workerName}</span>
          </span>
          {build.rootDirectory.state === "known" ? (
            <span className="font-mono text-xs text-muted-foreground">
              {build.rootDirectory.value}
            </span>
          ) : (
            <span className="sr-only">Root directory unknown</span>
          )}
          <BuildState state={build.state} />
          <span aria-hidden="true" className="text-muted-foreground/60">
            ·
          </span>
          <PreviewResult preview={build.preview} />
        </li>
      ))}
    </ul>
  );
}

function unavailableObservationLabel(
  reason: Extract<VaultCloudflareObservation, { state: "provider_unavailable" }>["reason"],
): string {
  switch (reason) {
    case "github_connection_unavailable":
      return "GitHub connection unavailable";
    case "repository_unavailable":
      return "Repository unavailable to GitHub";
    case "head_unavailable":
      return "Pull request head unavailable";
    default: {
      reason satisfies never;
      return "Preview information unavailable";
    }
  }
}

function failureObservationLabel(
  reason: Extract<VaultCloudflareObservation, { state: "provider_failure" }>["reason"],
): string {
  switch (reason) {
    case "request_failed":
      return "Preview request failed";
    case "invalid_response":
      return "GitHub returned invalid preview data";
    case "incomplete_response":
      return "GitHub returned incomplete preview data";
    default: {
      reason satisfies never;
      return "Preview check failed";
    }
  }
}

function staleObservationLabel(refresh: VaultObservationRefreshProblem): string {
  switch (refresh.state) {
    case "not_requested":
      return "Preview information is stale";
    case "loading":
      return "Preview information is stale: updating";
    case "budget_deferred":
      return "Preview information is stale: refresh deferred";
    case "provider_unavailable":
      return "Preview information is stale: provider unavailable";
    case "provider_failure":
      return "Preview information is stale: refresh failed";
    default: {
      refresh satisfies never;
      return "Preview information is stale";
    }
  }
}

function CloudflareObservation({ observation }: { observation: VaultCloudflareObservation }) {
  const className = "min-w-0 flex-1 basis-[19rem] text-sm leading-6";

  switch (observation.state) {
    case "not_requested":
      return (
        <div data-preview-observation-state={observation.state} className={className}>
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <CloudflareProviderLogo /> Previews not checked
          </span>
        </div>
      );
    case "loading":
      return (
        <div data-preview-observation-state={observation.state} className={className}>
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <CloudflareProviderLogo />
            <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
            Checking previews
          </span>
        </div>
      );
    case "ready":
      return (
        <div data-preview-observation-state={observation.state} className={className}>
          <CloudflareBuildList builds={observation.builds} />
        </div>
      );
    case "fresh_absence":
      return (
        <div data-preview-observation-state={observation.state} className={className}>
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <CloudflareProviderLogo /> No Cloudflare build ran
          </span>
        </div>
      );
    case "stale":
      return (
        <div
          data-preview-observation-state={observation.state}
          className={clsx(className, "space-y-2")}
        >
          <div className="inline-flex items-center gap-1.5 text-muted-foreground">
            <CircleAlert aria-hidden="true" className="h-3.5 w-3.5" />
            {staleObservationLabel(observation.refresh)}
          </div>
          {observation.lastKnown.state === "ready" ? (
            <CloudflareBuildList builds={observation.lastKnown.builds} />
          ) : (
            <div className="text-muted-foreground">No Cloudflare build was seen</div>
          )}
        </div>
      );
    case "budget_deferred":
      return (
        <div data-preview-observation-state={observation.state} className={className}>
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <CircleDashed aria-hidden="true" className="h-3.5 w-3.5" /> Preview check deferred
          </span>
        </div>
      );
    case "provider_unavailable":
      return (
        <div data-preview-observation-state={observation.state} className={className}>
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <CircleAlert aria-hidden="true" className="h-3.5 w-3.5" />
            {unavailableObservationLabel(observation.reason)}
          </span>
        </div>
      );
    case "provider_failure":
      return (
        <div data-preview-observation-state={observation.state} className={className}>
          <span className="inline-flex items-center gap-1.5 text-destructive">
            <CircleX aria-hidden="true" className="h-3.5 w-3.5" />
            {failureObservationLabel(observation.reason)}
          </span>
        </div>
      );
    default: {
      observation satisfies never;
      return null;
    }
  }
}

function DefaultBranchRow({ branch }: { branch: VaultDefaultBranchSummary }) {
  return (
    <article
      data-default-branch-row=""
      aria-label={`Default branch ${branch.name}`}
      className="min-w-0 border-b border-border/40 px-3 py-3.5 last:border-b-0"
    >
      <div className="min-w-0 flex-1 basis-[22rem] space-y-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <a
            href={branch.githubUrl}
            target="_blank"
            rel="noreferrer noopener"
            className={clsx(
              "-mx-1.5 inline-flex min-h-9 min-w-0 items-center gap-1.5 rounded-sm px-1.5 text-base font-medium underline decoration-muted-foreground/40 underline-offset-4 transition-colors",
              linkStyle,
            )}
            title="Open the default branch on GitHub"
          >
            <GitBranch aria-hidden="true" className="h-4 w-4 shrink-0" strokeWidth={1.75} />
            <span className="min-w-0 break-words">{branch.name}</span>
          </a>
          <Badge variant="outline" className="h-6 px-1.5 py-0 text-xs font-medium">
            default
          </Badge>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
          <a
            href={branch.headUrl}
            target="_blank"
            rel="noreferrer noopener"
            className={metadataLinkClassName}
            title="Open the current commit on GitHub"
          >
            Head {branch.headSha.slice(0, 7)}
          </a>
          <CheckSummary checks={branch.checks} />
          <Link
            to={branch.samebaseUrl}
            className={metadataLinkClassName}
            title="Open branch in Samebase"
          >
            <SamebaseLogoMark />
            Edit
          </Link>
        </div>
      </div>
    </article>
  );
}

function PullRequestRow({ pullRequest }: { pullRequest: VaultPullRequestListItem }) {
  const headLabel =
    pullRequest.head.kind === "fork"
      ? `${pullRequest.head.repositoryFullName}:${pullRequest.head.branchName}`
      : pullRequest.head.branchName;
  const changedFilesLabel = `${numberFormatter.format(pullRequest.changedFiles)} ${pullRequest.changedFiles === 1 ? "file" : "files"}`;

  return (
    <article
      data-pull-request-row=""
      data-pull-request-number={pullRequest.number}
      className="flex min-w-0 flex-wrap items-start gap-x-6 gap-y-3 border-b border-border/40 px-3 py-3.5 last:border-b-0"
    >
      <div className="min-w-0 flex-1 basis-[22rem] space-y-1.5">
        <a
          data-pull-request-primary-link=""
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
            <GitBranch aria-hidden="true" className="h-4 w-4 shrink-0" strokeWidth={1.75} />
            <span className="min-w-0 break-all">
              {headLabel} → {pullRequest.baseBranchName}
            </span>
          </span>
          {pullRequest.isDraft ? (
            <Badge variant="outline" className="h-6 px-1.5 py-0 text-xs font-medium">
              draft
            </Badge>
          ) : null}
          {pullRequest.head.kind === "fork" ? (
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
          {pullRequest.head.kind === "local" ? (
            <Link
              to={pullRequest.head.samebaseUrl}
              className={metadataLinkClassName}
              title="View this branch's changes in Samebase"
            >
              <SamebaseLogoMark />
              View changes
            </Link>
          ) : null}
        </div>
      </div>
      <CloudflareObservation observation={pullRequest.cloudflare} />
    </article>
  );
}

export function VaultPullRequestList({ defaultBranch, pullRequests }: VaultPullRequestListProps) {
  return (
    <section data-vault-pull-request-list="" aria-label="Repository overview">
      <DefaultBranchRow branch={defaultBranch} />
      {pullRequests.map((pullRequest) => (
        <PullRequestRow key={pullRequest.id} pullRequest={pullRequest} />
      ))}
      {pullRequests.length === 0 ? (
        <div className="px-3 py-3.5 text-sm text-muted-foreground">No open pull requests</div>
      ) : null}
    </section>
  );
}
