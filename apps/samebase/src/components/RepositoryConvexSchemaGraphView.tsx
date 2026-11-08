import { api } from "../../convex/_generated/api";
import { AppWorkspaceRouteChrome } from "@/components/AppWorkspaceShell";
import {
  RepositoryConvexSchemaGraphRouteWorkspace,
  type RepositoryConvexSchemaGraphRouteContext,
} from "@/components/repository-dashboard/RepositoryConvexSchemaGraph";
import { useCacheQuery as useRepositoryQuery } from "@/lib/convexQueryCache";
import { useRepositoryProviderObservations } from "@/repository/dashboard/useRepositoryProviderObservations";
import { Database, Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { stageResources } from "../../shared/alchemyState";

type RepositoryConvexSchemaGraphViewProps = {
  branch: string;
  convexProjectId: string;
  owner: string;
  repoName: string;
};

function RepositoryConvexSchemaGraphRouteStatusSidebar({
  context,
  status,
}: {
  context: RepositoryConvexSchemaGraphRouteContext;
  status: ReactNode;
}) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 px-2 py-2 text-sm">
      <div className="grid min-w-0 gap-1 border-b border-border/60 pb-3">
        <div className="flex min-w-0 items-center gap-2 font-medium">
          <Database className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 truncate">Convex schema</span>
        </div>
        <div className="min-w-0 truncate text-xs text-muted-foreground">
          {context.githubRepositoryFullName}
        </div>
        <div className="min-w-0 truncate font-mono text-xs text-muted-foreground">
          {context.branch}
        </div>
      </div>
      <div className="grid gap-1 text-xs text-muted-foreground">
        <div className="flex min-w-0 justify-between gap-2">
          <span>Project</span>
          <span className="min-w-0 truncate text-foreground">{context.projectId}</span>
        </div>
      </div>
      <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">{status}</div>
    </div>
  );
}

function RepositoryConvexSchemaGraphRouteStatus({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center px-3 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function RepositoryConvexSchemaGraphRouteStatusShell({
  context,
  status,
}: {
  context: RepositoryConvexSchemaGraphRouteContext;
  status: ReactNode;
}) {
  return (
    <AppWorkspaceRouteChrome
      left={{
        content: (
          <RepositoryConvexSchemaGraphRouteStatusSidebar context={context} status={status} />
        ),
      }}
      leftToggleVisibility="all"
      rightToggleVisibility="all"
    >
      <div
        data-testid="repository-schema-page"
        className="flex h-full min-h-0 flex-col bg-background"
      >
        <RepositoryConvexSchemaGraphRouteStatus>{status}</RepositoryConvexSchemaGraphRouteStatus>
      </div>
    </AppWorkspaceRouteChrome>
  );
}

export function RepositoryConvexSchemaGraphView({
  branch,
  convexProjectId,
  owner,
  repoName,
}: RepositoryConvexSchemaGraphViewProps) {
  const githubRepositoryFullName = `${owner}/${repoName}`;
  const dashboardRepositories = useRepositoryQuery(api.repository.list);
  const dashboardRepository = dashboardRepositories?.find(
    (candidate) => candidate.githubRepositoryFullName === githubRepositoryFullName,
  );
  // The route value is the Convex project id of a production deployment of the repository stack in
  // the Alchemy state store. The schema query cannot read the store, so the page checks the stacks
  // itself, as the refresh does on the server; a project that left the stack shows no old snapshot.
  const alchemy = useRepositoryProviderObservations(dashboardRepository ?? null);
  const projectInStack =
    alchemy.state === "loaded" &&
    alchemy.observation.store === "found" &&
    alchemy.observation.stacks.some((stack) =>
      stack.stages.some(
        (stage) =>
          stage.name === "prod" &&
          stageResources({
            stackFile: stage.run.stackFile,
            resources: stage.resources,
          }).convexDeployments.some(
            ({ state }) => String(state.attr.projectId) === convexProjectId,
          ),
      ),
    );
  const context = {
    branch,
    projectId: convexProjectId,
    githubRepositoryFullName,
  } satisfies RepositoryConvexSchemaGraphRouteContext;

  if (dashboardRepositories === undefined || (dashboardRepository && alchemy.state === "loading")) {
    return (
      <RepositoryConvexSchemaGraphRouteStatusShell
        context={context}
        status={
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading schema
          </>
        }
      />
    );
  }

  if (!dashboardRepository) {
    return (
      <RepositoryConvexSchemaGraphRouteStatusShell
        context={context}
        status="Repository not found."
      />
    );
  }

  if (alchemy.state === "failed") {
    return (
      <RepositoryConvexSchemaGraphRouteStatusShell
        context={context}
        status={alchemy.error.message}
      />
    );
  }

  if (!projectInStack) {
    return (
      <RepositoryConvexSchemaGraphRouteStatusShell
        context={context}
        status="Convex project not found."
      />
    );
  }

  return (
    <RepositoryConvexSchemaGraphRouteWorkspace
      context={context}
      repositoryId={dashboardRepository.repositoryId}
      convexProjectId={convexProjectId}
    />
  );
}
