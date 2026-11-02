import { convexQuery, type ConvexQueryClient } from "@convex-dev/react-query";
import type { QueryClient } from "@tanstack/react-query";
import type { FunctionReference, FunctionReturnType, OptionalRestArgs } from "convex/server";
import { ConvexError } from "convex/values";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { isRepositoryBeingCreated } from "@/repository/dashboard/repositoryAlchemyStore";
import { rootQueries, unlessAccountGone } from "@/routes/root.queries";

/**
The pages of `DashboardRoutePage` read these through `useRepositoryWorkspaceModel`. Their route
loaders fetch them, so the server render has the page's data in its first HTML, and a navigation
inside the app keeps the current page on screen until they are there.
*/
export const repositoryDashboardQueries = {
  folderState: convexQuery(api.repository.folders.getRepositoryFolderState, {}),
  organizations: rootQueries.organizations,
  organizationTreeSettings: convexQuery(
    api.repository.organizationTree.getRepositoryOrganizationTreeSettings,
    {},
  ),
  repositories: rootQueries.repositories,
};

export async function loadRepositoryDashboard({
  context: { queryClient },
}: {
  context: { queryClient: QueryClient };
}) {
  // A viewer without dashboard access (terms or approval pending, account deletion) gets the access
  // page of RouteAccessOutlet, which reads none of these. The queries deny that viewer, and a
  // rejected loader answers the server render with a 500 and leaves the route in its error state.
  const viewerAccess = await unlessAccountGone(queryClient.query(rootQueries.viewerAccess));
  if (viewerAccess === null || !viewerAccess.accessKeys.includes("access_dashboard")) {
    return;
  }

  await Promise.all([
    queryClient.query(repositoryDashboardQueries.folderState),
    queryClient.query(repositoryDashboardQueries.organizations),
    queryClient.query(repositoryDashboardQueries.organizationTreeSettings),
    queryClient.query(repositoryDashboardQueries.repositories),
  ]);
}

type ViewerConvexClients = Pick<ConvexQueryClient, "convexClient" | "serverHttpClient">;
type RepositoryPageLoaderArgs = {
  context: { convexQueryClient: ViewerConvexClients; queryClient: QueryClient };
  params: { owner: string; repository: string };
};

/**
Calls `action` as the viewer: the server render's client has the token of the cookie session, and a
navigation in the browser calls through the browser's client.
*/
function runViewerAction<Action extends FunctionReference<"action">>(
  convexQueryClient: ViewerConvexClients,
  action: Action,
  ...args: OptionalRestArgs<Action>
): Promise<FunctionReturnType<Action>> {
  return convexQueryClient.serverHttpClient
    ? convexQueryClient.serverHttpClient.action(action, ...args)
    : convexQueryClient.convexClient.action(action, ...args);
}

/**
The connection to the Alchemy state store of the repository's Convex team with one read of the
store. `useRepositoryAlchemyState` renders that read in the first paint and subscribes with the
connection's token. A store problem is a failed read, never a failed load: the page shows the failed
read with Retry.
*/
async function connectAlchemyState(
  convexQueryClient: ViewerConvexClients,
  repository: { repositoryId: Id<"repositories">; convexTeamId: string },
) {
  const { convexTeamId, repositoryId } = repository;
  try {
    const connection = await runViewerAction(
      convexQueryClient,
      api.repository.alchemyState.connectWithSnapshot,
      { repositoryId },
    );
    return { state: "loaded", repositoryId, convexTeamId, connection } as const;
  } catch (error) {
    return {
      state: "failed",
      repositoryId,
      convexTeamId,
      message:
        error instanceof ConvexError && typeof error.data === "string"
          ? error.data
          : "Could not read Alchemy state.",
    } as const;
  }
}

/**
The loader of the pages that render the repository overview: the overview, and the Alchemy page in
its left pane. With the dashboard data, it waits only for the store connection with its first read,
so no GitHub read delays the first byte. It returns that connection, or `null` when the page reads
no store, as `useRepositoryProviderObservations` decides: no dashboard access, a repository outside
the viewer's organizations, a repository without a Convex team, or a repository that Samebase is
still creating.
*/
export async function loadRepositoryOverview({
  context: { convexQueryClient, queryClient },
  params,
}: RepositoryPageLoaderArgs) {
  await loadRepositoryDashboard({ context: { queryClient } });
  const viewerAccess = await unlessAccountGone(queryClient.query(rootQueries.viewerAccess));
  if (viewerAccess === null || !viewerAccess.accessKeys.includes("access_dashboard")) {
    return null;
  }
  const [repositories, organizations] = await Promise.all([
    queryClient.query(repositoryDashboardQueries.repositories),
    queryClient.query(repositoryDashboardQueries.organizations),
  ]);
  const repository = repositories.find(
    (candidate) =>
      candidate.githubRepositoryFullName === `${params.owner}/${params.repository}` &&
      organizations.some(
        (organization) => organization.organizationId === candidate.organizationId,
      ),
  );
  if (!repository) {
    return null;
  }

  const { convexTeamId, repositoryId } = repository;
  return convexTeamId && !isRepositoryBeingCreated(repository)
    ? await connectAlchemyState(convexQueryClient, { repositoryId, convexTeamId })
    : null;
}
