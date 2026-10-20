import { LogoMengerDepthTransitionPage } from "@/components/logo/LogoMengerDepthTransitionPage";
import { buildLogoLabPageHead } from "@/lib/pageMetadata";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import {
  LOGO_MENGER_HOVER_ROUTE_SEARCH_KEYS,
  LOGO_MENGER_HOVER_ROUTE_SEARCH_PARAM_ACCESS,
  LOGO_MENGER_HOVER_ROUTE_SEARCH_PARAM_SUGGESTIONS,
  validateLogoMengerHoverRouteSearch,
} from "@/routeSearch/logo";
import { createFileRoute } from "@tanstack/react-router";

const pathname = "/logo/hover/menger";

function LogoMengerHoverRouteComponent() {
  const routeSearch = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <LogoMengerDepthTransitionPage
      mode="hover"
      replaceRouteSearch={(nextSearch) => {
        void navigate({
          replace: true,
          resetScroll: false,
          search: nextSearch,
        });
      }}
      routeSearch={routeSearch}
    />
  );
}

export const Route = createFileRoute("/logo/hover/menger")({
  head: () => buildLogoLabPageHead(pathname, "Menger Hover Reveal Lab"),
  staticData: {
    ...ROUTE_ACCESS_METADATA_BY_PATH[pathname],
    acceptedSearchKeys: LOGO_MENGER_HOVER_ROUTE_SEARCH_KEYS,
    searchParamAccess: LOGO_MENGER_HOVER_ROUTE_SEARCH_PARAM_ACCESS,
    searchParamSuggestions: LOGO_MENGER_HOVER_ROUTE_SEARCH_PARAM_SUGGESTIONS,
  },
  // The page statically imports three.js scenes, which render only in the browser.
  ssr: false,
  component: LogoMengerHoverRouteComponent,
  validateSearch: validateLogoMengerHoverRouteSearch,
});
