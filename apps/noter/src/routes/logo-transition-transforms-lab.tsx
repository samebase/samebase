import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import {
  LOGO_ROUTE_SEARCH_KEYS,
  LOGO_ROUTE_SEARCH_PARAM_ACCESS,
  LOGO_ROUTE_SEARCH_PARAM_SUGGESTIONS,
} from "@/lib/logoRouteSearch";
import { LogoTransitionTransformsLabPage } from "@/components/logo/LogoTransitionTransformsLabPage";
import { NOTER_ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

const pathname = "/logo/transition/transforms";

function LogoTransitionTransformsLabRouteComponent() {
  return (
    <AuthenticatedAppRoutePage>
      <LogoTransitionTransformsLabPage />
    </AuthenticatedAppRoutePage>
  );
}

export const Route = createFileRoute("/logo/transition/transforms")({
  staticData: {
    ...NOTER_ROUTE_ACCESS_METADATA_BY_PATH[pathname],
    acceptedSearchKeys: LOGO_ROUTE_SEARCH_KEYS,
    searchParamAccess: LOGO_ROUTE_SEARCH_PARAM_ACCESS,
    searchParamSuggestions: LOGO_ROUTE_SEARCH_PARAM_SUGGESTIONS,
  },
  component: LogoTransitionTransformsLabRouteComponent,
});
