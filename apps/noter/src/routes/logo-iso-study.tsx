import { createFileRoute } from "@tanstack/react-router";
import { LogoSingleCubeStudyPage } from "@/components/logo/LogoSingleCubeStudyPage";
import {
  LOGO_ROUTE_SEARCH_PARAM_SUGGESTIONS,
  validateLogoRouteSearch,
} from "@/lib/logoRouteSearch";
import { NOTER_ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
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

export const Route = createFileRoute("/logo/single-cube")({
  staticData: {
    ...NOTER_ROUTE_ACCESS_METADATA_BY_PATH["/logo/single-cube"],
    searchParamSuggestions: LOGO_ROUTE_SEARCH_PARAM_SUGGESTIONS,
  },
  component: LogoIsoStudyRouteComponent,
  validateSearch: validateLogoRouteSearch,
});
