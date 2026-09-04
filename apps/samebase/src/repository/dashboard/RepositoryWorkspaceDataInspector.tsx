import type { RepositoryPullRequestsState } from "@/repository/dashboard/useRepositoryPullRequests";
import type { RepositoryWorkspaceSelected } from "./repositoryWorkspaceModel";

function serializePullRequests(pullRequests: RepositoryPullRequestsState) {
  if (pullRequests.state !== "current" && pullRequests.state !== "stale") {
    return pullRequests;
  }
  return {
    ...pullRequests,
    loadMore: undefined,
    resourcesByPullRequestId: [...pullRequests.resourcesByPullRequestId.entries()],
  };
}

function DataObject({ label, value }: { label: string; value: unknown }) {
  return (
    <details className="border-t border-border py-2">
      <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
        {label}
      </summary>
      <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-words bg-muted p-3 text-xs">
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}

export function RepositoryWorkspaceDataInspector({
  workspace,
}: {
  workspace: RepositoryWorkspaceSelected;
}) {
  return (
    <section aria-labelledby="repository-data-inspector-heading">
      <h2
        id="repository-data-inspector-heading"
        className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground"
      >
        Data inspector
      </h2>
      <div className="border-b border-border">
        <DataObject label="Repository contract" value={workspace.repository} />
        <DataObject
          label="GitHub observations"
          value={serializePullRequests(workspace.pullRequests)}
        />
        <DataObject label="Cloudflare observations" value={workspace.cloudflareObservations} />
        <DataObject label="Convex observations" value={workspace.convexObservations} />
        <DataObject
          label="Derived presentation"
          value={{ environmentRoots: workspace.environmentRoots }}
        />
      </div>
    </section>
  );
}
