import { createFileRoute } from "@tanstack/react-router";
import { LogoPreviewPage } from "@/components/logo/LogoPreviewPage";
import {
  readLogoRouteSearchParamSuggestionsForRenderer,
  validateLogoRouteSearchForRenderer,
} from "@/lib/logoRouteSearch";
import { NOTER_ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import { RoutedPage } from "./-publicRouteComponents";

const pathname = "/logo/raster";

function LogoRasterRouteComponent() {
  const routeSearch = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <RoutedPage pathname={pathname}>
      <LogoPreviewPage
        renderMode="raster"
        replaceRouteSearch={(nextSearch) => {
          void navigate({
            replace: true,
            search: nextSearch,
          });
        }}
        routeSearch={routeSearch}
      />
    </RoutedPage>
  );
}

export const Route = createFileRoute("/logo/raster")({
  staticData: {
    ...NOTER_ROUTE_ACCESS_METADATA_BY_PATH["/logo/raster"],
    searchParamSuggestions: readLogoRouteSearchParamSuggestionsForRenderer("raster"),
  },
  component: LogoRasterRouteComponent,
  validateSearch: validateLogoRouteSearchForRenderer("raster"),
});
