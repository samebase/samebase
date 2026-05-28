import { createFileRoute } from "@tanstack/react-router";
import { LOGO_ROUTE_SEARCH_PARAM_SUGGESTIONS } from "@/lib/logoRouteSearch";
import { LogoTransitionTransformsLabPage } from "@/components/logo/LogoTransitionTransformsLabPage";
import { NOTER_ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import { RoutedPage } from "./-publicRouteComponents";

const pathname = "/logo/transition/transforms";

function LogoTransitionTransformsLabRouteComponent() {
  return (
    <RoutedPage pathname={pathname}>
      <LogoTransitionTransformsLabPage />
    </RoutedPage>
  );
}

export const Route = createFileRoute("/logo/transition/transforms")({
  staticData: {
    ...NOTER_ROUTE_ACCESS_METADATA_BY_PATH[pathname],
    searchParamSuggestions: LOGO_ROUTE_SEARCH_PARAM_SUGGESTIONS,
  },
  component: LogoTransitionTransformsLabRouteComponent,
});
