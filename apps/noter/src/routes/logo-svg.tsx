import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { LogoStaticSvgPage } from "@/components/logo/LogoStaticSvgPage";
import {
  LOGO_ROUTE_SEARCH_KEYS,
  readLogoRouteSearchParamSuggestionsForRenderer,
  validateLogoRouteSearchForRenderer,
} from "@/lib/logoRouteSearch";
import { NOTER_ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

const pathname = "/logo/svg";

function LogoSvgRouteComponent() {
  const routeSearch = Route.useSearch();

  return (
    <AuthenticatedAppRoutePage>
      <LogoStaticSvgPage routeSearch={routeSearch} />
    </AuthenticatedAppRoutePage>
  );
}

export const Route = createFileRoute("/logo/svg")({
  staticData: {
    ...NOTER_ROUTE_ACCESS_METADATA_BY_PATH[pathname],
    acceptedSearchKeys: LOGO_ROUTE_SEARCH_KEYS,
    searchParamSuggestions: readLogoRouteSearchParamSuggestionsForRenderer("svg"),
  },
  component: LogoSvgRouteComponent,
  validateSearch: validateLogoRouteSearchForRenderer("svg"),
});
