import { Loader2 } from "lucide-react";
import { getRouteApi } from "@tanstack/react-router";
import { AlchemyStackViews } from "./AlchemyStackViews";
import { applySearchPatch } from "@/routing/searchFlags";
import {
  AlchemyStateTree,
  RepositoryAlchemyStateStatus,
  StateStoreProblems,
} from "./RepositoryAlchemyStateTree";
import { AppWorkspaceRouteChrome } from "@/components/AppWorkspaceShell";
import { RepositoryOverviewLoadingPage } from "@/repository/dashboard/RepositoryOverviewPage";
import { RepositorySelectedWorkspace } from "@/repository/dashboard/RepositorySelectedWorkspace";
import { useRepositoryWorkspaceModel } from "@/repository/dashboard/useRepositoryWorkspaceModel";
import type { RepositoryAlchemyState } from "@/repository/dashboard/useRepositoryAlchemyState";

const alchemyRoute = getRouteApi("/_authed/repo/$owner/$repository/alchemy");

function RepositoryAlchemyStateTree({
  state,
  owner,
}: {
  state: RepositoryAlchemyState;
  owner: string;
}) {
  const search = alchemyRoute.useSearch();
  const navigate = alchemyRoute.useNavigate();
  if (state.state === "loading") {
    return (
      <RepositoryAlchemyStateStatus>
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading Alchemy state
      </RepositoryAlchemyStateStatus>
    );
  }

  if (state.state === "failed") {
    return <RepositoryAlchemyStateStatus>{state.error.message}</RepositoryAlchemyStateStatus>;
  }

  if (state.observation.store === "found" && state.observation.stacks.length > 0) {
    return (
      <AlchemyStackViews
        observation={state.observation}
        search={search}
        onChange={(patch) => {
          void navigate({
            to: ".",
            replace: true,
            resetScroll: false,
            hash: true,
            search: (current) => applySearchPatch(current, patch),
          });
        }}
      />
    );
  }

  return (
    <AlchemyStateTree
      storeProblems={
        state.cloudflareProblem || state.githubUnreadable ? (
          <StateStoreProblems
            cloudflareProblem={state.cloudflareProblem}
            githubUnreadable={state.githubUnreadable}
            owner={owner}
          />
        ) : null
      }
      observation={state.observation}
    />
  );
}

export function RepositoryAlchemyStateView({
  owner,
  repoName,
}: {
  owner: string;
  repoName: string;
}) {
  const workspaceModel = useRepositoryWorkspaceModel(`${owner}/${repoName}`);
  const workspace =
    workspaceModel.state === "ready" && workspaceModel.selection.state === "selected"
      ? workspaceModel.selection.workspace
      : null;

  return (
    <AppWorkspaceRouteChrome
      left={
        workspace
          ? {
              content: (
                <RepositorySelectedWorkspace
                  key={workspace.repository.repositoryId}
                  developerToolsVisible={false}
                  workspace={workspace}
                />
              ),
            }
          : workspaceModel.state === "loading"
            ? {
                content: <RepositoryOverviewLoadingPage owner={owner} repoName={repoName} />,
              }
            : null
      }
      rightToggleVisibility="all"
    >
      <div className="flex min-h-0 flex-1 flex-col">
        {workspaceModel.state === "loading" ? (
          <RepositoryAlchemyStateStatus>
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading Alchemy state
          </RepositoryAlchemyStateStatus>
        ) : workspace ? (
          <RepositoryAlchemyStateTree owner={owner} state={workspace.alchemyState} />
        ) : (
          <RepositoryAlchemyStateStatus>Repository not found.</RepositoryAlchemyStateStatus>
        )}
      </div>
    </AppWorkspaceRouteChrome>
  );
}
