import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { LogoMengerDepthTransitionPage } from "@/components/logo/LogoMengerDepthTransitionPage";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import {
  LOGO_ROUTE_SEARCH_KEYS,
  LOGO_ROUTE_SEARCH_PARAM_ACCESS,
  readLogoRouteSearchParamSuggestionsForRenderer,
  validateLogoRouteSearchForRenderer,
} from "@/routeSearch/logo";
import { createFileRoute } from "@tanstack/react-router";

const pathname = "/logo/transition/menger";

function LogoMengerTransitionRouteComponent() {
  const routeSearch = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <AuthenticatedAppRoutePage>
      <LogoMengerDepthTransitionPage
        replaceRouteSearch={(nextSearch) => {
          void navigate({
            replace: true,
            resetScroll: false,
            search: nextSearch,
          });
        }}
        routeSearch={routeSearch}
      />
    </AuthenticatedAppRoutePage>
  );
}

export const Route = createFileRoute("/logo/transition/menger")({
  staticData: {
    ...ROUTE_ACCESS_METADATA_BY_PATH[pathname],
    acceptedSearchKeys: LOGO_ROUTE_SEARCH_KEYS,
    searchParamAccess: LOGO_ROUTE_SEARCH_PARAM_ACCESS,
    searchParamSuggestions: readLogoRouteSearchParamSuggestionsForRenderer("three"),
  },
  component: LogoMengerTransitionRouteComponent,
  validateSearch: validateLogoRouteSearchForRenderer("three"),
});
