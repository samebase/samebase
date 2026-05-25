import { LogoRasterSeamLabPage } from "@/components/logo/LogoRasterSeamLabPage";
import {
  LOGO_ROUTE_SEARCH_PARAM_SUGGESTIONS,
  validateLogoRouteSearch,
} from "@/lib/logoRouteSearch";
import { createFileRoute } from "@tanstack/react-router";
import { RoutedPage } from "./-publicRouteComponents";

const pathname = "/logo/raster-seams";

function LogoRasterSeamsRouteComponent() {
  const routeSearch = Route.useSearch();

  return (
    <RoutedPage pathname={pathname}>
      <LogoRasterSeamLabPage routeSearch={routeSearch} />
    </RoutedPage>
  );
}

export const Route = createFileRoute("/logo/raster-seams")({
  staticData: {
    permission: "public",
    searchParamSuggestions: LOGO_ROUTE_SEARCH_PARAM_SUGGESTIONS,
  },
  component: LogoRasterSeamsRouteComponent,
  validateSearch: validateLogoRouteSearch,
});
