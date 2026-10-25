import { Button } from "@/components/ui/button";
import { GitHubProviderLogo } from "@/components/repository-dashboard/RepositoryDashboardLogos";
import {
  DefaultBranchSection,
  RepositoryOverviewLoadingLines,
} from "@/repository/dashboard/RepositoryEnvironmentTree";
import { PullRequestsSection } from "@/repository/dashboard/RepositoryPullRequestsSection";
import { RepositorySettings } from "@/repository/dashboard/RepositorySettings";
import { RepositorySetupStackStatus } from "@/repository/dashboard/RepositorySetupStackStatus";
import { RepositoryWorkspaceDataInspector } from "@/repository/dashboard/RepositoryWorkspaceDataInspector";
import type { RepositorySettingsState } from "@/repository/dashboard/repositorySettingsState";
import { DOCS_CLOUDFLARE_SETUP_ROUTE } from "@/routeSearch/landingPreview";
import {
  buildRepositoryDashboardRoute,
  buildRepositorySettingsRoute,
} from "@/lib/repositoryRoutes";
import { formatRepositorySourceSetupStep } from "./repositorySourceSetup";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, LayoutList, Loader2, Settings } from "lucide-react";
import type { ReactNode } from "react";
import type { UserRepositoryResult } from "../../../convex/repository/contracts/getUserRepositories";
import { isSamebaseManagedProviderPlan } from "../../../convex/repository/provisioningPlan";
import type { RepositoryWorkspaceSelected } from "./repositoryWorkspaceModel";

const CLOUDFLARE_GITHUB_APP_RECOVERY_URL =
  "https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/#reinstall-the-cloudflare-github-app";
const CLOUDFLARE_GITHUB_APP_URL = "https://github.com/apps/cloudflare-workers-and-pages";
const CLOUDFLARE_WORKERS_AND_PAGES_URL = "https://dash.cloudflare.com/";

export type RepositoryOverviewPageKind = "overview" | "settings";

type RepositoryOverviewPageProps = {
  developerToolsVisible: boolean;
  isRetryingRepositoryAction: boolean;
  onOpenDeleteDialog: () => void;
  onRetryInfrastructureProvisioning: () => void;
  onRetryRepositoryDeletion: () => void;
  page: RepositoryOverviewPageKind;
  settingsState: RepositorySettingsState;
  workspace: RepositoryWorkspaceSelected;
};

function RepositoryHeader({
  owner,
  page,
  repoName,
  repositoryConnected,
  repositoryUrl,
}: {
  owner: string;
  page: RepositoryOverviewPageKind;
  repoName: string;
  repositoryConnected: boolean;
  repositoryUrl: string;
}) {
  const overviewRoute = buildRepositoryDashboardRoute({ owner, repoName });
  const settingsRoute = buildRepositorySettingsRoute({ owner, repoName });
  const repositoryIdentity = (
    <>
      <div className="min-w-0 flex-1 text-base">
        <span className="text-muted-foreground [overflow-wrap:anywhere]">{owner}/</span>
        <h1 className="ml-1 inline font-semibold text-foreground [overflow-wrap:anywhere]">
          {repoName}
        </h1>
      </div>
      <span
        aria-hidden="true"
        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-foreground"
      >
        <GitHubProviderLogo />
      </span>
    </>
  );

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background">
      <div className="mx-auto flex w-full max-w-[1100px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 @3xl:px-6 @5xl:px-8">
        {repositoryConnected ? (
          <a
            aria-label={`Open ${owner}/${repoName} on GitHub`}
            className="flex w-full min-w-0 items-start gap-2 text-left no-underline hover:no-underline @3xl:w-auto @3xl:flex-1"
            href={repositoryUrl}
            rel="noreferrer noopener"
            target="_blank"
          >
            {repositoryIdentity}
          </a>
        ) : (
          <div className="flex w-full min-w-0 items-start gap-2 text-left @3xl:w-auto @3xl:flex-1">
            {repositoryIdentity}
          </div>
        )}
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
  description: ReactNode;
  isRetrying?: boolean;
  onRetry?: () => void;
  title: ReactNode;
}) {
  const content = (
    <>
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" />
      <div className="min-w-0">
        <h2 className="text-sm font-medium">{title}</h2>
        <div className="mt-1 text-xs leading-5 text-muted-foreground">{description}</div>
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

function IncompleteCloudflareBuildsNotice() {
  return (
    <div
      className="flex flex-wrap items-start justify-between gap-3 border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950"
      role="status"
    >
      <div className="flex min-w-0 items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
        <div className="min-w-0">
          <h2 className="text-sm font-medium">Finish Cloudflare setup</h2>
          <div className="mt-1 text-xs leading-5 text-muted-foreground">
            Create the first API token, then create this app&apos;s Worker in Settings.
          </div>
        </div>
      </div>
      <Button asChild size="sm" type="button" variant="outline">
        <Link to={DOCS_CLOUDFLARE_SETUP_ROUTE}>View setup guide</Link>
      </Button>
    </div>
  );
}

function RepositoryStateNotice({
  isRetryingRepositoryAction,
  onRetryInfrastructureProvisioning,
  onRetryRepositoryDeletion,
  repository,
}: {
  isRetryingRepositoryAction: boolean;
  onRetryInfrastructureProvisioning: () => void;
  onRetryRepositoryDeletion: () => void;
  repository: UserRepositoryResult;
}) {
  const cloudflareGitHubAuthorizationTitle = `Cloudflare Workers and Pages GitHub App is not authorized for ${repository.githubRepositoryFullName}.`;

  if (repository.deletion.state === "delete_failed") {
    return (
      <FailureNotice
        description={repository.deletion.message}
        isRetrying={isRetryingRepositoryAction}
        onRetry={onRetryRepositoryDeletion}
        title="Removal from Samebase failed"
      />
    );
  }
  if (repository.deletion.state === "deleting") {
    return (
      <div className="border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        {repository.deletion.message || "Removing this repository from Samebase."}
      </div>
    );
  }
  if (repository.sourceSetup.status === "failed") {
    return (
      <FailureNotice description={repository.sourceSetup.message} title="Repository setup failed" />
    );
  }
  if (repository.providerSetup.status === "failed") {
    if (repository.providerSetup.message.startsWith(cloudflareGitHubAuthorizationTitle)) {
      return (
        <FailureNotice
          description={
            <>
              <a
                className="font-medium text-foreground underline underline-offset-4"
                href={CLOUDFLARE_GITHUB_APP_RECOVERY_URL}
                rel="noreferrer noopener"
                target="_blank"
              >
                Cloudflare recovery guide
              </a>
              <ol className="mt-1 list-decimal space-y-1 pl-4">
                <li className="pl-1">
                  <a
                    className="font-medium text-foreground underline underline-offset-4"
                    href={CLOUDFLARE_GITHUB_APP_URL}
                    rel="noreferrer noopener"
                    target="_blank"
                  >
                    Open the Cloudflare Workers and Pages GitHub App
                  </a>{" "}
                  and uninstall it for{" "}
                  <span className="font-mono font-medium text-foreground">
                    {repository.githubOwnerLogin}
                  </span>
                  .
                </li>
                <li className="pl-1">
                  <a
                    className="font-medium text-foreground underline underline-offset-4"
                    href={CLOUDFLARE_WORKERS_AND_PAGES_URL}
                    rel="noreferrer noopener"
                    target="_blank"
                  >
                    Open Workers &amp; Pages
                  </a>
                  . Select Create application, Pages, and Connect to Git. Add{" "}
                  <span className="font-mono font-medium text-foreground">
                    {repository.githubOwnerLogin}
                  </span>
                  . GitHub gives this access to the Cloudflare Workers and Pages GitHub App, not to
                  Samebase. Select All repositories so Cloudflare can connect repositories that
                  Samebase creates later to Workers Builds.
                </li>
                <li className="pl-1">Return to Samebase and select Retry.</li>
              </ol>
            </>
          }
          isRetrying={isRetryingRepositoryAction}
          onRetry={onRetryInfrastructureProvisioning}
          title={
            <>
              Cloudflare Workers and Pages GitHub App is not authorized for{" "}
              <span className="font-mono font-semibold">{repository.githubRepositoryFullName}</span>
              .
            </>
          }
        />
      );
    }
    return (
      <FailureNotice
        description={repository.providerSetup.message}
        isRetrying={isRetryingRepositoryAction}
        onRetry={onRetryInfrastructureProvisioning}
        title="Provider setup failed"
      />
    );
  }
  return null;
}

export function RepositoryOverviewPage({
  developerToolsVisible,
  isRetryingRepositoryAction,
  onOpenDeleteDialog,
  onRetryInfrastructureProvisioning,
  onRetryRepositoryDeletion,
  page,
  settingsState,
  workspace,
}: RepositoryOverviewPageProps) {
  const filesReadEnabled =
    workspace.access.state === "ready" && workspace.access.accessKeys.includes("access_files_read");
  const provisioningLabel =
    workspace.repository.sourceSetup.status === "running"
      ? workspace.repository.hasConnectedGitHubRepository
        ? "Setting up"
        : formatRepositorySourceSetupStep(workspace.repository.sourceSetup.step)
      : workspace.repository.providerSetup.status === "running"
        ? "Setting up"
        : null;
  const showRepositoryContent = workspace.repository.hasConnectedGitHubRepository;
  const managedProviderPlan = workspace.repository.providerPlan;
  const showIncompleteCloudflareBuilds =
    workspace.repository.sourceSetup.status === "ready" &&
    workspace.repository.deletion.state === "not_deleting" &&
    workspace.repository.hasConnectedGitHubRepository &&
    workspace.repository.hasConvexProvision &&
    workspace.repository.cloudflareWorkers.length === 0 &&
    isSamebaseManagedProviderPlan(managedProviderPlan) &&
    managedProviderPlan.convex.state === "created" &&
    managedProviderPlan.cloudflare.state === "planned" &&
    managedProviderPlan.cloudflare.buildTokenUuid === null;

  return (
    <div className="min-h-full bg-background text-foreground">
      <RepositoryHeader
        owner={workspace.repository.githubOwnerLogin}
        page={page}
        repoName={workspace.repository.githubRepositoryName}
        repositoryConnected={workspace.repository.hasConnectedGitHubRepository}
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
          ) : showIncompleteCloudflareBuilds ? (
            <IncompleteCloudflareBuildsNotice />
          ) : (
            <RepositoryStateNotice
              isRetryingRepositoryAction={isRetryingRepositoryAction}
              onRetryInfrastructureProvisioning={onRetryInfrastructureProvisioning}
              onRetryRepositoryDeletion={onRetryRepositoryDeletion}
              repository={workspace.repository}
            />
          )}
          {showRepositoryContent ? (
            <>
              <RepositorySetupStackStatus repository={workspace.repository} />
              <DefaultBranchSection filesReadEnabled={filesReadEnabled} workspace={workspace} />
              {developerToolsVisible ? (
                <RepositoryWorkspaceDataInspector workspace={workspace} />
              ) : null}
              <PullRequestsSection
                filesReadEnabled={filesReadEnabled}
                pullRequests={workspace.pullRequests}
                repository={workspace.repository}
              />
            </>
          ) : null}
        </main>
      )}
      <div aria-hidden="true" className="h-[20svh] min-h-20" />
    </div>
  );
}

export function RepositoryOverviewLoadingPage({
  owner,
  page,
  repoName,
}: {
  owner: string;
  page: RepositoryOverviewPageKind;
  repoName: string;
}) {
  return (
    <div className="min-h-full bg-background text-foreground">
      <RepositoryHeader
        owner={owner}
        page={page}
        repoName={repoName}
        repositoryConnected={false}
        repositoryUrl={`https://github.com/${owner}/${repoName}`}
      />
      <main
        aria-busy="true"
        aria-label={
          page === "settings" ? "Loading repository settings" : "Loading repository overview"
        }
        className="mx-auto grid w-full max-w-[1100px] gap-8 px-4 py-6 @3xl:px-6 @5xl:px-8 @5xl:py-8"
      >
        {page === "settings" ? (
          <>
            <section>
              <div className="mb-4 h-3 w-24 bg-muted motion-safe:animate-pulse" />
              <RepositoryOverviewLoadingLines rows={1} />
            </section>
            <section>
              <div className="mb-4 h-3 w-28 bg-muted motion-safe:animate-pulse" />
              <RepositoryOverviewLoadingLines rows={3} />
            </section>
          </>
        ) : (
          <>
            <section className="pb-5">
              <RepositoryOverviewLoadingLines rows={2} />
            </section>
            <section>
              <div className="mb-3 h-3 w-32 bg-muted motion-safe:animate-pulse" />
              <div className="border-t border-border py-4">
                <RepositoryOverviewLoadingLines />
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
