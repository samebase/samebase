import { createFileRoute } from "@tanstack/react-router";
import { LogoStaticSvgPage } from "@/components/logo/LogoStaticSvgPage";
import {
  LOGO_ROUTE_SEARCH_PARAM_SUGGESTIONS,
  validateLogoRouteSearchForRenderer,
} from "@/lib/logoRouteSearch";
import { RoutedPage } from "./-publicRouteComponents";

const pathname = "/logo/svg";

function LogoSvgRouteComponent() {
  const routeSearch = Route.useSearch();

  return (
    <RoutedPage pathname={pathname}>
      <LogoStaticSvgPage routeSearch={routeSearch} />
    </RoutedPage>
  );
}

export const Route = createFileRoute("/logo/svg")({
  staticData: {
    permission: "public",
    searchParamSuggestions: LOGO_ROUTE_SEARCH_PARAM_SUGGESTIONS,
  },
  component: LogoSvgRouteComponent,
  validateSearch: validateLogoRouteSearchForRenderer("svg"),
});
