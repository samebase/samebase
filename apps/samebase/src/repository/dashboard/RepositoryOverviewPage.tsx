import { Button } from "@/components/ui/button";
import { GitHubProviderLogo } from "@/components/repository-dashboard/RepositoryDashboardLogos";
import {
  DefaultBranchSection,
  RepositoryOverviewLoadingLines,
} from "@/repository/dashboard/RepositoryEnvironmentTree";
import { PullRequestsSection } from "@/repository/dashboard/RepositoryPullRequestsSection";
import { RepositoryGitHubIdentityNotice } from "@/repository/dashboard/RepositoryGitHubIdentityNotice";
import { RepositorySetupStackStatus } from "@/repository/dashboard/RepositorySetupStackStatus";
import { RepositoryWorkspaceDataInspector } from "@/repository/dashboard/RepositoryWorkspaceDataInspector";
import { formatRepositorySourceSetupStep } from "./repositorySourceSetup";
import { AlertTriangle, Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import type { UserRepositoryResult } from "../../../convex/repository/contracts/getUserRepositories";
import type { RepositoryWorkspaceSelected } from "./repositoryWorkspaceModel";

type RepositoryOverviewPageProps = {
  developerToolsVisible: boolean;
  isRetryingRepositoryAction: boolean;
  onOpenDeleteDialog: () => void;
  onRetryInfrastructureProvisioning: () => void;
  onRetryRepositoryDeletion: () => void;
  workspace: RepositoryWorkspaceSelected;
};

function RepositoryHeader({
  children,
  owner,
  repoName,
  repositoryUrl,
}: {
  children?: ReactNode;
  owner: string;
  repoName: string;
  /** Null until the repository is connected on GitHub, so the name is not a link. */
  repositoryUrl: string | null;
}) {
  const repositoryIdentity = (
    <>
      {/* The line height of the name keeps the icon on the first line of a wrapped name. */}
      <span className="flex h-6 shrink-0 items-center">
        <GitHubProviderLogo />
      </span>
      <div className="min-w-0 max-lines-3 text-base">
        <span className="text-muted-foreground">{owner}/</span>
        <h1 className="inline font-semibold">{repoName}</h1>
      </div>
    </>
  );

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background">
      <div className="mx-auto flex min-h-14 w-full max-w-[1100px] flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 @3xl:px-6 @5xl:px-8">
        {repositoryUrl ? (
          <a
            aria-label={`Open ${owner}/${repoName} on GitHub`}
            className="flex min-w-0 items-start gap-2 underline-offset-4"
            href={repositoryUrl}
            rel="noreferrer noopener"
            target="_blank"
          >
            {repositoryIdentity}
          </a>
        ) : (
          <div className="flex min-w-0 items-start gap-2">{repositoryIdentity}</div>
        )}
        {children}
      </div>
    </header>
  );
}

/**
The disabled button shows no reason, because the page body already shows the setup or removal state.
*/
function RepositoryDisconnect({
  onOpenDeleteDialog,
  repository,
}: {
  onOpenDeleteDialog: () => void;
  repository: UserRepositoryResult;
}) {
  return (
    <Button
      className="ml-auto"
      disabled={
        repository.deletion.state !== "not_deleting" ||
        repository.deletion.deleteAction.state === "disabled"
      }
      size="sm"
      type="button"
      variant="outline"
      onClick={onOpenDeleteDialog}
    >
      Disconnect
    </Button>
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
  if (repository.providerSetup.status === "failed" && repository.providerPlan !== null) {
    return (
      <FailureNotice
        description={repository.providerSetup.message}
        isRetrying={isRetryingRepositoryAction}
        onRetry={onRetryInfrastructureProvisioning}
        title="Repository setup failed"
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

  return (
    <div className="min-h-full bg-background text-foreground">
      <RepositoryHeader
        owner={workspace.repository.githubOwnerLogin}
        repoName={workspace.repository.githubRepositoryName}
        repositoryUrl={showRepositoryContent ? workspace.githubRepositoryUrl : null}
      >
        <RepositoryDisconnect
          onOpenDeleteDialog={onOpenDeleteDialog}
          repository={workspace.repository}
        />
      </RepositoryHeader>
      <main className="mx-auto grid w-full max-w-[1100px] gap-8 px-4 py-6 @3xl:px-6 @5xl:px-8 @5xl:py-8">
        <RepositoryGitHubIdentityNotice workspace={workspace} />
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
            <span className="min-w-0 text-sm font-medium text-foreground">{provisioningLabel}</span>
          </section>
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
          </>
        ) : null}
        {developerToolsVisible ? <RepositoryWorkspaceDataInspector workspace={workspace} /> : null}
        {showRepositoryContent ? (
          <PullRequestsSection
            filesReadEnabled={filesReadEnabled}
            pullRequests={workspace.pullRequests}
            repository={workspace.repository}
          />
        ) : null}
      </main>
      <div aria-hidden="true" className="h-[20svh] min-h-20" />
    </div>
  );
}

export function RepositoryOverviewLoadingPage({
  owner,
  repoName,
}: {
  owner: string;
  repoName: string;
}) {
  return (
    <div className="min-h-full bg-background text-foreground">
      <RepositoryHeader owner={owner} repoName={repoName} repositoryUrl={null} />
      <main
        aria-busy="true"
        aria-label="Loading repository overview"
        className="mx-auto grid w-full max-w-[1100px] gap-8 px-4 py-6 @3xl:px-6 @5xl:px-8 @5xl:py-8"
      >
        <section className="pb-5">
          <RepositoryOverviewLoadingLines rows={2} />
        </section>
        <section>
          <div className="mb-3 h-3 w-32 bg-muted motion-safe:animate-pulse" />
          <div className="border-t border-border py-4">
            <RepositoryOverviewLoadingLines />
          </div>
        </section>
      </main>
    </div>
  );
}
