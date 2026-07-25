import { createFileRoute } from "@tanstack/react-router";
import { LogoPreviewPage } from "@/components/logo/LogoPreviewPage";
import {
  LOGO_ROUTE_SEARCH_KEYS,
  LOGO_ROUTE_SEARCH_PARAM_ACCESS,
  readLogoRouteSearchParamSuggestionsForRenderer,
  validateLogoRouteSearchForRenderer,
} from "@/routeSearch/logo";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

const pathname = "/logo/raster";

function LogoRasterRouteComponent() {
  const routeSearch = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <LogoPreviewPage
      renderMode="raster"
      replaceRouteSearch={(nextSearch) => {
        void navigate({
          replace: true,
          resetScroll: false,
          search: nextSearch,
        });
      }}
      routeSearch={routeSearch}
    />
  );
}

export const Route = createFileRoute("/logo/raster")({
  staticData: {
    ...ROUTE_ACCESS_METADATA_BY_PATH[pathname],
    acceptedSearchKeys: LOGO_ROUTE_SEARCH_KEYS,
    searchParamAccess: LOGO_ROUTE_SEARCH_PARAM_ACCESS,
    searchParamSuggestions: readLogoRouteSearchParamSuggestionsForRenderer("raster"),
  },
  component: LogoRasterRouteComponent,
  validateSearch: validateLogoRouteSearchForRenderer("raster"),
});
