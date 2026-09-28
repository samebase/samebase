import { createFileRoute } from "@tanstack/react-router";
import { LogoPreviewPage } from "@/logo/LogoPreviewPage";
import {
  LOGO_ROUTE_SEARCH_KEYS,
  LOGO_ROUTE_SEARCH_PARAM_ACCESS,
  readLogoRouteSearchParamSuggestionsForRenderer,
  validateLogoRouteSearchForRenderer,
} from "@/routeSearch/logo";
import { ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";
import { buildPageHead, LOGO_PAGE_METADATA } from "@/lib/pageMetadata";
import { RoutedPage } from "./-publicRouteComponents";

const pathname = "/logo";

function LogoThreeRouteComponent() {
  const routeSearch = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <RoutedPage pathname={pathname}>
      <LogoPreviewPage
        renderMode="three"
        replaceRouteSearch={(nextSearch) => {
          void navigate({
            replace: true,
            resetScroll: false,
            search: nextSearch,
          });
        }}
        routeSearch={routeSearch}
      />
    </RoutedPage>
  );
}

export const Route = createFileRoute("/logo")({
  head: () => buildPageHead(LOGO_PAGE_METADATA),
  staticData: {
    ...ROUTE_ACCESS_METADATA_BY_PATH[pathname],
    acceptedSearchKeys: LOGO_ROUTE_SEARCH_KEYS,
    searchParamAccess: LOGO_ROUTE_SEARCH_PARAM_ACCESS,
    searchParamSuggestions: readLogoRouteSearchParamSuggestionsForRenderer("three"),
  },
  component: LogoThreeRouteComponent,
  validateSearch: validateLogoRouteSearchForRenderer("three"),
});
