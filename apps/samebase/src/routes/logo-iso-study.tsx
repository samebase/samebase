import { createFileRoute } from "@tanstack/react-router";
import { LogoSingleCubeStudyPage } from "@/logo/LogoSingleCubeStudyPage";
import {
  LOGO_ROUTE_SEARCH_KEYS,
  LOGO_ROUTE_SEARCH_PARAM_ACCESS,
  LOGO_ROUTE_SEARCH_PARAM_SUGGESTIONS,
  validateLogoRouteSearch,
} from "@/routeSearch/logo";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import { buildLogoLabPageHead } from "@/lib/pageMetadata";

const pathname = "/logo/single-cube";

function LogoIsoStudyRouteComponent() {
  const routeSearch = Route.useSearch();

  return <LogoSingleCubeStudyPage routeSearch={routeSearch} />;
}

export const Route = createFileRoute("/logo/single-cube")({
  head: () => buildLogoLabPageHead(pathname, "Single Cube Rotation Lab"),
  staticData: {
    ...ROUTE_ACCESS_METADATA_BY_PATH[pathname],
    acceptedSearchKeys: LOGO_ROUTE_SEARCH_KEYS,
    searchParamAccess: LOGO_ROUTE_SEARCH_PARAM_ACCESS,
    searchParamSuggestions: LOGO_ROUTE_SEARCH_PARAM_SUGGESTIONS,
  },
  component: LogoIsoStudyRouteComponent,
  validateSearch: validateLogoRouteSearch,
});
