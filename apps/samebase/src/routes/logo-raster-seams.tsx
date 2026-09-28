import { LogoRasterSeamLabPage } from "@/logo/LogoRasterSeamLabPage";
import {
  LOGO_ROUTE_SEARCH_KEYS,
  LOGO_ROUTE_SEARCH_PARAM_ACCESS,
  LOGO_ROUTE_SEARCH_PARAM_SUGGESTIONS,
  validateLogoRouteSearch,
} from "@/routeSearch/logo";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import { createFileRoute } from "@tanstack/react-router";
import { buildLogoLabPageHead } from "@/lib/pageMetadata";

const pathname = "/logo/raster-seams";

function LogoRasterSeamsRouteComponent() {
  const routeSearch = Route.useSearch();

  return <LogoRasterSeamLabPage routeSearch={routeSearch} />;
}

export const Route = createFileRoute("/logo/raster-seams")({
  head: () => buildLogoLabPageHead(pathname, "Logo Raster Seam Lab"),
  staticData: {
    ...ROUTE_ACCESS_METADATA_BY_PATH[pathname],
    acceptedSearchKeys: LOGO_ROUTE_SEARCH_KEYS,
    searchParamAccess: LOGO_ROUTE_SEARCH_PARAM_ACCESS,
    searchParamSuggestions: LOGO_ROUTE_SEARCH_PARAM_SUGGESTIONS,
  },
  component: LogoRasterSeamsRouteComponent,
  validateSearch: validateLogoRouteSearch,
});
