import { Button } from "@/components/ui/button";
import { GitHubProviderLogo } from "@/components/vault-dashboard/VaultDashboardLogos";
import {
  DefaultBranchSection,
  VaultOverviewLoadingLines,
} from "@/components/vault-dashboard/VaultEnvironmentTree";
import { PullRequestsSection } from "@/components/vault-dashboard/VaultPullRequestsSection";
import { RepositorySettings } from "@/components/vault-dashboard/VaultRepositorySettings";
import { VaultWorkspaceDataInspector } from "@/components/vault-dashboard/VaultWorkspaceDataInspector";
import type { VaultRepositorySettingsState } from "@/components/vault-dashboard/vaultRepositorySettingsState";
import { buildVaultDashboardRoute, buildVaultSettingsRoute } from "@/lib/vaultRoutes";
import { formatVaultProviderSetupStep } from "./vaultProviderSetup";
import { formatVaultSourceSetupStep } from "./vaultSourceSetup";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, LayoutList, Loader2, Settings } from "lucide-react";
import type { UserVaultResult } from "../../../convex/vault/contracts/getUserVaults";
import type { VaultWorkspaceSelected } from "./vaultWorkspaceModel";

export type VaultOverviewPageKind = "overview" | "settings";

type VaultOverviewPageProps = {
  developerToolsVisible: boolean;
  isRetryingVaultAction: boolean;
  onOpenDeleteDialog: () => void;
  onRetryInfrastructureProvisioning: () => void;
  onRetryVaultDeletion: () => void;
  page: VaultOverviewPageKind;
  settingsState: VaultRepositorySettingsState;
  workspace: VaultWorkspaceSelected;
};

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

function FailureNotice({
  description,
  isRetrying,
  onRetry,
  title,
}: {
  description: string;
  isRetrying?: boolean;
  onRetry?: () => void;
  title: string;
}) {
  const content = (
    <>
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" />
      <div className="min-w-0">
        <div className="text-sm font-medium">{title}</div>
        <div className="mt-1 text-xs leading-5 text-red-800">{description}</div>
      </div>
    </>
  );

  return (
    <div className="border border-red-200 bg-red-50 px-4 py-3 text-red-950">
      {onRetry ? (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">{content}</div>
          <Button disabled={isRetrying} size="sm" type="button" variant="outline" onClick={onRetry}>
            {isRetrying ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {isRetrying ? "Retrying..." : "Retry"}
          </Button>
        </div>
      ) : (
        <div className="flex items-start gap-3">{content}</div>
      )}
    </div>
  );
}

function VaultStateNotice({
  isRetryingVaultAction,
  onRetryInfrastructureProvisioning,
  onRetryVaultDeletion,
  vault,
}: {
  isRetryingVaultAction: boolean;
  onRetryInfrastructureProvisioning: () => void;
  onRetryVaultDeletion: () => void;
  vault: UserVaultResult;
}) {
  if (vault.deletion.state === "delete_failed") {
    return (
      <FailureNotice
        description={vault.deletion.message || vault.deletion.lastError}
        isRetrying={isRetryingVaultAction}
        onRetry={onRetryVaultDeletion}
        title="Vault removal failed"
      />
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
      <FailureNotice description={vault.sourceSetup.message} title="Repository setup failed" />
    );
  }
  if (vault.providerSetup.status === "failed") {
    return (
      <FailureNotice
        description={vault.providerSetup.message}
        isRetrying={isRetryingVaultAction}
        onRetry={onRetryInfrastructureProvisioning}
        title="Provider setup failed"
      />
    );
  }
  return null;
}

export function VaultOverviewPage({
  developerToolsVisible,
  isRetryingVaultAction,
  onOpenDeleteDialog,
  onRetryInfrastructureProvisioning,
  onRetryVaultDeletion,
  page,
  settingsState,
  workspace,
}: VaultOverviewPageProps) {
  const filesReadEnabled =
    workspace.access.state === "ready" && workspace.access.accessKeys.includes("access_files_read");
  const schemaGraphEnabled =
    workspace.access.state === "ready" &&
    workspace.access.accessKeys.includes("access_schema_graph");
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
          onOpenDeleteDialog={onOpenDeleteDialog}
          settingsState={settingsState}
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
                isRetryingVaultAction={isRetryingVaultAction}
                onRetryInfrastructureProvisioning={onRetryInfrastructureProvisioning}
                onRetryVaultDeletion={onRetryVaultDeletion}
                vault={workspace.vault}
              />
              <DefaultBranchSection filesReadEnabled={filesReadEnabled} workspace={workspace} />
              {developerToolsVisible ? <VaultWorkspaceDataInspector workspace={workspace} /> : null}
              <PullRequestsSection
                filesReadEnabled={filesReadEnabled}
                pullRequests={workspace.pullRequests}
                schemaGraphEnabled={schemaGraphEnabled}
                vault={workspace.vault}
              />
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
        aria-label={page === "settings" ? "Loading vault settings" : "Loading vault overview"}
        className="mx-auto grid w-full max-w-[1100px] gap-8 px-4 py-6 @3xl:px-6 @5xl:px-8 @5xl:py-8"
      >
        {page === "settings" ? (
          <>
            <section>
              <div className="mb-4 h-3 w-24 bg-muted motion-safe:animate-pulse" />
              <VaultOverviewLoadingLines rows={1} />
            </section>
            <section>
              <div className="mb-4 h-3 w-28 bg-muted motion-safe:animate-pulse" />
              <VaultOverviewLoadingLines rows={3} />
            </section>
          </>
        ) : (
          <>
            <section className="pb-5">
              <VaultOverviewLoadingLines rows={2} />
            </section>
            <section>
              <div className="mb-3 h-3 w-32 bg-muted motion-safe:animate-pulse" />
              <div className="border-t border-border py-4">
                <VaultOverviewLoadingLines />
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
