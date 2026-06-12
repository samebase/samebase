import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedAppRoutePage } from "@/components/AuthenticatedAppRoutePage";
import { LogoPreviewPage } from "@/components/logo/LogoPreviewPage";
import {
  LOGO_ROUTE_SEARCH_KEYS,
  readLogoRouteSearchParamSuggestionsForRenderer,
  validateLogoRouteSearchForRenderer,
} from "@/lib/logoRouteSearch";
import { NOTER_ROUTE_ACCESS_METADATA_BY_PATH } from "@/routeAccessMetadata";

const pathname = "/logo/iso";

function LogoIsoRouteComponent() {
  const routeSearch = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <AuthenticatedAppRoutePage>
      <LogoPreviewPage
        renderMode="iso"
        replaceRouteSearch={(nextSearch) => {
          void navigate({
            replace: true,
            search: nextSearch,
          });
        }}
        routeSearch={routeSearch}
      />
    </AuthenticatedAppRoutePage>
  );
}

export const Route = createFileRoute("/logo/iso")({
  staticData: {
    ...NOTER_ROUTE_ACCESS_METADATA_BY_PATH[pathname],
    acceptedSearchKeys: LOGO_ROUTE_SEARCH_KEYS,
    searchParamSuggestions: readLogoRouteSearchParamSuggestionsForRenderer("iso"),
  },
  component: LogoIsoRouteComponent,
  validateSearch: validateLogoRouteSearchForRenderer("iso"),
});
