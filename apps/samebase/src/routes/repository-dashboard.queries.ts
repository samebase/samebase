import { convexQuery } from "@convex-dev/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { api } from "../../convex/_generated/api";

/**
The pages of `DashboardRoutePage` read these through `useRepositoryWorkspaceModel`. Their route
loaders fetch them, so the server render has the page's data in its first HTML, and a navigation
inside the app keeps the current page on screen until they are there.
*/
export const repositoryDashboardQueries = {
  folderState: convexQuery(api.repository.folders.getRepositoryFolderState, {}),
  organizations: convexQuery(api.organizations.listForViewer, {}),
  organizationTreeSettings: convexQuery(
    api.repository.organizationTree.getRepositoryOrganizationTreeSettings,
    {},
  ),
  repositories: convexQuery(api.repository.list, {}),
};

export async function loadRepositoryDashboard({
  context: { queryClient },
}: {
  context: { queryClient: QueryClient };
}) {
  await Promise.all([
    queryClient.query(repositoryDashboardQueries.folderState),
    queryClient.query(repositoryDashboardQueries.organizations),
    queryClient.query(repositoryDashboardQueries.organizationTreeSettings),
    queryClient.query(repositoryDashboardQueries.repositories),
  ]);
}
