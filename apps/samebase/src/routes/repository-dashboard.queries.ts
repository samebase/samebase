import { convexQuery } from "@convex-dev/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { api } from "../../convex/_generated/api";
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
