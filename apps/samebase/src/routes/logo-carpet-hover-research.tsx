import { LogoSierpinskiCarpetHoverPage } from "@/logo/LogoSierpinskiCarpetHoverPage";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import {
  LOGO_CARPET_HOVER_ROUTE_SEARCH_KEYS,
  LOGO_CARPET_HOVER_ROUTE_SEARCH_PARAM_ACCESS,
  LOGO_CARPET_HOVER_ROUTE_SEARCH_PARAM_SUGGESTIONS,
  validateLogoCarpetHoverRouteSearch,
} from "@/routeSearch/logo";
import { createFileRoute } from "@tanstack/react-router";
import { buildLogoLabPageHead } from "@/lib/pageMetadata";

const pathname = "/logo/hover/carpet";

function LogoCarpetHoverRouteComponent() {
  const routeSearch = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <LogoSierpinskiCarpetHoverPage
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

export const Route = createFileRoute("/logo/hover/carpet")({
  head: () => buildLogoLabPageHead(pathname, "Carpet Hover Reveal Lab"),
  staticData: {
    ...ROUTE_ACCESS_METADATA_BY_PATH[pathname],
    acceptedSearchKeys: LOGO_CARPET_HOVER_ROUTE_SEARCH_KEYS,
    searchParamAccess: LOGO_CARPET_HOVER_ROUTE_SEARCH_PARAM_ACCESS,
    searchParamSuggestions: LOGO_CARPET_HOVER_ROUTE_SEARCH_PARAM_SUGGESTIONS,
  },
  component: LogoCarpetHoverRouteComponent,
  validateSearch: validateLogoCarpetHoverRouteSearch,
});
