import { object as sureObject, string as sureString } from "@samebase/sure";
import { useQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { ChevronRight, Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { ALCHEMY_REDACTED_MARKER } from "../../shared/alchemyState";
import { AppWorkspaceRouteChrome } from "@/components/AppWorkspaceShell";
import { RepositoryOverviewLoadingPage } from "@/repository/dashboard/RepositoryOverviewPage";
import { RepositorySelectedWorkspace } from "@/repository/dashboard/RepositorySelectedWorkspace";
import { useRepositoryWorkspaceModel } from "@/repository/dashboard/useRepositoryWorkspaceModel";

export type AlchemyStateObservation = (typeof api.repository.alchemyState.observe)["_returnType"];
type AlchemyStage = AlchemyStateObservation["stacks"][number]["stages"][number];

/** `resourceType` names the provider of the resource, such as `Convex.Deployment`. */
const sureResourceState = sureObject({ status: sureString, resourceType: sureString });

/**
One entry for each value of the stage output, named by its dotted path. A secret keeps only its
path, with `value: null`.
*/
function outputEntries(output: unknown, path: string): { path: string; value: string | null }[] {
  if (typeof output !== "object" || output === null) {
    return [{ path, value: typeof output === "string" ? output : JSON.stringify(output) }];
  }
  if (ALCHEMY_REDACTED_MARKER in output) {
    return [{ path, value: null }];
  }
  return Object.entries(output).flatMap(([key, child]) =>
    outputEntries(child, path ? `${path}.${key}` : key),
  );
}

function RepositoryAlchemyStateStatus({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function AlchemyStateDetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="grid min-w-0 gap-0.5">{children}</dd>
    </>
  );
}

function AlchemyStateDetailItem({ detail, name }: { detail: string | null; name: string }) {
  return (
    <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
      <span className="min-w-0 break-all font-mono">{name}</span>
      {detail === null ? null : (
        <span className="min-w-0 break-all text-muted-foreground">{detail}</span>
      )}
    </div>
  );
}

function AlchemyStageDetails({ stage }: { stage: AlchemyStage }) {
  const output = stage.output === null ? [] : outputEntries(JSON.parse(stage.output), "");

  return (
    <dl className="ml-5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 pt-1 pb-3 text-xs">
      {stage.resources.length === 0 ? null : (
        <AlchemyStateDetailRow label="Resources">
          {stage.resources.map((resource) => {
            const [valid, state] = sureResourceState(JSON.parse(resource.value));
            return (
              <AlchemyStateDetailItem
                key={resource.fqn}
                name={resource.fqn}
                detail={valid ? `${state.status}, ${state.resourceType}` : "unknown"}
              />
            );
          })}
        </AlchemyStateDetailRow>
      )}
      {output.length === 0 ? null : (
        <AlchemyStateDetailRow label="Output">
          {output.map((entry) => (
            <AlchemyStateDetailItem key={entry.path} name={entry.path} detail={entry.value} />
          ))}
        </AlchemyStateDetailRow>
      )}
    </dl>
  );
}

export function AlchemyStateTree({
  observation: { deploymentName, stacks },
}: {
  observation: AlchemyStateObservation;
}) {
  return (
    <div className="p-3 text-sm">
      <div className="py-1 font-mono font-medium">{deploymentName}</div>
      {stacks.length === 0 ? (
        <div className="ml-2.5 border-l border-border py-1 pl-3 text-muted-foreground">
          No Alchemy state.
        </div>
      ) : (
        <ul className="ml-2.5 border-l border-border pl-3">
          {stacks.map((stack) => (
            <li key={stack.name}>
              <div className="truncate py-1 font-mono">{stack.name}</div>
              <ul className="ml-2.5 border-l border-border pl-3">
                {stack.stages.map((stage) => (
                  <li key={stage.name}>
                    <details className="group">
                      <summary className="flex min-w-0 cursor-pointer list-none items-center gap-1.5 py-1">
                        <ChevronRight className="size-3.5 shrink-0 text-muted-foreground group-open:rotate-90" />
                        <span className="min-w-0 truncate font-mono">{stage.name}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {`${stage.resources.length} ${stage.resources.length === 1 ? "resource" : "resources"}`}
                        </span>
                      </summary>
                      <AlchemyStageDetails stage={stage} />
                    </details>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RepositoryAlchemyStateTree({
  deploymentName,
  repositoryId,
}: {
  deploymentName: string;
  repositoryId: Id<"repositories">;
}) {
  const observe = useAction(api.repository.alchemyState.observe);
  const observation = useQuery({
    queryKey: ["repository-alchemy-state", repositoryId, deploymentName],
    queryFn: async () => await observe({ repositoryId, deploymentName }),
    retry: false,
  });

  if (observation.isPending) {
    return (
      <RepositoryAlchemyStateStatus>
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading Alchemy state
      </RepositoryAlchemyStateStatus>
    );
  }

  if (observation.isError) {
    return <RepositoryAlchemyStateStatus>{observation.error.message}</RepositoryAlchemyStateStatus>;
  }

  return <AlchemyStateTree observation={observation.data} />;
}

export function RepositoryAlchemyStateView({
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
          <RepositoryAlchemyStateStatus>
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading Alchemy state
          </RepositoryAlchemyStateStatus>
        ) : workspace ? (
          <RepositoryAlchemyStateTree
            repositoryId={workspace.repository.repositoryId}
            deploymentName={deploymentName}
          />
        ) : (
          <RepositoryAlchemyStateStatus>Repository not found.</RepositoryAlchemyStateStatus>
        )}
      </div>
    </AppWorkspaceRouteChrome>
  );
}
