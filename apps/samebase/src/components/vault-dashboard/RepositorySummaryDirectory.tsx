import { Link } from "@tanstack/react-router";
import type { PaginationStatus } from "convex/react";
import {
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleX,
  GitBranch,
  GitPullRequest,
  Loader2,
} from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { VaultDashboardSidebarContent } from "@/components/vault-dashboard/VaultDashboardChrome";
import type { RepositorySummaryDirectoryEntry } from "@/hooks/useRepositorySummaryDirectory";
import { formatRelativeTimeAgo } from "@/lib/formatRelativeTime";
import { buildVaultDashboardRoute } from "@/lib/vaultRoutes";
import { applySearchPatch } from "@/routing/searchFlags";
import {
  DASHBOARD_ADD_APP_ROOT_QUERY_PARAM,
  DASHBOARD_PROVIDER_APP_ROOT_QUERY_PARAM,
} from "@/routeSearch/root";
import { clsx } from "clsx";
import type { Id } from "../../../convex/_generated/dataModel";
import { parseRepositoryFullName } from "../../../shared/repoName";

const pullRequestCountFormat = new Intl.NumberFormat("en-US");

function RepositoryCheckState({ state }: { state: "failure" | "none" | "running" | "success" }) {
  switch (state) {
    case "failure":
      return <CircleX aria-label="Checks failing" className="h-3.5 w-3.5 shrink-0 text-red-600" />;
    case "none":
      return (
        <CircleDashed
          aria-label="No checks"
          className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
        />
      );
    case "running":
      return (
        <Loader2
          aria-label="Checks running"
          className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground"
        />
      );
    case "success":
      return (
        <CircleCheck aria-label="Checks passing" className="h-3.5 w-3.5 shrink-0 text-green-600" />
      );
    default:
      state satisfies never;
      return null;
  }
}

function RepositorySummaryLifecycleStatus({
  lifecycle,
}: {
  lifecycle: Extract<
    RepositorySummaryDirectoryEntry["state"],
    { state: "connected" }
  >["summary"]["lifecycle"];
}): ReactNode {
  switch (lifecycle.state) {
    case "idle":
      return null;
    case "updating":
      return (
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Updating
        </span>
      );
    case "waiting":
      return (
        <span
          className="text-amber-700"
          title={`GitHub rate limit resumes at ${new Date(lifecycle.retryAt).toISOString()}`}
        >
          Waiting for GitHub
        </span>
      );
    case "failed":
      return (
        <span className="text-amber-700" title={lifecycle.message}>
          Update failed
        </span>
      );
    case "unavailable":
      return <span className="text-amber-700">Repository unavailable</span>;
    default:
      lifecycle satisfies never;
      return null;
  }
}

function UnobservedRepositoryStatus({
  lifecycle,
}: {
  lifecycle: Extract<
    RepositorySummaryDirectoryEntry["state"],
    { state: "connected" }
  >["summary"]["lifecycle"];
}) {
  switch (lifecycle.state) {
    case "idle":
      return <span>Not observed yet</span>;
    case "updating":
      return (
        <span className="inline-flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          Loading repository
        </span>
      );
    case "waiting":
      return <span className="text-amber-700">Waiting for GitHub</span>;
    case "failed":
      return (
        <span className="text-amber-700" title={lifecycle.message}>
          Update failed
        </span>
      );
    case "unavailable":
      return <span className="text-amber-700">Repository unavailable</span>;
    default:
      lifecycle satisfies never;
      return null;
  }
}

function ConnectedRepositorySummary({
  now,
  state,
}: {
  now: number;
  state: Extract<RepositorySummaryDirectoryEntry["state"], { state: "connected" }>;
}) {
  const { lifecycle, publication } = state.summary;
  if (publication.state === "unobserved") {
    return <UnobservedRepositoryStatus lifecycle={lifecycle} />;
  }

  const lifecycleStatus =
    lifecycle.state === "idle" ? null : <RepositorySummaryLifecycleStatus lifecycle={lifecycle} />;
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
      {publication.defaultBranch.state === "ready" ? (
        <>
          <RepositoryCheckState state={publication.defaultBranch.checkState} />
          <GitBranch className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 truncate">{publication.defaultBranch.name}</span>
        </>
      ) : (
        <span>No default branch</span>
      )}
      <span aria-hidden="true">·</span>
      <GitPullRequest className="h-3.5 w-3.5 shrink-0" />
      <span>{pullRequestCountFormat.format(publication.openPullRequestCount)} PRs</span>
      <span aria-hidden="true">·</span>
      <span title={`Checked ${new Date(publication.checkedAt).toISOString()}`}>
        {formatRelativeTimeAgo(publication.checkedAt, now)}
      </span>
      {lifecycleStatus ? (
        <>
          <span aria-hidden="true">·</span>
          {lifecycleStatus}
        </>
      ) : null}
    </span>
  );
}

function RepositoryDirectoryEntryStatus({
  entry,
  now,
}: {
  entry: RepositorySummaryDirectoryEntry;
  now: number;
}) {
  switch (entry.state.state) {
    case "connected":
      return <ConnectedRepositorySummary now={now} state={entry.state} />;
    case "provisioning":
      return (
        <span className="inline-flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          Connecting repository
        </span>
      );
    case "setup_failed":
      return (
        <span className="inline-flex items-center gap-1 text-amber-700">
          <CircleAlert className="h-3.5 w-3.5" />
          Setup failed
        </span>
      );
    case "deleting":
      return (
        <span className="inline-flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          Removing vault
        </span>
      );
    case "delete_failed":
      return (
        <span className="inline-flex items-center gap-1 text-amber-700">
          <CircleAlert className="h-3.5 w-3.5" />
          Removal failed
        </span>
      );
    default:
      entry.state satisfies never;
      return null;
  }
}

export function RepositorySummaryDirectoryList({
  entries,
  error,
  loadMore,
  now,
  selectedVaultId,
  status,
}: {
  entries: readonly RepositorySummaryDirectoryEntry[];
  error: string | null;
  loadMore: () => void;
  now: number;
  selectedVaultId: Id<"vaults"> | null;
  status: PaginationStatus;
}) {
  const loadingFirstPage = status === "LoadingFirstPage" && entries.length === 0;

  return (
    <VaultDashboardSidebarContent>
      <nav aria-label="Vaults" data-testid="repository-summary-directory" className="p-2">
        {loadingFirstPage ? (
          <div className="flex min-h-10 items-center justify-center text-muted-foreground">
            <Loader2 aria-label="Loading vaults" className="h-4 w-4 animate-spin" />
          </div>
        ) : null}
        <ul className="space-y-1">
          {entries.map((entry) => {
            const isSelected = entry.vaultId === selectedVaultId;
            const { owner, name: repoName } = parseRepositoryFullName(entry.repositoryFullName);

            return (
              <li key={entry.vaultId} data-testid="repository-summary-directory-row">
                <Link
                  resetScroll={isSelected ? false : undefined}
                  to={buildVaultDashboardRoute({ owner, repoName })}
                  search={(currentSearch) =>
                    applySearchPatch(currentSearch, {
                      [DASHBOARD_ADD_APP_ROOT_QUERY_PARAM]: null,
                      [DASHBOARD_PROVIDER_APP_ROOT_QUERY_PARAM]: null,
                      "add-cloudflare": null,
                      "add-convex": null,
                      delete: null,
                    })
                  }
                  title={entry.repositoryFullName}
                  className={clsx(
                    "flex min-h-12 min-w-0 flex-col justify-center px-2 py-1.5 text-sm leading-5 no-underline transition-colors hover:no-underline",
                    isSelected ? "bg-muted text-foreground" : "text-foreground hover:bg-muted/60",
                  )}
                >
                  <span className="truncate font-medium">{entry.repositoryFullName}</span>
                  <span className="min-w-0 text-xs leading-4 text-muted-foreground">
                    <RepositoryDirectoryEntryStatus entry={entry} now={now} />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
        {error ? (
          <div className="px-2 py-2 text-xs text-destructive" title={error}>
            Could not update vaults.
          </div>
        ) : null}
        {status === "CanLoadMore" || status === "LoadingMore" ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-1 w-full"
            disabled={status === "LoadingMore"}
            onClick={loadMore}
          >
            {status === "LoadingMore" ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading
              </>
            ) : (
              "Load more"
            )}
          </Button>
        ) : null}
      </nav>
    </VaultDashboardSidebarContent>
  );
}

export function RepositorySummaryDirectoryHeader() {
  return <div className="flex h-full items-center px-2 text-sm font-medium">Vaults</div>;
}

export function RepositorySummaryDirectoryPane(
  props: Parameters<typeof RepositorySummaryDirectoryList>[0],
) {
  return (
    <div className="flex min-h-full min-w-0 flex-col">
      <div className="flex h-8 shrink-0 items-center border-b border-border">
        <RepositorySummaryDirectoryHeader />
      </div>
      <RepositorySummaryDirectoryList {...props} />
    </div>
  );
}
