import { api } from "../../../convex/_generated/api";
import { AppWorkspaceRouteChrome } from "@/appShell/AppWorkspaceShell";
import {
  RepositoryConvexSchemaGraphRouteWorkspace,
  type RepositoryConvexSchemaGraphRouteContext,
} from "@/repository/schemaGraph/RepositoryConvexSchemaGraph";
import { useCacheQuery as useRepositoryQuery } from "@/lib/convexQueryCache";
import { findRepositoryConvexProjectAttachment } from "@/repository/database/repositoryConvexProjectAttachment";
import { Database, Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { getConvexCodeLocationPath } from "../../../shared/convexCodeLocation";

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
        {context.convexCodePath ? (
          <div className="flex min-w-0 justify-between gap-2">
            <span>Code</span>
            <span className="min-w-0 truncate font-mono text-foreground">
              {context.convexCodePath}
            </span>
          </div>
        ) : null}
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
  convexProjectId: routeConvexProjectId,
  owner,
  repoName,
}: RepositoryConvexSchemaGraphViewProps) {
  const githubRepositoryFullName = `${owner}/${repoName}`;
  const dashboardRepositories = useRepositoryQuery(api.repository.dashboard.getUserRepositories);
  const attachment = dashboardRepositories
    ? findRepositoryConvexProjectAttachment(
        dashboardRepositories,
        githubRepositoryFullName,
        routeConvexProjectId,
      )
    : null;
  const dashboardRepository = attachment?.repository;
  const project = attachment?.project;
  const context = {
    branch,
    convexCodePath: project ? getConvexCodeLocationPath(project.codeLocation) : "",
    projectId: project?.projectId ?? routeConvexProjectId,
    githubRepositoryFullName,
  } satisfies RepositoryConvexSchemaGraphRouteContext;

  if (dashboardRepositories === undefined) {
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

  if (!dashboardRepository || !project) {
    return (
      <RepositoryConvexSchemaGraphRouteStatusShell
        context={context}
        status="Convex project is not attached to this repository."
      />
    );
  }

  return (
    <RepositoryConvexSchemaGraphRouteWorkspace
      context={context}
      repositoryId={dashboardRepository.repositoryId}
      convexProjectId={project.convexProjectId}
    />
  );
}
