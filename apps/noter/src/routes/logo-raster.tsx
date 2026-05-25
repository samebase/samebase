import { createFileRoute } from "@tanstack/react-router";
import { LogoPreviewPage } from "@/components/logo/LogoPreviewPage";
import {
  LOGO_ROUTE_SEARCH_PARAM_SUGGESTIONS,
  validateLogoRouteSearchForRenderer,
} from "@/lib/logoRouteSearch";
import { LOGO_PREVIEW_PUBLIC_LAYOUT_CHROME } from "@/lib/publicLayoutRouteChromeConfigs";
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

export const Route = createFileRoute("/_public/logo/raster")({
  staticData: {
    permission: "public",
    publicLayoutRouteChrome: LOGO_PREVIEW_PUBLIC_LAYOUT_CHROME,
    searchParamSuggestions: LOGO_ROUTE_SEARCH_PARAM_SUGGESTIONS,
  },
  component: LogoRasterRouteComponent,
  validateSearch: validateLogoRouteSearchForRenderer("raster"),
});
