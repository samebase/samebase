import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import {
  organizationGitHubIdentityQueryKey,
  type OrganizationGitHubIdentityObservation,
  useOrganizationGitHubIdentities,
} from "@/organization/useOrganizationGitHubIdentity";
import { OrganizationContext } from "@/organization/context";
import { buildRepositoryDashboardRoute } from "@/lib/repositoryRoutes";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useAction } from "convex/react";
import { useContext, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { RepositoryWorkspaceSelected } from "./repositoryWorkspaceModel";

type RepositoryGitHubIdentityObservation =
  OrganizationGitHubIdentityObservation["repositories"][number];

function RepositoryIdentityMessage({
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
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm" role="status">
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
    <div className="text-sm text-red-700" role="status">
      The GitHub App cannot access this repository.
    </div>
  );
}

export function RepositoryGitHubIdentityNotice({
  workspace,
}: {
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
        to: buildRepositoryDashboardRoute({
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

  return (
    <RepositoryIdentityMessage
      githubIdentity={githubIdentity}
      githubOwnerLogin={githubOwnerLogin}
      organizationRole={organizationRole}
      updatePending={updatingGitHubRepositoryName}
      onUpdateName={() => {
        void updateGitHubRepositoryName();
      }}
    />
  );
}
