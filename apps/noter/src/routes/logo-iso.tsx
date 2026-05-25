import { createFileRoute } from "@tanstack/react-router";
import { LogoPreviewPage } from "@/components/logo/LogoPreviewPage";
import {
  LOGO_ROUTE_SEARCH_PARAM_SUGGESTIONS,
  validateLogoRouteSearchForRenderer,
} from "@/lib/logoRouteSearch";
import { RoutedPage } from "./-publicRouteComponents";

const pathname = "/logo/iso";

function LogoIsoRouteComponent() {
  const routeSearch = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <RoutedPage pathname={pathname}>
      <LogoPreviewPage
        renderMode="iso"
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

export const Route = createFileRoute("/logo/iso")({
  staticData: {
    permission: "public",
    searchParamSuggestions: LOGO_ROUTE_SEARCH_PARAM_SUGGESTIONS,
  },
  component: LogoIsoRouteComponent,
  validateSearch: validateLogoRouteSearchForRenderer("iso"),
});
