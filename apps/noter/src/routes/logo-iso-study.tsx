import { createFileRoute } from "@tanstack/react-router";
import { LogoSingleCubeStudyPage } from "@/components/LogoSingleCubeStudyPage";
import { validateLogoRouteSearch } from "@/lib/logoRouteSearch";
import { RoutedPage } from "./-publicRouteComponents";

const pathname = "/logo-iso-study";

function LogoIsoStudyRouteComponent() {
  const routeSearch = Route.useSearch();

  return (
    <RoutedPage pathname={pathname}>
      <LogoSingleCubeStudyPage routeSearch={routeSearch} />
    </RoutedPage>
  );
}

export const Route = createFileRoute(pathname)({
  component: LogoIsoStudyRouteComponent,
  validateSearch: validateLogoRouteSearch,
});
