import { type RegisteredRouter, type RouterState } from "@tanstack/react-router";
import { buildPathWithTanStackSearch } from "@/lib/tanstackSearchParams";
import { buildVaultDashboardRoute } from "@/lib/vaultRoutes";
import { parseRepositoryFullName } from "../../shared/repoName";

type RouteSearch = RouterState<RegisteredRouter["routeTree"]>["location"]["search"];

type ConnectExistingRepository = (args: {
  ghRepoId: string;
}) => Promise<{ repositoryFullName: string }>;

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
  ghRepoId: string;
  navigateByHref: NavigateByHref;
  replace?: boolean;
  search: RouteSearch;
}) {
  const connectedRepository = await args.connectRepository({ ghRepoId: args.ghRepoId });
  const { owner, name } = parseRepositoryFullName(connectedRepository.repositoryFullName);
  await args.navigateByHref(
    buildPathWithTanStackSearch({
      pathname: buildVaultDashboardRoute({ owner, repoName: name }),
      search: args.search,
    }),
    args.replace ? { replace: true } : undefined,
  );
}
