import { buildPathWithTanStackSearch } from "@/lib/tanstackSearchParams";

type RouteSearch = Record<string, unknown>;

type ConnectExistingRepository = (args: {
  repositoryFullName: string;
}) => Promise<unknown>;

type DashboardNavigationOptions = {
  replace?: boolean;
};

type NavigateByHref = (
  href: string,
  options?: DashboardNavigationOptions,
) => Promise<void> | void;

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
  await args.navigateByHref(
    buildPathWithTanStackSearch({
      pathname: "/",
      search: args.search,
    }),
    args.replace ? { replace: true } : undefined,
  );
}
