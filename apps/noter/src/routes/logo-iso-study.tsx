import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { LogoSingleCubeStudyPage } from "@/components/logo/LogoSingleCubeStudyPage";
import {
  LOGO_ROUTE_SEARCH_KEYS,
  LOGO_ROUTE_SEARCH_PARAM_ACCESS,
  LOGO_ROUTE_SEARCH_PARAM_SUGGESTIONS,
  validateLogoRouteSearch,
} from "@/lib/logoRouteSearch";
import { NOTER_ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

const pathname = "/logo/single-cube";

function LogoIsoStudyRouteComponent() {
  const routeSearch = Route.useSearch();

  return (
    <AuthenticatedAppRoutePage>
      <LogoSingleCubeStudyPage routeSearch={routeSearch} />
    </AuthenticatedAppRoutePage>
  );
}

export const Route = createFileRoute("/logo/single-cube")({
  staticData: {
    ...NOTER_ROUTE_ACCESS_METADATA_BY_PATH[pathname],
    acceptedSearchKeys: LOGO_ROUTE_SEARCH_KEYS,
    searchParamAccess: LOGO_ROUTE_SEARCH_PARAM_ACCESS,
    searchParamSuggestions: LOGO_ROUTE_SEARCH_PARAM_SUGGESTIONS,
  },
  component: LogoIsoStudyRouteComponent,
  validateSearch: validateLogoRouteSearch,
});
