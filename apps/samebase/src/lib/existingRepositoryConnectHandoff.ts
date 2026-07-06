import { type RegisteredRouter, type RouterState } from "@tanstack/react-router";
import { buildPathWithTanStackSearch } from "@/lib/tanstackSearchParams";
import { buildVaultDashboardRoute } from "@/lib/vaultRoutes";

type RouteSearch = RouterState<RegisteredRouter["routeTree"]>["location"]["search"];

type ConnectExistingRepository = (args: { repositoryFullName: string }) => Promise<unknown>;

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
  navigateByHref: NavigateByHref;
  repositoryFullName: string;
  replace?: boolean;
  search: RouteSearch;
}) {
  await args.connectRepository({ repositoryFullName: args.repositoryFullName });
  const separatorIndex = args.repositoryFullName.indexOf("/");
  const hasOneSeparator =
    separatorIndex > 0 &&
    separatorIndex < args.repositoryFullName.length - 1 &&
    args.repositoryFullName.indexOf("/", separatorIndex + 1) === -1;
  if (!hasOneSeparator) {
    throw new Error("Invalid repository full name");
  }
  const owner = args.repositoryFullName.slice(0, separatorIndex);
  const repoName = args.repositoryFullName.slice(separatorIndex + 1);
  await args.navigateByHref(
    buildPathWithTanStackSearch({
      pathname: buildVaultDashboardRoute({ owner, repoName }),
      search: args.search,
    }),
    args.replace ? { replace: true } : undefined,
  );
}
