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
  GitHubProviderLogo,
  SamebaseLogoMark,
} from "@/components/vault-dashboard/VaultDashboardLogos";
import { VaultChecksPopover } from "@/components/vault-dashboard/VaultChecksPopover";
import type {
  VaultResourceRailAction,
  VaultResourceRailRowState,
  VaultResourceRailState,
} from "@/components/vault-dashboard/vaultResourceRailModel";
import {
  buildProductionEnvironmentRoots,
  buildPullRequestEnvironmentRoots,
  type VaultEnvironmentAction,
  type VaultEnvironmentResource,
  type VaultEnvironmentRoot,
  type VaultEnvironmentWorker,
} from "@/components/vault-dashboard/vaultEnvironmentRoots";
import type {
  PullRequestResourceState,
  VaultPullRequest,
  VaultPullRequestsState,
} from "@/hooks/useVaultPullRequests";
import type {
  VaultSidebarSummariesState,
  VaultSidebarSummary,
} from "@/hooks/useVaultSidebarSummaries";
import { formatRelativeTimeAgo } from "@/lib/formatRelativeTime";
import { buildGitHubBranchTreeUrl } from "@/lib/githubUrls";
import {
  buildVaultDashboardRoute,
  buildVaultFileRoute,
  buildVaultSettingsRoute,
} from "@/lib/vaultRoutes";
import { formatRepositoryCheckSummary, type RepositoryCheckSummary } from "@/lib/repositoryChecks";
import { formatVaultProviderSetupStep } from "./vaultProviderSetup";
import { formatVaultSourceSetupStep } from "./vaultSourceSetup";
import { Link, useRouter } from "@tanstack/react-router";
import {
  AlertTriangle,
  ChevronDown,
  CircleCheck,
  CircleDashed,
  CircleDot,
  CircleX,
  ExternalLink,
  LayoutList,
  Loader2,
  MoreHorizontal,
  Settings,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { UserVaultResult } from "../../../convex/vault/contracts/getUserVaults";
import type { VaultWorkspaceSelected } from "./vaultWorkspaceModel";

export type VaultOverviewPageKind = "overview" | "settings";

type VaultOverviewPageProps = {
  developerToolsVisible: boolean;
  isRemovingVault: boolean;
  onOpenDeleteDialog: () => void;
  onRetryInfrastructureProvisioning: () => void;
  onRetryVaultDeletion: () => void;
  page: VaultOverviewPageKind;
  resourceRailState: VaultResourceRailState;
  workspace: VaultWorkspaceSelected;
};

const numberFormatter = new Intl.NumberFormat("en-US");
type EnvironmentBuildState = Extract<
  VaultEnvironmentWorker["build"],
  { state: "available" }
>["buildState"];

function repositoryRoute(vault: UserVaultResult, page: VaultOverviewPageKind): string {
  const args = { owner: vault.ghRepoOwner, repoName: vault.ghRepoName };
  return page === "settings" ? buildVaultSettingsRoute(args) : buildVaultDashboardRoute(args);
}

function RepositoryHeader({
  owner,
  page,
  repoName,
  repositoryUrl,
}: {
  owner: string;
  page: VaultOverviewPageKind;
  repoName: string;
  repositoryUrl: string;
}) {
  const overviewRoute = buildVaultDashboardRoute({ owner, repoName });
  const settingsRoute = buildVaultSettingsRoute({ owner, repoName });

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background">
      <div className="mx-auto flex w-full max-w-[1100px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 @3xl:px-6 @5xl:px-8">
        <a
          aria-label={`Open ${owner}/${repoName} on GitHub`}
          className="flex w-full min-w-0 items-start gap-2 text-left no-underline hover:no-underline @3xl:w-auto @3xl:flex-1"
          href={repositoryUrl}
          rel="noreferrer noopener"
          target="_blank"
        >
          <div className="min-w-0 flex-1 text-base">
            <span className="block line-clamp-2 text-muted-foreground [overflow-wrap:anywhere] @3xl:inline">
              {owner}/
            </span>
            <h1 className="block line-clamp-3 font-semibold text-foreground [overflow-wrap:anywhere] @3xl:ml-1 @3xl:inline">
              {repoName}
            </h1>
          </div>
          <span
            aria-hidden="true"
            className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-foreground"
          >
            <GitHubProviderLogo />
          </span>
        </a>
        <nav aria-label="Repository" className="flex w-full items-center gap-1 @3xl:w-auto">
          <Link
            aria-current={page === "overview" ? "page" : undefined}
            className={
              page === "overview"
                ? "inline-flex min-h-8 items-center gap-1.5 bg-muted px-2 text-sm font-medium text-foreground no-underline hover:no-underline"
                : "inline-flex min-h-8 items-center gap-1.5 px-2 text-sm text-muted-foreground no-underline hover:bg-muted hover:text-foreground hover:no-underline"
            }
            to={overviewRoute}
          >
            <LayoutList className="h-4 w-4" />
            Overview
          </Link>
          <Link
            aria-current={page === "settings" ? "page" : undefined}
            className={
              page === "settings"
                ? "inline-flex min-h-8 items-center gap-1.5 bg-muted px-2 text-sm font-medium text-foreground no-underline hover:no-underline"
                : "inline-flex min-h-8 items-center gap-1.5 px-2 text-sm text-muted-foreground no-underline hover:bg-muted hover:text-foreground hover:no-underline"
            }
            to={settingsRoute}
          >
            <Settings className="h-4 w-4" />
            Settings
          </Link>
        </nav>
      </div>
    </header>
  );
}

function checkStateDotClassName(state: RepositoryCheckSummary["state"]): string {
  switch (state) {
    case "success":
      return "h-2 w-2 rounded-full bg-emerald-500";
    case "failure":
      return "h-2 w-2 rounded-full bg-red-500";
    case "running":
      return "h-2 w-2 rounded-full bg-amber-500";
    case "none":
    case "neutral":
    case "unknown":
      return "h-2 w-2 rounded-full bg-muted-foreground/60";
  }
  state satisfies never;
  return "h-2 w-2 rounded-full bg-muted-foreground/60";
}

function vaultSidebarStatus(args: {
  sidebarSummaries: VaultSidebarSummariesState;
  summary: VaultSidebarSummary | undefined;
  selected: boolean;
  vault: UserVaultResult;
  workspace: VaultWorkspaceSelected | null;
}): { kind: "dot"; dotClassName: string; label: string } | { kind: "workflow"; label: string } {
  if (args.vault.deletion.state === "delete_failed") {
    return {
      kind: "dot",
      dotClassName: "h-2 w-2 rounded-full bg-red-500",
      label: "Delete failed",
    };
  }
  if (args.vault.sourceSetup.status === "failed" || args.vault.providerSetup.status === "failed") {
    return {
      kind: "dot",
      dotClassName: "h-2 w-2 rounded-full bg-red-500",
      label: "Needs attention",
    };
  }
  if (args.vault.deletion.state === "deleting") {
    return { kind: "workflow", label: "Deleting" };
  }
  if (
    args.vault.sourceSetup.status === "running" ||
    args.vault.providerSetup.status === "running"
  ) {
    return { kind: "workflow", label: "Setting up" };
  }
  if (
    args.selected &&
    args.workspace &&
    (args.workspace.pullRequests.state === "current" ||
      args.workspace.pullRequests.state === "stale") &&
    args.workspace.pullRequests.defaultBranch
  ) {
    const checks = args.workspace.pullRequests.defaultBranch.checks;
    return {
      kind: "dot",
      dotClassName: checkStateDotClassName(checks.state),
      label: formatRepositoryCheckSummary(checks),
    };
  }
  if (args.summary) {
    return {
      kind: "dot",
      dotClassName: checkStateDotClassName(args.summary.checks.state),
      label: formatRepositoryCheckSummary(args.summary.checks),
    };
  }
  if (args.sidebarSummaries.state === "failed" || args.sidebarSummaries.state === "loaded") {
    return {
      kind: "dot",
      dotClassName: "h-2 w-2 rounded-full bg-muted-foreground/50",
      label: "Checks unavailable",
    };
  }
  return {
    kind: "dot",
    dotClassName: "h-2 w-2 rounded-full bg-muted-foreground/50",
    label: "Loading checks",
  };
}

export function VaultOverviewSidebar({
  page,
  selectedVaultId,
  sidebarSummaries,
  vaults,
  workspace,
}: {
  page: VaultOverviewPageKind;
  selectedVaultId: UserVaultResult["_id"] | null;
  sidebarSummaries: VaultSidebarSummariesState;
  vaults: readonly UserVaultResult[];
  workspace: VaultWorkspaceSelected | null;
}) {
  const summaryByVaultId = new Map(
    sidebarSummaries.state === "loaded"
      ? sidebarSummaries.summaries.map((summary) => [summary.vaultId, summary])
      : [],
  );

  return (
    <nav aria-label="Vaults" className="@container min-h-full py-2">
      {vaults.map((vault) => {
        const selected = vault._id === selectedVaultId;
        const summary = summaryByVaultId.get(vault._id);
        const status = vaultSidebarStatus({
          selected,
          sidebarSummaries,
          summary,
          vault,
          workspace,
        });

        return (
          <Link
            key={vault._id}
            aria-current={selected ? "page" : undefined}
            aria-label={vault.repositoryFullName}
            className={
              selected
                ? "block min-w-0 bg-muted px-3 py-2.5 text-left no-underline hover:no-underline @max-[200px]:px-2 @max-[120px]:px-1"
                : "block min-w-0 px-3 py-2.5 text-left no-underline hover:bg-muted/60 hover:no-underline @max-[200px]:px-2 @max-[120px]:px-1"
            }
            title={vault.repositoryFullName}
            to={repositoryRoute(vault, page)}
          >
            <span className="block min-w-0 max-w-full text-sm leading-5">
              <span className="block min-w-0 truncate text-muted-foreground @max-[120px]:hidden">
                {vault.ghRepoOwner}/
              </span>
              <span className="block min-w-0 line-clamp-2 font-medium text-foreground [overflow-wrap:anywhere]">
                {vault.ghRepoName}
              </span>
            </span>
            <span className="mt-1 flex min-w-0 items-start gap-1.5 text-xs text-muted-foreground">
              <span className="mt-1 flex shrink-0">
                {status.kind === "workflow" ? (
                  <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin text-amber-600" />
                ) : (
                  <span className={status.dotClassName} />
                )}
              </span>
              <span className="min-w-0 line-clamp-2 [overflow-wrap:anywhere]">{status.label}</span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

export function VaultOverviewSidebarLoading() {
  return (
    <div aria-label="Loading vaults" className="grid gap-4 px-3 py-4">
      {[0, 1, 2].map((index) => (
        <div key={index} className="grid gap-2" aria-hidden="true">
          <div className="h-3 w-16 bg-muted motion-safe:animate-pulse" />
          <div className="h-4 w-28 max-w-full bg-muted motion-safe:animate-pulse" />
          <div className="h-3 w-24 max-w-full bg-muted motion-safe:animate-pulse" />
        </div>
      ))}
    </div>
  );
}

function DestinationIcon({ href, provider }: { href: string; provider: "cloudflare" | "convex" }) {
  const [faviconFailed, setFaviconFailed] = useState(false);
  let origin: URL;
  try {
    origin = new URL(href);
  } catch {
    return provider === "convex" ? <ConvexProviderLogo /> : <CloudflareProviderLogo />;
  }

  if (provider === "convex" || origin.hostname.endsWith(".workers.dev") || faviconFailed) {
    return provider === "convex" ? <ConvexProviderLogo /> : <CloudflareProviderLogo />;
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

function RootDirectoryLabel({ rootDirectory }: { rootDirectory: string }) {
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
  actions: readonly VaultEnvironmentAction[];
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
        {actions.map((action) => (
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
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DestinationResource({
  resource,
}: {
  resource: Extract<VaultEnvironmentResource, { kind: "destination" }>;
}) {
  return (
    <div className="flex min-h-10 min-w-0 items-center gap-1 py-1.5">
      <a
        className="inline-flex min-h-10 min-w-0 items-center gap-2.5 text-foreground no-underline hover:no-underline"
        href={resource.href}
        rel="noreferrer noopener"
        target="_blank"
        title={resource.title}
      >
        <span className="flex h-4 w-5 shrink-0 items-center justify-center">
          <DestinationIcon href={resource.href} provider={resource.provider} />
        </span>
        <span className="min-w-0 truncate text-sm font-medium leading-5 underline decoration-border underline-offset-4">
          {resource.label}
        </span>
        <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
      </a>
      {resource.actions.length > 0 ? (
        <EnvironmentActionsMenu actions={resource.actions} label={resource.label} />
      ) : null}
    </div>
  );
}

function VaultEnvironmentResourceRow({ resource }: { resource: VaultEnvironmentResource }) {
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
    default:
      resource satisfies never;
      return null;
  }
}

function VaultEnvironmentTree({ roots }: { roots: readonly VaultEnvironmentRoot[] }) {
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
                <VaultEnvironmentResourceRow resource={resource} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function LoadingLines({ rows = 3 }: { rows?: number }) {
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

function DefaultBranchSection({
  filesReadEnabled,
  workspace,
}: {
  filesReadEnabled: boolean;
  workspace: VaultWorkspaceSelected;
}) {
  const pullRequests = workspace.pullRequests;
  const defaultBranch = workspace.vault.defaultBranch?.trim();

  if (pullRequests.state === "loading") {
    return (
      <section aria-label="Loading default branch" className="pb-5">
        <LoadingLines rows={2} />
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
    repositoryFullName: workspace.vault.repositoryFullName,
  });
  const schemaGraphEnabled =
    workspace.access.state === "ready" &&
    workspace.access.accessKeys.includes("access_schema_graph");
  const filesHref = buildVaultFileRoute({
    owner: workspace.vault.ghRepoOwner,
    repoName: workspace.vault.ghRepoName,
    branch: defaultBranch,
  });
  const productionLoading =
    workspace.cloudflareObservations.workers.state === "loading" ||
    workspace.cloudflareObservations.builds.state === "loading" ||
    workspace.convexObservations.state === "loading";
  const environmentRoots = buildProductionEnvironmentRoots({
    branch: defaultBranch,
    convexObservationState: workspace.convexObservations.state,
    convexProjects: workspace.vault.convexProjects,
    owner: workspace.vault.ghRepoOwner,
    productionRoots: workspace.productionRoots,
    repoName: workspace.vault.ghRepoName,
    filesReadEnabled,
    schemaGraphEnabled,
  });

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
          <VaultChecksPopover
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
        <VaultEnvironmentTree roots={environmentRoots} />
      )}
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
        <span className="inline-flex items-center gap-1 text-amber-700">
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

function CloudflareWorkerResource({ worker }: { worker: VaultEnvironmentWorker }) {
  return (
    <div className="grid min-w-0 gap-1.5 py-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex h-4 w-5 shrink-0 items-center justify-center">
          <CloudflareProviderLogo />
        </span>
        <span className="min-w-0 truncate text-sm font-medium leading-5 text-foreground">
          {worker.workerName}
        </span>
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
        ) : (
          <span className="shrink-0 text-sm text-muted-foreground">
            {worker.build.state === "absent" ? "No build" : "Unavailable"}
          </span>
        )}
      </div>
      {worker.destination.state === "available" || worker.actions.length > 0 ? (
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
                <DestinationIcon href={worker.destination.href} provider="cloudflare" />
              </span>
              <span className="min-w-0 break-all leading-5">{worker.destination.label}</span>
              <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
          ) : null}
          {worker.actions.length > 0 ? (
            <EnvironmentActionsMenu actions={worker.actions} label={worker.workerName} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function PullRequestResources({ resource }: { resource: PullRequestResourceState | undefined }) {
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
  if (resource.resources.workers.length === 0) {
    return null;
  }

  const roots = buildPullRequestEnvironmentRoots(resource.resources);

  return <VaultEnvironmentTree roots={roots} />;
}

function SamebaseChangesLink({ href }: { href: string }) {
  const router = useRouter();

  return (
    <a
      className="inline-flex min-h-10 items-center gap-1 font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground @4xl:min-h-8"
      href={href}
      title="View this branch's changes in Samebase"
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
    >
      <span aria-hidden="true" className="flex h-4 w-4 items-center justify-center">
        <SamebaseLogoMark />
      </span>
      View changes
    </a>
  );
}

function PullRequestRow({
  filesReadEnabled,
  pullRequest,
  resource,
  vault,
}: {
  filesReadEnabled: boolean;
  pullRequest: VaultPullRequest;
  resource: PullRequestResourceState | undefined;
  vault: UserVaultResult;
}) {
  const [expanded, setExpanded] = useState(false);
  const sameRepository = !pullRequest.isCrossRepository && pullRequest.headRepository !== null;
  const samebaseUrl =
    filesReadEnabled && sameRepository
      ? buildVaultFileRoute({
          owner: vault.ghRepoOwner,
          repoName: vault.ghRepoName,
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
              <VaultChecksPopover
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

function PullRequestsSection({
  filesReadEnabled,
  pullRequests,
  vault,
}: {
  filesReadEnabled: boolean;
  pullRequests: VaultPullRequestsState;
  vault: UserVaultResult;
}) {
  if (pullRequests.state === "not_requested") {
    return null;
  }

  return (
    <section aria-labelledby="vault-pull-requests-heading">
      <h2
        id="vault-pull-requests-heading"
        className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground"
      >
        Open pull requests
      </h2>
      <div className="border-t border-border">
        {pullRequests.state === "loading" ? (
          <div className="px-1 py-4">
            <LoadingLines />
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
            {pullRequests.state === "stale" || pullRequests.resourceState === "stale" ? (
              <div className="border-b border-border px-1 py-2 text-xs text-muted-foreground">
                Some pull request data may be out of date.
              </div>
            ) : null}
            {pullRequests.allPullRequests.map((pullRequest) => (
              <PullRequestRow
                filesReadEnabled={filesReadEnabled}
                key={pullRequest.id}
                pullRequest={pullRequest}
                resource={pullRequests.resourcesByPullRequestId.get(pullRequest.id)}
                vault={vault}
              />
            ))}
            {pullRequests.allPullRequests.length === 0 ? (
              <div className="py-4 text-sm text-muted-foreground">No open pull requests.</div>
            ) : null}
            {pullRequests.isLoadingMore ? (
              <div className="py-3 text-xs text-muted-foreground">Loading more</div>
            ) : pullRequests.loadMoreFailed ? (
              <div className="py-3 text-xs text-muted-foreground">
                Could not load more pull requests.
              </div>
            ) : pullRequests.canLoadMore ? (
              <VaultPullRequestLoadMoreSentinel loadMore={pullRequests.loadMore} />
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}

function VaultPullRequestLoadMoreSentinel({ loadMore }: { loadMore: () => void }) {
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

function VaultStateNotice({
  onRetryInfrastructureProvisioning,
  onRetryVaultDeletion,
  vault,
}: {
  onRetryInfrastructureProvisioning: () => void;
  onRetryVaultDeletion: () => void;
  vault: UserVaultResult;
}) {
  if (vault.deletion.state === "delete_failed") {
    return (
      <div className="border border-red-200 bg-red-50 px-4 py-3 text-red-950">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" />
            <div className="min-w-0">
              <div className="text-sm font-medium">Vault removal failed</div>
              <div className="mt-1 text-xs leading-5 text-red-800">
                {vault.deletion.message || vault.deletion.lastError}
              </div>
            </div>
          </div>
          <Button size="sm" type="button" variant="outline" onClick={onRetryVaultDeletion}>
            Retry
          </Button>
        </div>
      </div>
    );
  }
  if (vault.deletion.state === "deleting") {
    return (
      <div className="border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        {vault.deletion.message || "Removing this vault."}
      </div>
    );
  }
  if (vault.sourceSetup.status === "failed") {
    return (
      <div className="border border-red-200 bg-red-50 px-4 py-3 text-red-950">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" />
          <div className="min-w-0">
            <div className="text-sm font-medium">Repository setup failed</div>
            <div className="mt-1 text-xs leading-5 text-red-800">{vault.sourceSetup.message}</div>
          </div>
        </div>
      </div>
    );
  }
  if (vault.providerSetup.status === "failed") {
    return (
      <div className="border border-red-200 bg-red-50 px-4 py-3 text-red-950">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" />
            <div className="min-w-0">
              <div className="text-sm font-medium">Provider setup failed</div>
              <div className="mt-1 text-xs leading-5 text-red-800">
                {vault.providerSetup.message}
              </div>
            </div>
          </div>
          <Button
            size="sm"
            type="button"
            variant="outline"
            onClick={onRetryInfrastructureProvisioning}
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }
  return null;
}

function rowValue(row: VaultResourceRailRowState): string | undefined {
  switch (row.status) {
    case "action_required":
      return undefined;
    case "available":
    case "failed":
    case "loading":
    case "missing":
      return row.value;
  }
  row satisfies never;
  return undefined;
}

function rowDescription(row: VaultResourceRailRowState): string | undefined {
  switch (row.status) {
    case "action_required":
      return undefined;
    case "available":
      return row.loadingDescription ?? row.description;
    case "failed":
    case "loading":
    case "missing":
      return row.description;
  }
  row satisfies never;
  return undefined;
}

function rowActions(
  row: VaultResourceRailRowState,
): readonly VaultResourceRailAction[] | undefined {
  switch (row.status) {
    case "action_required":
    case "available":
    case "failed":
    case "missing":
      return row.actions;
    case "loading":
      return undefined;
  }
  row satisfies never;
  return undefined;
}

function providerIcon(provider: "cloudflare" | "convex" | "github"): ReactNode {
  switch (provider) {
    case "cloudflare":
      return <CloudflareProviderLogo />;
    case "convex":
      return <ConvexProviderLogo />;
    case "github":
      return <GitHubProviderLogo />;
  }
  provider satisfies never;
  return null;
}

function invokeResourceAction(action: VaultResourceRailAction) {
  if (!action.disabled) {
    action.onClick?.();
  }
}

function ResourceActions({ row }: { row: VaultResourceRailRowState }) {
  const actions = rowActions(row);
  if (!actions) {
    return null;
  }
  const directActions = actions.filter((action) => action.kind !== "remove");
  const removeActions = actions.filter((action) => action.kind === "remove");

  return (
    <div className="flex flex-wrap items-center gap-1">
      {directActions.map((action) => (
        <Button
          key={`${action.kind}:${action.label}`}
          disabled={action.disabled || (!action.href && !action.onClick)}
          size="sm"
          type="button"
          variant="outline"
          onClick={() => invokeResourceAction(action)}
        >
          {action.label}
        </Button>
      ))}
      {removeActions.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild nativeButton>
            <Button aria-label="Resource actions" size="icon-sm" type="button" variant="ghost">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44 rounded-none shadow-none">
            {removeActions.map((action) => (
              <DropdownMenuItem
                key={`${action.kind}:${action.label}`}
                disabled={action.disabled || (!action.href && !action.onClick)}
                variant="destructive"
                onClick={() => invokeResourceAction(action)}
              >
                {action.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}

function resourceOwner(row: VaultResourceRailRowState, workspace: VaultWorkspaceSelected): string {
  if (row.provider === "github") {
    return workspace.vault.ghRepoOwner;
  }
  if (row.provider === "convex") {
    if (row.status !== "action_required" && row.scope) {
      return row.scope;
    }
    const project = workspace.vault.convexProjects.find(
      (candidate) => row.rowId === `convex:${candidate.convexProjectId}`,
    );
    return project?.teamId ?? "Convex";
  }
  const worker = workspace.vault.cloudflareWorkers.find(
    (candidate) => row.rowId === `cloudflare:${candidate.workerId}`,
  );
  if (!worker) {
    return "Cloudflare";
  }
  const connection =
    workspace.cloudflareConnection.state === "ready"
      ? workspace.cloudflareConnection.connection
      : undefined;
  return connection?.connected === true &&
    connection.accountId === worker.accountId &&
    connection.accountName
    ? connection.accountName
    : worker.accountId;
}

function SettingsResourceRow({
  row,
  workspace,
}: {
  row: VaultResourceRailRowState<"cloudflare" | "convex">;
  workspace: VaultWorkspaceSelected;
}) {
  const value = rowValue(row);
  const description = rowDescription(row);
  const isAttention = row.status === "failed" || row.status === "missing";
  const actions = rowActions(row);
  const onlyRemoveActions =
    actions !== undefined &&
    actions.length > 0 &&
    actions.every((action) => action.kind === "remove");

  if (row.status === "action_required") {
    return null;
  }

  return (
    <div className="relative grid min-w-0 gap-3 py-2.5 @3xl:grid-cols-[minmax(0,1fr)_auto] @3xl:items-center">
      <div
        className={
          onlyRemoveActions
            ? "flex min-w-0 items-start gap-2.5 pr-10 @3xl:pr-0"
            : "flex min-w-0 items-start gap-2.5"
        }
      >
        <span
          aria-label={row.provider === "cloudflare" ? "Cloudflare" : "Convex"}
          className="mt-0.5 flex h-4 w-5 shrink-0 items-center justify-center"
          role="img"
        >
          {providerIcon(row.provider)}
        </span>
        <div className="min-w-0">
          <div className="line-clamp-2 text-xs leading-4 text-muted-foreground">
            {resourceOwner(row, workspace)}/
          </div>
          {row.status === "loading" ? (
            <div className="mt-1 h-4 w-32 max-w-full bg-muted motion-safe:animate-pulse" />
          ) : row.status === "available" && row.href && value ? (
            <a
              className="line-clamp-2 text-sm font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
              href={row.href}
              rel="noreferrer noopener"
              target="_blank"
            >
              {value}
            </a>
          ) : (
            <div className="line-clamp-2 text-sm font-medium text-foreground">{value}</div>
          )}
          {description ? (
            <div
              className={
                isAttention
                  ? "mt-1 text-xs leading-5 text-red-700"
                  : "mt-1 text-xs leading-5 text-muted-foreground"
              }
            >
              {description}
            </div>
          ) : null}
        </div>
      </div>
      <div
        className={
          onlyRemoveActions
            ? "absolute right-0 top-1.5 @3xl:static @3xl:justify-self-end"
            : "justify-self-start @3xl:justify-self-end"
        }
      >
        <ResourceActions row={row} />
      </div>
    </div>
  );
}

function SettingsRoot({
  rootDirectory,
  rows,
  workspace,
}: {
  rootDirectory: string;
  rows: readonly VaultResourceRailRowState<"cloudflare" | "convex">[];
  workspace: VaultWorkspaceSelected;
}) {
  return (
    <div className="grid min-w-0 border-b border-border/60 last:border-b-0 @4xl:grid-cols-[minmax(10rem,0.32fr)_minmax(0,1fr)]">
      <div className="min-w-0 pb-1 pt-4 @4xl:py-3 @4xl:pr-5">
        <RootDirectoryLabel rootDirectory={rootDirectory} />
      </div>
      <div className="min-w-0 pb-2 pl-5 @4xl:border-l @4xl:pb-0 @4xl:pl-5">
        {rows.map((row) => (
          <SettingsResourceRow key={row.rowId} row={row} workspace={workspace} />
        ))}
      </div>
    </div>
  );
}

function AddResourceButton({
  label,
  logo,
  row,
}: {
  label: string;
  logo: ReactNode;
  row: VaultResourceRailRowState;
}) {
  const action = rowActions(row)?.at(0);
  return (
    <Button
      disabled={!action || action.disabled || (!action.href && !action.onClick)}
      size="sm"
      type="button"
      variant="outline"
      onClick={() => {
        if (action) invokeResourceAction(action);
      }}
    >
      {logo}
      {label}
    </Button>
  );
}

function RepositorySettings({
  developerToolsVisible,
  isRemovingVault,
  onOpenDeleteDialog,
  resourceRailState,
  workspace,
}: Pick<
  VaultOverviewPageProps,
  | "developerToolsVisible"
  | "isRemovingVault"
  | "onOpenDeleteDialog"
  | "resourceRailState"
  | "workspace"
>) {
  const convexAddRow = resourceRailState.vaultActionRows.find((row) => row.provider === "convex");
  const cloudflareAddRow = resourceRailState.vaultActionRows.find(
    (row) => row.provider === "cloudflare",
  );
  const deleteAction =
    workspace.vault.deletion.state === "not_deleting"
      ? workspace.vault.deletion.deleteAction
      : { state: "disabled" as const, reason: "Vault removal is already in progress." };

  return (
    <main className="mx-auto grid w-full max-w-[960px] gap-8 px-4 py-6 @3xl:px-6 @5xl:px-8 @5xl:py-8">
      <section aria-labelledby="vault-settings-repository-heading">
        <h2
          id="vault-settings-repository-heading"
          className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground"
        >
          Repository
        </h2>
        <div className="border-t border-border py-3">
          <a
            className="flex min-w-0 items-start gap-2.5 text-foreground no-underline hover:no-underline"
            href={workspace.githubRepositoryUrl}
            rel="noreferrer noopener"
            target="_blank"
          >
            <span className="mt-0.5 flex h-4 w-5 shrink-0 items-center justify-center">
              <GitHubProviderLogo />
            </span>
            <span className="min-w-0">
              <span className="block line-clamp-2 text-xs text-muted-foreground">
                {workspace.vault.ghRepoOwner}/
              </span>
              <span className="block line-clamp-2 text-sm font-medium underline decoration-border underline-offset-4">
                {workspace.vault.ghRepoName}
              </span>
            </span>
          </a>
        </div>
      </section>

      {resourceRailState.attentionRows.length > 0 ? (
        <section aria-labelledby="vault-settings-attention-heading">
          <h2
            id="vault-settings-attention-heading"
            className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-red-700"
          >
            Attention required
          </h2>
          <div className="border-t border-border">
            <SettingsRoot
              rootDirectory="Needs attention"
              rows={resourceRailState.attentionRows}
              workspace={workspace}
            />
          </div>
        </section>
      ) : null}

      <section aria-labelledby="vault-settings-connections-heading">
        <div className="mb-3 grid gap-3 @4xl:grid-cols-[minmax(0,1fr)_auto] @4xl:items-end">
          <h2
            id="vault-settings-connections-heading"
            className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground"
          >
            Connections
          </h2>
          <div className="flex flex-wrap gap-2">
            {cloudflareAddRow ? (
              <AddResourceButton
                label="Add Cloudflare Worker"
                logo={<CloudflareProviderLogo />}
                row={cloudflareAddRow}
              />
            ) : null}
            {convexAddRow ? (
              <AddResourceButton
                label="Add Convex project"
                logo={<ConvexProviderLogo />}
                row={convexAddRow}
              />
            ) : null}
          </div>
        </div>
        <div className="border-t border-border">
          {resourceRailState.roots.length > 0 ? (
            resourceRailState.roots.map((root) => (
              <SettingsRoot
                key={root.rootDirectory}
                rootDirectory={root.rootDirectory}
                rows={root.rows}
                workspace={workspace}
              />
            ))
          ) : (
            <div className="py-4 text-sm text-muted-foreground">
              No Cloudflare Workers or Convex projects are connected.
            </div>
          )}
        </div>
      </section>

      <section aria-labelledby="vault-settings-remove-heading">
        <h2
          id="vault-settings-remove-heading"
          className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground"
        >
          Remove vault
        </h2>
        <div className="grid gap-3 border-t border-border py-4 @3xl:grid-cols-[minmax(0,1fr)_auto] @3xl:items-center">
          <p className="max-w-xl text-xs leading-5 text-muted-foreground">
            {deleteAction.state === "disabled"
              ? deleteAction.reason
              : "Review repository and provider cleanup before anything is removed."}
          </p>
          <Button
            className="justify-self-start @3xl:justify-self-end"
            disabled={deleteAction.state === "disabled" || isRemovingVault}
            size="sm"
            type="button"
            variant="destructive"
            onClick={onOpenDeleteDialog}
          >
            {isRemovingVault ? "Removing..." : "Remove vault"}
          </Button>
        </div>
      </section>
      {developerToolsVisible ? (
        <VaultWorkspaceDataInspector resourceRailState={resourceRailState} workspace={workspace} />
      ) : null}
    </main>
  );
}

function serializePullRequests(pullRequests: VaultPullRequestsState) {
  if (pullRequests.state !== "current" && pullRequests.state !== "stale") {
    return pullRequests;
  }
  return {
    ...pullRequests,
    loadMore: undefined,
    resourcesByPullRequestId: [...pullRequests.resourcesByPullRequestId.entries()],
  };
}

function DataObject({ label, value }: { label: string; value: unknown }) {
  return (
    <details className="border-t border-border py-2">
      <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
        {label}
      </summary>
      <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-words bg-muted p-3 text-xs">
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}

function VaultWorkspaceDataInspector({
  resourceRailState,
  workspace,
}: {
  resourceRailState: VaultResourceRailState;
  workspace: VaultWorkspaceSelected;
}) {
  return (
    <section aria-labelledby="vault-data-inspector-heading">
      <h2
        id="vault-data-inspector-heading"
        className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground"
      >
        Data inspector
      </h2>
      <div className="border-b border-border">
        <DataObject label="Vault contract" value={workspace.vault} />
        <DataObject
          label="GitHub observations"
          value={serializePullRequests(workspace.pullRequests)}
        />
        <DataObject label="Cloudflare observations" value={workspace.cloudflareObservations} />
        <DataObject label="Convex observations" value={workspace.convexObservations} />
        <DataObject
          label="Derived presentation"
          value={{ productionRoots: workspace.productionRoots, resourceRailState }}
        />
      </div>
    </section>
  );
}

export function VaultOverviewPage({
  developerToolsVisible,
  isRemovingVault,
  onOpenDeleteDialog,
  onRetryInfrastructureProvisioning,
  onRetryVaultDeletion,
  page,
  resourceRailState,
  workspace,
}: VaultOverviewPageProps) {
  const filesReadEnabled =
    workspace.access.state === "ready" && workspace.access.accessKeys.includes("access_files_read");
  const provisioningLabel =
    workspace.vault.sourceSetup.status === "running"
      ? formatVaultSourceSetupStep(workspace.vault.sourceSetup.step)
      : workspace.vault.providerSetup.status === "running"
        ? formatVaultProviderSetupStep(workspace.vault.providerSetup.step)
        : null;

  return (
    <div className="min-h-full bg-background text-foreground">
      <RepositoryHeader
        owner={workspace.vault.ghRepoOwner}
        page={page}
        repoName={workspace.vault.ghRepoName}
        repositoryUrl={workspace.githubRepositoryUrl}
      />
      {page === "settings" ? (
        <RepositorySettings
          developerToolsVisible={developerToolsVisible}
          isRemovingVault={isRemovingVault}
          onOpenDeleteDialog={onOpenDeleteDialog}
          resourceRailState={resourceRailState}
          workspace={workspace}
        />
      ) : (
        <main className="mx-auto grid w-full max-w-[1100px] gap-8 px-4 py-6 @3xl:px-6 @5xl:px-8 @5xl:py-8">
          {provisioningLabel ? (
            <section
              aria-live="polite"
              className="flex min-w-0 items-center gap-3 py-2"
              role="status"
            >
              <Loader2
                aria-hidden="true"
                className="h-4 w-4 shrink-0 animate-spin text-muted-foreground"
              />
              <span className="min-w-0 text-sm font-medium text-foreground">
                {provisioningLabel}
              </span>
            </section>
          ) : (
            <>
              <VaultStateNotice
                onRetryInfrastructureProvisioning={onRetryInfrastructureProvisioning}
                onRetryVaultDeletion={onRetryVaultDeletion}
                vault={workspace.vault}
              />
              <DefaultBranchSection filesReadEnabled={filesReadEnabled} workspace={workspace} />
              <PullRequestsSection
                filesReadEnabled={filesReadEnabled}
                pullRequests={workspace.pullRequests}
                vault={workspace.vault}
              />
              {developerToolsVisible ? (
                <VaultWorkspaceDataInspector
                  resourceRailState={resourceRailState}
                  workspace={workspace}
                />
              ) : null}
            </>
          )}
        </main>
      )}
      <div aria-hidden="true" className="h-[20svh] min-h-20" />
    </div>
  );
}

export function VaultOverviewLoadingPage({
  owner,
  page,
  repoName,
}: {
  owner: string;
  page: VaultOverviewPageKind;
  repoName: string;
}) {
  return (
    <div className="min-h-full bg-background text-foreground">
      <RepositoryHeader
        owner={owner}
        page={page}
        repoName={repoName}
        repositoryUrl={`https://github.com/${owner}/${repoName}`}
      />
      <main
        aria-busy="true"
        aria-label="Loading vault overview"
        className="mx-auto grid w-full max-w-[1100px] gap-8 px-4 py-6 @3xl:px-6 @5xl:px-8 @5xl:py-8"
      >
        <section className="border-b border-border pb-5">
          <LoadingLines rows={2} />
        </section>
        <section>
          <div className="mb-3 h-3 w-32 bg-muted motion-safe:animate-pulse" />
          <div className="border-t border-border py-4">
            <LoadingLines />
          </div>
        </section>
      </main>
    </div>
  );
}
