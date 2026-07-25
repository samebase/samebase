import { createFileRoute } from "@tanstack/react-router";
import { LogoStaticSvgPage } from "@/components/logo/LogoStaticSvgPage";
import {
  LOGO_ROUTE_SEARCH_KEYS,
  LOGO_ROUTE_SEARCH_PARAM_ACCESS,
  readLogoRouteSearchParamSuggestionsForRenderer,
  validateLogoRouteSearchForRenderer,
} from "@/routeSearch/logo";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import { buildLogoLabPageHead } from "@/lib/pageMetadata";

const pathname = "/logo/svg";

function LogoSvgRouteComponent() {
  const routeSearch = Route.useSearch();

  return <LogoStaticSvgPage routeSearch={routeSearch} />;
}

export const Route = createFileRoute("/logo/svg")({
  head: () => buildLogoLabPageHead(pathname, "Static SVG Preview"),
  staticData: {
    ...ROUTE_ACCESS_METADATA_BY_PATH[pathname],
    acceptedSearchKeys: LOGO_ROUTE_SEARCH_KEYS,
    searchParamAccess: LOGO_ROUTE_SEARCH_PARAM_ACCESS,
    searchParamSuggestions: readLogoRouteSearchParamSuggestionsForRenderer("svg"),
  },
  component: LogoSvgRouteComponent,
  validateSearch: validateLogoRouteSearchForRenderer("svg"),
});
