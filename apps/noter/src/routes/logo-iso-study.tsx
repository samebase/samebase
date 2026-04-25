import { createFileRoute } from "@tanstack/react-router";
import { LogoSingleCubeStudyPage } from "@/components/LogoSingleCubeStudyPage";
import { ensureLogoRouteDevModeSearch } from "@/lib/logoRouteDevMode";
import { validateLogoRouteSearch } from "@/lib/logoRouteSearch";
import { RoutedPage } from "./-publicRouteComponents";

const pathname = "/logo/single-cube";

function LogoIsoStudyRouteComponent() {
  const routeSearch = Route.useSearch();

  return (
    <RoutedPage pathname={pathname}>
      <LogoSingleCubeStudyPage routeSearch={routeSearch} />
    </RoutedPage>
  );
}

export const Route = createFileRoute(pathname)({
  beforeLoad: ({ location, search }) => {
    ensureLogoRouteDevModeSearch({
      hash: location.hash,
      pathname,
      search,
    });
  },
  component: LogoIsoStudyRouteComponent,
  validateSearch: validateLogoRouteSearch,
});
