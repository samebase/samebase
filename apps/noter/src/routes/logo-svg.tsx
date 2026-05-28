import { createFileRoute } from "@tanstack/react-router";
import { LogoStaticSvgPage } from "@/components/logo/LogoStaticSvgPage";
import {
  readLogoRouteSearchParamSuggestionsForRenderer,
  validateLogoRouteSearchForRenderer,
} from "@/lib/logoRouteSearch";
import { NOTER_ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
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
    ...NOTER_ROUTE_ACCESS_METADATA_BY_PATH["/logo/svg"],
    searchParamSuggestions: readLogoRouteSearchParamSuggestionsForRenderer("svg"),
  },
  component: LogoSvgRouteComponent,
  validateSearch: validateLogoRouteSearchForRenderer("svg"),
});
