import { type RegisteredRouter, type RouterState } from "@tanstack/react-router";
import { buildPathWithTanStackSearch } from "@/lib/tanstackSearchParams";
import { buildRepositoryDashboardRoute } from "@/lib/repositoryRoutes";
import { parseGitHubRepositoryFullName } from "../../shared/githubRepositoryName";

type RouteSearch = RouterState<RegisteredRouter["routeTree"]>["location"]["search"];

type ConnectExistingRepository = (args: {
  githubRepositoryDatabaseId: string;
}) => Promise<{ githubRepositoryFullName: string }>;

type DashboardNavigationOptions = {
  replace?: boolean;
};

type NavigateByHref = (href: string, options?: DashboardNavigationOptions) => Promise<void> | void;

/**
 * Queue an existing repository connection before leaving the route that started
 * it, then hand off to the dashboard where the provisioning log is visible.
 */
export async function queueExistingRepositoryAndNavigateToDashboard(args: {
  connectRepository: ConnectExistingRepository;
  githubRepositoryDatabaseId: string;
  navigateByHref: NavigateByHref;
  replace?: boolean;
  search: RouteSearch;
}) {
  const connectedRepository = await args.connectRepository({
    githubRepositoryDatabaseId: args.githubRepositoryDatabaseId,
  });
  const { owner, name } = parseGitHubRepositoryFullName(
    connectedRepository.githubRepositoryFullName,
  );
  await args.navigateByHref(
    buildPathWithTanStackSearch({
      pathname: buildRepositoryDashboardRoute({ owner, repoName: name }),
      search: args.search,
    }),
    args.replace ? { replace: true } : undefined,
  );
}
