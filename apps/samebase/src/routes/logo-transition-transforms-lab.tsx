import { createFileRoute } from "@tanstack/react-router";
import {
  LOGO_ROUTE_SEARCH_KEYS,
  LOGO_ROUTE_SEARCH_PARAM_ACCESS,
  LOGO_ROUTE_SEARCH_PARAM_SUGGESTIONS,
} from "@/routeSearch/logo";
import { LogoTransitionTransformsLabPage } from "@/logo/LogoTransitionTransformsLabPage";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import { buildLogoLabPageHead } from "@/lib/pageMetadata";

const pathname = "/logo/transition/transforms";

function LogoTransitionTransformsLabRouteComponent() {
  return <LogoTransitionTransformsLabPage />;
}

export const Route = createFileRoute("/logo/transition/transforms")({
  head: () => buildLogoLabPageHead(pathname, "Single Cube Transform Lab"),
  staticData: {
    ...ROUTE_ACCESS_METADATA_BY_PATH[pathname],
    acceptedSearchKeys: LOGO_ROUTE_SEARCH_KEYS,
    searchParamAccess: LOGO_ROUTE_SEARCH_PARAM_ACCESS,
    searchParamSuggestions: LOGO_ROUTE_SEARCH_PARAM_SUGGESTIONS,
  },
  component: LogoTransitionTransformsLabRouteComponent,
});
