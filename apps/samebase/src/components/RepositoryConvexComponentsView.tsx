import { useQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { AppWorkspaceRouteChrome } from "@/components/AppWorkspaceShell";
import { useCacheQuery as useRepositoryQuery } from "@/lib/convexQueryCache";
import { findRepositoryConvexProjectAttachment } from "@/lib/repositoryConvexProjectAttachment";

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
          <div className="flex min-w-0 items-baseline gap-2 py-1">
            <span className="min-w-0 truncate font-mono">{component.name}</span>
            {component.state === "unmounted" ? (
              <span className="text-xs text-muted-foreground">unmounted</span>
            ) : null}
          </div>
          <ConvexComponentTreeChildren
            childrenByParentPath={childrenByParentPath}
            parentPath={component.path}
          />
        </li>
      ))}
    </ul>
  );
}

function RepositoryConvexComponentsTree({
  convexProjectId,
  repositoryId,
}: {
  convexProjectId: Id<"repositoryConvexProjects">;
  repositoryId: Id<"repositories">;
}) {
  const observe = useAction(api.repository.convexComponents.observe);
  const observation = useQuery({
    queryKey: ["repository-convex-components", repositoryId, convexProjectId],
    queryFn: async () => await observe({ repositoryId, convexProjectId }),
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
  convexProjectId: routeConvexProjectId,
  owner,
  repoName,
}: {
  convexProjectId: string;
  owner: string;
  repoName: string;
}) {
  const repositories = useRepositoryQuery(api.repository.list);
  const attachment = repositories
    ? findRepositoryConvexProjectAttachment(
        repositories,
        `${owner}/${repoName}`,
        routeConvexProjectId,
      )
    : null;

  return (
    <AppWorkspaceRouteChrome rightToggleVisibility="all">
      <div className="flex min-h-0 flex-1 flex-col">
        {repositories === undefined ? (
          <RepositoryConvexComponentsStatus>
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading components
          </RepositoryConvexComponentsStatus>
        ) : attachment?.project ? (
          <RepositoryConvexComponentsTree
            repositoryId={attachment.repository.repositoryId}
            convexProjectId={attachment.project.convexProjectId}
          />
        ) : (
          <RepositoryConvexComponentsStatus>
            Convex project is not attached to this repository.
          </RepositoryConvexComponentsStatus>
        )}
      </div>
    </AppWorkspaceRouteChrome>
  );
}
