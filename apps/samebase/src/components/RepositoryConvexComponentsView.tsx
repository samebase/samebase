import { useQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { ChevronRight, Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { notEmpty } from "@samebase/dependent";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { AppWorkspaceRouteChrome } from "@/components/AppWorkspaceShell";
import { RepositoryOverviewLoadingPage } from "@/repository/dashboard/RepositoryOverviewPage";
import { RepositorySelectedWorkspace } from "@/repository/dashboard/RepositorySelectedWorkspace";
import { useRepositoryWorkspaceModel } from "@/repository/dashboard/useRepositoryWorkspaceModel";

export type ConvexComponentsObservation =
  (typeof api.repository.convexComponents.observe)["_returnType"];
type ConvexComponent = ConvexComponentsObservation["components"][number];

function RepositoryConvexComponentsStatus({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
      {children}
    </div>
  );
}

/** Keeps the `path` order of `components` among siblings. */
function groupComponentsByParentPath(
  components: readonly ConvexComponent[],
): ReadonlyMap<string, readonly ConvexComponent[]> {
  const childrenByParentPath = new Map<string, ConvexComponent[]>();
  for (const component of components) {
    const separatorIndex = component.path.lastIndexOf("/");
    const parentPath = separatorIndex === -1 ? "" : component.path.slice(0, separatorIndex);
    const siblings = childrenByParentPath.get(parentPath) ?? [];
    siblings.push(component);
    childrenByParentPath.set(parentPath, siblings);
  }
  return childrenByParentPath;
}

function ConvexComponentTreeChildren({
  childrenByParentPath,
  parentPath,
}: {
  childrenByParentPath: ReadonlyMap<string, readonly ConvexComponent[]>;
  parentPath: string;
}) {
  const children = childrenByParentPath.get(parentPath);
  if (!children) {
    return null;
  }

  return (
    <ul className="ml-2.5 border-l border-border pl-3">
      {children.map((component) => (
        <li key={component.id}>
          <details className="group">
            <summary className="flex min-w-0 cursor-pointer list-none items-center gap-1.5 py-1">
              <ChevronRight className="size-3.5 shrink-0 text-muted-foreground group-open:rotate-90" />
              <span className="min-w-0 truncate font-mono">{component.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {[
                  component.state === "unmounted" ? "unmounted" : null,
                  `${component.functions.length} ${component.functions.length === 1 ? "function" : "functions"}`,
                  `${component.tables.length} ${component.tables.length === 1 ? "table" : "tables"}`,
                ]
                  .filter(notEmpty)
                  .join(" · ")}
              </span>
            </summary>
            <ConvexComponentDetails component={component} />
          </details>
          <ConvexComponentTreeChildren
            childrenByParentPath={childrenByParentPath}
            parentPath={component.path}
          />
        </li>
      ))}
    </ul>
  );
}

function ConvexComponentDetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="grid min-w-0 gap-0.5">{children}</dd>
    </>
  );
}

function ConvexComponentDetailItem({ detail, name }: { detail: string; name: string }) {
  return (
    <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
      <span className="min-w-0 break-all font-mono">{name}</span>
      <span className="min-w-0 break-all text-muted-foreground">{detail}</span>
    </div>
  );
}

function ConvexComponentTable({ table }: { table: ConvexComponent["tables"][number] }) {
  const documents = `${table.documentCount} ${table.documentCount === 1 ? "document" : "documents"}`;
  if (!table.schema) {
    return <ConvexComponentDetailItem name={table.name} detail={`${documents}, no schema`} />;
  }

  return (
    <details className="group/table">
      <summary className="flex min-w-0 cursor-pointer list-none flex-wrap items-baseline gap-x-2">
        <span className="min-w-0 break-all font-mono">{table.name}</span>
        <span className="min-w-0 break-all text-muted-foreground">{documents}</span>
        <ChevronRight className="size-3 shrink-0 self-center text-muted-foreground group-open/table:rotate-90" />
      </summary>
      <div className="grid gap-0.5 border-l border-border py-1 pl-3">
        {table.schema.fields.map((field) => (
          <ConvexComponentDetailItem
            key={field.path}
            name={field.path}
            detail={field.optional ? `${field.kind}, optional` : field.kind}
          />
        ))}
        {table.schema.indexes.map((index) => (
          <ConvexComponentDetailItem
            key={index.name}
            name={index.name}
            detail={`index on ${index.fields.join(", ")}`}
          />
        ))}
      </div>
    </details>
  );
}

function ConvexComponentDetails({ component }: { component: ConvexComponent }) {
  return (
    <dl className="ml-5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 pt-1 pb-3 text-xs">
      <ConvexComponentDetailRow label="ID">
        <span className="min-w-0 break-all font-mono">{component.id}</span>
      </ConvexComponentDetailRow>
      {component.httpPrefix ? (
        <ConvexComponentDetailRow label="HTTP prefix">
          <span className="font-mono">{component.httpPrefix}</span>
        </ConvexComponentDetailRow>
      ) : null}
      <ConvexComponentDetailRow label="Files">{component.fileCount}</ConvexComponentDetailRow>
      {component.tables.length === 0 ? null : (
        <ConvexComponentDetailRow label="Tables">
          {component.tables.map((table) => (
            <ConvexComponentTable key={table.name} table={table} />
          ))}
        </ConvexComponentDetailRow>
      )}
      {component.functions.length === 0 ? null : (
        <ConvexComponentDetailRow label="Functions">
          {component.functions.map((fn) => (
            <ConvexComponentDetailItem
              key={`${fn.module}:${fn.name}`}
              name={`${fn.module}:${fn.name}`}
              detail={`${fn.type}, ${fn.visibility}`}
            />
          ))}
        </ConvexComponentDetailRow>
      )}
      {component.crons.length === 0 ? null : (
        <ConvexComponentDetailRow label="Crons">
          {component.crons.map((cron) => (
            <ConvexComponentDetailItem
              key={cron.name}
              name={cron.name}
              detail={`${cron.functionPath} ${cron.schedule}`}
            />
          ))}
        </ConvexComponentDetailRow>
      )}
    </dl>
  );
}

function RepositoryConvexComponentsTree({
  deploymentName,
  repositoryId,
}: {
  deploymentName: string;
  repositoryId: Id<"repositories">;
}) {
  const observe = useAction(api.repository.convexComponents.observe);
  const observation = useQuery({
    queryKey: ["repository-convex-components", repositoryId, deploymentName],
    queryFn: async () => await observe({ repositoryId, deploymentName }),
    retry: false,
  });

  if (observation.isPending) {
    return (
      <RepositoryConvexComponentsStatus>
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading components
      </RepositoryConvexComponentsStatus>
    );
  }

  if (observation.isError) {
    return (
      <RepositoryConvexComponentsStatus>
        {observation.error.message}
      </RepositoryConvexComponentsStatus>
    );
  }

  return <ConvexComponentTree observation={observation.data} />;
}

export function ConvexComponentTree({
  observation: { components, deploymentName },
}: {
  observation: ConvexComponentsObservation;
}) {
  return (
    <div className="p-3 text-sm">
      <div className="py-1 font-mono font-medium">{deploymentName}</div>
      {components.length === 0 ? (
        <div className="ml-2.5 border-l border-border py-1 pl-3 text-muted-foreground">
          No components.
        </div>
      ) : (
        <ConvexComponentTreeChildren
          childrenByParentPath={groupComponentsByParentPath(components)}
          parentPath=""
        />
      )}
    </div>
  );
}

export function RepositoryConvexComponentsView({
  deploymentName,
  owner,
  repoName,
}: {
  deploymentName: string;
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
                  page="overview"
                  workspace={workspace}
                />
              ),
            }
          : workspaceModel.state === "loading"
            ? {
                content: (
                  <RepositoryOverviewLoadingPage
                    owner={owner}
                    page="overview"
                    repoName={repoName}
                  />
                ),
              }
            : null
      }
      rightToggleVisibility="all"
    >
      <div className="flex min-h-0 flex-1 flex-col">
        {workspaceModel.state === "loading" ? (
          <RepositoryConvexComponentsStatus>
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading components
          </RepositoryConvexComponentsStatus>
        ) : workspace ? (
          <RepositoryConvexComponentsTree
            repositoryId={workspace.repository.repositoryId}
            deploymentName={deploymentName}
          />
        ) : (
          <RepositoryConvexComponentsStatus>Repository not found.</RepositoryConvexComponentsStatus>
        )}
      </div>
    </AppWorkspaceRouteChrome>
  );
}
