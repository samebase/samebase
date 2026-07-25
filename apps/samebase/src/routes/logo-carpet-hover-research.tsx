import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { LogoSierpinskiCarpetHoverPage } from "@/components/logo/LogoSierpinskiCarpetHoverPage";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import {
  LOGO_ROUTE_SEARCH_KEYS,
  LOGO_ROUTE_SEARCH_PARAM_ACCESS,
  LOGO_ROUTE_SEARCH_PARAM_SUGGESTIONS,
  validateLogoRouteSearch,
} from "@/routeSearch/logo";
import { createFileRoute } from "@tanstack/react-router";

const pathname = "/logo/hover/carpet";

function LogoCarpetHoverRouteComponent() {
  const routeSearch = Route.useSearch();

  return (
    <AuthenticatedAppRoutePage>
      <LogoSierpinskiCarpetHoverPage routeSearch={routeSearch} />
    </AuthenticatedAppRoutePage>
  );
}

export const Route = createFileRoute("/logo/hover/carpet")({
  staticData: {
    ...ROUTE_ACCESS_METADATA_BY_PATH[pathname],
    acceptedSearchKeys: LOGO_ROUTE_SEARCH_KEYS,
    searchParamAccess: LOGO_ROUTE_SEARCH_PARAM_ACCESS,
    searchParamSuggestions: LOGO_ROUTE_SEARCH_PARAM_SUGGESTIONS,
  },
  component: LogoCarpetHoverRouteComponent,
  validateSearch: validateLogoRouteSearch,
});
