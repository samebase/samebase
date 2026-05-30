import { LogoRasterSeamLabPage } from "@/components/logo/LogoRasterSeamLabPage";
import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import {
  LOGO_ROUTE_SEARCH_PARAM_SUGGESTIONS,
  validateLogoRouteSearch,
} from "@/lib/logoRouteSearch";
import { NOTER_ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import { createFileRoute } from "@tanstack/react-router";

const pathname = "/logo/raster-seams";

function LogoRasterSeamsRouteComponent() {
  const routeSearch = Route.useSearch();

  return (
    <AuthenticatedAppRoutePage>
      <LogoRasterSeamLabPage routeSearch={routeSearch} />
    </AuthenticatedAppRoutePage>
  );
}

export const Route = createFileRoute("/logo/raster-seams")({
  staticData: {
    ...NOTER_ROUTE_ACCESS_METADATA_BY_PATH[pathname],
    searchParamSuggestions: LOGO_ROUTE_SEARCH_PARAM_SUGGESTIONS,
  },
  component: LogoRasterSeamsRouteComponent,
  validateSearch: validateLogoRouteSearch,
});
