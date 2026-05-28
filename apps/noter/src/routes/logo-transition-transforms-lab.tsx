import { createFileRoute } from "@tanstack/react-router";
import { LOGO_ROUTE_SEARCH_PARAM_SUGGESTIONS } from "@/lib/logoRouteSearch";
import { LogoTransitionTransformsLabPage } from "@/components/logo/LogoTransitionTransformsLabPage";
import { NOTER_ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import { RoutedPage } from "./-publicRouteComponents";

function LogoTransitionTransformsLabRouteComponent() {
  return (
    <RoutedPage pathname="/logo/transition/transforms">
      <LogoTransitionTransformsLabPage />
    </RoutedPage>
  );
}

export const Route = createFileRoute("/logo/transition/transforms")({
  staticData: {
    ...NOTER_ROUTE_ACCESS_METADATA_BY_PATH["/logo/transition/transforms"],
    searchParamSuggestions: LOGO_ROUTE_SEARCH_PARAM_SUGGESTIONS,
  },
  component: LogoTransitionTransformsLabRouteComponent,
});
