import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import { GitHubProviderLogo } from "@/components/repository-dashboard/RepositoryDashboardLogos";
import { RepositoryWorkspaceDataInspector } from "@/repository/dashboard/RepositoryWorkspaceDataInspector";
import {
  organizationGitHubIdentityQueryKey,
  type OrganizationGitHubIdentityObservation,
  useOrganizationGitHubIdentities,
} from "@/organization/useOrganizationGitHubIdentity";
import { OrganizationContext } from "@/organization/context";
import { buildRepositorySettingsRoute } from "@/lib/repositoryRoutes";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useAction } from "convex/react";
import { useContext, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { RepositoryWorkspaceSelected } from "./repositoryWorkspaceModel";

type RepositoryGitHubIdentityObservation =
  OrganizationGitHubIdentityObservation["repositories"][number];

function RepositoryIdentityNotice({
  githubIdentity,
  githubOwnerLogin,
  organizationRole,
  updatePending,
  onUpdateName,
}: {
  githubIdentity: RepositoryGitHubIdentityObservation | undefined;
  githubOwnerLogin: string;
  organizationRole: "member" | "owner";
  updatePending: boolean;
  onUpdateName: () => void;
}) {
  if (!githubIdentity) {
    return null;
  }
  if (githubIdentity.status === "renamed") {
    const updateAvailable = githubIdentity.update === "available";
    return (
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm" role="status">
        <div className="min-w-0 text-amber-800">
          <div>
            GitHub now uses <span className="font-medium">{githubOwnerLogin}</span>/
            <span className="font-medium">{githubIdentity.repositoryName}</span>.
          </div>
          {!updateAvailable ? (
            <div className="mt-1 text-xs">
              Remove the existing {githubOwnerLogin}/{githubIdentity.repositoryName} repository from
              Samebase before you update this name.
            </div>
          ) : organizationRole !== "owner" ? (
            <div className="mt-1 text-xs">An organization owner must update this name.</div>
          ) : null}
        </div>
        {updateAvailable && organizationRole === "owner" ? (
          <Button disabled={updatePending} size="sm" type="button" onClick={onUpdateName}>
            {updatePending ? "Updating..." : "Update name"}
          </Button>
        ) : null}
      </div>
    );
  }
  return (
    <div className="mt-3 text-sm text-red-700" role="status">
      The GitHub App cannot access this repository.
    </div>
  );
}

export function RepositorySettings({
  developerToolsVisible,
  onOpenDeleteDialog,
  workspace,
}: {
  developerToolsVisible: boolean;
  onOpenDeleteDialog: () => void;
  workspace: RepositoryWorkspaceSelected;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const organizationContext = useContext(OrganizationContext);
  const updateRepositoryGitHubRepositoryName = useAction(
    api.github.updateRepositoryGitHubRepositoryName,
  );
  const githubIdentities = useOrganizationGitHubIdentities([workspace.repository.organizationId]);
  const githubIdentityObservation = githubIdentities.get(workspace.repository.organizationId);
  const githubIdentity = githubIdentityObservation?.repositories.find(
    (identity) => identity.repositoryId === workspace.repository.repositoryId,
  );
  const githubOwnerLogin =
    githubIdentityObservation?.owner.status === "renamed"
      ? githubIdentityObservation.owner.githubOwnerLogin
      : workspace.repository.githubOwnerLogin;
  const organizationRole =
    organizationContext?.organizations?.find(
      (organization) => organization.organizationId === workspace.repository.organizationId,
    )?.role ?? "member";
  const [updatingGitHubRepositoryName, setUpdatingGitHubRepositoryName] = useState(false);

  const updateGitHubRepositoryName = async () => {
    if (
      updatingGitHubRepositoryName ||
      organizationRole !== "owner" ||
      githubIdentity?.status !== "renamed" ||
      githubIdentity.update !== "available"
    ) {
      return;
    }
    setUpdatingGitHubRepositoryName(true);
    try {
      const result = await updateRepositoryGitHubRepositoryName({
        repositoryId: workspace.repository.repositoryId,
        expectedRepositoryName: githubIdentity.repositoryName,
      });
      await navigate({
        hash: true,
        replace: true,
        search: true,
        to: buildRepositorySettingsRoute({
          owner: result.githubOwnerLogin,
          repoName: result.repositoryName,
        }),
      });
      void queryClient.invalidateQueries({
        queryKey: organizationGitHubIdentityQueryKey(workspace.repository.organizationId),
      });
    } catch (error) {
      toast({
        title: "Could not update repository name",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setUpdatingGitHubRepositoryName(false);
    }
  };

  const deleteAction =
    workspace.repository.deletion.state === "not_deleting"
      ? workspace.repository.deletion.deleteAction
      : { state: "disabled" as const, reason: "Removal from Samebase is already in progress." };
  const removeRepositoryDisabled = deleteAction.state === "disabled";
  const repositoryIdentity = (
    <>
      <span className="mt-0.5 flex h-4 w-5 shrink-0 items-center justify-center">
        <GitHubProviderLogo />
      </span>
      <span className="min-w-0">
        <span className="block line-clamp-2 text-xs text-muted-foreground">
          {workspace.repository.githubOwnerLogin}/
        </span>
        <span
          className={
            workspace.repository.hasConnectedGitHubRepository
              ? "block line-clamp-2 text-sm font-medium underline decoration-border underline-offset-4"
              : "block line-clamp-2 text-sm font-medium"
          }
        >
          {workspace.repository.githubRepositoryName}
        </span>
      </span>
    </>
  );

  return (
    <main className="mx-auto grid w-full max-w-[960px] gap-8 px-4 py-6 @3xl:px-6 @5xl:px-8 @5xl:py-8">
      <section aria-labelledby="repository-settings-repository-heading">
        <h2
          id="repository-settings-repository-heading"
          className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground"
        >
          Repository
        </h2>
        <div className="border-t border-border py-3">
          {workspace.repository.hasConnectedGitHubRepository ? (
            <a
              className="flex min-w-0 items-start gap-2.5 text-foreground no-underline hover:no-underline"
              href={workspace.githubRepositoryUrl}
              rel="noreferrer noopener"
              target="_blank"
            >
              {repositoryIdentity}
            </a>
          ) : (
            <div className="flex min-w-0 items-start gap-2.5 text-foreground">
              {repositoryIdentity}
            </div>
          )}
          <RepositoryIdentityNotice
            githubIdentity={githubIdentity}
            githubOwnerLogin={githubOwnerLogin}
            organizationRole={organizationRole}
            updatePending={updatingGitHubRepositoryName}
            onUpdateName={() => {
              void updateGitHubRepositoryName();
            }}
          />
        </div>
      </section>

      <section aria-labelledby="repository-settings-remove-heading">
        <h2
          id="repository-settings-remove-heading"
          className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground"
        >
          Remove from Samebase
        </h2>
        <div className="grid gap-3 border-t border-border py-4 @3xl:grid-cols-[minmax(0,1fr)_auto] @3xl:items-center">
          <p className="max-w-xl text-xs leading-5 text-muted-foreground">
            {deleteAction.state === "disabled"
              ? deleteAction.reason
              : "Review repository and provider cleanup before anything is removed."}
          </p>
          <Button
            className="justify-self-start @3xl:justify-self-end"
            disabled={removeRepositoryDisabled}
            size="sm"
            type="button"
            variant="destructive"
            onClick={onOpenDeleteDialog}
          >
            Remove from Samebase
          </Button>
        </div>
      </section>
      {developerToolsVisible ? <RepositoryWorkspaceDataInspector workspace={workspace} /> : null}
    </main>
  );
}
