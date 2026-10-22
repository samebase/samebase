import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CloudflareProviderLogo,
  ConvexProviderLogo,
  NetlifyProviderLogo,
  SamebaseLogoMark,
} from "@/components/repository-dashboard/RepositoryDashboardLogos";
import { RepositoryChecksPopover } from "@/repository/dashboard/RepositoryChecksPopover";
import { resourceTypePresentation } from "@/components/resourceTypePresentation";
import {
  buildPullRequestEnvironmentRoots,
  buildPullRequestOtherPreviews,
  type RepositoryEnvironmentAction,
  type RepositoryEnvironmentResource,
  type RepositoryEnvironmentRoot,
  type RepositoryEnvironmentWorker,
  type RepositoryOtherPreview,
} from "@/repository/dashboard/repositoryEnvironmentRoots";
import type { PullRequestResourceState } from "@/repository/dashboard/useRepositoryPullRequests";
import { formatRelativeTimeAgo } from "@/lib/formatRelativeTime";
import { buildGitHubBranchTreeUrl } from "@/lib/githubUrls";
import { buildRepositoryFileRoute } from "@/lib/repositoryRoutes";
import { applyRepositoryDashboardProviderAddSearch } from "@/routeSearch/root";
import { Link } from "@tanstack/react-router";
import { formatConvexDeploymentRegionLabel } from "../../../shared/convexDeploymentRegions";
import {
  CircleCheck,
  CircleDashed,
  CircleDot,
  CircleX,
  ExternalLink,
  MoreHorizontal,
} from "lucide-react";
import { useState } from "react";
import type { RepositoryWorkspaceSelected } from "./repositoryWorkspaceModel";

type EnvironmentBuildState = Extract<
  RepositoryEnvironmentWorker["build"],
  { state: "available" }
>["buildState"];

function DestinationIcon({ href }: { href: string }) {
  const [faviconFailed, setFaviconFailed] = useState(false);
  let origin: URL;
  try {
    origin = new URL(href);
  } catch {
    return <CloudflareProviderLogo />;
  }

  if (origin.hostname.endsWith(".workers.dev") || faviconFailed) {
    return <CloudflareProviderLogo />;
  }

  const faviconUrl = `${origin.origin}/favicon.ico`;

  return (
    <img
      alt=""
      aria-hidden="true"
      className="h-4 w-4"
      loading="lazy"
      referrerPolicy="no-referrer"
      src={faviconUrl}
      onError={() => setFaviconFailed(true)}
    />
  );
}

export function RootDirectoryLabel({ rootDirectory }: { rootDirectory: string }) {
  return (
    <span className="block text-base font-semibold leading-5 text-foreground [overflow-wrap:anywhere]">
      {rootDirectory}
    </span>
  );
}

function EnvironmentActionsMenu({
  actions,
  label,
}: {
  actions: readonly RepositoryEnvironmentAction[];
  label: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild nativeButton>
        <Button
          aria-label={`Open ${label} actions`}
          className="size-10 @4xl:size-8"
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-max min-w-40 max-w-[calc(100vw-2rem)] rounded-none shadow-none"
      >
        {actions.map((action) =>
          action.destination === "none" ? (
            <DropdownMenuItem key={`none:${action.label}`}>
              <span className="min-w-0 break-all">{action.label}</span>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem key={`${action.destination}:${action.href}`} asChild>
              {action.destination === "samebase" ? (
                <Link className="min-w-0 no-underline" to={action.href}>
                  <SamebaseLogoMark />
                  <span className="min-w-0 break-all">{action.label}</span>
                </Link>
              ) : (
                <a
                  className="min-w-0 no-underline"
                  href={action.href}
                  rel="noreferrer noopener"
                  target="_blank"
                >
                  <span className="min-w-0 break-all">{action.label}</span>
                  <ExternalLink className="shrink-0" />
                </a>
              )}
            </DropdownMenuItem>
          ),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DestinationResource({
  resource,
}: {
  resource: Extract<RepositoryEnvironmentResource, { kind: "destination" }>;
}) {
  const presentation = resourceTypePresentation("Convex.Deployment");

  return (
    <div
      aria-label={`Convex deployment ${resource.label}`}
      className="grid min-h-10 min-w-0 py-1.5"
      role="group"
    >
      <div className="flex min-w-0 items-center gap-1">
        <a
          className="inline-flex min-h-10 min-w-0 items-center gap-2.5 text-foreground no-underline hover:no-underline"
          href={resource.href}
          rel="noreferrer noopener"
          target="_blank"
          title={resource.title}
        >
          <span className="flex h-4 w-5 shrink-0 items-center justify-center">
            {presentation.icon}
          </span>
          <span className="min-w-0 truncate text-sm font-medium leading-5 underline decoration-border underline-offset-4">
            {resource.label}
          </span>
          <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
        </a>
        <span className="shrink-0 text-xs text-muted-foreground">{presentation.label}</span>
        {resource.actions.length > 0 ? (
          <EnvironmentActionsMenu actions={resource.actions} label={resource.label} />
        ) : null}
      </div>
      {resource.provenance === "pull_request_branch" ? (
        <span className="ml-[1.875rem] text-xs leading-5 text-muted-foreground">
          May be from an earlier commit
        </span>
      ) : resource.provenance === "pull_request_head" ? (
        <span className="ml-[1.875rem] font-mono text-xs leading-5 text-muted-foreground">
          {resource.headCommit.slice(0, 7)}
        </span>
      ) : null}
      {resource.region ? (
        <span className="ml-[1.875rem] text-xs leading-5 text-muted-foreground">
          {formatConvexDeploymentRegionLabel(resource.region)}
        </span>
      ) : null}
    </div>
  );
}

function RepositoryEnvironmentResourceRow({
  resource,
}: {
  resource: RepositoryEnvironmentResource;
}) {
  switch (resource.kind) {
    case "destination":
      return <DestinationResource resource={resource} />;
    case "convex_loading":
      return (
        <div
          aria-label="Loading Convex deployment"
          className="flex min-h-10 min-w-0 items-center gap-2.5 py-1.5"
        >
          <span className="flex h-4 w-5 shrink-0 items-center justify-center">
            <ConvexProviderLogo />
          </span>
          <span
            aria-hidden="true"
            className="h-3 w-32 max-w-[60%] bg-muted motion-safe:animate-pulse"
          />
        </div>
      );
    case "cloudflare_worker":
      return <CloudflareWorkerResource worker={resource.worker} />;
    case "cloudflare_r2_bucket": {
      const presentation = resourceTypePresentation("Cloudflare.R2.Bucket");
      return (
        <div className="flex min-w-0 items-center gap-2.5">
          <a
            className="inline-flex min-h-10 min-w-0 items-center gap-2.5 py-1.5 text-foreground no-underline hover:no-underline"
            href={resource.href}
            rel="noreferrer noopener"
            target="_blank"
            title={`Open R2 bucket ${resource.bucketName}`}
          >
            <span className="flex h-4 w-5 shrink-0 items-center justify-center">
              {presentation.icon}
            </span>
            <span className="min-w-0 truncate text-sm font-medium leading-5 underline decoration-border underline-offset-4">
              {resource.bucketName}
            </span>
            <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
          </a>
          <span className="shrink-0 text-xs text-muted-foreground">{presentation.label}</span>
        </div>
      );
    }
    default:
      resource satisfies never;
      return null;
  }
}

export function RepositoryEnvironmentTree({
  roots,
}: {
  roots: readonly RepositoryEnvironmentRoot[];
}) {
  if (roots.length === 0) {
    return null;
  }
  const hideRootDirectory = roots.length === 1 && roots[0]?.rootDirectory === "/";

  return (
    <div className={hideRootDirectory ? undefined : "ml-2.5 pl-5"}>
      {roots.map((root) => (
        <div key={root.rootDirectory}>
          {hideRootDirectory ? null : (
            <div className="pt-3">
              <RootDirectoryLabel rootDirectory={root.rootDirectory} />
            </div>
          )}
          <div className={hideRootDirectory ? undefined : "pb-0.5"}>
            {root.resources.map((resource) => (
              <div
                key={`${resource.kind}:${resource.id}`}
                className={hideRootDirectory ? undefined : "pl-4"}
              >
                <RepositoryEnvironmentResourceRow resource={resource} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function RepositoryOverviewLoadingLines({ rows = 3 }: { rows?: number }) {
  return (
    <div className="grid gap-4" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="grid gap-2">
          <div className="h-4 w-2/3 bg-muted motion-safe:animate-pulse" />
          <div className="h-3 w-1/3 bg-muted motion-safe:animate-pulse" />
        </div>
      ))}
    </div>
  );
}

/**
The reads behind the default-branch block. The stacks in the team store build the block while they
are read and when they exist; the live reads of the attachment rows build it when the store holds
no stack of the repository or its first read failed, and that failure stays visible with its Retry.
*/
function readProductionObservationStates(workspace: RepositoryWorkspaceSelected) {
  const alchemyObservations = workspace.alchemyObservations;
  return alchemyObservations.state === "loading" ||
    (alchemyObservations.state === "loaded" && alchemyObservations.observations.length > 0)
    ? [alchemyObservations]
    : [
        workspace.cloudflareObservations.workers,
        workspace.cloudflareObservations.builds,
        workspace.convexObservations,
        alchemyObservations,
      ];
}

export function DefaultBranchSection({
  filesReadEnabled,
  workspace,
}: {
  filesReadEnabled: boolean;
  workspace: RepositoryWorkspaceSelected;
}) {
  const pullRequests = workspace.pullRequests;
  const defaultBranch = workspace.repository.defaultBranch?.trim();

  if (pullRequests.state === "loading") {
    return (
      <section aria-label="Loading default branch" className="pb-5">
        <RepositoryOverviewLoadingLines rows={2} />
      </section>
    );
  }
  if (pullRequests.state === "problem") {
    return (
      <section className="pb-5">
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>Could not load the default branch from GitHub.</span>
          <Button size="sm" type="button" variant="outline" onClick={pullRequests.reload}>
            Retry
          </Button>
        </div>
      </section>
    );
  }
  if (pullRequests.state === "not_requested") {
    return (
      <section className="pb-5 text-sm text-muted-foreground">
        The GitHub repository is not ready yet.
      </section>
    );
  }
  const observation = pullRequests.defaultBranch;
  if (!observation || !defaultBranch) {
    return (
      <section className="pb-5 text-sm text-muted-foreground">
        No default branch commit is available.
      </section>
    );
  }

  const commitTime = Date.parse(observation.headCommitCommittedAt);
  const relativeCommitTime = Number.isFinite(commitTime)
    ? formatRelativeTimeAgo(commitTime)
    : observation.headCommitCommittedAt;
  const branchUrl = buildGitHubBranchTreeUrl({
    branchName: defaultBranch,
    githubRepositoryFullName: workspace.repository.githubRepositoryFullName,
  });
  const filesHref = buildRepositoryFileRoute({
    owner: workspace.repository.githubOwnerLogin,
    repoName: workspace.repository.githubRepositoryName,
    branch: defaultBranch,
  });
  const productionObservationStates = readProductionObservationStates(workspace);
  const productionLoading = productionObservationStates.some(
    (state) => state.state === "loading" || state.state === "checking",
  );
  const productionStatusUnavailable = productionObservationStates.some(
    (state) => state.state === "failed",
  );
  const productionStatusStale = productionObservationStates.some(
    (state) => state.state === "loaded" && state.refreshFailed,
  );
  const environmentRoots = workspace.environmentRoots;

  return (
    <section
      aria-label={`Default branch ${defaultBranch}`}
      aria-busy={pullRequests.refreshing}
      className="pb-5"
    >
      <div className="grid gap-3 @4xl:grid-cols-[minmax(0,1fr)_auto] @4xl:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <a
              className="inline-flex min-h-8 items-center text-xs font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
              href={branchUrl}
              rel="noreferrer noopener"
              target="_blank"
            >
              {defaultBranch}
            </a>
            <span className="text-xs text-muted-foreground">·</span>
            <a
              className="inline-flex min-h-8 items-center font-mono text-xs text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground"
              href={observation.headCommitUrl}
              rel="noreferrer noopener"
              target="_blank"
            >
              {observation.headCommitOid.slice(0, 7)}
            </a>
            <span className="text-xs text-muted-foreground">{relativeCommitTime}</span>
          </div>
          <div className="line-clamp-3 text-base font-medium leading-6 text-foreground [overflow-wrap:anywhere]">
            {observation.headCommitTitle}
          </div>
          {pullRequests.state === "stale" || pullRequests.refreshing ? (
            <div className="mt-1 flex flex-wrap gap-x-2 text-xs leading-5 text-muted-foreground">
              {pullRequests.state === "stale" ? <span>May be out of date</span> : null}
              {pullRequests.refreshing ? <span>Updating</span> : null}
            </div>
          ) : null}
        </div>
        <div className="justify-self-start @4xl:justify-self-end">
          <RepositoryChecksPopover
            checks={observation.checks}
            detailsUrl={`${observation.headCommitUrl}/checks`}
            heading={`${defaultBranch} checks`}
            statusCheckRollup={observation.statusCheckRollup}
            triggerTitle={`Show ${defaultBranch} checks`}
          />
        </div>
      </div>
      {filesReadEnabled ? (
        <div className="mt-2 flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-xs">
          <Link
            className="inline-flex min-h-8 items-center gap-1 font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
            title="Open Files in Samebase"
            to={filesHref}
          >
            <SamebaseLogoMark />
            Files
          </Link>
        </div>
      ) : null}
      {productionLoading && environmentRoots.length === 0 ? (
        <div className="grid gap-2 py-2" aria-label="Loading production destinations">
          <div className="h-3 w-44 max-w-full bg-muted motion-safe:animate-pulse" />
          <div className="h-3 w-32 max-w-full bg-muted motion-safe:animate-pulse" />
        </div>
      ) : (
        <RepositoryEnvironmentTree roots={environmentRoots} />
      )}
      {productionStatusUnavailable || productionStatusStale ? (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>
            {productionStatusUnavailable
              ? "Deploy status unavailable."
              : "Deploy status may be out of date."}
          </span>
          <Button
            size="sm"
            type="button"
            variant="outline"
            onClick={() => {
              for (const state of productionObservationStates) {
                if (state.state === "failed" || (state.state === "loaded" && state.refreshFailed)) {
                  state.reload();
                }
              }
            }}
          >
            Retry
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function BuildState({ state }: { state: EnvironmentBuildState }) {
  switch (state) {
    case "queued":
      return (
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <CircleDashed className="h-3.5 w-3.5" />
          Queued
        </span>
      );
    case "running":
      return (
        <span className="inline-flex items-center gap-1 text-sky-700 dark:text-sky-300">
          <CircleDot className="h-3.5 w-3.5" />
          Building
        </span>
      );
    case "success":
      return (
        <span className="inline-flex items-center gap-1 text-emerald-600">
          <CircleCheck className="h-3.5 w-3.5" />
          Built
        </span>
      );
    case "failure":
      return (
        <span className="inline-flex items-center gap-1 text-destructive">
          <CircleX className="h-3.5 w-3.5" />
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

function CloudflareWorkerResource({ worker }: { worker: RepositoryEnvironmentWorker }) {
  const presentation = resourceTypePresentation("Cloudflare.Worker");

  return (
    <div
      aria-label={`Cloudflare Worker ${worker.workerName}`}
      className="grid min-w-0 gap-1.5 py-2.5"
      role="group"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex h-4 w-5 shrink-0 items-center justify-center">
          {presentation.icon}
        </span>
        <span className="min-w-0 truncate text-sm font-medium leading-5 text-foreground">
          {worker.workerName}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">{presentation.label}</span>
        {worker.build.state === "available" ? (
          <a
            className="inline-flex min-h-10 shrink-0 items-center gap-1 text-sm underline decoration-border underline-offset-4 @4xl:min-h-8"
            href={worker.build.logsUrl}
            rel="noreferrer noopener"
            target="_blank"
            title={`Open build logs for ${worker.workerName}`}
          >
            <BuildState state={worker.build.buildState} />
            <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
          </a>
        ) : worker.build.state === "unrecorded" ? null : (
          <span className="shrink-0 text-sm text-muted-foreground">
            {worker.build.state === "absent"
              ? "No build"
              : worker.build.state === "loading"
                ? "Checking"
                : "Unavailable"}
          </span>
        )}
      </div>
      {worker.destination.state !== "absent" || worker.actions.length > 0 ? (
        <div className="ml-[1.875rem] flex min-w-0 items-center gap-1 text-sm">
          {worker.destination.state === "available" ? (
            <a
              className="inline-flex min-h-10 min-w-0 items-center gap-2.5 text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground @4xl:min-h-8"
              href={worker.destination.href}
              rel="noreferrer noopener"
              target="_blank"
              title={worker.destination.title}
            >
              <span className="flex h-4 w-5 shrink-0 items-center justify-center">
                <DestinationIcon href={worker.destination.href} />
              </span>
              <span className="min-w-0 break-all leading-5">{worker.destination.label}</span>
              <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
          ) : worker.destination.state === "unlinked" ? (
            <span className="inline-flex min-h-10 min-w-0 items-center gap-2.5 text-muted-foreground @4xl:min-h-8">
              <span className="flex h-4 w-5 shrink-0 items-center justify-center">
                <CloudflareProviderLogo />
              </span>
              <span className="min-w-0 break-all leading-5">{worker.destination.label}</span>
            </span>
          ) : null}
          {worker.actions.length > 0 ? (
            <EnvironmentActionsMenu actions={worker.actions} label={worker.workerName} />
          ) : null}
        </div>
      ) : null}
      {worker.destination.state !== "available" ? null : worker.destination.provenance ===
        "earlier_check" ? (
        <span className="ml-[1.875rem] text-xs leading-5 text-muted-foreground">
          May be from an earlier commit
        </span>
      ) : worker.destination.provenance === "pull_request_head" ? (
        <span className="ml-[1.875rem] font-mono text-xs leading-5 text-muted-foreground">
          {worker.destination.headCommit.slice(0, 7)}
        </span>
      ) : null}
    </div>
  );
}

function OtherPreviewProviderLogo({ provider }: { provider: RepositoryOtherPreview["provider"] }) {
  switch (provider) {
    case "cloudflare_pages":
    case "cloudflare_worker":
      return <CloudflareProviderLogo />;
    case "netlify":
      return <NetlifyProviderLogo />;
    default:
      provider satisfies never;
      return null;
  }
}

function otherPreviewProviderLabel(provider: RepositoryOtherPreview["provider"]): string {
  switch (provider) {
    case "cloudflare_pages":
      return "Cloudflare Pages";
    case "cloudflare_worker":
      return "Cloudflare Worker";
    case "netlify":
      return "Netlify";
    default:
      provider satisfies never;
      return provider;
  }
}

function OtherPreviewRow({ preview }: { preview: RepositoryOtherPreview }) {
  const providerLabel = otherPreviewProviderLabel(preview.provider);
  return (
    <div className="grid min-w-0 gap-1.5 py-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex h-4 w-5 shrink-0 items-center justify-center">
          <OtherPreviewProviderLogo provider={preview.provider} />
        </span>
        <span className="min-w-0 truncate text-sm font-medium leading-5 text-foreground">
          <span className="sr-only">{providerLabel}: </span>
          {preview.name}
        </span>
        {preview.setup.state === "connect" ? (
          <Link
            aria-label={`Connect ${providerLabel} ${preview.name} in repository settings`}
            className="inline-flex min-h-10 shrink-0 items-center text-sm underline decoration-border underline-offset-4 @4xl:min-h-8"
            search={(currentSearch) =>
              applyRepositoryDashboardProviderAddSearch({
                currentSearch,
                provider: "cloudflare",
              })
            }
            to={preview.setup.href}
          >
            Connect
          </Link>
        ) : null}
      </div>
      <div className="ml-[1.875rem] flex min-w-0 items-center text-sm">
        <a
          aria-label={`${providerLabel} ${preview.name}: ${preview.destinationLabel}`}
          className="inline-flex min-h-10 min-w-0 items-center gap-1 text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground @4xl:min-h-8"
          href={preview.href}
          rel="noreferrer noopener"
          target="_blank"
          title={`Open ${providerLabel} ${preview.destinationLabel.toLowerCase()} for ${preview.name}`}
        >
          <span className="min-w-0 truncate leading-5">{preview.destinationLabel}</span>
          <ExternalLink className="h-3 w-3 shrink-0" />
        </a>
      </div>
    </div>
  );
}

function OtherPreviews({ previews }: { previews: readonly RepositoryOtherPreview[] }) {
  if (previews.length === 0) {
    return null;
  }
  return (
    <div aria-label="Other previews" className="ml-2.5 pl-5" role="group">
      <div className="pt-3">
        <RootDirectoryLabel rootDirectory="Other previews" />
      </div>
      <div className="pb-0.5 pl-4">
        {previews.map((preview) => (
          <OtherPreviewRow key={preview.id} preview={preview} />
        ))}
      </div>
    </div>
  );
}

export function PullRequestResources({
  resource,
  settingsHref,
}: {
  resource: PullRequestResourceState | undefined;
  settingsHref: string;
}) {
  if (resource?.state === "loading") {
    return (
      <div className="ml-2.5 border-l border-border py-2 pl-5">
        <div className="h-3 w-32 bg-muted motion-safe:animate-pulse" aria-hidden="true" />
      </div>
    );
  }
  if (!resource || resource.state === "failed") {
    return resource?.state === "failed" ? (
      <div className="ml-2.5 border-l border-border py-2 pl-5 text-xs text-muted-foreground">
        Deploy status unavailable
      </div>
    ) : null;
  }
  const roots = buildPullRequestEnvironmentRoots({ resources: resource.resources });
  const otherPreviews = buildPullRequestOtherPreviews({
    resources: resource.resources,
    settingsHref,
  });
  const cloudflareBuildStatusUnavailable =
    resource.resources.cloudflareBuilds.state === "unavailable";
  if (!cloudflareBuildStatusUnavailable && roots.length === 0 && otherPreviews.length === 0) {
    return null;
  }

  return (
    <>
      {cloudflareBuildStatusUnavailable ? (
        <div className="ml-2.5 border-l border-border py-2 pl-5 text-xs text-muted-foreground">
          Could not load Cloudflare build status
        </div>
      ) : null}
      <RepositoryEnvironmentTree roots={roots} />
      <OtherPreviews previews={otherPreviews} />
    </>
  );
}
